import { useCallback, useEffect, useRef, useState } from 'react';
import { Linking } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError } from '@cuub/core';
import { setAnalyticsMembership, tracker } from '@/lib/analytics';
import { useAuthStore } from '@/store/authStore';
import {
  billingPortalUrl,
  cancelMembership,
  fetchBilling,
  resumeMembership,
  startSubscription,
  walletLabel,
  type Billing,
  type CancelReason,
} from './api';
import { useMembershipCheckout } from './stripe';
import type { CheckoutOutcome } from './types';

export function billingKey(userId: string | undefined) {
  return ['billing', userId ?? 'signed-out'] as const;
}

/** Membership and plan on sale for the signed-in person. */
export function useBilling() {
  const session = useAuthStore((s) => s.session);
  const query = useQuery({
    queryKey: billingKey(session?.user.userId),
    queryFn: () => fetchBilling(session!.token),
    enabled: Boolean(session?.token),
    staleTime: 30_000,
  });

  const status = query.data?.membership.status;
  useEffect(() => {
    if (!session) setAnalyticsMembership(null);
    else if (status) setAnalyticsMembership(status);
  }, [session, status]);

  return query;
}

const ACTIVATION_POLL_MS = 1500;
/** How long the button spins before the screen says the payment is in and keeps checking quietly. */
const ACTIVATION_SPIN_MS = 15_000;
const PENDING_POLL_MS = 4000;
const PENDING_TIMEOUT_MS = 3 * 60_000;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export type SubscribeState =
  | { phase: 'idle' }
  | { phase: 'preparing' }
  | { phase: 'paying' }
  | { phase: 'activating' }
  /** Paid, but Stripe has not reported the subscription active yet. Never ask to pay again here. */
  | { phase: 'pending' }
  | { phase: 'active' }
  | { phase: 'error'; message: string };

const ERROR_COPY: Record<string, string> = {
  ALREADY_SUBSCRIBED: 'You already have an active Pass.',
  NO_PROFILE: 'Finish your profile before getting a Pass.',
  NO_PLAN: 'CUUB Pass is not available right now. Try again later.',
  stripe_not_configured: 'Payments are not set up in this build.',
  unsupported_platform: 'Get the CUUB app to get a Pass.',
};

function errorMessage(code: string | undefined, fallback?: string): string {
  return (code && ERROR_COPY[code]) || fallback || 'Payment did not go through. Try again.';
}

/**
 * Runs the whole membership checkout: create (or resume) the subscription,
 * present PaymentSheet, then re-read Stripe until the membership is active.
 */
export function useSubscribe() {
  const session = useAuthStore((s) => s.session);
  const queryClient = useQueryClient();
  const checkout = useMembershipCheckout();
  const [state, setState] = useState<SubscribeState>({ phase: 'idle' });
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  /** One Stripe re-read; stores the result so every screen sees the new membership. */
  const readActive = useCallback(async (): Promise<Billing | null> => {
    if (!session) return null;
    try {
      const latest = await fetchBilling(session.token, true);
      queryClient.setQueryData(billingKey(session.user.userId), latest);
      return latest;
    } catch {
      return null;
    }
  }, [queryClient, session]);

  const markActive = useCallback(
    (billing: Billing) => {
      tracker.track('membership_active_seen', { status: billing.membership.status });
      void queryClient.invalidateQueries({ queryKey: ['station-by-code'] });
      setState({ phase: 'active' });
    },
    [queryClient],
  );

  /** Polls fast while the button spins, then slower behind the "payment received" state. */
  const waitForActive = useCallback(async (): Promise<Billing | null> => {
    const started = Date.now();
    let latest: Billing | null = null;
    while (mounted.current && Date.now() - started < PENDING_TIMEOUT_MS) {
      latest = (await readActive()) ?? latest;
      if (latest?.membership.active) return latest;
      const spinning = Date.now() - started < ACTIVATION_SPIN_MS;
      if (!spinning) setState((s) => (s.phase === 'activating' ? { phase: 'pending' } : s));
      await sleep(spinning ? ACTIVATION_POLL_MS : PENDING_POLL_MS);
    }
    return latest;
  }, [readActive]);

  const subscribe = useCallback(
    async (billing: Billing): Promise<boolean> => {
      const plan = billing.plan;
      if (!session || !plan) return false;
      const planId = plan.subscriptionPlanId;
      tracker.track('paywall_cta_tapped', { planId });
      setState({ phase: 'preparing' });

      let outcome: CheckoutOutcome;
      try {
        const setup = await startSubscription(session.token);
        setState({ phase: 'paying' });
        tracker.track('payment_sheet_opened', { planId });
        outcome = await checkout(setup, plan, { name: session.user.name, phone: session.user.phone });
      } catch (error) {
        const code = error instanceof ApiError ? error.code : undefined;
        if (code === 'ALREADY_SUBSCRIBED') {
          const latest = await readActive();
          if (latest?.membership.active) {
            markActive(latest);
            return true;
          }
        }
        tracker.track('payment_sheet_result', { result: 'failed', errorCode: code ?? 'setup_failed' });
        setState({ phase: 'error', message: errorMessage(code, (error as Error)?.message) });
        return false;
      }

      if (outcome.result !== 'completed') {
        tracker.track('payment_sheet_result', { result: outcome.result, errorCode: outcome.errorCode });
        setState(
          outcome.result === 'canceled'
            ? { phase: 'idle' }
            : { phase: 'error', message: errorMessage(outcome.errorCode, outcome.message) },
        );
        return false;
      }

      setState({ phase: 'activating' });
      const latest = await waitForActive();
      tracker.track('payment_sheet_result', {
        result: 'completed',
        wallet: walletLabel(latest?.membership.card?.wallet),
      });
      if (latest?.membership.active) {
        markActive(latest);
        return true;
      }
      setState({ phase: 'pending' });
      return false;
    },
    [checkout, markActive, readActive, session, waitForActive],
  );

  /** "Check again" while pending: re-reads Stripe, never charges. */
  const checkAgain = useCallback(async (): Promise<boolean> => {
    const latest = await readActive();
    if (latest?.membership.active) {
      markActive(latest);
      return true;
    }
    return false;
  }, [markActive, readActive]);

  const reset = useCallback(() => setState({ phase: 'idle' }), []);
  return { state, subscribe, checkAgain, reset };
}

/** In-app cancel and undo; both answer with the fresh billing view. */
export function useCancelMembership() {
  const session = useAuthStore((s) => s.session);
  const queryClient = useQueryClient();

  const apply = useCallback(
    (billing: Billing) => {
      if (session) queryClient.setQueryData(billingKey(session.user.userId), billing);
      return billing;
    },
    [queryClient, session],
  );

  const cancel = useCallback(
    async (answers: { reasons: CancelReason[]; comment: string | null }) => {
      if (!session) throw new Error('Signed out');
      return apply(await cancelMembership(session.token, answers));
    },
    [apply, session],
  );

  const resume = useCallback(async () => {
    if (!session) throw new Error('Signed out');
    return apply(await resumeMembership(session.token));
  }, [apply, session]);

  return { cancel, resume };
}

/** Opens the Stripe Customer Portal (update card). */
export function useManageMembership() {
  const session = useAuthStore((s) => s.session);
  const queryClient = useQueryClient();
  const [opening, setOpening] = useState(false);

  const open = useCallback(async () => {
    if (!session || opening) return;
    tracker.track('manage_membership_tapped', {});
    setOpening(true);
    try {
      const url = await billingPortalUrl(session.token);
      await Linking.openURL(url);
      // The portal runs outside the app; re-read billing when the person returns.
      void queryClient.invalidateQueries({ queryKey: billingKey(session.user.userId) });
    } finally {
      setOpening(false);
    }
  }, [opening, queryClient, session]);

  return { open, opening };
}

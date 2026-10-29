import { useCallback, useEffect, useState } from 'react';
import { Linking } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError } from '@cuub/core';
import { setAnalyticsMembership, tracker } from '@/lib/analytics';
import { useAuthStore } from '@/store/authStore';
import {
  billingPortalUrl,
  fetchBilling,
  startSubscription,
  walletLabel,
  type Billing,
} from './api';
import { useMembershipCheckout } from './stripe';
import type { CheckoutOutcome } from './types';

export function billingKey(userId: string | undefined) {
  return ['billing', userId ?? 'signed-out'] as const;
}

/** Membership, plan on sale and any unpaid buyout for the signed-in person. */
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
const ACTIVATION_TIMEOUT_MS = 30_000;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export type SubscribeState =
  | { phase: 'idle' }
  | { phase: 'preparing' }
  | { phase: 'paying' }
  | { phase: 'activating' }
  | { phase: 'active' }
  | { phase: 'error'; message: string };

const ERROR_COPY: Record<string, string> = {
  ALREADY_SUBSCRIBED: 'You already have an active membership.',
  NO_PROFILE: 'Finish your profile before starting a membership.',
  NO_PLAN: 'Memberships are not available right now. Try again later.',
  stripe_not_configured: 'Payments are not set up in this build.',
  unsupported_platform: 'Get the CUUB app to start a membership.',
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
        const name = [session.user.firstName, session.user.lastName].filter(Boolean).join(' ');
        outcome = await checkout(setup, plan, { name: name || null, phone: session.user.phone });
      } catch (error) {
        const code = error instanceof ApiError ? error.code : undefined;
        if (code === 'ALREADY_SUBSCRIBED') {
          await queryClient.invalidateQueries({ queryKey: billingKey(session.user.userId) });
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
      const deadline = Date.now() + ACTIVATION_TIMEOUT_MS;
      let latest: Billing | null = null;
      while (Date.now() < deadline) {
        try {
          latest = await fetchBilling(session.token, true);
          queryClient.setQueryData(billingKey(session.user.userId), latest);
          if (latest.membership.active) break;
        } catch {
          // keep polling until the deadline
        }
        await sleep(ACTIVATION_POLL_MS);
      }

      tracker.track('payment_sheet_result', {
        result: 'completed',
        wallet: walletLabel(latest?.membership.card?.wallet),
      });
      if (latest?.membership.active) {
        tracker.track('membership_active_seen', { status: latest.membership.status });
        void queryClient.invalidateQueries({ queryKey: ['station-by-code'] });
        setState({ phase: 'active' });
        return true;
      }
      setState({
        phase: 'error',
        message: 'Payment received. Your membership is still activating; pull to refresh in a moment.',
      });
      return false;
    },
    [checkout, queryClient, session],
  );

  const reset = useCallback(() => setState({ phase: 'idle' }), []);
  return { state, subscribe, reset };
}

/** Opens the Stripe Customer Portal (update card, cancel). */
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

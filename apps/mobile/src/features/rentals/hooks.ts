import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError, defaultUUID } from '@cuub/core';
import { tracker } from '@/lib/analytics';
import { useAuthStore } from '@/store/authStore';
import { billingKey } from '@/features/billing/hooks';
import { useLostPowerBankCheckout } from '@/features/billing/stripe';
import {
  checkoutBuyout,
  fetchActiveRental,
  fetchRental,
  fetchStationByCode,
  requestUnlock,
  type AppRental,
  type BuyoutCheckout,
  type StationByCode,
} from './api';

export function stationByCodeKey(code: string, userId: string | undefined) {
  return ['station-by-code', code, userId ?? 'signed-out'] as const;
}

export function activeRentalKey(userId: string | undefined) {
  return ['rental-active', userId ?? 'signed-out'] as const;
}

/** The station behind a scanned QR or `/s/<code>` link; `canUnlock` is null when signed out. */
export function useStationByCode(code: string | null) {
  const session = useAuthStore((s) => s.session);
  return useQuery<StationByCode, Error>({
    queryKey: stationByCodeKey(code ?? '', session?.user.userId),
    queryFn: () => fetchStationByCode(code as string, session?.token ?? null),
    enabled: Boolean(code),
    refetchInterval: 15_000,
    retry: (count, error) => !(error instanceof ApiError && error.status < 500) && count < 2,
  });
}

function minutesBetween(from: string, to: string | null): number | undefined {
  if (!to) return undefined;
  const ms = new Date(to).getTime() - new Date(from).getTime();
  return Number.isFinite(ms) && ms >= 0 ? Math.round(ms / 60_000) : undefined;
}

/**
 * The signed-in person's open rental (map card). Polls quickly while the
 * cabinet is releasing, slowly while out, and notices the return.
 */
export function useActiveRental() {
  const session = useAuthStore((s) => s.session);
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: activeRentalKey(session?.user.userId),
    queryFn: () => fetchActiveRental(session!.token),
    enabled: Boolean(session?.token),
    refetchInterval: (q) => {
      const rental = q.state.data;
      if (!rental) return 120_000;
      return rental.status === 'PENDING_UNLOCK' ? 3_000 : 30_000;
    },
  });

  const { refetch } = query;
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active' && session?.token) void refetch();
    });
    return () => sub.remove();
  }, [refetch, session?.token]);

  const previous = useRef<AppRental | null>(null);
  const current = query.data ?? null;
  useEffect(() => {
    const before = previous.current;
    previous.current = current;
    if (!session || !before || before.status !== 'ACTIVE') return;
    if (current && current.rentalId === before.rentalId) return;
    void (async () => {
      try {
        const final = await fetchRental(session.token, before.rentalId);
        if (final.status === 'RETURNED') {
          tracker.track('return_seen', {
            rentalId: final.rentalId,
            durationMinutes: minutesBetween(final.startedAt, final.endedAt),
          });
        }
      } catch {
        // The card already disappeared; the server has the return either way.
      }
      void queryClient.invalidateQueries({ queryKey: billingKey(session.user.userId) });
    })();
  }, [current, queryClient, session]);

  return query;
}

const POLL_MS = 1_500;
const EJECT_TIMEOUT_MS = 60_000;

export type UnlockState =
  | { phase: 'idle' }
  | { phase: 'requesting' }
  | { phase: 'releasing'; rental: AppRental }
  | { phase: 'released'; rental: AppRental }
  | { phase: 'failed'; reason: string; message: string }
  | { phase: 'slow'; rental: AppRental };

const FAILURE_COPY: Record<string, string> = {
  UNLOCK_FAILED: "The station couldn't release a power bank. Try again or pick another station.",
  network: 'Check your connection and try again.',
};

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * One unlock attempt: POST /app/rentals (retry-safe on clientEventId), then
 * poll the rental until the cabinet reports the power bank out or fails.
 * `unlock(code)` targets another station than `defaultCode` (the scanner).
 */
export function useUnlock(defaultCode?: string) {
  const session = useAuthStore((s) => s.session);
  const queryClient = useQueryClient();
  const [state, setState] = useState<UnlockState>({ phase: 'idle' });
  const attemptId = useRef<string | null>(null);
  const alive = useRef(true);
  useEffect(
    () => () => {
      alive.current = false;
    },
    [],
  );

  const refreshAfter = useCallback(
    (stationCode: string) => {
      if (!session) return;
      void queryClient.invalidateQueries({ queryKey: activeRentalKey(session.user.userId) });
      void queryClient.invalidateQueries({ queryKey: ['station-by-code', stationCode] });
    },
    [queryClient, session],
  );

  const unlock = useCallback(async (code: string | undefined = defaultCode) => {
    if (!session || !code) return;
    const stationCode = code;
    tracker.track('unlock_tapped', { stationCode });
    const startedAt = Date.now();
    attemptId.current ??= defaultUUID();
    setState({ phase: 'requesting' });

    let rental: AppRental;
    try {
      rental = await requestUnlock(session.token, { stationCode, clientEventId: attemptId.current });
    } catch (error) {
      const reason = error instanceof ApiError ? error.code ?? `http_${error.status}` : 'network';
      // A refusal is final for this attempt; a network error may retry the same id.
      if (error instanceof ApiError) attemptId.current = null;
      tracker.track('unlock_result', { stationCode, result: 'failure', reason });
      setState({
        phase: 'failed',
        reason,
        message: FAILURE_COPY[reason] ?? (error as Error).message ?? FAILURE_COPY.network,
      });
      refreshAfter(stationCode);
      return;
    }

    setState({ phase: 'releasing', rental });
    while (alive.current && rental.status === 'PENDING_UNLOCK' && Date.now() - startedAt < EJECT_TIMEOUT_MS) {
      await sleep(POLL_MS);
      try {
        rental = await fetchRental(session.token, rental.rentalId);
      } catch {
        // keep polling until the deadline
      }
    }
    if (!alive.current) return;
    attemptId.current = null;
    refreshAfter(stationCode);

    if (rental.status === 'ACTIVE') {
      tracker.track('unlock_result', {
        stationCode,
        result: 'success',
        timeToEjectMs: Date.now() - startedAt,
        ...(rental.slot != null ? { slot: rental.slot } : {}),
      });
      tracker.markConverted();
      setState({ phase: 'released', rental });
      return;
    }
    if (rental.status === 'PENDING_UNLOCK') {
      tracker.track('unlock_result', { stationCode, result: 'failure', reason: 'timeout' });
      setState({ phase: 'slow', rental });
      return;
    }
    tracker.track('unlock_result', { stationCode, result: 'failure', reason: rental.status });
    setState({
      phase: 'failed',
      reason: rental.status,
      message: FAILURE_COPY[rental.status] ?? FAILURE_COPY.UNLOCK_FAILED,
    });
  }, [defaultCode, refreshAfter, session]);

  const reset = useCallback(() => setState({ phase: 'idle' }), []);
  return { state, unlock, reset };
}

const LOST_FEE_TIMEOUT_MS = 30_000;

export type LostFeeState =
  | { phase: 'idle' }
  | { phase: 'preparing' }
  | { phase: 'paying' }
  | { phase: 'confirming' }
  | { phase: 'paid' }
  | { phase: 'error'; message: string };

const LOST_FEE_COPY: Record<string, string> = {
  NOT_OUT: 'This power bank is already settled.',
  stripe_not_configured: 'Payments are not set up in this build.',
  unsupported_platform: 'Get the CUUB app to pay for a lost power bank.',
};

/**
 * Pays the lost power bank fee on an open membership rental: PaymentSheet for
 * the buyout, then asks the server again until it's settled and unlocking is open.
 */
export function usePayLostPowerBank() {
  const session = useAuthStore((s) => s.session);
  const queryClient = useQueryClient();
  const checkout = useLostPowerBankCheckout();
  const [state, setState] = useState<LostFeeState>({ phase: 'idle' });

  const pay = useCallback(
    async (rentalId: string): Promise<boolean> => {
      if (!session) return false;
      const fail = (code: string | undefined, fallback?: string) => {
        setState({
          phase: 'error',
          message: (code && LOST_FEE_COPY[code]) || fallback || 'Payment did not go through. Try again.',
        });
        return false;
      };
      setState({ phase: 'preparing' });

      let current: BuyoutCheckout;
      try {
        current = await checkoutBuyout(session.token, rentalId);
      } catch (error) {
        return fail(error instanceof ApiError ? error.code : undefined, (error as Error)?.message);
      }

      if (current.status === 'requires_payment') {
        setState({ phase: 'paying' });
        const name = [session.user.firstName, session.user.lastName].filter(Boolean).join(' ');
        const outcome = await checkout(current, { name: name || null, phone: session.user.phone });
        if (outcome.result === 'canceled') {
          setState({ phase: 'idle' });
          return false;
        }
        if (outcome.result === 'failed') return fail(outcome.errorCode, outcome.message);
      }

      setState({ phase: 'confirming' });
      const deadline = Date.now() + LOST_FEE_TIMEOUT_MS;
      while (current.status !== 'paid' && Date.now() < deadline) {
        try {
          current = await checkoutBuyout(session.token, rentalId);
        } catch {
          // keep asking until the deadline
        }
        if (current.status !== 'paid') await sleep(POLL_MS);
      }

      void queryClient.invalidateQueries({ queryKey: activeRentalKey(session.user.userId) });
      void queryClient.invalidateQueries({ queryKey: ['station-by-code'] });
      if (current.status !== 'paid') {
        return fail(undefined, 'Payment received. It can take a minute before you can unlock again.');
      }
      setState({ phase: 'paid' });
      return true;
    },
    [checkout, queryClient, session],
  );

  const reset = useCallback(() => setState({ phase: 'idle' }), []);
  return { state, pay, reset };
}

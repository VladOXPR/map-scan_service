import { useCallback, useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '@/store/authStore';
import type { AppRental } from './api';
import { dismissFeedback, fetchFeedbackDue, submitFeedback, type FeedbackAnswers } from './feedback';

export function feedbackDueKey(userId: string | undefined) {
  return ['rental-feedback-due', userId ?? 'signed-out'] as const;
}

/**
 * The returned rental to ask about (the server picks the latest one, returned
 * in the last 72 hours, not yet answered or dismissed). Checked on launch, on
 * foreground, and when the map notices a return.
 */
export function useRentalFeedback() {
  const session = useAuthStore((s) => s.session);
  const queryClient = useQueryClient();
  const key = feedbackDueKey(session?.user.userId);
  const query = useQuery({
    queryKey: key,
    queryFn: () => fetchFeedbackDue(session!.token),
    enabled: Boolean(session?.token),
    staleTime: 60_000,
  });

  const { refetch } = query;
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active' && session?.token) void refetch();
    });
    return () => sub.remove();
  }, [refetch, session?.token]);

  /** Closed on this phone: hidden at once, whatever the server says until it catches up. */
  const [closedId, setClosedId] = useState<string | null>(null);
  const due = query.data ?? null;
  const rental: AppRental | null = due && due.rentalId !== closedId ? due : null;

  const submit = useCallback(
    async (answers: FeedbackAnswers) => {
      if (!session || !rental) return;
      await submitFeedback(session.token, rental.rentalId, answers);
    },
    [rental, session],
  );

  /** After a submit, or without one when `dismissed` (the X): the server stops asking either way. */
  const close = useCallback(
    (dismissed: boolean) => {
      if (!rental) return;
      setClosedId(rental.rentalId);
      const done = () => queryClient.setQueryData(key, null);
      if (!dismissed || !session) {
        done();
        return;
      }
      void dismissFeedback(session.token, rental.rentalId).then(done, () => undefined);
    },
    [key, queryClient, rental, session],
  );

  return { rental, submit, close } as const;
}

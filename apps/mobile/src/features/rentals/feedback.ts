import { apiGet, apiPost } from '@/lib/apiClient';
import type { AppRental } from './api';

/** Same codes as cuub-api's RENTAL_FEEDBACK_PURPOSES; the server refuses anything else. */
export const FEEDBACK_PURPOSES = [
  { value: 'NIGHT_OUT', label: 'Night out' },
  { value: 'DINING', label: 'Dining' },
  { value: 'EVENT', label: 'Event or show' },
  { value: 'WORK', label: 'Work' },
  { value: 'TRAVEL', label: 'Travel' },
  { value: 'OTHER', label: 'Other' },
] as const;

/** Same codes as cuub-api's RENTAL_FEEDBACK_ISSUES. */
export const FEEDBACK_ISSUES = [
  { value: 'SLOW_CHARGING', label: 'Charged slowly' },
  { value: 'LOW_BATTERY', label: 'Power bank was low' },
  { value: 'CABLE', label: 'Cable problem' },
  { value: 'UNLOCK', label: 'Hard to unlock' },
  { value: 'RETURN', label: 'Hard to return' },
  { value: 'APP', label: 'App problem' },
  { value: 'OTHER', label: 'Other' },
] as const;

export type FeedbackPurpose = (typeof FEEDBACK_PURPOSES)[number]['value'];
export type FeedbackIssue = (typeof FEEDBACK_ISSUES)[number]['value'];

/** At or below this rating the sheet asks what could have gone better. */
export const LOW_RATING = 3;
export const FEEDBACK_COMMENT_MAX = 1000;

export type FeedbackAnswers = {
  rating: number;
  purpose: FeedbackPurpose | null;
  issues: FeedbackIssue[];
  comment: string | null;
};

/** The returned rental to ask about, or null. */
export async function fetchFeedbackDue(token: string): Promise<AppRental | null> {
  const { data } = await apiGet<{ rental: AppRental | null }>('/app/rentals/feedback-due', { token });
  return data.rental;
}

export async function submitFeedback(token: string, rentalId: string, answers: FeedbackAnswers): Promise<void> {
  await apiPost(`/app/rentals/${encodeURIComponent(rentalId)}/feedback`, answers, { token });
}

export async function dismissFeedback(token: string, rentalId: string): Promise<void> {
  await apiPost(`/app/rentals/${encodeURIComponent(rentalId)}/feedback/dismiss`, undefined, { token });
}

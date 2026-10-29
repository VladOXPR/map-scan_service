import type { Href } from 'expo-router';
import type { AuthSession } from '@/types/auth';
import { phoneHref, profileHref } from './routes';

/**
 * What stands between this person and an unlock, client side. The server
 * re-checks everything (NO_PROFILE, NO_SUBSCRIPTION, ...) on POST /app/rentals.
 */
export type UnlockGate =
  | { step: 'sign_in'; href: Href }
  | { step: 'profile'; href: Href }
  | { step: 'ready' };

export function unlockGate(session: AuthSession | null, returnTo: string): UnlockGate {
  if (!session) return { step: 'sign_in', href: phoneHref({ entry: 'unlock', next: returnTo }) };
  if (!session.user.profileComplete) {
    return { step: 'profile', href: profileHref({ trigger: 'unlock', next: returnTo }) };
  }
  return { step: 'ready' };
}

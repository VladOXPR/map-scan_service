import { create } from 'zustand';
import { ageBracket } from '@cuub/core';
import { fetchCurrentUser, logoutDevice, toAppUser } from '@/features/auth/api';
import { setAnalyticsToken, tracker } from '@/lib/analytics';
import { isAuthFailure } from '@/lib/apiClient';
import { deleteSecureItem, getSecureItem, setSecureItem } from '@/lib/storage';
import type { AppUser, AuthSession } from '@/types/auth';

const AUTH_KEY = 'cuub.auth.session';

type AuthState = {
  session: AuthSession | null;
  hydrated: boolean;
  hydrate: () => Promise<void>;
  setSession: (session: AuthSession) => Promise<void>;
  /** Replace the signed-in user after a profile change, keeping the token. */
  updateUser: (user: AppUser) => Promise<void>;
  signOut: (options?: { accountDeleted?: boolean }) => Promise<void>;
};

function isSessionShape(value: unknown): value is AuthSession {
  if (!value || typeof value !== 'object') return false;
  const session = value as AuthSession;
  return (
    typeof session.token === 'string' &&
    !!session.user &&
    typeof session.user.userId === 'string' &&
    typeof session.user.phone === 'string'
  );
}

/** Links analytics to the signed-in person; runs on every launch with a valid session. */
function identify(session: AuthSession): void {
  setAnalyticsToken(session.token);
  void tracker.identify(session.user.userId, {
    ageBracket: ageBracket(session.user.dateOfBirth),
  });
}

export const useAuthStore = create<AuthState>((set, get) => ({
  session: null,
  hydrated: false,
  hydrate: async () => {
    try {
      const raw = await getSecureItem(AUTH_KEY);
      if (!raw) {
        set({ session: null, hydrated: true });
        return;
      }

      const parsed = JSON.parse(raw) as unknown;
      if (!isSessionShape(parsed)) {
        await deleteSecureItem(AUTH_KEY);
        set({ session: null, hydrated: true });
        return;
      }

      try {
        const user = await fetchCurrentUser(parsed.token);
        const session: AuthSession = { token: parsed.token, user };
        await setSecureItem(AUTH_KEY, JSON.stringify(session));
        set({ session, hydrated: true });
        identify(session);
      } catch (error) {
        if (isAuthFailure(error)) {
          await deleteSecureItem(AUTH_KEY);
          set({ session: null, hydrated: true });
          return;
        }
        // Network blip: keep cached session; next authenticated call can revalidate.
        const session: AuthSession = { token: parsed.token, user: toAppUser(parsed.user) };
        set({ session, hydrated: true });
        identify(session);
      }
    } catch {
      set({ session: null, hydrated: true });
    }
  },
  setSession: async (session) => {
    await setSecureItem(AUTH_KEY, JSON.stringify(session));
    set({ session });
    identify(session);
  },
  updateUser: async (user) => {
    const current = get().session;
    if (!current) return;
    const session: AuthSession = { token: current.token, user };
    await setSecureItem(AUTH_KEY, JSON.stringify(session));
    set({ session });
    tracker.updatePerson({ ageBracket: ageBracket(user.dateOfBirth) });
  },
  signOut: async (options = {}) => {
    const current = get().session;
    if (current && !options.accountDeleted) {
      tracker.track('logout');
      await logoutDevice(current.token, tracker.getDeviceId()).catch(() => undefined);
    }
    // Flush while the token is still set so signed-in events keep their owner.
    await tracker.reset().catch(() => undefined);
    setAnalyticsToken(null);
    await deleteSecureItem(AUTH_KEY);
    set({ session: null });
  },
}));

import { create } from 'zustand';
import { fetchCurrentUser } from '@/features/auth/api';
import { isAuthFailure } from '@/lib/apiClient';
import { deleteSecureItem, getSecureItem, setSecureItem } from '@/lib/storage';
import type { AuthSession } from '@/types/auth';

const AUTH_KEY = 'cuub.auth.session';

type AuthState = {
  session: AuthSession | null;
  hydrated: boolean;
  hydrate: () => Promise<void>;
  setSession: (session: AuthSession) => Promise<void>;
  signOut: () => Promise<void>;
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

export const useAuthStore = create<AuthState>((set) => ({
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
      } catch (error) {
        if (isAuthFailure(error)) {
          await deleteSecureItem(AUTH_KEY);
          set({ session: null, hydrated: true });
          return;
        }
        // Network blip: keep cached session; next authenticated call can revalidate.
        set({ session: parsed, hydrated: true });
      }
    } catch {
      set({ session: null, hydrated: true });
    }
  },
  setSession: async (session) => {
    await setSecureItem(AUTH_KEY, JSON.stringify(session));
    set({ session });
  },
  signOut: async () => {
    await deleteSecureItem(AUTH_KEY);
    set({ session: null });
  },
}));

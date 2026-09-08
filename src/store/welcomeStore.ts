import { create } from 'zustand';
import type { WelcomeVariant } from '@/types/auth';

type WelcomeState = {
  /** One-shot welcome after OTP login. */
  pending: WelcomeVariant | null;
  arm: (variant: WelcomeVariant) => void;
  clear: () => void;
};

export const useWelcomeStore = create<WelcomeState>((set) => ({
  pending: null,
  arm: (variant) => set({ pending: variant }),
  clear: () => set({ pending: null }),
}));

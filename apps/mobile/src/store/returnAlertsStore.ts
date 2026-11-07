import { create } from 'zustand';
import { getItem, setItem } from '@/lib/storage';

const RETURN_ALERTS_CHOICE_KEY = 'cuub.returnAlerts.choice';

export type ReturnAlertsChoice = 'on' | 'off';

type ReturnAlertsState = {
  /** Null until the person answers the return alerts prompt. */
  choice: ReturnAlertsChoice | null;
  hydrated: boolean;
  hydrate: () => Promise<void>;
  setChoice: (choice: ReturnAlertsChoice) => Promise<void>;
};

export const useReturnAlertsStore = create<ReturnAlertsState>((set) => ({
  choice: null,
  hydrated: false,
  hydrate: async () => {
    const raw = await getItem(RETURN_ALERTS_CHOICE_KEY);
    set({ choice: raw === 'on' || raw === 'off' ? raw : null, hydrated: true });
  },
  setChoice: async (choice) => {
    await setItem(RETURN_ALERTS_CHOICE_KEY, choice);
    set({ choice });
  },
}));

import { create } from 'zustand';
import { getItem, setItem } from '@/lib/storage';

const ACCOUNT_PROMPT_DISMISSED_KEY = 'cuub.accountPrompt.dismissed';

type AccountPromptState = {
  dismissed: boolean;
  hydrated: boolean;
  hydrate: () => Promise<void>;
  dismiss: () => Promise<void>;
};

export const useAccountPromptStore = create<AccountPromptState>((set) => ({
  dismissed: false,
  hydrated: false,
  hydrate: async () => {
    const dismissed = (await getItem(ACCOUNT_PROMPT_DISMISSED_KEY)) === '1';
    set({ dismissed, hydrated: true });
  },
  dismiss: async () => {
    await setItem(ACCOUNT_PROMPT_DISMISSED_KEY, '1');
    set({ dismissed: true });
  },
}));

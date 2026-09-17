import { create } from 'zustand';

export type PromptAction = 'ENTER_VEHICLE' | 'TAKE_VEHICLE' | 'TALK' | 'PICK_UP' | 'BUY' | 'ENTER';

export interface InteractionPrompt {
  key: 'E' | 'F';
  action: PromptAction;
  label: string;
}

interface UiStore {
  /** Contextual "[ F ] ENTER VEHICLE" style hint, or null. */
  prompt: InteractionPrompt | null;
  /** Transient banner, e.g. vehicle name on entering. */
  toast: string | null;

  setPrompt: (prompt: InteractionPrompt | null) => void;
  showToast: (message: string | null) => void;
}

export const useUiStore = create<UiStore>((set) => ({
  prompt: null,
  toast: null,

  setPrompt: (prompt) =>
    set((prev) => {
      const same =
        prev.prompt?.action === prompt?.action && prev.prompt?.label === prompt?.label;
      return same ? prev : { prompt };
    }),
  showToast: (toast) => set({ toast }),
}));

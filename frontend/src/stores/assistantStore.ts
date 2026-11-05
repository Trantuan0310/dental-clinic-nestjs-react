import { create } from 'zustand';

/** Whether the AI assistant panel is open; the header button toggles it. */
interface AssistantState {
  open: boolean;
  setOpen: (open: boolean) => void;
}

export const useAssistantStore = create<AssistantState>((set) => ({
  open: false,
  setOpen: (open) => set({ open }),
}));

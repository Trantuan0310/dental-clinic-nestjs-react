import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type ThemeMode = 'light' | 'dark' | 'system';

interface ThemeState {
  mode: ThemeMode;
  /** Resolved effective theme (after applying 'system' preference). */
  resolved: 'light' | 'dark';
  setMode: (mode: ThemeMode) => void;
  toggle: () => void;
  /** Sync `resolved` + DOM class with OS preference. Call on mount and when `mode === 'system'`. */
  sync: () => void;
}

function getSystemPref(): 'light' | 'dark' {
  if (typeof window === 'undefined') return 'light';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function applyDomClass(resolved: 'light' | 'dark') {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  if (resolved === 'dark') root.classList.add('dark');
  else root.classList.remove('dark');
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set, get) => ({
      mode: 'light',
      resolved: 'light',
      setMode: (mode) => {
        const resolved = mode === 'system' ? getSystemPref() : mode;
        applyDomClass(resolved);
        set({ mode, resolved });
      },
      toggle: () => {
        const next: ThemeMode = get().resolved === 'dark' ? 'light' : 'dark';
        get().setMode(next);
      },
      sync: () => {
        const { mode } = get();
        const resolved = mode === 'system' ? getSystemPref() : mode;
        applyDomClass(resolved);
        set({ resolved });
      },
    }),
    {
      name: 'gensmile.theme',
      partialize: (state) => ({ mode: state.mode }),
      onRehydrateStorage: () => (state) => {
        // After rehydration, sync DOM with stored preference.
        if (state) {
          const resolved = state.mode === 'system' ? getSystemPref() : state.mode;
          applyDomClass(resolved);
          state.resolved = resolved;
        }
      },
    },
  ),
);

// Listen to OS-level theme changes when user picked 'system'.
if (typeof window !== 'undefined') {
  const mq = window.matchMedia('(prefers-color-scheme: dark)');
  mq.addEventListener('change', () => {
    const state = useThemeStore.getState();
    if (state.mode === 'system') state.sync();
  });
}

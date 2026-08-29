import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { UserInfo } from '@/types/auth';
import { tokenStore } from '@/lib/api';

interface AuthState {
  user: UserInfo | null;
  accessToken: string | null;
  isAuthenticated: boolean;
  /** Mark persistence hydration as complete. */
  _hasHydrated: boolean;
  setSession: (user: UserInfo, accessToken: string) => void;
  clear: () => void;
  hydrate: () => void;
  hasPermission: (code: string) => boolean;
  hasAnyPermission: (codes: string[]) => boolean;
  hasRole: (...codes: Array<'clinic_admin' | 'receptionist' | 'dentist'>) => boolean;
}

interface PersistedAuth {
  user: UserInfo | null;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      accessToken: null,
      isAuthenticated: false,
      _hasHydrated: false,
      setSession: (user, accessToken) => {
        tokenStore.set(accessToken);
        set({ user, accessToken, isAuthenticated: true });
      },
      clear: () => {
        tokenStore.clear();
        set({ user: null, accessToken: null, isAuthenticated: false });
      },
      hydrate: () => set({ _hasHydrated: true }),
      hasPermission: (code) => {
        const u = get().user;
        return !!u?.permissions.includes(code);
      },
      hasAnyPermission: (codes) => {
        const u = get().user;
        if (!u) return false;
        return codes.some((c) => u.permissions.includes(c));
      },
      hasRole: (...codes) => {
        const u = get().user;
        if (!u) return false;
        return codes.some((c) => u.roles.includes(c));
      },
    }),
    {
      name: 'dental-auth-user',
      storage: createJSONStorage(() => localStorage),
      partialize: (state): PersistedAuth => ({ user: state.user }),
      onRehydrateStorage: () => (state) => {
        if (state) {
          state._hasHydrated = true;
          state.isAuthenticated = !!state.user;
        }
      },
    },
  ),
);

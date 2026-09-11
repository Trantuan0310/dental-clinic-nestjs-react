import { type ReactNode, useEffect, useState } from 'react';
import { useAuthStore } from '@/stores/authStore';
import { authApi } from '@/features/auth/authApi';
import { FullPageLoader } from '@/features/auth/ProtectedRoute';
import { tokenStore } from '@/lib/api';

export function SessionBoot({ children }: { children: ReactNode }) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const setSession = useAuthStore((s) => s.setSession);
  const hasHydrated = useAuthStore((s) => s._hasHydrated);
  const user = useAuthStore((s) => s.user);
  const [booted, setBooted] = useState(false);

  useEffect(() => {
    if (!hasHydrated) {
      return;
    }
    // `isAuthenticated`/`user` are rehydrated from localStorage, but the
    // in-memory access token never survives a reload (by design — it's not
    // persisted). Trusting the rehydrated flag here used to skip the
    // refresh call on every reload, so every page's initial queries fired
    // with no Authorization header, each 401'd, and all queued behind the
    // interceptor's own (deduped) refresh — a burst of console/network
    // noise on every load. Only skip the refresh when a token already
    // lives in tokenStore (e.g. setSession() already ran this page load).
    if (isAuthenticated && user && tokenStore.token) {
      setBooted(true);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const session = await authApi.refresh();
        if (session && !cancelled) {
          setSession(session.user, session.accessToken);
        }
      } catch {
        // silent
      } finally {
        if (!cancelled) setBooted(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [hasHydrated, isAuthenticated, user, setSession]);

  if (!booted) return <FullPageLoader />;
  return <>{children}</>;
}

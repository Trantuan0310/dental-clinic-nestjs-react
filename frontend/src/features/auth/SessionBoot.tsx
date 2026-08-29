import { type ReactNode, useEffect, useState } from 'react';
import { useAuthStore } from '@/stores/authStore';
import { authApi } from '@/features/auth/authApi';
import { FullPageLoader } from '@/features/auth/ProtectedRoute';

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
    if (isAuthenticated && user) {
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

import { type ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';
import { PageLoader } from '@/components/ui/Loading';

interface ProtectedRouteProps {
  children: ReactNode;
  requiredPermission?: string;
  permission?: string;
  anyPermission?: string[];
}

export function ProtectedRoute({
  children,
  requiredPermission,
  permission,
  anyPermission,
}: ProtectedRouteProps) {
  const location = useLocation();
  const { isAuthenticated, user, hasPermission, hasAnyPermission } = useAuthStore((s) => ({
    isAuthenticated: s.isAuthenticated,
    user: s.user,
    hasPermission: s.hasPermission,
    hasAnyPermission: s.hasAnyPermission,
  }));

  if (!isAuthenticated || !user) {
    return <Navigate to="/login" state={{ from: location.pathname + location.search }} replace />;
  }

  const required = requiredPermission ?? permission;
  if (required && !hasPermission(required)) {
    return <Navigate to="/403" replace />;
  }
  if (anyPermission && !hasAnyPermission(anyPermission)) {
    return <Navigate to="/403" replace />;
  }

  return <>{children}</>;
}

export function FullPageLoader() {
  return (
    <div className="min-h-screen">
      <PageLoader />
    </div>
  );
}
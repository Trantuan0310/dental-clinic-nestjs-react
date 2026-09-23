import { type ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';
import type { RoleCode } from '@/types/auth';
import { PageLoader } from '@/components/ui/Loading';

interface ProtectedRouteProps {
  children: ReactNode;
  requiredPermission?: string;
  permission?: string;
  anyPermission?: string[];
  roles?: RoleCode[];
}

export function ProtectedRoute({
  children,
  requiredPermission,
  permission,
  anyPermission,
  roles,
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

  if (roles && !roles.some((role) => user.roles.includes(role))) {
    return <Navigate to="/403" replace />;
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
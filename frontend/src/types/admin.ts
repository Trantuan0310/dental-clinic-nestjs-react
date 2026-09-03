// =============================================================================
// Admin Module TypeScript Types
// Source: backend API — /admin/users, /admin/roles, /admin/audit-logs, settings
// =============================================================================

export interface AdminUser {
  id: string;
  email: string;
  fullName: string;
  status: 'ACTIVE' | 'PENDING_SETUP' | 'DEACTIVATED';
  roles: string[];
  lastLoginAt?: string | null;
  createdAt: string;
  updatedAt?: string;
}

export interface AdminUserListResponse {
  data: AdminUser[];
  pagination: {
    pageSize: number;
    nextCursor: string | null;
    hasMore: boolean;
  };
}

export interface CreateAdminUserPayload {
  email: string;
  fullName: string;
  roleIds: string[];
  sendSetupEmail?: boolean;
}

export interface UpdateAdminUserPayload {
  fullName?: string;
  roleIds?: string[];
}

export interface AdminRole {
  id: string;
  code: string;
  name: string;
  description?: string | null;
  isSystem: boolean;
  createdAt: string;
  userCount?: number;
  permissions: string[];
}

export interface AdminRoleListResponse {
  data: AdminRole[];
  pagination: {
    pageSize: number;
    nextCursor: string | null;
    hasMore: boolean;
  };
}

export interface Permission {
  id: string;
  code: string;
  resource: string;
  action: string;
  description?: string | null;
}

export interface CreateAdminRolePayload {
  code: string;
  name: string;
  description?: string;
  permissionIds: string[];
}

export interface UpdateAdminRolePayload {
  name?: string;
  description?: string;
  permissionIds?: string[];
}

export interface AuditLog {
  id: string;
  actorUserId?: string | null;
  actorEmailAtTime?: string | null;
  action: string;
  targetType?: string | null;
  targetId?: string | null;
  metadata?: Record<string, unknown> | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  occurredAt: string;
}

export interface AuditLogListResponse {
  data: AuditLog[];
  pagination: {
    pageSize: number;
    nextCursor: string | null;
    hasMore: boolean;
  };
}

export interface AuditLogFilters {
  actor?: string;
  action?: string;
  targetType?: string;
  targetId?: string;
  from?: string;
  to?: string;
  limit?: number;
  cursor?: string;
}

export interface ClinicSettings {
  clinicName: string;
  taxCode?: string;
  address?: string;
  phone?: string;
  email?: string;
  website?: string;
}

export interface UpdateClinicSettingsPayload extends Partial<ClinicSettings> {}

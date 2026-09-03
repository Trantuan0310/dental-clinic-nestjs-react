// =============================================================================
// Admin Module API — users, roles, audit logs, settings.
// All endpoints are under /admin/* (authenticated).
// =============================================================================

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, unwrap } from '@/lib/api';
import type {
  AdminUser,
  AdminUserListResponse,
  CreateAdminUserPayload,
  UpdateAdminUserPayload,
  AdminRole,
  AdminRoleListResponse,
  CreateAdminRolePayload,
  UpdateAdminRolePayload,
  AuditLogListResponse,
  AuditLogFilters,
  ClinicSettings,
  UpdateClinicSettingsPayload,
  Permission,
} from '@/types/admin';

// ---------------------------------------------------------------------------
// HTTP helpers
// ---------------------------------------------------------------------------

const get = async <T>(url: string, config?: Parameters<typeof api.get>[1]) => {
  const { data } = await api.get<{ data: T }>(url, config);
  return unwrap(data);
};

const post = async <T>(url: string, body: unknown) => {
  const { data } = await api.post<{ data: T }>(url, body);
  return unwrap(data);
};

const patch = async <T>(url: string, body: unknown) => {
  const { data } = await api.patch<{ data: T }>(url, body);
  return unwrap(data);
};

const del = async (url: string) => {
  await api.delete(url);
};

const postVoid = async (url: string, body?: unknown) => {
  await api.post(url, body);
};

// ---------------------------------------------------------------------------
// Users
// ---------------------------------------------------------------------------

interface ListUsersParams {
  q?: string;
  status?: string;
  limit?: number;
  cursor?: string;
}

export function useUsers(params?: ListUsersParams) {
  return useQuery({
    queryKey: ['admin', 'users', params],
    queryFn: (): Promise<AdminUserListResponse> =>
      get<AdminUserListResponse>('/admin/users', { params }),
  });
}

export function useUser(id: string) {
  return useQuery({
    queryKey: ['admin', 'users', id],
    queryFn: (): Promise<AdminUser> => get<AdminUser>(`/admin/users/${id}`),
    enabled: !!id,
  });
}

export function useCreateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: CreateAdminUserPayload): Promise<AdminUser> =>
      post<AdminUser>('/admin/users', payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'users'] }),
  });
}

export function useUpdateUser(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: UpdateAdminUserPayload): Promise<AdminUser> =>
      patch<AdminUser>(`/admin/users/${id}`, payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'users'] }),
  });
}

// Users have no hard-delete endpoint — status changes go through the
// dedicated deactivate/reactivate routes, which enforce the "can't
// deactivate the last admin" guard and revoke active sessions. The generic
// PATCH :id endpoint deliberately does not accept a status field.
export function useDeactivateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason?: string }) =>
      postVoid(`/admin/users/${id}/deactivate`, { reason }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'users'] }),
  });
}

export function useReactivateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => postVoid(`/admin/users/${id}/reactivate`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'users'] }),
  });
}

// ---------------------------------------------------------------------------
// Roles
// ---------------------------------------------------------------------------

export function useRoles() {
  return useQuery({
    queryKey: ['admin', 'roles'],
    queryFn: (): Promise<AdminRoleListResponse> => get<AdminRoleListResponse>('/admin/roles'),
  });
}

export function useRole(id: string) {
  return useQuery({
    queryKey: ['admin', 'roles', id],
    queryFn: (): Promise<AdminRole> => get<AdminRole>(`/admin/roles/${id}`),
    enabled: !!id,
  });
}

export function usePermissions() {
  return useQuery({
    queryKey: ['admin', 'permissions'],
    queryFn: (): Promise<Permission[]> => get<Permission[]>('/admin/roles/permissions'),
  });
}

export function useCreateRole() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: CreateAdminRolePayload): Promise<AdminRole> =>
      post<AdminRole>('/admin/roles', payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'roles'] }),
  });
}

export function useUpdateRole(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: UpdateAdminRolePayload): Promise<AdminRole> =>
      patch<AdminRole>(`/admin/roles/${id}`, payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'roles'] }),
  });
}

export function useDeleteRole() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => del(`/admin/roles/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'roles'] }),
  });
}

// ---------------------------------------------------------------------------
// Audit Logs
// ---------------------------------------------------------------------------

export function useAuditLogs(params?: AuditLogFilters) {
  return useQuery({
    queryKey: ['admin', 'audit-logs', params],
    queryFn: (): Promise<AuditLogListResponse> => {
      const { cursor, ...rest } = params ?? {};
      return get<AuditLogListResponse>('/admin/audit-logs', {
        params: { ...rest, ...(cursor ? { cursor } : {}) },
      });
    },
  });
}

// ---------------------------------------------------------------------------
// Settings (stub — backend does not yet expose a settings endpoint)
// ---------------------------------------------------------------------------

export function useSettings() {
  return useQuery({
    queryKey: ['admin', 'settings'],
    queryFn: async (): Promise<ClinicSettings> => {
      // TODO: wire to backend when /admin/settings endpoint is available
      // Returns hardcoded defaults until backend implements this.
      return {
        clinicName: 'Nha khoa GENSMILE',
        taxCode: '',
        address: '',
        phone: '',
        email: '',
        website: '',
      };
    },
  });
}

export function useUpdateSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (_payload: UpdateClinicSettingsPayload): Promise<ClinicSettings> => {
      // TODO: wire to backend PUT /admin/settings when available
      return {
        clinicName: 'Nha khoa GENSMILE',
        taxCode: '',
        address: '',
        phone: '',
        email: '',
        website: '',
      };
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'settings'] }),
  });
}

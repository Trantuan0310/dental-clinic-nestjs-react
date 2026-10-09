import type { AxiosError } from 'axios';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, unwrap } from '@/lib/api';
import { getApiErrorMessage } from '@/lib/errors';
import type {
  CatalogService,
  DentistServiceAssignment,
  ServiceCategory,
  ServiceImpact,
  ServicePayload,
} from './types';

export const catalogKeys = {
  all: ['catalog'] as const,
  categories: ['catalog', 'categories'] as const,
  services: (includeInactive: boolean) => ['catalog', 'services', includeInactive] as const,
  dentistServices: (dentistId: string) => ['catalog', 'dentist', dentistId] as const,
};

export const catalogApi = {
  async categories(): Promise<ServiceCategory[]> {
    const { data } = await api.get<{ data: ServiceCategory[] }>('/service-categories', {
      params: { includeInactive: true },
    });
    return unwrap(data);
  },
  async createCategory(payload: { code: string; name: string; sortOrder?: number }) {
    const { data } = await api.post<{ data: ServiceCategory }>('/service-categories', payload);
    return unwrap(data);
  },
  async updateCategory(
    id: string,
    payload: { name?: string; sortOrder?: number; isActive?: boolean },
  ) {
    const { data } = await api.patch<{ data: ServiceCategory }>(`/service-categories/${id}`, payload);
    return unwrap(data);
  },
  async services(includeInactive: boolean): Promise<CatalogService[]> {
    const { data } = await api.get<{ data: CatalogService[] }>('/services', {
      params: includeInactive ? { includeInactive: true } : undefined,
    });
    return unwrap(data);
  },
  async createService(payload: ServicePayload): Promise<CatalogService> {
    const { data } = await api.post<{ data: CatalogService }>('/services', payload);
    return unwrap(data);
  },
  async updateService(id: string, payload: Partial<ServicePayload>): Promise<CatalogService> {
    const { data } = await api.patch<{ data: CatalogService }>(`/services/${id}`, payload);
    return unwrap(data);
  },
  async impact(id: string): Promise<ServiceImpact> {
    const { data } = await api.get<{ data: ServiceImpact }>(`/services/${id}/impact`);
    return unwrap(data);
  },
  async setActive(id: string, active: boolean, restoreAssignments = false) {
    const { data } = await api.post<{
      data: CatalogService & { endedAssignments: number; restoredAssignments: number };
    }>(
      `/services/${id}/${active ? 'activate' : 'deactivate'}`,
      active && restoreAssignments ? { restoreAssignments: true } : {},
    );
    return unwrap(data);
  },
  async dentistServices(dentistId: string): Promise<DentistServiceAssignment[]> {
    const { data } = await api.get<{ data: DentistServiceAssignment[] }>(
      `/dentists/${dentistId}/services`,
    );
    return unwrap(data);
  },
  async assign(
    dentistId: string,
    payload: { serviceId: string; effectiveFrom?: string; durationMin?: number; price?: number },
  ): Promise<DentistServiceAssignment> {
    const { data } = await api.post<{ data: DentistServiceAssignment }>(
      `/dentists/${dentistId}/services`,
      payload,
    );
    return unwrap(data);
  },
  /** New duration/price from a date on; null = back to the service default. */
  async changeAssignment(
    dentistId: string,
    assignmentId: string,
    payload: { effectiveFrom: string; durationMin: number | null; price: number | null },
  ) {
    const { data } = await api.post<{
      data: DentistServiceAssignment & { affectedAppointments: number };
    }>(
      `/dentists/${dentistId}/services/${assignmentId}/change`,
      payload,
    );
    return unwrap(data);
  },
  // `confirm`: end it although visits are booked after that day (the first
  // try answers 409 ASSIGNMENT_HAS_UPCOMING_VISITS listing them).
  async endAssignment(dentistId: string, assignmentId: string, effectiveTo?: string, confirm = false) {
    const { data } = await api.post<{
      data: DentistServiceAssignment & { removed: boolean; affectedAppointments: number };
    }>(
      `/dentists/${dentistId}/services/${assignmentId}/end`,
      { ...(effectiveTo ? { effectiveTo } : {}), ...(confirm ? { confirm: true } : {}) },
    );
    return unwrap(data);
  },
};

export function useServiceCategories() {
  return useQuery({ queryKey: catalogKeys.categories, queryFn: catalogApi.categories });
}

export function useCatalogServices(includeInactive = false) {
  return useQuery({
    queryKey: catalogKeys.services(includeInactive),
    queryFn: () => catalogApi.services(includeInactive),
  });
}

export function useDentistServices(dentistId: string | undefined) {
  return useQuery({
    queryKey: catalogKeys.dentistServices(dentistId ?? ''),
    queryFn: () => catalogApi.dentistServices(dentistId!),
    enabled: !!dentistId,
  });
}

export function useCatalogMutation<TVars, TResult>(mutationFn: (vars: TVars) => Promise<TResult>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: () => qc.invalidateQueries({ queryKey: catalogKeys.all }),
  });
}

// CATALOG_VALIDATION and ASSIGNMENT_NOT_ALLOWED carry a specific Vietnamese
// message from the backend, shown as is.
const CODE_MESSAGE: Record<string, string> = {
  CATALOG_CODE_TAKEN: 'Mã này đã được dùng.',
  CATALOG_NOT_FOUND: 'Không tìm thấy dữ liệu.',
  SPECIALTY_REQUIRED: 'Bác sĩ chưa có chuyên môn mà dịch vụ này yêu cầu.',
  ASSIGNMENT_OVERLAP: 'Bác sĩ đã được phân công dịch vụ này trong khoảng thời gian trùng.',
};

export function catalogErrorMessage(error: unknown, fallback: string): string {
  const code = (error as AxiosError<{ code?: string }>)?.response?.data?.code;
  if (code && CODE_MESSAGE[code]) return CODE_MESSAGE[code];
  return getApiErrorMessage(error, fallback);
}

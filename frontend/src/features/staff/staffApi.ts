import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, unwrap } from '@/lib/api';
import { appointmentKeys } from '@/features/appointments/appointmentApi';
import type {
  DentistOverview,
  DentistProfile,
  DentistProfilePayload,
  Employee,
  EmployeeFilters,
  EmployeeListResponse,
  EmployeePayload,
  PracticeStatus,
} from './types';

export const staffKeys = {
  employees: ['employees'] as const,
  employeeList: (filters: EmployeeFilters) => ['employees', 'list', filters] as const,
  dentists: ['dentists'] as const,
  dentistList: (status?: PracticeStatus) => ['dentists', 'list', status ?? 'all'] as const,
  dentistOverview: (userId: string) => ['dentists', 'overview', userId] as const,
};

export const staffApi = {
  async listEmployees(filters: EmployeeFilters): Promise<EmployeeListResponse> {
    const { data } = await api.get<EmployeeListResponse>('/employees', { params: filters });
    return data;
  },
  async createEmployee(payload: EmployeePayload): Promise<Employee> {
    const { data } = await api.post<{ data: Employee }>('/employees', payload);
    return unwrap(data);
  },
  async updateEmployee(id: string, payload: Partial<EmployeePayload>): Promise<Employee> {
    const { data } = await api.patch<{ data: Employee }>(`/employees/${id}`, payload);
    return unwrap(data);
  },
  async terminateEmployee(
    id: string,
    payload: { reason: string; terminationDate?: string },
  ): Promise<Employee> {
    const { data } = await api.post<{ data: Employee }>(`/employees/${id}/terminate`, payload);
    return unwrap(data);
  },
  async linkAccount(id: string, payload: { userId?: string; loginEmail?: string }): Promise<Employee> {
    const { data } = await api.post<{ data: Employee }>(`/employees/${id}/account`, payload);
    return unwrap(data);
  },
  async createDentistProfile(id: string, payload: DentistProfilePayload): Promise<unknown> {
    const { data } = await api.post<{ data: unknown }>(`/employees/${id}/dentist-profile`, payload);
    return unwrap(data);
  },
  async listDentists(status?: PracticeStatus): Promise<DentistProfile[]> {
    const { data } = await api.get<{ data: DentistProfile[] }>('/dentists', {
      params: status ? { status } : undefined,
    });
    return unwrap(data);
  },
  async dentistOverview(userId: string): Promise<DentistOverview> {
    const { data } = await api.get<{ data: DentistOverview }>(`/dentists/${userId}/overview`);
    return unwrap(data);
  },
  async updateDentist(userId: string, payload: DentistProfilePayload): Promise<DentistProfile> {
    const { data } = await api.patch<{ data: DentistProfile }>(`/dentists/${userId}`, payload);
    return unwrap(data);
  },
  async deactivateDentist(
    userId: string,
    payload: { status: 'SUSPENDED' | 'INACTIVE'; reason: string },
  ): Promise<DentistProfile> {
    const { data } = await api.post<{ data: DentistProfile }>(`/dentists/${userId}/deactivate`, payload);
    return unwrap(data);
  },
  async activateDentist(userId: string): Promise<DentistProfile> {
    const { data } = await api.post<{ data: DentistProfile }>(`/dentists/${userId}/activate`, {});
    return unwrap(data);
  },
};

export function useEmployees(filters: EmployeeFilters) {
  return useQuery({
    queryKey: staffKeys.employeeList(filters),
    queryFn: () => staffApi.listEmployees(filters),
    placeholderData: (previous) => previous,
  });
}

export function useDentistProfiles(status?: PracticeStatus) {
  return useQuery({
    queryKey: staffKeys.dentistList(status),
    queryFn: () => staffApi.listDentists(status),
  });
}

export function useDentistOverview(userId: string | undefined) {
  return useQuery({
    queryKey: staffKeys.dentistOverview(userId ?? ''),
    queryFn: () => staffApi.dentistOverview(userId!),
    enabled: !!userId,
  });
}

/**
 * Every staff change can alter who appears in the booking form (new dentist,
 * suspended dentist, new colour), so refresh the appointment dentist lookup too.
 */
export function useStaffMutation<TVars, TResult>(mutationFn: (vars: TVars) => Promise<TResult>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: staffKeys.employees });
      qc.invalidateQueries({ queryKey: staffKeys.dentists });
      qc.invalidateQueries({ queryKey: appointmentKeys.dentists });
    },
  });
}

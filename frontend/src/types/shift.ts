// =============================================================================
// Shift Module TypeScript Types
// =============================================================================

export type ShiftRegistrationStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED';

export interface ShiftRegistration {
  id: string;
  dentistId: string;
  dentistName: string;
  date: string;
  startTime: string;
  endTime: string;
  maxEncounters?: number;
  notes?: string | null;
  status: ShiftRegistrationStatus;
  approvedBy?: string | null;
  approvedByName?: string | null;
  approvedAt?: string | null;
  rejectedReason?: string | null;
  createdAt: string;
}

export interface ShiftRegistrationListResponse {
  data: ShiftRegistration[];
  total: number;
}

export interface CreateShiftRegistrationPayload {
  date: string;
  startTime: string;
  endTime: string;
  maxEncounters?: number;
  notes?: string;
}

// API functions
import { api, unwrap } from '@/lib/api';

export const shiftApi = {
  async listMyShifts(params?: {
    status?: ShiftRegistrationStatus;
    from?: string;
    to?: string;
    page?: number;
    pageSize?: number;
  }): Promise<ShiftRegistrationListResponse> {
    const { data } = await api.get<ShiftRegistrationListResponse>('/shifts/me', { params });
    return data;
  },

  async register(payload: CreateShiftRegistrationPayload): Promise<ShiftRegistration> {
    const { data } = await api.post<{ data: ShiftRegistration }>('/shifts/me', payload);
    return unwrap(data);
  },

  async cancel(id: string): Promise<ShiftRegistration> {
    const { data } = await api.post<{ data: ShiftRegistration }>(`/shifts/me/${id}/cancel`);
    return unwrap(data);
  },

  // Admin/Receptionist - Pending approvals
  async listPendingApprovals(params?: {
    dentistId?: string;
    date?: string;
    page?: number;
    pageSize?: number;
  }): Promise<ShiftRegistrationListResponse> {
    const { data } = await api.get<ShiftRegistrationListResponse>('/shifts/pending', { params });
    return data;
  },

  async approve(id: string): Promise<ShiftRegistration> {
    const { data } = await api.post<{ data: ShiftRegistration }>(`/shifts/${id}/approve`);
    return unwrap(data);
  },

  async reject(id: string, reason: string): Promise<ShiftRegistration> {
    const { data } = await api.post<{ data: ShiftRegistration }>(`/shifts/${id}/reject`, { reason });
    return unwrap(data);
  },

  async bulkApprove(ids: string[]): Promise<ShiftRegistration[]> {
    const { data } = await api.post<{ data: ShiftRegistration[] }>('/shifts/bulk-approve', { ids });
    return unwrap(data);
  },

  // Working Schedule
  async getMyWorkingSchedule(): Promise<{
    dayOfWeek: number;
    startTime: string;
    endTime: string;
  }[]> {
    const { data } = await api.get<{ data: { dayOfWeek: number; startTime: string; endTime: string }[] }>(
      '/shifts/me/schedule',
    );
    return unwrap(data);
  },
};

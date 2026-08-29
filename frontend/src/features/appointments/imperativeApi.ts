// Imperative (non-hook) Appointment API methods. The hook-based
// equivalents live in `appointmentApi.ts`. Components that already
// accept an `appointmentsApi.get(...)` style signature import this
// file directly from `@/features/appointments/imperativeApi`.

import { api, unwrap } from '@/lib/api';
import type {
  Appointment,
  AppointmentListResponse,
  AppointmentFilters,
  CreateAppointmentPayload,
  UpdateAppointmentPayload,
  CancelAppointmentPayload,
  RescheduleAppointmentPayload,
  CheckInPayload,
  DentistAvailability,
} from '@/types/appointment';

export const appointmentsApi = {
  async list(params?: AppointmentFilters): Promise<AppointmentListResponse> {
    const { data } = await api.get<AppointmentListResponse>('/appointments', { params });
    return data;
  },

  async get(id: string): Promise<Appointment> {
    const { data } = await api.get<{ data: Appointment }>(`/appointments/${id}`);
    return unwrap(data);
  },

  async create(payload: CreateAppointmentPayload): Promise<Appointment> {
    const { data } = await api.post<{ data: Appointment }>('/appointments', payload);
    return unwrap(data);
  },

  async update(id: string, payload: UpdateAppointmentPayload): Promise<Appointment> {
    const { data } = await api.patch<{ data: Appointment }>(`/appointments/${id}`, payload);
    return unwrap(data);
  },

  async cancel(id: string, payload: CancelAppointmentPayload): Promise<Appointment> {
    const { data } = await api.post<{ data: Appointment }>(`/appointments/${id}/cancel`, payload);
    return unwrap(data);
  },

  async reschedule(id: string, payload: RescheduleAppointmentPayload): Promise<Appointment> {
    const { data } = await api.post<{ data: Appointment }>(`/appointments/${id}/reschedule`, payload);
    return unwrap(data);
  },

  async checkIn(id: string, payload?: CheckInPayload): Promise<Appointment> {
    const { data } = await api.post<{ data: Appointment }>(`/appointments/${id}/check-in`, payload);
    return unwrap(data);
  },

  async getDentistAvailability(
    dentistId: string,
    date: string,
  ): Promise<DentistAvailability> {
    const { data } = await api.get<{ data: DentistAvailability }>(
      '/appointments/availability',
      { params: { dentistId, date } },
    );
    return unwrap(data);
  },

  async markNoShow(id: string): Promise<Appointment> {
    const { data } = await api.post<{ data: Appointment }>(`/appointments/${id}/no-show`);
    return unwrap(data);
  },
};
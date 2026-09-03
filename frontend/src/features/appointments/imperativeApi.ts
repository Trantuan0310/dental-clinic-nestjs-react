// Imperative (non-hook) Appointment API methods. The hook-based
// equivalents live in `appointmentApi.ts`. Components that already
// accept an `appointmentsApi.get(...)` style signature import this
// file directly from `@/features/appointments/imperativeApi`.

import { api, unwrap } from '@/lib/api';
import {
  transformAppointment,
  transformAppointmentList,
  type PrismaAppointmentRow,
} from './appointmentApi';
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

// The backend returns Prisma rows (startAt/endAt, nested patient/dentist,
// upper-case status) — every method here transforms them into the frontend
// Appointment shape (startsAt/endsAt, flat patientName/dentistName) via the
// same transform appointmentApi.ts's hooks use, rather than passing the raw
// row through under an `Appointment`-typed lie.
export const appointmentsApi = {
  async list(params?: AppointmentFilters): Promise<AppointmentListResponse> {
    const { data } = await api.get<{ data: PrismaAppointmentRow[]; pagination?: AppointmentListResponse['pagination'] }>(
      '/appointments',
      { params },
    );
    return {
      data: transformAppointmentList(data.data),
      pagination: data.pagination,
      total: data.data.length,
    };
  },

  async get(id: string): Promise<Appointment> {
    const { data } = await api.get<{ data: PrismaAppointmentRow }>(`/appointments/${id}`);
    return transformAppointment(unwrap(data));
  },

  async create(payload: CreateAppointmentPayload): Promise<Appointment> {
    const { data } = await api.post<{ data: PrismaAppointmentRow }>('/appointments', payload);
    return transformAppointment(unwrap(data));
  },

  async update(id: string, payload: UpdateAppointmentPayload): Promise<Appointment> {
    const { data } = await api.patch<{ data: PrismaAppointmentRow }>(`/appointments/${id}`, payload);
    return transformAppointment(unwrap(data));
  },

  async cancel(id: string, payload: CancelAppointmentPayload): Promise<Appointment> {
    const { data } = await api.post<{ data: PrismaAppointmentRow }>(`/appointments/${id}/cancel`, payload);
    return transformAppointment(unwrap(data));
  },

  async reschedule(id: string, payload: RescheduleAppointmentPayload): Promise<Appointment> {
    const { data } = await api.post<{ data: PrismaAppointmentRow }>(`/appointments/${id}/reschedule`, payload);
    return transformAppointment(unwrap(data));
  },

  async checkIn(id: string, payload?: CheckInPayload): Promise<Appointment> {
    const { data } = await api.post<{ data: PrismaAppointmentRow }>(`/appointments/${id}/check-in`, payload);
    return transformAppointment(unwrap(data));
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
    const { data } = await api.post<{ data: PrismaAppointmentRow }>(`/appointments/${id}/no-show`);
    return transformAppointment(unwrap(data));
  },
};
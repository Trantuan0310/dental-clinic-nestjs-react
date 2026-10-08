import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, type AuthEnvelope, unwrap } from '@/lib/api';
import { clinicToday } from '@/lib/clinicTime';
import type {
  WorkingSchedule,
  CreateWorkingSchedulePayload,
  BulkCreateWorkingSchedulesPayload,
  UpdateWorkingSchedulePayload,
  UpdateWorkingScheduleResult,
  ScheduleChangeImpact,
  ClinicClosure,
  ClinicClosurePayload,
  ClinicClosureResult,
  PendingBookingRequest,
  TimeOff,
  CreateTimeOffPayload,
  CreateTimeOffResult,
  CreateScheduleOverridePayload,
  CreateScheduleOverrideResult,
  ImpactedAppointment,
  ScheduleOverride,
  TimeOffStatus,
  TimeOffImpactPreview,
  BulkRescheduleResult,
} from '@/types/schedule';

const get = async <T>(url: string, config?: Parameters<typeof api.get>[1]) => {
  const { data } = await api.get<AuthEnvelope<T>>(url, config);
  return unwrap(data);
};

const post = async <T>(url: string, body?: unknown) => {
  const { data } = await api.post<AuthEnvelope<T>>(url, body);
  return unwrap(data);
};

const patch = async <T>(url: string, body?: unknown) => {
  const { data } = await api.patch<AuthEnvelope<T>>(url, body);
  return unwrap(data);
};

const del = async <T>(url: string) => {
  const { data } = await api.delete<AuthEnvelope<T>>(url);
  return unwrap(data);
};

export const scheduleKeys = {
  workingSchedules: (dentistId?: string) => ['schedule', 'working', dentistId ?? 'all'] as const,
  timeOffs: (dentistId?: string, status?: TimeOffStatus) =>
    ['schedule', 'time-off', dentistId ?? 'all', status ?? 'all'] as const,
  overrides: (dentistId?: string) => ['schedule', 'overrides', dentistId ?? 'all'] as const,
  impact: (dentistId?: string) => ['schedule', 'impact', dentistId ?? 'all'] as const,
  closures: () => ['schedule', 'clinic-closures'] as const,
  requestIssues: (dentistId?: string) => ['schedule', 'request-issues', dentistId ?? 'all'] as const,
};

/** Anything that changes a dentist's calendar changes bookable slots and the impact list. */
function invalidateCalendar(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ['schedule'] });
  qc.invalidateQueries({ queryKey: ['appointments', 'availability'] });
}

// startTime/endTime come back as Postgres TIME(0) columns serialized by
// Prisma as full ISO datetimes anchored at 1970-01-01
// ("1970-01-01T08:00:00.000Z") — slice out just the "HH:mm" for display and
// for re-submission (the create DTO wants a bare "HH:mm" string, matching
// what it was given).
function toHhMm(value: string): string {
  const match = /T(\d{2}:\d{2})/.exec(value);
  return match ? match[1] : value;
}

interface RawWorkingSchedule extends Omit<WorkingSchedule, 'startTime' | 'endTime'> {
  startTime: string;
  endTime: string;
}

function mapWorkingSchedule(raw: RawWorkingSchedule): WorkingSchedule {
  return { ...raw, startTime: toHhMm(raw.startTime), endTime: toHhMm(raw.endTime) };
}

export function useWorkingSchedules(dentistId?: string) {
  return useQuery({
    queryKey: scheduleKeys.workingSchedules(dentistId),
    queryFn: () =>
      get<RawWorkingSchedule[]>('/appointments/schedules', {
        params: dentistId ? { dentistId } : undefined,
      }).then((rows) => rows.map(mapWorkingSchedule)),
  });
}

export function useCreateWorkingSchedule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateWorkingSchedulePayload) =>
      post<RawWorkingSchedule>('/appointments/schedules', payload).then(mapWorkingSchedule),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['schedule', 'working'] });
      // New working hours change which slots are bookable.
      qc.invalidateQueries({ queryKey: ['appointments', 'availability'] });
    },
  });
}

/** Several weekdays × blocks saved in one transaction (all or nothing). */
export function useBulkCreateWorkingSchedules() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: BulkCreateWorkingSchedulesPayload) =>
      post<{ created: RawWorkingSchedule[] }>('/appointments/schedules/bulk', payload).then((r) =>
        r.created.map(mapWorkingSchedule),
      ),
    onSuccess: () => invalidateCalendar(qc),
  });
}

export function useUpdateWorkingSchedule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...payload }: UpdateWorkingSchedulePayload & { id: string }) =>
      patch<UpdateWorkingScheduleResult>(`/appointments/schedules/${id}`, payload),
    onSuccess: () => invalidateCalendar(qc),
  });
}

/**
 * Only a schedule that has not started yet (or one created by mistake today)
 * can be deleted; a running one is ended. `restorePrevious` gives the row it
 * replaced its old end back (A1-20).
 */
export function useDeleteWorkingSchedule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, restorePrevious }: { id: string; restorePrevious?: boolean }) =>
      del<ScheduleChangeImpact & { restoredSchedule?: RawWorkingSchedule | null }>(
        `/appointments/schedules/${id}${restorePrevious ? '?restorePrevious=true' : ''}`,
      ),
    onSuccess: () => invalidateCalendar(qc),
  });
}

export function useClinicClosures() {
  return useQuery({
    queryKey: scheduleKeys.closures(),
    queryFn: () => get<ClinicClosure[]>('/appointments/clinic-closures'),
  });
}

export function useSaveClinicClosure() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...payload }: ClinicClosurePayload & { id?: string }) =>
      id
        ? patch<ClinicClosureResult>(`/appointments/clinic-closures/${id}`, payload)
        : post<ClinicClosureResult>('/appointments/clinic-closures', payload),
    onSuccess: () => invalidateCalendar(qc),
  });
}

export function useDeleteClinicClosure() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/appointments/clinic-closures/${id}`);
    },
    onSuccess: () => invalidateCalendar(qc),
  });
}

export function useTimeOffs(dentistId?: string, status?: TimeOffStatus) {
  return useQuery({
    queryKey: scheduleKeys.timeOffs(dentistId, status),
    queryFn: () =>
      get<TimeOff[]>('/appointments/time-offs', {
        params: { ...(dentistId ? { dentistId } : {}), ...(status ? { status } : {}) },
      }),
  });
}

export function useCreateTimeOff() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateTimeOffPayload) => post<CreateTimeOffResult>('/appointments/time-offs', payload),
    onSuccess: () => invalidateCalendar(qc),
  });
}

export function useDecideTimeOff() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, action, note }: { id: string; action: 'approve' | 'reject' | 'cancel'; note?: string }) =>
      // Cancelling an approved (or running) time-off needs a reason (A1-11).
      post<CreateTimeOffResult>(
        `/appointments/time-offs/${id}/${action}`,
        action === 'cancel' ? (note ? { reason: note } : {}) : { note },
      ),
    onSuccess: () => invalidateCalendar(qc),
  });
}

/** What approving a pending time-off would touch (A1-10). */
export function useTimeOffImpact(id: string | null) {
  return useQuery({
    queryKey: ['schedule', 'time-off-impact', id],
    enabled: Boolean(id),
    queryFn: () => get<TimeOffImpactPreview>(`/appointments/time-offs/${id}/impact`),
  });
}

/** Shorten or extend a time-off (A1-11). */
export function useUpdateTimeOff() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, endAt, reason }: { id: string; endAt: string; reason: string }) =>
      patch<CreateTimeOffResult>(`/appointments/time-offs/${id}`, { endAt, reason }),
    onSuccess: () => invalidateCalendar(qc),
  });
}

/** The front desk reached (or un-marks) the patient about a calendar change. */
export function useClinicContact() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, contacted, note }: { id: string; contacted: boolean; note?: string }) =>
      post<unknown>(`/appointments/${id}/clinic-contact`, { contacted, note }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['schedule', 'impact'] }),
  });
}

/** Move several visits as clinic moves (not counted in the patient's limit). */
export function useBulkReschedule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: {
      items: Array<{ appointmentId: string; newStartsAt?: string; newDentistId?: string }>;
      reason: string;
    }) => post<BulkRescheduleResult>('/appointments/bulk-reschedule', payload),
    onSuccess: () => {
      invalidateCalendar(qc);
      qc.invalidateQueries({ queryKey: ['appointments'] });
    },
  });
}

export function useScheduleOverrides(dentistId?: string) {
  return useQuery({
    queryKey: scheduleKeys.overrides(dentistId),
    queryFn: () =>
      get<ScheduleOverride[]>('/appointments/schedule-overrides', {
        params: dentistId ? { dentistId } : undefined,
      }),
  });
}

export function useCreateScheduleOverride() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateScheduleOverridePayload) =>
      post<CreateScheduleOverrideResult>('/appointments/schedule-overrides', payload),
    onSuccess: () => invalidateCalendar(qc),
  });
}

/** Returns the bookings the weekly hours no longer allow once the override is gone. */
export function useDeleteScheduleOverride() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => del<ScheduleChangeImpact>(`/appointments/schedule-overrides/${id}`),
    onSuccess: () => invalidateCalendar(qc),
  });
}

/**
 * Open online requests in the next 60 days that can no longer be confirmed
 * as they stand (schedule change, closure, time-off…), from the booking
 * module's own check. Needs booking_request.read.
 */
export function useBookingRequestIssues(dentistId: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: scheduleKeys.requestIssues(dentistId),
    enabled,
    queryFn: async () => {
      const from = clinicToday();
      const to = new Date(new Date(from).getTime() + 60 * 86_400_000).toISOString().slice(0, 10);
      const rows = await get<PendingBookingRequest[]>('/booking-requests/pending-in-range', {
        params: { from, to, ...(dentistId ? { dentistId } : {}) },
      });
      return rows.filter((r) => r.slotIssue);
    },
  });
}

export function useScheduleImpact(dentistId?: string) {
  return useQuery({
    queryKey: scheduleKeys.impact(dentistId),
    queryFn: () =>
      get<ImpactedAppointment[]>('/appointments/schedule-impact', {
        params: dentistId ? { dentistId } : undefined,
      }),
  });
}

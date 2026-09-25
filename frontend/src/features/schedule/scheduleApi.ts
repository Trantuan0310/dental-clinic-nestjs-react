import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, type AuthEnvelope, unwrap } from '@/lib/api';
import type {
  WorkingSchedule,
  CreateWorkingSchedulePayload,
  TimeOff,
  CreateTimeOffPayload,
  CreateTimeOffResult,
  CreateScheduleOverridePayload,
  CreateScheduleOverrideResult,
  ImpactedAppointment,
  ScheduleOverride,
  TimeOffStatus,
} from '@/types/schedule';

const get = async <T>(url: string, config?: Parameters<typeof api.get>[1]) => {
  const { data } = await api.get<AuthEnvelope<T>>(url, config);
  return unwrap(data);
};

const post = async <T>(url: string, body?: unknown) => {
  const { data } = await api.post<AuthEnvelope<T>>(url, body);
  return unwrap(data);
};

export const scheduleKeys = {
  workingSchedules: (dentistId?: string) => ['schedule', 'working', dentistId ?? 'all'] as const,
  timeOffs: (dentistId?: string, status?: TimeOffStatus) =>
    ['schedule', 'time-off', dentistId ?? 'all', status ?? 'all'] as const,
  overrides: (dentistId?: string) => ['schedule', 'overrides', dentistId ?? 'all'] as const,
  impact: (dentistId?: string) => ['schedule', 'impact', dentistId ?? 'all'] as const,
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
      post<CreateTimeOffResult>(`/appointments/time-offs/${id}/${action}`, action === 'cancel' ? {} : { note }),
    onSuccess: () => invalidateCalendar(qc),
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

export function useDeleteScheduleOverride() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/appointments/schedule-overrides/${id}`);
    },
    onSuccess: () => invalidateCalendar(qc),
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

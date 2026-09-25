import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, type AuthEnvelope, unwrap } from '@/lib/api';

/** ADR-0009 phase 6 — the pre-exam dispatch queue. */

export type QueueStatus = 'WAITING' | 'CALLED' | 'SKIPPED' | 'LEFT';
export type QueuePriority = 'EMERGENCY' | 'ON_TIME' | 'LATE' | 'WALK_IN';

export interface QueueEntry {
  id: string;
  appointmentId: string;
  dentistId: string;
  dentistName: string;
  calendarColor: string | null;
  status: QueueStatus;
  priority: QueuePriority;
  /** 1-based place among WAITING patients of the dentist; null otherwise. */
  position: number | null;
  checkedInAt: string;
  waitingMinutes: number;
  emergencyReason: string | null;
  calledAt: string | null;
  callCount: number;
  skipReason: string | null;
  skipCount: number;
  transferredFromId: string | null;
  transferReason: string | null;
  appointment: {
    id: string;
    status: string;
    startAt: string;
    endAt: string;
    visitKind: 'BOOKED' | 'WALK_IN';
    chiefComplaint: string | null;
    patient: { id: string; code: string; fullName: string; primaryPhone: string | null };
    services: Array<{ serviceName: string; durationMin: number }>;
  };
}

export interface ReassignDayResult {
  moved: Array<{ appointmentId: string; startAt: string; patientName: string }>;
  failed: Array<{ appointmentId: string; startAt: string; patientName: string; reason: string }>;
}

export const PRIORITY_LABEL: Record<QueuePriority, string> = {
  EMERGENCY: 'Cấp cứu',
  ON_TIME: 'Đúng giờ',
  LATE: 'Đến trễ',
  WALK_IN: 'Vãng lai',
};

export const STATUS_LABEL: Record<QueueStatus, string> = {
  WAITING: 'Đang chờ',
  CALLED: 'Đang gọi',
  SKIPPED: 'Đã bỏ qua',
  LEFT: 'Đã về',
};

// Under the 'appointments' prefix so every appointment mutation (check-in,
// walk-in, start encounter, LEFT…) refreshes the queue too.
export const queueKeys = {
  all: ['appointments', 'queue'] as const,
  list: (params: { dentistId?: string; date?: string }) => ['appointments', 'queue', params] as const,
};

const post = async <T>(url: string, body?: unknown) => {
  const { data } = await api.post<AuthEnvelope<T>>(url, body ?? {});
  return unwrap(data);
};

export function useQueue(params: { dentistId?: string; date?: string } = {}) {
  return useQuery({
    queryKey: queueKeys.list(params),
    queryFn: async (): Promise<QueueEntry[]> => {
      const { data } = await api.get<AuthEnvelope<QueueEntry[]>>('/queue', {
        params: { dentistId: params.dentistId || undefined, date: params.date || undefined },
      });
      return unwrap(data);
    },
    refetchInterval: 20_000,
  });
}

function useQueueMutation<TVars>(fn: (vars: TVars) => Promise<unknown>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    // Transfers and reassignments move appointments, so refresh them all.
    onSuccess: () => qc.invalidateQueries({ queryKey: ['appointments'] }),
  });
}

export const useCallPatient = () => useQueueMutation((id: string) => post(`/queue/${id}/call`));

export const useSkipPatient = () =>
  useQueueMutation(({ id, reason }: { id: string; reason: string }) =>
    post(`/queue/${id}/skip`, { reason }),
  );

export const useMarkEmergency = () =>
  useQueueMutation(({ id, reason }: { id: string; reason: string }) =>
    post(`/queue/${id}/emergency`, { reason }),
  );

export const useTransferPatient = () =>
  useQueueMutation(({ id, dentistId, reason }: { id: string; dentistId: string; reason: string }) =>
    post(`/queue/${id}/transfer`, { dentistId, reason }),
  );

export function useReassignDay() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { fromDentistId: string; toDentistId: string; date: string; reason: string }) =>
      post<ReassignDayResult>('/queue/reassign-day', body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['appointments'] }),
  });
}

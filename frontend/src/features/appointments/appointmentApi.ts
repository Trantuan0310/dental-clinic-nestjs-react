import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, type AuthEnvelope, unwrap } from '@/lib/api';
import type {
  Appointment,
  AppointmentFilters,
  AppointmentListResponse,
  AvailabilitySlot,
  CalendarFetchParams,
  CancelAppointmentPayload,
  CheckInPayload,
  CreateAppointmentPayload,
  DentistAvailability,
  DentistMini,
  PatientLookupCandidate,
  PatientLookupQuery,
  PatientLookupResult,
  PatientMini,
  RescheduleAppointmentPayload,
  UpdateAppointmentPayload,
  WaitingQueueEntry,
} from '@/types/appointment';

// ---------------------------------------------------------------------------
// HTTP helpers — everything is wrapped in `AuthEnvelope<T>` so we always
// unwrap before exposing data to React Query.
// ---------------------------------------------------------------------------

const get = async <T>(url: string, config?: Parameters<typeof api.get>[1]) => {
  const { data } = await api.get<AuthEnvelope<T>>(url, config);
  return unwrap(data);
};

// Paginated list endpoints (appointments, today, waiting-queue, calendar
// range) already respond with { data: T[], pagination } as their whole
// body — that IS the shape callers want, not something to unwrap a `data`
// layer out of. Using `get()` on these silently drops `pagination` and
// leaves callers destructuring `.data`/`.pagination` off a bare array
// (both undefined -> empty list, no error).
const getList = async <T>(url: string, config?: Parameters<typeof api.get>[1]): Promise<T> => {
  const { data } = await api.get<T>(url, config);
  return data;
};

const post = async <T>(url: string, body?: unknown) => {
  const { data } = await api.post<AuthEnvelope<T>>(url, body);
  return unwrap(data);
};

const patch = async <T>(url: string, body?: unknown) => {
  const { data } = await api.patch<AuthEnvelope<T>>(url, body);
  return unwrap(data);
};

// ---------------------------------------------------------------------------
// Transform: Prisma/Backend row -> Frontend Appointment
// (Prisma uses snake_case fields, the FE uses camelCase)
// ---------------------------------------------------------------------------

export type PrismaAppointmentRow = {
  id: string;
  patientId: string;
  dentistId: string;
  startAt: Date | string;
  endAt: Date | string;
  status: string;
  reason?: string | null;
  notes?: string | null;
  chiefComplaint?: string | null;
  source?: string;
  appointmentType?: string;
  checkedInAt?: Date | string | null;
  checkedInBy?: string | null;
  cancelledAt?: Date | string | null;
  cancelledBy?: string | null;
  cancelledReason?: string | null;
  noShowAt?: Date | string | null;
  rescheduleCount?: number;
  encounterId?: string | null;
  createdAt: Date | string;
  updatedAt?: Date | string | null;
  patient?: {
    id: string;
    code?: string;
    fullName?: string;
    primaryPhone?: string | null;
  } | null;
  dentist?: { id: string; fullName?: string } | null;
  encounter?: { id: string } | null;
};

const toIso = (v: Date | string | null | undefined): string | null => {
  if (v == null) return null;
  if (typeof v === 'string') return v;
  return v.toISOString();
};

export function transformAppointment(raw: PrismaAppointmentRow): Appointment {
  const patient = raw.patient ?? { id: raw.patientId };
  const dentist = raw.dentist ?? { id: raw.dentistId };
  const startIso = toIso(raw.startAt) ?? new Date().toISOString();
  const endIso = toIso(raw.endAt) ?? new Date(startIso).toISOString();
  const startMs = new Date(startIso).getTime();
  const endMs = new Date(endIso).getTime();
  return {
    id: raw.id,
    patientId: raw.patientId,
    patientCode: patient.code ?? '',
    patientName: patient.fullName ?? '',
    patientPhone: patient.primaryPhone ?? null,
    dentistId: raw.dentistId,
    dentistName: dentist.fullName ?? '',
    startsAt: startIso,
    endsAt: endIso,
    durationMinutes: Math.round((endMs - startMs) / 60_000),
    // Backend enums (AppointmentStatus, AppointmentSource) are upper-case
    // Prisma enum members (e.g. "SCHEDULED", "CHECKED_IN") — the frontend's
    // Appointment['status']/['source'] unions, and every comparison against
    // them (STATUS_DOT maps, "can check in" checks, etc.), are lower-case.
    status: raw.status.toLowerCase() as Appointment['status'],
    reason: raw.reason ?? null,
    notes: raw.notes ?? null,
    chiefComplaint: raw.chiefComplaint ?? null,
    source: (raw.source?.toLowerCase() as Appointment['source']) ?? 'phone',
    appointmentType:
      (raw.appointmentType as Appointment['appointmentType']) ?? 'consultation',
    checkInAt: toIso(raw.checkedInAt),
    checkedInByUserId: raw.checkedInBy ?? null,
    cancelledAt: toIso(raw.cancelledAt),
    cancelledByUserId: raw.cancelledBy ?? null,
    cancellationReason: raw.cancelledReason ?? null,
    noShowAt: toIso(raw.noShowAt),
    rescheduleCount: raw.rescheduleCount ?? 0,
    encounterId: raw.encounter?.id ?? raw.encounterId ?? null,
    createdAt: toIso(raw.createdAt) ?? new Date().toISOString(),
    updatedAt: toIso(raw.updatedAt) ?? undefined,
  };
}

export function transformAppointmentList(raws: PrismaAppointmentRow[]): Appointment[] {
  return raws.map(transformAppointment);
}

// ---------------------------------------------------------------------------
// Query key registry
// ---------------------------------------------------------------------------

export const appointmentKeys = {
  all: ['appointments'] as const,
  list: (filters?: AppointmentFilters) =>
    ['appointments', 'list', filters ?? {}] as const,
  detail: (id: string) => ['appointments', 'detail', id] as const,
  availability: (dentistId: string, date: string) =>
    ['appointments', 'availability', dentistId, date] as const,
  waitingQueue: (params?: { dentistId?: string; date?: string }) =>
    ['appointments', 'waiting-queue', params ?? {}] as const,
  today: ['appointments', 'today'] as const,
  patients: ['patients', 'mini'] as const,
  dentists: ['dentists', 'mini'] as const,
  patientLookup: (q: PatientLookupQuery) =>
    ['patients', 'lookup', q] as const,
};

// ---------------------------------------------------------------------------
// Helpers — backend params
// ---------------------------------------------------------------------------

function toListParams(
  filters?: AppointmentFilters,
): Record<string, unknown> {
  if (!filters) return {};
  const out: Record<string, unknown> = {};
  if (filters.q) out.q = filters.q;
  if (filters.dentistId) out.dentistId = filters.dentistId;
  if (filters.patientId) out.patientId = filters.patientId;
  if (filters.from) out.from = filters.from;
  if (filters.to) out.to = filters.to;
  if (filters.status && filters.status !== 'all') {
    // BE `ListAppointmentsQueryDto.status` is `AppointmentStatus[]` — pipe a
    // single-element array via axios repeatable params (?status=A&status=B).
    out.status = [filters.status];
  }
  if (filters.cursor) out.cursor = filters.cursor;
  if (filters.pageSize) out.pageSize = filters.pageSize;
  return out;
}

function buildCreateBody(payload: CreateAppointmentPayload): Record<string, unknown> {
  return {
    patientId: payload.patientId,
    dentistId: payload.dentistId,
    startAt: payload.startsAt,
    endAt: payload.endsAt,
    reason: payload.reason ?? undefined,
    notes: payload.notes ?? undefined,
  };
}

function buildRescheduleBody(
  payload: RescheduleAppointmentPayload,
): Record<string, unknown> {
  return {
    newStartsAt: payload.newStartsAt,
    newEndsAt: payload.newEndsAt,
    newDentistId: payload.newDentistId ?? undefined,
    reason: payload.reason,
  };
}

// ---------------------------------------------------------------------------
// Hooks — Queries
// ---------------------------------------------------------------------------

export function useAppointments(filters?: AppointmentFilters) {
  return useQuery({
    queryKey: appointmentKeys.list(filters),
    queryFn: async (): Promise<AppointmentListResponse> => {
      const { data, pagination } = await getList<{
        data: PrismaAppointmentRow[];
        pagination?: { pageSize: number; nextCursor: string | null; hasMore: boolean };
      }>('/appointments', { params: toListParams(filters) });
      return {
        data: transformAppointmentList(data),
        pagination,
        total: data.length,
      };
    },
  });
}

export function useAppointment(id: string | undefined) {
  return useQuery({
    enabled: !!id,
    queryKey: appointmentKeys.detail(id ?? ''),
    queryFn: async (): Promise<Appointment> => {
      const row = await get<PrismaAppointmentRow>(`/appointments/${id}`);
      return transformAppointment(row);
    },
  });
}

export function useTodayAppointments() {
  return useQuery({
    queryKey: appointmentKeys.today,
    queryFn: async (): Promise<AppointmentListResponse> => {
      const { data, pagination } = await getList<{
        data: PrismaAppointmentRow[];
        pagination?: { pageSize: number; nextCursor: string | null; hasMore: boolean };
      }>('/appointments/today');
      return {
        data: transformAppointmentList(data),
        pagination,
        total: data.length,
      };
    },
    staleTime: 60_000,
  });
}

/**
 * GET /appointments/waiting-queue?dentistId&date
 * BE returns paginated `{ data: [...], pagination }` inside the auth envelope.
 * Returns CHECKED_IN appointments sorted by checkedInAt ASC (FIFO).
 */
export function useWaitingQueue(params?: { dentistId?: string; date?: string }) {
  return useQuery({
    queryKey: appointmentKeys.waitingQueue(params),
    queryFn: async (): Promise<WaitingQueueEntry[]> => {
      const { data } = await getList<{
        data: Array<{
          id: string;
          patient: { id: string; code: string; fullName: string };
          appointmentStartAt: Date | string;
          checkedInAt: Date | string;
          waitingMinutes: number;
        }>;
      }>('/appointments/waiting-queue', {
        params: {
          dentistId: params?.dentistId ?? undefined,
          date: params?.date ?? undefined,
        },
      });
      return data.map((row) => ({
        id: row.id,
        patient: row.patient,
        appointmentStartAt: toIso(row.appointmentStartAt) ?? '',
        checkedInAt: toIso(row.checkedInAt) ?? '',
        waitingMinutes: row.waitingMinutes,
      }));
    },
    refetchInterval: 60_000,
    staleTime: 30_000,
  });
}

/**
 * Calendar view — backed by GET /appointments with a date range.
 * Returned shape matches Appointment[] so consumers can render the same
 * each row regardless of view mode.
 */
export function useCalendar(params: CalendarFetchParams) {
  return useQuery({
    queryKey: appointmentKeys.list({
      from: params.from,
      to: params.to,
      dentistId: params.dentistId,
    }),
    queryFn: async (): Promise<Appointment[]> => {
      const { data } = await getList<{ data: PrismaAppointmentRow[] }>(
        '/appointments',
        {
          params: {
            from: params.from,
            to: params.to,
            dentistId: params.dentistId ?? undefined,
          },
        },
      );
      return transformAppointmentList(data);
    },
    staleTime: 30_000,
  });
}

/**
 * GET /appointments/availability?dentistId&date&slotDuration
 * The BE returns `availableSlots: string[]` (HH:mm); we expand each entry into
 * a structured AvailabilitySlot with full startTime/endTime + `available`.
 */
export function useAvailability(dentistId: string | undefined, date: string | undefined) {
  return useQuery({
    enabled: !!dentistId && !!date,
    queryKey: appointmentKeys.availability(dentistId ?? '', date ?? ''),
    queryFn: async (): Promise<DentistAvailability> => {
      const raw = await get<{
        dentistId: string;
        date: string;
        dayOfWeek: number;
        workingHours: { startTime: string; endTime: string } | null;
        slotDuration: number;
        availableSlots: string[];
        blockedReason?: string | null;
      }>('/appointments/availability', {
        params: { dentistId, date },
      });

      const slots: AvailabilitySlot[] = (raw.availableSlots ?? []).map((hhmm) => {
        const [hStr, mStr] = hhmm.split(':');
        const h = Number(hStr);
        const m = Number(mStr);
        // Build slot timestamps in UTC to match backend's UTC day grid.
        const start = new Date(`${raw.date}T00:00:00Z`);
        start.setUTCHours(h, m, 0, 0);
        const end = new Date(start.getTime() + raw.slotDuration * 60_000);
        return {
          startTime: start.toISOString(),
          endTime: end.toISOString(),
          available: true,
        };
      });

      return {
        dentistId: raw.dentistId,
        date: raw.date,
        dayOfWeek: raw.dayOfWeek,
        workingHours: raw.workingHours,
        slotDuration: raw.slotDuration,
        availableSlots: slots,
        blockedReason: raw.blockedReason ?? null,
      };
    },
    staleTime: 60_000,
  });
}

export function usePatientOptions() {
  return useQuery({
    queryKey: appointmentKeys.patients,
    queryFn: async (): Promise<PatientMini[]> => {
      // Patient lists are paginated at the top level: `{ data: [], pagination }`.
      // `get()` already unwraps that top-level `data`, so the result is the array
      // itself (not another object containing a `data` property).
      const data = await get<
        Array<{
          id: string;
          code: string;
          fullName: string;
          primaryPhone?: string | null;
        }>
      >('/patients', { params: { pageSize: 200 } });
      return data.map((p) => ({
        id: p.id,
        code: p.code,
        fullName: p.fullName,
        primaryPhone: p.primaryPhone ?? null,
      }));
    },
    staleTime: 5 * 60_000,
  });
}

export function useDentistOptions() {
  return useQuery({
    queryKey: appointmentKeys.dentists,
    queryFn: async (): Promise<DentistMini[]> => {
      // Appointment users need a small dentist lookup, not access to the
      // admin-only user-management API.
      const data = await get<Array<{ id: string; fullName: string }>>(
        '/appointments/dentists',
      );
      return data.map((dentist) => ({
        id: dentist.id,
        fullName: dentist.fullName,
        specialization: null,
      }));
    },
    staleTime: 5 * 60_000,
  });
}

/**
 * GET /patients/lookup — duplicate detection + quick search.
 * BE returns `{ candidates, total, matchType }` wrapped in the auth envelope.
 * After `unwrap()` we get `{ candidates, total, matchType }` directly.
 */
export function usePatientLookup(query: PatientLookupQuery, enabled = true) {
  return useQuery({
    enabled:
      enabled &&
      Boolean(query.phone || query.cccd || (query.name && query.dob)),
    queryKey: appointmentKeys.patientLookup(query),
    queryFn: async (): Promise<PatientLookupResult> => {
      const result = await get<{
        candidates: Array<{
          id: string;
          code: string;
          fullName: string;
          dob: Date | string;
          gender: string;
          primaryPhone: string | null;
          lastVisitAt: Date | string | null;
          lastVisitBy: string | null;
          matchType: PatientLookupCandidate['matchType'];
        }>;
        total: number;
        matchType: PatientLookupCandidate['matchType'];
      }>('/patients/lookup', {
        params: {
          phone: query.phone ?? undefined,
          cccd: query.cccd ?? undefined,
          name: query.name ?? undefined,
          dob: query.dob ?? undefined,
          limit: query.limit ?? 5,
        },
      });
      return {
        candidates: result.candidates.map((row) => ({
          id: row.id,
          code: row.code,
          fullName: row.fullName,
          dob: toIso(row.dob) ?? '',
          gender: row.gender,
          primaryPhone: row.primaryPhone,
          lastVisitAt: toIso(row.lastVisitAt),
          lastVisitBy: row.lastVisitBy,
          matchType: row.matchType,
        })),
        total: result.total,
        matchType: result.matchType,
      };
    },
    staleTime: 30_000,
  });
}

// ---------------------------------------------------------------------------
// Hooks — Mutations
// ---------------------------------------------------------------------------

export function useCreateAppointment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: CreateAppointmentPayload): Promise<Appointment> => {
      const row = await post<PrismaAppointmentRow>(
        '/appointments',
        buildCreateBody(payload),
      );
      return transformAppointment(row);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: appointmentKeys.all });
    },
  });
}

export function useUpdateAppointment(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: UpdateAppointmentPayload): Promise<Appointment> => {
      const row = await patch<PrismaAppointmentRow>(`/appointments/${id}`, payload);
      return transformAppointment(row);
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: appointmentKeys.all });
      qc.invalidateQueries({ queryKey: appointmentKeys.detail(data.id) });
    },
  });
}

export function useCancelAppointment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      payload,
    }: {
      id: string;
      payload: CancelAppointmentPayload;
    }): Promise<Appointment> => {
      const row = await post<PrismaAppointmentRow>(
        `/appointments/${id}/cancel`,
        payload,
      );
      return transformAppointment(row);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: appointmentKeys.all });
    },
  });
}

export function useCheckInAppointment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      payload,
    }: {
      id: string;
      payload?: CheckInPayload;
    }): Promise<Appointment> => {
      const body = payload ?? {};
      const row = await post<PrismaAppointmentRow>(
        `/appointments/${id}/check-in`,
        {
          override: body.override ?? false,
          overrideReason: body.overrideReason ?? undefined,
        },
      );
      return transformAppointment(row);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: appointmentKeys.all });
    },
  });
}

export function useMarkNoShow() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      reason,
    }: {
      id: string;
      reason: string;
    }): Promise<Appointment> => {
      const row = await post<PrismaAppointmentRow>(
        `/appointments/${id}/no-show`,
        { reason },
      );
      return transformAppointment(row);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: appointmentKeys.all });
    },
  });
}

export function useRescheduleAppointment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      payload,
    }: {
      id: string;
      payload: RescheduleAppointmentPayload;
    }): Promise<Appointment> => {
      const row = await patch<PrismaAppointmentRow>(
        `/appointments/${id}/reschedule`,
        buildRescheduleBody(payload),
      );
      return transformAppointment(row);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: appointmentKeys.all });
    },
  });
}

export function useStartEncounter() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string): Promise<Appointment> => {
      // Two separate backend concerns, neither complete on its own:
      // - POST /appointments/:id/start-encounter only flips the appointment
      //   to IN_PROGRESS; it does not create an Encounter row.
      // - POST /medical-records/encounters/start (get-or-create, idempotent)
      //   creates the Encounter, but requires the appointment to already be
      //   CHECKED_IN or IN_PROGRESS.
      // Call them in that order so every "start encounter" action actually
      // produces a documentable encounter instead of a dead
      // status-only transition.
      const row = await post<PrismaAppointmentRow>(
        `/appointments/${id}/start-encounter`,
      );
      const { encounterId } = await post<{ encounterId: string }>(
        '/medical-records/encounters/start',
        { appointmentId: id },
      );
      // start-encounter's own response has no `encounter` relation to derive
      // encounterId from — use the id the second call just authoritatively
      // returned instead of whatever transformAppointment guessed.
      return { ...transformAppointment(row), encounterId };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: appointmentKeys.all });
    },
  });
}

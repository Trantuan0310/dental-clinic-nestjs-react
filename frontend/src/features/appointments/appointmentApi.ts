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
  ClockInterval,
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
      (raw.appointmentType?.toLowerCase() as Appointment['appointmentType']) ?? 'consultation',
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
  patientSearch: (q: string) => ['patients', 'search', q] as const,
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
    chiefComplaint: payload.chiefComplaint ?? undefined,
    notes: payload.notes ?? undefined,
    // Backend enums are upper-case (AppointmentType / AppointmentSource).
    appointmentType: payload.appointmentType?.toUpperCase(),
    source: payload.source?.toUpperCase(),
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
        windows?: ClockInterval[];
        busy?: ClockInterval[];
        blockedReason?: string | null;
      }>('/appointments/availability', {
        params: { dentistId, date },
      });

      const slots: AvailabilitySlot[] = (raw.availableSlots ?? []).map((hhmm) => {
        const [hStr, mStr] = hhmm.split(':');
        const h = Number(hStr);
        const m = Number(mStr);
        // Build slot timestamps as real local-to-UTC instants (matching
        // isoFullLocal in AppointmentFormModal, the app's other place that
        // turns a date + "HH:mm" into an appointment timestamp) — NOT UTC.
        // The backend's "HH:mm" grid is the clinic's own wall-clock hour
        // (its combineDateAndTime helper treats it that way too); building
        // these slots in UTC instead of local made every consumer that
        // reads them with local accessors (formatTimeOnly's date-fns
        // format() in AppointmentDetailDrawer, and the .getHours() slot-
        // conflict check in AppointmentFormModal) display/compare the
        // browser-timezone-shifted hour — wrong in any non-UTC-0 browser,
        // which a Vietnam clinic (UTC+7) always is.
        const [y, mo, d] = raw.date.split('-').map(Number);
        const start = new Date(y, (mo ?? 1) - 1, d ?? 1, h, m, 0, 0);
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
        windows: raw.windows ?? [],
        busy: raw.busy ?? [],
        blockedReason: raw.blockedReason ?? null,
      };
    },
    staleTime: 60_000,
  });
}

type PatientMiniRow = {
  id: string;
  code: string;
  fullName: string;
  primaryPhone?: string | null;
};

const toPatientMini = (p: PatientMiniRow): PatientMini => ({
  id: p.id,
  code: p.code,
  fullName: p.fullName,
  primaryPhone: p.primaryPhone ?? null,
});

/**
 * Server-side patient search for the booking form (name / phone / exact
 * code, same `q` as the patient list). Replaces loading the first 200
 * patients and filtering in the browser, which could never find anyone past
 * the 200th record.
 */
export function usePatientSearch(q: string) {
  const term = q.trim();
  return useQuery({
    enabled: term.length >= 2,
    queryKey: appointmentKeys.patientSearch(term),
    queryFn: async (): Promise<PatientMini[]> => {
      // Patient lists are paginated at the top level: `{ data: [], pagination }`;
      // `get()` already unwraps that top-level `data`.
      const data = await get<PatientMiniRow[]>('/patients', {
        params: { q: term, pageSize: 20 },
      });
      return data.map(toPatientMini);
    },
    staleTime: 30_000,
  });
}

/** One patient's mini card (for a pre-selected patient in the booking form). */
export function usePatientMini(id: string | undefined) {
  return useQuery({
    enabled: !!id,
    queryKey: [...appointmentKeys.patients, id ?? ''] as const,
    queryFn: async (): Promise<PatientMini> => toPatientMini(await get<PatientMiniRow>(`/patients/${id}`)),
    // Display-only (the id is already usable) — fail fast instead of the
    // global retry policy leaving "Đang tải…" up for several seconds.
    retry: 1,
    staleTime: 5 * 60_000,
  });
}

export function useDentistOptions() {
  return useQuery({
    queryKey: appointmentKeys.dentists,
    queryFn: async (): Promise<DentistMini[]> => {
      // Appointment users need a small dentist lookup, not access to the
      // admin-only user-management API.
      const data = await get<Array<{ id: string; fullName: string; calendarColor?: string | null }>>(
        '/appointments/dentists',
      );
      return data.map((dentist) => ({
        id: dentist.id,
        fullName: dentist.fullName,
        specialization: null,
        calendarColor: dentist.calendarColor ?? null,
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
export async function fetchPatientLookup(query: PatientLookupQuery): Promise<PatientLookupResult> {
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
}

/** Query-hook form of fetchPatientLookup. */
export function usePatientLookup(query: PatientLookupQuery, enabled = true) {
  return useQuery({
    enabled:
      enabled &&
      Boolean(query.phone || query.cccd || (query.name && query.dob)),
    queryKey: appointmentKeys.patientLookup(query),
    queryFn: () => fetchPatientLookup(query),
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
      const row = await patch<PrismaAppointmentRow>(`/appointments/${id}`, {
        ...payload,
        appointmentType: payload.appointmentType?.toUpperCase(),
      });
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

/** POST /appointments/:id/confirm — scheduled → confirmed (patient confirmed they'll come). */
export function useConfirmAppointment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string): Promise<Appointment> => {
      const row = await post<PrismaAppointmentRow>(`/appointments/${id}/confirm`, {});
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
      const row = await post<PrismaAppointmentRow>(
        `/appointments/${id}/start-encounter`,
      );
      return transformAppointment(row);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: appointmentKeys.all });
    },
  });
}

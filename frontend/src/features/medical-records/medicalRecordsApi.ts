import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, type AuthEnvelope, unwrap } from '@/lib/api';
import { getApiErrorMessage } from '@/lib/errors';
import { notify } from '@/components/ui/Toast';
import type {
  ClinicalNote,
  ClinicalNoteAddendum,
  CreateTreatmentPayload,
  DentalChartPutPayload,
  DentalChartSnapshot,
  Encounter,
  EncounterClosePayload,
  EncounterCloseResult,
  EncounterListItem,
  Prescription,
  TreatmentLine,
  UpdateTreatmentPayload,
} from '@/types/medical-records';

const get = async <T>(url: string, config?: Parameters<typeof api.get>[1]) => {
  const { data } = await api.get<AuthEnvelope<T>>(url, config);
  return unwrap(data);
};
const post = async <T>(
  url: string,
  body?: unknown,
  config?: Parameters<typeof api.post>[2],
) => {
  const { data } = await api.post<AuthEnvelope<T>>(url, body, config);
  return unwrap(data);
};
const put = async <T>(
  url: string,
  body?: unknown,
  config?: Parameters<typeof api.put>[2],
) => {
  const { data } = await api.put<AuthEnvelope<T>>(url, body, config);
  return unwrap(data);
};
const patch = async <T>(
  url: string,
  body?: unknown,
  config?: Parameters<typeof api.patch>[2],
) => {
  const { data } = await api.patch<AuthEnvelope<T>>(url, body, config);
  return unwrap(data);
};
const del = async (url: string) => {
  await api.delete(url);
};

const MR_BASE = '/medical-records';

export const mrKeys = {
  all: ['medical-records'] as const,
  list: (filters?: Record<string, unknown>) => ['medical-records', 'list', filters ?? {}] as const,
  detail: (id: string) => ['medical-records', 'detail', id] as const,
  note: (id: string) => ['medical-records', 'note', id] as const,
  treatments: (id: string) => ['medical-records', 'treatments', id] as const,
  prescriptions: (id: string) => ['medical-records', 'prescriptions', id] as const,
  dentalChart: (id: string) => ['medical-records', 'dental-chart', id] as const,
  addendums: (id: string) => ['medical-records', 'addendums', id] as const,
};

// ----- Encounter list / detail -----

export function useEncounterList(filters?: { dentistId?: string; patientId?: string; status?: string; from?: string; to?: string; pageSize?: number }) {
  return useQuery({
    queryKey: mrKeys.list(filters),
    queryFn: () => get<EncounterListItem[]>(`${MR_BASE}/encounters`, { params: filters }),
  });
}

export function useEncounter(id: string | undefined) {
  return useQuery({
    enabled: !!id,
    queryKey: mrKeys.detail(id ?? ''),
    queryFn: () => get<Encounter>(`${MR_BASE}/encounters/${id}`),
  });
}

// Encounters are created via useStartEncounter (features/appointments/appointmentApi.ts,
// POST /appointments/:id/start-encounter) and have no separate freeform-create
// or partial-update route — chiefComplaint/diagnosis are recorded as clinical
// notes instead (see useUpsertClinicalNote below).

export function useCloseEncounter(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: EncounterClosePayload) => post<EncounterCloseResult>(`${MR_BASE}/encounters/${id}/close`, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: mrKeys.detail(id) });
      qc.invalidateQueries({ queryKey: mrKeys.list() });
      qc.invalidateQueries({ queryKey: mrKeys.all });
    },
  });
}

export function useCancelEncounter(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: { reason: string }) => post<Encounter>(`${MR_BASE}/encounters/${id}/cancel`, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: mrKeys.detail(id) });
      qc.invalidateQueries({ queryKey: mrKeys.list() });
    },
  });
}

// ----- Clinical note -----

export function useUpsertClinicalNote(encounterId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: Pick<ClinicalNote, 'subjective' | 'objective' | 'assessment' | 'plan' | 'rawNotes'>) =>
      put<ClinicalNote>(`${MR_BASE}/encounters/${encounterId}/clinical-note`, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: mrKeys.detail(encounterId) });
      qc.invalidateQueries({ queryKey: mrKeys.note(encounterId) });
    },
  });
}

export function useAddendums(encounterId: string) {
  return useQuery({
    enabled: !!encounterId,
    queryKey: mrKeys.addendums(encounterId),
    queryFn: () => get<ClinicalNoteAddendum[]>(`${MR_BASE}/encounters/${encounterId}/clinical-note/addendums`),
  });
}

export function useCreateAddendum(encounterId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: { text: string; reason?: string; idempotencyKey: string }) =>
      post<ClinicalNoteAddendum>(`${MR_BASE}/encounters/${encounterId}/clinical-note/addendums`, payload, {
        headers: { 'Idempotency-Key': payload.idempotencyKey },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: mrKeys.addendums(encounterId) });
    },
  });
}

// ----- Treatments -----

function snapshotEncounter(
  qc: ReturnType<typeof useQueryClient>,
  encounterId: string,
): Encounter | undefined {
  return qc.getQueryData<Encounter>(mrKeys.detail(encounterId));
}

function patchEncounter(
  qc: ReturnType<typeof useQueryClient>,
  encounterId: string,
  patcher: (prev: Encounter | undefined) => Encounter | undefined,
): Encounter | undefined {
  const prev = snapshotEncounter(qc, encounterId);
  if (!prev) return undefined;
  const next = patcher(prev);
  qc.setQueryData(mrKeys.detail(encounterId), next);
  return prev;
}

function optimisticLineTotal(
  payload: { priceCents?: number; quantity?: number } | undefined,
  fallbackPrice: number,
  fallbackQuantity: number,
): number {
  if (!payload) return 0;
  const price = payload.priceCents ?? fallbackPrice;
  const qty = payload.quantity ?? fallbackQuantity;
  return price * qty;
}

export function useAddTreatment(encounterId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: Omit<CreateTreatmentPayload, 'encounterId'>) =>
      post<TreatmentLine>(`${MR_BASE}/encounters/${encounterId}/treatments`, payload),
    onMutate: async (payload) => {
      await qc.cancelQueries({ queryKey: mrKeys.detail(encounterId) });
      const previous = snapshotEncounter(qc, encounterId);
      const tempId = `temp_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
      const lineTotal = (payload.priceCents ?? 0) * (payload.quantity ?? 1);
      const optimistic: TreatmentLine = {
        id: tempId,
        encounterId,
        toothNumber: payload.toothNumber,
        treatmentCode: payload.treatmentCode,
        treatmentName: payload.treatmentCode,
        description: payload.description ?? null,
        priceCents: payload.priceCents ?? 0,
        quantity: payload.quantity ?? 1,
        lineTotalCents: lineTotal,
        inventoryItemsUsed: payload.inventoryItemsUsed ?? [],
        createdAt: new Date().toISOString(),
      };
      patchEncounter(qc, encounterId, (prev) =>
        prev ? { ...prev, treatments: [...(prev.treatments ?? []), optimistic] } : prev,
      );
      return { previous };
    },
    onError: (err, _payload, context) => {
      const ctx = context as { previous?: Encounter } | undefined;
      if (ctx?.previous) {
        qc.setQueryData(mrKeys.detail(encounterId), ctx.previous);
      }
      notify.error(getApiErrorMessage(err, 'Không thể thêm điều trị'));
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: mrKeys.detail(encounterId) });
      qc.invalidateQueries({ queryKey: mrKeys.treatments(encounterId) });
    },
  });
}

export function useUpdateTreatment(encounterId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: UpdateTreatmentPayload }) =>
      patch<TreatmentLine>(`${MR_BASE}/encounters/${encounterId}/treatments/${id}`, payload),
    onMutate: async ({ id, payload }) => {
      await qc.cancelQueries({ queryKey: mrKeys.detail(encounterId) });
      const previous = snapshotEncounter(qc, encounterId);
      patchEncounter(qc, encounterId, (prev) => {
        if (!prev) return prev;
        const lines = (prev.treatments ?? []).map((l) => {
          if (l.id !== id) return l;
          const merged = { ...l, ...payload };
          return {
            ...merged,
            lineTotalCents: optimisticLineTotal(
              payload,
              merged.priceCents ?? 0,
              merged.quantity ?? 1,
            ),
          };
        });
        return { ...prev, treatments: lines };
      });
      return { previous };
    },
    onError: (err, _vars, context) => {
      const ctx = context as { previous?: Encounter } | undefined;
      if (ctx?.previous) {
        qc.setQueryData(mrKeys.detail(encounterId), ctx.previous);
      }
      notify.error(getApiErrorMessage(err, 'Không thể cập nhật điều trị'));
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: mrKeys.detail(encounterId) });
      qc.invalidateQueries({ queryKey: mrKeys.treatments(encounterId) });
    },
  });
}

export function useDeleteTreatment(encounterId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, idempotencyKey }: { id: string; idempotencyKey: string }) => {
      await del(`${MR_BASE}/encounters/${encounterId}/treatments/${id}`);
      return idempotencyKey;
    },
    onMutate: async ({ id }) => {
      await qc.cancelQueries({ queryKey: mrKeys.detail(encounterId) });
      const previous = snapshotEncounter(qc, encounterId);
      patchEncounter(qc, encounterId, (prev) =>
        prev ? { ...prev, treatments: (prev.treatments ?? []).filter((l) => l.id !== id) } : prev,
      );
      return { previous };
    },
    onError: (err, _vars, context) => {
      const ctx = context as { previous?: Encounter } | undefined;
      if (ctx?.previous) {
        qc.setQueryData(mrKeys.detail(encounterId), ctx.previous);
      }
      notify.error(getApiErrorMessage(err, 'Không thể xóa điều trị'));
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: mrKeys.detail(encounterId) });
      qc.invalidateQueries({ queryKey: mrKeys.treatments(encounterId) });
    },
  });
}

// ----- Prescriptions -----

export function useCreatePrescription(encounterId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: { note?: string; lines: Prescription['lines']; idempotencyKey: string }) =>
      post<Prescription>(`${MR_BASE}/encounters/${encounterId}/prescription`, payload, {
        headers: { 'Idempotency-Key': payload.idempotencyKey },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: mrKeys.detail(encounterId) });
      qc.invalidateQueries({ queryKey: mrKeys.prescriptions(encounterId) });
    },
  });
}

export function useUpdatePrescription(_encounterId: string) {
  const qc = useQueryClient();
  return useMutation({
    // PATCH /medical-records/prescriptions/:id — partial update of header
    // fields. Lines cannot be edited here; callers re-issue via POST.
    mutationFn: ({ id, payload }: { id: string; payload: { note?: string; diagnosis?: string | null; instructions?: string | null; followUpNote?: string | null; idempotencyKey: string } }) =>
      patch<Prescription>(`${MR_BASE}/prescriptions/${id}`, payload, {
        headers: { 'Idempotency-Key': payload.idempotencyKey },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: mrKeys.all });
    },
  });
}

export function useDeletePrescription(_encounterId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (prescriptionId: string): Promise<void> => {
      await del(`${MR_BASE}/prescriptions/${prescriptionId}`);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: mrKeys.all });
    },
  });
}

// ----- Dental chart -----

export function useDentalChart(patientId: string) {
  return useQuery({
    enabled: !!patientId,
    queryKey: mrKeys.dentalChart(patientId),
    queryFn: () => get<DentalChartSnapshot>(`${MR_BASE}/patients/${patientId}/dental-chart/latest`),
  });
}

export interface SaveDentalChartVariables {
  payload: DentalChartPutPayload;
}

export function useSaveDentalChart(encounterId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ payload }: SaveDentalChartVariables) =>
      post<DentalChartSnapshot>(`${MR_BASE}/encounters/${encounterId}/dental-chart/snapshot`, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: mrKeys.dentalChart(encounterId) });
      qc.invalidateQueries({ queryKey: mrKeys.detail(encounterId) });
    },
  });
}

// ----- Patient appointment queue (cross-module lookup used by Today/MyQueue) -----

export interface AppointmentListItem {
  id: string;
  patientId: string;
  patientCode: string;
  patientName: string;
  dentistId: string;
  dentistName: string;
  startAt: string;
  endAt: string;
  status: 'scheduled' | 'confirmed' | 'checked_in' | 'in_progress' | 'completed' | 'cancelled' | 'no_show';
  reason?: string | null;
  checkInAt?: string | null;
  hasAllergyWarning?: boolean;
}

export function useAppointmentList(filters?: { dentistId?: string; date?: string; status?: string; pageSize?: number }) {
  return useQuery({
    queryKey: ['appointments', 'list', filters ?? {}],
    queryFn: () => get<AppointmentListItem[]>('/appointments', { params: filters }),
  });
}

// ----- Patient encounters (cross-module helper from patients page) -----

export function usePatientEncounters(patientId: string | undefined) {
  return useQuery({
    enabled: !!patientId,
    queryKey: ['patients', patientId, 'encounters'],
    queryFn: () => get<EncounterListItem[]>(`/patients/${patientId}/encounters`),
  });
}

// Starting an encounter from an appointment is useStartEncounter
// (features/appointments/appointmentApi.ts, POST /appointments/:id/start-encounter),
// not a route on this module.

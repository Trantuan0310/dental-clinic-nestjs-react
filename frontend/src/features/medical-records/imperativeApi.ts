// Imperative (non-hook) Medical Records API methods. The hook-based
// equivalents (useEncounterList, useCloseEncounter, etc.) live in
// `medicalRecordsApi.ts`. This file exposes the bare HTTP methods so
// forms and dialogs can call them imperatively from mutationFn.

import { api, unwrap } from '@/lib/api';
import type {
  Encounter,
  EncounterSummary,
  Treatment,
  Prescription,
  ClinicalNote,
  DentalChart,
  CreatePrescriptionPayload,
  CreateTreatmentPayload,
  UpdateDentalChartPayload,
  UpdatePrescriptionPayload,
} from '@/types/medical-records';

const BASE = '/medical-records';

// Raw Prisma `Treatment` row shape (see backend medical-records.service.ts /
// prisma/schema.prisma) — column names differ from the frontend's Treatment
// type (procedure vs treatmentName, unitPrice vs priceCents, toothNumbers[]
// vs toothNumber).
interface PrismaTreatmentRow {
  id: string;
  encounterId: string;
  toothNumbers?: unknown[] | null;
  procedure: string;
  description?: string | null;
  unitPrice: number | string;
  createdAt: string;
}

function toCreateTreatmentBody(payload: CreateTreatmentPayload) {
  return {
    procedure: payload.treatmentName || payload.treatmentCode || '',
    description: payload.description ?? payload.notes,
    unitPrice: payload.priceCents,
    toothNumbers:
      payload.toothNumber !== undefined && payload.toothNumber !== ''
        ? [Number(payload.toothNumber)]
        : undefined,
  };
}

function toUpdateTreatmentBody(payload: Partial<CreateTreatmentPayload>) {
  return {
    ...(payload.treatmentName !== undefined && { procedure: payload.treatmentName }),
    ...((payload.description !== undefined || payload.notes !== undefined) && {
      description: payload.description ?? payload.notes,
    }),
    ...(payload.priceCents !== undefined && { unitPrice: payload.priceCents }),
  };
}

function transformTreatment(raw: PrismaTreatmentRow): Treatment {
  const toothNumbers = Array.isArray(raw.toothNumbers) ? raw.toothNumbers : [];
  const unitPrice = Number(raw.unitPrice);
  return {
    id: raw.id,
    encounterId: raw.encounterId,
    toothNumber: (toothNumbers[0] as number | string) ?? '',
    treatmentCode: '',
    treatmentName: raw.procedure,
    procedureName: raw.procedure,
    description: raw.description,
    notes: raw.description,
    priceCents: unitPrice,
    unitPrice,
    quantity: 1,
    lineTotalCents: unitPrice,
    total: unitPrice,
    createdAt: raw.createdAt,
  };
}

export const medicalRecordsApi = {
  // Encounters
  async listEncounters(params?: {
    patientId?: string;
    dentistId?: string;
    from?: string;
    to?: string;
    page?: number;
    pageSize?: number;
  }): Promise<{ data: EncounterSummary[]; total: number }> {
    const { data } = await api.get<{ data: EncounterSummary[]; total: number }>(`${BASE}/encounters`, { params });
    return data;
  },

  async getEncounter(id: string): Promise<Encounter> {
    const { data } = await api.get<{ data: Encounter }>(`${BASE}/encounters/${id}`);
    return unwrap(data);
  },

  // Encounters are created via the appointment "start encounter" action
  // (POST /appointments/:id/start-encounter), not a route on this module —
  // see useStartEncounter in features/appointments/appointmentApi.ts.

  async closeEncounter(id: string, summary: string): Promise<Encounter> {
    const { data } = await api.post<{ data: Encounter }>(`${BASE}/encounters/${id}/close`, { summary });
    return unwrap(data);
  },

  async cancelEncounter(id: string, reason: string): Promise<Encounter> {
    const { data } = await api.post<{ data: Encounter }>(`${BASE}/encounters/${id}/cancel`, { reason });
    return unwrap(data);
  },

  // Clinical note — single upsert per encounter (PUT /encounters/:id/clinical-note).
  async upsertClinicalNote(
    encounterId: string,
    payload: { chiefComplaint?: string; diagnosis?: string; treatmentPlan?: string; notes?: string },
  ): Promise<ClinicalNote> {
    const { data } = await api.put<{ data: ClinicalNote }>(
      `${BASE}/encounters/${encounterId}/clinical-note`,
      payload,
    );
    return unwrap(data);
  },

  // Addendums are appended on top of the locked clinical note.
  async createAddendum(encounterId: string, payload: { content: string; reason?: string }): Promise<ClinicalNote> {
    const { data } = await api.post<{ data: ClinicalNote }>(
      `${BASE}/encounters/${encounterId}/clinical-note/addendums`,
      payload,
    );
    return unwrap(data);
  },

  // Treatments — the backend DTO uses column names (procedure/unitPrice/
  // toothNumbers) that don't match the form's field names, so requests and
  // responses are translated here rather than sent/read as-is.
  async createTreatment(payload: CreateTreatmentPayload): Promise<Treatment> {
    const { data } = await api.post<{ data: PrismaTreatmentRow }>(
      `${BASE}/encounters/${payload.encounterId}/treatments`,
      toCreateTreatmentBody(payload),
    );
    return transformTreatment(unwrap(data));
  },

  async updateTreatment(
    encounterId: string,
    treatmentId: string,
    payload: Partial<CreateTreatmentPayload>,
  ): Promise<Treatment> {
    const { data } = await api.patch<{ data: PrismaTreatmentRow }>(
      `${BASE}/encounters/${encounterId}/treatments/${treatmentId}`,
      toUpdateTreatmentBody(payload),
    );
    return transformTreatment(unwrap(data));
  },

  async deleteTreatment(encounterId: string, treatmentId: string): Promise<void> {
    await api.delete(`${BASE}/encounters/${encounterId}/treatments/${treatmentId}`);
  },

  // Prescriptions — one prescription per encounter (POST /encounters/:id/prescription).
  // The FE sends all four patient-facing context fields so the printed sheet
  // contains diagnosis, general instructions, follow-up note and a free-form
  // note. The legacy `note` alias is forwarded for older callers.
  async upsertPrescription(payload: CreatePrescriptionPayload): Promise<Prescription> {
    const body = {
      diagnosis: payload.diagnosis,
      instructions: payload.instructions,
      followUpNote: payload.followUpNote,
      notes: payload.note ?? payload.notes,
      lines: payload.items,
    };
    const { data } = await api.post<{ data: Prescription }>(
      `${BASE}/encounters/${payload.encounterId}/prescription`,
      body,
    );
    return unwrap(data);
  },

  // Partial update of header-level fields (diagnosis, instructions,
  // followUpNote, notes). Lines are NOT editable here — re-issue via POST.
  async updatePrescription(
    prescriptionId: string,
    payload: UpdatePrescriptionPayload,
  ): Promise<Prescription> {
    const { data } = await api.patch<{ data: Prescription }>(
      `${BASE}/prescriptions/${prescriptionId}`,
      payload,
    );
    return unwrap(data);
  },

  // Soft-delete a prescription (BR-MR-006). Encounter is preserved.
  async deletePrescription(prescriptionId: string): Promise<void> {
    await api.delete(`${BASE}/prescriptions/${prescriptionId}`);
  },

  // Dental chart — latest snapshot is fetched per patient, snapshots are written per encounter.
  async getLatestDentalChart(patientId: string): Promise<DentalChart> {
    const { data } = await api.get<{ data: DentalChart }>(
      `${BASE}/patients/${patientId}/dental-chart/latest`,
    );
    return unwrap(data);
  },

  async snapshotDentalChart(payload: UpdateDentalChartPayload): Promise<DentalChart> {
    const { data } = await api.post<{ data: DentalChart }>(
      `${BASE}/encounters/${payload.encounterId}/dental-chart/snapshot`,
      { teeth: payload.teeth },
    );
    return unwrap(data);
  },
};
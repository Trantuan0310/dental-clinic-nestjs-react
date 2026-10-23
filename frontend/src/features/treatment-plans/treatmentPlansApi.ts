// Treatment plans (kế hoạch điều trị nhiều buổi) — /treatment-plans.
// A dentist lists the procedures a course of treatment needs with the quoted
// price; the plan is shown to the patient (PROPOSED), agreed (ACCEPTED) and
// each line is ticked off when the encounter that did it is closed.

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, type AuthEnvelope, unwrap } from '@/lib/api';

export type TreatmentPlanStatus =
  | 'DRAFT'
  | 'PROPOSED'
  | 'ACCEPTED'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'CANCELLED';
export type TreatmentPlanItemStatus = 'PLANNED' | 'DONE' | 'SKIPPED';

export interface TreatmentPlanItem {
  id: string;
  sequence: number;
  serviceId: string | null;
  service: { id: string; code: string; name: string } | null;
  procedure: string;
  toothNumbers: number[];
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  notes: string | null;
  status: TreatmentPlanItemStatus;
  doneAt: string | null;
  skipReason: string | null;
  /** Being carried out in an encounter that is still open. */
  inEncounterId: string | null;
  doneInEncounterId: string | null;
}

export interface TreatmentPlan {
  id: string;
  patient: { id: string; code: string; fullName: string };
  dentist: { id: string; fullName: string };
  title: string;
  notes: string | null;
  status: TreatmentPlanStatus;
  sourceEncounterId: string | null;
  proposedAt: string | null;
  acceptedAt: string | null;
  acceptedBy: { id: string; fullName: string } | null;
  acceptanceNote: string | null;
  completedAt: string | null;
  cancelledAt: string | null;
  cancelReason: string | null;
  createdAt: string;
  updatedAt: string;
  items: TreatmentPlanItem[];
  totals: {
    quoted: number;
    done: number;
    remaining: number;
    skipped: number;
    itemsDone: number;
    itemsTotal: number;
  };
}

/** A line of an agreed plan that a procedure in an encounter may carry out. */
export interface OpenPlanItem {
  id: string;
  planId: string;
  planTitle: string;
  serviceId: string | null;
  service: { id: string; code: string; name: string } | null;
  procedure: string;
  toothNumbers: number[];
  quantity: number;
  unitPrice: number;
  notes: string | null;
}

export interface PlanItemInput {
  serviceId?: string;
  procedure: string;
  toothNumbers?: number[];
  quantity?: number;
  unitPrice: number;
  notes?: string;
}

export interface CreatePlanInput {
  patientId: string;
  dentistId?: string;
  title: string;
  notes?: string;
  sourceEncounterId?: string;
  items: PlanItemInput[];
}

export interface UpdatePlanInput {
  title?: string;
  notes?: string;
  dentistId?: string;
  items?: PlanItemInput[];
  expectedUpdatedAt: string;
}

export const planKeys = {
  all: ['treatment-plans'] as const,
  patient: (patientId: string) => ['treatment-plans', 'patient', patientId] as const,
  openItems: (patientId: string) => ['treatment-plans', 'open-items', patientId] as const,
  detail: (id: string) => ['treatment-plans', 'detail', id] as const,
};

const BASE = '/treatment-plans';

export const treatmentPlansApi = {
  async listForPatient(patientId: string): Promise<TreatmentPlan[]> {
    const { data } = await api.get<AuthEnvelope<TreatmentPlan[]>>(BASE, { params: { patientId } });
    return unwrap(data);
  },
  async openItems(patientId: string): Promise<OpenPlanItem[]> {
    const { data } = await api.get<AuthEnvelope<OpenPlanItem[]>>(`${BASE}/open-items`, {
      params: { patientId },
    });
    return unwrap(data);
  },
  async get(id: string): Promise<TreatmentPlan> {
    const { data } = await api.get<AuthEnvelope<TreatmentPlan>>(`${BASE}/${id}`);
    return unwrap(data);
  },
  async create(input: CreatePlanInput): Promise<TreatmentPlan> {
    const { data } = await api.post<AuthEnvelope<TreatmentPlan>>(BASE, input);
    return unwrap(data);
  },
  async update(id: string, input: UpdatePlanInput): Promise<TreatmentPlan> {
    const { data } = await api.patch<AuthEnvelope<TreatmentPlan>>(`${BASE}/${id}`, input);
    return unwrap(data);
  },
  async propose(id: string): Promise<TreatmentPlan> {
    const { data } = await api.post<AuthEnvelope<TreatmentPlan>>(`${BASE}/${id}/propose`);
    return unwrap(data);
  },
  async accept(id: string, note?: string): Promise<TreatmentPlan> {
    const { data } = await api.post<AuthEnvelope<TreatmentPlan>>(`${BASE}/${id}/accept`, {
      ...(note?.trim() && { note: note.trim() }),
    });
    return unwrap(data);
  },
  async cancel(id: string, reason: string): Promise<TreatmentPlan> {
    const { data } = await api.post<AuthEnvelope<TreatmentPlan>>(`${BASE}/${id}/cancel`, { reason });
    return unwrap(data);
  },
  async addItems(id: string, items: PlanItemInput[]): Promise<TreatmentPlan> {
    const { data } = await api.post<AuthEnvelope<TreatmentPlan>>(`${BASE}/${id}/items`, { items });
    return unwrap(data);
  },
  async skipItem(id: string, itemId: string, reason: string): Promise<TreatmentPlan> {
    const { data } = await api.post<AuthEnvelope<TreatmentPlan>>(
      `${BASE}/${id}/items/${itemId}/skip`,
      { reason },
    );
    return unwrap(data);
  },
  async unskipItem(id: string, itemId: string): Promise<TreatmentPlan> {
    const { data } = await api.post<AuthEnvelope<TreatmentPlan>>(
      `${BASE}/${id}/items/${itemId}/unskip`,
    );
    return unwrap(data);
  },
};

export function usePatientPlans(patientId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: planKeys.patient(patientId ?? ''),
    queryFn: () => treatmentPlansApi.listForPatient(patientId!),
    enabled: !!patientId && enabled,
  });
}

export function useOpenPlanItems(patientId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: planKeys.openItems(patientId ?? ''),
    queryFn: () => treatmentPlansApi.openItems(patientId!),
    enabled: !!patientId && enabled,
  });
}

export function useTreatmentPlan(id: string | undefined) {
  return useQuery({
    queryKey: planKeys.detail(id ?? ''),
    queryFn: () => treatmentPlansApi.get(id!),
    enabled: !!id,
  });
}

/** Any plan change: refresh the plan, the patient's list and the pickable lines. */
export function usePlanMutation<TVars>(mutationFn: (vars: TVars) => Promise<TreatmentPlan>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: (plan) => {
      queryClient.setQueryData(planKeys.detail(plan.id), plan);
    },
    // A refused change (stale copy, state moved on) must show the plan as
    // it now is, not the copy the user was looking at.
    onSettled: () => queryClient.invalidateQueries({ queryKey: planKeys.all }),
  });
}

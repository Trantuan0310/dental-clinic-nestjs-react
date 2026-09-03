import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, type AuthEnvelope, unwrap } from '@/lib/api';
import type {
  PayrollConfig,
  UpdatePayrollConfigPayload,
  DentistCompensation,
  CreateCompensationPayload,
  UpdateCompensationPayload,
  PayrollPeriod,
  PayrollPeriodDetail,
  CreatePayrollPeriodPayload,
  PayrollHistoryItem,
  Payslip,
  PayrollLineItem,
  ShiftRegistration,
  CreateShiftRegistrationPayload,
  RejectShiftPayload,
  NoShowDetectionItem,
  NoShowDetectionPayload,
} from '@/types/payroll';

export const payrollKeys = {
  config: ['payroll', 'config'] as const,
  compensations: (filters?: Record<string, unknown>) => ['payroll', 'compensations', filters ?? {}] as const,
  periods: (filters?: Record<string, unknown>) => ['payroll', 'periods', filters ?? {}] as const,
  period: (id: string) => ['payroll', 'period', id] as const,
  myHistory: ['payroll', 'me', 'history'] as const,
  myPayslip: (periodId: string) => ['payroll', 'me', 'payslip', periodId] as const,
  myCompensation: ['payroll', 'me', 'compensation'] as const,
  myPreview: ['payroll', 'me', 'preview'] as const,
};

export const shiftKeys = {
  list: (filters?: Record<string, unknown>) => ['shifts', 'list', filters ?? {}] as const,
};

const get = async <T>(url: string, config?: Parameters<typeof api.get>[1]) => {
  const { data } = await api.get<AuthEnvelope<T>>(url, config);
  return unwrap(data);
};

const post = async <T>(url: string, body?: unknown) => {
  const { data } = await api.post<AuthEnvelope<T>>(url, body);
  return unwrap(data);
};

const put = async <T>(url: string, body?: unknown) => {
  const { data } = await api.put<AuthEnvelope<T>>(url, body);
  return unwrap(data);
};

const patch = async <T>(url: string, body?: unknown) => {
  const { data } = await api.patch<AuthEnvelope<T>>(url, body);
  return unwrap(data);
};

// Config
export function usePayrollConfig() {
  return useQuery({
    queryKey: payrollKeys.config,
    queryFn: () => get<PayrollConfig>('/payroll/config'),
  });
}

export function useUpdatePayrollConfig() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: UpdatePayrollConfigPayload) => put<PayrollConfig>('/payroll/config', payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: payrollKeys.config });
    },
  });
}

// Compensations — the backend DTO/columns are baseSalaryVnd/commissionPct
// (0-1 fraction)/overtimeHourlyVnd, not this file's baseSalary/
// commissionPercentage (0-100)/overtimeHourlyRate, so both directions are
// translated here.
interface PrismaCompensationRow {
  id: string;
  dentistId: string;
  dentistName?: string;
  baseSalaryVnd: number | string;
  commissionPct: number | string;
  overtimeHourlyVnd: number | string;
  effectiveFrom: string;
  effectiveTo: string | null;
  notes?: string | null;
  createdAt: string;
}

function mapCompensation(raw: PrismaCompensationRow): DentistCompensation {
  return {
    id: raw.id,
    dentistId: raw.dentistId,
    dentistName: raw.dentistName ?? '',
    baseSalary: Number(raw.baseSalaryVnd),
    commissionPercentage: Number(raw.commissionPct) * 100,
    overtimeHourlyRate: Number(raw.overtimeHourlyVnd),
    effectiveFrom: raw.effectiveFrom,
    effectiveTo: raw.effectiveTo,
    notes: raw.notes,
    createdAt: raw.createdAt,
  };
}

function toCompensationBody(payload: CreateCompensationPayload | UpdateCompensationPayload) {
  return {
    ...(payload.dentistId !== undefined && { dentistId: payload.dentistId }),
    ...(payload.effectiveFrom !== undefined && { effectiveFrom: payload.effectiveFrom }),
    ...(payload.effectiveTo !== undefined && { effectiveTo: payload.effectiveTo }),
    ...(payload.baseSalary !== undefined && { baseSalaryVnd: payload.baseSalary }),
    ...(payload.commissionPercentage !== undefined && {
      commissionPct: payload.commissionPercentage / 100,
    }),
    ...(payload.overtimeHourlyRate !== undefined && { overtimeHourlyVnd: payload.overtimeHourlyRate }),
    ...(payload.notes !== undefined && { notes: payload.notes }),
  };
}

export function useCompensations(filters?: { dentistId?: string; activeOn?: string }) {
  return useQuery({
    queryKey: payrollKeys.compensations(filters),
    queryFn: () =>
      get<PrismaCompensationRow[]>('/payroll/compensations', {
        params: filters,
      }).then((rows) => rows.map(mapCompensation)),
  });
}

export function useCreateCompensation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateCompensationPayload) =>
      post<PrismaCompensationRow>('/payroll/compensations', toCompensationBody(payload)).then(
        mapCompensation,
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['payroll', 'compensations'] }),
  });
}

export function useUpdateCompensation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: UpdateCompensationPayload }) =>
      patch<PrismaCompensationRow>(`/payroll/compensations/${id}`, toCompensationBody(payload)).then(
        mapCompensation,
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['payroll', 'compensations'] }),
  });
}

export function useDeleteCompensation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/payroll/compensations/${id}`);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['payroll', 'compensations'] }),
  });
}

// Periods
export function usePeriods(filters?: { status?: string; year?: number }) {
  return useQuery({
    queryKey: payrollKeys.periods(filters),
    queryFn: () => get<PayrollPeriod[]>('/payroll/periods', { params: filters }),
  });
}

/**
 * Raw API shape for a period's line items nests the dentist relation
 * (`{ dentist: { fullName } }`) instead of a flat `dentistName` — flatten it
 * here so components can use `lineItem.dentistName` directly.
 */
function mapPeriodDetail(
  raw: Omit<PayrollPeriodDetail, 'lineItems'> & {
    lineItems: (PayrollLineItem & { dentist?: { fullName: string } })[];
  },
): PayrollPeriodDetail {
  return {
    ...raw,
    lineItems: raw.lineItems.map((li) => ({
      ...li,
      dentistName: li.dentist?.fullName ?? li.dentistName ?? '—',
    })),
  };
}

export function usePeriodDetail(id: string | undefined) {
  return useQuery({
    enabled: !!id,
    queryKey: payrollKeys.period(id ?? ''),
    queryFn: () => get<PayrollPeriodDetail>(`/payroll/periods/${id}`).then(mapPeriodDetail),
  });
}

export function useCreatePeriod() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreatePayrollPeriodPayload) =>
      post<PayrollPeriod>('/payroll/periods', payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['payroll', 'periods'] }),
  });
}

export function useComputePeriod() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      post<PayrollPeriodDetail>(`/payroll/periods/${id}/compute`).then(mapPeriodDetail),
    // The compute endpoint's response is `{ periodId, lineItems }`, not a
    // full period (no `.id`), so `data.id` was always undefined here and
    // invalidated a query key nothing was subscribed to — the period
    // detail page silently kept showing pre-compute (zeroed) data until
    // the user navigated away and back. Invalidate by the id the caller
    // passed in instead, which is always correct.
    onSuccess: (_data, id) => {
      qc.invalidateQueries({ queryKey: payrollKeys.period(id) });
      qc.invalidateQueries({ queryKey: ['payroll', 'periods'] });
    },
  });
}

export function useAddAdjustment(periodId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: {
      lineItemId: string;
      type: 'BONUS' | 'PENALTY' | 'DEDUCTION' | 'MANUAL_OVERRIDE';
      amountVnd: number;
      reason: string;
    }) => post<PayrollLineItem>(`/payroll/periods/${periodId}/adjustments`, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: payrollKeys.period(periodId) });
    },
  });
}

export function useLockPeriod() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => post<PayrollPeriod>(`/payroll/periods/${id}/lock`),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: payrollKeys.period(data.id) });
      qc.invalidateQueries({ queryKey: ['payroll', 'periods'] });
    },
  });
}

export function useApprovePeriod() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => post<PayrollPeriod>(`/payroll/periods/${id}/approve`),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: payrollKeys.period(data.id) });
      qc.invalidateQueries({ queryKey: ['payroll', 'periods'] });
    },
  });
}

export function useMarkPaid() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: { paymentReference: string; paymentDate: string } }) =>
      post<PayrollPeriod>(`/payroll/periods/${id}/mark-paid`, payload),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: payrollKeys.period(data.id) });
      qc.invalidateQueries({ queryKey: ['payroll', 'periods'] });
    },
  });
}

export function useOpenAdjustment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => post<PayrollPeriod>(`/payroll/periods/${id}/open-adjustment`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['payroll', 'periods'] }),
  });
}

// Self-service
export function useMyPayrollHistory() {
  return useQuery({
    queryKey: payrollKeys.myHistory,
    queryFn: () => get<PayrollHistoryItem[]>('/payroll/me/history'),
  });
}

export function useMyPayslip(periodId: string | undefined) {
  return useQuery({
    enabled: !!periodId,
    queryKey: payrollKeys.myPayslip(periodId ?? ''),
    queryFn: () => get<Payslip>(`/payroll/me/payslip/${periodId}`),
  });
}

export function useMyCompensation() {
  return useQuery({
    queryKey: payrollKeys.myCompensation,
    queryFn: () => get<DentistCompensation>('/payroll/me/compensation'),
  });
}

export function useMyPayrollPreview() {
  return useQuery({
    queryKey: payrollKeys.myPreview,
    queryFn: () => get<PayrollLineItem>('/payroll/me/preview'),
  });
}

// Shifts
// Raw API response nests the dentist relation (`{ dentist: { fullName } }`)
// instead of a flat `dentistName` — flatten it here, same pattern as
// `mapPeriodDetail` above.
function mapShiftRegistration(
  raw: ShiftRegistration & { dentist?: { fullName: string } },
): ShiftRegistration {
  return { ...raw, dentistName: raw.dentist?.fullName ?? raw.dentistName ?? '—' };
}

export function useShiftRegistrations(filters?: { dentistId?: string; status?: string; from?: string; to?: string }) {
  return useQuery({
    queryKey: shiftKeys.list(filters),
    queryFn: () =>
      get<ShiftRegistration[]>('/shifts/registrations', {
        params: filters,
      }).then((list) => list.map(mapShiftRegistration)),
  });
}

export function useShiftRegistration(id: string | undefined) {
  return useQuery({
    enabled: !!id,
    queryKey: ['shifts', 'detail', id],
    queryFn: () => get<ShiftRegistration>(`/shifts/registrations/${id}`).then(mapShiftRegistration),
  });
}

export function useCreateShift() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateShiftRegistrationPayload) =>
      post<ShiftRegistration>('/shifts/registrations', payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['shifts'] }),
  });
}

export function useApproveShift() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => post<ShiftRegistration>(`/shifts/registrations/${id}/approve`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['shifts'] }),
  });
}

export function useRejectShift() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: RejectShiftPayload }) =>
      post<ShiftRegistration>(`/shifts/registrations/${id}/reject`, payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['shifts'] }),
  });
}

export function useCancelShift() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => post<ShiftRegistration>(`/shifts/registrations/${id}/cancel`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['shifts'] }),
  });
}

export function useNoShowDetection() {
  return useMutation({
    mutationFn: (payload: NoShowDetectionPayload) =>
      post<NoShowDetectionItem[]>('/shifts/registrations/no-show-detection', payload),
  });
}

// Dentist lookups go through useDentistOptions (features/appointments/appointmentApi.ts),
// which hits the real /appointments/dentists endpoint — there is no plain
// GET /users route on this API.

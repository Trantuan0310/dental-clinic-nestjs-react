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
// GET /payroll/me/history returns the raw PayrollLineItem[] rows (same
// shape mapMyPayslip() below already has to unwrap) with the period
// relation NESTED under `period: {id, periodStart, periodEnd, status,
// paidAt}` - not the flat {periodId, periodStart, periodEnd, status,
// netSalary, paidAt} shape PayrollHistoryItem/this page expect. Previously
// cast straight to PayrollHistoryItem[] with no mapping, so
// payslip.periodStart/periodEnd were undefined - new Date(undefined) is
// Invalid Date, and format()'ing it throws RangeError: Invalid time value,
// crashing MyPayrollHistoryPage for every dentist who opened it.
// payslip.status and payslip.periodId (used for the "Chi tiết" link) were
// undefined too, netSalary read the nonexistent field instead of netPayVnd.
interface PayrollHistoryRow {
  id: string;
  payrollPeriodId: string;
  netPayVnd: number | string;
  period: {
    periodStart: string;
    periodEnd: string;
    status: PayrollHistoryItem['status'];
    paidAt?: string | null;
  };
}

function mapPayrollHistoryItem(raw: PayrollHistoryRow): PayrollHistoryItem {
  return {
    id: raw.id,
    periodId: raw.payrollPeriodId,
    periodStart: raw.period.periodStart,
    periodEnd: raw.period.periodEnd,
    status: raw.period.status,
    netSalary: Number(raw.netPayVnd),
    paidAt: raw.period.paidAt ?? null,
  };
}

export function useMyPayrollHistory() {
  return useQuery({
    queryKey: payrollKeys.myHistory,
    queryFn: () =>
      get<PayrollHistoryRow[]>('/payroll/me/history').then((rows) => rows.map(mapPayrollHistoryItem)),
  });
}

/**
 * GET /payroll/me/payslip/:periodId returns the raw PayrollLineItem row
 * (baseSalaryVnd/grossPayVnd/etc, not the `Payslip` view-model's old
 * baseSalary/grossSalary names) plus `dentist: {fullName}` and each
 * encounterDetail's own `encounter: {startedAt, patient: {code, fullName}}`
 * — this used to be cast straight to `Payslip` with zero mapping, so every
 * field read wrong, and `payslip.encounters.length` threw on the
 * (nonexistent) `encounters` field for any dentist who opened the page.
 */
interface MyPayslipEncounterRow {
  id: string;
  encounterId: string;
  encounterStartAt: string;
  durationMinutes: number;
  treatmentRevenueVnd: number | string;
  encounter?: {
    startedAt?: string;
    patient?: { fullName?: string; code?: string } | null;
  } | null;
}

interface MyPayslipRow {
  id: string;
  payrollPeriodId: string;
  dentistId: string;
  dentistName?: string;
  dentist?: { fullName?: string } | null;
  period?: { periodStart?: string; periodEnd?: string } | null;
  baseSalaryVnd: number | string;
  commissionVnd: number | string;
  overtimePayVnd: number | string;
  bonusVnd: number | string;
  penaltyVnd: number | string;
  grossPayVnd: number | string;
  taxTncnVnd: number | string;
  bhxhVnd: number | string;
  netPayVnd: number | string;
  adjustments?: Payslip['adjustments'];
  encounterDetails?: MyPayslipEncounterRow[];
  computedAt: string;
}

function mapMyPayslip(raw: MyPayslipRow): Payslip {
  return {
    id: raw.id,
    periodId: raw.payrollPeriodId,
    periodStart: raw.period?.periodStart ?? raw.computedAt,
    periodEnd: raw.period?.periodEnd ?? raw.computedAt,
    dentistId: raw.dentistId,
    dentistName: raw.dentist?.fullName ?? raw.dentistName ?? '—',
    baseSalaryVnd: Number(raw.baseSalaryVnd),
    commissionVnd: Number(raw.commissionVnd),
    overtimePayVnd: Number(raw.overtimePayVnd),
    bonusVnd: Number(raw.bonusVnd),
    penaltyVnd: Number(raw.penaltyVnd),
    grossPayVnd: Number(raw.grossPayVnd),
    taxTncnVnd: Number(raw.taxTncnVnd),
    bhxhVnd: Number(raw.bhxhVnd),
    netPayVnd: Number(raw.netPayVnd),
    adjustments: raw.adjustments ?? [],
    encounters: (raw.encounterDetails ?? []).map((ed) => ({
      id: ed.id,
      encounterId: ed.encounterId,
      patientName: ed.encounter?.patient?.fullName ?? '—',
      patientCode: ed.encounter?.patient?.code ?? '',
      startedAt: ed.encounter?.startedAt ?? ed.encounterStartAt,
      durationMinutes: ed.durationMinutes,
      treatmentRevenueVnd: Number(ed.treatmentRevenueVnd),
    })),
    computedAt: raw.computedAt,
  };
}

export function useMyPayslip(periodId: string | undefined) {
  return useQuery({
    enabled: !!periodId,
    queryKey: payrollKeys.myPayslip(periodId ?? ''),
    queryFn: () => get<MyPayslipRow>(`/payroll/me/payslip/${periodId}`).then(mapMyPayslip),
  });
}

export function useMyCompensation() {
  return useQuery({
    queryKey: payrollKeys.myCompensation,
    // Same raw baseSalaryVnd/commissionPct/overtimeHourlyVnd shape as
    // /payroll/compensations (see mapCompensation above) - this used to
    // skip the mapping entirely, so a dentist's OWN compensation page
    // showed "—" for a real 15,000,000₫ base salary (read the nonexistent
    // `baseSalary` field instead) and a blank "%" for a real 30% commission
    // (commissionPct 0.3, read via the nonexistent `commissionPercentage`).
    queryFn: () => get<PrismaCompensationRow>('/payroll/me/compensation').then(mapCompensation),
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

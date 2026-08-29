// =============================================================================
// Payroll Module TypeScript Types
// Source: backend API + docs/03_Specification/Payroll/SPEC.md
// =============================================================================

import type { EncounterSummary } from './medical-records';

export type {
  EncounterSummary,
};

export type PayrollPeriodStatus = 'DRAFT' | 'REVIEWING' | 'APPROVED' | 'PAID' | 'LOCKED';
export type ShiftRegistrationStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED';

// Payroll Config
// Field names mirror `PayrollConfig` in backend/prisma/schema.prisma 1:1 —
// the controller/service return the raw Prisma row, no DTO remapping.
export interface PayrollConfig {
  id: string;
  payrollCycle: 'WEEKLY' | 'BIWEEKLY' | 'MONTHLY';
  overtimeMultiplier: number;
  defaultTaxTncnPct: number;
  bhxhPct: number;
  bhytPct: number;
  bhtnPct: number;
  minGrossForBhxh: number;
  probationSalaryPct: number;
  taxBrackets: TaxBracket[];
  updatedAt: string;
}

export interface TaxBracket {
  min: number;
  max: number | null;
  rate: number;
}

// Compensation
export interface DentistCompensation {
  id: string;
  dentistId: string;
  dentistName: string;
  baseSalary: number;
  commissionPercentage: number;
  overtimeHourlyRate: number;
  effectiveFrom: string;
  effectiveTo: string | null;
  notes?: string | null;
  createdAt: string;
}

export interface CompensationVersion {
  id: string;
  effectiveFrom: string;
  effectiveTo: string | null;
  baseSalary: number;
  commissionPercentage: number;
  overtimeHourlyRate: number;
  isActive: boolean;
  createdAt: string;
}

// Payroll Period
// Field names mirror `PayrollPeriod` in backend/prisma/schema.prisma — the
// service returns the raw Prisma row (lock/approve/mark-paid), so there are
// no `totalGross`/`totalNet`/... aggregates here; sum `lineItems` for those.
export interface PayrollPeriod {
  id: string;
  periodStart: string;
  periodEnd: string;
  payrollCycle: 'WEEKLY' | 'BIWEEKLY' | 'MONTHLY';
  status: PayrollPeriodStatus;
  createdAt: string;
  lockedAt: string | null;
  approvedAt: string | null;
  paidAt: string | null;
  paymentReference: string | null;
}

export interface PayrollAdjustment {
  id: string;
  type: 'BONUS' | 'PENALTY' | 'DEDUCTION' | 'MANUAL_OVERRIDE';
  amountVnd: number;
  reason: string;
  adjustedByUserId: string;
  adjustedAt: string;
}

export type PayrollAdjustmentType = PayrollAdjustment['type'];

export interface PayrollEncounterDetail {
  id: string;
  encounterStartAt: string;
  encounterEndAt: string;
  durationMinutes: number;
  treatmentRevenueVnd: number;
}

// `dentistName` is flattened client-side from `dentist.fullName` by
// `mapLineItem()` in payrollApi.ts — not present on the raw API response.
export interface PayrollLineItem {
  id: string;
  payrollPeriodId: string;
  dentistId: string;
  dentistName: string;
  encountersCount: number;
  totalRevenueVnd: number;
  workedShifts: number;
  totalHours: number;
  overtimeHours: number;
  baseSalaryVnd: number;
  commissionVnd: number;
  overtimePayVnd: number;
  bonusVnd: number;
  penaltyVnd: number;
  grossPayVnd: number;
  taxTncnVnd: number;
  bhxhVnd: number;
  netPayVnd: number;
  computationLog: Record<string, unknown>;
  manuallyAdjusted: boolean;
  adjustmentNote: string | null;
  computedAt: string;
  adjustments: PayrollAdjustment[];
  encounterDetails: PayrollEncounterDetail[];
}

export interface PayrollPeriodDetail extends PayrollPeriod {
  lineItems: PayrollLineItem[];
}

export interface CreatePayrollPeriodPayload {
  periodStart: string;
  periodEnd: string;
  payrollCycle: 'WEEKLY' | 'BIWEEKLY' | 'MONTHLY';
}

export interface PayrollHistoryItem {
  id: string;
  periodId: string;
  periodStart: string;
  periodEnd: string;
  status: PayrollPeriodStatus;
  netSalary: number;
  paidAt?: string | null;
}

export interface UpdatePayrollConfigPayload extends Partial<PayrollConfig> {}

export interface CreateCompensationPayload {
  dentistId: string;
  effectiveFrom: string;
  effectiveTo?: string | null;
  baseSalary: number;
  commissionPercentage: number;
  overtimeHourlyRate?: number;
  notes?: string;
}

export interface UpdateCompensationPayload extends Partial<CreateCompensationPayload> {}

export interface CreateShiftRegistrationPayload {
  date: string;
  startTime: string;
  endTime: string;
  maxEncounters?: number;
  notes?: string;
}

export interface RejectShiftPayload {
  reason: string;
}

export interface NoShowDetectionItem {
  shiftRegistrationId: string;
  dentistId: string;
  dentistName: string;
  date: string;
  startTime: string;
  endTime: string;
  hasUpcomingAppointment: boolean;
  suggestedPenaltyVnd?: number;
}

export interface NoShowDetectionPayload {
  from: string;
  to: string;
}

export interface Payslip {
  id: string;
  periodId: string;
  dentistId: string;
  dentistName: string;
  baseSalary: number;
  commission: number;
  overtime: number;
  grossSalary: number;
  taxTNCN: number;
  bhxh: number;
  bhyt: number;
  bhtn: number;
  otherDeductions: number;
  netSalary: number;
  adjustments: PayrollAdjustment[];
  encounters: EncounterSummary[];
  computedAt: string;
}

// Shift Registration
// Field names mirror `ShiftRegistration` in backend/prisma/schema.prisma;
// `dentistName` is flattened client-side from the nested `dentist.fullName`
// (see `mapShiftRegistration()` in payrollApi.ts) since the raw API response
// nests the relation instead of returning a flat name.
export interface ShiftRegistration {
  id: string;
  dentistId: string;
  dentistName: string;
  date: string;
  startTime: string;
  endTime: string;
  maxEncounters?: number | null;
  notes?: string | null;
  status: ShiftRegistrationStatus;
  approvedByUserId?: string | null;
  approvedAt?: string | null;
  rejectionReason?: string | null;
  createdAt: string;
}

// API functions
import { api, unwrap } from '@/lib/api';

export const payrollApi = {
  // Config
  async getConfig(): Promise<PayrollConfig> {
    const { data } = await api.get<{ data: PayrollConfig }>('/payroll/config');
    return unwrap(data);
  },

  async updateConfig(payload: Partial<PayrollConfig>): Promise<PayrollConfig> {
    const { data } = await api.patch<{ data: PayrollConfig }>('/payroll/config', payload);
    return unwrap(data);
  },

  // Compensation
  async listCompensations(dentistId?: string): Promise<DentistCompensation[]> {
    const { data } = await api.get<{ data: DentistCompensation[] }>('/payroll/compensations', {
      params: { dentistId },
    });
    return unwrap(data);
  },

  async getCompensationHistory(dentistId: string): Promise<CompensationVersion[]> {
    const { data } = await api.get<{ data: CompensationVersion[] }>(
      `/payroll/compensations/${dentistId}/history`,
    );
    return unwrap(data);
  },

  async createCompensation(payload: {
    dentistId: string;
    effectiveFrom: string;
    effectiveTo?: string;
    baseSalary: number;
    commissionPercentage: number;
    overtimeHourlyRate?: number;
    notes?: string;
  }): Promise<DentistCompensation> {
    const { data } = await api.post<{ data: DentistCompensation }>('/payroll/compensations', payload);
    return unwrap(data);
  },

  // Periods
  async listPeriods(params?: { status?: PayrollPeriodStatus; year?: number }): Promise<PayrollPeriod[]> {
    const { data } = await api.get<{ data: PayrollPeriod[] }>('/payroll/periods', { params });
    return unwrap(data);
  },

  async getPeriod(id: string): Promise<PayrollPeriod & { lineItems: PayrollLineItem[] }> {
    const { data } = await api.get<{ data: PayrollPeriod & { lineItems: PayrollLineItem[] } }>(
      `/payroll/periods/${id}`,
    );
    return unwrap(data);
  },

  async createPeriod(startDate: string, endDate: string): Promise<PayrollPeriod> {
    const { data } = await api.post<{ data: PayrollPeriod }>('/payroll/periods', {
      startDate,
      endDate,
    });
    return unwrap(data);
  },

  async computePeriod(id: string): Promise<PayrollPeriod> {
    const { data } = await api.post<{ data: PayrollPeriod }>(`/payroll/periods/${id}/compute`);
    return unwrap(data);
  },

  async approvePeriod(id: string): Promise<PayrollPeriod> {
    const { data } = await api.post<{ data: PayrollPeriod }>(`/payroll/periods/${id}/approve`);
    return unwrap(data);
  },

  async markPeriodPaid(id: string): Promise<PayrollPeriod> {
    const { data } = await api.post<{ data: PayrollPeriod }>(`/payroll/periods/${id}/mark-paid`);
    return unwrap(data);
  },

  async addAdjustment(periodId: string, lineItemId: string, payload: {
    type: string;
    amount: number;
    reason: string;
  }): Promise<PayrollLineItem> {
    const { data } = await api.post<{ data: PayrollLineItem }>(
      `/payroll/periods/${periodId}/line-items/${lineItemId}/adjustments`,
      payload,
    );
    return unwrap(data);
  },

  // My Payroll (Dentist)
  async getMyPayslips(): Promise<Payslip[]> {
    const { data } = await api.get<{ data: Payslip[] }>('/payroll/me/payslips');
    return unwrap(data);
  },

  async getMyPayslip(periodId: string): Promise<Payslip> {
    const { data } = await api.get<{ data: Payslip }>(`/payroll/me/payslips/${periodId}`);
    return unwrap(data);
  },

  async getMyPreview(): Promise<Payslip> {
    const { data } = await api.get<{ data: Payslip }>('/payroll/me/preview');
    return unwrap(data);
  },

  async getMyCompensation(): Promise<CompensationVersion[]> {
    const { data } = await api.get<{ data: CompensationVersion[] }>('/payroll/me/compensation');
    return unwrap(data);
  },
};

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

// The imperative payrollApi object that used to live here (getConfig,
// listPeriods, addAdjustment, getMyPayslips, etc.) has been retired — every
// caller now goes through the hook-based API in features/payroll/payrollApi.ts,
// which several of these functions never matched anyway (wrong routes/payload
// shapes for periods, adjustments, and payslips).

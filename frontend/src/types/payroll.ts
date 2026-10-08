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
  /** Owned by (period, dentist) since migration 046; survives recomputes. */
  payrollPeriodId: string;
  dentistId: string;
  type: 'BONUS' | 'PENALTY' | 'DEDUCTION' | 'MANUAL_OVERRIDE';
  amountVnd: number;
  reason: string;
  /** Null for a system clawback (invoice voided after its period closed). */
  adjustedByUserId: string | null;
  adjustedAt: string;
  sourceInvoiceId?: string | null;
}

export type PayrollAdjustmentType = PayrollAdjustment['type'];

export interface PayrollEncounterDetail {
  id: string;
  encounterStartAt: string;
  encounterEndAt: string;
  durationMinutes: number;
  /** Commission basis of the row (invoice line after discount). */
  treatmentRevenueVnd: number;
  // Migration 046 (null on older rows): the issued invoice line counted.
  invoiceId?: string | null;
  invoiceItemId?: string | null;
  basisAmountVnd?: number | string | null;
  commissionPct?: number | string | null;
  /** Rows since 046: { invoiceCode, description, lineTotal, invoiceTotal, ... }; older rows differ. */
  treatmentBreakdown?: unknown;
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

/** GET /payroll/periods/:id/warnings — things to settle before locking. */
export interface PayrollPeriodWarnings {
  draftInvoiceDays: number;
  draftInvoices: Array<{
    invoiceId: string;
    code: string;
    totalVnd: number;
    createdAt: string;
    ageDays: number;
    patientName: string;
    dentistId: string | null;
    dentistName: string;
  }>;
  dentistsWithoutCompensation: Array<{ dentistId: string; dentistName: string; encounterCount: number }>;
  outsideHoursEncounters: Array<{
    encounterId: string;
    startedAt: string;
    closedAt: string;
    minutes: number;
    dentistId: string;
    dentistName: string;
  }>;
  terminatedDentists: Array<{ dentistId: string | null; dentistName: string; terminationDate: string | null }>;
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
  /** Required when the only admin sets their own pay (PAYROLL_SELF_APPROVED). */
  selfApprovalReason?: string;
}

/** Minimum length of the reason for acting on your own pay. */
export const SELF_APPROVAL_REASON_MIN = 10;

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

// GET /payroll/me/payslip/:periodId returns the raw PayrollLineItem row
// (field names below mirror it 1:1 — no `baseSalary`/`grossSalary`/etc, and
// no separate bhyt/bhtn: PayrollConfig's 3 rates are summed into one before
// computation, so only one combined `bhxhVnd` deduction ever exists) plus
// the dentist relation and each encounterDetail's own encounter+patient,
// which `mapMyPayslip()` in payrollApi.ts flattens onto this shape.
export interface Payslip {
  id: string;
  periodId: string;
  periodStart: string;
  periodEnd: string;
  dentistId: string;
  dentistName: string;
  baseSalaryVnd: number;
  commissionVnd: number;
  overtimePayVnd: number;
  bonusVnd: number;
  penaltyVnd: number;
  grossPayVnd: number;
  taxTncnVnd: number;
  bhxhVnd: number;
  netPayVnd: number;
  adjustments: PayrollAdjustment[];
  encounters: PayslipEncounter[];
  computedAt: string;
}

export interface PayslipEncounter {
  id: string;
  encounterId: string;
  patientName: string;
  patientCode: string;
  startedAt: string;
  durationMinutes: number;
  treatmentRevenueVnd: number;
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

import {
  PayrollCycle,
  PayrollPeriodStatus,
  PayrollAdjustmentType,
  ShiftRegistrationStatus,
} from '@prisma/client';
import { PayrollStateException, PayrollValidationException } from './exceptions';

export const isComputable = (status: PayrollPeriodStatus): boolean => {
  return status === PayrollPeriodStatus.DRAFT || status === PayrollPeriodStatus.REVIEWING;
};

export const isAdjustable = (status: PayrollPeriodStatus): boolean => {
  return status === PayrollPeriodStatus.DRAFT || status === PayrollPeriodStatus.REVIEWING;
};

export const isViewableByDentist = (status: PayrollPeriodStatus): boolean => {
  return (
    status === PayrollPeriodStatus.APPROVED ||
    status === PayrollPeriodStatus.PAID ||
    status === PayrollPeriodStatus.LOCKED
  );
};

const VALID_TRANSITIONS: Record<PayrollPeriodStatus, PayrollPeriodStatus[]> = {
  [PayrollPeriodStatus.DRAFT]: [PayrollPeriodStatus.REVIEWING],
  [PayrollPeriodStatus.REVIEWING]: [PayrollPeriodStatus.DRAFT, PayrollPeriodStatus.APPROVED],
  [PayrollPeriodStatus.APPROVED]: [PayrollPeriodStatus.PAID],
  [PayrollPeriodStatus.PAID]: [PayrollPeriodStatus.LOCKED],
  [PayrollPeriodStatus.LOCKED]: [],
};

export const canTransition = (
  currentStatus: PayrollPeriodStatus,
  expectedStatus: PayrollPeriodStatus,
): boolean => {
  return VALID_TRANSITIONS[currentStatus]?.includes(expectedStatus) ?? false;
};

const VALID_SHIFT_TRANSITIONS: Record<ShiftRegistrationStatus, ShiftRegistrationStatus[]> = {
  [ShiftRegistrationStatus.PENDING]: [
    ShiftRegistrationStatus.APPROVED,
    ShiftRegistrationStatus.REJECTED,
    ShiftRegistrationStatus.CANCELLED,
  ],
  [ShiftRegistrationStatus.APPROVED]: [ShiftRegistrationStatus.CANCELLED],
  [ShiftRegistrationStatus.REJECTED]: [],
  [ShiftRegistrationStatus.CANCELLED]: [],
};

export const canTransitionShift = (
  currentStatus: ShiftRegistrationStatus,
  expectedStatus: ShiftRegistrationStatus,
): boolean => {
  return VALID_SHIFT_TRANSITIONS[currentStatus]?.includes(expectedStatus) ?? false;
};

export const assertTransition = (
  currentStatus: PayrollPeriodStatus,
  expectedStatus: PayrollPeriodStatus,
): void => {
  if (!canTransition(currentStatus, expectedStatus)) {
    // PayrollStateException (409), not a bare Error: this fires on ordinary
    // user actions — double-clicking "Đánh dấu đã trả", or two admins acting
    // on the same period at once — and a bare Error falls through the global
    // filter as a 500 "Internal server error", so the UI shows a system
    // failure instead of "this period was already paid". Mirrors how
    // ShiftRegistrationService reports the same situation.
    throw new PayrollStateException(
      `Invalid payroll period transition: cannot transition from ${currentStatus} to ${expectedStatus}`,
    );
  }
};

// AddAdjustmentDto only declares @IsString() on `reason`, so these two length
// rules are the only thing enforcing them — and as bare Errors they fell
// through the global filter as a 500. An admin typing a too-short reason on
// the adjustment form got "Internal server error" instead of being told what
// was wrong with their input, which is a 400.
export const validateAdjustmentReason = (type: PayrollAdjustmentType, reason: string): void => {
  if (!reason || reason.trim().length < 5) {
    throw new PayrollValidationException('Lý do điều chỉnh phải có ít nhất 5 ký tự');
  }

  if (type === 'MANUAL_OVERRIDE' && reason.trim().length < 50) {
    throw new PayrollValidationException(
      'Ghi đè thủ công cần lý do chi tiết (ít nhất 50 ký tự)',
    );
  }
};

export const computePeriodBounds = (
  cycle: PayrollCycle,
  anchor: Date,
): { start: Date; end: Date } => {
  const year = anchor.getUTCFullYear();
  const month = anchor.getUTCMonth();
  const day = anchor.getUTCDate();
  const utcDay = anchor.getUTCDay();

  switch (cycle) {
    case 'MONTHLY': {
      const start = new Date(Date.UTC(year, month, 1));
      const end = new Date(Date.UTC(year, month + 1, 0));
      return { start, end };
    }
    case 'WEEKLY': {
      const mondayOffset = (utcDay + 6) % 7;
      const start = new Date(Date.UTC(year, month, day - mondayOffset));
      const end = new Date(Date.UTC(year, month, day - mondayOffset + 6));
      return { start, end };
    }
    case 'BIWEEKLY': {
      const startDay = day <= 15 ? 1 : 16;
      const endDay = day <= 15 ? 15 : new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
      const start = new Date(Date.UTC(year, month, startDay));
      const end = new Date(Date.UTC(year, month, endDay));
      return { start, end };
    }
    default:
      throw new Error(`Unsupported payroll cycle: ${cycle}`);
  }
};

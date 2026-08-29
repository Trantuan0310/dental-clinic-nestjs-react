import {
  PayrollCycle,
  PayrollPeriodStatus,
  PayrollAdjustmentType,
  ShiftRegistrationStatus,
} from '@prisma/client';

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
    throw new Error(
      `Invalid payroll period transition: cannot transition from ${currentStatus} to ${expectedStatus}`,
    );
  }
};

export const validateAdjustmentReason = (type: PayrollAdjustmentType, reason: string): void => {
  if (!reason || reason.trim().length < 5) {
    throw new Error('Adjustment reason must be at least 5 characters');
  }

  if (type === 'MANUAL_OVERRIDE' && reason.trim().length < 50) {
    throw new Error('Manual override requires a detailed reason (at least 50 characters)');
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

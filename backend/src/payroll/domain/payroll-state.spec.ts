import {
  PayrollPeriodStatus,
  PayrollAdjustmentType,
  ShiftRegistrationStatus,
} from '@prisma/client';
import {
  canTransition,
  assertTransition,
  isAdjustable,
  isComputable,
  isViewableByDentist,
  computePeriodBounds,
  canTransitionShift,
  validateAdjustmentReason,
} from './payroll-state';

describe('payroll state machine', () => {
  describe('canTransition', () => {
    it('allows DRAFT → REVIEWING', () => {
      expect(canTransition(PayrollPeriodStatus.DRAFT, PayrollPeriodStatus.REVIEWING)).toBe(true);
    });

    it('allows REVIEWING → APPROVED', () => {
      expect(canTransition(PayrollPeriodStatus.REVIEWING, PayrollPeriodStatus.APPROVED)).toBe(true);
    });

    it('allows REVIEWING → DRAFT (re-open for adjustments)', () => {
      expect(canTransition(PayrollPeriodStatus.REVIEWING, PayrollPeriodStatus.DRAFT)).toBe(true);
    });

    it('allows APPROVED → PAID', () => {
      expect(canTransition(PayrollPeriodStatus.APPROVED, PayrollPeriodStatus.PAID)).toBe(true);
    });

    it('allows PAID → LOCKED', () => {
      expect(canTransition(PayrollPeriodStatus.PAID, PayrollPeriodStatus.LOCKED)).toBe(true);
    });

    it('blocks LOCKED → anything (terminal)', () => {
      expect(canTransition(PayrollPeriodStatus.LOCKED, PayrollPeriodStatus.DRAFT)).toBe(false);
      expect(canTransition(PayrollPeriodStatus.LOCKED, PayrollPeriodStatus.REVIEWING)).toBe(false);
    });

    it('blocks skipping states', () => {
      expect(canTransition(PayrollPeriodStatus.DRAFT, PayrollPeriodStatus.APPROVED)).toBe(false);
      expect(canTransition(PayrollPeriodStatus.DRAFT, PayrollPeriodStatus.PAID)).toBe(false);
      expect(canTransition(PayrollPeriodStatus.REVIEWING, PayrollPeriodStatus.PAID)).toBe(false);
    });

    it('blocks backward jumps except REVIEWING → DRAFT', () => {
      expect(canTransition(PayrollPeriodStatus.APPROVED, PayrollPeriodStatus.REVIEWING)).toBe(
        false,
      );
      expect(canTransition(PayrollPeriodStatus.PAID, PayrollPeriodStatus.APPROVED)).toBe(false);
    });
  });

  describe('assertTransition', () => {
    it('throws on invalid transition', () => {
      expect(() => assertTransition(PayrollPeriodStatus.LOCKED, PayrollPeriodStatus.DRAFT)).toThrow(
        /Invalid payroll period transition/,
      );
    });
  });

  describe('isAdjustable', () => {
    it('allows DRAFT and REVIEWING', () => {
      expect(isAdjustable(PayrollPeriodStatus.DRAFT)).toBe(true);
      expect(isAdjustable(PayrollPeriodStatus.REVIEWING)).toBe(true);
    });

    it('blocks APPROVED, PAID, LOCKED', () => {
      expect(isAdjustable(PayrollPeriodStatus.APPROVED)).toBe(false);
      expect(isAdjustable(PayrollPeriodStatus.PAID)).toBe(false);
      expect(isAdjustable(PayrollPeriodStatus.LOCKED)).toBe(false);
    });
  });

  describe('isComputable', () => {
    it('matches isAdjustable', () => {
      expect(isComputable(PayrollPeriodStatus.DRAFT)).toBe(true);
      expect(isComputable(PayrollPeriodStatus.REVIEWING)).toBe(true);
      expect(isComputable(PayrollPeriodStatus.APPROVED)).toBe(false);
    });
  });

  describe('isViewableByDentist', () => {
    it('allows APPROVED/PAID/LOCKED', () => {
      expect(isViewableByDentist(PayrollPeriodStatus.APPROVED)).toBe(true);
      expect(isViewableByDentist(PayrollPeriodStatus.PAID)).toBe(true);
      expect(isViewableByDentist(PayrollPeriodStatus.LOCKED)).toBe(true);
    });

    it('blocks DRAFT/REVIEWING', () => {
      expect(isViewableByDentist(PayrollPeriodStatus.DRAFT)).toBe(false);
      expect(isViewableByDentist(PayrollPeriodStatus.REVIEWING)).toBe(false);
    });
  });
});

describe('computePeriodBounds', () => {
  describe('MONTHLY', () => {
    it('returns first to last day of month', () => {
      const anchor = new Date('2026-08-15');
      const { start, end } = computePeriodBounds('MONTHLY' as any, anchor);
      expect(start).toEqual(new Date(Date.UTC(2026, 7, 1)));
      expect(end).toEqual(new Date(Date.UTC(2026, 7, 31)));
    });

    it('handles December correctly', () => {
      const anchor = new Date('2026-12-31');
      const { start, end } = computePeriodBounds('MONTHLY' as any, anchor);
      expect(start).toEqual(new Date(Date.UTC(2026, 11, 1)));
      expect(end).toEqual(new Date(Date.UTC(2026, 11, 31)));
    });

    it('handles February in leap year', () => {
      const anchor = new Date('2028-02-15');
      const { start: _start, end } = computePeriodBounds('MONTHLY' as any, anchor);
      expect(end.getUTCDate()).toBe(29);
    });
  });

  describe('WEEKLY', () => {
    it('returns Monday-Sunday of containing week', () => {
      const anchor = new Date('2026-08-12'); // Wed
      const { start, end } = computePeriodBounds('WEEKLY' as any, anchor);
      expect(start.getUTCDay()).toBe(1); // Monday
      expect(end.getUTCDay()).toBe(0); // Sunday
    });

    it('handles Sunday anchor (rolls back to previous Monday)', () => {
      const anchor = new Date('2026-08-16'); // Sun
      const { start } = computePeriodBounds('WEEKLY' as any, anchor);
      expect(start.getUTCDay()).toBe(1);
      expect(start.getUTCDate()).toBe(10);
    });
  });

  describe('BIWEEKLY', () => {
    it('returns 1-15 for first half', () => {
      const anchor = new Date('2026-08-10');
      const { start, end } = computePeriodBounds('BIWEEKLY' as any, anchor);
      expect(start.getUTCDate()).toBe(1);
      expect(end.getUTCDate()).toBe(15);
    });

    it('returns 16-end for second half', () => {
      const anchor = new Date('2026-08-20');
      const { start, end } = computePeriodBounds('BIWEEKLY' as any, anchor);
      expect(start.getUTCDate()).toBe(16);
      expect(end.getUTCDate()).toBe(31);
    });
  });
});

describe('shift state transitions', () => {
  it('allows PENDING → APPROVED/REJECTED/CANCELLED', () => {
    expect(
      canTransitionShift(ShiftRegistrationStatus.PENDING, ShiftRegistrationStatus.APPROVED),
    ).toBe(true);
    expect(
      canTransitionShift(ShiftRegistrationStatus.PENDING, ShiftRegistrationStatus.REJECTED),
    ).toBe(true);
    expect(
      canTransitionShift(ShiftRegistrationStatus.PENDING, ShiftRegistrationStatus.CANCELLED),
    ).toBe(true);
  });

  it('allows APPROVED → CANCELLED only', () => {
    expect(
      canTransitionShift(ShiftRegistrationStatus.APPROVED, ShiftRegistrationStatus.CANCELLED),
    ).toBe(true);
    expect(
      canTransitionShift(ShiftRegistrationStatus.APPROVED, ShiftRegistrationStatus.APPROVED),
    ).toBe(false);
  });

  it('blocks any transition from REJECTED/CANCELLED', () => {
    expect(
      canTransitionShift(ShiftRegistrationStatus.REJECTED, ShiftRegistrationStatus.APPROVED),
    ).toBe(false);
    expect(
      canTransitionShift(ShiftRegistrationStatus.CANCELLED, ShiftRegistrationStatus.APPROVED),
    ).toBe(false);
  });
});

describe('validateAdjustmentReason', () => {
  it('requires 5+ chars for BONUS/PENALTY/DEDUCTION', () => {
    expect(() => validateAdjustmentReason(PayrollAdjustmentType.BONUS, 'abcd')).toThrow(
      /at least 5 characters/,
    );
    expect(() => validateAdjustmentReason(PayrollAdjustmentType.BONUS, 'Thưởng KPI')).not.toThrow();
  });

  it('requires 50+ chars for MANUAL_OVERRIDE (BR-PAY-018)', () => {
    expect(() =>
      validateAdjustmentReason(PayrollAdjustmentType.MANUAL_OVERRIDE, 'Too short'),
    ).toThrow(/at least 50 characters/);
    const longReason =
      'Manual override because calculation incorrect, needs adjustment by admin per BR-PAY-018';
    expect(() =>
      validateAdjustmentReason(PayrollAdjustmentType.MANUAL_OVERRIDE, longReason),
    ).not.toThrow();
  });
});

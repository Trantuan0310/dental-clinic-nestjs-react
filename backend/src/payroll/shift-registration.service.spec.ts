import { Test } from '@nestjs/testing';
import { ShiftRegistrationService } from './shift-registration.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { ShiftRegistrationStatus } from '@prisma/client';
import {
  ShiftConflictException,
  ShiftPastDateException,
  ShiftRegistrationNotCancellableException,
  PayrollNotFoundException,
} from './domain/exceptions';

// Dates below must always resolve in the future relative to whenever the
// suite runs (not just when it was written) — compute them relative to
// `Date.now()` instead of hard-coding calendar dates that eventually lapse
// into the past and flip these tests to a spurious ShiftPastDateException.
function daysFromNow(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Next date, at least `minDaysFromNow` out, that falls on `targetDayOfWeek` (0=Sun..6=Sat). */
function nextWeekday(targetDayOfWeek: number, minDaysFromNow: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + minDaysFromNow);
  while (d.getUTCDay() !== targetDayOfWeek) {
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return d.toISOString().slice(0, 10);
}

describe('ShiftRegistrationService', () => {
  let service: ShiftRegistrationService;
  let prisma: PrismaService;

  const FUTURE_DATE = daysFromNow(30);
  const FUTURE_WEDNESDAY = nextWeekday(3, 14); // matches mockWsSchedule.dayOfWeek below

  const mockWsSchedule = {
    id: 'ws-1',
    dentistId: 'dentist-1',
    dayOfWeek: 3, // Wednesday
    startTime: new Date('1970-01-01T08:00:00Z'),
    endTime: new Date('1970-01-01T17:00:00Z'),
    slotDurationMin: 30,
    validFrom: new Date('2026-01-01'),
    validTo: null,
    isPaidShift: true,
    shiftType: 'FULL_DAY',
    deletedAt: null,
  };

  const mockShiftPending = {
    id: 'shift-1',
    dentistId: 'dentist-1',
    date: new Date(FUTURE_DATE), // future
    startTime: '18:00',
    endTime: '21:00',
    maxEncounters: 5,
    notes: 'Ca tối',
    status: ShiftRegistrationStatus.PENDING,
    approvedByUserId: null,
    approvedAt: null,
    rejectionReason: null,
    cancelledAt: null,
    createdByUserId: 'dentist-1',
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
  };

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        ShiftRegistrationService,
        {
          provide: PrismaService,
          useValue: {
            shiftRegistration: {
              findFirst: jest.fn(),
              findUnique: jest.fn(),
              findMany: jest.fn().mockResolvedValue([]),
              create: jest.fn(),
              update: jest.fn(),
              updateMany: jest.fn(),
              count: jest.fn().mockResolvedValue(0),
            },
            workingSchedule: {
              findFirst: jest.fn(),
              // R2: M#5 fix in service uses findMany to iterate all matching
              // schedules, not just first.
              findMany: jest.fn().mockResolvedValue([]),
            },
            $transaction: jest.fn(),
          },
        },
        {
          provide: AuditService,
          useValue: { log: jest.fn().mockResolvedValue(undefined) },
        },
      ],
    }).compile();

    service = module.get(ShiftRegistrationService);
    prisma = module.get(PrismaService);
  });

  describe('create', () => {
    it('creates a PENDING shift in the future', async () => {
      (prisma.workingSchedule.findFirst as jest.Mock).mockResolvedValue(null);
      (prisma.workingSchedule.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.shiftRegistration.findFirst as jest.Mock).mockResolvedValue(null);
      (prisma.shiftRegistration.create as jest.Mock).mockResolvedValue(mockShiftPending);

      const result = await service.create(
        { date: FUTURE_DATE, startTime: '18:00', endTime: '21:00', maxEncounters: 5 },
        'dentist-1',
        false,
      );

      expect(result.status).toBe(ShiftRegistrationStatus.PENDING);
    });

    it('throws ShiftPastDateException for past date', async () => {
      await expect(
        service.create(
          { date: '2020-01-01', startTime: '08:00', endTime: '12:00' },
          'dentist-1',
          false,
        ),
      ).rejects.toThrow(ShiftPastDateException);
    });

    it('throws when endTime <= startTime', async () => {
      await expect(
        service.create(
          { date: FUTURE_DATE, startTime: '18:00', endTime: '17:00' },
          'dentist-1',
          false,
        ),
      ).rejects.toThrow();
    });

    it('throws ShiftConflictException when overlapping with WorkingSchedule', async () => {
      // FUTURE_WEDNESDAY always falls on the WorkingSchedule's dayOfWeek=3
      (prisma.workingSchedule.findMany as jest.Mock).mockResolvedValue([mockWsSchedule]);

      await expect(
        service.create(
          { date: FUTURE_WEDNESDAY, startTime: '14:00', endTime: '16:00' },
          'dentist-1',
          false,
        ),
      ).rejects.toThrow(ShiftConflictException);
    });

    it('allows shift non-overlapping with WorkingSchedule on same day', async () => {
      (prisma.workingSchedule.findMany as jest.Mock).mockResolvedValue([mockWsSchedule]);
      (prisma.shiftRegistration.findFirst as jest.Mock).mockResolvedValue(null);
      (prisma.shiftRegistration.create as jest.Mock).mockResolvedValue({
        ...mockShiftPending,
        date: new Date(FUTURE_WEDNESDAY),
        startTime: '18:00',
        endTime: '21:00',
      });

      const result = await service.create(
        { date: FUTURE_WEDNESDAY, startTime: '18:00', endTime: '21:00' },
        'dentist-1',
        false,
      );

      expect(result.status).toBe(ShiftRegistrationStatus.PENDING);
    });

    it('throws when already has APPROVED shift on same date', async () => {
      (prisma.workingSchedule.findFirst as jest.Mock).mockResolvedValue(null);
      (prisma.workingSchedule.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.shiftRegistration.findFirst as jest.Mock).mockResolvedValue({
        ...mockShiftPending,
        status: ShiftRegistrationStatus.APPROVED,
      });

      await expect(
        service.create(
          { date: FUTURE_DATE, startTime: '08:00', endTime: '12:00' },
          'dentist-1',
          false,
        ),
      ).rejects.toThrow(ShiftConflictException);
    });
  });

  describe('approve', () => {
    it('transitions PENDING → APPROVED', async () => {
      (prisma.shiftRegistration.findUnique as jest.Mock).mockResolvedValue(mockShiftPending);
      (prisma.shiftRegistration.update as jest.Mock).mockResolvedValue({
        ...mockShiftPending,
        status: ShiftRegistrationStatus.APPROVED,
      });

      const result = await service.approve('shift-1', 'admin-1');
      expect(result.status).toBe(ShiftRegistrationStatus.APPROVED);
    });

    it('throws ShiftPastDateException for past date', async () => {
      (prisma.shiftRegistration.findUnique as jest.Mock).mockResolvedValue({
        ...mockShiftPending,
        date: new Date('2020-01-01'),
      });

      await expect(service.approve('shift-1', 'admin-1')).rejects.toThrow(ShiftPastDateException);
    });

    it('throws when transition not allowed', async () => {
      (prisma.shiftRegistration.findUnique as jest.Mock).mockResolvedValue({
        ...mockShiftPending,
        status: ShiftRegistrationStatus.CANCELLED,
      });

      await expect(service.approve('shift-1', 'admin-1')).rejects.toThrow();
    });
  });

  describe('cancel', () => {
    it('BS cancels shift ≥ 24h before', async () => {
      // mockShiftPending.date is FUTURE_DATE (30 days out) — well past the 24h cutoff
      (prisma.shiftRegistration.findUnique as jest.Mock).mockResolvedValue(mockShiftPending);
      (prisma.shiftRegistration.update as jest.Mock).mockResolvedValue({
        ...mockShiftPending,
        status: ShiftRegistrationStatus.CANCELLED,
      });

      const result = await service.cancel('shift-1', 'dentist-1', false);
      expect(result.status).toBe(ShiftRegistrationStatus.CANCELLED);
    });

    it('BS cannot cancel shift < 24h before (BR-APPT-028)', async () => {
      // Shift date = today, time = 1 hour from now
      const now = new Date();
      const oneHourLater = new Date(now.getTime() + 60 * 60 * 1000);
      const hh = String(oneHourLater.getUTCHours()).padStart(2, '0');
      const mm = String(oneHourLater.getUTCMinutes()).padStart(2, '0');

      (prisma.shiftRegistration.findUnique as jest.Mock).mockResolvedValue({
        ...mockShiftPending,
        date: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())),
        startTime: `${hh}:${mm}`,
        endTime: '23:00',
      });

      await expect(service.cancel('shift-1', 'dentist-1', false)).rejects.toThrow(
        ShiftRegistrationNotCancellableException,
      );
    });

    it('admin can cancel any time', async () => {
      // 1 hour from now
      const now = new Date();
      const oneHourLater = new Date(now.getTime() + 60 * 60 * 1000);
      const hh = String(oneHourLater.getUTCHours()).padStart(2, '0');
      const mm = String(oneHourLater.getUTCMinutes()).padStart(2, '0');

      (prisma.shiftRegistration.findUnique as jest.Mock).mockResolvedValue({
        ...mockShiftPending,
        date: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())),
        startTime: `${hh}:${mm}`,
        status: ShiftRegistrationStatus.APPROVED,
      });
      (prisma.shiftRegistration.update as jest.Mock).mockResolvedValue({
        ...mockShiftPending,
        status: ShiftRegistrationStatus.CANCELLED,
      });

      const result = await service.cancel('shift-1', 'admin-1', true);
      expect(result.status).toBe(ShiftRegistrationStatus.CANCELLED);
    });

    it('throws when BS tries to cancel another dentist shift', async () => {
      (prisma.shiftRegistration.findUnique as jest.Mock).mockResolvedValue({
        ...mockShiftPending,
        dentistId: 'dentist-2',
      });

      await expect(service.cancel('shift-1', 'dentist-1', false)).rejects.toThrow(
        PayrollNotFoundException,
      );
    });

    it('throws when transition not allowed (REJECTED → CANCELLED)', async () => {
      (prisma.shiftRegistration.findUnique as jest.Mock).mockResolvedValue({
        ...mockShiftPending,
        status: ShiftRegistrationStatus.REJECTED,
      });

      await expect(service.cancel('shift-1', 'dentist-1', false)).rejects.toThrow(
        ShiftRegistrationNotCancellableException,
      );
    });
  });

  describe('autoCancelPastPending', () => {
    it('returns count of auto-cancelled shifts', async () => {
      (prisma.shiftRegistration.findMany as jest.Mock).mockResolvedValue([
        { id: 's1' },
        { id: 's2' },
        { id: 's3' },
      ]);
      (prisma.shiftRegistration.updateMany as jest.Mock).mockResolvedValue({ count: 3 });
      const count = await service.autoCancelPastPending();
      expect(count).toBe(3);
    });

    it('returns 0 when nothing to cancel', async () => {
      (prisma.shiftRegistration.updateMany as jest.Mock).mockResolvedValue({ count: 0 });
      const count = await service.autoCancelPastPending();
      expect(count).toBe(0);
    });
  });
});

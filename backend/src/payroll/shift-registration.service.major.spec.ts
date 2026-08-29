import { Test } from '@nestjs/testing';
import { ShiftRegistrationService } from './shift-registration.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { ShiftRegistrationStatus } from '@prisma/client';
import {
  ShiftConflictException,
  ShiftRegistrationNotCancellableException,
} from './domain/exceptions';

// Dates below must always resolve in the future relative to whenever the
// suite runs — compute them relative to `Date.now()` instead of hard-coding
// calendar dates that eventually lapse into the past and flip these tests
// to a spurious ShiftPastDateException (see shift-registration.service.spec.ts).
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

describe('ShiftRegistrationService — Major fix coverage (M#4, M#5, M#8, M#9)', () => {
  let service: ShiftRegistrationService;
  let prisma: PrismaService;
  let audit: AuditService;

  const FUTURE_DATE = daysFromNow(30);
  const FUTURE_WEDNESDAY = nextWeekday(3, 14); // matches dayOfWeek: 3 in the WS fixtures below

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
              updateMany: jest.fn().mockResolvedValue({ count: 0 }),
              count: jest.fn().mockResolvedValue(0),
            },
            workingSchedule: { findFirst: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
            encounter: { count: jest.fn().mockResolvedValue(0) },
            $transaction: jest.fn(),
          },
        },
        { provide: AuditService, useValue: { log: jest.fn().mockResolvedValue(undefined) } },
      ],
    }).compile();

    service = module.get(ShiftRegistrationService);
    prisma = module.get(PrismaService);
    audit = module.get(AuditService);
  });

  // ============================================================================
  // M#5: Iterate ALL WorkingSchedules
  // ============================================================================

  describe('M#5 — iterate all matching WorkingSchedules', () => {
    it('rejects when ANY overlapping schedule exists (not just first)', async () => {
      const wsList = [
        {
          id: 'ws-1',
          dentistId: 'dentist-1',
          dayOfWeek: 3,
          startTime: '08:00' as any,
          endTime: '12:00' as any,
        },
        {
          id: 'ws-2',
          dentistId: 'dentist-1',
          dayOfWeek: 3,
          startTime: '14:00' as any,
          endTime: '18:00' as any,
        },
      ];
      (prisma.workingSchedule.findMany as jest.Mock).mockResolvedValue(wsList);
      (prisma.shiftRegistration.findFirst as jest.Mock).mockResolvedValue(null);

      // Try to create a shift 16:00-20:00 → overlaps ws-2 (14-18)
      await expect(
        service.create(
          { date: FUTURE_WEDNESDAY, startTime: '16:00', endTime: '20:00' },
          'dentist-1',
          false,
        ),
      ).rejects.toThrow(ShiftConflictException);
    });

    it('allows non-overlapping shift between two schedules (08-12 and 14-18)', async () => {
      const wsList = [
        {
          id: 'ws-1',
          dentistId: 'dentist-1',
          dayOfWeek: 3,
          startTime: '08:00' as any,
          endTime: '12:00' as any,
        },
        {
          id: 'ws-2',
          dentistId: 'dentist-1',
          dayOfWeek: 3,
          startTime: '14:00' as any,
          endTime: '18:00' as any,
        },
      ];
      (prisma.workingSchedule.findMany as jest.Mock).mockResolvedValue(wsList);
      (prisma.shiftRegistration.findFirst as jest.Mock).mockResolvedValue(null);
      (prisma.shiftRegistration.create as jest.Mock).mockResolvedValue({ id: 'shift-1' });

      // 12:30-13:30 fits in the gap
      const result = await service.create(
        { date: FUTURE_WEDNESDAY, startTime: '12:30', endTime: '13:30' },
        'dentist-1',
        false,
      );
      expect(result.id).toBe('shift-1');
    });
  });

  // ============================================================================
  // M#4: Check PENDING shifts too
  // ============================================================================

  describe('M#4 — block creation when PENDING shift exists', () => {
    it('rejects when BS already has PENDING shift for that date', async () => {
      (prisma.workingSchedule.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.shiftRegistration.findFirst as jest.Mock).mockResolvedValue({
        id: 'pending-1',
        status: ShiftRegistrationStatus.PENDING,
        date: new Date(FUTURE_DATE),
      });

      await expect(
        service.create(
          { date: FUTURE_DATE, startTime: '08:00', endTime: '12:00' },
          'dentist-1',
          false,
        ),
      ).rejects.toThrow(ShiftConflictException);
    });

    it('mentions PENDING (not APPROVED) in error when conflict is PENDING', async () => {
      (prisma.workingSchedule.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.shiftRegistration.findFirst as jest.Mock).mockResolvedValue({
        id: 'pending-1',
        status: ShiftRegistrationStatus.PENDING,
      });

      try {
        await service.create(
          { date: FUTURE_DATE, startTime: '08:00', endTime: '12:00' },
          'dentist-1',
          false,
        );
        fail('Should have thrown');
      } catch (err: any) {
        expect(err.message).toContain('PENDING');
      }
    });

    it('allows creation when only REJECTED shifts exist (terminal)', async () => {
      (prisma.workingSchedule.findMany as jest.Mock).mockResolvedValue([]);
      // findFirst returns null because filter excludes REJECTED
      (prisma.shiftRegistration.findFirst as jest.Mock).mockResolvedValue(null);
      (prisma.shiftRegistration.create as jest.Mock).mockResolvedValue({ id: 'new-shift' });

      const result = await service.create(
        { date: FUTURE_DATE, startTime: '08:00', endTime: '12:00' },
        'dentist-1',
        false,
      );
      expect(result.id).toBe('new-shift');
    });
  });

  // ============================================================================
  // M#8: Late cancel by admin is audit-logged with recommendation
  // ============================================================================

  describe('M#8 — admin late cancel triggers BR-PAY-014 audit recommendation', () => {
    it('flags late cancel < 24h with recommendation', async () => {
      // Shift in 2 hours
      const now = new Date();
      const shiftStart = new Date(now.getTime() + 2 * 3_600_000);
      const hh = String(shiftStart.getUTCHours()).padStart(2, '0');
      const mm = String(shiftStart.getUTCMinutes()).padStart(2, '0');

      (prisma.shiftRegistration.findUnique as jest.Mock).mockResolvedValue({
        id: 'shift-1',
        dentistId: 'dentist-1',
        date: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())),
        startTime: `${hh}:${mm}`,
        status: ShiftRegistrationStatus.APPROVED,
      });
      (prisma.shiftRegistration.update as jest.Mock).mockResolvedValue({
        id: 'shift-1',
        status: ShiftRegistrationStatus.CANCELLED,
      });

      await service.cancel('shift-1', 'admin-1', true);

      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'SHIFT_CANCELLED',
          metadata: expect.objectContaining({
            lateCancelByAdmin: true,
            recommendation: expect.stringContaining('PayrollAdjustment'),
          }),
        }),
      );
    });

    it('does NOT flag when admin cancels ≥ 24h before', async () => {
      (prisma.shiftRegistration.findUnique as jest.Mock).mockResolvedValue({
        id: 'shift-2',
        dentistId: 'dentist-1',
        date: new Date(FUTURE_DATE),
        startTime: '09:00',
        status: ShiftRegistrationStatus.APPROVED,
      });
      (prisma.shiftRegistration.update as jest.Mock).mockResolvedValue({
        id: 'shift-2',
        status: ShiftRegistrationStatus.CANCELLED,
      });

      await service.cancel('shift-2', 'admin-1', true);

      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: expect.objectContaining({
            lateCancelByAdmin: false,
          }),
        }),
      );
    });

    it('BS cancel still blocks < 24h', async () => {
      const now = new Date();
      const shiftStart = new Date(now.getTime() + 2 * 3_600_000);
      const hh = String(shiftStart.getUTCHours()).padStart(2, '0');
      const mm = String(shiftStart.getUTCMinutes()).padStart(2, '0');

      (prisma.shiftRegistration.findUnique as jest.Mock).mockResolvedValue({
        id: 'shift-3',
        dentistId: 'dentist-1',
        date: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())),
        startTime: `${hh}:${mm}`,
        status: ShiftRegistrationStatus.APPROVED,
      });

      await expect(service.cancel('shift-3', 'dentist-1', false)).rejects.toThrow(
        ShiftRegistrationNotCancellableException,
      );
    });
  });

  // ============================================================================
  // M#9: No-show detection
  // ============================================================================

  describe('M#9 — detectNoShowShifts', () => {
    it('returns shifts with 0 completed encounters on that date', async () => {
      const approvedShifts = [
        {
          id: 'shift-noshow-1',
          dentistId: 'dentist-1',
          date: new Date('2026-08-19'),
          dentist: { id: 'dentist-1', fullName: 'Dr. A' },
        },
        {
          id: 'shift-worked-1',
          dentistId: 'dentist-2',
          date: new Date('2026-08-19'),
          dentist: { id: 'dentist-2', fullName: 'Dr. B' },
        },
      ];
      (prisma.shiftRegistration.findMany as jest.Mock).mockResolvedValue(approvedShifts);

      // dentist-1 has 0 encounters, dentist-2 has 2
      (prisma.encounter.count as jest.Mock).mockImplementation(({ where }) => {
        if (where.dentistId === 'dentist-1') return Promise.resolve(0);
        return Promise.resolve(2);
      });

      const noShows = await service.detectNoShowShifts(
        new Date('2026-08-01'),
        new Date('2026-08-31'),
      );

      expect(noShows).toHaveLength(1);
      expect(noShows[0].shiftId).toBe('shift-noshow-1');
      expect(noShows[0].dentistName).toBe('Dr. A');
    });

    it('returns empty when all shifts have encounters', async () => {
      (prisma.shiftRegistration.findMany as jest.Mock).mockResolvedValue([
        {
          id: 's-1',
          dentistId: 'd-1',
          date: new Date('2026-08-19'),
          dentist: { id: 'd-1', fullName: 'Dr. A' },
        },
      ]);
      (prisma.encounter.count as jest.Mock).mockResolvedValue(3);

      const noShows = await service.detectNoShowShifts(
        new Date('2026-08-01'),
        new Date('2026-08-31'),
      );

      expect(noShows).toHaveLength(0);
    });
  });
});

import { Test } from '@nestjs/testing';
import { AppointmentsService } from './appointments.service';
import { AvailabilityService } from './availability.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { createPrismaMock, PrismaMockShape, asTransaction } from '../../test/helpers/prisma-mock';
import { adminPayload, dentistPayload, receptionistPayload } from '../../test/helpers';
import { AppointmentStatus, EncounterStatus, Prisma } from '@prisma/client';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { AppointmentNotFoundException, SlotConflictException } from './domain/exceptions';
import { clinicDateOnly } from '../common/date-range.util';

describe('AppointmentsService', () => {
  let service: AppointmentsService;
  let prisma: PrismaMockShape;
  let audit: { log: jest.Mock };
  let events: { emit: jest.Mock };
  const actor = adminPayload();
  // Records time-off as effective immediately (BR-SCH-001).
  const approver = { ...actor, permissions: [...actor.permissions, 'time_off.approve'] };

  beforeEach(async () => {
    prisma = createPrismaMock();
    asTransaction(prisma);
    audit = { log: jest.fn().mockResolvedValue(undefined) };
    events = { emit: jest.fn() };

    const module = await Test.createTestingModule({
      providers: [
        AppointmentsService,
        AvailabilityService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditService, useValue: audit },
        { provide: EventEmitter2, useValue: events },
      ],
    }).compile();

    service = module.get(AppointmentsService);
  });

  afterEach(() => jest.clearAllMocks());

  it('returns clinic-time slots and excludes a booking at 08:00 Vietnam time', async () => {
    (prisma.workingSchedule.findMany as jest.Mock).mockResolvedValue([
      {
        startTime: new Date('1970-01-01T08:00:00Z'),
        endTime: new Date('1970-01-01T09:00:00Z'),
        slotDurationMin: 30,
      },
    ]);
    (prisma.appointment.findMany as jest.Mock).mockResolvedValue([
      {
        startAt: new Date('2099-09-16T01:00:00Z'),
        endAt: new Date('2099-09-16T01:30:00Z'),
      },
    ]);
    (prisma.timeOff.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.shiftRegistration.findMany as jest.Mock).mockResolvedValue([]);
    const result = await service.getAvailability({ dentistId: 'dentist-1', date: '2099-09-16' });
    expect(result.availableSlots).toEqual(['08:30']);
    // The clinic day 2099-09-16 (+07:00), read by overlap.
    expect(prisma.appointment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          startAt: { lt: new Date('2099-09-16T17:00:00Z') },
          endAt: { gt: new Date('2099-09-15T17:00:00Z') },
        }),
      }),
    );
  });

  describe('list', () => {
    it('returns paginated appointments', async () => {
      const mockList = [
        {
          id: 'appt-1',
          patientId: 'patient-1',
          dentistId: 'dentist-1',
          startAt: new Date('2026-08-01T09:00:00Z'),
          endAt: new Date('2026-08-01T09:30:00Z'),
          status: AppointmentStatus.SCHEDULED,
        },
        {
          id: 'appt-2',
          patientId: 'patient-2',
          dentistId: 'dentist-1',
          startAt: new Date('2026-08-01T10:00:00Z'),
          endAt: new Date('2026-08-01T10:30:00Z'),
          status: AppointmentStatus.CONFIRMED,
        },
      ];

      (prisma.appointment.findMany as jest.Mock).mockResolvedValue(mockList);
      (prisma.appointment.count as jest.Mock).mockResolvedValue(2);

      const result = await service.list({ pageSize: 10 }, actor);

      expect(result.data).toHaveLength(2);
      expect(result.pagination.pageSize).toBe(10);
      // A stable order for cursor paging: same-time bookings by id.
      expect(prisma.appointment.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ orderBy: [{ startAt: 'asc' }, { id: 'asc' }], take: 11 }),
      );
    });

    it('handles empty result set', async () => {
      (prisma.appointment.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.appointment.count as jest.Mock).mockResolvedValue(0);

      const result = await service.list({}, actor);

      expect(result.data).toEqual([]);
      expect(result.pagination.hasMore).toBe(false);
    });
  });

  describe('listDentistOptions', () => {
    it('returns dentists taking bookings with their calendar colour', async () => {
      (prisma.user.findMany as jest.Mock).mockResolvedValue([
        {
          id: 'dentist-1',
          fullName: 'Bác sĩ Nguyễn An',
          dentistProfile: { calendarColor: '#2563EB', practiceStatus: 'ACTIVE' },
        },
      ]);

      const result = await service.listDentistOptions();

      expect(result).toEqual([
        {
          id: 'dentist-1',
          fullName: 'Bác sĩ Nguyễn An',
          calendarColor: '#2563EB',
          practiceStatus: 'ACTIVE',
        },
      ]);
      expect(prisma.user.findMany).toHaveBeenCalledWith({
        where: {
          // PENDING_SETUP accounts (new dentist, owner who also practises)
          // are bookable; only deactivated ones are left out.
          status: { not: 'DEACTIVATED' },
          deactivatedAt: null,
          deletedAt: null,
          userRoles: {
            some: {
              role: {
                code: 'dentist',
                deletedAt: null,
              },
            },
          },
          OR: [
            // A bare dentist role (no profile yet) stays bookable, as before.
            { dentistProfile: null },
            {
              dentistProfile: {
                deletedAt: null,
                practiceStatus: 'ACTIVE',
                employee: { employmentStatus: 'ACTIVE' },
              },
            },
          ],
        },
        select: {
          id: true,
          fullName: true,
          dentistProfile: { select: { calendarColor: true, practiceStatus: true } },
        },
        orderBy: {
          fullName: 'asc',
        },
      });
    });

    it('also lists suspended and on-leave dentists for schedule management', async () => {
      (prisma.user.findMany as jest.Mock).mockResolvedValue([]);

      await service.listDentistOptions('schedule');

      expect(
        (prisma.user.findMany as jest.Mock).mock.calls[0][0].where.OR[1].dentistProfile,
      ).toEqual({
        deletedAt: null,
        practiceStatus: { in: ['ACTIVE', 'SUSPENDED'] },
        employee: { employmentStatus: { not: 'TERMINATED' } },
      });
    });
  });

  describe('validateDentist (account and employment status)', () => {
    const dentist = (overrides: Record<string, unknown> = {}) => ({
      id: 'dentist-1',
      status: 'ACTIVE',
      deactivatedAt: null,
      deletedAt: null,
      userRoles: [{ role: { code: 'dentist' } }],
      dentistProfile: {
        practiceStatus: 'ACTIVE',
        deletedAt: null,
        employee: { employmentStatus: 'ACTIVE' },
      },
      ...overrides,
    });

    it('accepts a PENDING_SETUP account for bookings', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(dentist({ status: 'PENDING_SETUP' }));
      await expect(service.validateDentist('dentist-1')).resolves.toMatchObject({
        id: 'dentist-1',
      });
    });

    it('rejects a deactivated account', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(
        dentist({ status: 'DEACTIVATED', deactivatedAt: new Date() }),
      );
      await expect(service.validateDentist('dentist-1')).rejects.toThrow(/không còn hoạt động/);
      await expect(service.validateDentist('dentist-1', { forBooking: false })).rejects.toThrow(
        /không còn hoạt động/,
      );
    });

    it('refuses new bookings for a dentist on leave but lets their schedule be managed', async () => {
      const onLeave = dentist({
        dentistProfile: {
          practiceStatus: 'ACTIVE',
          deletedAt: null,
          employee: { employmentStatus: 'ON_LEAVE' },
        },
      });
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(onLeave);
      await expect(service.validateDentist('dentist-1')).rejects.toThrow(/tạm nghỉ/);
      await expect(service.validateDentist('dentist-1', { forBooking: false })).resolves.toBe(
        onLeave,
      );
    });
  });

  describe('checkIn', () => {
    it('transitions scheduled appointment to checked_in', async () => {
      // Start time within check-in window (15 minutes before to 30 minutes after)
      const existing = {
        id: 'appt-1',
        status: AppointmentStatus.SCHEDULED,
        patientId: 'patient-1',
        dentistId: 'dentist-1',
        startAt: new Date(Date.now() + 5 * 60 * 1000),
        endAt: new Date(Date.now() + 35 * 60 * 1000),
      };

      (prisma.appointment.findUnique as jest.Mock).mockResolvedValue(existing);
      (prisma.patient.findUnique as jest.Mock).mockResolvedValue({
        id: 'patient-1',
        deletedAt: null,
      });
      (prisma.appointment.updateMany as jest.Mock).mockResolvedValue({ count: 1 });
      (prisma.appointment.findUniqueOrThrow as jest.Mock).mockResolvedValue({
        ...existing,
        status: AppointmentStatus.CHECKED_IN,
      });

      const result = await service.checkIn('appt-1', false, undefined, actor);

      expect(result.status).toBe(AppointmentStatus.CHECKED_IN);
      expect(audit.log).toHaveBeenCalled();
    });

    it('rejects check-in when appointment is already cancelled', async () => {
      const existing = {
        id: 'appt-1',
        status: AppointmentStatus.CANCELLED,
        startAt: new Date(Date.now() + 60 * 60 * 1000),
        endAt: new Date(Date.now() + 2 * 60 * 60 * 1000),
      };

      (prisma.appointment.findUnique as jest.Mock).mockResolvedValue(existing);

      await expect(service.checkIn('appt-1', false, undefined, actor)).rejects.toThrow();
    });

    it('throws instead of silently overwriting a concurrent status change', async () => {
      // Two receptionists (or a shift handoff) acting on the same
      // appointment at once: both reads pass the status check, but by the
      // time this write runs someone else's action (cancel, no-show...)
      // already changed the row. The guarded updateMany matches 0 rows —
      // this must surface as a conflict, not silently check the patient in
      // over a cancellation that already happened.
      const existing = {
        id: 'appt-1',
        status: AppointmentStatus.SCHEDULED,
        patientId: 'patient-1',
        dentistId: 'dentist-1',
        startAt: new Date(Date.now() + 5 * 60 * 1000),
        endAt: new Date(Date.now() + 35 * 60 * 1000),
      };
      (prisma.appointment.findUnique as jest.Mock).mockResolvedValue(existing);
      (prisma.patient.findUnique as jest.Mock).mockResolvedValue({
        id: 'patient-1',
        deletedAt: null,
      });
      (prisma.appointment.updateMany as jest.Mock).mockResolvedValue({ count: 0 });

      await expect(service.checkIn('appt-1', false, undefined, actor)).rejects.toThrow(
        /vừa được thay đổi/,
      );
      expect(prisma.appointment.findUniqueOrThrow).not.toHaveBeenCalled();
    });

    it('guards on time, dentist and reschedule count and queues the row as written', async () => {
      const existing = {
        id: 'appt-1',
        status: AppointmentStatus.CONFIRMED,
        patientId: 'patient-1',
        dentistId: 'dentist-1',
        visitKind: 'BOOKED',
        rescheduleCount: 1,
        startAt: new Date(Date.now() + 5 * 60 * 1000),
        endAt: new Date(Date.now() + 35 * 60 * 1000),
      };
      (prisma.appointment.findUnique as jest.Mock).mockResolvedValue(existing);
      (prisma.patient.findUnique as jest.Mock).mockResolvedValue({
        id: 'patient-1',
        deletedAt: null,
      });
      (prisma.appointment.updateMany as jest.Mock).mockResolvedValue({ count: 1 });
      (prisma.appointment.findUniqueOrThrow as jest.Mock).mockResolvedValue({
        ...existing,
        dentistId: 'dentist-2',
        status: AppointmentStatus.CHECKED_IN,
      });

      await service.checkIn('appt-1', false, undefined, actor);

      expect(prisma.appointment.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            id: 'appt-1',
            status: AppointmentStatus.CONFIRMED,
            startAt: existing.startAt,
            dentistId: 'dentist-1',
            rescheduleCount: 1,
          },
        }),
      );
      expect(prisma.queueEntry.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({ dentistId: 'dentist-2' }),
        }),
      );
    });
  });

  describe('cancel', () => {
    it('cancels scheduled appointment with reason', async () => {
      const existing = {
        id: 'appt-1',
        status: AppointmentStatus.SCHEDULED,
        startAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        endAt: new Date(Date.now() + 25 * 60 * 60 * 1000),
      };

      (prisma.appointment.findUnique as jest.Mock).mockResolvedValue(existing);
      (prisma.appointment.updateMany as jest.Mock).mockResolvedValue({ count: 1 });
      (prisma.appointment.findUniqueOrThrow as jest.Mock).mockResolvedValue({
        ...existing,
        status: AppointmentStatus.CANCELLED,
      });

      const result = await service.cancel(
        'appt-1',
        { reason: 'Patient unavailable' } as any,
        actor,
      );

      expect(result.status).toBe(AppointmentStatus.CANCELLED);
      expect(audit.log).toHaveBeenCalled();
    });
  });

  describe('cancel / update — closed statuses (Vietnamese errors)', () => {
    const closed = {
      id: 'appt-1',
      dentistId: 'dentist-1',
      patientId: 'patient-1',
      startAt: new Date(Date.now() - 60 * 60 * 1000),
      endAt: new Date(Date.now() - 30 * 60 * 1000),
      rescheduleCount: 0,
    };

    it('refuses to cancel a LEFT appointment', async () => {
      (prisma.appointment.findUnique as jest.Mock).mockResolvedValue({
        ...closed,
        status: AppointmentStatus.LEFT,
      });

      await expect(
        service.cancel('appt-1', { reason: 'Hủy lịch đã về' } as any, actor),
      ).rejects.toThrow(/Không thể hủy lịch hẹn ở trạng thái "đã về \(chưa khám\)"/);
      expect(prisma.appointment.updateMany).not.toHaveBeenCalled();
    });

    it.each([
      [AppointmentStatus.IN_PROGRESS, 'đang khám'],
      [AppointmentStatus.LEFT, 'đã về (chưa khám)'],
    ])('refuses to edit a %s appointment in Vietnamese', async (status, label) => {
      (prisma.appointment.findUnique as jest.Mock).mockResolvedValue({ ...closed, status });

      await expect(service.update('appt-1', { notes: 'x' } as any, actor)).rejects.toThrow(
        `Không thể sửa lịch hẹn ở trạng thái "${label}"`,
      );
      expect(prisma.appointment.update).not.toHaveBeenCalled();
    });
  });

  describe('legacy /appointments/shift-registrations approve/reject', () => {
    const pending = {
      id: 'shift-1',
      dentistId: 'dentist-1',
      date: new Date('2099-01-06'),
      startTime: '18:00',
      endTime: '21:00',
      status: 'PENDING',
    };

    it('refuses to approve a shift of a past clinic day', async () => {
      (prisma.shiftRegistration.findUnique as jest.Mock).mockResolvedValue({
        ...pending,
        date: new Date('2020-01-01'),
      });

      await expect(service.approveShiftRegistration('shift-1', undefined, actor)).rejects.toThrow(
        /ngày đã qua/,
      );
      expect(prisma.shiftRegistration.updateMany).not.toHaveBeenCalled();
    });

    it('approves only a row still PENDING and surfaces a concurrent decision', async () => {
      (prisma.shiftRegistration.findUnique as jest.Mock).mockResolvedValue(pending);
      (prisma.shiftRegistration.updateMany as jest.Mock).mockResolvedValue({ count: 0 });

      await expect(service.approveShiftRegistration('shift-1', undefined, actor)).rejects.toThrow(
        /vừa được thay đổi/,
      );
      expect(prisma.shiftRegistration.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'shift-1', status: 'PENDING' } }),
      );
      expect(audit.log).not.toHaveBeenCalled();
    });

    it('rejects with the same guarded write', async () => {
      (prisma.shiftRegistration.findUnique as jest.Mock).mockResolvedValue(pending);
      (prisma.shiftRegistration.updateMany as jest.Mock).mockResolvedValue({ count: 1 });
      (prisma.shiftRegistration.findUniqueOrThrow as jest.Mock).mockResolvedValue({
        ...pending,
        status: 'REJECTED',
      });

      const result = await service.rejectShiftRegistration('shift-1', 'Không đủ nhân sự', actor);

      expect(result.status).toBe('REJECTED');
      expect(prisma.shiftRegistration.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'shift-1', status: 'PENDING' } }),
      );
    });
  });

  describe('dentist profiles (BR-STAFF-006)', () => {
    const base = {
      id: 'dentist-1',
      status: 'ACTIVE',
      userRoles: [{ role: { code: 'dentist' } }],
    };
    const profile = (overrides: Record<string, unknown> = {}) => ({
      practiceStatus: 'ACTIVE',
      defaultSlotMinutes: 45,
      deletedAt: null,
      ...overrides,
    });

    beforeEach(() => {
      (prisma.patient.findUnique as jest.Mock).mockResolvedValue({
        id: 'patient-1',
        deletedAt: null,
      });
      (prisma.workingSchedule.findMany as jest.Mock).mockResolvedValue([
        {
          startTime: new Date('1970-01-01T00:00:00Z'),
          endTime: new Date('1970-01-01T23:00:00Z'),
        },
      ]);
      (prisma.timeOff.findFirst as jest.Mock).mockResolvedValue(null);
      (prisma.appointment.findFirst as jest.Mock).mockResolvedValue(null);
      (prisma.appointment.create as jest.Mock).mockResolvedValue({ id: 'appt-new' });
    });

    it('refuses a booking for a suspended dentist', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({
        ...base,
        dentistProfile: profile({ practiceStatus: 'SUSPENDED' }),
      });
      await expect(
        service.create(
          {
            dentistId: 'dentist-1',
            patientId: 'patient-1',
            startAt: '2027-03-15T09:15:00Z',
          } as any,
          actor,
        ),
      ).rejects.toThrow(/tạm ngưng/);
      expect(prisma.appointment.create).not.toHaveBeenCalled();
    });

    it("defaults the duration to the profile's slot length", async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({
        ...base,
        dentistProfile: profile(),
      });
      await service.create(
        { dentistId: 'dentist-1', patientId: 'patient-1', startAt: '2027-03-15T09:15:00Z' } as any,
        actor,
      );
      expect((prisma.appointment.create as jest.Mock).mock.calls[0][0].data.endAt).toEqual(
        new Date('2027-03-15T10:00:00Z'),
      );
    });

    it('still accepts a dentist without a profile by role', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({ ...base, dentistProfile: null });
      await service.create(
        { dentistId: 'dentist-1', patientId: 'patient-1', startAt: '2027-03-15T09:15:00Z' } as any,
        actor,
      );
      expect(prisma.appointment.create).toHaveBeenCalled();
    });
  });

  describe('create — slot overlap detection', () => {
    const dentist = {
      id: 'dentist-1',
      status: 'ACTIVE',
      userRoles: [{ role: { code: 'dentist' } }],
    };
    const patient = { id: 'patient-1', deletedAt: null };
    const workingSchedule = {
      dayOfWeek: new Date('2027-03-15T09:15:00Z').getUTCDay(),
      startTime: new Date('1970-01-01T00:00:00Z'),
      endTime: new Date('1970-01-01T23:00:00Z'),
    };

    beforeEach(() => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(dentist);
      (prisma.patient.findUnique as jest.Mock).mockResolvedValue(patient);
      (prisma.workingSchedule.findMany as jest.Mock).mockResolvedValue([workingSchedule]);
      (prisma.timeOff.findFirst as jest.Mock).mockResolvedValue(null);
      (prisma.appointment.create as jest.Mock).mockResolvedValue({ id: 'appt-new' });
    });

    it('checks the dentist day by overlap, not an exact startAt match: 09:00–09:30 blocks 09:15–09:45', async () => {
      (prisma.appointment.findMany as jest.Mock).mockResolvedValue([
        {
          id: 'appt-existing',
          startAt: new Date('2027-03-15T09:00:00Z'),
          endAt: new Date('2027-03-15T09:30:00Z'),
        },
      ]);

      await expect(
        service.create(
          {
            dentistId: 'dentist-1',
            patientId: 'patient-1',
            startAt: '2027-03-15T09:15:00Z',
          } as any,
          actor,
        ),
      ).rejects.toBeInstanceOf(SlotConflictException);
      // One read of the whole clinic day (2027-03-15 +07:00), by overlap.
      expect(prisma.appointment.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            startAt: { lt: new Date('2027-03-15T17:00:00Z') },
            endAt: { gt: new Date('2027-03-14T17:00:00Z') },
          }),
        }),
      );
      expect(prisma.appointment.create).not.toHaveBeenCalled();
    });

    it('accepts a booking that starts exactly when the previous one ends', async () => {
      (prisma.appointment.findMany as jest.Mock).mockResolvedValue([
        {
          id: 'appt-existing',
          startAt: new Date('2027-03-15T08:45:00Z'),
          endAt: new Date('2027-03-15T09:15:00Z'),
        },
      ]);
      (prisma.appointment.findFirst as jest.Mock).mockResolvedValue(null);

      await service.create(
        { dentistId: 'dentist-1', patientId: 'patient-1', startAt: '2027-03-15T09:15:00Z' } as any,
        actor,
      );
      expect(prisma.appointment.create).toHaveBeenCalled();
    });

    it('honors a client-provided endAt instead of always defaulting the slot length', async () => {
      (prisma.appointment.findFirst as jest.Mock).mockResolvedValue(null);

      await service.create(
        {
          dentistId: 'dentist-1',
          patientId: 'patient-1',
          startAt: '2027-03-15T09:15:00Z',
          endAt: '2027-03-15T10:45:00Z',
        } as any,
        actor,
      );

      const createArg = (prisma.appointment.create as jest.Mock).mock.calls[0][0].data;
      expect(createArg.endAt).toEqual(new Date('2027-03-15T10:45:00Z'));
    });

    it('defaults endAt from the slot length when endAt is not provided', async () => {
      (prisma.appointment.findFirst as jest.Mock).mockResolvedValue(null);

      await service.create(
        { dentistId: 'dentist-1', patientId: 'patient-1', startAt: '2027-03-15T09:15:00Z' } as any,
        actor,
      );

      const createArg = (prisma.appointment.create as jest.Mock).mock.calls[0][0].data;
      expect(createArg.endAt).toEqual(new Date('2027-03-15T09:45:00Z'));
    });

    it('rejects a client-provided endAt that is not after startAt', async () => {
      (prisma.appointment.findFirst as jest.Mock).mockResolvedValue(null);

      await expect(
        service.create(
          {
            dentistId: 'dentist-1',
            patientId: 'patient-1',
            startAt: '2027-03-15T09:15:00Z',
            endAt: '2027-03-15T09:00:00Z',
          } as any,
          actor,
        ),
      ).rejects.toThrow();
    });
  });

  describe('row-level scope (BR-APPT-024) — dentist may only act on their own appointments', () => {
    const dentistActor = dentistPayload('dentist-self');
    const otherDentistAppt = {
      id: 'appt-1',
      dentistId: 'dentist-other',
      status: AppointmentStatus.SCHEDULED,
      startAt: new Date(Date.now() + 48 * 60 * 60 * 1000),
      endAt: new Date(Date.now() + 49 * 60 * 60 * 1000),
      rescheduleCount: 0,
    };

    it("update() 404s on another dentist's appointment (regression: used to let any appointment.update holder edit anyone's appointment)", async () => {
      (prisma.appointment.findUnique as jest.Mock).mockResolvedValue(otherDentistAppt);

      await expect(
        service.update('appt-1', { notes: 'hijacked' } as any, dentistActor),
      ).rejects.toThrow();
      expect(prisma.appointment.update).not.toHaveBeenCalled();
    });

    it("reschedule() 404s on another dentist's appointment", async () => {
      (prisma.appointment.findUnique as jest.Mock).mockResolvedValue(otherDentistAppt);

      await expect(
        service.reschedule(
          'appt-1',
          { newStartsAt: '2099-01-01T09:00:00Z', newEndsAt: '2099-01-01T09:30:00Z' } as any,
          dentistActor,
        ),
      ).rejects.toThrow();
    });

    it('cancel() 404s on another dentist\'s appointment (regression: the old fallback branch only checked "before start time", not ownership, so a dentist could cancel a colleague\'s future appointment)', async () => {
      (prisma.appointment.findUnique as jest.Mock).mockResolvedValue(otherDentistAppt);

      await expect(
        service.cancel('appt-1', { reason: 'not mine' } as any, dentistActor),
      ).rejects.toThrow();
      expect(prisma.appointment.update).not.toHaveBeenCalled();
    });

    it("cancel() still works for a dentist's own appointment ≥24h out", async () => {
      const ownAppt = { ...otherDentistAppt, dentistId: 'dentist-self' };
      (prisma.appointment.findUnique as jest.Mock).mockResolvedValue(ownAppt);
      (prisma.appointment.updateMany as jest.Mock).mockResolvedValue({ count: 1 });
      (prisma.appointment.findUniqueOrThrow as jest.Mock).mockResolvedValue({
        ...ownAppt,
        status: AppointmentStatus.CANCELLED,
      });

      const result = await service.cancel('appt-1', { reason: 'ok' } as any, dentistActor);
      expect(result.status).toBe(AppointmentStatus.CANCELLED);
    });

    it("startEncounter() 404s on another dentist's appointment (regression: no ownership check at all previously)", async () => {
      (prisma.appointment.findUnique as jest.Mock).mockResolvedValue({
        ...otherDentistAppt,
        status: AppointmentStatus.CHECKED_IN,
      });

      await expect(service.startEncounter('appt-1', dentistActor)).rejects.toThrow();
    });

    it("startEncounter() still works for a dentist's own checked-in appointment", async () => {
      const ownAppt = {
        ...otherDentistAppt,
        patientId: 'patient-9',
        dentistId: 'dentist-self',
        status: AppointmentStatus.CHECKED_IN,
      };
      (prisma.appointment.findUnique as jest.Mock).mockResolvedValue(ownAppt);
      (prisma.encounter.findUnique as jest.Mock).mockResolvedValue(null);
      (prisma.appointment.update as jest.Mock).mockResolvedValue({
        ...ownAppt,
        status: AppointmentStatus.IN_PROGRESS,
      });
      (prisma.encounter.create as jest.Mock).mockResolvedValue({
        id: 'encounter-1',
        status: EncounterStatus.IN_PROGRESS,
      });

      const result = await service.startEncounter('appt-1', dentistActor);
      expect(result.status).toBe(AppointmentStatus.IN_PROGRESS);
      expect(result.encounter.id).toBe('encounter-1');
      expect(prisma.appointment.update).toHaveBeenCalledTimes(1);
      expect(prisma.encounter.create).toHaveBeenCalledTimes(1);
      // BR-APPT-034: the start is in the visit's history, in the same transaction.
      expect(prisma.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          action: 'APPOINTMENT_EXAM_STARTED',
          targetType: 'appointment',
          targetId: 'appt-1',
          metadata: { encounterId: 'encounter-1' },
        }),
      });
    });

    it('startEncounter() recovers an IN_PROGRESS appointment missing its encounter', async () => {
      const ownAppt = {
        ...otherDentistAppt,
        dentistId: 'dentist-self',
        status: AppointmentStatus.IN_PROGRESS,
      };
      (prisma.appointment.findUnique as jest.Mock).mockResolvedValue(ownAppt);
      (prisma.encounter.findUnique as jest.Mock).mockResolvedValue(null);
      (prisma.encounter.create as jest.Mock).mockResolvedValue({ id: 'encounter-recovered' });

      const result = await service.startEncounter('appt-1', dentistActor);

      expect(result.encounter.id).toBe('encounter-recovered');
      expect(prisma.appointment.update).not.toHaveBeenCalled();
      // Already IN_PROGRESS: no second "exam started" entry.
      expect(prisma.auditLog.create).not.toHaveBeenCalled();
    });

    it('startEncounter() restarts an encounter cancelled as started by mistake on the same row', async () => {
      const ownAppt = {
        ...otherDentistAppt,
        patientId: 'patient-9',
        dentistId: 'dentist-self',
        status: AppointmentStatus.CHECKED_IN,
      };
      (prisma.appointment.findUnique as jest.Mock).mockResolvedValue(ownAppt);
      (prisma.encounter.findUnique as jest.Mock).mockResolvedValue({
        id: 'encounter-cancelled',
        status: EncounterStatus.CANCELLED,
        dentistId: 'dentist-self',
        startedAt: new Date('2026-09-01T01:00:00Z'),
      });
      (prisma.appointment.update as jest.Mock).mockResolvedValue({
        ...ownAppt,
        status: AppointmentStatus.IN_PROGRESS,
      });

      const result = await service.startEncounter('appt-1', dentistActor);

      expect(result.encounter.id).toBe('encounter-cancelled');
      expect(prisma.encounter.create).not.toHaveBeenCalled();
      expect(prisma.encounter.update).toHaveBeenCalledWith({
        where: { id: 'encounter-cancelled' },
        data: expect.objectContaining({
          status: EncounterStatus.IN_PROGRESS,
          dentistId: 'dentist-self',
          cancelledAt: null,
        }),
      });
      expect(prisma.encounterAudit.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ action: 'REOPENED', encounterId: 'encounter-cancelled' }),
      });
      expect(events.emit).toHaveBeenCalledWith('patient.clinical_data.changed', {
        patientId: ownAppt.patientId,
      });
    });

    it('startEncounter() announces a newly opened encounter after commit, not an idempotent re-entry', async () => {
      const ownAppt = {
        ...otherDentistAppt,
        patientId: 'patient-9',
        dentistId: 'dentist-self',
        status: AppointmentStatus.CHECKED_IN,
      };
      (prisma.appointment.findUnique as jest.Mock).mockResolvedValue(ownAppt);
      (prisma.encounter.findUnique as jest.Mock).mockResolvedValueOnce(null);
      (prisma.encounter.create as jest.Mock).mockResolvedValue({ id: 'enc-new' });
      (prisma.appointment.update as jest.Mock).mockResolvedValue(ownAppt);

      await service.startEncounter('appt-1', dentistActor);
      expect(events.emit).toHaveBeenCalledWith('patient.clinical_data.changed', {
        patientId: ownAppt.patientId,
      });

      events.emit.mockClear();
      (prisma.appointment.findUnique as jest.Mock).mockResolvedValue({
        ...ownAppt,
        status: AppointmentStatus.IN_PROGRESS,
      });
      (prisma.encounter.findUnique as jest.Mock).mockResolvedValueOnce({
        id: 'enc-new',
        status: EncounterStatus.IN_PROGRESS,
      });
      await service.startEncounter('appt-1', dentistActor);
      expect(events.emit).not.toHaveBeenCalledWith(
        'patient.clinical_data.changed',
        expect.anything(),
      );
    });

    it("markNoShow() 404s on another dentist's appointment (dentist gained appointment.no_show in this pass; this check ships alongside that grant so it doesn't newly expose the same ownership gap)", async () => {
      (prisma.appointment.findUnique as jest.Mock).mockResolvedValue(otherDentistAppt);

      await expect(service.markNoShow('appt-1', {} as any, dentistActor)).rejects.toThrow();
      expect(prisma.appointment.update).not.toHaveBeenCalled();
    });

    it("markNoShow() still works for a dentist's own appointment", async () => {
      const ownAppt = {
        ...otherDentistAppt,
        dentistId: 'dentist-self',
        startAt: new Date(Date.now() - 20 * 60 * 1000),
        endAt: new Date(Date.now() + 10 * 60 * 1000),
      };
      (prisma.appointment.findUnique as jest.Mock).mockResolvedValue(ownAppt);
      (prisma.appointment.updateMany as jest.Mock).mockResolvedValue({ count: 1 });
      (prisma.appointment.findUniqueOrThrow as jest.Mock).mockResolvedValue({
        ...ownAppt,
        status: AppointmentStatus.NO_SHOW,
      });

      const result = await service.markNoShow('appt-1', {} as any, dentistActor);
      expect(result.status).toBe(AppointmentStatus.NO_SHOW);
    });
  });

  describe('getWaitingQueue (row-level)', () => {
    it('forces a dentist-scoped caller to their own id regardless of a client-supplied dentistId', async () => {
      (prisma.appointment.findMany as jest.Mock).mockResolvedValue([]);
      const dentistActor = dentistPayload('dentist-self');

      await service.getWaitingQueue('some-other-dentist', undefined, dentistActor);

      const whereArg = (prisma.appointment.findMany as jest.Mock).mock.calls[0][0].where;
      expect(whereArg.dentistId).toBe('dentist-self');
    });

    it("lets a receptionist (no appointment.read.own) query any dentist's queue", async () => {
      (prisma.appointment.findMany as jest.Mock).mockResolvedValue([]);
      const receptionist = receptionistPayload();

      await service.getWaitingQueue('some-dentist', undefined, receptionist);

      const whereArg = (prisma.appointment.findMany as jest.Mock).mock.calls[0][0].where;
      expect(whereArg.dentistId).toBe('some-dentist');
    });
  });

  describe('markNoShow', () => {
    const started = {
      id: 'appt-1',
      status: AppointmentStatus.CONFIRMED,
      startAt: new Date(Date.now() - 20 * 60 * 1000),
      endAt: new Date(Date.now() + 10 * 60 * 1000),
    };

    it('transitions to no_show when patient misses appointment', async () => {
      (prisma.appointment.findUnique as jest.Mock).mockResolvedValue(started);
      (prisma.appointment.updateMany as jest.Mock).mockResolvedValue({ count: 1 });
      (prisma.appointment.findUniqueOrThrow as jest.Mock).mockResolvedValue({
        ...started,
        status: AppointmentStatus.NO_SHOW,
      });

      const result = await service.markNoShow('appt-1', {} as any, actor);

      expect(result.status).toBe(AppointmentStatus.NO_SHOW);
      expect(audit.log).toHaveBeenCalled();
      // Guarded on the start too, so a concurrent move to later can't be marked.
      const where = (prisma.appointment.updateMany as jest.Mock).mock.calls[0][0].where;
      expect(where).toEqual(
        expect.objectContaining({
          status: AppointmentStatus.CONFIRMED,
          startAt: { lte: expect.any(Date) },
        }),
      );
    });

    it('refuses before the appointment starts (a call-ahead is a cancellation)', async () => {
      (prisma.appointment.findUnique as jest.Mock).mockResolvedValue({
        ...started,
        startAt: new Date(Date.now() + 60 * 60 * 1000),
        endAt: new Date(Date.now() + 2 * 60 * 60 * 1000),
      });

      await expect(service.markNoShow('appt-1', {} as any, actor)).rejects.toThrow(
        'Chưa đến giờ hẹn, hãy dùng Hủy lịch nếu khách báo không đến',
      );
      expect(prisma.appointment.updateMany).not.toHaveBeenCalled();
      expect(audit.log).not.toHaveBeenCalled();
    });
  });

  describe('autoMarkNoShow', () => {
    // 10:00 clinic time (UTC+7).
    const NOW = new Date('2026-09-30T03:00:00Z');
    const at = (hhmm: string, day = '2026-09-30') => new Date(`${day}T${hhmm}:00+07:00`);

    beforeEach(() => {
      jest.useFakeTimers({ now: NOW, doNotFake: ['nextTick', 'setImmediate'] });
      (prisma.auditLog.findMany as jest.Mock).mockResolvedValue([]);
    });
    afterEach(() => jest.useRealTimers());

    it('waits until max(start + 30 min, end) + 60 min', async () => {
      (prisma.appointment.findMany as jest.Mock).mockResolvedValue([]);

      await service.autoMarkNoShow();

      const where = (prisma.appointment.findMany as jest.Mock).mock.calls[0][0].where;
      // A 9:00–9:30 visit is due at 10:30, so a patient arriving at 9:35 is
      // still SCHEDULED; at 10:00 only visits started before 8:30 and ended
      // before 9:00 are due.
      expect(where.startAt).toEqual({ lt: at('08:30') });
      expect(where.endAt).toEqual({ lt: at('09:00') });
      expect(where.status).toEqual({
        in: [AppointmentStatus.SCHEDULED, AppointmentStatus.CONFIRMED],
      });
      expect(prisma.appointment.updateMany).not.toHaveBeenCalled();
      expect(prisma.auditLog.findMany).not.toHaveBeenCalled();
    });

    it('re-states the whole filter in the write and audits each appointment', async () => {
      (prisma.appointment.findMany as jest.Mock).mockResolvedValue([
        { id: 'a-1', startAt: at('08:00') },
        { id: 'a-2', startAt: at('07:30') },
      ]);
      (prisma.appointment.updateMany as jest.Mock).mockResolvedValue({ count: 2 });

      const result = await service.autoMarkNoShow();

      expect(result.updated).toBe(2);
      const where = (prisma.appointment.updateMany as jest.Mock).mock.calls[0][0].where;
      expect(where.id).toEqual({ in: ['a-1', 'a-2'] });
      expect(where.status).toEqual({
        in: [AppointmentStatus.SCHEDULED, AppointmentStatus.CONFIRMED],
      });
      expect(where.startAt).toEqual({ lt: at('08:30') });
      expect(where.endAt).toEqual({ lt: at('09:00') });
      expect(where.deletedAt).toBeNull();
      // One batched write, one history entry per appointment.
      expect(prisma.auditLog.createMany).toHaveBeenCalledTimes(1);
      const { data } = (prisma.auditLog.createMany as jest.Mock).mock.calls[0][0];
      expect(data).toEqual(
        ['a-1', 'a-2'].map(id =>
          expect.objectContaining({
            action: 'APPOINTMENT_AUTO_NO_SHOW',
            actorUserId: null,
            targetType: 'appointment',
            targetId: id,
          }),
        ),
      );
    });

    it('leaves a visit whose no-show was undone until its clinic day is over', async () => {
      (prisma.appointment.findMany as jest.Mock).mockResolvedValue([
        { id: 'today-undone', startAt: at('08:00') },
        { id: 'yesterday-undone', startAt: at('15:00', '2026-09-29') },
        { id: 'today-plain', startAt: at('07:00') },
      ]);
      (prisma.auditLog.findMany as jest.Mock).mockResolvedValue([
        { targetId: 'today-undone' },
        { targetId: 'yesterday-undone' },
      ]);
      (prisma.appointment.updateMany as jest.Mock).mockResolvedValue({ count: 2 });

      await service.autoMarkNoShow();

      expect(prisma.auditLog.findMany).toHaveBeenCalledWith({
        where: {
          action: 'APPOINTMENT_NO_SHOW_REVERTED',
          targetId: { in: ['today-undone', 'yesterday-undone', 'today-plain'] },
        },
        select: { targetId: true },
      });
      const where = (prisma.appointment.updateMany as jest.Mock).mock.calls[0][0].where;
      expect(where.id).toEqual({ in: ['yesterday-undone', 'today-plain'] });
    });

    it('writes nothing when every due visit had its no-show undone today', async () => {
      (prisma.appointment.findMany as jest.Mock).mockResolvedValue([
        { id: 'today-undone', startAt: at('08:00') },
      ]);
      (prisma.auditLog.findMany as jest.Mock).mockResolvedValue([{ targetId: 'today-undone' }]);

      await expect(service.autoMarkNoShow()).resolves.toEqual({ updated: 0 });
      expect(prisma.appointment.updateMany).not.toHaveBeenCalled();
      expect(prisma.auditLog.createMany).not.toHaveBeenCalled();
    });

    it('audits only the appointments really marked when one was checked in meanwhile', async () => {
      (prisma.appointment.findMany as jest.Mock)
        .mockResolvedValueOnce([
          { id: 'a-1', startAt: at('08:00') },
          { id: 'a-2', startAt: at('08:00') },
        ])
        .mockResolvedValueOnce([{ id: 'a-2' }]);
      (prisma.appointment.updateMany as jest.Mock).mockResolvedValue({ count: 1 });

      const result = await service.autoMarkNoShow();

      expect(result.updated).toBe(1);
      const reread = (prisma.appointment.findMany as jest.Mock).mock.calls[1][0].where;
      expect(reread).toEqual(
        expect.objectContaining({ status: AppointmentStatus.NO_SHOW, noShowAt: expect.any(Date) }),
      );
      const { data } = (prisma.auditLog.createMany as jest.Mock).mock.calls[0][0];
      expect(data).toEqual([expect.objectContaining({ targetId: 'a-2' })]);
    });

    it('skips the audit entry when nothing was marked', async () => {
      (prisma.appointment.findMany as jest.Mock).mockResolvedValue([
        { id: 'a-1', startAt: at('08:00') },
      ]);
      (prisma.appointment.updateMany as jest.Mock).mockResolvedValue({ count: 0 });

      await expect(service.autoMarkNoShow()).resolves.toEqual({ updated: 0 });
      expect(prisma.auditLog.createMany).not.toHaveBeenCalled();
      expect(audit.log).not.toHaveBeenCalled();
    });
  });

  describe('closeStaleCheckIns (end of clinic day)', () => {
    it('closes only CHECKED_IN visits from before today (clinic time) as LEFT with their queue entry', async () => {
      (prisma.appointment.findMany as jest.Mock).mockResolvedValue([{ id: 'old-1' }]);
      (prisma.appointment.updateMany as jest.Mock).mockResolvedValue({ count: 1 });
      (prisma.queueEntry.updateMany as jest.Mock).mockResolvedValue({ count: 1 });

      const result = await service.closeStaleCheckIns();

      expect(result.appointments).toBe(1);
      const todayStart = new Date(`${clinicDateOnly()}T00:00:00+07:00`);
      // Only CHECKED_IN (never IN_PROGRESS, which owns a medical record), only before today.
      const read = (prisma.appointment.findMany as jest.Mock).mock.calls[0][0].where;
      expect(read).toEqual(
        expect.objectContaining({
          status: AppointmentStatus.CHECKED_IN,
          startAt: { lt: todayStart },
          deletedAt: null,
        }),
      );
      const write = (prisma.appointment.updateMany as jest.Mock).mock.calls[0][0];
      expect(write.where).toEqual({
        id: 'old-1',
        status: AppointmentStatus.CHECKED_IN,
        startAt: { lt: todayStart },
      });
      expect(write.data).toEqual(
        expect.objectContaining({
          status: AppointmentStatus.LEFT,
          leftReason: 'Hệ thống đóng cuối ngày',
        }),
      );
      // The visit's own queue entry, closed the way "left before the exam" does.
      expect(prisma.queueEntry.updateMany).toHaveBeenCalledWith({
        where: { appointmentId: 'old-1', doneAt: null },
        data: expect.objectContaining({ closeReason: 'LEFT', status: 'LEFT', updatedBy: null }),
      });
      // Then every entry still open from an earlier day — not today's, and
      // never one whose visit is still CHECKED_IN.
      const sweep = (prisma.queueEntry.updateMany as jest.Mock).mock.calls[1][0];
      expect(sweep.where).toEqual({
        doneAt: null,
        queueDate: { lt: new Date(clinicDateOnly()) },
        OR: [
          { appointment: { status: { not: AppointmentStatus.CHECKED_IN } } },
          { appointment: { deletedAt: { not: null } } },
        ],
      });
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'APPOINTMENT_LEFT',
          targetId: 'old-1',
          actorUserId: null,
        }),
      );
    });

    it('skips a visit that moved on meanwhile (e.g. the exam started)', async () => {
      (prisma.appointment.findMany as jest.Mock).mockResolvedValue([{ id: 'old-1' }]);
      (prisma.appointment.updateMany as jest.Mock).mockResolvedValue({ count: 0 });
      (prisma.queueEntry.updateMany as jest.Mock).mockResolvedValue({ count: 0 });

      const result = await service.closeStaleCheckIns();

      expect(result.appointments).toBe(0);
      // Only the day sweep ran; the visit's entry was not touched on its own.
      expect(prisma.queueEntry.updateMany).toHaveBeenCalledTimes(1);
      expect(audit.log).not.toHaveBeenCalled();
    });

    it('never writes to an IN_PROGRESS appointment', async () => {
      (prisma.appointment.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.queueEntry.updateMany as jest.Mock).mockResolvedValue({ count: 0 });

      await service.closeStaleCheckIns();

      expect(prisma.appointment.updateMany).not.toHaveBeenCalled();
      expect(prisma.appointment.update).not.toHaveBeenCalled();
      expect(prisma.encounter.updateMany).not.toHaveBeenCalled();
    });

    it('keeps going when one visit fails, and leaves its queue entry to the CHECKED_IN guard', async () => {
      (prisma.appointment.findMany as jest.Mock).mockResolvedValue([
        { id: 'bad-1' },
        { id: 'old-2' },
      ]);
      (prisma.appointment.updateMany as jest.Mock)
        .mockRejectedValueOnce(new Error('deadlock'))
        .mockResolvedValueOnce({ count: 1 });
      (prisma.queueEntry.updateMany as jest.Mock).mockResolvedValue({ count: 0 });

      const result = await service.closeStaleCheckIns();

      expect(result).toEqual({ appointments: 1, failed: 1, queueEntries: 0 });
      expect(audit.log).toHaveBeenCalledTimes(1);
      expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ targetId: 'old-2' }));
      // The sweep still ran, restricted to visits no longer CHECKED_IN.
      const sweep = (prisma.queueEntry.updateMany as jest.Mock).mock.calls.at(-1)![0];
      expect(sweep.where.OR).toContainEqual({
        appointment: { status: { not: AppointmentStatus.CHECKED_IN } },
      });
    });
  });

  describe('autoCancelPastPendingShifts', () => {
    it('cancels in one write guarded on PENDING, with "today" in clinic time', async () => {
      (prisma.shiftRegistration.updateMany as jest.Mock).mockResolvedValue({ count: 3 });

      await expect(service.autoCancelPastPendingShifts()).resolves.toEqual({ updated: 3 });

      expect(prisma.shiftRegistration.findMany).not.toHaveBeenCalled();
      const { where, data } = (prisma.shiftRegistration.updateMany as jest.Mock).mock.calls[0][0];
      expect(where).toEqual({
        status: 'PENDING',
        date: { lt: new Date(clinicDateOnly()) },
        deletedAt: null,
      });
      expect(data.status).toBe('CANCELLED');
      expect(audit.log).toHaveBeenCalledTimes(1);
    });

    it('uses the clinic date between 00:00 and 07:00 Vietnam time (still the previous UTC day)', async () => {
      jest.useFakeTimers({ now: new Date('2026-09-29T18:30:00Z') }); // 01:30 on 30/09 in VN
      try {
        (prisma.shiftRegistration.updateMany as jest.Mock).mockResolvedValue({ count: 0 });

        await expect(service.autoCancelPastPendingShifts()).resolves.toEqual({ updated: 0 });

        const { where } = (prisma.shiftRegistration.updateMany as jest.Mock).mock.calls[0][0];
        expect(where.date).toEqual({ lt: new Date('2026-09-30') });
        expect(audit.log).not.toHaveBeenCalled();
      } finally {
        jest.useRealTimers();
      }
    });
  });

  describe('reschedule — state and dentist guards', () => {
    const future = {
      newStartsAt: '2099-01-05T02:00:00Z',
      newEndsAt: '2099-01-05T02:30:00Z',
    };
    const base = {
      id: 'appt-1',
      dentistId: 'dentist-1',
      patientId: 'patient-1',
      status: AppointmentStatus.SCHEDULED,
      startAt: new Date(Date.now() + 48 * 60 * 60 * 1000),
      endAt: new Date(Date.now() + 49 * 60 * 60 * 1000),
      rescheduleCount: 0,
      services: [] as Array<{ serviceId: string }>,
    };

    beforeEach(() => {
      (prisma.appointment.findFirst as jest.Mock).mockResolvedValue(null);
      (prisma.workingSchedule.findMany as jest.Mock).mockResolvedValue([
        {
          startTime: new Date('1970-01-01T00:00:00Z'),
          endTime: new Date('1970-01-01T23:00:00Z'),
        },
      ]);
      (prisma.timeOff.findFirst as jest.Mock).mockResolvedValue(null);
    });

    it.each([AppointmentStatus.CHECKED_IN, AppointmentStatus.IN_PROGRESS])(
      'rejects rescheduling a %s appointment (patient already at the clinic)',
      async status => {
        (prisma.appointment.findUnique as jest.Mock).mockResolvedValue({ ...base, status });

        await expect(service.reschedule('appt-1', future as any, actor)).rejects.toThrow(
          /Không thể đổi lịch hẹn ở trạng thái/,
        );
        expect(prisma.appointment.updateMany).not.toHaveBeenCalled();
      },
    );

    it('rejects moving the appointment to a user who is not an active dentist', async () => {
      (prisma.appointment.findUnique as jest.Mock).mockResolvedValue(base);
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({
        id: 'receptionist-1',
        status: 'ACTIVE',
        userRoles: [{ role: { code: 'receptionist' } }],
      });

      await expect(
        service.reschedule('appt-1', { ...future, newDentistId: 'receptionist-1' } as any, actor),
      ).rejects.toThrow(/không còn hoạt động/);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('guards the write on status + rescheduleCount and surfaces a concurrent change', async () => {
      (prisma.appointment.findUnique as jest.Mock).mockResolvedValue(base);
      (prisma.appointment.updateMany as jest.Mock).mockResolvedValue({ count: 0 });

      await expect(service.reschedule('appt-1', future as any, actor)).rejects.toThrow(
        /vừa được thay đổi/,
      );
      expect(prisma.appointment.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'appt-1', status: AppointmentStatus.SCHEDULED, rescheduleCount: 0 },
        }),
      );
      expect(prisma.appointmentRescheduleLog.create).not.toHaveBeenCalled();
    });

    it('reschedules a scheduled appointment and writes the reschedule log', async () => {
      (prisma.appointment.findUnique as jest.Mock).mockResolvedValue(base);
      (prisma.appointment.updateMany as jest.Mock).mockResolvedValue({ count: 1 });
      (prisma.appointment.findUniqueOrThrow as jest.Mock).mockResolvedValue({
        ...base,
        rescheduleCount: 1,
      });

      const result = await service.reschedule('appt-1', future as any, actor);

      expect(result.rescheduleCount).toBe(1);
      expect(prisma.appointmentRescheduleLog.create).toHaveBeenCalled();
    });

    it('checks the booked services against the new day (BR-APPT-030)', async () => {
      (prisma.appointment.findUnique as jest.Mock).mockResolvedValue({
        ...base,
        services: [{ serviceId: 'svc-1' }],
      });
      (prisma.dentistService.findMany as jest.Mock).mockResolvedValue([]);

      await expect(service.reschedule('appt-1', future as any, actor)).rejects.toMatchObject({
        response: expect.objectContaining({
          error: 'SERVICE_NOT_ASSIGNED',
          message: 'Bác sĩ này không thực hiện dịch vụ của lịch hẹn vào ngày đã chọn',
        }),
      });
      expect(prisma.dentistService.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            dentistId: 'dentist-1',
            serviceId: { in: ['svc-1'] },
            effectiveFrom: { lte: new Date('2099-01-05') },
          }),
        }),
      );
      // A service withdrawn since the booking does not block moving it.
      const where = (prisma.dentistService.findMany as jest.Mock).mock.calls[0][0].where;
      expect(where.service).toBeUndefined();
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it("moves a visit for a withdrawn service to a later day on the dentist's last assignment", async () => {
      (prisma.appointment.findUnique as jest.Mock).mockResolvedValue({
        ...base,
        services: [{ serviceId: 'svc-old' }],
      });
      // Deactivation ended the assignment, so the dated lookup finds nothing…
      (prisma.dentistService.findMany as jest.Mock)
        .mockResolvedValueOnce([])
        // …and the dentist's latest assignment to the withdrawn service counts.
        .mockResolvedValueOnce([
          {
            serviceId: 'svc-old',
            price: null,
            durationMin: null,
            service: {
              code: 'OLD',
              name: 'Dịch vụ đã ngừng',
              basePrice: 100_000,
              defaultDurationMin: 30,
              bufferBeforeMin: 0,
              bufferAfterMin: 0,
            },
          },
        ]);
      (prisma.appointment.updateMany as jest.Mock).mockResolvedValue({ count: 1 });
      (prisma.appointment.findUniqueOrThrow as jest.Mock).mockResolvedValue({
        ...base,
        rescheduleCount: 1,
      });

      await expect(service.reschedule('appt-1', future as any, actor)).resolves.toBeDefined();
      const fallback = (prisma.dentistService.findMany as jest.Mock).mock.calls[1][0].where;
      expect(fallback).toEqual({
        dentistId: 'dentist-1',
        serviceId: { in: ['svc-old'] },
        service: { isActive: false },
      });
    });

    it('checks the booked services against a new dentist on the same day', async () => {
      const sameDay = new Date(base.startAt.getTime() + 60 * 60_000);
      (prisma.appointment.findUnique as jest.Mock).mockResolvedValue({
        ...base,
        services: [{ serviceId: 'svc-1' }],
      });
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({
        id: 'dentist-2',
        status: 'ACTIVE',
        userRoles: [{ role: { code: 'dentist' } }],
        dentistProfile: null,
      });
      (prisma.dentistService.findMany as jest.Mock).mockResolvedValue([]);

      await expect(
        service.reschedule(
          'appt-1',
          {
            newStartsAt: sameDay.toISOString(),
            newEndsAt: new Date(sameDay.getTime() + 30 * 60_000).toISOString(),
            newDentistId: 'dentist-2',
          } as any,
          actor,
        ),
      ).rejects.toMatchObject({
        response: expect.objectContaining({ error: 'SERVICE_NOT_ASSIGNED' }),
      });
      expect(prisma.dentistService.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ dentistId: 'dentist-2' }) }),
      );
    });

    it('does not re-check services when neither the dentist nor the day changes', async () => {
      // 10:00 on the visit's own clinic day (whatever time the suite runs).
      const vnDay = new Date(base.startAt.getTime() + 7 * 3600_000).toISOString().slice(0, 10);
      const sameDay = new Date(`${vnDay}T03:00:00Z`);
      (prisma.appointment.findUnique as jest.Mock).mockResolvedValue({
        ...base,
        services: [{ serviceId: 'svc-1' }],
      });
      (prisma.appointment.updateMany as jest.Mock).mockResolvedValue({ count: 1 });
      (prisma.appointment.findUniqueOrThrow as jest.Mock).mockResolvedValue({
        ...base,
        rescheduleCount: 1,
      });

      await service.reschedule(
        'appt-1',
        {
          newStartsAt: sameDay.toISOString(),
          newEndsAt: new Date(sameDay.getTime() + 30 * 60_000).toISOString(),
        } as any,
        actor,
      );
      expect(prisma.dentistService.findMany).not.toHaveBeenCalled();
    });

    it("forbids a dentist moving their own booking onto a colleague's calendar", async () => {
      (prisma.appointment.findUnique as jest.Mock).mockResolvedValue(base);

      await expect(
        service.reschedule(
          'appt-1',
          { ...future, newDentistId: 'dentist-2' } as any,
          dentistPayload('dentist-1'),
        ),
      ).rejects.toThrow(/lịch làm việc của chính mình/);
      expect(prisma.user.findUnique).not.toHaveBeenCalled();
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });
  });

  describe('cancel — checked-in patient who leaves after start (BR-APPT-025)', () => {
    const receptionist = receptionistPayload();
    const startedCheckedIn = {
      id: 'appt-1',
      dentistId: 'dentist-1',
      patientId: 'patient-1',
      status: AppointmentStatus.CHECKED_IN,
      startAt: new Date(Date.now() - 20 * 60 * 1000),
      endAt: new Date(Date.now() + 10 * 60 * 1000),
    };

    it('lets front desk cancel a CHECKED_IN appointment after start with a reason', async () => {
      (prisma.appointment.findUnique as jest.Mock).mockResolvedValue(startedCheckedIn);
      (prisma.appointment.updateMany as jest.Mock).mockResolvedValue({ count: 1 });
      (prisma.appointment.findUniqueOrThrow as jest.Mock).mockResolvedValue({
        ...startedCheckedIn,
        status: AppointmentStatus.CANCELLED,
      });

      const result = await service.cancel(
        'appt-1',
        { reason: 'BN bỏ về trước khi được khám' } as any,
        receptionist,
      );

      expect(result.status).toBe(AppointmentStatus.CANCELLED);
      expect(prisma.appointment.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'appt-1', status: AppointmentStatus.CHECKED_IN },
        }),
      );
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: expect.objectContaining({ lateCheckedInCancel: true }),
        }),
      );
    });

    it('requires a reason of at least 5 characters', async () => {
      (prisma.appointment.findUnique as jest.Mock).mockResolvedValue(startedCheckedIn);

      await expect(
        service.cancel('appt-1', { reason: ' ok ' } as any, receptionist),
      ).rejects.toThrow(/cần lý do/);
      expect(prisma.appointment.updateMany).not.toHaveBeenCalled();
    });

    it('still blocks cancelling a SCHEDULED appointment after its start (that is a no-show)', async () => {
      (prisma.appointment.findUnique as jest.Mock).mockResolvedValue({
        ...startedCheckedIn,
        status: AppointmentStatus.SCHEDULED,
      });

      await expect(
        service.cancel('appt-1', { reason: 'Khách không đến' } as any, receptionist),
      ).rejects.toThrow(/Đã qua giờ hẹn nên không thể hủy/);
    });
  });

  describe('create — patient double-booking and locking', () => {
    const dto = {
      dentistId: 'dentist-1',
      patientId: 'patient-1',
      startAt: '2027-03-15T02:00:00Z',
    } as any;

    beforeEach(() => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({
        id: 'dentist-1',
        status: 'ACTIVE',
        userRoles: [{ role: { code: 'dentist' } }],
      });
      (prisma.patient.findUnique as jest.Mock).mockResolvedValue({
        id: 'patient-1',
        deletedAt: null,
      });
      (prisma.workingSchedule.findMany as jest.Mock).mockResolvedValue([
        {
          startTime: new Date('1970-01-01T00:00:00Z'),
          endTime: new Date('1970-01-01T23:00:00Z'),
        },
      ]);
      (prisma.timeOff.findFirst as jest.Mock).mockResolvedValue(null);
      (prisma.appointment.create as jest.Mock).mockResolvedValue({ id: 'appt-new' });
    });

    it('rejects a booking that overlaps the same patient with another dentist', async () => {
      // The dentist's day is free (appointment.findMany → []); the patient is
      // booked with another dentist.
      (prisma.appointment.findFirst as jest.Mock).mockResolvedValue({ id: 'appt-other-dentist' });

      await expect(service.create(dto, actor)).rejects.toThrow(/Bệnh nhân đã có lịch hẹn khác/);
      const patientWhere = (prisma.appointment.findFirst as jest.Mock).mock.calls[0][0].where;
      expect(patientWhere).toEqual(
        expect.objectContaining({
          patientId: 'patient-1',
          startAt: { lt: new Date('2027-03-15T02:30:00Z') },
          endAt: { gt: new Date('2027-03-15T02:00:00Z') },
        }),
      );
      expect(prisma.appointment.create).not.toHaveBeenCalled();
    });

    it('lets a dentist book a follow-up only on their own calendar, for a patient they treated', async () => {
      const self = dentistPayload('dentist-1');
      (prisma.appointment.findFirst as jest.Mock).mockResolvedValue(null);

      await expect(service.create({ ...dto, dentistId: 'dentist-2' }, self)).rejects.toThrow(
        'lịch làm việc của chính mình',
      );

      (prisma.encounter.count as jest.Mock).mockResolvedValueOnce(0);
      await expect(service.create(dto, self)).rejects.toThrow('bệnh nhân mình đã khám');
      expect(prisma.appointment.create).not.toHaveBeenCalled();

      (prisma.encounter.count as jest.Mock).mockResolvedValueOnce(1);
      await service.create(dto, self);
      expect(prisma.encounter.count).toHaveBeenLastCalledWith({
        where: { patientId: 'patient-1', dentistId: 'dentist-1', status: { not: 'CANCELLED' } },
      });
      expect(prisma.appointment.create).toHaveBeenCalled();
    });

    it('takes a dentist lock then a patient lock, in separate namespaces', async () => {
      (prisma.appointment.findFirst as jest.Mock).mockResolvedValue(null);

      await service.create(dto, actor);

      const sql = (prisma.$executeRawUnsafe as jest.Mock).mock.calls.map(c => c[0]);
      expect(sql).toHaveLength(2);
      expect(sql[0]).toMatch(/^SELECT pg_advisory_xact_lock\(1, -?\d+\)$/);
      expect(sql[1]).toMatch(/^SELECT pg_advisory_xact_lock\(2, -?\d+\)$/);
    });

    it('accepts a booking inside an APPROVED shift registration when no working schedule covers it', async () => {
      (prisma.appointment.findFirst as jest.Mock).mockResolvedValue(null);
      (prisma.workingSchedule.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.shiftRegistration.findMany as jest.Mock).mockResolvedValue([
        { startTime: '08:00', endTime: '12:00' },
      ]);

      await service.create(dto, actor);

      expect(prisma.shiftRegistration.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            dentistId: 'dentist-1',
            date: new Date('2027-03-15'),
            status: 'APPROVED',
          }),
        }),
      );
      expect(prisma.appointment.create).toHaveBeenCalled();
    });

    it('still rejects when neither a working schedule nor an approved shift covers the slot', async () => {
      (prisma.appointment.findFirst as jest.Mock).mockResolvedValue(null);
      (prisma.workingSchedule.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.shiftRegistration.findFirst as jest.Mock).mockResolvedValue(null);

      await expect(service.create(dto, actor)).rejects.toThrow(/không có lịch làm việc/);
    });
  });

  describe('getAvailability — approved shift registrations (BR-APPT-027)', () => {
    it('opens slots from an approved shift on a day with no working schedule', async () => {
      (prisma.workingSchedule.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.shiftRegistration.findMany as jest.Mock).mockResolvedValue([
        { startTime: '18:00', endTime: '19:00' },
      ]);
      (prisma.appointment.findMany as jest.Mock).mockResolvedValue([
        // 18:30–19:00 Vietnam time
        { startAt: new Date('2099-09-16T11:30:00Z'), endAt: new Date('2099-09-16T12:00:00Z') },
      ]);
      (prisma.timeOff.findMany as jest.Mock).mockResolvedValue([]);

      const result = await service.getAvailability({ dentistId: 'dentist-1', date: '2099-09-16' });

      expect(result.availableSlots).toEqual(['18:00']);
      expect(result.workingHours).toEqual({ startTime: '18:00', endTime: '19:00' });
      expect(prisma.shiftRegistration.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ status: 'APPROVED', date: new Date('2099-09-16') }),
        }),
      );
    });

    it('returns an empty, NO_SCHEDULE answer (not a 404) when there is neither a schedule nor an approved shift', async () => {
      (prisma.workingSchedule.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.shiftRegistration.findMany as jest.Mock).mockResolvedValue([]);

      const result = await service.getAvailability({ dentistId: 'dentist-1', date: '2099-09-16' });

      expect(result).toEqual(
        expect.objectContaining({
          availableSlots: [],
          windows: [],
          busy: [],
          workingHours: null,
          blockedReason: 'NO_SCHEDULE',
        }),
      );
    });

    it('returns working windows and busy intervals (appointments + time-off) in clinic time', async () => {
      (prisma.workingSchedule.findMany as jest.Mock).mockResolvedValue([
        {
          startTime: new Date('1970-01-01T08:00:00Z'),
          endTime: new Date('1970-01-01T12:00:00Z'),
          slotDurationMin: 30,
        },
      ]);
      (prisma.shiftRegistration.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.appointment.findMany as jest.Mock).mockResolvedValue([
        // 09:10–09:55 Vietnam time — off the 30-min grid
        { startAt: new Date('2099-09-16T02:10:00Z'), endAt: new Date('2099-09-16T02:55:00Z') },
      ]);
      (prisma.timeOff.findMany as jest.Mock).mockResolvedValue([
        // multi-day leave starting 11:00 Vietnam time
        { startAt: new Date('2099-09-16T04:00:00Z'), endAt: new Date('2099-09-18T00:00:00Z') },
      ]);

      const result = await service.getAvailability({ dentistId: 'dentist-1', date: '2099-09-16' });

      expect(result.windows).toEqual([{ startTime: '08:00', endTime: '12:00' }]);
      expect(result.busy).toEqual([
        { startTime: '09:10', endTime: '09:55' },
        { startTime: '11:00', endTime: '24:00' },
      ]);
      // One 15-minute grid (SLOT_STEP_MIN), whatever the visit's length.
      expect(result.availableSlots).toEqual(['08:00', '08:15', '08:30', '10:00', '10:15', '10:30']);
    });

    it("drops today's slots that have already started", async () => {
      jest.useFakeTimers({
        now: new Date('2099-09-16T02:45:00Z'),
        doNotFake: ['nextTick', 'setImmediate'],
      });
      try {
        (prisma.workingSchedule.findMany as jest.Mock).mockResolvedValue([
          {
            startTime: new Date('1970-01-01T08:00:00Z'),
            endTime: new Date('1970-01-01T11:00:00Z'),
            slotDurationMin: 30,
          },
        ]);
        (prisma.shiftRegistration.findMany as jest.Mock).mockResolvedValue([]);
        (prisma.appointment.findMany as jest.Mock).mockResolvedValue([]);
        (prisma.timeOff.findMany as jest.Mock).mockResolvedValue([]);

        // now = 09:45 Vietnam time
        const result = await service.getAvailability({
          dentistId: 'dentist-1',
          date: '2099-09-16',
        });

        expect(result.availableSlots).toEqual(['10:00', '10:15', '10:30']);
      } finally {
        jest.useRealTimers();
      }
    });
  });

  describe('confirm (scheduled → confirmed)', () => {
    const scheduled = {
      id: 'appt-1',
      dentistId: 'dentist-1',
      patientId: 'patient-1',
      status: AppointmentStatus.SCHEDULED,
      startAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      endAt: new Date(Date.now() + 25 * 60 * 60 * 1000),
      rescheduleCount: 0,
    };

    it('confirms a scheduled appointment with a guarded write and audit entry', async () => {
      (prisma.appointment.findUnique as jest.Mock).mockResolvedValue(scheduled);
      (prisma.appointment.updateMany as jest.Mock).mockResolvedValue({ count: 1 });
      (prisma.appointment.findUniqueOrThrow as jest.Mock).mockResolvedValue({
        ...scheduled,
        status: AppointmentStatus.CONFIRMED,
      });

      const result = await service.confirm('appt-1', receptionistPayload());

      expect(result.status).toBe(AppointmentStatus.CONFIRMED);
      expect(prisma.appointment.updateMany).toHaveBeenCalledWith({
        where: {
          id: 'appt-1',
          status: AppointmentStatus.SCHEDULED,
          startAt: scheduled.startAt,
          dentistId: 'dentist-1',
          rescheduleCount: 0,
        },
        data: expect.objectContaining({
          status: AppointmentStatus.CONFIRMED,
          confirmedBy: 'receptionist-1',
        }),
      });
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'APPOINTMENT_CONFIRMED' }),
      );
    });

    it('is idempotent for an already-confirmed appointment', async () => {
      const confirmed = { ...scheduled, status: AppointmentStatus.CONFIRMED };
      (prisma.appointment.findUnique as jest.Mock).mockResolvedValue(confirmed);

      await expect(service.confirm('appt-1', actor)).resolves.toBe(confirmed);
      expect(prisma.appointment.updateMany).not.toHaveBeenCalled();
    });

    it('rejects confirming once the appointment has started', async () => {
      (prisma.appointment.findUnique as jest.Mock).mockResolvedValue({
        ...scheduled,
        startAt: new Date(Date.now() - 60_000),
      });

      await expect(service.confirm('appt-1', actor)).rejects.toThrow(/Đã qua giờ hẹn/);
    });

    it.each([AppointmentStatus.CHECKED_IN, AppointmentStatus.CANCELLED])(
      'rejects confirming a %s appointment',
      async status => {
        (prisma.appointment.findUnique as jest.Mock).mockResolvedValue({ ...scheduled, status });

        await expect(service.confirm('appt-1', actor)).rejects.toThrow(/Không thể xác nhận/);
      },
    );

    it("404s for a dentist confirming a colleague's appointment", async () => {
      (prisma.appointment.findUnique as jest.Mock).mockResolvedValue(scheduled);

      await expect(service.confirm('appt-1', dentistPayload('dentist-2'))).rejects.toThrow(
        /Không tìm thấy lịch hẹn/,
      );
    });
  });

  describe('reschedule — confirmation reset and patient overlap', () => {
    const confirmed = {
      id: 'appt-1',
      dentistId: 'dentist-1',
      patientId: 'patient-1',
      status: AppointmentStatus.CONFIRMED,
      startAt: new Date(Date.now() + 48 * 60 * 60 * 1000),
      endAt: new Date(Date.now() + 49 * 60 * 60 * 1000),
      rescheduleCount: 0,
      services: [],
    };
    const future = { newStartsAt: '2099-01-05T02:00:00Z', newEndsAt: '2099-01-05T02:30:00Z' };

    beforeEach(() => {
      (prisma.appointment.findUnique as jest.Mock).mockResolvedValue(confirmed);
      (prisma.workingSchedule.findMany as jest.Mock).mockResolvedValue([
        {
          startTime: new Date('1970-01-01T00:00:00Z'),
          endTime: new Date('1970-01-01T23:00:00Z'),
        },
      ]);
      (prisma.timeOff.findFirst as jest.Mock).mockResolvedValue(null);
    });

    it('drops a CONFIRMED appointment back to SCHEDULED (the confirmation was for the old time)', async () => {
      (prisma.appointment.findFirst as jest.Mock).mockResolvedValue(null);
      (prisma.appointment.updateMany as jest.Mock).mockResolvedValue({ count: 1 });
      (prisma.appointment.findUniqueOrThrow as jest.Mock).mockResolvedValue({
        ...confirmed,
        status: AppointmentStatus.SCHEDULED,
      });

      await service.reschedule('appt-1', future as any, actor);

      expect(prisma.appointment.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: AppointmentStatus.SCHEDULED,
            confirmedAt: null,
            confirmedBy: null,
          }),
        }),
      );
    });

    it("rejects moving onto a time the patient is already booked (ignoring the appointment's own row)", async () => {
      (prisma.appointment.findFirst as jest.Mock).mockResolvedValue({ id: 'appt-2' });

      await expect(service.reschedule('appt-1', future as any, actor)).rejects.toThrow(
        /Bệnh nhân đã có lịch hẹn khác/,
      );
      const patientWhere = (prisma.appointment.findFirst as jest.Mock).mock.calls[0][0].where;
      expect(patientWhere).toEqual(
        expect.objectContaining({ patientId: 'patient-1', NOT: { id: 'appt-1' } }),
      );
      expect(prisma.appointment.updateMany).not.toHaveBeenCalled();
    });
  });

  describe('schedule / time-off ownership and time-off impact', () => {
    const activeDentist = {
      id: 'dentist-1',
      status: 'ACTIVE',
      userRoles: [{ role: { code: 'dentist' } }],
    };
    const timeOffDto = {
      dentistId: 'dentist-1',
      startAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      endAt: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(),
      type: 'SICK',
    } as any;

    it("forbids a dentist from creating a colleague's working schedule", async () => {
      await expect(
        service.createWorkingSchedule(
          {
            dentistId: 'dentist-1',
            dayOfWeek: 1,
            startTime: '08:00',
            endTime: '12:00',
            validFrom: '2099-01-01',
          } as any,
          dentistPayload('dentist-2'),
        ),
      ).rejects.toThrow(/chính mình/);
      expect(prisma.workingSchedule.create).not.toHaveBeenCalled();
    });

    it('rejects a working schedule for a user who is not an active dentist', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({
        id: 'receptionist-1',
        status: 'ACTIVE',
        userRoles: [{ role: { code: 'receptionist' } }],
      });

      await expect(
        service.createWorkingSchedule(
          {
            dentistId: 'receptionist-1',
            dayOfWeek: 1,
            startTime: '08:00',
            endTime: '12:00',
            validFrom: '2099-01-01',
          } as any,
          actor,
        ),
      ).rejects.toThrow(/không còn hoạt động/);
    });

    it("forbids a dentist from recording a colleague's time-off", async () => {
      await expect(service.createTimeOff(timeOffDto, dentistPayload('dentist-2'))).rejects.toThrow(
        /chính mình/,
      );
      expect(prisma.timeOff.create).not.toHaveBeenCalled();
    });

    it('lets a dentist record their own time-off', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(activeDentist);
      (prisma.appointment.count as jest.Mock).mockResolvedValue(0);
      (prisma.appointment.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.timeOff.create as jest.Mock).mockResolvedValue({ id: 'to-1' });

      const result = await service.createTimeOff(timeOffDto, dentistPayload('dentist-1'));

      expect(result).toEqual({ id: 'to-1', affectedAppointments: [] });
    });

    it('rejects a time-off that has already ended (BR-APPT-019)', async () => {
      await expect(
        service.createTimeOff(
          {
            ...timeOffDto,
            startAt: new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString(),
            endAt: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
          },
          actor,
        ),
      ).rejects.toThrow(/đã kết thúc/);
    });

    it('allows a time-off that already started (sick since this morning)', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(activeDentist);
      (prisma.appointment.count as jest.Mock).mockResolvedValue(0);
      (prisma.appointment.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.timeOff.create as jest.Mock).mockResolvedValue({ id: 'to-1' });

      await service.createTimeOff(
        { ...timeOffDto, startAt: new Date(Date.now() - 60 * 60 * 1000).toISOString() },
        actor,
      );

      expect(prisma.timeOff.create).toHaveBeenCalled();
    });

    it('blocks when a patient is checked in / in the chair during the window (overlap, not just startAt)', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(activeDentist);
      (prisma.appointment.count as jest.Mock).mockResolvedValue(1);

      await expect(service.createTimeOff(timeOffDto, approver)).rejects.toThrow(/đã check-in/);
      expect(prisma.appointment.count).toHaveBeenCalledWith({
        where: expect.objectContaining({
          startAt: { lt: new Date(timeOffDto.endAt) },
          endAt: { gt: new Date(timeOffDto.startAt) },
          status: { in: [AppointmentStatus.CHECKED_IN, AppointmentStatus.IN_PROGRESS] },
        }),
      });
    });

    it('returns still-booked appointments in the window so front desk can move them', async () => {
      const affected = [
        {
          id: 'appt-9',
          startAt: new Date(Date.now() + 30 * 60 * 60 * 1000),
          endAt: new Date(Date.now() + 30.5 * 60 * 60 * 1000),
          status: AppointmentStatus.SCHEDULED,
          patient: { id: 'p-9', code: 'BN0009', fullName: 'Lê Văn C', primaryPhone: '0900000009' },
        },
      ];
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(activeDentist);
      (prisma.appointment.count as jest.Mock).mockResolvedValue(0);
      (prisma.appointment.findMany as jest.Mock).mockResolvedValue(affected);
      (prisma.timeOff.create as jest.Mock).mockResolvedValue({ id: 'to-1' });

      const result = await service.createTimeOff(timeOffDto, actor);

      expect(result.affectedAppointments).toEqual(affected);
      expect(prisma.appointment.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: { in: [AppointmentStatus.SCHEDULED, AppointmentStatus.CONFIRMED] },
          }),
        }),
      );
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: expect.objectContaining({ affectedAppointmentIds: ['appt-9'] }),
        }),
      );
    });
  });

  describe('appointment type and chief complaint are stored separately', () => {
    beforeEach(() => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({
        id: 'dentist-1',
        status: 'ACTIVE',
        userRoles: [{ role: { code: 'dentist' } }],
      });
      (prisma.patient.findUnique as jest.Mock).mockResolvedValue({
        id: 'patient-1',
        deletedAt: null,
      });
      (prisma.workingSchedule.findMany as jest.Mock).mockResolvedValue([
        {
          startTime: new Date('1970-01-01T00:00:00Z'),
          endTime: new Date('1970-01-01T23:00:00Z'),
        },
      ]);
      (prisma.timeOff.findFirst as jest.Mock).mockResolvedValue(null);
      (prisma.appointment.findFirst as jest.Mock).mockResolvedValue(null);
      (prisma.appointment.create as jest.Mock).mockResolvedValue({ id: 'appt-new' });
    });

    it('create() persists reason, chief complaint, type and source as given', async () => {
      await service.create(
        {
          dentistId: 'dentist-1',
          patientId: 'patient-1',
          startAt: '2099-03-15T02:00:00Z',
          reason: 'Tái khám',
          chiefComplaint: 'Đau răng 26',
          appointmentType: 'FOLLOW_UP',
          source: 'WALK_IN',
        } as any,
        actor,
      );

      expect((prisma.appointment.create as jest.Mock).mock.calls[0][0].data).toEqual(
        expect.objectContaining({
          reason: 'Tái khám',
          chiefComplaint: 'Đau răng 26',
          appointmentType: 'FOLLOW_UP',
          source: 'WALK_IN',
        }),
      );
    });

    it('create() from an online booking request books CONFIRMED and links the request in the same transaction', async () => {
      (prisma.bookingRequest.updateMany as jest.Mock).mockResolvedValue({ count: 1 });

      await service.create(
        {
          dentistId: 'dentist-1',
          patientId: 'patient-1',
          startAt: '2099-03-15T02:00:00Z',
          source: 'ONLINE',
        } as any,
        actor,
        { id: 'request-1', expectedStatuses: ['PENDING_REVIEW'] as any },
      );

      expect((prisma.appointment.create as jest.Mock).mock.calls[0][0].data).toEqual(
        expect.objectContaining({
          status: AppointmentStatus.CONFIRMED,
          confirmedBy: actor.sub,
          source: 'ONLINE',
        }),
      );
      expect(prisma.bookingRequest.updateMany).toHaveBeenCalledWith({
        where: { id: 'request-1', status: { in: ['PENDING_REVIEW'] }, appointmentId: null },
        data: {
          appointmentId: 'appt-new',
          patientId: 'patient-1',
          status: 'CONFIRMED',
          handledBy: actor.sub,
        },
      });
    });

    it('create() from a booking request someone else already handled fails (the visit rolls back)', async () => {
      (prisma.bookingRequest.updateMany as jest.Mock).mockResolvedValue({ count: 0 });

      await expect(
        service.create(
          {
            dentistId: 'dentist-1',
            patientId: 'patient-1',
            startAt: '2099-03-15T02:00:00Z',
          } as any,
          actor,
          { id: 'request-1', expectedStatuses: ['PENDING_REVIEW'] as any },
        ),
      ).rejects.toThrow('vừa được xử lý hoặc đã quá hạn');
    });

    it('create() stores blank text fields as null (previously an empty reason hid the chief complaint)', async () => {
      await service.create(
        {
          dentistId: 'dentist-1',
          patientId: 'patient-1',
          startAt: '2099-03-15T02:00:00Z',
          reason: '',
          chiefComplaint: '  ',
        } as any,
        actor,
      );

      const data = (prisma.appointment.create as jest.Mock).mock.calls[0][0].data;
      expect(data.reason).toBeNull();
      expect(data.chiefComplaint).toBeNull();
    });

    it('update() no longer overwrites reason with the chief complaint', async () => {
      (prisma.appointment.findUnique as jest.Mock).mockResolvedValue({
        id: 'appt-1',
        dentistId: 'dentist-1',
        status: AppointmentStatus.SCHEDULED,
        reason: 'Cạo vôi',
      });
      (prisma.appointment.update as jest.Mock).mockResolvedValue({ id: 'appt-1' });

      await service.update(
        'appt-1',
        { chiefComplaint: 'Ê buốt', appointmentType: 'TREATMENT' } as any,
        actor,
      );

      expect(prisma.appointment.update).toHaveBeenCalledWith({
        where: { id: 'appt-1' },
        data: {
          reason: undefined,
          chiefComplaint: 'Ê buốt',
          appointmentType: 'TREATMENT',
          notes: undefined,
          updatedBy: actor.sub,
        },
      });
    });
  });

  describe('review follow-ups APPT-FU-02..03 (calendar lock + overlap)', () => {
    const lockCalls = () =>
      (prisma.$executeRawUnsafe as jest.Mock).mock.calls.map(c => c[0] as string);

    it('APPT-FU-03: createTimeOff checks and inserts under the dentist calendar lock', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({
        id: 'dentist-1',
        status: 'ACTIVE',
        userRoles: [{ role: { code: 'dentist' } }],
      });
      (prisma.appointment.count as jest.Mock).mockResolvedValue(0);
      (prisma.appointment.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.timeOff.create as jest.Mock).mockResolvedValue({ id: 'to-1' });

      await service.createTimeOff(
        {
          dentistId: 'dentist-1',
          startAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
          endAt: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(),
          type: 'SICK',
        } as any,
        approver,
      );

      expect(prisma.$transaction).toHaveBeenCalled();
      expect(lockCalls()).toEqual([expect.stringMatching(/^SELECT pg_advisory_xact_lock\(1, /)]);
      const lockOrder = (prisma.$executeRawUnsafe as jest.Mock).mock.invocationCallOrder[0];
      expect(lockOrder).toBeLessThan(
        (prisma.appointment.count as jest.Mock).mock.invocationCallOrder[0],
      );
      expect(lockOrder).toBeLessThan(
        (prisma.timeOff.create as jest.Mock).mock.invocationCallOrder[0],
      );
    });

    describe('APPT-FU-02: working schedule vs shift registrations', () => {
      const dto = {
        dentistId: 'dentist-1',
        dayOfWeek: 2, // Tuesday
        startTime: '08:00',
        endTime: '17:00',
        validFrom: '2099-01-01',
      } as any;

      beforeEach(() => {
        (prisma.user.findUnique as jest.Mock).mockResolvedValue({
          id: 'dentist-1',
          status: 'ACTIVE',
          userRoles: [{ role: { code: 'dentist' } }],
        });
        (prisma.workingSchedule.findMany as jest.Mock).mockResolvedValue([]);
        (prisma.workingSchedule.create as jest.Mock).mockResolvedValue({ id: 'ws-1' });
      });

      it('rejects a schedule overlapping a pending/approved shift on a matching weekday', async () => {
        (prisma.shiftRegistration.findMany as jest.Mock).mockResolvedValue([
          { date: new Date('2099-01-06'), startTime: '13:00', endTime: '18:00' }, // Tuesday
        ]);

        await expect(service.createWorkingSchedule(dto, actor)).rejects.toThrow(
          /trùng ca đăng ký ngày 2099-01-06 13:00-18:00/,
        );
        expect(prisma.shiftRegistration.findMany).toHaveBeenCalledWith({
          where: expect.objectContaining({
            dentistId: 'dentist-1',
            status: { in: ['PENDING', 'APPROVED'] },
            date: { gte: new Date('2099-01-01') },
          }),
        });
        expect(prisma.workingSchedule.create).not.toHaveBeenCalled();
      });

      it('ignores shifts on other weekdays or at non-overlapping hours', async () => {
        (prisma.shiftRegistration.findMany as jest.Mock).mockResolvedValue([
          { date: new Date('2099-01-07'), startTime: '09:00', endTime: '12:00' }, // Wednesday
          { date: new Date('2099-01-06'), startTime: '17:00', endTime: '20:00' }, // Tue, after
        ]);

        await expect(service.createWorkingSchedule(dto, actor)).resolves.toEqual({ id: 'ws-1' });
      });
    });

    it('APPT-FU-02: availability lists each slot once when a schedule and a shift overlap', async () => {
      (prisma.workingSchedule.findMany as jest.Mock).mockResolvedValue([
        {
          startTime: new Date('1970-01-01T08:00:00Z'),
          endTime: new Date('1970-01-01T10:00:00Z'),
          slotDurationMin: 30,
        },
      ]);
      (prisma.shiftRegistration.findMany as jest.Mock).mockResolvedValue([
        { startTime: '09:00', endTime: '11:00' },
      ]);
      (prisma.appointment.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.timeOff.findMany as jest.Mock).mockResolvedValue([]);

      const result = await service.getAvailability({ dentistId: 'dentist-1', date: '2099-09-16' });

      expect(result.availableSlots).toEqual([
        '08:00',
        '08:15',
        '08:30',
        '08:45',
        '09:00',
        '09:15',
        '09:30',
        '09:45',
        '10:00',
        '10:15',
        '10:30',
      ]);
    });
  });

  describe('late arrival, undo of check-in / no-show (BR-APPT-007/012)', () => {
    // 11:00 clinic time (UTC+7); the visit is 9:00–9:30 today.
    const NOW = new Date('2026-09-30T04:00:00Z');
    const at = (hhmm: string, day = '2026-09-30') => new Date(`${day}T${hhmm}:00+07:00`);
    const visit = (over: Record<string, unknown> = {}) => ({
      id: 'appt-1',
      status: AppointmentStatus.SCHEDULED,
      patientId: 'patient-1',
      dentistId: 'dentist-1',
      visitKind: 'BOOKED',
      rescheduleCount: 0,
      confirmedAt: null,
      checkedInAt: null,
      noShowAt: null,
      cancelledReason: null,
      deletedAt: null,
      startAt: at('09:00'),
      endAt: at('09:30'),
      ...over,
    });
    const setNow = (d: Date) =>
      jest.useFakeTimers({ now: d, doNotFake: ['nextTick', 'setImmediate'] });
    const actionsOf = (err: { getResponse(): unknown }) =>
      (err.getResponse() as { details: { actions: Array<{ code: string }> } }).details.actions.map(
        a => a.code,
      );
    let slotCheck: jest.SpyInstance;

    beforeEach(() => {
      setNow(NOW);
      (prisma.patient.findUnique as jest.Mock).mockResolvedValue({
        id: 'patient-1',
        deletedAt: null,
      });
      slotCheck = jest.spyOn(service, 'ensureSlotAvailable').mockResolvedValue(undefined);
    });
    afterEach(() => jest.useRealTimers());

    describe('checkIn', () => {
      it('9:35 for 9:00–9:30: asks for a late check-in reason, offering only exits that work', async () => {
        setNow(at('09:35'));
        (prisma.appointment.findUnique as jest.Mock).mockResolvedValue(visit());

        const err = await service.checkIn('appt-1', false, undefined, actor).catch(e => e);

        expect(err.getResponse()).toEqual(
          expect.objectContaining({
            code: 'CHECK_IN_EXPIRED',
            message: 'Đã quá 30 phút sau giờ hẹn — check-in muộn cần lý do',
          }),
        );
        // Cancel is refused after the start (BR-APPT-010), so it is not offered.
        expect(actionsOf(err)).toEqual(['still_check_in', 'no_show']);
        expect(prisma.appointment.updateMany).not.toHaveBeenCalled();
      });

      it('checks in late the same day after the slot ended, with a reason, keeping the held slot', async () => {
        (prisma.appointment.findUnique as jest.Mock).mockResolvedValue(visit());
        (prisma.appointment.updateMany as jest.Mock).mockResolvedValue({ count: 1 });
        (prisma.appointment.findUniqueOrThrow as jest.Mock).mockResolvedValue(
          visit({ status: AppointmentStatus.CHECKED_IN }),
        );

        const result = await service.checkIn('appt-1', true, '  Kẹt xe, báo trước  ', actor);

        expect(result.status).toBe(AppointmentStatus.CHECKED_IN);
        expect(slotCheck).not.toHaveBeenCalled();
        expect(prisma.queueEntry.upsert).toHaveBeenCalledWith(
          expect.objectContaining({ create: expect.objectContaining({ priority: 'LATE' }) }),
        );
        expect(audit.log).toHaveBeenCalledWith(
          expect.objectContaining({
            action: 'APPOINTMENT_CHECKIN_OVERRIDDEN',
            metadata: { override: true, overrideReason: 'Kẹt xe, báo trước' },
          }),
        );
      });

      it('requires a real reason (5+ characters after trimming)', async () => {
        (prisma.appointment.findUnique as jest.Mock).mockResolvedValue(visit());

        await expect(service.checkIn('appt-1', true, '  ab  ', actor)).rejects.toThrow(
          'Check-in muộn cần lý do (ít nhất 5 ký tự)',
        );
        expect(prisma.appointment.updateMany).not.toHaveBeenCalled();
      });

      it('refuses a visit of an earlier clinic day, without suggesting a late check-in', async () => {
        (prisma.appointment.findUnique as jest.Mock).mockResolvedValue(
          visit({ startAt: at('16:00', '2026-09-29'), endAt: at('16:30', '2026-09-29') }),
        );

        const err = await service
          .checkIn('appt-1', true, 'Bệnh nhân đến muộn', actor)
          .catch(e => e);

        expect(err.getResponse()).toEqual(
          expect.objectContaining({
            code: 'CHECK_IN_EXPIRED',
            message:
              'Lịch hẹn ngày 29/09/2026 đã qua — không thể check-in. Hãy đặt lịch mới cho bệnh nhân.',
          }),
        );
        expect(actionsOf(err)).toEqual([]);
        expect(prisma.appointment.updateMany).not.toHaveBeenCalled();
      });

      it('from NO_SHOW without a reason: only the late check-in is offered', async () => {
        (prisma.appointment.findUnique as jest.Mock).mockResolvedValue(
          visit({ status: AppointmentStatus.NO_SHOW }),
        );

        const err = await service.checkIn('appt-1', false, undefined, actor).catch(e => e);

        expect(err.getResponse()).toEqual(
          expect.objectContaining({
            message: 'Lịch đã bị đánh vắng mặt — check-in muộn cần lý do',
          }),
        );
        expect(actionsOf(err)).toEqual(['still_check_in']);
      });

      it('from NO_SHOW with a reason: re-checks the released slot, clears the no-show and audits it', async () => {
        const noShow = visit({
          status: AppointmentStatus.NO_SHOW,
          noShowAt: at('10:30'),
          cancelledReason: 'Không liên lạc được',
        });
        (prisma.appointment.findUnique as jest.Mock).mockResolvedValue(noShow);
        (prisma.appointment.findFirst as jest.Mock).mockResolvedValue(null);
        (prisma.appointment.updateMany as jest.Mock).mockResolvedValue({ count: 1 });
        (prisma.appointment.findUniqueOrThrow as jest.Mock).mockResolvedValue(
          visit({ status: AppointmentStatus.CHECKED_IN }),
        );

        await service.checkIn('appt-1', true, 'Bệnh nhân đến muộn', actor);

        expect(slotCheck).toHaveBeenCalledWith(
          'dentist-1',
          noShow.startAt,
          noShow.endAt,
          actor,
          'appt-1',
          prisma,
          noShow,
        );
        // Patient free too (not booked elsewhere meanwhile).
        expect(prisma.appointment.findFirst).toHaveBeenCalledWith(
          expect.objectContaining({
            where: expect.objectContaining({ patientId: 'patient-1', NOT: { id: 'appt-1' } }),
          }),
        );
        expect(prisma.appointment.updateMany).toHaveBeenCalledWith({
          where: expect.objectContaining({ id: 'appt-1', status: AppointmentStatus.NO_SHOW }),
          data: expect.objectContaining({
            status: AppointmentStatus.CHECKED_IN,
            noShowAt: null,
            cancelledReason: null,
          }),
        });
        expect(audit.log).toHaveBeenCalledWith(
          expect.objectContaining({
            action: 'APPOINTMENT_CHECKIN_OVERRIDDEN',
            metadata: expect.objectContaining({
              fromStatus: AppointmentStatus.NO_SHOW,
              noShowReason: 'Không liên lạc được',
            }),
          }),
        );
      });

      it('from NO_SHOW: refuses when the released slot was taken meanwhile', async () => {
        (prisma.appointment.findUnique as jest.Mock).mockResolvedValue(
          visit({ status: AppointmentStatus.NO_SHOW }),
        );
        slotCheck.mockRejectedValue(new SlotConflictException());

        await expect(service.checkIn('appt-1', true, 'Bệnh nhân đến muộn', actor)).rejects.toThrow(
          SlotConflictException,
        );
        expect(prisma.appointment.updateMany).not.toHaveBeenCalled();
        expect(audit.log).not.toHaveBeenCalled();
      });

      it('from NO_SHOW: the active-slot unique index is a slot conflict, not a 500', async () => {
        (prisma.appointment.findUnique as jest.Mock).mockResolvedValue(
          visit({ status: AppointmentStatus.NO_SHOW }),
        );
        (prisma.appointment.updateMany as jest.Mock).mockRejectedValue(
          new Prisma.PrismaClientKnownRequestError('unique', { code: 'P2002', clientVersion: '5' }),
        );

        await expect(service.checkIn('appt-1', true, 'Bệnh nhân đến muộn', actor)).rejects.toThrow(
          SlotConflictException,
        );
      });

      it("404s for a dentist checking in a colleague's patient", async () => {
        (prisma.appointment.findUnique as jest.Mock).mockResolvedValue(visit());

        await expect(
          service.checkIn('appt-1', false, undefined, dentistPayload('dentist-self')),
        ).rejects.toThrow(AppointmentNotFoundException);
        expect(prisma.appointment.updateMany).not.toHaveBeenCalled();
      });
    });

    describe('markNoShow opens at +15 min ("Quá giờ")', () => {
      it('refuses 10 minutes after the start', async () => {
        setNow(at('09:10'));
        (prisma.appointment.findUnique as jest.Mock).mockResolvedValue(visit());

        await expect(service.markNoShow('appt-1', { reason: 'x' }, actor)).rejects.toThrow(
          'Chỉ đánh vắng mặt khi đã quá giờ hẹn 15 phút — bệnh nhân có thể đang đến',
        );
        expect(prisma.appointment.updateMany).not.toHaveBeenCalled();
      });

      it('accepts from 15 minutes after the start, guarded on that bound', async () => {
        setNow(at('09:15'));
        (prisma.appointment.findUnique as jest.Mock).mockResolvedValue(visit());
        (prisma.appointment.updateMany as jest.Mock).mockResolvedValue({ count: 1 });
        (prisma.appointment.findUniqueOrThrow as jest.Mock).mockResolvedValue(
          visit({ status: AppointmentStatus.NO_SHOW }),
        );

        await service.markNoShow('appt-1', { reason: 'Không liên lạc được' }, actor);

        expect(prisma.appointment.updateMany).toHaveBeenCalledWith(
          expect.objectContaining({
            where: {
              id: 'appt-1',
              status: AppointmentStatus.SCHEDULED,
              startAt: { lte: at('09:00') },
            },
          }),
        );
      });
    });

    describe('undoNoShow', () => {
      const noShow = (over: Record<string, unknown> = {}) =>
        visit({
          status: AppointmentStatus.NO_SHOW,
          noShowAt: at('10:30'),
          cancelledReason: 'Không liên lạc được',
          ...over,
        });

      it('goes back to CONFIRMED when it was confirmed, re-checking the slot, with a history entry', async () => {
        const appt = noShow({ confirmedAt: at('08:00', '2026-09-29') });
        (prisma.appointment.findUnique as jest.Mock).mockResolvedValue(appt);
        (prisma.appointment.findFirst as jest.Mock).mockResolvedValue(null);
        (prisma.appointment.updateMany as jest.Mock).mockResolvedValue({ count: 1 });
        (prisma.appointment.findUniqueOrThrow as jest.Mock).mockResolvedValue({
          ...appt,
          status: AppointmentStatus.CONFIRMED,
        });

        const result = await service.undoNoShow(
          'appt-1',
          { reason: ' Khách gọi báo đang tới ' },
          actor,
        );

        expect(result.status).toBe(AppointmentStatus.CONFIRMED);
        expect(slotCheck).toHaveBeenCalled();
        expect(prisma.appointment.updateMany).toHaveBeenCalledWith({
          where: expect.objectContaining({ id: 'appt-1', status: AppointmentStatus.NO_SHOW }),
          data: {
            status: AppointmentStatus.CONFIRMED,
            noShowAt: null,
            cancelledReason: null,
            updatedBy: actor.sub,
          },
        });
        expect(prisma.auditLog.create).toHaveBeenCalledWith({
          data: expect.objectContaining({
            action: 'APPOINTMENT_NO_SHOW_REVERTED',
            targetType: 'appointment',
            targetId: 'appt-1',
            metadata: expect.objectContaining({
              reason: 'Khách gọi báo đang tới',
              restoredStatus: AppointmentStatus.CONFIRMED,
              noShowReason: 'Không liên lạc được',
            }),
          }),
        });
      });

      it('goes back to SCHEDULED when it was never confirmed', async () => {
        (prisma.appointment.findUnique as jest.Mock).mockResolvedValue(noShow());
        (prisma.appointment.updateMany as jest.Mock).mockResolvedValue({ count: 1 });
        (prisma.appointment.findUniqueOrThrow as jest.Mock).mockResolvedValue(visit());

        await service.undoNoShow('appt-1', { reason: 'Đánh nhầm bệnh nhân' }, actor);

        expect((prisma.appointment.updateMany as jest.Mock).mock.calls[0][0].data.status).toBe(
          AppointmentStatus.SCHEDULED,
        );
      });

      it('refuses on a later day, without a reason, or for another status', async () => {
        (prisma.appointment.findUnique as jest.Mock).mockResolvedValue(
          noShow({ startAt: at('09:00', '2026-09-29'), endAt: at('09:30', '2026-09-29') }),
        );
        await expect(service.undoNoShow('appt-1', { reason: 'Đánh nhầm' }, actor)).rejects.toThrow(
          'Chỉ hoàn tác vắng mặt trong ngày hẹn',
        );

        (prisma.appointment.findUnique as jest.Mock).mockResolvedValue(noShow());
        await expect(service.undoNoShow('appt-1', { reason: ' ab ' }, actor)).rejects.toThrow(
          'Hoàn tác vắng mặt cần lý do (ít nhất 5 ký tự)',
        );

        (prisma.appointment.findUnique as jest.Mock).mockResolvedValue(
          visit({ status: AppointmentStatus.CANCELLED }),
        );
        await expect(service.undoNoShow('appt-1', { reason: 'Đánh nhầm' }, actor)).rejects.toThrow(
          'Chỉ hoàn tác được lịch đang vắng mặt (lịch đang ở trạng thái "đã hủy")',
        );
        expect(prisma.appointment.updateMany).not.toHaveBeenCalled();
      });

      it('refuses when the released slot was taken meanwhile', async () => {
        (prisma.appointment.findUnique as jest.Mock).mockResolvedValue(noShow());
        slotCheck.mockRejectedValue(new SlotConflictException());

        await expect(service.undoNoShow('appt-1', { reason: 'Đánh nhầm' }, actor)).rejects.toThrow(
          SlotConflictException,
        );
        expect(prisma.appointment.updateMany).not.toHaveBeenCalled();
        expect(prisma.auditLog.create).not.toHaveBeenCalled();
      });

      it("404s for a dentist on a colleague's appointment; 409 when changed meanwhile", async () => {
        (prisma.appointment.findUnique as jest.Mock).mockResolvedValue(noShow());
        await expect(
          service.undoNoShow('appt-1', { reason: 'Đánh nhầm' }, dentistPayload('dentist-self')),
        ).rejects.toThrow(AppointmentNotFoundException);

        (prisma.appointment.updateMany as jest.Mock).mockResolvedValue({ count: 0 });
        await expect(service.undoNoShow('appt-1', { reason: 'Đánh nhầm' }, actor)).rejects.toThrow(
          'Lịch vừa được thay đổi, tải lại rồi thử lại',
        );
        expect(prisma.auditLog.create).not.toHaveBeenCalled();
      });
    });

    describe('undoCheckIn', () => {
      const checkedIn = (over: Record<string, unknown> = {}) =>
        visit({ status: AppointmentStatus.CHECKED_IN, checkedInAt: at('08:55'), ...over });

      beforeEach(() => {
        setNow(at('09:05'));
        (prisma.encounter.findUnique as jest.Mock).mockResolvedValue(null);
      });

      it('goes back to the booked status, closes the queue entry and records why', async () => {
        const appt = checkedIn({ confirmedAt: at('08:00', '2026-09-29') });
        (prisma.appointment.findUnique as jest.Mock).mockResolvedValue(appt);
        (prisma.appointment.updateMany as jest.Mock).mockResolvedValue({ count: 1 });
        (prisma.appointment.findUniqueOrThrow as jest.Mock).mockResolvedValue({
          ...appt,
          status: AppointmentStatus.CONFIRMED,
        });

        const result = await service.undoCheckIn(
          'appt-1',
          { reason: 'Check-in nhầm bệnh nhân' },
          actor,
        );

        expect(result.status).toBe(AppointmentStatus.CONFIRMED);
        expect(prisma.appointment.updateMany).toHaveBeenCalledWith({
          where: {
            id: 'appt-1',
            status: AppointmentStatus.CHECKED_IN,
            startAt: appt.startAt,
            dentistId: 'dentist-1',
            rescheduleCount: 0,
          },
          data: {
            status: AppointmentStatus.CONFIRMED,
            checkedInAt: null,
            checkedInBy: null,
            updatedBy: actor.sub,
          },
        });
        expect(prisma.queueEntry.updateMany).toHaveBeenCalledWith({
          where: { appointmentId: 'appt-1', doneAt: null },
          data: expect.objectContaining({ closeReason: 'CANCELLED', doneAt: expect.any(Date) }),
        });
        expect(prisma.auditLog.create).toHaveBeenCalledWith({
          data: expect.objectContaining({
            action: 'APPOINTMENT_CHECKIN_UNDONE',
            targetType: 'appointment',
            metadata: expect.objectContaining({
              reason: 'Check-in nhầm bệnh nhân',
              restoredStatus: AppointmentStatus.CONFIRMED,
            }),
          }),
        });
      });

      it('refuses once an encounter was opened (even if cancelled since)', async () => {
        (prisma.appointment.findUnique as jest.Mock).mockResolvedValue(checkedIn());
        (prisma.encounter.findUnique as jest.Mock).mockResolvedValue({ id: 'enc-1' });

        await expect(
          service.undoCheckIn('appt-1', { reason: 'Check-in nhầm' }, actor),
        ).rejects.toThrow(/Lượt khám đã từng được mở/);
        expect(prisma.appointment.updateMany).not.toHaveBeenCalled();
        expect(prisma.queueEntry.updateMany).not.toHaveBeenCalled();
      });

      it('refuses during the exam, for a walk-in, on a later day and without a reason', async () => {
        (prisma.appointment.findUnique as jest.Mock).mockResolvedValue(
          checkedIn({ status: AppointmentStatus.IN_PROGRESS }),
        );
        await expect(
          service.undoCheckIn('appt-1', { reason: 'Check-in nhầm' }, actor),
        ).rejects.toThrow('Bệnh nhân đã vào khám — không thể hoàn tác check-in');

        (prisma.appointment.findUnique as jest.Mock).mockResolvedValue(
          checkedIn({ visitKind: 'WALK_IN' }),
        );
        await expect(
          service.undoCheckIn('appt-1', { reason: 'Check-in nhầm' }, actor),
        ).rejects.toThrow(/Khách vãng lai/);

        setNow(at('08:00', '2026-10-01'));
        (prisma.appointment.findUnique as jest.Mock).mockResolvedValue(checkedIn());
        await expect(
          service.undoCheckIn('appt-1', { reason: 'Check-in nhầm' }, actor),
        ).rejects.toThrow('Chỉ hoàn tác check-in trong ngày hẹn');

        setNow(at('09:05'));
        await expect(service.undoCheckIn('appt-1', { reason: '    ' }, actor)).rejects.toThrow(
          'Hoàn tác check-in cần lý do (ít nhất 5 ký tự)',
        );
        expect(prisma.appointment.updateMany).not.toHaveBeenCalled();
      });

      it("404s for a dentist on a colleague's patient; 409 when changed meanwhile", async () => {
        (prisma.appointment.findUnique as jest.Mock).mockResolvedValue(checkedIn());
        await expect(
          service.undoCheckIn(
            'appt-1',
            { reason: 'Check-in nhầm' },
            dentistPayload('dentist-self'),
          ),
        ).rejects.toThrow(AppointmentNotFoundException);

        (prisma.appointment.updateMany as jest.Mock).mockResolvedValue({ count: 0 });
        await expect(
          service.undoCheckIn('appt-1', { reason: 'Check-in nhầm' }, actor),
        ).rejects.toThrow('Lịch vừa được thay đổi, tải lại rồi thử lại');
        expect(prisma.queueEntry.updateMany).not.toHaveBeenCalled();
        expect(prisma.auditLog.create).not.toHaveBeenCalled();
      });
    });

    it("markLeft 404s for a dentist on a colleague's patient", async () => {
      (prisma.appointment.findUnique as jest.Mock).mockResolvedValue(
        visit({ status: AppointmentStatus.CHECKED_IN }),
      );

      await expect(
        service.markLeft('appt-1', { reason: 'Chờ lâu, xin về' }, dentistPayload('dentist-self')),
      ).rejects.toThrow(AppointmentNotFoundException);
      expect(prisma.appointment.updateMany).not.toHaveBeenCalled();
    });
  });

  describe('history (BR-APPT-034)', () => {
    it("matches the target type case-insensitively, so update()'s old 'Appointment' rows show", async () => {
      (prisma.appointment.findFirst as jest.Mock).mockResolvedValue({
        id: 'appt-1',
        dentistId: 'dentist-1',
      });
      (prisma.auditLog.findMany as jest.Mock).mockResolvedValue([
        {
          action: 'APPOINTMENT_UPDATED',
          occurredAt: new Date('2026-09-01T02:00:00Z'),
          actorEmailAtTime: 'desk@clinic.com',
          metadata: { notes: 'x' },
        },
      ]);
      (prisma.appointmentRescheduleLog.findMany as jest.Mock).mockResolvedValue([]);

      const result = await service.history('appt-1', actor);

      expect(prisma.auditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            targetType: { equals: 'appointment', mode: 'insensitive' },
            targetId: 'appt-1',
          },
        }),
      );
      expect(result.events.map(e => e.action)).toEqual(['APPOINTMENT_UPDATED']);
    });

    it("update() now writes the lower-case 'appointment' target type", async () => {
      (prisma.appointment.findUnique as jest.Mock).mockResolvedValue({
        id: 'appt-1',
        dentistId: 'dentist-1',
        status: AppointmentStatus.SCHEDULED,
      });
      (prisma.appointment.update as jest.Mock).mockResolvedValue({ id: 'appt-1' });

      await service.update('appt-1', { notes: 'Gọi trước 1 ngày' } as any, actor);

      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'APPOINTMENT_UPDATED', targetType: 'appointment' }),
      );
    });
  });

  it('APPT-FU-09: getAvailability issues independent reads in parallel', async () => {
    let releaseSchedules!: (v: unknown) => void;
    (prisma.workingSchedule.findMany as jest.Mock).mockReturnValue(
      new Promise(resolve => (releaseSchedules = resolve)),
    );
    (prisma.shiftRegistration.findMany as jest.Mock).mockResolvedValue([]);
    let releaseBooked!: (v: unknown) => void;
    (prisma.appointment.findMany as jest.Mock).mockReturnValue(
      new Promise(resolve => (releaseBooked = resolve)),
    );
    (prisma.timeOff.findMany as jest.Mock).mockResolvedValue([]);

    const pending = service.getAvailability({ dentistId: 'dentist-1', date: '2099-09-16' });
    await new Promise(r => setImmediate(r));
    // shifts query already issued while schedules is still pending
    expect(prisma.shiftRegistration.findMany).toHaveBeenCalled();

    releaseSchedules([
      {
        startTime: new Date('1970-01-01T08:00:00Z'),
        endTime: new Date('1970-01-01T09:00:00Z'),
        slotDurationMin: 30,
      },
    ]);
    await new Promise(r => setImmediate(r));
    // time-off query already issued while bookings is still pending
    expect(prisma.timeOff.findMany).toHaveBeenCalled();
    releaseBooked([]);

    await expect(pending).resolves.toEqual(
      expect.objectContaining({ availableSlots: ['08:00', '08:15', '08:30'] }),
    );
  });

  describe('time-off approval and schedule overrides (ADR-0009 phase 3)', () => {
    const dentist = {
      id: 'dentist-1',
      status: 'ACTIVE',
      userRoles: [{ role: { code: 'dentist' } }],
    };
    const future = (h: number) => new Date(Date.now() + h * 60 * 60 * 1000).toISOString();
    const timeOffDto = {
      dentistId: 'dentist-1',
      startAt: future(24),
      endAt: future(48),
      type: 'VACATION',
    } as any;

    beforeEach(() => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(dentist);
      (prisma.appointment.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.timeOff.findFirst as jest.Mock).mockResolvedValue(null);
      (prisma.timeOff.create as jest.Mock).mockImplementation(async ({ data }: any) => ({
        id: 'to-1',
        ...data,
      }));
    });

    it('BR-SCH-001: a request from someone who cannot approve is PENDING', async () => {
      const result = await service.createTimeOff(timeOffDto, receptionistPayload());
      expect(result.status).toBe('PENDING');
      // Nothing is blocked yet, so patients in the clinic are not checked.
      expect(prisma.appointment.count).not.toHaveBeenCalled();
    });

    it('BR-SCH-001: an approver records APPROVED time-off directly', async () => {
      (prisma.appointment.count as jest.Mock).mockResolvedValue(0);
      const result = await service.createTimeOff(timeOffDto, approver);
      expect(result).toMatchObject({ status: 'APPROVED', decidedBy: approver.sub });
    });

    it('BR-SCH-002: refuses time-off overlapping a pending or approved one', async () => {
      (prisma.timeOff.findFirst as jest.Mock).mockResolvedValue({ id: 'to-0', status: 'PENDING' });
      const error = await service.createTimeOff(timeOffDto, approver).catch(e => e);
      expect(error.getResponse().error).toBe('TIME_OFF_OVERLAP');
      expect(prisma.timeOff.create).not.toHaveBeenCalled();
    });

    it('approving a pending time-off returns the bookings to move', async () => {
      (prisma.timeOff.findFirst as jest.Mock).mockResolvedValue({
        id: 'to-1',
        dentistId: 'dentist-1',
        status: 'PENDING',
        startAt: new Date(future(24)),
        endAt: new Date(future(48)),
      });
      (prisma.appointment.count as jest.Mock).mockResolvedValue(0);
      (prisma.appointment.findMany as jest.Mock).mockResolvedValue([{ id: 'appt-1' }]);
      (prisma.timeOff.update as jest.Mock).mockImplementation(async ({ data }: any) => ({
        id: 'to-1',
        ...data,
      }));

      const result = await service.approveTimeOff('to-1', {}, approver);
      expect(result.status).toBe('APPROVED');
      expect(result.affectedAppointments).toEqual([{ id: 'appt-1' }]);
    });

    it('rejecting needs a reason', async () => {
      await expect(service.rejectTimeOff('to-1', { note: '' }, approver)).rejects.toThrow(/lý do/);
    });

    it("a dentist cannot cancel a colleague's time-off", async () => {
      (prisma.timeOff.findFirst as jest.Mock).mockResolvedValue({
        id: 'to-1',
        dentistId: 'dentist-other',
        status: 'APPROVED',
        endAt: new Date(future(48)),
      });
      await expect(service.cancelTimeOff('to-1', dentistPayload('dentist-self'))).rejects.toThrow(
        /chính mình/,
      );
    });

    describe('booking against the day calendar', () => {
      const book = () =>
        service.create(
          {
            dentistId: 'dentist-1',
            patientId: 'patient-1',
            startAt: '2027-03-15T02:15:00Z',
          } as any,
          actor,
        );
      beforeEach(() => {
        (prisma.patient.findUnique as jest.Mock).mockResolvedValue({
          id: 'patient-1',
          deletedAt: null,
        });
        (prisma.appointment.findFirst as jest.Mock).mockResolvedValue(null);
        (prisma.workingSchedule.findMany as jest.Mock).mockResolvedValue([
          {
            startTime: new Date('1970-01-01T08:00:00Z'),
            endTime: new Date('1970-01-01T17:00:00Z'),
          },
        ]);
        (prisma.appointment.create as jest.Mock).mockResolvedValue({ id: 'appt-new' });
      });

      it('only APPROVED time-off blocks a booking', async () => {
        await book();
        expect((prisma.timeOff.findMany as jest.Mock).mock.calls[0][0].where.status).toBe(
          'APPROVED',
        );
      });

      it('BR-SCH-003: a closed day refuses bookings', async () => {
        (prisma.scheduleOverride.findMany as jest.Mock).mockResolvedValue([
          { kind: 'CLOSED', startTime: null, endTime: null },
        ]);
        await expect(book()).rejects.toThrow(/đóng cả ngày/);
        expect(prisma.appointment.create).not.toHaveBeenCalled();
      });

      it('BR-SCH-003: a closed range refuses bookings inside it', async () => {
        (prisma.scheduleOverride.findMany as jest.Mock).mockResolvedValue([
          {
            kind: 'CLOSED',
            startTime: new Date('1970-01-01T09:00:00Z'),
            endTime: new Date('1970-01-01T10:00:00Z'),
          },
        ]);
        await expect(book()).rejects.toThrow(/đóng 09:00-10:00/);
      });

      it('BR-SCH-004: changed hours replace the weekly schedule', async () => {
        (prisma.scheduleOverride.findMany as jest.Mock).mockResolvedValue([
          {
            kind: 'CHANGED_HOURS',
            startTime: new Date('1970-01-01T13:00:00Z'),
            endTime: new Date('1970-01-01T17:00:00Z'),
          },
        ]);
        await expect(book()).rejects.toThrow(/giờ đã điều chỉnh/);
        expect(prisma.workingSchedule.findFirst).not.toHaveBeenCalled();
      });
    });

    it('availability reports a closed day', async () => {
      (prisma.workingSchedule.findMany as jest.Mock).mockResolvedValue([
        {
          startTime: new Date('1970-01-01T08:00:00Z'),
          endTime: new Date('1970-01-01T17:00:00Z'),
          slotDurationMin: 30,
        },
      ]);
      (prisma.shiftRegistration.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.scheduleOverride.findMany as jest.Mock).mockResolvedValue([
        { kind: 'CLOSED', startTime: null, endTime: null, reason: 'Sửa ghế' },
      ]);
      const result = await service.getAvailability({
        dentistId: 'dentist-1',
        date: '2027-03-15',
      } as any);
      expect(result).toMatchObject({
        blockedReason: 'CLOSED',
        availableSlots: [],
        closedReason: 'Sửa ghế',
      });
    });

    it('overrides are clinic management only', async () => {
      await expect(
        service.createScheduleOverride(
          { dentistId: 'dentist-self', date: '2099-01-05', kind: 'CLOSED', reason: 'Nghỉ' } as any,
          dentistPayload('dentist-self'),
        ),
      ).rejects.toThrow(/Chỉ quản trị phòng khám/);
    });

    it('changed hours may not overlap a block the day already has', async () => {
      (prisma.scheduleOverride.findMany as jest.Mock).mockResolvedValue([
        {
          id: 'ov-1',
          startTime: new Date('1970-01-01T14:00:00Z'),
          endTime: new Date('1970-01-01T18:00:00Z'),
        },
      ]);
      const error = await service
        .createScheduleOverride(
          {
            dentistId: 'dentist-1',
            date: '2099-01-05',
            kind: 'CHANGED_HOURS',
            startTime: '13:00',
            endTime: '17:00',
            reason: 'Họp buổi sáng',
          } as any,
          actor,
        )
        .catch(e => e);
      expect(error.getResponse().error).toBe('OVERRIDE_EXISTS');
    });
  });

  describe('services, walk-in and LEFT (ADR-0009 phase 5)', () => {
    const dentist = {
      id: 'dentist-1',
      status: 'ACTIVE',
      userRoles: [{ role: { code: 'dentist' } }],
    };
    const assignment = (serviceId: string, over: Record<string, unknown> = {}) => ({
      serviceId,
      durationMin: null,
      price: null,
      service: {
        code: serviceId.toUpperCase(),
        name: `Dịch vụ ${serviceId}`,
        basePrice: 400000,
        defaultDurationMin: 30,
        bufferBeforeMin: 0,
        bufferAfterMin: 5,
      },
      ...over,
    });
    const dto = {
      dentistId: 'dentist-1',
      patientId: 'patient-1',
      startAt: '2027-03-15T02:00:00Z',
      serviceIds: ['svc-a', 'svc-b'],
    } as any;

    beforeEach(() => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(dentist);
      (prisma.patient.findUnique as jest.Mock).mockResolvedValue({
        id: 'patient-1',
        deletedAt: null,
      });
      (prisma.workingSchedule.findMany as jest.Mock).mockResolvedValue([
        { startTime: new Date('1970-01-01T00:00:00Z'), endTime: new Date('1970-01-01T23:59:00Z') },
      ]);
      (prisma.appointment.findFirst as jest.Mock).mockResolvedValue(null);
      (prisma.appointment.create as jest.Mock).mockImplementation(async ({ data }: any) => ({
        id: 'appt-new',
        ...data,
      }));
      (prisma.dentistService.findMany as jest.Mock).mockResolvedValue([
        assignment('svc-a', { durationMin: 45 }),
        assignment('svc-b', {
          service: { ...assignment('svc-b').service, bufferBeforeMin: 10, bufferAfterMin: 15 },
          price: 500000,
        }),
      ]);
    });

    it('BR-APPT-030/031: length is the services total, buffers the largest, services snapshotted', async () => {
      await service.create(dto, actor);
      const data = (prisma.appointment.create as jest.Mock).mock.calls[0][0].data;
      expect(data.endAt).toEqual(new Date('2027-03-15T03:15:00Z')); // 45 + 30 min
      expect(data).toMatchObject({
        calculatedDurationMin: 75,
        bufferBeforeMin: 10,
        bufferAfterMin: 15,
      });
      expect(data.services.create).toEqual([
        expect.objectContaining({
          serviceId: 'svc-a',
          durationMin: 45,
          price: 400000,
          sortOrder: 0,
        }),
        expect.objectContaining({
          serviceId: 'svc-b',
          durationMin: 30,
          price: 500000,
          sortOrder: 1,
        }),
      ]);
    });

    it('BR-APPT-030: refuses a service the dentist does not perform that day', async () => {
      (prisma.dentistService.findMany as jest.Mock).mockResolvedValue([assignment('svc-a')]);
      const error = await service.create(dto, actor).catch(e => e);
      expect(error.getResponse()).toMatchObject({
        error: 'SERVICE_NOT_ASSIGNED',
        details: { serviceIds: ['svc-b'] },
      });
      expect(prisma.appointment.create).not.toHaveBeenCalled();
      // New bookings still need an active service.
      expect((prisma.dentistService.findMany as jest.Mock).mock.calls[0][0].where.service).toEqual({
        isActive: true,
      });
    });

    it('BR-APPT-031: a different length needs a reason, which is stored', async () => {
      const shorter = { ...dto, endAt: '2027-03-15T03:00:00Z' };
      await expect(service.create(shorter, actor)).rejects.toThrow(/needs a reason/);
      await service.create(
        { ...shorter, durationOverrideReason: 'Bệnh nhân tái khám nhanh' },
        actor,
      );
      expect(
        (prisma.appointment.create as jest.Mock).mock.calls[0][0].data.durationOverrideReason,
      ).toBe('Bệnh nhân tái khám nhanh');
    });

    it("D4: the new visit's buffers are checked against the day's bookings", async () => {
      (prisma.appointment.findMany as jest.Mock).mockResolvedValue([
        {
          id: 'prev',
          startAt: new Date('2027-03-15T01:30:00Z'),
          endAt: new Date('2027-03-15T01:55:00Z'),
        },
      ]);
      // prep 10 min before 02:00 overlaps the booking ending 01:55
      await expect(service.create(dto, actor)).rejects.toThrow();
      expect(prisma.appointment.create).not.toHaveBeenCalled();
    });

    it('BR-APPT-032: a walk-in starts now and is checked in at once', async () => {
      // Mid-morning in Vietnam, so the 20-minute visit never crosses midnight.
      jest.useFakeTimers({
        now: new Date('2026-09-30T03:00:00Z'),
        doNotFake: ['nextTick', 'setImmediate'],
      });
      try {
        (prisma.dentistService.findMany as jest.Mock).mockResolvedValue([]);
        const before = Date.now();
        await service.createWalkIn(
          { dentistId: 'dentist-1', patientId: 'patient-1', durationMin: 20 } as any,
          actor,
        );
        const data = (prisma.appointment.create as jest.Mock).mock.calls[0][0].data;
        expect(data).toMatchObject({
          visitKind: 'WALK_IN',
          source: 'WALK_IN',
          status: AppointmentStatus.CHECKED_IN,
        });
        expect(data.startAt.getTime()).toBeLessThanOrEqual(before);
        expect(data.endAt.getTime() - data.startAt.getTime()).toBe(20 * 60_000);
      } finally {
        jest.useRealTimers();
      }
    });

    it('BR-APPT-033: only a checked-in patient can be marked LEFT', async () => {
      (prisma.appointment.findUnique as jest.Mock).mockResolvedValue({
        id: 'appt-1',
        status: AppointmentStatus.SCHEDULED,
        deletedAt: null,
      });
      await expect(
        service.markLeft('appt-1', { reason: 'Bệnh nhân bận việc' }, actor),
      ).rejects.toThrow(/cho bệnh nhân đã check-in/);

      (prisma.appointment.findUnique as jest.Mock).mockResolvedValue({
        id: 'appt-1',
        status: AppointmentStatus.CHECKED_IN,
        deletedAt: null,
      });
      (prisma.appointment.updateMany as jest.Mock).mockResolvedValue({ count: 1 });
      (prisma.appointment.findUniqueOrThrow as jest.Mock).mockResolvedValue({
        id: 'appt-1',
        status: 'LEFT',
      });
      await service.markLeft('appt-1', { reason: 'Bệnh nhân bận việc' }, actor);
      expect(prisma.appointment.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'appt-1', status: AppointmentStatus.CHECKED_IN },
          data: expect.objectContaining({
            status: AppointmentStatus.LEFT,
            leftReason: 'Bệnh nhân bận việc',
          }),
        }),
      );
    });
  });
});

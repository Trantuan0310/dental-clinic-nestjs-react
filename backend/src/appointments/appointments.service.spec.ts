import { Test } from '@nestjs/testing';
import { AppointmentsService } from './appointments.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { createPrismaMock, PrismaMockShape, asTransaction } from '../../test/helpers/prisma-mock';
import { adminPayload, dentistPayload, receptionistPayload } from '../../test/helpers';
import { AppointmentStatus, EncounterStatus } from '@prisma/client';
import { EventEmitter2 } from '@nestjs/event-emitter';

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
    expect(prisma.appointment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          startAt: {
            gte: new Date('2099-09-15T17:00:00Z'),
            lt: new Date('2099-09-16T17:00:00Z'),
          },
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
    it('returns active dentists with their calendar colour, skipping inactive profiles', async () => {
      (prisma.user.findMany as jest.Mock).mockResolvedValue([
        {
          id: 'dentist-1',
          fullName: 'Bác sĩ Nguyễn An',
          dentistProfile: { calendarColor: '#2563EB', practiceStatus: 'ACTIVE' },
        },
        { id: 'dentist-2', fullName: 'Bác sĩ Trần Bình', dentistProfile: null },
      ]);

      const result = await service.listDentistOptions();

      expect(result).toEqual([
        {
          id: 'dentist-1',
          fullName: 'Bác sĩ Nguyễn An',
          calendarColor: '#2563EB',
          practiceStatus: 'ACTIVE',
        },
        {
          id: 'dentist-2',
          fullName: 'Bác sĩ Trần Bình',
          calendarColor: null,
          practiceStatus: null,
        },
      ]);
      expect(prisma.user.findMany).toHaveBeenCalledWith({
        where: {
          status: 'ACTIVE',
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
            { dentistProfile: null },
            { dentistProfile: { practiceStatus: 'ACTIVE', deletedAt: null } },
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
        /changed by someone else/,
      );
      expect(prisma.appointment.findUniqueOrThrow).not.toHaveBeenCalled();
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
      (prisma.workingSchedule.findFirst as jest.Mock).mockResolvedValue({
        startTime: new Date('1970-01-01T00:00:00Z'),
        endTime: new Date('1970-01-01T23:00:00Z'),
      });
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
      ).rejects.toThrow(/suspended/);
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
      (prisma.workingSchedule.findFirst as jest.Mock).mockResolvedValue(workingSchedule);
      (prisma.timeOff.findFirst as jest.Mock).mockResolvedValue(null);
      (prisma.appointment.create as jest.Mock).mockResolvedValue({ id: 'appt-new' });
    });

    it('queries appointments using a time-range overlap, not an exact startAt match', async () => {
      (prisma.appointment.findFirst as jest.Mock).mockResolvedValue(null);

      await service.create(
        { dentistId: 'dentist-1', patientId: 'patient-1', startAt: '2027-03-15T09:15:00Z' } as any,
        actor,
      );

      const whereArg = (prisma.appointment.findFirst as jest.Mock).mock.calls[0][0].where;
      expect(whereArg.startAt).toEqual({ lt: new Date('2027-03-15T09:45:00Z') });
      expect(whereArg.endAt).toEqual({ gt: new Date('2027-03-15T09:15:00Z') });
      expect(prisma.workingSchedule.findFirst).toHaveBeenCalledWith({
        where: expect.objectContaining({
          dayOfWeek: 1,
          startTime: { lte: new Date('1970-01-01T16:15:00Z') },
          endTime: { gte: new Date('1970-01-01T16:45:00Z') },
        }),
      });
    });

    it('rejects a booking that overlaps an existing appointment with a different startAt', async () => {
      // Existing appointment: 09:00–09:30. New request: 09:15–09:45 (overlaps
      // by 15 min but has a different startAt) — must still be rejected.
      (prisma.appointment.findFirst as jest.Mock).mockResolvedValue({ id: 'appt-existing' });

      await expect(
        service.create(
          {
            dentistId: 'dentist-1',
            patientId: 'patient-1',
            startAt: '2027-03-15T09:15:00Z',
          } as any,
          actor,
        ),
      ).rejects.toThrow();
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
    });

    it("markNoShow() 404s on another dentist's appointment (dentist gained appointment.no_show in this pass; this check ships alongside that grant so it doesn't newly expose the same ownership gap)", async () => {
      (prisma.appointment.findUnique as jest.Mock).mockResolvedValue(otherDentistAppt);

      await expect(service.markNoShow('appt-1', {} as any, dentistActor)).rejects.toThrow();
      expect(prisma.appointment.update).not.toHaveBeenCalled();
    });

    it("markNoShow() still works for a dentist's own appointment", async () => {
      const ownAppt = { ...otherDentistAppt, dentistId: 'dentist-self' };
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
    it('transitions to no_show when patient misses appointment', async () => {
      const existing = {
        id: 'appt-1',
        status: AppointmentStatus.CONFIRMED,
        startAt: new Date(Date.now() + 60 * 60 * 1000),
        endAt: new Date(Date.now() + 2 * 60 * 60 * 1000),
      };

      (prisma.appointment.findUnique as jest.Mock).mockResolvedValue(existing);
      (prisma.appointment.updateMany as jest.Mock).mockResolvedValue({ count: 1 });
      (prisma.appointment.findUniqueOrThrow as jest.Mock).mockResolvedValue({
        ...existing,
        status: AppointmentStatus.NO_SHOW,
      });

      const result = await service.markNoShow('appt-1', {} as any, actor);

      expect(result.status).toBe(AppointmentStatus.NO_SHOW);
      expect(audit.log).toHaveBeenCalled();
    });
  });

  describe('autoMarkNoShow', () => {
    it('waits until the check-in window closes (+30 min), not +15 min', async () => {
      (prisma.appointment.updateMany as jest.Mock).mockResolvedValue({ count: 0 });
      const before = Date.now();

      await service.autoMarkNoShow();

      const after = Date.now();
      const where = (prisma.appointment.updateMany as jest.Mock).mock.calls[0][0].where;
      const cutoffMs = where.startAt.lt.getTime();
      expect(cutoffMs).toBeGreaterThanOrEqual(before - 30 * 60_000);
      expect(cutoffMs).toBeLessThanOrEqual(after - 30 * 60_000);
      // APPT-FU-06: …and only once the booked slot itself has ended.
      const endCutoffMs = where.endAt.lt.getTime();
      expect(endCutoffMs).toBeGreaterThanOrEqual(before);
      expect(endCutoffMs).toBeLessThanOrEqual(after);
    });

    it('re-states the status filter in the write so a concurrent check-in is not overwritten', async () => {
      (prisma.appointment.updateMany as jest.Mock).mockResolvedValue({ count: 2 });

      const result = await service.autoMarkNoShow();

      expect(result.updated).toBe(2);
      expect(prisma.appointment.findMany).not.toHaveBeenCalled();
      const where = (prisma.appointment.updateMany as jest.Mock).mock.calls[0][0].where;
      expect(where.status).toEqual({
        in: [AppointmentStatus.SCHEDULED, AppointmentStatus.CONFIRMED],
      });
      expect(where.deletedAt).toBeNull();
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'APPOINTMENT_AUTO_NO_SHOW' }),
      );
    });

    it('skips the audit entry when nothing was marked', async () => {
      (prisma.appointment.updateMany as jest.Mock).mockResolvedValue({ count: 0 });

      await expect(service.autoMarkNoShow()).resolves.toEqual({ updated: 0 });
      expect(audit.log).not.toHaveBeenCalled();
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
    };

    beforeEach(() => {
      (prisma.appointment.findFirst as jest.Mock).mockResolvedValue(null);
      (prisma.workingSchedule.findFirst as jest.Mock).mockResolvedValue({
        startTime: new Date('1970-01-01T00:00:00Z'),
        endTime: new Date('1970-01-01T23:00:00Z'),
      });
      (prisma.timeOff.findFirst as jest.Mock).mockResolvedValue(null);
    });

    it.each([AppointmentStatus.CHECKED_IN, AppointmentStatus.IN_PROGRESS])(
      'rejects rescheduling a %s appointment (patient already at the clinic)',
      async status => {
        (prisma.appointment.findUnique as jest.Mock).mockResolvedValue({ ...base, status });

        await expect(service.reschedule('appt-1', future as any, actor)).rejects.toThrow(
          /Cannot reschedule appointment in status/,
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
      ).rejects.toThrow(/not active or lacks dentist role/);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('guards the write on status + rescheduleCount and surfaces a concurrent change', async () => {
      (prisma.appointment.findUnique as jest.Mock).mockResolvedValue(base);
      (prisma.appointment.updateMany as jest.Mock).mockResolvedValue({ count: 0 });

      await expect(service.reschedule('appt-1', future as any, actor)).rejects.toThrow(
        /changed by someone else/,
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
      ).rejects.toThrow(/requires a reason/);
      expect(prisma.appointment.updateMany).not.toHaveBeenCalled();
    });

    it('still blocks cancelling a SCHEDULED appointment after its start (that is a no-show)', async () => {
      (prisma.appointment.findUnique as jest.Mock).mockResolvedValue({
        ...startedCheckedIn,
        status: AppointmentStatus.SCHEDULED,
      });

      await expect(
        service.cancel('appt-1', { reason: 'Khách không đến' } as any, receptionist),
      ).rejects.toThrow(/only cancel before appointment start/);
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
      (prisma.workingSchedule.findFirst as jest.Mock).mockResolvedValue({
        startTime: new Date('1970-01-01T00:00:00Z'),
        endTime: new Date('1970-01-01T23:00:00Z'),
      });
      (prisma.timeOff.findFirst as jest.Mock).mockResolvedValue(null);
      (prisma.appointment.create as jest.Mock).mockResolvedValue({ id: 'appt-new' });
    });

    it('rejects a booking that overlaps the same patient with another dentist', async () => {
      (prisma.appointment.findFirst as jest.Mock)
        .mockResolvedValueOnce(null) // dentist slot free
        .mockResolvedValueOnce({ id: 'appt-other-dentist' }); // patient busy

      await expect(service.create(dto, actor)).rejects.toThrow(/Bệnh nhân đã có lịch hẹn khác/);
      const patientWhere = (prisma.appointment.findFirst as jest.Mock).mock.calls[1][0].where;
      expect(patientWhere).toEqual(
        expect.objectContaining({
          patientId: 'patient-1',
          startAt: { lt: new Date('2027-03-15T02:30:00Z') },
          endAt: { gt: new Date('2027-03-15T02:00:00Z') },
        }),
      );
      expect(prisma.appointment.create).not.toHaveBeenCalled();
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
      (prisma.workingSchedule.findFirst as jest.Mock).mockResolvedValue(null);
      (prisma.shiftRegistration.findFirst as jest.Mock).mockResolvedValue({
        startTime: '08:00',
        endTime: '12:00',
      });

      await service.create(dto, actor);

      expect(prisma.shiftRegistration.findFirst).toHaveBeenCalledWith({
        where: expect.objectContaining({
          dentistId: 'dentist-1',
          date: new Date('2027-03-15'),
          status: 'APPROVED',
          startTime: { lte: '09:00' },
          endTime: { gte: '09:30' },
        }),
      });
      expect(prisma.appointment.create).toHaveBeenCalled();
    });

    it('still rejects when neither a working schedule nor an approved shift covers the slot', async () => {
      (prisma.appointment.findFirst as jest.Mock).mockResolvedValue(null);
      (prisma.workingSchedule.findFirst as jest.Mock).mockResolvedValue(null);
      (prisma.shiftRegistration.findFirst as jest.Mock).mockResolvedValue(null);

      await expect(service.create(dto, actor)).rejects.toThrow(/no working schedule/);
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
      expect(result.availableSlots).toEqual(['08:00', '08:30', '10:00', '10:30']);
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

        expect(result.availableSlots).toEqual(['10:00', '10:30']);
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
        where: { id: 'appt-1', status: AppointmentStatus.SCHEDULED },
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

      await expect(service.confirm('appt-1', actor)).rejects.toThrow(/already started/);
    });

    it.each([AppointmentStatus.CHECKED_IN, AppointmentStatus.CANCELLED])(
      'rejects confirming a %s appointment',
      async status => {
        (prisma.appointment.findUnique as jest.Mock).mockResolvedValue({ ...scheduled, status });

        await expect(service.confirm('appt-1', actor)).rejects.toThrow(/Cannot confirm/);
      },
    );

    it("404s for a dentist confirming a colleague's appointment", async () => {
      (prisma.appointment.findUnique as jest.Mock).mockResolvedValue(scheduled);

      await expect(service.confirm('appt-1', dentistPayload('dentist-2'))).rejects.toThrow(
        /not found/,
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
    };
    const future = { newStartsAt: '2099-01-05T02:00:00Z', newEndsAt: '2099-01-05T02:30:00Z' };

    beforeEach(() => {
      (prisma.appointment.findUnique as jest.Mock).mockResolvedValue(confirmed);
      (prisma.workingSchedule.findFirst as jest.Mock).mockResolvedValue({
        startTime: new Date('1970-01-01T00:00:00Z'),
        endTime: new Date('1970-01-01T23:00:00Z'),
      });
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
      (prisma.appointment.findFirst as jest.Mock)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ id: 'appt-2' });

      await expect(service.reschedule('appt-1', future as any, actor)).rejects.toThrow(
        /Bệnh nhân đã có lịch hẹn khác/,
      );
      const patientWhere = (prisma.appointment.findFirst as jest.Mock).mock.calls[1][0].where;
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
      ).rejects.toThrow(/lacks dentist role/);
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

      await expect(service.createTimeOff(timeOffDto, approver)).rejects.toThrow(/checked-in/);
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
      (prisma.workingSchedule.findFirst as jest.Mock).mockResolvedValue({
        startTime: new Date('1970-01-01T00:00:00Z'),
        endTime: new Date('1970-01-01T23:00:00Z'),
      });
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

      expect(result.availableSlots).toEqual(['08:00', '08:30', '09:00', '09:30', '10:00', '10:30']);
    });
  });

  describe('APPT-FU-06: late arrival while the slot is still running', () => {
    // Started 45 min ago (check-in window closed at +30), 60-min slot still running.
    const late = () => ({
      id: 'appt-1',
      status: AppointmentStatus.SCHEDULED,
      patientId: 'patient-1',
      dentistId: 'dentist-1',
      startAt: new Date(Date.now() - 45 * 60_000),
      endAt: new Date(Date.now() + 15 * 60_000),
    });

    it('without override: rejects with CHECK_IN_EXPIRED offering a force check-in action', async () => {
      (prisma.appointment.findUnique as jest.Mock).mockResolvedValue(late());

      const err = await service.checkIn('appt-1', false, undefined, actor).catch(e => e);

      expect(err.getResponse()).toEqual(
        expect.objectContaining({
          code: 'CHECK_IN_EXPIRED',
          details: {
            actions: expect.arrayContaining([expect.objectContaining({ code: 'still_check_in' })]),
          },
        }),
      );
      expect(prisma.appointment.updateMany).not.toHaveBeenCalled();
    });

    it('with override + reason: checks the patient in and audits the override', async () => {
      (prisma.appointment.findUnique as jest.Mock).mockResolvedValue(late());
      (prisma.patient.findUnique as jest.Mock).mockResolvedValue({
        id: 'patient-1',
        deletedAt: null,
      });
      (prisma.appointment.updateMany as jest.Mock).mockResolvedValue({ count: 1 });
      (prisma.appointment.findUniqueOrThrow as jest.Mock).mockResolvedValue({
        ...late(),
        status: AppointmentStatus.CHECKED_IN,
      });

      const result = await service.checkIn('appt-1', true, 'Kẹt xe, báo trước', actor);

      expect(result.status).toBe(AppointmentStatus.CHECKED_IN);
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'APPOINTMENT_CHECKIN_OVERRIDDEN' }),
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
      expect.objectContaining({ availableSlots: ['08:00', '08:30'] }),
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
      await expect(service.rejectTimeOff('to-1', { note: '' }, approver)).rejects.toThrow(/reason/);
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
        (prisma.workingSchedule.findFirst as jest.Mock).mockResolvedValue({
          startTime: new Date('1970-01-01T08:00:00Z'),
          endTime: new Date('1970-01-01T17:00:00Z'),
        });
        (prisma.appointment.create as jest.Mock).mockResolvedValue({ id: 'appt-new' });
      });

      it('only APPROVED time-off blocks a booking', async () => {
        await book();
        expect((prisma.timeOff.findFirst as jest.Mock).mock.calls[0][0].where.status).toBe(
          'APPROVED',
        );
      });

      it('BR-SCH-003: a closed day refuses bookings', async () => {
        (prisma.scheduleOverride.findMany as jest.Mock).mockResolvedValue([
          { kind: 'CLOSED', startTime: null, endTime: null },
        ]);
        await expect(book()).rejects.toThrow(/closed/);
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
        await expect(book()).rejects.toThrow(/closed 09:00-10:00/);
      });

      it('BR-SCH-004: changed hours replace the weekly schedule', async () => {
        (prisma.scheduleOverride.findMany as jest.Mock).mockResolvedValue([
          {
            kind: 'CHANGED_HOURS',
            startTime: new Date('1970-01-01T13:00:00Z'),
            endTime: new Date('1970-01-01T17:00:00Z'),
          },
        ]);
        await expect(book()).rejects.toThrow(/changed hours/);
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

    it('overrides are front desk/admin only', async () => {
      await expect(
        service.createScheduleOverride(
          { dentistId: 'dentist-self', date: '2099-01-05', kind: 'CLOSED', reason: 'Nghỉ' } as any,
          dentistPayload('dentist-self'),
        ),
      ).rejects.toThrow(/lễ tân/);
    });

    it('a day can have only one changed-hours override', async () => {
      (prisma.scheduleOverride.findFirst as jest.Mock).mockResolvedValue({ id: 'ov-1' });
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
});

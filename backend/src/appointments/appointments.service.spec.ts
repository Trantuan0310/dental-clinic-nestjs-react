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
        startAt: new Date('2026-09-16T01:00:00Z'),
        endAt: new Date('2026-09-16T01:30:00Z'),
      },
    ]);
    (prisma.timeOff.findMany as jest.Mock).mockResolvedValue([]);
    const result = await service.getAvailability({ dentistId: 'dentist-1', date: '2026-09-16' });
    expect(result.availableSlots).toEqual(['08:30']);
    expect(prisma.appointment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          startAt: {
            gte: new Date('2026-09-15T17:00:00Z'),
            lt: new Date('2026-09-16T17:00:00Z'),
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
    it('returns only active dentist lookup fields', async () => {
      const dentists = [
        { id: 'dentist-1', fullName: 'Bác sĩ Nguyễn An' },
        { id: 'dentist-2', fullName: 'Bác sĩ Trần Bình' },
      ];
      (prisma.user.findMany as jest.Mock).mockResolvedValue(dentists);

      const result = await service.listDentistOptions();

      expect(result).toEqual(dentists);
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
        },
        select: {
          id: true,
          fullName: true,
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
        startAt: new Date(Date.now() - 31 * 60 * 1000),
        endAt: new Date(Date.now() - 1 * 60 * 1000),
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

    it('creates a confirmed online appointment and links its booking request atomically', async () => {
      (prisma as any).clinicService = {
        findFirst: jest.fn().mockResolvedValue({ id: 'service-1', durationMinutes: 30 }),
      };
      (prisma as any).bookingRequest = { updateMany: jest.fn().mockResolvedValue({ count: 1 }) };
      jest.spyOn(service as any, 'validateDentist').mockResolvedValue({ id: 'dentist-1' });
      jest.spyOn(service as any, 'validateActivePatient').mockResolvedValue(undefined);
      jest.spyOn(service as any, 'lockDentist').mockResolvedValue(undefined);
      jest.spyOn(service as any, 'ensureSlotAvailable').mockResolvedValue(undefined);
      (prisma.appointment.create as jest.Mock).mockResolvedValue({
        id: 'appt-online',
        status: AppointmentStatus.CONFIRMED,
      });

      const startAt = new Date(Date.now() + 60 * 60_000);
      await service.createConfirmedFromBookingRequest(
        {
          patientId: 'patient-1',
          dentistId: 'dentist-1',
          serviceId: 'service-1',
          startAt: startAt.toISOString(),
          endAt: new Date(startAt.getTime() + 30 * 60_000).toISOString(),
          source: 'ONLINE',
        } as any,
        'request-1',
        actor,
      );

      expect(prisma.appointment.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            serviceId: 'service-1',
            source: 'ONLINE',
            status: AppointmentStatus.CONFIRMED,
            confirmedBy: actor.sub,
          }),
        }),
      );
      expect((prisma as any).bookingRequest.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ id: 'request-1', appointmentId: null }),
          data: expect.objectContaining({ appointmentId: 'appt-online', status: 'CONFIRMED' }),
        }),
      );
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
      const ownAppt = {
        ...otherDentistAppt,
        dentistId: 'dentist-self',
        startAt: new Date(Date.now() - 31 * 60_000),
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
    it('transitions to no_show when patient misses appointment', async () => {
      const existing = {
        id: 'appt-1',
        status: AppointmentStatus.CONFIRMED,
        startAt: new Date(Date.now() - 31 * 60 * 1000),
        endAt: new Date(Date.now() - 1 * 60 * 1000),
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

    it('does not let staff mark a patient absent before the 30-minute grace ends', async () => {
      (prisma.appointment.findUnique as jest.Mock).mockResolvedValue({
        id: 'appt-1',
        status: AppointmentStatus.CONFIRMED,
        startAt: new Date(Date.now() - 29 * 60_000),
      });
      await expect(service.markNoShow('appt-1', {} as any, actor)).rejects.toThrow('30 phút');
      expect(prisma.appointment.updateMany).not.toHaveBeenCalled();
    });

    it('auto no-show update keeps the status predicate to avoid racing a check-in', async () => {
      (prisma.appointment.updateMany as jest.Mock).mockResolvedValue({ count: 0 });
      await expect(service.autoMarkNoShow()).resolves.toEqual({ updated: 0 });
      expect(prisma.appointment.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: { in: [AppointmentStatus.SCHEDULED, AppointmentStatus.CONFIRMED] },
          }),
        }),
      );
    });
  });
});

import { Test } from '@nestjs/testing';
import { AppointmentsService } from './appointments.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { createPrismaMock, PrismaMockShape, asTransaction } from '../../test/helpers/prisma-mock';
import { adminPayload } from '../../test/helpers';
import { AppointmentStatus } from '@prisma/client';
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
      (prisma.appointment.update as jest.Mock).mockResolvedValue({
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
      (prisma.appointment.update as jest.Mock).mockResolvedValue({
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
      (prisma.appointment.update as jest.Mock).mockResolvedValue({
        ...existing,
        status: AppointmentStatus.NO_SHOW,
      });

      const result = await service.markNoShow('appt-1', {} as any, actor);

      expect(result.status).toBe(AppointmentStatus.NO_SHOW);
      expect(audit.log).toHaveBeenCalled();
    });
  });
});

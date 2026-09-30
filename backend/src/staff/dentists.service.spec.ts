import { ForbiddenException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DentistsService } from './dentists.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { asTransaction, createPrismaMock, PrismaMockShape } from '../../test/helpers/prisma-mock';
import { createMockJwtPayload } from '../../test/helpers/auth-mock';
import {
  DentistHasFutureAppointmentsException,
  DentistHasOpenEncountersException,
} from './staff.exceptions';

describe('DentistsService', () => {
  let service: DentistsService;
  let prisma: PrismaMockShape;
  const meta = { ipAddress: null, userAgent: null };
  const admin = createMockJwtPayload({
    sub: 'admin-1',
    permissions: ['dentist.update', 'dentist.deactivate'],
  });
  const dentist = createMockJwtPayload({
    sub: 'user-9',
    permissions: ['dentist.read', 'dentist.update.own'],
  });

  const profile = (overrides: Record<string, unknown> = {}) => ({
    id: 'dp-1',
    employeeId: 'emp-1',
    userId: 'user-9',
    licenseNumber: null,
    licenseIssuedAt: null,
    specialties: [],
    calendarColor: '#2563EB',
    defaultSlotMinutes: 30,
    acceptsOnlineBooking: false,
    acceptsNewPatients: true,
    practiceStatus: 'ACTIVE',
    bio: null,
    updatedAt: new Date(),
    deletedAt: null,
    employee: {
      id: 'emp-1',
      code: 'NV-00001',
      fullName: 'BS. A',
      phone: null,
      email: null,
      employmentStatus: 'ACTIVE',
    },
    user: { email: 'a@clinic.local', status: 'ACTIVE', fullName: 'BS. A' },
    ...overrides,
  });

  beforeEach(async () => {
    prisma = createPrismaMock({ mediaAsset: { count: jest.fn().mockResolvedValue(0) } });
    asTransaction(prisma);
    const module = await Test.createTestingModule({
      providers: [
        DentistsService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditService, useValue: { log: jest.fn() } },
      ],
    }).compile();
    service = module.get(DentistsService);
    prisma.dentistProfile.findFirst.mockResolvedValue(profile());
    prisma.dentistProfile.update.mockImplementation(
      async ({ data }: { data: Record<string, unknown> }) => profile(data),
    );
  });

  describe('update — dentist.update.own', () => {
    it('lets a dentist change their own bio, specialties and colour', async () => {
      await service.update(
        'user-9',
        { bio: 'Chuyên nha chu', calendarColor: '#16A34A' },
        dentist,
        meta,
      );
      expect(prisma.dentistProfile.update).toHaveBeenCalled();
    });

    it("refuses another dentist's profile", async () => {
      await expect(service.update('user-7', { bio: 'x' }, dentist, meta)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it('refuses admin-only fields such as the license number', async () => {
      await expect(
        service.update('user-9', { licenseNumber: '000123/HCM-CCHN' }, dentist, meta),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.dentistProfile.update).not.toHaveBeenCalled();
    });

    it('lets an admin change any field', async () => {
      prisma.dentistProfile.findFirst.mockResolvedValueOnce(profile()).mockResolvedValueOnce(null);
      await service.update(
        'user-9',
        { licenseNumber: '000123/HCM-CCHN', defaultSlotMinutes: 45 },
        admin,
        meta,
      );
      expect(prisma.dentistProfile.update.mock.calls[0][0].data).toMatchObject({
        licenseNumber: '000123/HCM-CCHN',
        defaultSlotMinutes: 45,
      });
    });
  });

  describe('deactivate (BR-STAFF-004)', () => {
    it('returns the bookings to reassign instead of suspending', async () => {
      prisma.appointment.findMany.mockResolvedValue([
        {
          id: 'appt-1',
          startAt: new Date(),
          endAt: new Date(),
          status: 'SCHEDULED',
          patient: { fullName: 'BN 1' },
        },
      ]);
      await expect(
        service.deactivate(
          'user-9',
          { status: 'SUSPENDED' as never, reason: 'Tạm nghỉ' },
          admin,
          meta,
        ),
      ).rejects.toBeInstanceOf(DentistHasFutureAppointmentsException);
      expect(prisma.dentistProfile.update).not.toHaveBeenCalled();
    });

    it('counts a visit being treated even after its slot has ended', async () => {
      prisma.appointment.findMany.mockResolvedValue([]);
      prisma.encounter.count.mockResolvedValue(0);
      await service.deactivate(
        'user-9',
        { status: 'SUSPENDED' as never, reason: 'Tạm nghỉ' },
        admin,
        meta,
      );
      const where = prisma.appointment.findMany.mock.calls[0][0].where;
      expect(where.OR).toEqual(
        expect.arrayContaining([
          { status: 'IN_PROGRESS' },
          expect.objectContaining({
            status: { in: ['SCHEDULED', 'CONFIRMED', 'CHECKED_IN'] },
          }),
        ]),
      );
    });

    it('refuses while the dentist still has an open encounter', async () => {
      prisma.appointment.findMany.mockResolvedValue([]);
      prisma.encounter.count.mockResolvedValue(2);
      const error = await service
        .deactivate('user-9', { status: 'SUSPENDED' as never, reason: 'Tạm nghỉ' }, admin, meta)
        .catch(e => e);
      expect(error).toBeInstanceOf(DentistHasOpenEncountersException);
      expect(error.getResponse().message).toContain('2 phiên khám đang mở');
      expect(prisma.encounter.count).toHaveBeenCalledWith({
        where: { dentistId: 'user-9', status: 'IN_PROGRESS' },
      });
      expect(prisma.dentistProfile.update).not.toHaveBeenCalled();
    });

    it('suspends a dentist with no upcoming bookings', async () => {
      prisma.appointment.findMany.mockResolvedValue([]);
      prisma.encounter.count.mockResolvedValue(0);
      const result = await service.deactivate(
        'user-9',
        { status: 'SUSPENDED' as never, reason: 'Tạm nghỉ' },
        admin,
        meta,
      );
      expect(result.practiceStatus).toBe('SUSPENDED');
    });
  });

  describe('overview — readiness checklist', () => {
    it('reports what keeps a new dentist out of the booking screens', async () => {
      prisma.dentistProfile.findFirst.mockResolvedValue(
        profile({
          user: { email: 'admin@clinic.local', status: 'PENDING_SETUP', fullName: 'Quản trị viên' },
        }),
      );
      prisma.workingSchedule.findMany.mockResolvedValue([]);
      prisma.appointment.findMany.mockResolvedValue([]);
      prisma.dentistService.count.mockResolvedValue(0);

      const { readiness, profile: p } = await service.overview('user-9');

      expect(p.accountStatus).toBe('PENDING_SETUP');
      expect(readiness).toEqual({
        accountStatus: 'PENDING_SETUP',
        practiceStatus: 'ACTIVE',
        employmentStatus: 'ACTIVE',
        acceptsOnlineBooking: false,
        acceptsNewPatients: true,
        hasCurrentSchedule: false,
        activeServiceCount: 0,
        onlineServiceCount: 0,
        hasPhoto: false,
        placeholderName: true,
      });
    });

    it('counts a schedule already in force, current services and the photo', async () => {
      prisma.workingSchedule.findMany.mockResolvedValue([
        {
          id: 'ws-1',
          dayOfWeek: 1,
          startTime: new Date('1970-01-01T08:00:00Z'),
          endTime: new Date('1970-01-01T12:00:00Z'),
          validFrom: new Date('2020-01-01T00:00:00Z'),
          validTo: null,
          slotDurationMin: 30,
        },
      ]);
      prisma.appointment.findMany.mockResolvedValue([]);
      prisma.dentistService.count.mockResolvedValueOnce(3).mockResolvedValueOnce(2);
      (prisma.mediaAsset.count as jest.Mock).mockResolvedValue(1);

      const { readiness } = await service.overview('user-9');

      expect(readiness).toMatchObject({
        hasCurrentSchedule: true,
        activeServiceCount: 3,
        onlineServiceCount: 2,
        hasPhoto: true,
        placeholderName: false,
      });
      expect(prisma.dentistService.count.mock.calls[0][0].where).toMatchObject({
        dentistId: 'user-9',
        service: { isActive: true },
      });
      // Only services offered online count for the online booking page.
      expect(prisma.dentistService.count.mock.calls[1][0].where.service).toEqual({
        isActive: true,
        bookableOnline: true,
        category: { isActive: true },
      });
    });
  });
});

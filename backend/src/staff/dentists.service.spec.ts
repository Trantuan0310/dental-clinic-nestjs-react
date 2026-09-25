import { ForbiddenException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DentistsService } from './dentists.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { asTransaction, createPrismaMock, PrismaMockShape } from '../../test/helpers/prisma-mock';
import { createMockJwtPayload } from '../../test/helpers/auth-mock';
import { DentistHasFutureAppointmentsException } from './staff.exceptions';

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
    user: { email: 'a@clinic.local', status: 'ACTIVE' },
    ...overrides,
  });

  beforeEach(async () => {
    prisma = createPrismaMock();
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

    it('suspends a dentist with no upcoming bookings', async () => {
      prisma.appointment.findMany.mockResolvedValue([]);
      const result = await service.deactivate(
        'user-9',
        { status: 'SUSPENDED' as never, reason: 'Tạm nghỉ' },
        admin,
        meta,
      );
      expect(result.practiceStatus).toBe('SUSPENDED');
    });
  });
});

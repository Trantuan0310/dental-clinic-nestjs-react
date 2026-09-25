import { Test } from '@nestjs/testing';
import { EmployeesService } from './employees.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { UsersService } from '../users/users.service';
import { asTransaction, createPrismaMock, PrismaMockShape } from '../../test/helpers/prisma-mock';
import { createMockJwtPayload } from '../../test/helpers/auth-mock';
import {
  DentistHasFutureAppointmentsException,
  DentistProfileNotAllowedException,
  EmployeeValidationException,
  LastAdminTerminationException,
  StaffLinkConflictException,
} from './staff.exceptions';

describe('EmployeesService', () => {
  let service: EmployeesService;
  let prisma: PrismaMockShape;
  let users: { create: jest.Mock };
  const actor = createMockJwtPayload({
    sub: 'admin-1',
    email: 'admin@clinic.local',
    permissions: ['employee.create', 'employee.update', 'employee.deactivate', 'dentist.create'],
  });
  const meta = { ipAddress: null, userAgent: null };

  const employee = (overrides: Record<string, unknown> = {}) => ({
    id: 'emp-1',
    code: 'NV-00001',
    fullName: 'Nguyễn Văn A',
    dob: null,
    gender: null,
    phone: null,
    email: null,
    address: null,
    employeeType: 'ASSISTANT',
    hireDate: new Date('2026-01-01T00:00:00Z'),
    terminationDate: null,
    employmentStatus: 'ACTIVE',
    userId: null,
    notes: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    user: null,
    dentistProfile: null,
    ...overrides,
  });

  beforeEach(async () => {
    prisma = createPrismaMock();
    asTransaction(prisma);
    users = { create: jest.fn() };
    const module = await Test.createTestingModule({
      providers: [
        EmployeesService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditService, useValue: { log: jest.fn() } },
        { provide: UsersService, useValue: users },
      ],
    }).compile();
    service = module.get(EmployeesService);
  });

  describe('create (BR-STAFF-001)', () => {
    it('numbers the employee from employee_code_seq', async () => {
      prisma.$queryRaw.mockResolvedValue([{ nextval: BigInt(42) }]);
      prisma.employee.create.mockImplementation(
        async ({ data }: { data: Record<string, unknown> }) => employee(data),
      );

      const result = await service.create(
        { fullName: 'Trần B', employeeType: 'RECEPTIONIST' as never, hireDate: '2026-02-01' },
        actor,
        meta,
      );

      expect(prisma.employee.create.mock.calls[0][0].data.code).toBe('NV-00042');
      expect(result.hireDate).toBe('2026-02-01');
    });

    it('rejects an invalid phone number', async () => {
      await expect(
        service.create(
          { fullName: 'Trần B', employeeType: 'OTHER' as never, phone: '123' },
          actor,
          meta,
        ),
      ).rejects.toBeInstanceOf(EmployeeValidationException);
    });

    it('rejects a date of birth after the hire date', async () => {
      await expect(
        service.create(
          {
            fullName: 'Trần B',
            employeeType: 'OTHER' as never,
            dob: '2026-03-01',
            hireDate: '2026-02-01',
          },
          actor,
          meta,
        ),
      ).rejects.toBeInstanceOf(EmployeeValidationException);
    });
  });

  describe('createDentistProfile (BR-STAFF-002)', () => {
    it('refuses an employee without an account', async () => {
      prisma.employee.findFirst.mockResolvedValue(employee());
      await expect(service.createDentistProfile('emp-1', {}, actor, meta)).rejects.toBeInstanceOf(
        DentistProfileNotAllowedException,
      );
    });

    it('refuses an employee who is not ACTIVE', async () => {
      prisma.employee.findFirst.mockResolvedValue(
        employee({ userId: 'user-9', employmentStatus: 'ON_LEAVE' }),
      );
      await expect(service.createDentistProfile('emp-1', {}, actor, meta)).rejects.toBeInstanceOf(
        DentistProfileNotAllowedException,
      );
    });

    it('grants the dentist role and creates the profile keyed by user id', async () => {
      prisma.employee.findFirst.mockResolvedValue(employee({ userId: 'user-9' }));
      prisma.dentistProfile.findUnique.mockResolvedValue(null);
      prisma.role.findFirst.mockResolvedValue({ id: 'role-dentist', code: 'dentist' });
      prisma.dentistProfile.count.mockResolvedValue(3);
      prisma.dentistProfile.create.mockImplementation(
        async ({ data }: { data: Record<string, unknown> }) => ({
          id: 'dp-1',
          ...data,
        }),
      );

      const profile = await service.createDentistProfile(
        'emp-1',
        { specialties: ['NHA_CHU'] },
        actor,
        meta,
      );

      expect(prisma.userRole.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: { userId: 'user-9', roleId: 'role-dentist', assignedBy: 'admin-1' },
        }),
      );
      expect(profile).toMatchObject({
        userId: 'user-9',
        employeeId: 'emp-1',
        calendarColor: '#9333EA',
        defaultSlotMinutes: 30,
      });
      expect(prisma.employee.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ employeeType: 'DENTIST' }) }),
      );
    });
  });

  describe('linkAccount (BR-STAFF-003)', () => {
    it('refuses an account already linked to another employee', async () => {
      prisma.employee.findFirst
        .mockResolvedValueOnce(employee())
        .mockResolvedValueOnce(employee({ id: 'emp-2', code: 'NV-00002', userId: 'user-9' }));
      prisma.user.findFirst.mockResolvedValue({ id: 'user-9' });

      await expect(
        service.linkAccount('emp-1', { userId: 'user-9' }, actor, meta),
      ).rejects.toBeInstanceOf(StaffLinkConflictException);
    });

    it('creates an account with the role matching the employee type', async () => {
      prisma.employee.findFirst.mockResolvedValue(employee({ employeeType: 'RECEPTIONIST' }));
      prisma.role.findFirst.mockResolvedValue({ id: 'role-rec' });
      users.create.mockResolvedValue({ id: 'user-new' });
      prisma.employee.update.mockResolvedValue(employee({ userId: 'user-new' }));

      await service.linkAccount('emp-1', { loginEmail: 'b@clinic.local' }, actor, meta);

      expect(users.create).toHaveBeenCalledWith(
        expect.objectContaining({ email: 'b@clinic.local', roleIds: ['role-rec'] }),
        'admin-1',
        'admin@clinic.local',
        null,
        null,
      );
      expect(prisma.employee.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { userId: 'user-new', updatedBy: 'admin-1' } }),
      );
    });
  });

  describe('terminate (BR-STAFF-004/005)', () => {
    it('blocks a dentist who still has upcoming bookings', async () => {
      prisma.employee.findFirst.mockResolvedValue(
        employee({ userId: 'user-9', dentistProfile: { id: 'dp-1' } }),
      );
      prisma.appointment.findMany.mockResolvedValue([
        {
          id: 'appt-1',
          startAt: new Date(),
          endAt: new Date(),
          status: 'CONFIRMED',
          patient: { fullName: 'BN 1' },
        },
      ]);

      const error = await service
        .terminate('emp-1', { reason: 'Nghỉ việc' }, actor, meta)
        .catch(e => e);
      expect(error).toBeInstanceOf(DentistHasFutureAppointmentsException);
      expect(error.getResponse().details.appointments).toHaveLength(1);
      expect(prisma.employee.update).not.toHaveBeenCalled();
    });

    it('deactivates the account and revokes its tokens in the same transaction', async () => {
      prisma.employee.findFirst.mockResolvedValue(employee({ userId: 'user-9' }));
      prisma.userRole.findFirst.mockResolvedValue(null);
      prisma.employee.update.mockResolvedValue(employee({ employmentStatus: 'TERMINATED' }));

      await service.terminate('emp-1', { reason: 'Hết hợp đồng' }, actor, meta);

      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'user-9' },
          data: expect.objectContaining({ status: 'DEACTIVATED' }),
        }),
      );
      expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { userId: 'user-9', revokedAt: null } }),
      );
    });

    it('refuses to terminate the last clinic admin', async () => {
      prisma.employee.findFirst.mockResolvedValue(employee({ userId: 'user-9' }));
      prisma.userRole.findFirst.mockResolvedValue({ userId: 'user-9' });
      prisma.user.count.mockResolvedValue(0);

      await expect(
        service.terminate('emp-1', { reason: 'Hết hợp đồng' }, actor, meta),
      ).rejects.toBeInstanceOf(LastAdminTerminationException);
    });
  });
});

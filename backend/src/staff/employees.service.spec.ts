import { Test } from '@nestjs/testing';
import { EmployeesService } from './employees.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { UsersService } from '../users/users.service';
import { asTransaction, createPrismaMock, PrismaMockShape } from '../../test/helpers/prisma-mock';
import { createMockJwtPayload } from '../../test/helpers/auth-mock';
import {
  DentistHasFutureAppointmentsException,
  DentistHasOpenEncountersException,
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

    it('passes on that the invite email was not sent', async () => {
      prisma.employee.findFirst.mockResolvedValue(employee({ employeeType: 'DENTIST' }));
      prisma.role.findFirst.mockResolvedValue({ id: 'role-dentist' });
      users.create.mockResolvedValue({ id: 'user-new', inviteSent: false });
      prisma.employee.update.mockResolvedValue(employee({ userId: 'user-new' }));

      const result = await service.linkAccount(
        'emp-1',
        { loginEmail: 'bs@clinic.local' },
        actor,
        meta,
      );

      expect(result.inviteSent).toBe(false);
    });

    it('links an existing account and gives it the employee name', async () => {
      prisma.employee.findFirst
        .mockResolvedValueOnce(employee({ fullName: 'BS. Nguyễn An' }))
        .mockResolvedValueOnce(null);
      prisma.user.findFirst.mockResolvedValue({ id: 'admin-1', deactivatedAt: null });
      prisma.employee.update.mockResolvedValue(
        employee({ userId: 'admin-1', fullName: 'BS. Nguyễn An' }),
      );

      const result = await service.linkAccount('emp-1', { userId: 'admin-1' }, actor, meta);

      expect(users.create).not.toHaveBeenCalled();
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'admin-1' },
        data: { fullName: 'BS. Nguyễn An', updatedBy: 'admin-1' },
      });
      expect(result.inviteSent).toBeNull();
    });

    it('refuses a deactivated account', async () => {
      prisma.employee.findFirst.mockResolvedValue(employee());
      prisma.user.findFirst.mockResolvedValue({ id: 'user-9', deactivatedAt: new Date() });

      await expect(
        service.linkAccount('emp-1', { userId: 'user-9' }, actor, meta),
      ).rejects.toBeInstanceOf(EmployeeValidationException);
      expect(prisma.employee.update).not.toHaveBeenCalled();
    });
  });

  describe('linkableAccounts', () => {
    it('lists active accounts without an employee record', async () => {
      prisma.user.findMany.mockResolvedValue([
        {
          id: 'admin-1',
          email: 'admin@clinic.local',
          fullName: 'Quản trị viên',
          status: 'PENDING_SETUP',
          userRoles: [{ role: { code: 'clinic_admin' } }],
        },
      ]);

      const rows = await service.linkableAccounts();

      expect(prisma.user.findMany.mock.calls[0][0].where).toEqual({
        deletedAt: null,
        deactivatedAt: null,
        employees: { none: { deletedAt: null } },
      });
      expect(rows).toEqual([
        {
          id: 'admin-1',
          email: 'admin@clinic.local',
          fullName: 'Quản trị viên',
          status: 'PENDING_SETUP',
          roles: ['clinic_admin'],
        },
      ]);
    });
  });

  describe('update — going on leave (ON_LEAVE)', () => {
    it('returns the dentist bookings still ahead, without cancelling them', async () => {
      prisma.employee.findFirst.mockResolvedValue(
        employee({ userId: 'user-9', employeeType: 'DENTIST', dentistProfile: { id: 'dp-1' } }),
      );
      prisma.employee.update.mockResolvedValue(
        employee({ userId: 'user-9', employmentStatus: 'ON_LEAVE' }),
      );
      prisma.appointment.findMany.mockResolvedValue([
        {
          id: 'appt-1',
          startAt: new Date('2099-01-01T02:00:00Z'),
          endAt: new Date('2099-01-01T02:30:00Z'),
          status: 'CONFIRMED',
          patient: { fullName: 'BN 1' },
        },
      ]);

      const result = await service.update(
        'emp-1',
        { employmentStatus: 'ON_LEAVE' as never },
        actor,
        meta,
      );

      expect(result).toMatchObject({
        employmentStatus: 'ON_LEAVE',
        futureAppointments: [{ id: 'appt-1', patientName: 'BN 1' }],
      });
      expect(prisma.appointment.update).not.toHaveBeenCalled();
      expect(prisma.appointment.updateMany).not.toHaveBeenCalled();
    });

    it('does not look up bookings for other edits', async () => {
      prisma.employee.findFirst.mockResolvedValue(
        employee({ userId: 'user-9', dentistProfile: { id: 'dp-1' } }),
      );
      prisma.employee.update.mockResolvedValue(employee({ userId: 'user-9' }));

      const result = await service.update('emp-1', { notes: 'x' }, actor, meta);

      expect(prisma.appointment.findMany).not.toHaveBeenCalled();
      expect(result).not.toHaveProperty('futureAppointments');
    });
  });

  describe('reinstate', () => {
    const terminated = (overrides: Record<string, unknown> = {}) =>
      employee({
        userId: 'user-9',
        employmentStatus: 'TERMINATED',
        terminationDate: new Date('2026-05-01T00:00:00Z'),
        ...overrides,
      });

    it('refuses an employee who is not terminated', async () => {
      prisma.employee.findFirst.mockResolvedValue(employee());
      await expect(service.reinstate('emp-1', {}, actor, meta)).rejects.toBeInstanceOf(
        EmployeeValidationException,
      );
    });

    it('brings the employee back and reactivates the login account', async () => {
      prisma.employee.findFirst.mockResolvedValue(terminated());
      prisma.user.findFirst
        .mockResolvedValueOnce({
          id: 'user-9',
          email: 'bs@clinic.local',
          deactivatedAt: new Date(),
        })
        .mockResolvedValueOnce(null);
      prisma.employee.update.mockResolvedValue(employee({ userId: 'user-9' }));
      const audit = (service as any).audit.log as jest.Mock;

      const result = await service.reinstate('emp-1', { reason: 'Quay lại làm' }, actor, meta);

      expect(prisma.employee.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { employmentStatus: 'ACTIVE', terminationDate: null, updatedBy: 'admin-1' },
        }),
      );
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-9' },
        data: { deactivatedAt: null, status: 'ACTIVE', updatedBy: 'admin-1' },
      });
      expect(audit).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'EMPLOYEE_REINSTATED',
          metadata: expect.objectContaining({
            accountReactivated: true,
            previousTerminationDate: '2026-05-01',
          }),
        }),
      );
      expect(result.employmentStatus).toBe('ACTIVE');
    });

    it('keeps the account deactivated when asked to', async () => {
      prisma.employee.findFirst.mockResolvedValue(terminated());
      prisma.employee.update.mockResolvedValue(employee({ userId: 'user-9' }));

      await service.reinstate('emp-1', { reactivateAccount: false }, actor, meta);

      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('refuses when the old login email now belongs to another active account', async () => {
      prisma.employee.findFirst.mockResolvedValue(terminated());
      prisma.user.findFirst
        .mockResolvedValueOnce({
          id: 'user-9',
          email: 'bs@clinic.local',
          deactivatedAt: new Date(),
        })
        .mockResolvedValueOnce({ id: 'user-other' });

      await expect(service.reinstate('emp-1', {}, actor, meta)).rejects.toThrow(
        /already registered/,
      );
      expect(prisma.employee.update).not.toHaveBeenCalled();
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
      expect(error.getResponse().message).toContain('1 lịch hẹn');
      expect(prisma.employee.update).not.toHaveBeenCalled();
    });

    it('blocks a dentist who still has an encounter in progress', async () => {
      prisma.employee.findFirst.mockResolvedValue(
        employee({ userId: 'user-9', dentistProfile: { id: 'dp-1' } }),
      );
      prisma.appointment.findMany.mockResolvedValue([]);
      prisma.encounter.count.mockResolvedValue(1);

      const error = await service
        .terminate('emp-1', { reason: 'Nghỉ việc' }, actor, meta)
        .catch(e => e);
      expect(error).toBeInstanceOf(DentistHasOpenEncountersException);
      expect(error.getResponse().details).toEqual({ openEncounters: 1 });
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

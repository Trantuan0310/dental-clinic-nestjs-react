import { JwtPayload } from '../../src/common/guards/permissions.guard';

export const createMockJwtPayload = (overrides: Partial<JwtPayload> = {}): JwtPayload => ({
  sub: 'user-1',
  email: 'test@example.com',
  permissions: [],
  ...overrides,
});

export const adminPayload = (sub = 'admin-1'): JwtPayload =>
  createMockJwtPayload({
    sub,
    email: 'admin@clinic.com',
    // '*' is not a wildcard anywhere in the app; the clinic-wide read scopes
    // are listed so row-scope checks (common/row-scope.ts, default deny)
    // treat this actor as the clinic admin it stands for.
    permissions: ['*', 'appointment.read.any', 'encounter.read.any', 'invoice.read.any'],
  });

export const dentistPayload = (sub = 'dentist-1'): JwtPayload =>
  createMockJwtPayload({
    sub,
    email: 'dentist@clinic.com',
    permissions: [
      'patient.read',
      'appointment.read.own',
      'encounter.read.own',
      'invoice.read.own',
      'payslip.read.own',
    ],
  });

export const receptionistPayload = (sub = 'receptionist-1'): JwtPayload =>
  createMockJwtPayload({
    sub,
    email: 'reception@clinic.com',
    permissions: [
      'patient.read',
      'patient.create',
      'patient.update',
      'appointment.read.any',
      'appointment.create',
      'appointment.update',
      'appointment.check_in',
      'appointment.cancel',
    ],
  });

export const userPayloadWithPermissions = (permissions: string[], sub = 'user-1'): JwtPayload =>
  createMockJwtPayload({ sub, permissions });

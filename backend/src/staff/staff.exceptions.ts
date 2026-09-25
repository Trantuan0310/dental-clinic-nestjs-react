import { HttpStatus } from '@nestjs/common';
import { BusinessRuleException } from '../common/exceptions/business-rule.exception';

export class EmployeeNotFoundException extends BusinessRuleException {
  constructor(id: string) {
    super(`Employee ${id} not found`, HttpStatus.NOT_FOUND, undefined, 'EMPLOYEE_NOT_FOUND');
  }
}

export class DentistProfileNotFoundException extends BusinessRuleException {
  constructor(userId: string) {
    super(
      `Dentist profile for user ${userId} not found`,
      HttpStatus.NOT_FOUND,
      undefined,
      'DENTIST_PROFILE_NOT_FOUND',
    );
  }
}

export class EmployeeValidationException extends BusinessRuleException {
  constructor(message: string) {
    super(message, HttpStatus.BAD_REQUEST, undefined, 'EMPLOYEE_VALIDATION');
  }
}

/** BR-STAFF-002: only an active employee with an account can become a dentist. */
export class DentistProfileNotAllowedException extends BusinessRuleException {
  constructor(message: string) {
    super(message, HttpStatus.CONFLICT, undefined, 'DENTIST_PROFILE_NOT_ALLOWED');
  }
}

/** BR-STAFF-003: one active employee per account, one profile per employee. */
export class StaffLinkConflictException extends BusinessRuleException {
  constructor(message: string) {
    super(message, HttpStatus.CONFLICT, undefined, 'STAFF_LINK_CONFLICT');
  }
}

export class LicenseNumberTakenException extends BusinessRuleException {
  constructor(licenseNumber: string) {
    super(
      `License number ${licenseNumber} is already used by another dentist`,
      HttpStatus.CONFLICT,
      undefined,
      'LICENSE_NUMBER_TAKEN',
    );
  }
}

export interface AffectedAppointment {
  id: string;
  startAt: Date;
  endAt: Date;
  status: string;
  patientName: string;
}

/** BR-STAFF-004: future bookings must be reassigned first. */
export class DentistHasFutureAppointmentsException extends BusinessRuleException {
  constructor(appointments: AffectedAppointment[]) {
    super(
      `Dentist still has ${appointments.length} upcoming appointment(s); reassign or cancel them first`,
      HttpStatus.CONFLICT,
      { appointments },
      'DENTIST_HAS_FUTURE_APPOINTMENTS',
    );
  }
}

export class LastAdminTerminationException extends BusinessRuleException {
  constructor() {
    super(
      'Cannot terminate the last active clinic admin',
      HttpStatus.CONFLICT,
      undefined,
      'CANNOT_REMOVE_LAST_ADMIN',
    );
  }
}

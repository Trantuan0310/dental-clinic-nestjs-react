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
      `Bác sĩ còn ${appointments.length} lịch hẹn chưa xong (sắp tới hoặc đang khám). ` +
        'Hãy chuyển sang bác sĩ khác, hủy hoặc hoàn tất các lịch này trước.',
      HttpStatus.CONFLICT,
      { appointments },
      'DENTIST_HAS_FUTURE_APPOINTMENTS',
    );
  }
}

/** BR-STAFF-004: an encounter left IN_PROGRESS can only be closed by its dentist. */
export class DentistHasOpenEncountersException extends BusinessRuleException {
  constructor(count: number) {
    super(
      `Bác sĩ còn ${count} phiên khám đang mở. ` +
        'Bác sĩ cần đóng (hoàn tất) hoặc hủy các phiên khám này trước khi cho nghỉ/tạm ngưng.',
      HttpStatus.CONFLICT,
      { openEncounters: count },
      'DENTIST_HAS_OPEN_ENCOUNTERS',
    );
  }
}

export interface OpenBookingRequestRef {
  id: string;
  referenceCode: string;
  fullName: string;
  status: string;
  startAt: Date;
}

/** A5-13 / C4: online requests still naming the dentist must be handled first. */
export class DentistHasOpenBookingRequestsException extends BusinessRuleException {
  constructor(bookingRequests: OpenBookingRequestRef[]) {
    super(
      `Còn ${bookingRequests.length} yêu cầu đặt lịch online đang chờ với bác sĩ này. ` +
        'Hãy đề xuất bác sĩ khác hoặc từ chối các yêu cầu này trước.',
      HttpStatus.CONFLICT,
      { bookingRequests },
      'DENTIST_HAS_OPEN_BOOKING_REQUESTS',
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

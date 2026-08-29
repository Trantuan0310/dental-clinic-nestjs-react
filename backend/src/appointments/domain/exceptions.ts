import { HttpException, HttpStatus } from '@nestjs/common';

export class AppointmentNotFoundException extends HttpException {
  constructor(id?: string) {
    super(
      {
        statusCode: HttpStatus.NOT_FOUND,
        error: 'Not Found',
        code: 'APPOINTMENT_NOT_FOUND',
        message: id ? `Appointment ${id} not found` : 'Appointment not found',
      },
      HttpStatus.NOT_FOUND,
    );
    this.name = 'AppointmentNotFoundException';
  }
}

export class BackDatedAppointmentException extends HttpException {
  constructor() {
    super(
      {
        statusCode: HttpStatus.BAD_REQUEST,
        error: 'Bad Request',
        code: 'BACK_DATED_APPOINTMENT',
        message: 'Cannot create or reschedule appointments in the past',
      },
      HttpStatus.BAD_REQUEST,
    );
    this.name = 'BackDatedAppointmentException';
  }
}

export class CheckInWindowException extends HttpException {
  constructor(message: string) {
    super(
      {
        statusCode: HttpStatus.BAD_REQUEST,
        error: 'Bad Request',
        code: 'CHECK_IN_WINDOW',
        message,
      },
      HttpStatus.BAD_REQUEST,
    );
    this.name = 'CheckInWindowException';
  }
}

export class CheckInExpiredException extends HttpException {
  constructor(
    message: string,
    public readonly actions?: Array<{ code: string; label: string }>,
  ) {
    super(
      {
        statusCode: HttpStatus.BAD_REQUEST,
        error: 'Bad Request',
        code: 'CHECK_IN_EXPIRED',
        message,
        details: { actions },
      },
      HttpStatus.BAD_REQUEST,
    );
    this.name = 'CheckInExpiredException';
  }
}

export class DentistUnavailableException extends HttpException {
  constructor(message: string) {
    super(
      {
        statusCode: HttpStatus.BAD_REQUEST,
        error: 'Bad Request',
        code: 'DENTIST_UNAVAILABLE',
        message,
      },
      HttpStatus.BAD_REQUEST,
    );
    this.name = 'DentistUnavailableException';
  }
}

export class InvalidAppointmentStateException extends HttpException {
  constructor(message: string) {
    super(
      {
        statusCode: HttpStatus.CONFLICT,
        error: 'Conflict',
        code: 'INVALID_APPOINTMENT_STATE',
        message,
      },
      HttpStatus.CONFLICT,
    );
    this.name = 'InvalidAppointmentStateException';
  }
}

export class OutsideWorkingHoursException extends HttpException {
  constructor(message: string) {
    super(
      {
        statusCode: HttpStatus.BAD_REQUEST,
        error: 'Bad Request',
        code: 'OUTSIDE_WORKING_HOURS',
        message,
      },
      HttpStatus.BAD_REQUEST,
    );
    this.name = 'OutsideWorkingHoursException';
  }
}

export class RescheduleLimitReachedException extends HttpException {
  constructor() {
    super(
      {
        statusCode: HttpStatus.CONFLICT,
        error: 'Conflict',
        code: 'RESCHEDULE_LIMIT_REACHED',
        message: 'Maximum reschedule limit (3) reached for this appointment',
      },
      HttpStatus.CONFLICT,
    );
    this.name = 'RescheduleLimitReachedException';
  }
}

export class ScheduleOverlapException extends HttpException {
  constructor() {
    super(
      {
        statusCode: HttpStatus.CONFLICT,
        error: 'Conflict',
        code: 'SCHEDULE_OVERLAP',
        message: 'Schedule overlaps with an existing schedule',
      },
      HttpStatus.CONFLICT,
    );
    this.name = 'ScheduleOverlapException';
  }
}

export class SlotConflictException extends HttpException {
  constructor() {
    super(
      {
        statusCode: HttpStatus.CONFLICT,
        error: 'Conflict',
        code: 'SLOT_CONFLICT',
        message: 'This time slot is already booked',
      },
      HttpStatus.CONFLICT,
    );
    this.name = 'SlotConflictException';
  }
}
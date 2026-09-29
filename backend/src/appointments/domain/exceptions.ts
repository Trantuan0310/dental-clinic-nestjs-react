import { HttpException, HttpStatus } from '@nestjs/common';

export class AppointmentNotFoundException extends HttpException {
  /** `message` overrides the default for the related look-ups that reuse this 404. */
  constructor(id?: string, message?: string) {
    super(
      {
        statusCode: HttpStatus.NOT_FOUND,
        error: 'Not Found',
        code: 'APPOINTMENT_NOT_FOUND',
        message: message ?? 'Không tìm thấy lịch hẹn',
        ...(id && { details: { id } }),
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
        message: 'Không thể đặt hoặc đổi lịch hẹn vào thời điểm đã qua',
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
        message: 'Lịch hẹn này đã đổi tối đa 3 lần — hãy hủy và đặt lịch mới',
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
        message: 'Khung giờ này đã có lịch hẹn khác',
      },
      HttpStatus.CONFLICT,
    );
    this.name = 'SlotConflictException';
  }
}

export class PatientDoubleBookedException extends HttpException {
  constructor() {
    super(
      {
        statusCode: HttpStatus.CONFLICT,
        error: 'Conflict',
        code: 'PATIENT_DOUBLE_BOOKED',
        message: 'Bệnh nhân đã có lịch hẹn khác trùng khung giờ này',
      },
      HttpStatus.CONFLICT,
    );
    this.name = 'PatientDoubleBookedException';
  }
}

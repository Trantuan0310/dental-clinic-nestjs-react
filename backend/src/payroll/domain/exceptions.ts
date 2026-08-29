import { HttpException, HttpStatus } from '@nestjs/common';

export class PayrollNotFoundException extends HttpException {
  constructor(resource: string, id: string) {
    super(
      {
        statusCode: HttpStatus.NOT_FOUND,
        error: 'Not Found',
        code: 'PAYROLL_NOT_FOUND',
        message: `${resource} ${id} not found`,
      },
      HttpStatus.NOT_FOUND,
    );
    this.name = 'PayrollNotFoundException';
  }
}

export class PayrollStateException extends HttpException {
  constructor(message: string) {
    super(
      {
        statusCode: HttpStatus.CONFLICT,
        error: 'Conflict',
        code: 'PAYROLL_STATE_INVALID',
        message,
      },
      HttpStatus.CONFLICT,
    );
    this.name = 'PayrollStateException';
  }
}

export class PeriodOverlapException extends HttpException {
  constructor(message: string) {
    super(
      {
        statusCode: HttpStatus.CONFLICT,
        error: 'Conflict',
        code: 'PERIOD_OVERLAP',
        message,
      },
      HttpStatus.CONFLICT,
    );
    this.name = 'PeriodOverlapException';
  }
}

export class PayrollForbiddenException extends HttpException {
  constructor(message: string) {
    super(
      {
        statusCode: HttpStatus.FORBIDDEN,
        error: 'Forbidden',
        code: 'PAYROLL_FORBIDDEN',
        message,
      },
      HttpStatus.FORBIDDEN,
    );
    this.name = 'PayrollForbiddenException';
  }
}

export class ShiftConflictException extends HttpException {
  constructor(message: string) {
    super(
      {
        statusCode: HttpStatus.CONFLICT,
        error: 'Conflict',
        code: 'SHIFT_CONFLICT',
        message,
      },
      HttpStatus.CONFLICT,
    );
    this.name = 'ShiftConflictException';
  }
}

export class ShiftPastDateException extends HttpException {
  constructor(message: string) {
    super(
      {
        statusCode: HttpStatus.BAD_REQUEST,
        error: 'Bad Request',
        code: 'SHIFT_PAST_DATE',
        message,
      },
      HttpStatus.BAD_REQUEST,
    );
    this.name = 'ShiftPastDateException';
  }
}

export class ShiftRegistrationNotCancellableException extends HttpException {
  constructor(message: string) {
    super(
      {
        statusCode: HttpStatus.CONFLICT,
        error: 'Conflict',
        code: 'SHIFT_REGISTRATION_NOT_CANCELLABLE',
        message,
      },
      HttpStatus.CONFLICT,
    );
    this.name = 'ShiftRegistrationNotCancellableException';
  }
}
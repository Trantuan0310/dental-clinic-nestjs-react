import { HttpException, HttpStatus } from '@nestjs/common';

export class PatientNotFoundException extends HttpException {
  constructor(id?: string) {
    super(
      {
        statusCode: HttpStatus.NOT_FOUND,
        error: 'Not Found',
        code: 'PATIENT_NOT_FOUND',
        message: id ? `Patient ${id} not found` : 'Patient not found',
      },
      HttpStatus.NOT_FOUND,
    );
    this.name = 'PatientNotFoundException';
  }
}

export class PatientContactRequiredException extends HttpException {
  constructor(message: string) {
    super(
      {
        statusCode: HttpStatus.BAD_REQUEST,
        error: 'Bad Request',
        code: 'PATIENT_CONTACT_REQUIRED',
        message,
      },
      HttpStatus.BAD_REQUEST,
    );
    this.name = 'PatientContactRequiredException';
  }
}

export class PatientCannotDeleteException extends HttpException {
  constructor(
    message: string,
    public readonly reasons?: Array<{ field: string; code: string; count: number }>,
  ) {
    super(
      {
        statusCode: HttpStatus.CONFLICT,
        error: 'Conflict',
        code: 'PATIENT_CANNOT_DELETE',
        message,
        details: { reasons },
      },
      HttpStatus.CONFLICT,
    );
    this.name = 'PatientCannotDeleteException';
  }
}

export class PatientCodeConflictException extends HttpException {
  constructor(code: string) {
    super(
      {
        statusCode: HttpStatus.CONFLICT,
        error: 'Conflict',
        code: 'PATIENT_CODE_CONFLICT',
        message: `Patient code ${code} is already in use`,
      },
      HttpStatus.CONFLICT,
    );
    this.name = 'PatientCodeConflictException';
  }
}

export class IdentifierAlreadyExistsException extends HttpException {
  constructor(type: string, value: string) {
    super(
      {
        statusCode: HttpStatus.BAD_REQUEST,
        error: 'Bad Request',
        code: 'IDENTIFIER_ALREADY_EXISTS',
        message: `Identifier ${type}:${value} already exists for another patient`,
      },
      HttpStatus.BAD_REQUEST,
    );
    this.name = 'IdentifierAlreadyExistsException';
  }
}

export class PatientMergeInvalidException extends HttpException {
  constructor(message: string) {
    super(
      {
        statusCode: HttpStatus.CONFLICT,
        error: 'Conflict',
        code: 'PATIENT_MERGE_INVALID',
        message,
      },
      HttpStatus.CONFLICT,
    );
    this.name = 'PatientMergeInvalidException';
  }
}

export class DobLockedException extends HttpException {
  constructor() {
    super(
      {
        statusCode: HttpStatus.CONFLICT,
        error: 'Conflict',
        code: 'DOB_LOCKED',
        message: 'Date of birth cannot be changed after encounters have been created',
      },
      HttpStatus.CONFLICT,
    );
    this.name = 'DobLockedException';
  }
}

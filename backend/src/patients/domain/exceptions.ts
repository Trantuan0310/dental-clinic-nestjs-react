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
        message: `Giấy tờ ${type} số ${value} đã được dùng cho bệnh nhân khác`,
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
        message: 'Không thể sửa ngày sinh khi bệnh nhân đã có phiên khám',
      },
      HttpStatus.CONFLICT,
    );
    this.name = 'DobLockedException';
  }
}

/**
 * The patient changed after the form was opened (optimistic concurrency on
 * `updatedAt`) — saving would overwrite e.g. a newly recorded allergy.
 */
export class PatientVersionConflictException extends HttpException {
  constructor() {
    super(
      {
        statusCode: HttpStatus.CONFLICT,
        error: 'Conflict',
        code: 'PATIENT_VERSION_CONFLICT',
        message: 'Hồ sơ vừa được cập nhật ở nơi khác, tải lại rồi thử lại',
      },
      HttpStatus.CONFLICT,
    );
    this.name = 'PatientVersionConflictException';
  }
}

/** The same identifier was added twice to one patient. */
export class IdentifierDuplicateOnPatientException extends HttpException {
  constructor(type: string, value: string) {
    super(
      {
        statusCode: HttpStatus.CONFLICT,
        error: 'Conflict',
        code: 'IDENTIFIER_DUPLICATE',
        message: `Bệnh nhân đã có giấy tờ ${type} số ${value}`,
      },
      HttpStatus.CONFLICT,
    );
    this.name = 'IdentifierDuplicateOnPatientException';
  }
}

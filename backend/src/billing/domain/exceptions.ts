import { HttpException, HttpStatus } from '@nestjs/common';

export class InvoiceNotFoundException extends HttpException {
  constructor(id?: string) {
    super(
      {
        statusCode: HttpStatus.NOT_FOUND,
        error: 'Not Found',
        code: 'INVOICE_NOT_FOUND',
        message: id ? `Invoice ${id} not found` : 'Invoice not found',
      },
      HttpStatus.NOT_FOUND,
    );
    this.name = 'InvoiceNotFoundException';
  }
}

export class InvoiceAlreadyExistsException extends HttpException {
  constructor(encounterId: string) {
    super(
      {
        statusCode: HttpStatus.CONFLICT,
        error: 'Conflict',
        code: 'INVOICE_ALREADY_EXISTS',
        message: `Invoice already exists for encounter ${encounterId}`,
      },
      HttpStatus.CONFLICT,
    );
    this.name = 'InvoiceAlreadyExistsException';
  }
}

export class InvoiceNotEditableException extends HttpException {
  constructor(currentStatus: string) {
    super(
      {
        statusCode: HttpStatus.CONFLICT,
        error: 'Conflict',
        code: 'INVOICE_NOT_EDITABLE',
        message: `Invoice cannot be edited in status ${currentStatus}`,
      },
      HttpStatus.CONFLICT,
    );
    this.name = 'InvoiceNotEditableException';
  }
}

export class InvoiceVersionMismatchException extends HttpException {
  constructor(expected: number, actual: number) {
    super(
      {
        statusCode: HttpStatus.CONFLICT,
        error: 'Conflict',
        code: 'INVOICE_VERSION_MISMATCH',
        message: `Version mismatch: expected ${expected}, got ${actual}`,
        details: { expected, actual },
      },
      HttpStatus.CONFLICT,
    );
    this.name = 'InvoiceVersionMismatchException';
  }
}

export class InvoiceVoidFailedException extends HttpException {
  constructor(reason: string) {
    super(
      {
        statusCode: HttpStatus.CONFLICT,
        error: 'Conflict',
        code: 'INVOICE_VOID_FAILED',
        message: `Cannot void invoice: ${reason}`,
      },
      HttpStatus.CONFLICT,
    );
    this.name = 'InvoiceVoidFailedException';
  }
}

export class InvoiceDiscountInvalidException extends HttpException {
  constructor(message: string) {
    super(
      {
        statusCode: HttpStatus.BAD_REQUEST,
        error: 'Bad Request',
        code: 'INVOICE_DISCOUNT_INVALID',
        message,
      },
      HttpStatus.BAD_REQUEST,
    );
    this.name = 'InvoiceDiscountInvalidException';
  }
}

export class PaymentExceedsOutstandingException extends HttpException {
  constructor(requested: number, outstanding: number) {
    super(
      {
        statusCode: HttpStatus.BAD_REQUEST,
        error: 'Bad Request',
        code: 'PAYMENT_EXCEEDS_OUTSTANDING',
        message: `Payment amount ${requested} exceeds outstanding ${outstanding}`,
        details: { requested, outstanding },
      },
      HttpStatus.BAD_REQUEST,
    );
    this.name = 'PaymentExceedsOutstandingException';
  }
}

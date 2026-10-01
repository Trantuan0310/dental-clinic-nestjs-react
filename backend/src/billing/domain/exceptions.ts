import { HttpException, HttpStatus } from '@nestjs/common';

const INVOICE_STATUS_LABEL: Record<string, string> = {
  DRAFT: 'Nháp',
  ISSUED: 'Đã phát hành',
  PARTIAL: 'Thanh toán một phần',
  PAID: 'Đã thanh toán',
  VOIDED: 'Đã hủy',
};

const vnd = (n: number) => `${new Intl.NumberFormat('vi-VN').format(n)}đ`;

export class InvoiceNotFoundException extends HttpException {
  constructor(id?: string) {
    super(
      {
        statusCode: HttpStatus.NOT_FOUND,
        error: 'Not Found',
        code: 'INVOICE_NOT_FOUND',
        message: 'Không tìm thấy hóa đơn',
        ...(id && { details: { id } }),
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
        message: 'Phiên khám này đã có hóa đơn',
        details: { encounterId },
      },
      HttpStatus.CONFLICT,
    );
    this.name = 'InvoiceAlreadyExistsException';
  }
}

export class InvoiceNotEditableException extends HttpException {
  constructor(currentStatus: string, message?: string) {
    super(
      {
        statusCode: HttpStatus.CONFLICT,
        error: 'Conflict',
        code: 'INVOICE_NOT_EDITABLE',
        message:
          message ??
          `Không thể sửa hóa đơn ở trạng thái ${INVOICE_STATUS_LABEL[currentStatus] ?? currentStatus}`,
        details: { status: currentStatus },
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
        message: 'Hóa đơn vừa được người khác thay đổi. Tải lại trang rồi thử lại.',
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
        message: reason,
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
        message: `Số tiền ${vnd(requested)} vượt quá số còn nợ ${vnd(outstanding)}`,
        details: { requested, outstanding },
      },
      HttpStatus.BAD_REQUEST,
    );
    this.name = 'PaymentExceedsOutstandingException';
  }
}

/** Invoice/payment corrections that break a business rule (409 by default). */
export class InvoiceCorrectionException extends HttpException {
  constructor(
    code: string,
    message: string,
    details?: Record<string, unknown>,
    status: HttpStatus = HttpStatus.CONFLICT,
  ) {
    super(
      {
        statusCode: status,
        error: status === HttpStatus.CONFLICT ? 'Conflict' : HttpStatus[status],
        code,
        message,
        ...(details && { details }),
      },
      status,
    );
    this.name = 'InvoiceCorrectionException';
  }
}

export class PaymentNotFoundException extends HttpException {
  constructor(id: string) {
    super(
      {
        statusCode: HttpStatus.NOT_FOUND,
        error: 'Not Found',
        code: 'PAYMENT_NOT_FOUND',
        message: 'Không tìm thấy phiếu thu',
        details: { id },
      },
      HttpStatus.NOT_FOUND,
    );
    this.name = 'PaymentNotFoundException';
  }
}

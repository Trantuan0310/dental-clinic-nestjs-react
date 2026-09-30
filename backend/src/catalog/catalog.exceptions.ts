import { HttpStatus } from '@nestjs/common';
import { BusinessRuleException } from '../common/exceptions/business-rule.exception';

export class CatalogNotFoundException extends BusinessRuleException {
  /** `what` is the Vietnamese noun, e.g. "dịch vụ". */
  constructor(what: string, id: string) {
    super(`Không tìm thấy ${what} ${id}`, HttpStatus.NOT_FOUND, undefined, 'CATALOG_NOT_FOUND');
  }
}

export class CatalogCodeTakenException extends BusinessRuleException {
  constructor(code: string) {
    super(`Mã ${code} đã được dùng`, HttpStatus.CONFLICT, undefined, 'CATALOG_CODE_TAKEN');
  }
}

export class CatalogValidationException extends BusinessRuleException {
  constructor(message: string) {
    super(message, HttpStatus.BAD_REQUEST, undefined, 'CATALOG_VALIDATION');
  }
}

/** BR-SVC-004: only an active dentist, an active service, the right specialty. */
export class AssignmentNotAllowedException extends BusinessRuleException {
  constructor(message: string, code = 'ASSIGNMENT_NOT_ALLOWED') {
    super(message, HttpStatus.CONFLICT, undefined, code);
  }
}

/** BR-SVC-004: periods for the same dentist and service may not overlap. */
export class AssignmentOverlapException extends BusinessRuleException {
  constructor(existing: { id: string; effectiveFrom: string; effectiveTo: string | null }) {
    super(
      'Bác sĩ đã được phân công dịch vụ này trong khoảng thời gian trùng',
      HttpStatus.CONFLICT,
      { existing },
      'ASSIGNMENT_OVERLAP',
    );
  }
}

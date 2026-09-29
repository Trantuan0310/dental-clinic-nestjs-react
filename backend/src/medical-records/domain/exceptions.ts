import { HttpStatus } from '@nestjs/common';
import { BusinessRuleException } from '../../common/exceptions/business-rule.exception';
import type { AllergyConflict } from './allergy-check';

export class EncounterNotFoundException extends BusinessRuleException {
  constructor(id: string) {
    super('Không tìm thấy phiên khám', HttpStatus.NOT_FOUND, `Encounter ${id} does not exist`);
  }
}

export class EncounterNotClosableException extends BusinessRuleException {
  constructor(reason: string) {
    super('Phiên khám không ở trạng thái cho phép thao tác này', HttpStatus.CONFLICT, reason);
  }
}

export class ClinicalNoteLockedException extends BusinessRuleException {
  constructor(reason?: string) {
    super(
      'Clinical note locked',
      HttpStatus.CONFLICT,
      reason ?? 'Addendums cannot be added or removed after the encounter is closed',
    );
  }
}

export class TreatmentNotInEncounterException extends BusinessRuleException {
  constructor() {
    super(
      'Điều trị không thuộc phiên khám này',
      HttpStatus.UNPROCESSABLE_ENTITY,
      'Treatment does not belong to the given encounter',
    );
  }
}

export class InsufficientStockException extends BusinessRuleException {
  constructor(itemName: string, required: number, available: number) {
    // The specific item/quantities used to be shoved into `details` only —
    // getApiErrorMessage() (frontend) reads `message`, never `details`, so
    // a dentist blocked from closing an encounter saw just the generic
    // title "Insufficient stock" with no idea which item or how much was
    // short. Put the specifics in `message` itself; `details` still carries
    // the structured fields for any caller that wants them programmatically.
    super(
      `Không đủ tồn kho '${itemName}': cần ${required}, chỉ còn ${available}`,
      HttpStatus.UNPROCESSABLE_ENTITY,
      { itemName, required, available },
      'INSUFFICIENT_STOCK',
    );
  }
}

export class DentalChartPatientMismatchException extends BusinessRuleException {
  constructor() {
    super(
      'Loại sơ đồ răng không khớp với tuổi bệnh nhân',
      HttpStatus.UNPROCESSABLE_ENTITY,
      'DentalChartSnapshot.patientType must match Patient.dob age band (minor/adult)',
    );
  }
}

export class PrescriptionAlreadyExistsException extends BusinessRuleException {
  constructor() {
    super(
      'Phiên khám này đã có đơn thuốc',
      HttpStatus.CONFLICT,
      'Each encounter may only have one prescription',
    );
  }
}

export class PrescriptionVersionConflictException extends BusinessRuleException {
  constructor() {
    super(
      'Đơn thuốc vừa được thay đổi ở nơi khác — tải lại rồi thử lại',
      HttpStatus.CONFLICT,
      undefined,
      'PRESCRIPTION_VERSION_CONFLICT',
    );
  }
}

/**
 * A prescribed drug matches a recorded allergy. The client shows the pairs
 * and may resend with `allergyOverrideReason` to prescribe anyway.
 */
export class PrescriptionAllergyConflictException extends BusinessRuleException {
  constructor(conflicts: AllergyConflict[], reasonTooShort = false) {
    const pairs = conflicts.map(c => `${c.drugName} (dị ứng: ${c.allergy})`).join('; ');
    super(
      reasonTooShort
        ? `Lý do vẫn kê thuốc dù bệnh nhân dị ứng phải có ít nhất 10 ký tự. Thuốc trùng dị ứng: ${pairs}`
        : `Đơn thuốc có thuốc trùng với dị ứng của bệnh nhân: ${pairs}`,
      HttpStatus.CONFLICT,
      { conflicts },
      'PRESCRIPTION_ALLERGY_CONFLICT',
    );
  }
}

export class DentalChartInvalidToothException extends BusinessRuleException {
  constructor(keys: string[], patientType: 'ADULT' | 'CHILD') {
    super(
      `Số răng không hợp lệ trên sơ đồ ${patientType === 'CHILD' ? 'trẻ em' : 'người lớn'}: ${keys.join(', ')}`,
      HttpStatus.UNPROCESSABLE_ENTITY,
      { invalidTeeth: keys, patientType },
    );
  }
}

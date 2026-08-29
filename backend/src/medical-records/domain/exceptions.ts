import { HttpStatus } from '@nestjs/common';
import { BusinessRuleException } from '../../common/exceptions/business-rule.exception';

export class EncounterNotFoundException extends BusinessRuleException {
  constructor(id: string) {
    super('Encounter not found', HttpStatus.NOT_FOUND, `Encounter ${id} does not exist`);
  }
}

export class EncounterNotClosableException extends BusinessRuleException {
  constructor(reason: string) {
    super('Encounter not closable', HttpStatus.CONFLICT, reason);
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
      'Treatment not in encounter',
      HttpStatus.UNPROCESSABLE_ENTITY,
      'Treatment does not belong to the given encounter',
    );
  }
}

export class InsufficientStockException extends BusinessRuleException {
  constructor(itemName: string, required: number, available: number) {
    super(
      'Insufficient stock',
      HttpStatus.UNPROCESSABLE_ENTITY,
      `Inventory item '${itemName}' requires ${required} ${available < 0 ? '0' : ''}available ${available}`,
    );
  }
}

export class DentalChartPatientMismatchException extends BusinessRuleException {
  constructor() {
    super(
      'Patient type mismatch',
      HttpStatus.UNPROCESSABLE_ENTITY,
      'DentalChartSnapshot.patientType must match Patient.dob age band (minor/adult)',
    );
  }
}

export class PrescriptionAlreadyExistsException extends BusinessRuleException {
  constructor() {
    super(
      'Prescription already exists',
      HttpStatus.CONFLICT,
      'Each encounter may only have one prescription',
    );
  }
}

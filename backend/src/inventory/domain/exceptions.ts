import { HttpStatus } from '@nestjs/common';
import { BusinessRuleException } from '../../common/exceptions/business-rule.exception';

export class InventoryItemNotFoundException extends BusinessRuleException {
  constructor(id: string) {
    super('Inventory item not found', HttpStatus.NOT_FOUND, `Item ${id} not found`);
  }
}

export class SkuAlreadyExistsException extends BusinessRuleException {
  constructor(sku: string) {
    super('SKU already exists', HttpStatus.CONFLICT, `SKU ${sku} is already registered`);
  }
}

export class InsufficientStockException extends BusinessRuleException {
  constructor(itemName: string, required: number, available: number) {
    // Same fix as MedicalRecords' InsufficientStockException: the specific
    // item/quantities used to only be in `details`, which
    // getApiErrorMessage() (frontend) never reads — put them in `message`.
    super(
      `Insufficient stock for '${itemName}': requires ${required}, only ${available} available`,
      HttpStatus.UNPROCESSABLE_ENTITY,
      { itemName, required, available },
      'INSUFFICIENT_STOCK',
    );
  }
}

export class StockMovementInvalidException extends BusinessRuleException {
  constructor(reason: string) {
    super('Invalid stock movement', HttpStatus.UNPROCESSABLE_ENTITY, reason);
  }
}

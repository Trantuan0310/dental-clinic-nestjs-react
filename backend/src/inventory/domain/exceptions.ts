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
    super(
      'Insufficient stock',
      HttpStatus.UNPROCESSABLE_ENTITY,
      `Item '${itemName}' requires ${required}, available ${available}`,
    );
  }
}

export class StockMovementInvalidException extends BusinessRuleException {
  constructor(reason: string) {
    super('Invalid stock movement', HttpStatus.UNPROCESSABLE_ENTITY, reason);
  }
}

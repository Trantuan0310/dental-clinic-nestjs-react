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

/** BR-INV-001: two items in use with the same name confuse stock-outs and the materials picker. */
export class ItemNameAlreadyExistsException extends BusinessRuleException {
  constructor(name: string) {
    super(
      `Đã có vật tư tên "${name}" đang dùng. Đặt tên khác (ví dụ thêm quy cách) hoặc dùng vật tư sẵn có.`,
      HttpStatus.CONFLICT,
      { name },
      'ITEM_NAME_EXISTS',
    );
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
    // The reason is the message: the frontend shows `message`, not `details`.
    super(reason, HttpStatus.UNPROCESSABLE_ENTITY, reason, 'STOCK_MOVEMENT_INVALID');
  }
}

/** BR-INV-024: the unit is fixed once stock or history is counted in it. */
export class InventoryUnitLockedException extends BusinessRuleException {
  constructor(unit: string) {
    super(
      `Không đổi được đơn vị "${unit}": vật tư đã có tồn kho hoặc lịch sử nhập / xuất / sử dụng. Tạo vật tư mới với đơn vị khác nếu cần.`,
      HttpStatus.CONFLICT,
      { unit },
      'INVENTORY_UNIT_LOCKED',
    );
  }
}

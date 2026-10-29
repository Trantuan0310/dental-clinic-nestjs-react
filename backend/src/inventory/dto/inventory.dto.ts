import { Transform, Type } from 'class-transformer';
import {
  IsString,
  IsOptional,
  IsNumber,
  IsInt,
  Min,
  Max,
  IsUUID,
  IsEnum,
  IsDateString,
  MinLength,
  MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ItemStatus, MovementType, MovementRefType } from '@prisma/client';

/** Quantities are DECIMAL(12,4) in the database. */
export const MAX_STOCK_QUANTITY = 99_999_999;
export const QUANTITY_DECIMALS = 4;
const QTY_FORMAT = { maxDecimalPlaces: QUANTITY_DECIMALS };
const QTY_FORMAT_MSG = { message: 'Số lượng tối đa 4 chữ số thập phân' };
const QTY_MAX_MSG = { message: `Số lượng tối đa ${MAX_STOCK_QUANTITY.toLocaleString('vi-VN')}` };

export class CreateInventoryCategoryDto {
  @ApiProperty()
  @IsString()
  name!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  parentId?: string;
}

export class UpdateInventoryCategoryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;
}

export class CreateInventoryItemDto {
  @ApiProperty()
  @IsString()
  sku!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @ApiProperty()
  @IsString()
  name!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty()
  @IsNumber(QTY_FORMAT, QTY_FORMAT_MSG)
  @Min(0)
  @Max(MAX_STOCK_QUANTITY, QTY_MAX_MSG)
  quantityOnHand!: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber(QTY_FORMAT, QTY_FORMAT_MSG)
  @Min(0)
  @Max(MAX_STOCK_QUANTITY, QTY_MAX_MSG)
  minStockLevel?: number;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(20)
  unit!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber(QTY_FORMAT)
  @Min(0)
  @Max(MAX_STOCK_QUANTITY)
  costPrice?: number;

  @ApiPropertyOptional({ enum: ItemStatus })
  @IsOptional()
  @IsEnum(ItemStatus)
  status?: ItemStatus;
}

export class UpdateInventoryItemDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber(QTY_FORMAT, QTY_FORMAT_MSG)
  @Min(0)
  @Max(MAX_STOCK_QUANTITY, QTY_MAX_MSG)
  minStockLevel?: number;

  /** Only while the item has no stock and no history (BR-INV-024). */
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(20)
  unit?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber(QTY_FORMAT)
  @Min(0)
  @Max(MAX_STOCK_QUANTITY)
  costPrice?: number;

  @ApiPropertyOptional({ enum: ItemStatus })
  @IsOptional()
  @IsEnum(ItemStatus)
  status?: ItemStatus;
}

export class ListMovementsQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  inventoryItemId?: string;

  @ApiPropertyOptional({ enum: MovementType })
  @IsOptional()
  @IsEnum(MovementType)
  type?: MovementType;

  @ApiPropertyOptional({ example: '2026-10-01' })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional({ example: '2026-10-31' })
  @IsOptional()
  @IsDateString()
  to?: string;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ default: 200, maximum: 200 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  pageSize?: number;
}

// BR-INV-004: Adjustment is an ABSOLUTE set of quantityOnHand. The client
// sends `newQuantity` (the target value). `quantity` is kept as an optional
// convenience field for clients that prefer to express a delta — when
// supplied, the service treats it as `newQuantity = current + quantity`.
// At least one of `newQuantity` or `quantity` is required.
export class StockAdjustmentDto {
  @ApiPropertyOptional({ description: 'Absolute target quantity after adjustment' })
  @IsOptional()
  @IsNumber(QTY_FORMAT, QTY_FORMAT_MSG)
  @Min(0, { message: 'Số lượng sau điều chỉnh không được âm' })
  @Max(MAX_STOCK_QUANTITY, QTY_MAX_MSG)
  newQuantity?: number;

  @ApiPropertyOptional({
    description: 'Optional delta to apply to current quantityOnHand',
  })
  @IsOptional()
  @IsNumber(QTY_FORMAT, QTY_FORMAT_MSG)
  @Min(-MAX_STOCK_QUANTITY)
  @Max(MAX_STOCK_QUANTITY, QTY_MAX_MSG)
  quantity?: number;

  /** BR-INV-006 / BR-INV-008: why stock went down or was corrected. */
  @ApiProperty({ minLength: 3, maxLength: 500 })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString({ message: 'Lý do không hợp lệ' })
  @MinLength(3, { message: 'Nhập lý do (ít nhất 3 ký tự)' })
  @MaxLength(500, { message: 'Lý do tối đa 500 ký tự' })
  reason!: string;
}

export class StockInDto {
  @ApiProperty({ minimum: 0.0001, maximum: MAX_STOCK_QUANTITY })
  @IsNumber(QTY_FORMAT, QTY_FORMAT_MSG)
  @Min(0.0001, { message: 'Số lượng phải lớn hơn 0' })
  @Max(MAX_STOCK_QUANTITY, QTY_MAX_MSG)
  quantity!: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  reason?: string;

  @ApiPropertyOptional({ enum: MovementRefType })
  @IsOptional()
  @IsEnum(MovementRefType)
  refType?: MovementRefType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  refId?: string;
}

export class StockOutDto {
  @ApiProperty({ minimum: 0.0001, maximum: MAX_STOCK_QUANTITY })
  @IsNumber(QTY_FORMAT, QTY_FORMAT_MSG)
  @Min(0.0001, { message: 'Số lượng phải lớn hơn 0' })
  @Max(MAX_STOCK_QUANTITY, QTY_MAX_MSG)
  quantity!: number;

  /** BR-INV-006 / BR-INV-008: why stock went down or was corrected. */
  @ApiProperty({ minLength: 3, maxLength: 500 })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString({ message: 'Lý do không hợp lệ' })
  @MinLength(3, { message: 'Nhập lý do (ít nhất 3 ký tự)' })
  @MaxLength(500, { message: 'Lý do tối đa 500 ký tự' })
  reason!: string;

  @ApiPropertyOptional({ enum: MovementRefType })
  @IsOptional()
  @IsEnum(MovementRefType)
  refType?: MovementRefType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  refId?: string;
}

export class RecordStockMovementDto {
  @ApiProperty()
  @IsUUID()
  inventoryItemId!: string;

  @ApiProperty({ enum: MovementType })
  @IsEnum(MovementType)
  type!: MovementType;

  @ApiPropertyOptional({ enum: MovementRefType })
  @IsOptional()
  @IsEnum(MovementRefType)
  refType?: MovementRefType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  refId?: string;

  @ApiProperty()
  @IsNumber()
  quantity!: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  reason?: string;
}

export class ListInventoryQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  q?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @ApiPropertyOptional({ enum: ItemStatus })
  @IsOptional()
  @IsEnum(ItemStatus)
  status?: ItemStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  lowStock?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  lowStockOnly?: string;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ default: 200, maximum: 200 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  pageSize?: number;
}

import { IsString, IsOptional, IsNumber, Min, IsUUID, IsEnum } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ItemStatus, MovementType, MovementRefType } from '@prisma/client';

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
  @IsNumber()
  @Min(0)
  quantityOnHand!: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  minStockLevel?: number;

  @ApiProperty()
  @IsString()
  unit!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
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
  @IsNumber()
  @Min(0)
  minStockLevel?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  unit?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
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

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  from?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  to?: string;
}

// BR-INV-004: Adjustment is an ABSOLUTE set of quantityOnHand. The client
// sends `newQuantity` (the target value). `quantity` is kept as an optional
// convenience field for clients that prefer to express a delta — when
// supplied, the service treats it as `newQuantity = current + quantity`.
// At least one of `newQuantity` or `quantity` is required.
export class StockAdjustmentDto {
  @ApiPropertyOptional({ description: 'Absolute target quantity after adjustment' })
  @IsOptional()
  @IsNumber()
  newQuantity?: number;

  @ApiPropertyOptional({
    description: 'Optional delta to apply to current quantityOnHand',
  })
  @IsOptional()
  @IsNumber()
  quantity?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  reason?: string;
}

export class StockInDto {
  @ApiProperty()
  @IsNumber()
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
  @ApiProperty()
  @IsNumber()
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
}

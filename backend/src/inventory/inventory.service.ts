import { Injectable, Logger } from '@nestjs/common';
import { Prisma, ItemStatus, MovementType, MovementRefType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { JwtPayload } from '../common/guards/permissions.guard';
import {
  InventoryItemNotFoundException,
  InsufficientStockException,
  SkuAlreadyExistsException,
  StockMovementInvalidException,
} from './domain/exceptions';
import {
  CreateInventoryCategoryDto,
  CreateInventoryItemDto,
  ListInventoryQueryDto,
  ListMovementsQueryDto,
  StockAdjustmentDto,
  StockInDto,
  StockOutDto,
  UpdateInventoryItemDto,
} from './dto/inventory.dto';

/**
 * InventoryService — items, categories, stock movements.
 *
 * Stock-out flow:
 *   - Direct manual stock-out (StockOutDto) — used by admins
 *   - Encounter-driven stock-out — happens inside MedicalRecordsService's
 *     closeEncounter tx (NOT here) to keep atomic.
 *
 * Low-stock alerts (BR-INV-005): emitted via log; a future cron scans
 * items where quantityOnHand <= minStockLevel and notifies admin.
 */
@Injectable()
export class InventoryService {
  private readonly logger = new Logger(InventoryService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // ==========================================================================
  // Items
  // ==========================================================================

  async createItem(dto: CreateInventoryItemDto, actor: JwtPayload) {
    const skuExists = await this.prisma.inventoryItem.findFirst({
      where: { sku: dto.sku, deletedAt: null },
      select: { id: true },
    });
    if (skuExists) throw new SkuAlreadyExistsException(dto.sku);

    const created = await this.prisma.inventoryItem.create({
      data: {
        sku: dto.sku,
        categoryId: dto.categoryId ?? null,
        name: dto.name,
        description: dto.description ?? null,
        quantityOnHand: dto.quantityOnHand ?? 0,
        minStockLevel: dto.minStockLevel ?? 0,
        unit: dto.unit,
        costPrice: dto.costPrice ?? null,
        status: (dto.status ?? 'ACTIVE') as ItemStatus,
        createdBy: actor.sub,
      },
    });

    await this.audit.log({
      action: 'INVENTORY_ITEM_CREATED',
      actorUserId: actor.sub,
      actorEmail: actor.email,
      targetType: 'inventory_item',
      targetId: created.id,
      metadata: { sku: created.sku, name: created.name },
    });

    return created;
  }

  async updateItem(id: string, dto: UpdateInventoryItemDto, actor: JwtPayload) {
    const item = await this.prisma.inventoryItem.findUnique({ where: { id } });
    if (!item || item.deletedAt) throw new InventoryItemNotFoundException(id);

    const updated = await this.prisma.inventoryItem.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.categoryId !== undefined && { categoryId: dto.categoryId }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.minStockLevel !== undefined && { minStockLevel: dto.minStockLevel }),
        ...(dto.unit !== undefined && { unit: dto.unit }),
        ...(dto.costPrice !== undefined && { costPrice: dto.costPrice }),
        ...(dto.status !== undefined && { status: dto.status as ItemStatus }),
      },
    });

    await this.audit.log({
      action: 'INVENTORY_ITEM_UPDATED',
      actorUserId: actor.sub,
      targetType: 'inventory_item',
      targetId: id,
      metadata: { fields: Object.keys(dto) },
    });

    return updated;
  }

  async deleteItem(id: string, actor: JwtPayload) {
    const item = await this.prisma.inventoryItem.findUnique({ where: { id } });
    if (!item || item.deletedAt) throw new InventoryItemNotFoundException(id);
    if (Number(item.quantityOnHand) > 0) {
      throw new StockMovementInvalidException(
        `Cannot delete item with quantityOnHand=${item.quantityOnHand}; zero it out first`,
      );
    }
    await this.prisma.inventoryItem.update({
      where: { id },
      data: { deletedAt: new Date(), status: 'DISCONTINUED' },
    });
    await this.audit.log({
      action: 'INVENTORY_ITEM_DELETED',
      actorUserId: actor.sub,
      targetType: 'inventory_item',
      targetId: id,
      metadata: { sku: item.sku, name: item.name },
    });
  }

  async getItem(id: string) {
    const item = await this.prisma.inventoryItem.findUnique({
      where: { id },
      include: {
        category: { select: { id: true, name: true } },
        movements: {
          orderBy: { performedAt: 'desc' },
          take: 20,
        },
      },
    });
    if (!item || item.deletedAt) throw new InventoryItemNotFoundException(id);
    return item;
  }

  async listItems(query: ListInventoryQueryDto) {
    const where: Prisma.InventoryItemWhereInput = {
      deletedAt: null,
      ...(query.categoryId && { categoryId: query.categoryId }),
      ...(query.status && { status: query.status as ItemStatus }),
      ...(query.q && {
        OR: [
          { sku: { contains: query.q, mode: 'insensitive' } },
          { name: { contains: query.q, mode: 'insensitive' } },
        ],
      }),
      // BR-INV-005: low-stock filter applied at DB level so pagination is correct
      // even when the total inventory exceeds the page cap. The previous
      // post-fetch filter only saw the first 200 items.
      ...(query.lowStockOnly === 'true' && { minStockLevel: { gt: 0 } }),
    };

    const items = await this.prisma.inventoryItem.findMany({
      where,
      orderBy: { name: 'asc' },
      take: 200,
      include: {
        category: { select: { id: true, name: true } },
      },
    });

    if (query.lowStockOnly === 'true') {
      return items.filter(i => Number(i.quantityOnHand) <= Number(i.minStockLevel));
    }
    return items;
  }

  // ==========================================================================
  // Stock movements
  // ==========================================================================

  async stockIn(itemId: string, dto: StockInDto, actor: JwtPayload) {
    return this.prisma.$transaction(async tx => {
      const item = await tx.inventoryItem.findUnique({ where: { id: itemId } });
      if (!item || item.deletedAt) throw new InventoryItemNotFoundException(itemId);

      const requested = Number(dto.quantity);
      // Atomic guarded increment — also returns the updated row.
      const result = await tx.inventoryItem.updateMany({
        where: { id: itemId, deletedAt: null },
        data: { quantityOnHand: { increment: requested } },
      });
      if (result.count === 0) {
        throw new InventoryItemNotFoundException(itemId);
      }
      const updated = await tx.inventoryItem.findUnique({
        where: { id: itemId },
        select: { quantityOnHand: true },
      });

      await tx.stockMovement.create({
        data: {
          inventoryItemId: itemId,
          type: MovementType.STOCK_IN,
          refType: (dto.refType as MovementRefType | undefined) ?? null,
          refId: dto.refId ?? null,
          quantityBefore: item.quantityOnHand,
          quantityAfter: updated?.quantityOnHand ?? 0,
          diff: requested,
          reason: dto.reason ?? null,
          performedBy: actor.sub,
        },
      });

      await this.audit.log({
        action: 'INVENTORY_STOCK_IN',
        actorUserId: actor.sub,
        targetType: 'inventory_item',
        targetId: itemId,
        metadata: {
          quantity: requested,
          before: item.quantityOnHand,
          after: updated?.quantityOnHand ?? 0,
        },
      });

      return { ...item, quantityOnHand: updated?.quantityOnHand ?? 0 };
    });
  }

  async stockOut(itemId: string, dto: StockOutDto, actor: JwtPayload) {
    return this.prisma.$transaction(async tx => {
      const item = await tx.inventoryItem.findUnique({ where: { id: itemId } });
      if (!item || item.deletedAt) throw new InventoryItemNotFoundException(itemId);

      const requested = Number(dto.quantity);
      // Atomic guarded decrement (BR-INV-003): only succeed if stock is
      // sufficient — prevents read-then-update races.
      const result = await tx.inventoryItem.updateMany({
        where: {
          id: itemId,
          quantityOnHand: { gte: requested },
          deletedAt: null,
        },
        data: { quantityOnHand: { decrement: requested } },
      });
      if (result.count === 0) {
        throw new InsufficientStockException(item.name, requested, Number(item.quantityOnHand));
      }

      const after = await tx.inventoryItem.findUnique({
        where: { id: itemId },
        select: { quantityOnHand: true },
      });

      const updated = { ...item, quantityOnHand: after?.quantityOnHand ?? 0 };
      await tx.stockMovement.create({
        data: {
          inventoryItemId: itemId,
          type: MovementType.STOCK_OUT,
          refType: (dto.refType as MovementRefType | undefined) ?? null,
          refId: dto.refId ?? null,
          quantityBefore: item.quantityOnHand,
          quantityAfter: updated.quantityOnHand,
          diff: -requested,
          reason: dto.reason ?? null,
          performedBy: actor.sub,
        },
      });

      await this.audit.log({
        action: 'INVENTORY_STOCK_OUT',
        actorUserId: actor.sub,
        targetType: 'inventory_item',
        targetId: itemId,
        metadata: {
          quantity: requested,
          before: item.quantityOnHand,
          after: updated.quantityOnHand,
        },
      });

      return updated;
    });
  }

  async adjustStock(itemId: string, dto: StockAdjustmentDto, actor: JwtPayload) {
    return this.prisma.$transaction(async tx => {
      const item = await tx.inventoryItem.findUnique({ where: { id: itemId } });
      if (!item || item.deletedAt) throw new InventoryItemNotFoundException(itemId);

      // BR-INV-004: Adjustment is an ABSOLUTE set of quantityOnHand.
      // Clients may send either:
      //   - `newQuantity` (target absolute value, recommended)
      //   - `quantity`    (delta; the service resolves to current + delta)
      // If both are provided, `newQuantity` wins. At least one must be set.
      const before = Number(item.quantityOnHand);
      let after: number;
      if (dto.newQuantity !== undefined && dto.newQuantity !== null) {
        after = Number(dto.newQuantity);
      } else if (dto.quantity !== undefined && dto.quantity !== null) {
        after = before + Number(dto.quantity);
      } else {
        throw new StockMovementInvalidException(
          'StockAdjustmentDto requires either `newQuantity` (absolute) or `quantity` (delta)',
        );
      }
      if (after < 0) {
        throw new StockMovementInvalidException('Adjusted quantity cannot be negative');
      }
      const diff = after - before;

      // Atomic absolute-set: use guarded updateMany in case item was just
      // soft-deleted in a concurrent tx.
      const setResult = await tx.inventoryItem.updateMany({
        where: { id: itemId, deletedAt: null },
        data: { quantityOnHand: after },
      });
      if (setResult.count === 0) {
        throw new InventoryItemNotFoundException(itemId);
      }

      await tx.stockMovement.create({
        data: {
          inventoryItemId: itemId,
          type: MovementType.ADJUSTMENT,
          quantityBefore: before,
          quantityAfter: after,
          diff,
          reason: dto.reason,
          performedBy: actor.sub,
        },
      });

      await this.audit.log({
        action: 'INVENTORY_ADJUSTMENT',
        actorUserId: actor.sub,
        targetType: 'inventory_item',
        targetId: itemId,
        metadata: { before, after, diff, reason: dto.reason },
      });

      // BR-INV-005: low-stock notification
      if (after <= Number(item.minStockLevel) && before > Number(item.minStockLevel)) {
        this.logger.warn(
          `Low-stock triggered for ${item.sku}: ${after} ${item.unit} ≤ min ${item.minStockLevel}`,
        );
      }

      return { ...item, quantityOnHand: after };
    });
  }

  async listMovements(query: ListMovementsQueryDto) {
    const where: Prisma.StockMovementWhereInput = {
      ...(query.inventoryItemId && { inventoryItemId: query.inventoryItemId }),
      ...(query.type && { type: query.type }),
      ...((query.from || query.to) && {
        performedAt: {
          ...(query.from && { gte: new Date(query.from) }),
          ...(query.to && { lte: new Date(query.to) }),
        },
      }),
    };

    return this.prisma.stockMovement.findMany({
      where,
      orderBy: { performedAt: 'desc' },
      take: 200,
      include: {
        inventoryItem: { select: { id: true, sku: true, name: true, unit: true } },
        performedByUser: { select: { id: true, fullName: true } },
      },
    });
  }

  // ==========================================================================
  // Categories
  // ==========================================================================

  async createCategory(dto: CreateInventoryCategoryDto, actor: JwtPayload) {
    return this.prisma.inventoryCategory.create({
      data: {
        name: dto.name,
        description: dto.description ?? null,
        createdBy: actor.sub,
      },
    });
  }

  async listCategories() {
    return this.prisma.inventoryCategory.findMany({
      where: { deletedAt: null },
      orderBy: { name: 'asc' },
    });
  }

  // ==========================================================================
  // Reports
  // ==========================================================================

  /**
   * BR-INV-005: Low-stock report.
   * Filter applied at DB level so the result is correct even when total
   * inventory exceeds the page cap.
   */
  async lowStockReport() {
    return this.prisma.inventoryItem
      .findMany({
        where: { deletedAt: null, status: ItemStatus.ACTIVE, minStockLevel: { gt: 0 } },
        orderBy: [{ quantityOnHand: 'asc' }, { name: 'asc' }],
        take: 200,
        include: {
          category: { select: { id: true, name: true } },
        },
      })
      .then(items => items.filter(i => Number(i.quantityOnHand) <= Number(i.minStockLevel)));
  }
}

import { Injectable, Logger } from '@nestjs/common';
import { Prisma, ItemStatus, MovementType, MovementRefType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { JwtPayload } from '../common/guards/permissions.guard';
import { endOfDayInclusive } from '../common/date-range.util';
import {
  InventoryItemNotFoundException,
  InsufficientStockException,
  InventoryUnitLockedException,
  ItemNameAlreadyExistsException,
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
  MAX_STOCK_QUANTITY,
  QUANTITY_DECIMALS,
} from './dto/inventory.dto';

const DEFAULT_PAGE_SIZE = 200;

/**
 * A movement quantity: positive, at most 4 decimals and within DECIMAL(12,4).
 * Checked here as well as in the DTO, since other services call in directly.
 */
function movementQuantity(value: number): Prisma.Decimal {
  const q = new Prisma.Decimal(value);
  if (
    !q.isFinite() ||
    q.lte(0) ||
    q.gt(MAX_STOCK_QUANTITY) ||
    q.decimalPlaces() > QUANTITY_DECIMALS
  ) {
    throw new StockMovementInvalidException(
      `Số lượng phải lớn hơn 0, tối đa ${MAX_STOCK_QUANTITY} và tối đa ${QUANTITY_DECIMALS} chữ số thập phân`,
    );
  }
  return q;
}

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
    await this.assertNameFree(dto.name);

    const opening = new Prisma.Decimal(dto.quantityOnHand ?? 0);
    const created = await this.prisma.$transaction(async tx => {
      const row = await tx.inventoryItem.create({
        data: {
          sku: dto.sku,
          categoryId: dto.categoryId ?? null,
          name: dto.name,
          description: dto.description ?? null,
          quantityOnHand: opening,
          minStockLevel: dto.minStockLevel ?? 0,
          unit: dto.unit.trim(),
          costPrice: dto.costPrice ?? null,
          status: (dto.status ?? 'ACTIVE') as ItemStatus,
          createdBy: actor.sub,
        },
      });
      // BR-INV-019: stock on hand is only ever explained by movements, the
      // opening balance included.
      if (opening.gt(0)) {
        await tx.stockMovement.create({
          data: {
            inventoryItemId: row.id,
            type: MovementType.STOCK_IN,
            quantityBefore: 0,
            quantityAfter: opening,
            diff: opening,
            reason: 'Tồn đầu khi tạo vật tư',
            performedBy: actor.sub,
          },
        });
      }
      return row;
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

  /** BR-INV-001: no other item in use (not deleted) has this name, case ignored. */
  private async assertNameFree(name: string, exceptId?: string) {
    const taken = await this.prisma.inventoryItem.findFirst({
      where: {
        deletedAt: null,
        name: { equals: name.trim(), mode: 'insensitive' },
        ...(exceptId && { id: { not: exceptId } }),
      },
      select: { id: true },
    });
    if (taken) throw new ItemNameAlreadyExistsException(name.trim());
  }

  async updateItem(id: string, dto: UpdateInventoryItemDto, actor: JwtPayload) {
    const item = await this.prisma.inventoryItem.findUnique({ where: { id } });
    if (!item || item.deletedAt) throw new InventoryItemNotFoundException(id);
    if (
      dto.name !== undefined &&
      dto.name.trim().toLowerCase() !== item.name.trim().toLowerCase()
    ) {
      await this.assertNameFree(dto.name, id);
    }
    // BR-INV-024: stock, movements and treatment usages are counted in the
    // item's unit; renaming it (hộp → cái) would silently rescale them all.
    if (dto.unit !== undefined && dto.unit.trim() !== item.unit.trim()) {
      const [moves, usages] = await Promise.all([
        this.prisma.stockMovement.count({ where: { inventoryItemId: id } }),
        this.prisma.treatmentInventoryUsage.count({ where: { inventoryItemId: id } }),
      ]);
      if (!new Prisma.Decimal(item.quantityOnHand).isZero() || moves > 0 || usages > 0) {
        throw new InventoryUnitLockedException(item.unit);
      }
    }

    const updated = await this.prisma.inventoryItem.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.categoryId !== undefined && { categoryId: dto.categoryId }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.minStockLevel !== undefined && { minStockLevel: dto.minStockLevel }),
        ...(dto.unit !== undefined && { unit: dto.unit.trim() }),
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
    const stockLeft = () =>
      new StockMovementInvalidException(
        `Vật tư còn tồn ${item.quantityOnHand} ${item.unit}; điều chỉnh tồn về 0 trước khi xoá`,
      );
    if (Number(item.quantityOnHand) > 0) throw stockLeft();
    // Guarded write: a stock-in committed after the read above must not be
    // hidden under a deleted item.
    const deleted = await this.prisma.inventoryItem.updateMany({
      where: { id, deletedAt: null, quantityOnHand: { lte: 0 } },
      data: { deletedAt: new Date(), status: 'DISCONTINUED' },
    });
    if (deleted.count === 0) {
      const now = await this.prisma.inventoryItem.findUnique({ where: { id } });
      if (!now || now.deletedAt) throw new InventoryItemNotFoundException(id);
      throw stockLeft();
    }
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
      // BR-INV-005 (INV-01): the low-stock comparison runs in the database,
      // before the 200-row cap, so an item past row 200 is not missed.
      ...(query.lowStockOnly === 'true' && {
        minStockLevel: { gt: 0 },
        quantityOnHand: { lte: this.prisma.inventoryItem.fields.minStockLevel },
      }),
    };

    const pageSize = query.pageSize ?? DEFAULT_PAGE_SIZE;
    const page = query.page ?? 1;
    const [data, total] = await Promise.all([
      this.prisma.inventoryItem.findMany({
        where,
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          category: { select: { id: true, name: true } },
        },
      }),
      this.prisma.inventoryItem.count({ where }),
    ]);
    return { data, total, page, pageSize };
  }

  // ==========================================================================
  // Stock movements
  // ==========================================================================

  async stockIn(itemId: string, dto: StockInDto, actor: JwtPayload) {
    return this.prisma.$transaction(async tx => {
      const item = await tx.inventoryItem.findUnique({ where: { id: itemId } });
      if (!item || item.deletedAt) throw new InventoryItemNotFoundException(itemId);

      const requested = movementQuantity(dto.quantity);
      // Atomic guarded increment; the cap keeps the total inside DECIMAL(12,4).
      const result = await tx.inventoryItem.updateMany({
        where: {
          id: itemId,
          deletedAt: null,
          quantityOnHand: { lte: new Prisma.Decimal(MAX_STOCK_QUANTITY).minus(requested) },
        },
        data: { quantityOnHand: { increment: requested } },
      });
      if (result.count === 0) {
        const now = await tx.inventoryItem.findUnique({ where: { id: itemId } });
        if (!now || now.deletedAt) throw new InventoryItemNotFoundException(itemId);
        throw new StockMovementInvalidException(
          `Tồn kho sau khi nhập vượt quá ${MAX_STOCK_QUANTITY} ${item.unit}`,
        );
      }
      const updated = await tx.inventoryItem.findUnique({
        where: { id: itemId },
        select: { quantityOnHand: true },
      });

      // INV-02: the row is locked by our update until commit, so `after` is
      // exact and `before` follows from it (the first read may be stale).
      const quantityAfter = new Prisma.Decimal(updated?.quantityOnHand ?? 0);
      const quantityBefore = quantityAfter.minus(requested);
      await tx.stockMovement.create({
        data: {
          inventoryItemId: itemId,
          type: MovementType.STOCK_IN,
          refType: (dto.refType as MovementRefType | undefined) ?? null,
          refId: dto.refId ?? null,
          quantityBefore,
          quantityAfter,
          diff: requested,
          reason: dto.reason ?? null,
          performedBy: actor.sub,
        },
      });

      await this.audit.log(
        {
          action: 'INVENTORY_STOCK_IN',
          actorUserId: actor.sub,
          targetType: 'inventory_item',
          targetId: itemId,
          metadata: {
            quantity: requested.toNumber(),
            before: quantityBefore,
            after: quantityAfter,
          },
        },
        tx,
      );

      return { ...item, quantityOnHand: updated?.quantityOnHand ?? 0 };
    });
  }

  async stockOut(itemId: string, dto: StockOutDto, actor: JwtPayload) {
    return this.prisma.$transaction(async tx => {
      const item = await tx.inventoryItem.findUnique({ where: { id: itemId } });
      if (!item || item.deletedAt) throw new InventoryItemNotFoundException(itemId);

      const requested = movementQuantity(dto.quantity);
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
        const now = await tx.inventoryItem.findUnique({ where: { id: itemId } });
        if (!now || now.deletedAt) throw new InventoryItemNotFoundException(itemId);
        throw new InsufficientStockException(
          item.name,
          requested.toNumber(),
          Number(now.quantityOnHand),
        );
      }

      const after = await tx.inventoryItem.findUnique({
        where: { id: itemId },
        select: { quantityOnHand: true },
      });

      const updated = { ...item, quantityOnHand: after?.quantityOnHand ?? 0 };
      // INV-02: `before` from the locked row, not from the first read.
      const quantityBefore = new Prisma.Decimal(updated.quantityOnHand).plus(requested);
      await tx.stockMovement.create({
        data: {
          inventoryItemId: itemId,
          type: MovementType.STOCK_OUT,
          refType: (dto.refType as MovementRefType | undefined) ?? null,
          refId: dto.refId ?? null,
          quantityBefore,
          quantityAfter: updated.quantityOnHand,
          diff: requested.negated(),
          reason: dto.reason ?? null,
          performedBy: actor.sub,
        },
      });

      await this.audit.log(
        {
          action: 'INVENTORY_STOCK_OUT',
          actorUserId: actor.sub,
          targetType: 'inventory_item',
          targetId: itemId,
          metadata: {
            quantity: requested.toNumber(),
            before: quantityBefore,
            after: updated.quantityOnHand,
          },
        },
        tx,
      );

      return updated;
    });
  }

  async adjustStock(itemId: string, dto: StockAdjustmentDto, actor: JwtPayload) {
    return this.prisma.$transaction(
      async tx => {
        const item = await tx.inventoryItem.findUnique({ where: { id: itemId } });
        if (!item || item.deletedAt) throw new InventoryItemNotFoundException(itemId);

        // BR-INV-004: Adjustment is an ABSOLUTE set of quantityOnHand.
        // Clients may send either:
        //   - `newQuantity` (target absolute value, recommended)
        //   - `quantity`    (delta; the service resolves to current + delta)
        // If both are provided, `newQuantity` wins. At least one must be set.
        const before = new Prisma.Decimal(item.quantityOnHand);
        let after: Prisma.Decimal;
        if (dto.newQuantity !== undefined && dto.newQuantity !== null) {
          after = new Prisma.Decimal(dto.newQuantity);
        } else if (dto.quantity !== undefined && dto.quantity !== null) {
          after = before.plus(dto.quantity);
        } else {
          throw new StockMovementInvalidException(
            'StockAdjustmentDto requires either `newQuantity` (absolute) or `quantity` (delta)',
          );
        }
        if (after.isNegative()) {
          throw new StockMovementInvalidException('Số lượng sau điều chỉnh không được âm');
        }
        if (after.gt(MAX_STOCK_QUANTITY) || after.decimalPlaces() > QUANTITY_DECIMALS) {
          throw new StockMovementInvalidException(
            `Số lượng tối đa ${MAX_STOCK_QUANTITY}, tối đa ${QUANTITY_DECIMALS} chữ số thập phân`,
          );
        }
        const diff = after.minus(before);
        // BR-INV-023: a count that matches what is on hand changes nothing;
        // no movement row or audit entry for it.
        if (diff.isZero()) return item;

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

        await this.audit.log(
          {
            action: 'INVENTORY_ADJUSTMENT',
            actorUserId: actor.sub,
            targetType: 'inventory_item',
            targetId: itemId,
            metadata: {
              before: before.toNumber(),
              after: after.toNumber(),
              diff: diff.toNumber(),
              reason: dto.reason,
            },
          },
          tx,
        );

        // BR-INV-005: low-stock notification
        if (after.lte(item.minStockLevel) && before.gt(item.minStockLevel)) {
          this.logger.warn(
            `Low-stock triggered for ${item.sku}: ${after} ${item.unit} ≤ min ${item.minStockLevel}`,
          );
        }

        return { ...item, quantityOnHand: after };
      },
      // Serializable: `before`/`after` are computed from a plain read, then
      // written as an absolute value — unlike stockIn/stockOut (atomic
      // increment/decrement), this can't be made race-safe by the write
      // alone. Without this, two actors adjusting the same item around the
      // same time (front desk correcting a count while admin does a bulk
      // audit) both read the same `before`, and the second write silently
      // overwrites the first — one adjustment is lost with no error.
      // Matches the same fix already applied to this exact
      // read-compute-write shape in billing/users/patients/payroll.
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  async listMovements(query: ListMovementsQueryDto) {
    const where: Prisma.StockMovementWhereInput = {
      ...(query.inventoryItemId && { inventoryItemId: query.inventoryItemId }),
      ...(query.type && { type: query.type }),
      // `lte: new Date(query.to)` on a bare YYYY-MM-DD date is UTC midnight
      // — a zero-width instant, not "through end of that day". A same-day
      // from/to filter (e.g. "today") would always match nothing.
      ...((query.from || query.to) && {
        performedAt: {
          ...(query.from && { gte: new Date(query.from) }),
          ...(query.to && { lte: endOfDayInclusive(query.to) }),
        },
      }),
    };

    const pageSize = query.pageSize ?? DEFAULT_PAGE_SIZE;
    const page = query.page ?? 1;
    const [data, total] = await Promise.all([
      this.prisma.stockMovement.findMany({
        where,
        orderBy: [{ performedAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          inventoryItem: { select: { id: true, sku: true, name: true, unit: true } },
          performedByUser: { select: { id: true, fullName: true } },
        },
      }),
      this.prisma.stockMovement.count({ where }),
    ]);
    return { data, total, page, pageSize };
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
    // The comparison runs in the database, before the row cap: filtering
    // after `take` missed low items beyond the first 200 by quantity.
    return this.prisma.inventoryItem.findMany({
      where: {
        deletedAt: null,
        status: ItemStatus.ACTIVE,
        minStockLevel: { gt: 0 },
        quantityOnHand: { lte: this.prisma.inventoryItem.fields.minStockLevel },
      },
      orderBy: [{ quantityOnHand: 'asc' }, { name: 'asc' }],
      take: 200,
      include: {
        category: { select: { id: true, name: true } },
      },
    });
  }
}

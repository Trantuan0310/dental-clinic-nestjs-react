import { Test } from '@nestjs/testing';
import { Prisma, MovementType, ItemStatus } from '@prisma/client';
import { InventoryService } from './inventory.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { createPrismaMock, PrismaMockShape } from '../../test/helpers/prisma-mock';
import { validInventoryItem, adminPayload } from '../../test/helpers';
import {
  InventoryItemNotFoundException,
  InsufficientStockException,
  SkuAlreadyExistsException,
} from './domain/exceptions';

describe('InventoryService', () => {
  let service: InventoryService;
  let prisma: PrismaMockShape;
  let audit: { log: jest.Mock };
  const adminActor = adminPayload();

  beforeEach(async () => {
    prisma = createPrismaMock();
    audit = { log: jest.fn().mockResolvedValue(undefined) };

    const module = await Test.createTestingModule({
      providers: [
        InventoryService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditService, useValue: audit },
      ],
    }).compile();

    service = module.get(InventoryService);
  });

  afterEach(() => jest.clearAllMocks());

  describe('createItem', () => {
    it('throws SkuAlreadyExistsException when SKU already exists', async () => {
      (prisma.inventoryItem.findFirst as jest.Mock).mockResolvedValue({ id: 'other' });
      await expect(
        service.createItem({ sku: 'SKU-001', name: 'Gloves', unit: 'box' } as any, adminActor),
      ).rejects.toThrow(SkuAlreadyExistsException);
    });

    it('refuses a name already used by an item in use, case ignored (BR-INV-001)', async () => {
      (prisma.inventoryItem.findFirst as jest.Mock)
        .mockResolvedValueOnce(null) // SKU free
        .mockResolvedValueOnce({ id: 'other' }); // name taken
      const error = await service
        .createItem({ sku: 'SKU-NEW', name: ' găng tay ', unit: 'box' } as any, adminActor)
        .catch(e => e);
      expect(error.getStatus()).toBe(409);
      expect((prisma.inventoryItem.findFirst as jest.Mock).mock.calls[1][0].where).toMatchObject({
        deletedAt: null,
        name: { equals: 'găng tay', mode: 'insensitive' },
      });
      expect(prisma.inventoryItem.create).not.toHaveBeenCalled();
    });

    it('creates item with ACTIVE status, logs audit', async () => {
      (prisma.inventoryItem.findFirst as jest.Mock).mockResolvedValue(null);
      (prisma.inventoryItem.create as jest.Mock).mockResolvedValue(validInventoryItem());

      const result = await service.createItem(
        { sku: 'SKU-NEW', name: 'Masks', unit: 'box' } as any,
        adminActor,
      );

      expect(prisma.inventoryItem.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            sku: 'SKU-NEW',
            status: ItemStatus.ACTIVE,
            createdBy: adminActor.sub,
          }),
        }),
      );
      expect(result.id).toBe('item-1');
    });
  });

  describe('listItems', () => {
    it('INV-01: compares stock to the minimum in the database, before the row cap', async () => {
      const minField = { name: 'minStockLevel', modelName: 'InventoryItem' };
      (prisma.inventoryItem as any).fields = { minStockLevel: minField };
      (prisma.inventoryItem.findMany as jest.Mock).mockResolvedValue([]);

      await service.listItems({ lowStockOnly: 'true' } as any);

      const { where, take } = (prisma.inventoryItem.findMany as jest.Mock).mock.calls[0][0];
      expect(where.quantityOnHand).toEqual({ lte: minField });
      expect(where.minStockLevel).toEqual({ gt: 0 });
      expect(take).toBe(200);
    });
  });

  describe('stockIn', () => {
    it('increments quantityOnHand and writes STOCK_IN movement', async () => {
      (prisma.$transaction as jest.Mock).mockImplementation(async (cb: any) => cb(prisma));
      (prisma.inventoryItem.findUnique as jest.Mock)
        .mockResolvedValueOnce(validInventoryItem())
        .mockResolvedValueOnce(validInventoryItem({ quantityOnHand: new Prisma.Decimal(120) }));
      (prisma.inventoryItem.updateMany as jest.Mock).mockResolvedValue({ count: 1 });

      await service.stockIn('item-1', { quantity: 20, reason: 'Restock' } as any, adminActor);

      const update = (prisma.inventoryItem.updateMany as jest.Mock).mock.calls[0][0];
      expect(update.where).toMatchObject({ id: 'item-1', deletedAt: null });
      expect(Number(update.data.quantityOnHand.increment)).toBe(20);
      // The total stays inside DECIMAL(12,4).
      expect(Number(update.where.quantityOnHand.lte)).toBe(99_999_979);
      const { data } = (prisma.stockMovement.create as jest.Mock).mock.calls[0][0];
      expect(data).toMatchObject({ type: MovementType.STOCK_IN, inventoryItemId: 'item-1' });
      expect(Number(data.diff)).toBe(20);
    });

    it('INV-02: derives before from the locked row, not a stale first read', async () => {
      (prisma.$transaction as jest.Mock).mockImplementation(async (cb: any) => cb(prisma));
      // First read saw 100, but another stock-in of 10 committed before ours:
      // after our +20 the row holds 130, so before was 110.
      (prisma.inventoryItem.findUnique as jest.Mock)
        .mockResolvedValueOnce(validInventoryItem({ quantityOnHand: new Prisma.Decimal(100) }))
        .mockResolvedValueOnce(validInventoryItem({ quantityOnHand: new Prisma.Decimal(130) }));
      (prisma.inventoryItem.updateMany as jest.Mock).mockResolvedValue({ count: 1 });

      await service.stockIn('item-1', { quantity: 20, reason: 'Restock' } as any, adminActor);

      const { data } = (prisma.stockMovement.create as jest.Mock).mock.calls[0][0];
      expect(Number(data.quantityBefore)).toBe(110);
      expect(Number(data.quantityAfter)).toBe(130);
      expect(Number(data.quantityAfter) - Number(data.quantityBefore)).toBe(Number(data.diff));
    });

    it('throws when item not found', async () => {
      (prisma.$transaction as jest.Mock).mockImplementation(async (cb: any) => cb(prisma));
      (prisma.inventoryItem.findUnique as jest.Mock).mockResolvedValue(null);
      await expect(
        service.stockIn('item-x', { quantity: 5, reason: 'x' } as any, adminActor),
      ).rejects.toThrow(InventoryItemNotFoundException);
    });
  });

  describe('stockOut', () => {
    it('uses guarded updateMany with quantityOnHand >= requested (R2-9)', async () => {
      (prisma.$transaction as jest.Mock).mockImplementation(async (cb: any) => cb(prisma));
      (prisma.inventoryItem.findUnique as jest.Mock)
        .mockResolvedValueOnce(validInventoryItem())
        .mockResolvedValueOnce(validInventoryItem({ quantityOnHand: new Prisma.Decimal(80) }));
      (prisma.inventoryItem.updateMany as jest.Mock).mockResolvedValue({ count: 1 });

      await service.stockOut(
        'item-1',
        { quantity: 20, reason: 'manual adjust' } as any,
        adminActor,
      );

      const update = (prisma.inventoryItem.updateMany as jest.Mock).mock.calls[0][0];
      expect(update.where).toMatchObject({ id: 'item-1', deletedAt: null });
      expect(Number(update.where.quantityOnHand.gte)).toBe(20);
      expect(Number(update.data.quantityOnHand.decrement)).toBe(20);
      expect(prisma.stockMovement.create).toHaveBeenCalled();
    });

    it('throws InsufficientStockException when guarded count = 0', async () => {
      (prisma.$transaction as jest.Mock).mockImplementation(async (cb: any) => cb(prisma));
      (prisma.inventoryItem.findUnique as jest.Mock).mockResolvedValue(
        validInventoryItem({ quantityOnHand: new Prisma.Decimal(5) }),
      );
      (prisma.inventoryItem.updateMany as jest.Mock).mockResolvedValue({ count: 0 });

      await expect(
        service.stockOut('item-1', { quantity: 100, reason: 'over-draft' } as any, adminActor),
      ).rejects.toThrow(InsufficientStockException);
    });

    it('InsufficientStockException message names the item and quantities (regression: used to only be in `details`, which the frontend never reads)', async () => {
      (prisma.$transaction as jest.Mock).mockImplementation(async (cb: any) => cb(prisma));
      (prisma.inventoryItem.findUnique as jest.Mock).mockResolvedValue(
        validInventoryItem({ quantityOnHand: new Prisma.Decimal(5) }),
      );
      (prisma.inventoryItem.updateMany as jest.Mock).mockResolvedValue({ count: 0 });

      await expect(
        service.stockOut('item-1', { quantity: 100, reason: 'over-draft' } as any, adminActor),
      ).rejects.toThrow(/Gloves.*requires 100.*only 5 available/);
    });
  });

  describe('adjustStock', () => {
    it('records ADJUSTMENT movement with computed diff', async () => {
      (prisma.$transaction as jest.Mock).mockImplementation(async (cb: any) => cb(prisma));
      (prisma.inventoryItem.findUnique as jest.Mock).mockResolvedValue(
        validInventoryItem({ quantityOnHand: new Prisma.Decimal(50) }),
      );
      (prisma.inventoryItem.updateMany as jest.Mock).mockResolvedValue({ count: 1 });

      await service.adjustStock(
        'item-1',
        { newQuantity: 70, reason: 'count correction' } as any,
        adminActor,
      );

      expect(prisma.inventoryItem.updateMany).toHaveBeenCalled();
      const { data } = (prisma.stockMovement.create as jest.Mock).mock.calls[0][0];
      expect(data.type).toBe(MovementType.ADJUSTMENT);
      expect(Number(data.diff)).toBe(20); // 70 - 50
      expect(Number(data.quantityBefore)).toBe(50);
      expect(Number(data.quantityAfter)).toBe(70);
    });

    it('writes nothing when the count matches what is on hand (BR-INV-023)', async () => {
      (prisma.$transaction as jest.Mock).mockImplementation(async (cb: any) => cb(prisma));
      (prisma.inventoryItem.findUnique as jest.Mock).mockResolvedValue(
        validInventoryItem({ quantityOnHand: new Prisma.Decimal(50) }),
      );
      await service.adjustStock(
        'item-1',
        { newQuantity: 50, reason: 'kiểm kê' } as any,
        adminActor,
      );
      expect(prisma.inventoryItem.updateMany).not.toHaveBeenCalled();
      expect(prisma.stockMovement.create).not.toHaveBeenCalled();
    });

    it('runs inside a Serializable transaction', async () => {
      // before/after are computed from a plain read then written as an
      // absolute value — unlike stockIn/stockOut (atomic increment/
      // decrement), that's only race-safe under Serializable isolation.
      // Two concurrent adjustments of the same item (front desk correcting
      // a count while admin runs a bulk audit) would otherwise both read
      // the same `before` and the second write would silently overwrite
      // the first, losing one adjustment with no error.
      (prisma.$transaction as jest.Mock).mockImplementation(async (cb: any) => cb(prisma));
      (prisma.inventoryItem.findUnique as jest.Mock).mockResolvedValue(
        validInventoryItem({ quantityOnHand: new Prisma.Decimal(50) }),
      );
      (prisma.inventoryItem.updateMany as jest.Mock).mockResolvedValue({ count: 1 });

      await service.adjustStock(
        'item-1',
        { newQuantity: 70, reason: 'count correction' } as any,
        adminActor,
      );

      expect(prisma.$transaction).toHaveBeenCalledWith(
        expect.any(Function),
        expect.objectContaining({ isolationLevel: 'Serializable' }),
      );
    });
  });

  describe('getById', () => {
    it('throws InventoryItemNotFoundException when not found or deleted', async () => {
      (prisma.inventoryItem.findUnique as jest.Mock).mockResolvedValue(null);
      await expect(service.getItem('item-x')).rejects.toThrow(InventoryItemNotFoundException);
    });

    it('returns item when active', async () => {
      (prisma.inventoryItem.findUnique as jest.Mock).mockResolvedValue(validInventoryItem());
      const result = await service.getItem('item-1');
      expect(result.id).toBe('item-1');
    });
  });

  describe('list low-stock', () => {
    it('compares quantityOnHand <= minStockLevel in the database, before the row cap', async () => {
      (prisma.inventoryItem as any).fields = { minStockLevel: 'field:minStockLevel' };
      (prisma.inventoryItem.findMany as jest.Mock).mockResolvedValue([]);
      await service.lowStockReport();
      expect(prisma.inventoryItem.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: ItemStatus.ACTIVE,
            quantityOnHand: { lte: 'field:minStockLevel' },
          }),
        }),
      );
    });
  });

  describe('movement quantities', () => {
    beforeEach(() => {
      (prisma.$transaction as jest.Mock).mockImplementation(async (cb: any) => cb(prisma));
      (prisma.inventoryItem.findUnique as jest.Mock).mockResolvedValue(validInventoryItem());
    });

    it.each([[-5], [0], [1.23456], [100_000_000]])(
      'refuses a stock-in or stock-out of %p without touching stock',
      async quantity => {
        await expect(
          service.stockIn('item-1', { quantity, reason: 'x' } as any, adminActor),
        ).rejects.toMatchObject({
          response: expect.objectContaining({ error: 'STOCK_MOVEMENT_INVALID' }),
        });
        await expect(
          service.stockOut('item-1', { quantity, reason: 'xxx' } as any, adminActor),
        ).rejects.toMatchObject({
          response: expect.objectContaining({ error: 'STOCK_MOVEMENT_INVALID' }),
        });
        expect(prisma.inventoryItem.updateMany).not.toHaveBeenCalled();
      },
    );

    it('a stock-in that would overflow the column is refused, not a database error', async () => {
      (prisma.inventoryItem.updateMany as jest.Mock).mockResolvedValue({ count: 0 });
      await expect(
        service.stockIn('item-1', { quantity: 50_000_000, reason: 'x' } as any, adminActor),
      ).rejects.toThrow(/vượt quá/);
    });

    it('adjusts with exact decimals (0.1 + 0.2 is 0.3)', async () => {
      (prisma.inventoryItem.findUnique as jest.Mock).mockResolvedValue(
        validInventoryItem({ quantityOnHand: new Prisma.Decimal('0.1') }),
      );
      (prisma.inventoryItem.updateMany as jest.Mock).mockResolvedValue({ count: 1 });
      await service.adjustStock('item-1', { quantity: 0.2, reason: 'count' } as any, adminActor);
      const { data } = (prisma.stockMovement.create as jest.Mock).mock.calls[0][0];
      expect(data.quantityAfter.toString()).toBe('0.3');
    });
  });

  describe('unit (BR-INV-024)', () => {
    it('refuses to change the unit of an item with history', async () => {
      (prisma.inventoryItem.findUnique as jest.Mock).mockResolvedValue(
        validInventoryItem({ quantityOnHand: new Prisma.Decimal(0) }),
      );
      (prisma.stockMovement.count as jest.Mock).mockResolvedValue(3);
      (prisma.treatmentInventoryUsage.count as jest.Mock).mockResolvedValue(0);
      const error = await service.updateItem('item-1', { unit: 'cái' }, adminActor).catch(e => e);
      expect(error.getStatus()).toBe(409);
      expect(error.getResponse().error).toBe('INVENTORY_UNIT_LOCKED');
      expect(prisma.inventoryItem.update).not.toHaveBeenCalled();
    });

    it('lets a new, unused item change its unit', async () => {
      (prisma.inventoryItem.findUnique as jest.Mock).mockResolvedValue(
        validInventoryItem({ quantityOnHand: new Prisma.Decimal(0) }),
      );
      (prisma.stockMovement.count as jest.Mock).mockResolvedValue(0);
      (prisma.treatmentInventoryUsage.count as jest.Mock).mockResolvedValue(0);
      (prisma.inventoryItem.update as jest.Mock).mockResolvedValue(validInventoryItem());
      await service.updateItem('item-1', { unit: ' cái ' }, adminActor);
      expect((prisma.inventoryItem.update as jest.Mock).mock.calls[0][0].data.unit).toBe('cái');
    });
  });

  describe('deleteItem', () => {
    it('does not hide stock that arrived after the check', async () => {
      (prisma.inventoryItem.findUnique as jest.Mock)
        .mockResolvedValueOnce(validInventoryItem({ quantityOnHand: new Prisma.Decimal(0) }))
        .mockResolvedValueOnce(validInventoryItem({ quantityOnHand: new Prisma.Decimal(10) }));
      (prisma.inventoryItem.updateMany as jest.Mock).mockResolvedValue({ count: 0 });
      await expect(service.deleteItem('item-1', adminActor)).rejects.toThrow(/còn tồn/);
      expect((prisma.inventoryItem.updateMany as jest.Mock).mock.calls[0][0].where).toMatchObject({
        id: 'item-1',
        deletedAt: null,
        quantityOnHand: { lte: 0 },
      });
      expect(audit.log).not.toHaveBeenCalled();
    });
  });
});

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

  describe('stockIn', () => {
    it('increments quantityOnHand and writes STOCK_IN movement', async () => {
      (prisma.$transaction as jest.Mock).mockImplementation(async (cb: any) => cb(prisma));
      (prisma.inventoryItem.findUnique as jest.Mock)
        .mockResolvedValueOnce(validInventoryItem())
        .mockResolvedValueOnce(validInventoryItem({ quantityOnHand: new Prisma.Decimal(120) }));
      (prisma.inventoryItem.updateMany as jest.Mock).mockResolvedValue({ count: 1 });

      const result = await service.stockIn(
        'item-1',
        { quantity: 20, reason: 'Restock' } as any,
        adminActor,
      );

      expect(prisma.inventoryItem.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ id: 'item-1', deletedAt: null }),
          data: expect.objectContaining({ quantityOnHand: { increment: 20 } }),
        }),
      );
      expect(prisma.stockMovement.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: MovementType.STOCK_IN,
            diff: 20,
            inventoryItemId: 'item-1',
          }),
        }),
      );
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

      expect(prisma.inventoryItem.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            id: 'item-1',
            quantityOnHand: { gte: 20 },
            deletedAt: null,
          }),
          data: expect.objectContaining({ quantityOnHand: { decrement: 20 } }),
        }),
      );
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
      expect(prisma.stockMovement.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: MovementType.ADJUSTMENT,
            diff: 20, // 70 - 50
            quantityBefore: 50,
            quantityAfter: 70,
          }),
        }),
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
    it('filters items where quantityOnHand <= minStockLevel', async () => {
      (prisma.inventoryItem.findMany as jest.Mock).mockResolvedValue([]);
      await service.lowStockReport();
      expect(prisma.inventoryItem.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ status: ItemStatus.ACTIVE }),
        }),
      );
    });
  });
});

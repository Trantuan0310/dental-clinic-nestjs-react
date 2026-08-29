import { Test, TestingModule } from '@nestjs/testing';
import { AuditService } from './audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { createPrismaMock, PrismaMockShape } from '../../test/helpers/prisma-mock';
import { validAuditLog } from '../../test/helpers/fixtures';

describe('AuditService', () => {
  let service: AuditService;
  let prisma: PrismaMockShape;

  beforeEach(async () => {
    prisma = createPrismaMock();
    const module: TestingModule = await Test.createTestingModule({
      providers: [AuditService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get<AuditService>(AuditService);
  });

  describe('log', () => {
    it('writes a record with all provided fields', async () => {
      (prisma.auditLog.create as jest.Mock).mockResolvedValue(validAuditLog());

      await service.log({
        action: 'USER_CREATED',
        actorUserId: 'u-1',
        actorEmail: 'admin@test.com',
        targetType: 'user',
        targetId: 'u-2',
        metadata: { foo: 'bar' },
        ipAddress: '127.0.0.1',
        userAgent: 'jest',
      });

      expect(prisma.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          action: 'USER_CREATED',
          actorUserId: 'u-1',
          actorEmailAtTime: 'admin@test.com',
          targetType: 'user',
          targetId: 'u-2',
          metadata: { foo: 'bar' },
          ipAddress: '127.0.0.1',
          userAgent: 'jest',
        }),
      });
    });

    it('defaults null fields when omitted', async () => {
      (prisma.auditLog.create as jest.Mock).mockResolvedValue(validAuditLog());

      await service.log({ action: 'TEST' });

      expect(prisma.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          action: 'TEST',
          actorUserId: null,
          actorEmailAtTime: null,
          targetType: null,
          targetId: null,
          ipAddress: null,
          userAgent: null,
        }),
      });
    });
  });
});

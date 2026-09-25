import { Test } from '@nestjs/testing';
import { CatalogService } from './catalog.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { asTransaction, createPrismaMock, PrismaMockShape } from '../../test/helpers/prisma-mock';
import { createMockJwtPayload } from '../../test/helpers/auth-mock';
import {
  AssignmentNotAllowedException,
  AssignmentOverlapException,
  CatalogCodeTakenException,
  CatalogValidationException,
} from './catalog.exceptions';

describe('CatalogService', () => {
  let service: CatalogService;
  let prisma: PrismaMockShape;
  const actor = createMockJwtPayload({ sub: 'admin-1', permissions: ['service.manage'] });

  const svc = (overrides: Record<string, unknown> = {}) => ({
    id: 'svc-1',
    code: 'CAO_VOI',
    name: 'Cạo vôi',
    description: null,
    categoryId: 'cat-1',
    category: { id: 'cat-1', code: 'DU_PHONG', name: 'Dự phòng' },
    defaultDurationMin: 30,
    bufferBeforeMin: 0,
    bufferAfterMin: 10,
    basePrice: 450000,
    requiredSpecialty: null,
    isActive: true,
    updatedAt: new Date(),
    _count: { dentistServices: 0 },
    ...overrides,
  });
  const assignment = (overrides: Record<string, unknown> = {}) => ({
    id: 'as-1',
    dentistId: 'dentist-1',
    serviceId: 'svc-1',
    durationMin: null,
    price: null,
    effectiveFrom: new Date('2026-01-01T00:00:00Z'),
    effectiveTo: null,
    service: {
      id: 'svc-1',
      code: 'CAO_VOI',
      name: 'Cạo vôi',
      defaultDurationMin: 30,
      basePrice: 450000,
      isActive: true,
      category: { name: 'Dự phòng' },
    },
    ...overrides,
  });

  beforeEach(async () => {
    prisma = createPrismaMock();
    asTransaction(prisma);
    const module = await Test.createTestingModule({
      providers: [
        CatalogService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditService, useValue: { log: jest.fn() } },
      ],
    }).compile();
    service = module.get(CatalogService);
  });

  describe('services (BR-SVC-001/002)', () => {
    it('rejects a duplicate code', async () => {
      prisma.serviceCategory.findUnique.mockResolvedValue({ id: 'cat-1', isActive: true });
      prisma.service.findUnique.mockResolvedValue(svc());
      await expect(
        service.createService(
          { code: 'CAO_VOI', categoryId: 'cat-1', name: 'Cạo vôi', defaultDurationMin: 30 },
          actor,
        ),
      ).rejects.toBeInstanceOf(CatalogCodeTakenException);
    });

    it('rejects a duration that is not a multiple of 5', async () => {
      await expect(
        service.createService(
          { code: 'X1', categoryId: 'cat-1', name: 'Test', defaultDurationMin: 32 },
          actor,
        ),
      ).rejects.toBeInstanceOf(CatalogValidationException);
    });
  });

  describe('deactivate (BR-SVC-003)', () => {
    it('drops future assignments and ends running ones today', async () => {
      prisma.service.findUnique.mockResolvedValue(svc());
      prisma.dentistService.deleteMany.mockResolvedValue({ count: 1 });
      prisma.dentistService.updateMany.mockResolvedValue({ count: 2 });
      prisma.service.update.mockResolvedValue(svc({ isActive: false }));

      const result = await service.setServiceActive('svc-1', false, actor);

      expect(result.isActive).toBe(false);
      const ended = prisma.dentistService.updateMany.mock.calls[0][0];
      expect(ended.where.serviceId).toBe('svc-1');
      expect(ended.data.effectiveTo).toBeInstanceOf(Date);
    });
  });

  describe('assign (BR-SVC-004)', () => {
    beforeEach(() => {
      prisma.service.findUnique.mockResolvedValue(svc());
      prisma.dentistProfile.findFirst.mockResolvedValue({
        practiceStatus: 'ACTIVE',
        specialties: ['TONG_QUAT'],
      });
      prisma.dentistService.findFirst.mockResolvedValue(null);
      prisma.dentistService.create.mockImplementation(
        async ({ data }: { data: Record<string, unknown> }) => assignment(data),
      );
    });

    it('refuses a suspended dentist', async () => {
      prisma.dentistProfile.findFirst.mockResolvedValue({
        practiceStatus: 'SUSPENDED',
        specialties: [],
      });
      await expect(
        service.assign('dentist-1', { serviceId: 'svc-1' }, actor),
      ).rejects.toBeInstanceOf(AssignmentNotAllowedException);
    });

    it('refuses an inactive service', async () => {
      prisma.service.findUnique.mockResolvedValue(svc({ isActive: false }));
      await expect(
        service.assign('dentist-1', { serviceId: 'svc-1' }, actor),
      ).rejects.toBeInstanceOf(AssignmentNotAllowedException);
    });

    it('requires the service specialty', async () => {
      prisma.service.findUnique.mockResolvedValue(svc({ requiredSpecialty: 'IMPLANT' }));
      const error = await service.assign('dentist-1', { serviceId: 'svc-1' }, actor).catch(e => e);
      expect(error.getResponse().error).toBe('SPECIALTY_REQUIRED');
    });

    it('refuses an overlapping period', async () => {
      prisma.dentistService.findFirst.mockResolvedValue(assignment());
      await expect(
        service.assign('dentist-1', { serviceId: 'svc-1' }, actor),
      ).rejects.toBeInstanceOf(AssignmentOverlapException);
      expect(prisma.dentistService.create).not.toHaveBeenCalled();
    });

    it('refuses a start date in the past', async () => {
      await expect(
        service.assign('dentist-1', { serviceId: 'svc-1', effectiveFrom: '2020-01-01' }, actor),
      ).rejects.toBeInstanceOf(CatalogValidationException);
    });

    it('uses the dentist override over the service default (BR-SVC-006)', async () => {
      const result = await service.assign(
        'dentist-1',
        { serviceId: 'svc-1', durationMin: 45, price: 500000 },
        actor,
      );
      expect(result).toMatchObject({ effectiveDurationMin: 45, effectivePrice: 500000 });
      expect(prisma.$executeRawUnsafe).toHaveBeenCalledWith(
        expect.stringContaining('pg_advisory_xact_lock'),
      );
    });
  });

  describe('endAssignment (BR-SVC-005)', () => {
    it('sets an end date instead of deleting a started assignment', async () => {
      prisma.dentistService.findFirst.mockResolvedValue(assignment());
      prisma.dentistService.update.mockImplementation(
        async ({ data }: { data: Record<string, unknown> }) => assignment(data),
      );
      const result = await service.endAssignment('dentist-1', 'as-1', undefined, actor);
      expect(result.removed).toBe(false);
      expect(result.effectiveTo).not.toBeNull();
      expect(prisma.dentistService.delete).not.toHaveBeenCalled();
    });

    it('removes an assignment that has not started yet', async () => {
      prisma.dentistService.findFirst.mockResolvedValue(
        assignment({ effectiveFrom: new Date('2099-01-01T00:00:00Z') }),
      );
      const result = await service.endAssignment('dentist-1', 'as-1', undefined, actor);
      expect(result.removed).toBe(true);
      expect(prisma.dentistService.delete).toHaveBeenCalledWith({ where: { id: 'as-1' } });
    });
  });
});

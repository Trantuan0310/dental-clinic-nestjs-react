import { NotFoundException } from '@nestjs/common';
import { ServicesService } from './services.service';

describe('ServicesService', () => {
  const actor = { sub: 'manager-1', email: 'manager@example.test', permissions: [] };
  const prisma: any = { clinicService: { findMany: jest.fn(), findUnique: jest.fn(), create: jest.fn(), update: jest.fn() } };
  const audit: any = { log: jest.fn() };
  const service = new ServicesService(prisma, audit);

  beforeEach(() => jest.clearAllMocks());

  it('hides inactive services from read-only callers', async () => {
    prisma.clinicService.findMany.mockResolvedValue([]);
    await service.list(false);
    expect(prisma.clinicService.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { isActive: true } }));
  });

  it('includes inactive services for clinic managers', async () => {
    prisma.clinicService.findMany.mockResolvedValue([]);
    await service.list(true);
    expect(prisma.clinicService.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: {} }));
  });

  it('normalizes service codes and records an audit event on create', async () => {
    prisma.clinicService.create.mockResolvedValue({ id: 'service-1', code: 'CLEAN-01', name: 'Vệ sinh răng' });
    await service.create({ code: 'clean-01', name: 'Vệ sinh răng', category: 'Điều trị', durationMinutes: 30, basePrice: 100000, requiresConsultation: false }, actor as any);
    expect(prisma.clinicService.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ code: 'CLEAN-01' }) }));
    expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'CLINIC_SERVICE_CREATED', targetId: 'service-1' }));
  });

  it('keeps the catalogue row and returns not found for an unknown update', async () => {
    prisma.clinicService.findUnique.mockResolvedValue(null);
    await expect(service.update('missing', { isActive: false }, actor as any)).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.clinicService.update).not.toHaveBeenCalled();
  });
});

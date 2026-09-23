import { BadRequestException, NotFoundException } from '@nestjs/common';
import { DoctorsService } from './doctors.service';

describe('DoctorsService', () => {
  const actor = { sub: 'manager-1', email: 'manager@example.test', permissions: [] };
  const prisma: any = {
    user: { findMany: jest.fn(), findFirst: jest.fn() },
    clinicService: { findMany: jest.fn() },
    $transaction: jest.fn(),
  };
  const audit: any = { log: jest.fn() };
  const service = new DoctorsService(prisma, audit);

  beforeEach(() => jest.clearAllMocks());

  it('limits non-manager doctor lookup to profiles accepting new appointments', async () => {
    prisma.user.findMany.mockResolvedValue([]);
    await service.list(false);
    expect(prisma.user.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ doctorProfile: { is: { acceptingAppointments: true } } }),
    }));
  });

  it('does not create a profile for a non-active or non-dentist account', async () => {
    prisma.user.findFirst.mockResolvedValue(null);
    await expect(service.updateProfile('user-1', {
      specialty: 'Chỉnh nha', yearsExperience: 5, acceptingAppointments: true,
    } as any, actor)).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('rejects assignments to inactive or missing services', async () => {
    prisma.user.findFirst.mockResolvedValue({ id: 'doctor-1' });
    prisma.clinicService.findMany.mockResolvedValue([]);
    await expect(service.updateProfile('doctor-1', {
      specialty: 'Chỉnh nha', yearsExperience: 5, acceptingAppointments: true, serviceIds: ['service-1'],
    } as any, actor)).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});

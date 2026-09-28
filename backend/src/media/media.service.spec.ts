import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { MediaService } from './media.service';

const jpeg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(20)]);
const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.alloc(20),
]);
const file = (buffer: Buffer, mimetype = 'image/jpeg') => ({
  buffer,
  mimetype,
  size: buffer.length,
});
const admin = {
  sub: 'admin-1',
  email: 'a@x',
  permissions: ['site_media.manage', 'dentist.update'],
} as any;
const dentistSelf = { sub: 'dentist-1', email: 'd@x', permissions: ['dentist.update.own'] } as any;

describe('MediaService', () => {
  let prisma: any;
  let service: MediaService;

  beforeEach(() => {
    const tx = {
      mediaAsset: {
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
        count: jest.fn().mockResolvedValue(0),
        create: jest.fn(({ data }: any) => Promise.resolve({ id: 'new-id', ...data })),
      },
    };
    prisma = {
      tx,
      mediaAsset: {
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn(),
        delete: jest.fn().mockResolvedValue({}),
      },
      dentistProfile: { findUnique: jest.fn().mockResolvedValue({ userId: 'dentist-1' }) },
      $transaction: jest.fn((fn: any) => fn(tx)),
    };
    service = new MediaService(prisma, { log: jest.fn().mockResolvedValue(undefined) } as any);
  });

  it('groups hero, gallery and dentist portraits for the landing page', async () => {
    prisma.mediaAsset.findMany.mockResolvedValue([
      { id: 'h', purpose: 'CLINIC_HERO', dentistId: null, caption: null },
      { id: 'g1', purpose: 'CLINIC_GALLERY', dentistId: null, caption: 'Phòng chờ' },
      { id: 'p1', purpose: 'DENTIST_PHOTO', dentistId: 'dentist-1', caption: null },
    ]);
    await expect(service.site()).resolves.toEqual({
      hero: { id: 'h', caption: null },
      gallery: [{ id: 'g1', caption: 'Phòng chờ' }],
      dentists: { 'dentist-1': 'p1' },
    });
  });

  it('replaces the previous hero picture', async () => {
    await service.uploadClinic('CLINIC_HERO', file(jpeg), undefined, admin);
    expect(prisma.tx.mediaAsset.deleteMany).toHaveBeenCalledWith({
      where: { purpose: 'CLINIC_HERO' },
    });
    expect(prisma.tx.mediaAsset.create.mock.calls[0][0].data).toMatchObject({
      purpose: 'CLINIC_HERO',
      mimeType: 'image/jpeg',
      byteSize: jpeg.length,
    });
  });

  it('rejects a file whose content is not the image type it claims', async () => {
    await expect(
      service.uploadClinic(
        'CLINIC_GALLERY',
        file(Buffer.from('<svg onload=alert(1)>'), 'image/png'),
        undefined,
        admin,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.uploadClinic('CLINIC_GALLERY', file(png, 'image/jpeg'), undefined, admin),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.uploadClinic('CLINIC_GALLERY', undefined, undefined, admin),
    ).rejects.toThrow('Chưa chọn ảnh');
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('caps the gallery', async () => {
    prisma.tx.mediaAsset.count.mockResolvedValue(12);
    await expect(
      service.uploadClinic('CLINIC_GALLERY', file(png, 'image/png'), 'x', admin),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('lets a dentist change only their own portrait', async () => {
    await expect(
      service.uploadDentistPhoto('dentist-1', file(jpeg), dentistSelf),
    ).resolves.toMatchObject({
      id: 'new-id',
    });
    expect(prisma.tx.mediaAsset.deleteMany).toHaveBeenCalledWith({
      where: { purpose: 'DENTIST_PHOTO', dentistId: 'dentist-1' },
    });
    await expect(
      service.uploadDentistPhoto('dentist-2', file(jpeg), dentistSelf),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('only site_media.manage may delete clinic photos', async () => {
    prisma.mediaAsset.findUnique.mockResolvedValue({ purpose: 'CLINIC_GALLERY', dentistId: null });
    await expect(service.remove('g1', dentistSelf)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.remove('g1', admin)).resolves.toEqual({ id: 'g1' });
    expect(prisma.mediaAsset.delete).toHaveBeenCalledWith({ where: { id: 'g1' } });
  });
});

import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { JwtPayload } from '../common/guards/permissions.guard';

export const MEDIA_MAX_BYTES = 3 * 1024 * 1024;
export const GALLERY_MAX = 12;

export type ClinicPurpose = 'CLINIC_HERO' | 'CLINIC_GALLERY';
export type MediaFile = { buffer: Buffer; mimetype: string; size: number };

/** First bytes of each accepted format; the declared type must match them. */
const SIGNATURES: Record<string, (b: Buffer) => boolean> = {
  'image/jpeg': b => b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  'image/png': b =>
    b.length > 8 &&
    b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  'image/webp': b =>
    b.length > 12 &&
    b.subarray(0, 4).toString('ascii') === 'RIFF' &&
    b.subarray(8, 12).toString('ascii') === 'WEBP',
};

const PUBLIC_FIELDS = { id: true, purpose: true, dentistId: true, caption: true } as const;

/**
 * Home page photos: the clinic's hero picture, a gallery, and one portrait
 * per dentist. Everything stored here is public by design (served to the
 * landing page without a login), so only photos meant for patients belong.
 */
@Injectable()
export class MediaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** What the landing page shows. */
  async site() {
    const rows = await this.prisma.mediaAsset.findMany({
      select: PUBLIC_FIELDS,
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
    const strip = (r: (typeof rows)[number]) => ({ id: r.id, caption: r.caption });
    const hero = rows.find(r => r.purpose === 'CLINIC_HERO');
    return {
      hero: hero ? strip(hero) : null,
      gallery: rows.filter(r => r.purpose === 'CLINIC_GALLERY').map(strip),
      dentists: Object.fromEntries(
        rows.filter(r => r.purpose === 'DENTIST_PHOTO').map(r => [r.dentistId!, r.id]),
      ) as Record<string, string>,
    };
  }

  async file(id: string) {
    const row = await this.prisma.mediaAsset.findUnique({
      where: { id },
      select: { mimeType: true, bytes: true },
    });
    if (!row) throw new NotFoundException('Không tìm thấy ảnh');
    return { mimeType: row.mimeType, bytes: Buffer.from(row.bytes) };
  }

  async uploadClinic(
    purpose: ClinicPurpose,
    file: MediaFile | undefined,
    caption: string | undefined,
    actor: JwtPayload,
  ) {
    const image = this.check(file);
    const data = {
      purpose,
      mimeType: image.mimetype,
      bytes: image.buffer,
      byteSize: image.buffer.length,
      caption: caption?.trim().slice(0, 200) || null,
      createdBy: actor.sub,
    };
    const created = await this.prisma.$transaction(async tx => {
      if (purpose === 'CLINIC_HERO') {
        await tx.mediaAsset.deleteMany({ where: { purpose: 'CLINIC_HERO' } });
      } else {
        const count = await tx.mediaAsset.count({ where: { purpose: 'CLINIC_GALLERY' } });
        if (count >= GALLERY_MAX)
          throw new ConflictException(`Tối đa ${GALLERY_MAX} ảnh; xóa bớt ảnh cũ trước khi thêm`);
        (data as { sortOrder?: number }).sortOrder = count;
      }
      return tx.mediaAsset.create({ data, select: PUBLIC_FIELDS });
    });
    await this.log('MEDIA_UPLOADED', actor, created.id, { purpose });
    return created;
  }

  async uploadDentistPhoto(dentistId: string, file: MediaFile | undefined, actor: JwtPayload) {
    this.assertCanEditDentist(dentistId, actor);
    const image = this.check(file);
    const dentist = await this.prisma.dentistProfile.findUnique({
      where: { userId: dentistId },
      select: { userId: true },
    });
    if (!dentist) throw new NotFoundException('Không tìm thấy hồ sơ bác sĩ');
    const created = await this.prisma.$transaction(async tx => {
      await tx.mediaAsset.deleteMany({ where: { purpose: 'DENTIST_PHOTO', dentistId } });
      return tx.mediaAsset.create({
        data: {
          purpose: 'DENTIST_PHOTO',
          dentistId,
          mimeType: image.mimetype,
          bytes: image.buffer,
          byteSize: image.buffer.length,
          createdBy: actor.sub,
        },
        select: PUBLIC_FIELDS,
      });
    });
    await this.log('MEDIA_UPLOADED', actor, created.id, { purpose: 'DENTIST_PHOTO', dentistId });
    return created;
  }

  async remove(id: string, actor: JwtPayload) {
    const row = await this.prisma.mediaAsset.findUnique({
      where: { id },
      select: { purpose: true, dentistId: true },
    });
    if (!row) throw new NotFoundException('Không tìm thấy ảnh');
    if (row.purpose === 'DENTIST_PHOTO') this.assertCanEditDentist(row.dentistId!, actor);
    else if (!actor.permissions.includes('site_media.manage'))
      throw new ForbiddenException('Bạn không có quyền xóa ảnh phòng khám');
    await this.prisma.mediaAsset.delete({ where: { id } });
    await this.log('MEDIA_DELETED', actor, id, { purpose: row.purpose });
    return { id };
  }

  private check(file: MediaFile | undefined) {
    if (!file?.buffer?.length) throw new BadRequestException('Chưa chọn ảnh');
    if (file.buffer.length > MEDIA_MAX_BYTES)
      throw new BadRequestException('Ảnh quá lớn (tối đa 3 MB)');
    const matches = SIGNATURES[file.mimetype];
    if (!matches || !matches(file.buffer))
      throw new BadRequestException('Chỉ nhận ảnh JPG, PNG hoặc WebP');
    return file;
  }

  private assertCanEditDentist(dentistId: string, actor: JwtPayload) {
    const any = actor.permissions.includes('dentist.update');
    const own = actor.permissions.includes('dentist.update.own') && actor.sub === dentistId;
    if (!any && !own) throw new ForbiddenException('Bạn không có quyền sửa ảnh của bác sĩ này');
  }

  private log(
    action: string,
    actor: JwtPayload,
    targetId: string,
    metadata: Record<string, unknown>,
  ) {
    return this.audit.log({
      action,
      actorUserId: actor.sub,
      actorEmail: actor.email,
      targetType: 'media_asset',
      targetId,
      metadata,
    });
  }
}

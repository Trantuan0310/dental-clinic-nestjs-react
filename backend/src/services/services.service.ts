import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { JwtPayload } from '../common/guards/permissions.guard';
import { PrismaService } from '../prisma/prisma.service';
import { CreateClinicServiceDto, UpdateClinicServiceDto } from './dto/service.dto';

@Injectable()
export class ServicesService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService) {}

  async list(includeInactive = false) {
    return this.prisma.clinicService.findMany({
      where: includeInactive ? {} : { isActive: true },
      orderBy: [{ category: 'asc' }, { name: 'asc' }],
      include: {
        dentists: {
          where: { doctor: { status: 'ACTIVE', deletedAt: null } },
          select: { doctor: { select: { id: true, fullName: true } } },
        },
      },
    });
  }

  async create(dto: CreateClinicServiceDto, actor: JwtPayload) {
    try {
      const service = await this.prisma.clinicService.create({
        data: {
          code: dto.code.trim().toUpperCase(),
          name: dto.name.trim(),
          category: dto.category.trim(),
          description: dto.description?.trim() || null,
          durationMinutes: dto.durationMinutes,
          basePrice: new Prisma.Decimal(dto.basePrice),
          requiresConsultation: dto.requiresConsultation,
        },
      });
      await this.audit.log({
        action: 'CLINIC_SERVICE_CREATED', actorUserId: actor.sub, actorEmail: actor.email,
        targetType: 'clinic_service', targetId: service.id,
        metadata: { code: service.code, name: service.name },
      });
      return { data: service };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('Mã dịch vụ đã tồn tại');
      }
      throw error;
    }
  }

  async update(id: string, dto: UpdateClinicServiceDto, actor: JwtPayload) {
    const existing = await this.prisma.clinicService.findUnique({ where: { id }, select: { id: true } });
    if (!existing) throw new NotFoundException('Không tìm thấy dịch vụ');

    const data: Prisma.ClinicServiceUpdateInput = {
      ...(dto.code !== undefined ? { code: dto.code.trim().toUpperCase() } : {}),
      ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
      ...(dto.category !== undefined ? { category: dto.category.trim() } : {}),
      ...(dto.description !== undefined ? { description: dto.description?.trim() || null } : {}),
      ...(dto.durationMinutes !== undefined ? { durationMinutes: dto.durationMinutes } : {}),
      ...(dto.basePrice !== undefined ? { basePrice: new Prisma.Decimal(dto.basePrice) } : {}),
      ...(dto.requiresConsultation !== undefined ? { requiresConsultation: dto.requiresConsultation } : {}),
      ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
    };
    try {
      const service = await this.prisma.clinicService.update({ where: { id }, data });
      await this.audit.log({
        action: dto.isActive === false ? 'CLINIC_SERVICE_DEACTIVATED' : 'CLINIC_SERVICE_UPDATED',
        actorUserId: actor.sub, actorEmail: actor.email,
        targetType: 'clinic_service', targetId: id,
        metadata: { fields: Object.keys(dto) },
      });
      return { data: service };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('Mã dịch vụ đã tồn tại');
      }
      throw error;
    }
  }
}

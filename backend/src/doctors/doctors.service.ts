import { ConflictException, Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { JwtPayload } from '../common/guards/permissions.guard';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateDoctorProfileDto } from './dto/doctor.dto';

@Injectable()
export class DoctorsService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService) {}

  async list(includeUnavailable = false) {
    return this.prisma.user.findMany({
      where: {
        status: 'ACTIVE',
        deletedAt: null,
        userRoles: { some: { role: { code: 'dentist' } } },
        ...(!includeUnavailable ? { doctorProfile: { is: { acceptingAppointments: true } } } : {}),
      },
      orderBy: { fullName: 'asc' },
      select: {
        id: true,
        email: true,
        fullName: true,
        doctorProfile: true,
        doctorServices: {
          select: { service: { select: { id: true, code: true, name: true, isActive: true } } },
        },
      },
    });
  }

  async updateProfile(doctorId: string, dto: UpdateDoctorProfileDto, actor: JwtPayload) {
    const doctor = await this.prisma.user.findFirst({
      where: {
        id: doctorId,
        status: 'ACTIVE',
        deletedAt: null,
        userRoles: { some: { role: { code: 'dentist' } } },
      },
      select: { id: true },
    });
    if (!doctor) throw new NotFoundException('Không tìm thấy tài khoản bác sĩ đang hoạt động');

    const serviceIds = [...new Set(dto.serviceIds ?? [])];
    if (serviceIds.length) {
      const services = await this.prisma.clinicService.findMany({
        where: { id: { in: serviceIds }, isActive: true },
        select: { id: true },
      });
      if (services.length !== serviceIds.length) {
        throw new BadRequestException('Danh sách dịch vụ có mục không tồn tại hoặc đã ngừng hoạt động');
      }
    }

    try {
      const profile = await this.prisma.$transaction(async tx => {
        await tx.doctorProfile.upsert({
          where: { userId: doctorId },
          create: {
            userId: doctorId,
            phone: dto.phone?.trim() || null,
            specialty: dto.specialty.trim(),
            licenseNumber: dto.licenseNumber?.trim() || null,
            qualifications: dto.qualifications?.trim() || null,
            yearsExperience: dto.yearsExperience,
            biography: dto.biography?.trim() || null,
            acceptingAppointments: dto.acceptingAppointments,
          },
          update: {
            phone: dto.phone?.trim() || null,
            specialty: dto.specialty.trim(),
            licenseNumber: dto.licenseNumber?.trim() || null,
            qualifications: dto.qualifications?.trim() || null,
            yearsExperience: dto.yearsExperience,
            biography: dto.biography?.trim() || null,
            acceptingAppointments: dto.acceptingAppointments,
          },
        });
        await tx.doctorService.deleteMany({ where: { doctorId } });
        if (serviceIds.length) {
          await tx.doctorService.createMany({ data: serviceIds.map(serviceId => ({ doctorId, serviceId })) });
        }
        return tx.user.findUniqueOrThrow({
          where: { id: doctorId },
          select: {
            id: true,
            fullName: true,
            email: true,
            doctorProfile: true,
            doctorServices: { select: { service: { select: { id: true, code: true, name: true, isActive: true } } } },
          },
        });
      });

      await this.audit.log({
        action: 'DOCTOR_PROFILE_UPDATED',
        actorUserId: actor.sub,
        actorEmail: actor.email,
        targetType: 'doctor_profile',
        targetId: doctorId,
        metadata: { serviceIds, acceptingAppointments: dto.acceptingAppointments },
      });
      return { data: profile };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('Số giấy phép hành nghề này đã được sử dụng');
      }
      throw error;
    }
  }
}

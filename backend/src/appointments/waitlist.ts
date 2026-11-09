import {
  BadRequestException,
  ConflictException,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Body,
  UseGuards,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AvailabilityService } from './availability.service';
import { z } from 'zod';
import { PrismaService } from '../prisma/prisma.service';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { User } from '../common/decorators/user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { JwtPayload, PermissionsGuard } from '../common/guards/permissions.guard';
import { assertClinicWide } from '../common/row-scope';
import { clinicDateOnly, CLINIC_UTC_OFFSET_MS } from '../common/date-range.util';

const date = z.string().date();
const input = z
  .object({
    patientId: z.string().uuid(),
    serviceId: z.string().uuid(),
    dentistId: z.string().uuid().nullable(),
    fromDate: date,
    toDate: date,
    period: z.enum(['ANY', 'AM', 'PM']),
    note: z.string().trim().max(500),
  })
  .strict();
const include = {
  patient: { select: { id: true, fullName: true } },
  service: { select: { id: true, name: true } },
  dentist: { select: { id: true, fullName: true } },
};
export function waitlistMatch(
  dentistId: string,
  services: string[],
  start: Date,
): Prisma.WaitlistEntryWhereInput {
  const day = new Date(clinicDateOnly(start));
  const period = new Date(+start + CLINIC_UTC_OFFSET_MS).getUTCHours() < 12 ? 'AM' : 'PM';
  return {
    status: 'WAITING',
    patient: { deletedAt: null },
    serviceId: { in: services },
    OR: [{ dentistId: null }, { dentistId }],
    fromDate: { lte: day },
    toDate: { gte: day },
    period: { in: ['ANY', period] },
  };
}
export function remainingSlot(start: Date, end: Date, now = new Date()) {
  const available = new Date(Math.max(+start, Math.ceil((+now + 60001) / 300000) * 300000));
  return available < end ? available : null;
}
@Controller('waitlist')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermissions('appointment.create')
export class WaitlistController {
  constructor(
    private db: PrismaService,
    private availability: AvailabilityService,
  ) {}
  @Get()
  async list(
    @User() actor: JwtPayload,
    @Query('dentistId') dentistId?: string,
    @Query('serviceId') serviceId?: string,
    @Query('startAt') startAt?: string,
    @Query('opening') opening?: string,
  ) {
    assertClinicWide(actor, 'appointment', 'patient');
    let where: Prisma.WaitlistEntryWhereInput = { status: 'WAITING', patient: { deletedAt: null } };
    let slot: null | { startAt: Date; dentistId: string } = null;
    if (opening) {
      if (!z.string().uuid().safeParse(opening).success) throw new BadRequestException();
      const a = await this.db.appointment.findFirst({
        where: { id: opening, deletedAt: null, status: { in: ['CANCELLED', 'NO_SHOW'] } },
        include: { services: true },
      });
      const start = a && remainingSlot(a.startAt, a.endAt);
      if (!a || !start) return { data: [], slot: null };
      where = waitlistMatch(
        a.dentistId,
        await this.availability.waitlistServices(
          a.dentistId,
          a.services.map(s => s.serviceId),
          start,
          a.endAt,
        ),
        start,
      );
      slot = { startAt: start, dentistId: a.dentistId };
    } else if (dentistId || serviceId || startAt) {
      const query = z
        .object({
          dentistId: z.string().uuid(),
          serviceId: z.string().uuid(),
          startAt: z.string().datetime({ offset: true }),
        })
        .safeParse({ dentistId, serviceId, startAt });
      if (!query.success) throw new BadRequestException('Khung giờ không hợp lệ');
      const start = new Date(query.data.startAt);
      if (start <= new Date()) throw new BadRequestException('Chọn giờ trong tương lai');
      where = waitlistMatch(
        query.data.dentistId,
        await this.availability.waitlistServices(
          query.data.dentistId,
          [query.data.serviceId],
          start,
        ),
        start,
      );
      slot = { startAt: start, dentistId: query.data.dentistId };
    }
    return {
      data: await this.db.waitlistEntry.findMany({ where, include, orderBy: { createdAt: 'asc' } }),
      slot,
    };
  }
  private async values(body: unknown) {
    const r = input.safeParse(body);
    if (!r.success || r.data.fromDate > r.data.toDate || r.data.toDate < clinicDateOnly())
      throw new BadRequestException('Thông tin hoặc khoảng ngày không hợp lệ');
    const v = r.data;
    const [p, s, d] = await Promise.all([
      this.db.patient.findFirst({ where: { id: v.patientId, deletedAt: null } }),
      this.db.service.findFirst({ where: { id: v.serviceId, isActive: true } }),
      v.dentistId
        ? this.db.user.findFirst({
            where: {
              id: v.dentistId,
              deletedAt: null,
              status: 'ACTIVE',
              userRoles: { some: { role: { code: 'dentist' } } },
            },
          })
        : true,
    ]);
    if (!p || !s || !d) throw new NotFoundException();
    return { ...v, fromDate: new Date(v.fromDate), toDate: new Date(v.toDate) };
  }
  @Post() async create(@Body() body: unknown, @User() actor: JwtPayload) {
    assertClinicWide(actor, 'appointment', 'patient');
    return { data: await this.db.waitlistEntry.create({ data: await this.values(body) }) };
  }
  @Patch(':id') async edit(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
    @User() actor: JwtPayload,
  ) {
    assertClinicWide(actor, 'appointment', 'patient');
    const result = await this.db.waitlistEntry.updateMany({
      where: { id, status: 'WAITING' },
      data: await this.values(body),
    });
    if (!result.count) throw new ConflictException('Yêu cầu đã được xử lý');
    return { data: { id } };
  }
  @Delete(':id') async remove(@Param('id', ParseUUIDPipe) id: string, @User() actor: JwtPayload) {
    assertClinicWide(actor, 'appointment', 'patient');
    const result = await this.db.waitlistEntry.updateMany({
      where: { id, status: 'WAITING' },
      data: { status: 'REMOVED' },
    });
    if (!result.count) throw new ConflictException('Yêu cầu đã được xử lý');
    return { data: { id } };
  }
}

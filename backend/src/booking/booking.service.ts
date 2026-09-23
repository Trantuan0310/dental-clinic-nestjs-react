import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { BookingRequestStatus, Gender } from '@prisma/client';
import { createHash, randomBytes, timingSafeEqual } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { AppointmentsService } from '../appointments/appointments.service';
import { PatientsService } from '../patients/patients.service';
import { CreatePatientDto } from '../patients/dto/patient.dto';
import { JwtPayload } from '../common/guards/permissions.guard';
import { clinicDateOnly, CLINIC_UTC_OFFSET_MS } from '../common/date-range.util';
import {
  isMinor,
  isValidDob,
  isValidEmail,
  isValidVnPhone,
} from '../patients/domain/patient-rules';
import { AuditService } from '../audit/audit.service';
import { EmailService } from '../common/services/email.service';
import {
  BookingRequestMessageDto,
  CreatePublicBookingRequestDto,
  ListBookingRequestsDto,
  ProposeBookingTimeDto,
  PublicSlotsQueryDto,
  UpdatePublicBookingDetailsDto,
} from './dto/booking.dto';

const ACTIVE: BookingRequestStatus[] = [
  'PENDING_REVIEW',
  'NEEDS_INFORMATION',
  'PROPOSED',
  'PATIENT_ACCEPTED',
];

@Injectable()
export class BookingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly appointments: AppointmentsService,
    private readonly patients: PatientsService,
    private readonly audit: AuditService,
    private readonly email: EmailService,
  ) {}

  async options() {
    const rows = await this.prisma.clinicService.findMany({
      where: { isActive: true },
      orderBy: [{ category: 'asc' }, { name: 'asc' }],
      include: {
        dentists: {
          include: {
            doctor: {
              select: {
                id: true,
                fullName: true,
                status: true,
                deletedAt: true,
                doctorProfile: { select: { specialty: true, acceptingAppointments: true } },
                userRoles: { select: { role: { select: { code: true } } } },
              },
            },
          },
        },
      },
    });
    return rows
      .map(s => ({
        id: s.id,
        code: s.code,
        name: s.name,
        category: s.category,
        description: s.description,
        durationMinutes: s.durationMinutes,
        basePrice: s.basePrice,
        dentists: s.dentists
          .filter(
            x =>
              x.doctor.status === 'ACTIVE' &&
              !x.doctor.deletedAt &&
              x.doctor.doctorProfile?.acceptingAppointments &&
              x.doctor.userRoles.some(r => r.role.code === 'dentist'),
          )
          .map(x => ({
            id: x.doctor.id,
            fullName: x.doctor.fullName,
            specialty: x.doctor.doctorProfile?.specialty ?? '',
          })),
      }))
      .filter(s => s.dentists.length > 0);
  }

  async slots(q: PublicSlotsQueryDto) {
    const service = await this.requireEligible(q.serviceId, q.dentistId);
    const parsedDate = new Date(q.date + 'T00:00:00Z');
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(q.date) ||
      !Number.isFinite(parsedDate.getTime()) ||
      parsedDate.toISOString().slice(0, 10) !== q.date ||
      q.date < clinicDateOnly()
    ) {
      throw new BadRequestException('Chọn ngày hợp lệ từ hôm nay trở đi');
    }
    const data = await this.appointments.getAvailability({
      dentistId: q.dentistId,
      date: q.date,
      slotDuration: service.durationMinutes,
    });
    const now = Date.now();
    return {
      ...data,
      serviceId: service.id,
      availableSlots: data.availableSlots.filter(
        time => new Date(q.date + 'T' + time + ':00+07:00').getTime() > now + 60_000,
      ),
    };
  }

  async createPublic(dto: CreatePublicBookingRequestDto) {
    const details = this.validateDetails(dto);
    const startAt = new Date(dto.startAt);
    if (!Number.isFinite(startAt.getTime()) || startAt.getTime() <= Date.now() + 60_000) {
      throw new BadRequestException('Thời gian đặt lịch phải ở phía trước');
    }
    const service = await this.requireEligible(dto.serviceId, dto.dentistId);
    await this.assertSlot(dto.dentistId, startAt, service.durationMinutes);
    const token = randomBytes(32).toString('base64url');
    const ref = 'GS-' + randomBytes(5).toString('hex').toUpperCase();
    const row = await this.prisma.bookingRequest.create({
      data: {
        referenceCode: ref,
        accessTokenHash: this.hash(token),
        ...details,
        serviceId: service.id,
        preferredDentistId: dto.dentistId,
        requestedStartAt: startAt,
        reason: dto.reason?.trim() || null,
        consentedAt: new Date(),
      },
      select: { id: true, referenceCode: true, email: true, fullName: true },
    });
    await this.audit.log({
      action: 'BOOKING_REQUEST_SUBMITTED',
      actorUserId: null,
      targetType: 'booking_request',
      targetId: row.id,
      metadata: { referenceCode: ref },
    });
    let notificationSent = false;
    if (row.email) {
      notificationSent = await this.sendNotice(
        row.email,
        'Đã nhận yêu cầu đặt lịch',
        row.fullName,
        'Phòng khám đã nhận yêu cầu ' + ref + '. Đây chưa phải lịch hẹn đã xác nhận.',
        ref,
        token,
      );
      if (notificationSent)
        await this.prisma.bookingRequest.update({
          where: { id: row.id },
          data: { notificationSentAt: new Date() },
        });
    }
    return { referenceCode: ref, accessToken: token, status: 'PENDING_REVIEW', notificationSent };
  }

  async publicStatus(reference: string, token?: string) {
    return this.toPublic(await this.verify(reference, token));
  }

  async acceptProposal(reference: string, token?: string) {
    const row = await this.verify(reference, token);
    if (row.status !== 'PROPOSED' || !row.proposedStartAt) {
      throw new ConflictException('Không có khung giờ mới cần xác nhận');
    }
    await this.updateUnbookedRequest(row.id, row.status, { status: 'PATIENT_ACCEPTED' });
    await this.audit.log({
      action: 'BOOKING_REQUEST_PROPOSAL_ACCEPTED',
      actorUserId: null,
      targetType: 'booking_request',
      targetId: row.id,
      metadata: { referenceCode: row.referenceCode },
    });
    return this.publicStatus(reference, token);
  }

  async updateDetails(
    reference: string,
    token: string | undefined,
    dto: UpdatePublicBookingDetailsDto,
  ) {
    const row = await this.verify(reference, token);
    if (row.status !== 'NEEDS_INFORMATION') {
      throw new ConflictException('Yêu cầu hiện không cần bổ sung thông tin');
    }
    const phone = this.normalize(dto.phone);
    const dob = new Date(dto.dob);
    if (!isValidVnPhone(phone) || !isValidDob(dob)) {
      throw new BadRequestException('Thông tin liên hệ hoặc ngày sinh không hợp lệ');
    }
    if (dto.email && !isValidEmail(dto.email)) throw new BadRequestException('Email không hợp lệ');
    const hasGuardian = !!dto.contactPersonName?.trim() && !!dto.contactPersonPhone;
    if (isMinor(dob) && !hasGuardian) {
      throw new BadRequestException('Bệnh nhân dưới 12 tuổi cần thông tin người giám hộ');
    }
    if (!!dto.contactPersonName !== !!dto.contactPersonPhone) {
      throw new BadRequestException('Cần nhập đủ tên và số điện thoại người giám hộ');
    }
    await this.updateUnbookedRequest(row.id, row.status, {
      fullName: dto.fullName.trim(),
      dob,
      gender: dto.gender,
      phone,
      email: dto.email?.trim().toLowerCase() || null,
      contactPersonName: dto.contactPersonName?.trim() || null,
      contactPersonPhone: dto.contactPersonPhone ? this.normalize(dto.contactPersonPhone) : null,
      reason: dto.reason?.trim() || null,
      status: 'PENDING_REVIEW',
    });
    await this.audit.log({
      action: 'BOOKING_REQUEST_DETAILS_UPDATED',
      actorUserId: null,
      targetType: 'booking_request',
      targetId: row.id,
      metadata: { referenceCode: row.referenceCode },
    });
    return this.publicStatus(reference, token);
  }

  async withdraw(reference: string, token?: string) {
    const row = await this.verify(reference, token);
    if (!ACTIVE.includes(row.status)) {
      throw new ConflictException(
        'Yêu cầu này không thể hủy trực tuyến; vui lòng liên hệ phòng khám',
      );
    }
    const result = await this.prisma.bookingRequest.updateMany({
      where: { id: row.id, status: { in: ACTIVE }, appointmentId: null },
      data: { status: 'CANCELLED', responseMessage: 'Người đăng ký đã rút yêu cầu.' },
    });
    if (!result.count) throw new ConflictException('Yêu cầu đã thay đổi; hãy tải lại trạng thái.');
    await this.audit.log({
      action: 'BOOKING_REQUEST_WITHDRAWN',
      actorUserId: null,
      targetType: 'booking_request',
      targetId: row.id,
      metadata: { referenceCode: row.referenceCode },
    });
    return { referenceCode: row.referenceCode, status: 'CANCELLED' };
  }

  async listForStaff(q: ListBookingRequestsDto) {
    const rows = await this.prisma.bookingRequest.findMany({
      where: q.status ? { status: q.status } : {},
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: {
        service: { select: { id: true, name: true, durationMinutes: true } },
        preferredDentist: { select: { id: true, fullName: true } },
        proposedDentist: { select: { id: true, fullName: true } },
        appointment: { select: { id: true, status: true, startAt: true } },
      },
    });
    return rows.map(r => this.toStaff(r));
  }

  async getForStaff(id: string) {
    const row = await this.prisma.bookingRequest.findUnique({
      where: { id },
      include: {
        service: { select: { id: true, name: true, durationMinutes: true } },
        preferredDentist: { select: { id: true, fullName: true } },
        proposedDentist: { select: { id: true, fullName: true } },
        appointment: { select: { id: true, status: true, startAt: true } },
      },
    });
    if (!row) throw new NotFoundException('Không tìm thấy yêu cầu đặt lịch');
    return this.toStaff(row);
  }

  async patientMatches(id: string) {
    const row = await this.prisma.bookingRequest.findUnique({
      where: { id },
      select: { phone: true },
    });
    if (!row) throw new NotFoundException('Không tìm thấy yêu cầu đặt lịch');
    const phone = this.normalize(row.phone);
    return this.prisma.patient.findMany({
      where: { primaryPhone: { in: [phone, this.altPhone(phone)] }, deletedAt: null },
      select: { id: true, code: true, fullName: true, dob: true, primaryPhone: true },
      take: 20,
      orderBy: { createdAt: 'desc' },
    });
  }

  async propose(id: string, dto: ProposeBookingTimeDto, actor: JwtPayload) {
    const row = await this.requireActive(id);
    const service = await this.requireEligible(row.serviceId, dto.dentistId);
    const startAt = new Date(dto.startAt);
    await this.assertSlot(dto.dentistId, startAt, service.durationMinutes);
    await this.updateUnbookedRequest(id, row.status, {
      status: 'PROPOSED',
      proposedDentistId: dto.dentistId,
      proposedStartAt: startAt,
      responseMessage: dto.message.trim(),
      handledBy: actor.sub,
    });
    await this.auditAction('BOOKING_REQUEST_TIME_PROPOSED', id, actor);
    const sent = row.email
      ? await this.sendNotice(
          row.email,
          'Phòng khám đề xuất giờ khám khác',
          row.fullName,
          dto.message.trim(),
          row.referenceCode,
        )
      : false;
    return { data: await this.getForStaff(id), notificationSent: sent };
  }

  async requestInformation(id: string, dto: BookingRequestMessageDto, actor: JwtPayload) {
    const row = await this.requireActive(id);
    await this.updateUnbookedRequest(id, row.status, {
      status: 'NEEDS_INFORMATION',
      responseMessage: dto.message.trim(),
      handledBy: actor.sub,
    });
    await this.auditAction('BOOKING_REQUEST_INFORMATION_REQUESTED', id, actor);
    const sent = row.email
      ? await this.sendNotice(
          row.email,
          'Phòng khám cần bổ sung thông tin',
          row.fullName,
          dto.message.trim(),
          row.referenceCode,
        )
      : false;
    return { data: await this.getForStaff(id), notificationSent: sent };
  }

  async decline(id: string, dto: BookingRequestMessageDto, actor: JwtPayload) {
    const row = await this.requireActive(id);
    await this.updateUnbookedRequest(id, row.status, {
      status: 'DECLINED',
      responseMessage: dto.message.trim(),
      handledBy: actor.sub,
    });
    await this.auditAction('BOOKING_REQUEST_DECLINED', id, actor);
    const sent = row.email
      ? await this.sendNotice(
          row.email,
          'Kết quả yêu cầu đặt lịch',
          row.fullName,
          dto.message.trim(),
          row.referenceCode,
        )
      : false;
    return { data: await this.getForStaff(id), notificationSent: sent };
  }

  async confirm(id: string, actor: JwtPayload, patientId?: string) {
    const row = await this.prisma.bookingRequest.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('Không tìm thấy yêu cầu đặt lịch');
    if (row.appointmentId || !['PENDING_REVIEW', 'PATIENT_ACCEPTED'].includes(row.status)) {
      throw new ConflictException('Yêu cầu chưa sẵn sàng để xác nhận');
    }
    const dentistId =
      row.status === 'PATIENT_ACCEPTED' ? row.proposedDentistId : row.preferredDentistId;
    const startAt = row.status === 'PATIENT_ACCEPTED' ? row.proposedStartAt : row.requestedStartAt;
    if (!dentistId || !startAt)
      throw new ConflictException('Thiếu bác sĩ hoặc giờ hẹn đã thống nhất');
    const service = await this.requireEligible(row.serviceId, dentistId);
    const resolvedPatientId = await this.resolvePatient(row, patientId, actor);
    const appointment = await this.appointments.createConfirmedFromBookingRequest(
      {
        patientId: resolvedPatientId,
        dentistId,
        serviceId: service.id,
        startAt: startAt.toISOString(),
        endAt: new Date(startAt.getTime() + service.durationMinutes * 60_000).toISOString(),
        reason: row.reason ?? undefined,
        source: 'ONLINE',
      },
      row.id,
      actor,
    );
    const confirmed = await this.prisma.bookingRequest.findUniqueOrThrow({
      where: { id },
      select: { email: true, fullName: true, referenceCode: true },
    });
    const sent = confirmed.email
      ? await this.sendNotice(
          confirmed.email,
          'Lịch hẹn đã được xác nhận',
          confirmed.fullName,
          'Lịch hẹn ' +
            confirmed.referenceCode +
            ' đã được xác nhận vào ' +
            startAt.toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' }),
          confirmed.referenceCode,
        )
      : false;
    if (sent)
      await this.prisma.bookingRequest.update({
        where: { id },
        data: { notificationSentAt: new Date() },
      });
    await this.auditAction('BOOKING_REQUEST_CONFIRMED', id, actor, {
      appointmentId: appointment.id,
      patientId: resolvedPatientId,
    });
    return { data: await this.getForStaff(id), notificationSent: sent };
  }

  private async resolvePatient(row: any, patientId: string | undefined, actor: JwtPayload) {
    if (patientId) {
      const found = await this.prisma.patient.findFirst({
        where: { id: patientId, deletedAt: null },
        select: { id: true, primaryPhone: true, contactPersonPhone: true },
      });
      if (!found)
        throw new BadRequestException('Hồ sơ bệnh nhân đã chọn không tồn tại hoặc đã lưu trữ');
      const phoneMatches = [found.primaryPhone, found.contactPersonPhone]
        .filter((value): value is string => !!value)
        .map(value => this.normalize(value));
      if (!phoneMatches.includes(this.normalize(row.phone))) {
        throw new BadRequestException('Hồ sơ đã chọn không khớp số liên hệ của yêu cầu');
      }
      return found.id;
    }
    const phone = this.normalize(row.phone);
    const matches = await this.prisma.patient.findMany({
      where: { primaryPhone: { in: [phone, this.altPhone(phone)] }, deletedAt: null },
      select: { id: true, fullName: true, dob: true },
      take: 20,
    });
    const exact = matches.filter(
      p =>
        p.fullName.trim().toLocaleLowerCase() === row.fullName.trim().toLocaleLowerCase() &&
        p.dob.toISOString().slice(0, 10) === row.dob.toISOString().slice(0, 10),
    );
    if (exact.length === 1) return exact[0].id;
    if (exact.length > 0 || matches.length > 0) {
      throw new ConflictException(
        'Đã có hồ sơ trùng số điện thoại. Hãy chọn hồ sơ phù hợp trước khi xác nhận.',
      );
    }
    const dto: CreatePatientDto = {
      fullName: row.fullName,
      dob: row.dob.toISOString().slice(0, 10),
      gender: row.gender,
      primaryPhone: phone,
      email: row.email,
      contactPersonName: row.contactPersonName,
      contactPersonPhone: row.contactPersonPhone,
    };
    return (await this.patients.create(dto, actor)).id;
  }

  private validateDetails(dto: CreatePublicBookingRequestDto) {
    if (!dto.consent)
      throw new BadRequestException(
        'Cần đồng ý để phòng khám sử dụng thông tin nhằm xử lý yêu cầu đặt lịch',
      );
    const phone = this.normalize(dto.phone),
      dob = new Date(dto.dob);
    if (!isValidVnPhone(phone)) throw new BadRequestException('Số điện thoại không hợp lệ');
    if (!isValidDob(dob)) throw new BadRequestException('Ngày sinh không hợp lệ');
    if (dto.email && !isValidEmail(dto.email)) throw new BadRequestException('Email không hợp lệ');
    const guardian = !!dto.contactPersonName?.trim() && !!dto.contactPersonPhone;
    if (isMinor(dob) && !guardian)
      throw new BadRequestException('Bệnh nhân dưới 12 tuổi cần thông tin người giám hộ');
    if (!!dto.contactPersonName !== !!dto.contactPersonPhone)
      throw new BadRequestException('Cần nhập đủ tên và số điện thoại người giám hộ');
    return {
      fullName: dto.fullName.trim(),
      dob,
      gender: dto.gender as Gender,
      phone,
      email: dto.email?.trim().toLowerCase() || null,
      contactPersonName: dto.contactPersonName?.trim() || null,
      contactPersonPhone: dto.contactPersonPhone ? this.normalize(dto.contactPersonPhone) : null,
    };
  }

  private async updateUnbookedRequest(id: string, expectedStatus: BookingRequestStatus, data: any) {
    const result = await this.prisma.bookingRequest.updateMany({
      where: { id, status: expectedStatus, appointmentId: null },
      data,
    });
    if (!result.count) throw new ConflictException('Yêu cầu đã thay đổi; hãy tải lại trạng thái.');
  }

  private async requireActive(id: string) {
    const row = await this.prisma.bookingRequest.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('Không tìm thấy yêu cầu đặt lịch');
    if (row.appointmentId || !ACTIVE.includes(row.status))
      throw new ConflictException('Yêu cầu này đã được xử lý');
    return row;
  }

  private async requireEligible(serviceId: string, dentistId: string) {
    const service = await this.prisma.clinicService.findFirst({
      where: {
        id: serviceId,
        isActive: true,
        dentists: {
          some: {
            doctorId: dentistId,
            doctor: {
              status: 'ACTIVE',
              deletedAt: null,
              doctorProfile: { is: { acceptingAppointments: true } },
              userRoles: { some: { role: { code: 'dentist' } } },
            },
          },
        },
      },
    });
    if (!service) throw new BadRequestException('Dịch vụ hoặc bác sĩ hiện không nhận đặt lịch');
    return service;
  }

  private async assertSlot(dentistId: string, startAt: Date, duration: number) {
    if (!Number.isFinite(startAt.getTime()) || startAt.getTime() <= Date.now() + 60_000)
      throw new BadRequestException('Khung giờ phải ở phía trước');
    const local = new Date(startAt.getTime() + CLINIC_UTC_OFFSET_MS).toISOString();
    const date = local.slice(0, 10),
      time = local.slice(11, 16);
    if (local.slice(17, 19) !== '00' || startAt.getUTCMilliseconds() !== 0)
      throw new BadRequestException('Khung giờ không hợp lệ');
    const slots = await this.appointments.getAvailability({
      dentistId,
      date,
      slotDuration: duration,
    });
    if (!slots.availableSlots.includes(time))
      throw new ConflictException('Khung giờ vừa được đặt hoặc không nằm trong lịch làm việc');
  }

  private async verify(reference: string, token?: string) {
    if (!token || token.length > 100) throw new UnauthorizedException('Mã tra cứu không hợp lệ');
    const row = await this.prisma.bookingRequest.findUnique({
      where: { referenceCode: reference },
    });
    const expected = Buffer.from(row?.accessTokenHash ?? '0'.repeat(64));
    const candidate = Buffer.from(this.hash(token));
    if (!row || !timingSafeEqual(candidate, expected))
      throw new UnauthorizedException('Mã tra cứu không hợp lệ');
    return this.prisma.bookingRequest.findUniqueOrThrow({
      where: { id: row.id },
      include: {
        service: { select: { name: true } },
        preferredDentist: { select: { fullName: true } },
        proposedDentist: { select: { fullName: true } },
        appointment: { select: { status: true, startAt: true } },
      },
    });
  }

  private toPublic(row: any) {
    const useProposed = ['PROPOSED', 'PATIENT_ACCEPTED'].includes(row.status);
    return {
      referenceCode: row.referenceCode,
      status: row.status,
      requestedAt: row.createdAt,
      requestedStartAt: row.requestedStartAt,
      service: { name: row.service?.name ?? null },
      dentist: {
        fullName: useProposed
          ? (row.proposedDentist?.fullName ?? null)
          : (row.preferredDentist?.fullName ?? null),
      },
      proposedStartAt: row.proposedStartAt,
      responseMessage: row.responseMessage,
      appointment: row.appointment
        ? { startAt: row.appointment.startAt, status: row.appointment.status }
        : null,
    };
  }

  private toStaff(row: any) {
    const { accessTokenHash: _hash, ...safe } = row;
    return safe;
  }

  private normalize(value: string) {
    const clean = value.replace(/[\s()-]/g, '');
    return clean.startsWith('+84') ? '0' + clean.slice(3) : clean;
  }
  private altPhone(value: string) {
    return value.startsWith('0') ? '+84' + value.slice(1) : value;
  }
  private hash(token: string) {
    return createHash('sha256').update(token).digest('hex');
  }

  private async sendNotice(
    to: string,
    subject: string,
    name: string,
    message: string,
    reference: string,
    token?: string,
  ) {
    const base = process.env.PUBLIC_APP_URL || 'https://gensmile.online';
    const link =
      base +
      '/booking/status?ref=' +
      encodeURIComponent(reference) +
      (token ? '#token=' + encodeURIComponent(token) : '');
    const html =
      '<p>Xin chào ' +
      this.escape(name) +
      ',</p><p>' +
      this.escape(message) +
      '</p><p>Mã yêu cầu: <strong>' +
      this.escape(reference) +
      '</strong></p><p><a href="' +
      this.escape(link) +
      '">Xem tình trạng yêu cầu</a></p>';
    return this.email.send({
      to,
      subject,
      html,
      text: message + '\nMã yêu cầu: ' + reference + '\n' + link,
    });
  }
  private escape(value: string) {
    return value.replace(
      /[&<>"']/g,
      c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
    );
  }
  private async auditAction(
    action: string,
    targetId: string,
    actor: JwtPayload,
    metadata?: Record<string, unknown>,
  ) {
    await this.audit.log({
      action,
      actorUserId: actor.sub,
      actorEmail: actor.email,
      targetType: 'booking_request',
      targetId,
      metadata,
    });
  }
}

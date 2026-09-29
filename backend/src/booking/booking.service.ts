import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { BookingRequestStatus, Gender, Prisma } from '@prisma/client';
import { createHash, randomBytes, timingSafeEqual } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { AppointmentsService, VisitPlan } from '../appointments/appointments.service';

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
  AcceptBookingProposalDto,
  BookingRequestMessageDto,
  BookingRequestNoteDto,
  CreatePublicBookingRequestDto,
  isCalendarDate,
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

const PUBLIC_INCLUDE = {
  service: { select: { name: true, defaultDurationMin: true } },
  preferredDentist: { select: { fullName: true } },
  proposedDentist: { select: { fullName: true } },
  // Once booked, the visit (which the clinic may have moved or reassigned)
  // is what the patient sees, not the request.
  appointment: {
    select: {
      status: true,
      startAt: true,
      endAt: true,
      rescheduleCount: true,
      deletedAt: true,
      dentist: { select: { fullName: true } },
    },
  },
} satisfies Prisma.BookingRequestInclude;
const STAFF_INCLUDE = {
  service: { select: { id: true, name: true, defaultDurationMin: true } },
  preferredDentist: { select: { id: true, fullName: true } },
  proposedDentist: { select: { id: true, fullName: true } },
  appointment: {
    select: {
      id: true,
      status: true,
      startAt: true,
      dentist: { select: { id: true, fullName: true } },
    },
  },
} satisfies Prisma.BookingRequestInclude;
const STAFF_ACTION_STATUSES: BookingRequestStatus[] = ['PENDING_REVIEW', 'PATIENT_ACCEPTED'];
/** Statuses whose effective time is the proposed one (when set). */
const PROPOSAL_STATUSES: BookingRequestStatus[] = ['PROPOSED', 'PATIENT_ACCEPTED'];
const LOOKUP_WINDOW_MS = 180 * 24 * 60 * 60 * 1000;
const DEFAULT_MIN_LEAD_MIN = 120;
// Advisory-lock namespace for online submissions per phone (1 and 2 are the
// dentist and patient calendars, appointments/domain/advisory-lock.ts).
const LOCK_NS_BOOKING_PHONE = 3;
export const EXPIRED_MESSAGE =
  'Đã quá giờ hẹn mà chưa được xác nhận. Vui lòng đặt lịch mới hoặc gọi phòng khám.';
const OVERDUE_STAFF_MESSAGE = 'Giờ hẹn đã qua, hãy đề xuất giờ khác hoặc từ chối yêu cầu';
const PROPOSAL_CHANGED_MESSAGE = 'Phòng khám vừa đổi giờ đề xuất, vui lòng xem lại';
const PROPOSAL_OPEN_MESSAGE =
  'Yêu cầu đang có giờ đề xuất nên không thể yêu cầu bổ sung (giờ đã thống nhất sẽ bị mất). ' +
  'Hãy gọi khách để trao đổi, đề xuất giờ khác hoặc từ chối yêu cầu.';

/** Names compared the way people type them: NFC, single spaces, any case. */
export function normalizeName(value: string): string {
  return value.normalize('NFC').replace(/\s+/g, ' ').trim().toLocaleLowerCase('vi');
}

/** "dd/MM/yyyy HH:mm" at the clinic (UTC+7). */
export function formatClinicDateTime(value: Date): string {
  const local = new Date(value.getTime() + CLINIC_UTC_OFFSET_MS).toISOString();
  return (
    local.slice(8, 10) +
    '/' +
    local.slice(5, 7) +
    '/' +
    local.slice(0, 4) +
    ' ' +
    local.slice(11, 16)
  );
}

/**
 * The time a request is about: the proposed one while a proposal is on the
 * table, otherwise the one the patient asked for.
 */
export function effectiveStartAt(row: {
  status: BookingRequestStatus | string;
  requestedStartAt: Date;
  proposedStartAt?: Date | null;
}): Date {
  return PROPOSAL_STATUSES.includes(row.status as BookingRequestStatus)
    ? (row.proposedStartAt ?? row.requestedStartAt)
    : row.requestedStartAt;
}

/**
 * Minimum notice for an online request (BOOKING_MIN_LEAD_MIN, default 120
 * minutes), so the front desk has time to confirm it. Staff booking directly
 * is not affected.
 */
export function bookingMinLeadMinutes(): number {
  const raw = process.env.BOOKING_MIN_LEAD_MIN?.trim();
  const value = raw ? Number(raw) : NaN;
  return Number.isInteger(value) && value >= 0 ? value : DEFAULT_MIN_LEAD_MIN;
}

/** How a requester proves they own a booking request (see verify()). */
export type PublicAccess = { token?: string; phone?: string };

@Injectable()
export class BookingService {
  private readonly logger = new Logger(BookingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly appointments: AppointmentsService,
    private readonly patients: PatientsService,
    private readonly audit: AuditService,
    private readonly email: EmailService,
  ) {}

  /** Services that at least one dentist takes online bookings for today. */
  async options() {
    const today = new Date(clinicDateOnly());
    const rows = await this.prisma.service.findMany({
      where: { isActive: true, category: { isActive: true } },
      orderBy: [{ category: { sortOrder: 'asc' } }, { name: 'asc' }],
      include: {
        category: { select: { name: true } },
        dentistServices: {
          where: this.currentAssignment(today),
          include: {
            dentist: {
              select: {
                id: true,
                fullName: true,
                dentistProfile: { select: { specialties: true } },
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
        category: s.category.name,
        description: s.description,
        durationMinutes: s.defaultDurationMin,
        basePrice: s.basePrice,
        dentists: s.dentistServices.map(a => ({
          id: a.dentist.id,
          fullName: a.dentist.fullName,
          specialties: a.dentist.dentistProfile?.specialties ?? [],
          durationMinutes: a.durationMin ?? s.defaultDurationMin,
        })),
      }))
      .filter(s => s.dentists.length > 0);
  }

  async slots(q: PublicSlotsQueryDto) {
    const parsedDate = new Date(q.date + 'T00:00:00Z');
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(q.date) ||
      !Number.isFinite(parsedDate.getTime()) ||
      parsedDate.toISOString().slice(0, 10) !== q.date ||
      q.date < clinicDateOnly()
    ) {
      throw new BadRequestException('Chọn ngày hợp lệ từ hôm nay trở đi');
    }
    const plan = await this.requireEligible(q.serviceId, q.dentistId, q.date);
    const data = await this.appointments.getAvailability({
      dentistId: q.dentistId,
      date: q.date,
      slotDuration: plan.durationMin,
      bufferBeforeMin: plan.bufferBeforeMin,
      bufferAfterMin: plan.bufferAfterMin,
    });
    const minLeadMinutes = bookingMinLeadMinutes();
    const earliest = Date.now() + Math.max(minLeadMinutes * 60_000, 60_000);
    return {
      ...data,
      serviceId: q.serviceId,
      minLeadMinutes,
      availableSlots: data.availableSlots.filter(
        time => new Date(q.date + 'T' + time + ':00+07:00').getTime() > earliest,
      ),
    };
  }

  async createPublic(dto: CreatePublicBookingRequestDto) {
    const details = this.validateDetails(dto);
    const startAt = new Date(dto.startAt);
    if (!Number.isFinite(startAt.getTime()) || startAt.getTime() <= Date.now() + 60_000) {
      throw new BadRequestException('Thời gian đặt lịch phải ở phía trước');
    }
    const leadMin = bookingMinLeadMinutes();
    if (startAt.getTime() <= Date.now() + leadMin * 60_000) {
      throw new BadRequestException(
        'Vui lòng đặt lịch trực tuyến trước giờ khám ít nhất ' +
          (leadMin % 60 === 0 ? leadMin / 60 + ' giờ' : leadMin + ' phút') +
          '. Nếu cần khám sớm hơn, hãy gọi phòng khám.',
      );
    }
    const plan = await this.requireEligible(dto.serviceId, dto.dentistId, clinicDateOnly(startAt));
    await this.assertSlot(dto.dentistId, startAt, plan);
    const token = randomBytes(32).toString('base64url');
    const ref = 'GS-' + randomBytes(5).toString('hex').toUpperCase();
    const row = await this.prisma.$transaction(async tx => {
      // A double submit (or a second tab) must not queue the same visit
      // twice: submissions from one phone are serialized, so the duplicate
      // check and the insert are atomic.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${LOCK_NS_BOOKING_PHONE}::int4, hashtext(${details.phone}))`;
      const duplicate = await tx.bookingRequest.findFirst({
        where: {
          phone: details.phone,
          status: { in: ACTIVE },
          appointmentId: null,
          OR: [{ requestedStartAt: startAt }, { proposedStartAt: startAt }],
        },
        select: { id: true },
      });
      if (duplicate) {
        throw new ConflictException(
          'Số điện thoại này đã có yêu cầu đặt lịch đang chờ xử lý vào đúng giờ này. ' +
            'Vui lòng tra cứu lịch hẹn bằng số điện thoại hoặc gọi phòng khám.',
        );
      }
      return tx.bookingRequest.create({
        data: {
          referenceCode: ref,
          accessTokenHash: this.hash(token),
          ...details,
          serviceId: dto.serviceId,
          preferredDentistId: dto.dentistId,
          requestedStartAt: startAt,
          reason: dto.reason?.trim() || null,
          consentedAt: new Date(),
        },
        select: { id: true, referenceCode: true, email: true, fullName: true },
      });
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
    void this.notifyStaff(row.id, 'Yêu cầu đặt lịch mới');
    return { referenceCode: ref, accessToken: token, status: 'PENDING_REVIEW', notificationSent };
  }

  async publicStatus(reference: string, access: PublicAccess) {
    return this.toPublic(await this.verify(reference, access));
  }

  /**
   * Requests made with this phone (the patient's or the guardian's) in the
   * last 180 days, newest first. The phone alone is the credential here, by
   * the clinic's choice: it is what patients remember. The list shows only
   * booking status (service, time, dentist), never the patient's details.
   */
  async lookupByPhone(input: string | undefined) {
    const phone = this.normalize(input ?? '');
    if (phone.length > 20 || !isValidVnPhone(phone)) {
      throw new BadRequestException('Số điện thoại không hợp lệ');
    }
    const rows = await this.prisma.bookingRequest.findMany({
      where: {
        OR: [{ phone }, { contactPersonPhone: phone }],
        createdAt: { gte: new Date(Date.now() - LOOKUP_WINDOW_MS) },
      },
      orderBy: { createdAt: 'desc' },
      take: 10,
      include: PUBLIC_INCLUDE,
    });
    return rows.map(row => this.toPublic(row));
  }

  async acceptProposal(
    reference: string,
    access: PublicAccess,
    dto: AcceptBookingProposalDto = {},
  ) {
    const row = await this.verify(reference, access);
    if (row.status !== 'PROPOSED' || !row.proposedStartAt) {
      throw new ConflictException('Không có khung giờ mới cần xác nhận');
    }
    // The patient agrees to the time on their screen: if the front desk has
    // proposed another one since, that is not what they agreed to.
    const seen = dto.proposedStartAt ? new Date(dto.proposedStartAt) : row.proposedStartAt;
    if (seen.getTime() !== row.proposedStartAt.getTime()) {
      throw new ConflictException(PROPOSAL_CHANGED_MESSAGE);
    }
    if (row.proposedStartAt.getTime() <= Date.now()) {
      throw new ConflictException(
        'Giờ phòng khám đề xuất đã qua nên không thể đồng ý nữa. Vui lòng đặt lịch mới hoặc gọi phòng khám.',
      );
    }
    await this.acceptProposedTime(row.id, seen);
    await this.audit.log({
      action: 'BOOKING_REQUEST_PROPOSAL_ACCEPTED',
      actorUserId: null,
      targetType: 'booking_request',
      targetId: row.id,
      metadata: { referenceCode: row.referenceCode },
    });
    void this.notifyStaff(row.id, 'Khách đã đồng ý giờ mới — cần xác nhận');
    return this.publicStatus(reference, access);
  }

  /** PROPOSED → PATIENT_ACCEPTED, only while the proposal is still `proposedStartAt`. */
  private async acceptProposedTime(id: string, proposedStartAt: Date, handledBy?: string) {
    const result = await this.prisma.bookingRequest.updateMany({
      where: { id, status: 'PROPOSED', appointmentId: null, proposedStartAt },
      data: { status: 'PATIENT_ACCEPTED', ...(handledBy ? { handledBy } : {}) },
    });
    if (result.count) return;
    const now = await this.prisma.bookingRequest.findUnique({
      where: { id },
      select: { status: true, proposedStartAt: true },
    });
    throw new ConflictException(
      now?.status === 'PROPOSED' && now.proposedStartAt?.getTime() !== proposedStartAt.getTime()
        ? PROPOSAL_CHANGED_MESSAGE
        : 'Yêu cầu đã thay đổi; hãy tải lại trạng thái.',
    );
  }

  async updateDetails(reference: string, access: PublicAccess, dto: UpdatePublicBookingDetailsDto) {
    const row = await this.verify(reference, access);
    if (row.status !== 'NEEDS_INFORMATION') {
      throw new ConflictException('Yêu cầu hiện không cần bổ sung thông tin');
    }
    if (this.isOverdue(row)) {
      throw new ConflictException(
        'Giờ hẹn của yêu cầu này đã qua nên không thể bổ sung thông tin. Vui lòng đặt lịch mới hoặc gọi phòng khám.',
      );
    }
    // Only the fields sent change; a field left out keeps what was stored
    // (the public API never shows the stored details, so the form cannot
    // send them back). The checks run on the merged result.
    const changes: Prisma.BookingRequestUpdateManyMutationInput = {};
    if (dto.fullName?.trim()) changes.fullName = dto.fullName.trim();
    if (dto.dob !== undefined) changes.dob = this.parseDob(dto.dob);
    if (dto.gender !== undefined) changes.gender = dto.gender;
    if (dto.phone?.trim()) changes.phone = this.normalize(dto.phone);
    if (dto.email?.trim()) changes.email = dto.email.trim().toLowerCase();
    if (dto.contactPersonName?.trim()) changes.contactPersonName = dto.contactPersonName.trim();
    if (dto.contactPersonPhone?.trim())
      changes.contactPersonPhone = this.normalize(dto.contactPersonPhone);
    if (dto.reason?.trim()) changes.reason = dto.reason.trim();
    if (!Object.keys(changes).length) {
      throw new BadRequestException('Vui lòng nhập thông tin cần bổ sung');
    }
    const merged = { ...row, ...changes } as typeof row;
    this.checkContact({
      phone: merged.phone,
      dob: merged.dob,
      email: merged.email,
      contactPersonName: merged.contactPersonName,
      contactPersonPhone: merged.contactPersonPhone,
    });
    await this.updateUnbookedRequest(row.id, row.status, {
      ...changes,
      status: 'PENDING_REVIEW',
    });
    await this.audit.log({
      action: 'BOOKING_REQUEST_DETAILS_UPDATED',
      actorUserId: null,
      targetType: 'booking_request',
      targetId: row.id,
      metadata: { referenceCode: row.referenceCode },
    });
    void this.notifyStaff(row.id, 'Khách đã bổ sung thông tin — cần xử lý');
    // The phone may have just changed; the caller proved access already.
    return this.toPublic(await this.load(row.id));
  }

  async withdraw(reference: string, access: PublicAccess) {
    const row = await this.verify(reference, access);
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

  /**
   * Requests waiting on the front desk (the sidebar badge). Ones whose time
   * has passed are left out even before the expiry cron closes them.
   */
  async pendingCount() {
    const count = await this.prisma.bookingRequest.count({
      where: { OR: this.byEffectiveStart(STAFF_ACTION_STATUSES, 'gt', new Date()) },
    });
    return { count };
  }

  /**
   * Open requests come first, nearest time first (overdue ones on top, they
   * are about to expire); the rest follow newest first.
   */
  async listForStaff(q: ListBookingRequestsDto) {
    const include = STAFF_INCLUDE;
    const activeStatuses = q.status ? ACTIVE.filter(s => s === q.status) : ACTIVE;
    // Capped at 100 like before. With more open requests than that, the cut
    // is by requested time, so a far-off request with an earlier proposal
    // could be left out; the expiry cron keeps the open set small.
    const active = activeStatuses.length
      ? await this.prisma.bookingRequest.findMany({
          where: { status: { in: activeStatuses } },
          orderBy: { requestedStartAt: 'asc' },
          take: 100,
          include,
        })
      : [];
    active.sort((a, b) => effectiveStartAt(a).getTime() - effectiveStartAt(b).getTime());
    const rest =
      (!q.status || !ACTIVE.includes(q.status)) && active.length < 100
        ? await this.prisma.bookingRequest.findMany({
            where: q.status ? { status: q.status } : { status: { notIn: ACTIVE } },
            orderBy: { createdAt: 'desc' },
            take: 100 - active.length,
            include,
          })
        : [];
    return [...active, ...rest].map(r => this.toStaff(r));
  }

  /**
   * Closes open requests whose time passed without a visit being booked
   * (BookingCron, every 5 minutes). One conditional update, so a request the
   * front desk confirms or changes at the same moment is left alone, and a
   * second run finds nothing to do.
   */
  async expireOverdue(now = new Date()) {
    const where: Prisma.BookingRequestWhereInput = {
      appointmentId: null,
      OR: this.byEffectiveStart(ACTIVE, 'lte', now),
    };
    const candidates = await this.prisma.bookingRequest.findMany({
      where,
      select: { id: true, referenceCode: true },
      take: 500,
    });
    if (!candidates.length) return { expired: 0 };
    const result = await this.prisma.bookingRequest.updateMany({
      where: { ...where, id: { in: candidates.map(c => c.id) } },
      data: { status: 'EXPIRED', responseMessage: EXPIRED_MESSAGE },
    });
    if (result.count > 0) {
      // Rarely, a candidate was handled between the read and the update.
      const expired =
        result.count === candidates.length
          ? candidates
          : await this.prisma.bookingRequest.findMany({
              where: { id: { in: candidates.map(c => c.id) }, status: 'EXPIRED' },
              select: { id: true, referenceCode: true },
            });
      // One history row per request, written in one statement (AuditService
      // has no batch call).
      await this.prisma.auditLog.createMany({
        data: expired.map(c => ({
          action: 'BOOKING_REQUEST_EXPIRED',
          actorUserId: null,
          targetType: 'booking_request',
          targetId: c.id,
          metadata: { referenceCode: c.referenceCode, expiredAt: now.toISOString() },
        })),
      });
    }
    return { expired: result.count };
  }

  async getForStaff(id: string) {
    const row = await this.prisma.bookingRequest.findUnique({
      where: { id },
      include: STAFF_INCLUDE,
    });
    if (!row) throw new NotFoundException('Không tìm thấy yêu cầu đặt lịch');
    return this.toStaff(row);
  }

  /**
   * Patient records the request could belong to: any whose own phone or
   * guardian phone is one of the request's phones (a child is often on
   * file only under a parent's number). Each says which of its phones
   * matched, and whether name and date of birth match too.
   */
  async patientMatches(id: string) {
    const row = await this.prisma.bookingRequest.findUnique({
      where: { id },
      select: { phone: true, contactPersonPhone: true, fullName: true, dob: true },
    });
    if (!row) throw new NotFoundException('Không tìm thấy yêu cầu đặt lịch');
    const phones = this.requestPhones(row);
    const found = await this.prisma.patient.findMany({
      where: this.patientsByPhone(phones),
      select: {
        id: true,
        code: true,
        fullName: true,
        dob: true,
        primaryPhone: true,
        contactPersonName: true,
        contactPersonPhone: true,
      },
      take: 20,
      orderBy: { createdAt: 'desc' },
    });
    return found.map(p => ({
      ...p,
      matchedBy: (['primaryPhone', 'contactPersonPhone'] as const).filter(
        field => !!p[field] && phones.includes(this.normalize(p[field]!)),
      ),
      sameNameAndDob: this.sameNameAndDob(p, row),
    }));
  }

  async propose(id: string, dto: ProposeBookingTimeDto, actor: JwtPayload) {
    const row = await this.requireActive(id);
    const startAt = new Date(dto.startAt);
    const plan = await this.requireEligible(row.serviceId, dto.dentistId, clinicDateOnly(startAt));
    await this.assertSlot(dto.dentistId, startAt, plan);
    await this.updateUnbookedRequest(id, row.status, {
      status: 'PROPOSED',
      proposedDentistId: dto.dentistId,
      proposedStartAt: startAt,
      responseMessage: dto.message.trim(),
      handledBy: actor.sub,
    });
    await this.auditAction('BOOKING_REQUEST_TIME_PROPOSED', id, actor);
    const data = await this.getForStaff(id);
    // The email states the proposal itself, not only the front desk's note.
    const dentistName = data?.proposedDentist?.fullName;
    const sent = row.email
      ? await this.sendNotice(
          row.email,
          'Phòng khám đề xuất giờ khám khác',
          row.fullName,
          'Giờ phòng khám đề xuất: ' +
            formatClinicDateTime(startAt) +
            ' (giờ Việt Nam)' +
            (dentistName ? ', bác sĩ ' + dentistName : '') +
            '. Lời nhắn của phòng khám: ' +
            dto.message.trim(),
          row.referenceCode,
        )
      : false;
    return { data, notificationSent: sent };
  }

  async requestInformation(id: string, dto: BookingRequestMessageDto, actor: JwtPayload) {
    const row = await this.requireActive(id);
    // NEEDS_INFORMATION leads back to PENDING_REVIEW, which would drop the
    // time and dentist already offered to (or agreed by) the patient.
    if (PROPOSAL_STATUSES.includes(row.status)) throw new ConflictException(PROPOSAL_OPEN_MESSAGE);
    // The patient could not answer in time anyway (updateDetails refuses).
    // Proposing a new time is still allowed: that rescues an overdue request.
    if (this.isOverdue(row)) throw new ConflictException(OVERDUE_STAFF_MESSAGE);
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

  /** The patient gave the missing details by phone: back to the front desk's review. */
  async markInformationReceived(id: string, dto: BookingRequestNoteDto, actor: JwtPayload) {
    const row = await this.requireActive(id);
    if (row.status !== 'NEEDS_INFORMATION') {
      throw new ConflictException('Yêu cầu không ở trạng thái chờ bổ sung thông tin');
    }
    if (this.isOverdue(row)) throw new ConflictException(OVERDUE_STAFF_MESSAGE);
    await this.updateUnbookedRequest(id, row.status, {
      status: 'PENDING_REVIEW',
      handledBy: actor.sub,
    });
    await this.auditAction('BOOKING_REQUEST_INFORMATION_RECEIVED', id, actor, {
      channel: 'STAFF',
      ...(dto.note?.trim() ? { note: dto.note.trim() } : {}),
    });
    return { data: await this.getForStaff(id) };
  }

  /** The patient agreed to the proposed time by phone. */
  async markProposalAcceptedByPhone(id: string, dto: BookingRequestNoteDto, actor: JwtPayload) {
    const row = await this.requireActive(id);
    if (row.status !== 'PROPOSED' || !row.proposedStartAt) {
      throw new ConflictException('Không có giờ đề xuất đang chờ khách đồng ý');
    }
    if (this.isOverdue(row)) throw new ConflictException(OVERDUE_STAFF_MESSAGE);
    await this.acceptProposedTime(id, row.proposedStartAt, actor.sub);
    await this.auditAction('BOOKING_REQUEST_PROPOSAL_ACCEPTED', id, actor, {
      channel: 'PHONE',
      proposedStartAt: row.proposedStartAt.toISOString(),
      ...(dto.note?.trim() ? { note: dto.note.trim() } : {}),
    });
    return { data: await this.getForStaff(id) };
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

  async confirm(
    id: string,
    actor: JwtPayload,
    choice: { patientId?: string; createNewPatient?: boolean } = {},
  ) {
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
    // Checked before any patient record is created or matched. create()
    // refuses anything under a minute ahead too.
    if (startAt.getTime() <= Date.now() + 60_000) {
      throw new ConflictException(OVERDUE_STAFF_MESSAGE);
    }
    await this.requireEligible(row.serviceId, dentistId, clinicDateOnly(startAt));
    const patient = await this.resolvePatient(row, choice, actor);
    const resolvedPatientId = patient.id;
    // The visit length comes from the service (the dentist's own duration
    // first); create() re-checks the slot, buffers and double-booking.
    let appointment: { id: string };
    try {
      appointment = await this.appointments.create(
        {
          patientId: resolvedPatientId,
          dentistId,
          serviceIds: [row.serviceId],
          startAt: startAt.toISOString(),
          reason: row.reason ?? undefined,
          source: 'ONLINE',
        },
        actor,
        { id: row.id, expectedStatuses: [row.status] },
      );
    } catch (error) {
      if (patient.created) await this.discardNewPatient(patient.id, row.referenceCode, actor);
      throw error;
    }
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
      patientCreated: patient.created,
    });
    return { data: await this.getForStaff(id), notificationSent: sent };
  }

  /**
   * The visit could not be booked, so the patient record created for it a
   * moment ago would be left with nothing. Archive it (soft delete, audited);
   * softDelete itself refuses if the record already has a visit, e.g. one a
   * colleague booked concurrently. Never throws over the original error.
   */
  private async discardNewPatient(id: string, referenceCode: string, actor: JwtPayload) {
    try {
      await this.patients.softDelete(
        id,
        { reason: 'Tự động lưu trữ: không tạo được lịch hẹn từ yêu cầu ' + referenceCode },
        actor,
      );
    } catch (error) {
      this.logger.warn(`Could not archive patient ${id} after a failed confirm: ${String(error)}`);
    }
  }

  /**
   * The patient record for the visit: the one the front desk picked, a new
   * one when they asked for it, or else the single record with the same
   * phone (own or guardian), name and date of birth. Any other record on
   * those phones means a person must choose (a child on a parent's phone).
   */
  private async resolvePatient(
    row: any,
    choice: { patientId?: string; createNewPatient?: boolean },
    actor: JwtPayload,
  ): Promise<{ id: string; created: boolean }> {
    const phones = this.requestPhones(row);
    if (choice.patientId && choice.createNewPatient) {
      throw new BadRequestException('Chọn một hồ sơ có sẵn hoặc tạo hồ sơ mới, không chọn cả hai');
    }
    if (choice.patientId) {
      const found = await this.prisma.patient.findFirst({
        where: { id: choice.patientId, deletedAt: null },
        select: { id: true, primaryPhone: true, contactPersonPhone: true },
      });
      if (!found)
        throw new BadRequestException('Hồ sơ bệnh nhân đã chọn không tồn tại hoặc đã lưu trữ');
      const own = [found.primaryPhone, found.contactPersonPhone]
        .filter((value): value is string => !!value)
        .map(value => this.normalize(value));
      if (!own.some(value => phones.includes(value))) {
        throw new BadRequestException('Hồ sơ đã chọn không khớp số liên hệ của yêu cầu');
      }
      return { id: found.id, created: false };
    }
    if (!choice.createNewPatient) {
      const matches = await this.prisma.patient.findMany({
        where: this.patientsByPhone(phones),
        select: { id: true, fullName: true, dob: true },
        take: 20,
      });
      const exact = matches.filter(p => this.sameNameAndDob(p, row));
      if (exact.length === 1) return { id: exact[0].id, created: false };
      if (matches.length > 0) {
        throw new ConflictException(
          'Đã có hồ sơ dùng số điện thoại này. Hãy chọn hồ sơ phù hợp hoặc chọn tạo hồ sơ mới trước khi xác nhận.',
        );
      }
    }
    const dto: CreatePatientDto = {
      fullName: row.fullName,
      dob: row.dob.toISOString().slice(0, 10),
      gender: row.gender,
      primaryPhone: this.normalize(row.phone),
      email: row.email,
      contactPersonName: row.contactPersonName,
      contactPersonPhone: row.contactPersonPhone,
    };
    return { id: (await this.patients.create(dto, actor)).id, created: true };
  }

  /** The request's phones (own and guardian), normalized to 0xxx. */
  private requestPhones(row: { phone: string; contactPersonPhone?: string | null }) {
    const set = new Set<string>();
    for (const value of [row.phone, row.contactPersonPhone]) {
      if (value) set.add(this.normalize(value));
    }
    return [...set];
  }

  /** Live records whose own or guardian phone is one of `phones` (0xxx or +84xxx). */
  private patientsByPhone(phones: string[]): Prisma.PatientWhereInput {
    const variants = phones.flatMap(p => [p, this.altPhone(p)]);
    return {
      deletedAt: null,
      OR: [{ primaryPhone: { in: variants } }, { contactPersonPhone: { in: variants } }],
    };
  }

  private sameNameAndDob(p: { fullName: string; dob: Date }, row: { fullName: string; dob: Date }) {
    return (
      normalizeName(p.fullName) === normalizeName(row.fullName) &&
      p.dob.toISOString().slice(0, 10) === row.dob.toISOString().slice(0, 10)
    );
  }

  private validateDetails(dto: CreatePublicBookingRequestDto) {
    if (!dto.consent)
      throw new BadRequestException(
        'Cần đồng ý để phòng khám sử dụng thông tin nhằm xử lý yêu cầu đặt lịch',
      );
    const fullName = (dto.fullName ?? '').trim();
    if (fullName.length < 2) throw new BadRequestException('Họ và tên không hợp lệ');
    const details = {
      fullName,
      dob: this.parseDob(dto.dob),
      gender: dto.gender as Gender,
      phone: this.normalize(dto.phone),
      email: dto.email?.trim().toLowerCase() || null,
      contactPersonName: dto.contactPersonName?.trim() || null,
      contactPersonPhone: dto.contactPersonPhone?.trim()
        ? this.normalize(dto.contactPersonPhone)
        : null,
    };
    this.checkContact(details);
    return details;
  }

  /** "YYYY-MM-DD" of a real day (2026-02-30 is refused, not rolled over). */
  private parseDob(value: string) {
    if (!isCalendarDate(value)) throw new BadRequestException('Ngày sinh không hợp lệ');
    return new Date(value + 'T00:00:00Z');
  }

  /** Contact rules shared by a new request and the patient's later details. */
  private checkContact(d: {
    phone: string;
    dob: Date;
    email: string | null;
    contactPersonName: string | null;
    contactPersonPhone: string | null;
  }) {
    if (!isValidVnPhone(d.phone)) throw new BadRequestException('Số điện thoại không hợp lệ');
    if (!isValidDob(d.dob)) throw new BadRequestException('Ngày sinh không hợp lệ');
    if (d.email && !isValidEmail(d.email)) throw new BadRequestException('Email không hợp lệ');
    if (d.contactPersonPhone && !isValidVnPhone(d.contactPersonPhone))
      throw new BadRequestException('Số điện thoại người giám hộ không hợp lệ');
    const guardian = !!d.contactPersonName && !!d.contactPersonPhone;
    if (isMinor(d.dob) && !guardian)
      throw new BadRequestException('Bệnh nhân dưới 12 tuổi cần thông tin người giám hộ');
    if (!!d.contactPersonName !== !!d.contactPersonPhone)
      throw new BadRequestException('Cần nhập đủ tên và số điện thoại người giám hộ');
  }

  private async updateUnbookedRequest(id: string, expectedStatus: BookingRequestStatus, data: any) {
    const result = await this.prisma.bookingRequest.updateMany({
      where: { id, status: expectedStatus, appointmentId: null },
      data,
    });
    if (!result.count) throw new ConflictException('Yêu cầu đã thay đổi; hãy tải lại trạng thái.');
  }

  /** An open request whose effective time has come (the cron may not have run yet). */
  private isOverdue(row: {
    status: BookingRequestStatus;
    requestedStartAt: Date;
    proposedStartAt?: Date | null;
  }) {
    return ACTIVE.includes(row.status) && effectiveStartAt(row).getTime() <= Date.now();
  }

  /** Where-clauses for `statuses` whose effective time is after (gt) / at or before (lte) `now`. */
  private byEffectiveStart(
    statuses: BookingRequestStatus[],
    cmp: 'gt' | 'lte',
    now: Date,
  ): Prisma.BookingRequestWhereInput[] {
    const plain = statuses.filter(s => !PROPOSAL_STATUSES.includes(s));
    const proposal = statuses.filter(s => PROPOSAL_STATUSES.includes(s));
    const clauses: Prisma.BookingRequestWhereInput[] = [];
    if (plain.length) clauses.push({ status: { in: plain }, requestedStartAt: { [cmp]: now } });
    if (proposal.length) {
      clauses.push(
        { status: { in: proposal }, proposedStartAt: { [cmp]: now } },
        { status: { in: proposal }, proposedStartAt: null, requestedStartAt: { [cmp]: now } },
      );
    }
    return clauses;
  }

  private async requireActive(id: string) {
    const row = await this.prisma.bookingRequest.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('Không tìm thấy yêu cầu đặt lịch');
    if (row.appointmentId || !ACTIVE.includes(row.status))
      throw new ConflictException('Yêu cầu này đã được xử lý');
    return row;
  }

  private currentAssignment(day: Date): Prisma.DentistServiceWhereInput {
    return {
      effectiveFrom: { lte: day },
      OR: [{ effectiveTo: null }, { effectiveTo: { gte: day } }],
      dentist: {
        status: 'ACTIVE',
        deletedAt: null,
        userRoles: { some: { role: { code: 'dentist' } } },
        dentistProfile: {
          is: { acceptsOnlineBooking: true, practiceStatus: 'ACTIVE', deletedAt: null },
        },
      },
    };
  }

  /**
   * The dentist takes online bookings and performs this active service on
   * that clinic date; returns its length and buffers (the dentist's own
   * duration first, as the booking form does).
   */
  private async requireEligible(serviceId: string, dentistId: string, date: string) {
    const eligible = await this.prisma.dentistService.findFirst({
      where: {
        ...this.currentAssignment(new Date(date)),
        dentistId,
        serviceId,
        service: { isActive: true },
      },
      select: { id: true },
    });
    if (!eligible) throw new BadRequestException('Dịch vụ hoặc bác sĩ hiện không nhận đặt lịch');
    const plan = await this.appointments.planVisit(dentistId, [serviceId], date);
    return plan!;
  }

  private async assertSlot(dentistId: string, startAt: Date, plan: VisitPlan) {
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
      slotDuration: plan.durationMin,
      bufferBeforeMin: plan.bufferBeforeMin,
      bufferAfterMin: plan.bufferAfterMin,
    });
    if (!(slots.availableSlots as string[]).includes(time))
      throw new ConflictException('Khung giờ vừa được đặt hoặc không nằm trong lịch làm việc');
  }

  /**
   * A requester proves access with either the one-time token from the
   * confirmation link, or the phone number the request was made with (theirs
   * or the guardian's). The reference code is 40 random bits and the public
   * routes are rate limited, so reference + phone cannot be enumerated.
   * Both failures give the same answer, so neither reveals which part was
   * wrong.
   */
  private async verify(reference: string, access: PublicAccess) {
    const denied = new UnauthorizedException('Mã đặt lịch hoặc số điện thoại không đúng');
    const code = this.normalizeReference(reference);
    const token = access.token?.trim();
    const phone = access.phone ? this.normalize(access.phone) : '';
    if ((!token && !phone) || (token?.length ?? 0) > 100 || phone.length > 20) throw denied;
    const row = await this.prisma.bookingRequest.findUnique({
      where: { referenceCode: code },
      select: { id: true, accessTokenHash: true, phone: true, contactPersonPhone: true },
    });
    if (token) {
      const expected = Buffer.from(row?.accessTokenHash ?? '0'.repeat(64));
      const candidate = Buffer.from(this.hash(token));
      if (!row || !timingSafeEqual(candidate, expected)) throw denied;
    } else {
      const known = [row?.phone, row?.contactPersonPhone]
        .filter((v): v is string => !!v)
        .map(v => this.normalize(v));
      if (!row || !isValidVnPhone(phone) || !known.includes(phone)) throw denied;
    }
    return this.load(row.id);
  }

  private load(id: string) {
    return this.prisma.bookingRequest.findUniqueOrThrow({
      where: { id },
      include: PUBLIC_INCLUDE,
    });
  }

  /** "gs 1a2b3c4d5e", "GS1A2B…", "1a2b3c4d5e" → "GS-1A2B3C4D5E". */
  private normalizeReference(value: string) {
    const clean = (value ?? '').toUpperCase().replace(/[^0-9A-Z]/g, '');
    const body = clean.startsWith('GS') ? clean.slice(2) : clean;
    return 'GS-' + body.slice(0, 32);
  }

  private toPublic(row: any) {
    const useProposed = ['PROPOSED', 'PATIENT_ACCEPTED'].includes(row.status);
    const visit = row.appointment;
    return {
      referenceCode: row.referenceCode,
      status: row.status,
      requestedAt: row.createdAt,
      requestedStartAt: row.requestedStartAt,
      service: {
        name: row.service?.name ?? null,
        durationMinutes: row.service?.defaultDurationMin ?? null,
      },
      dentist: {
        // The booked visit first (it may have been reassigned); a proposal
        // may keep the requested dentist (no proposedDentist).
        fullName:
          visit?.dentist?.fullName ??
          (useProposed ? row.proposedDentist?.fullName : null) ??
          row.preferredDentist?.fullName ??
          null,
      },
      proposedStartAt: row.proposedStartAt,
      // Open but its time has passed (server clock): shown as expired even
      // before the cron closes it.
      overdue: !row.appointment && this.isOverdue(row),
      responseMessage: row.responseMessage,
      appointment: visit
        ? {
            startAt: visit.startAt,
            endAt: visit.endAt,
            // An archived visit no longer holds the time.
            status: visit.deletedAt ? 'CANCELLED' : visit.status,
            rescheduled: (visit.rescheduleCount ?? 0) > 0,
          }
        : null,
    };
  }

  private toStaff(row: any) {
    const { accessTokenHash: _hash, ...safe } = row;
    const service = row.service
      ? {
          id: row.service.id,
          name: row.service.name,
          durationMinutes: row.service.defaultDurationMin,
        }
      : row.service;
    return { ...safe, service };
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
      '</p><p>Mã đặt lịch: <strong>' +
      this.escape(reference) +
      '</strong></p><p><a href="' +
      this.escape(link) +
      '">Xem tình trạng lịch hẹn</a></p>' +
      '<p>Bạn cũng có thể tra cứu bất cứ lúc nào tại ' +
      this.escape(base) +
      '/booking/status bằng số điện thoại đã dùng khi đặt.</p>';
    return this.email.send({
      to,
      subject,
      html,
      text:
        message +
        '\nMã đặt lịch: ' +
        reference +
        '\n' +
        link +
        '\nTra cứu bằng số điện thoại đã dùng khi đặt: ' +
        base +
        '/booking/status',
    });
  }
  /**
   * Email the clinic (BOOKING_NOTIFY_EMAILS, comma separated) when a request
   * needs the front desk. Never throws: the patient's action has already
   * succeeded and must not fail because the clinic inbox is unreachable.
   */
  private async notifyStaff(id: string, headline: string) {
    const recipients = (process.env.BOOKING_NOTIFY_EMAILS ?? '')
      .split(/[,;\s]+/)
      .map(v => v.trim())
      .filter(v => v && isValidEmail(v));
    if (!recipients.length) return;
    try {
      const row = await this.prisma.bookingRequest.findUniqueOrThrow({
        where: { id },
        include: {
          service: { select: { name: true } },
          preferredDentist: { select: { fullName: true } },
        },
      });
      const when = (
        row.proposedStartAt && row.status === 'PATIENT_ACCEPTED'
          ? row.proposedStartAt
          : row.requestedStartAt
      ).toLocaleString('vi-VN', {
        timeZone: 'Asia/Ho_Chi_Minh',
        weekday: 'long',
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
      const base =
        process.env.FRONTEND_URL || process.env.PUBLIC_APP_URL || 'https://gensmile.online';
      const link = base + '/booking-requests';
      const lines: Array<[string, string]> = [
        ['Mã', row.referenceCode],
        ['Khách', row.fullName],
        ['Điện thoại', row.phone],
        ['Dịch vụ', row.service?.name ?? '—'],
        ['Bác sĩ', row.preferredDentist?.fullName ?? '—'],
        ['Thời gian', when],
        ...(row.reason ? ([['Lý do', row.reason]] as Array<[string, string]>) : []),
      ];
      const html =
        '<p><strong>' +
        this.escape(headline) +
        '</strong></p><table cellpadding="4">' +
        lines
          .map(
            ([k, v]) =>
              '<tr><td style="color:#666">' + k + '</td><td>' + this.escape(v) + '</td></tr>',
          )
          .join('') +
        '</table><p><a href="' +
        this.escape(link) +
        '">Mở danh sách yêu cầu đặt lịch</a></p>';
      const text = headline + '\n' + lines.map(([k, v]) => k + ': ' + v).join('\n') + '\n' + link;
      await Promise.all(
        recipients.map(to =>
          this.email.send({
            to,
            subject: '[GENSMILE] ' + headline + ' — ' + row.fullName + ', ' + when,
            html,
            text,
          }),
        ),
      );
    } catch (error) {
      this.logger.warn(`Could not notify the clinic about booking ${id}: ${String(error)}`);
    }
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

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
import { lockBookingPhone } from '../appointments/domain/advisory-lock';
import {
  AvailabilityService,
  effectiveDentistId,
  effectiveStartAt,
  OpenRequestRow,
  RequestIssue,
  RequestPlanRules,
} from '../appointments/availability.service';

export { effectiveStartAt };

import { PatientsService } from '../patients/patients.service';
import { CreatePatientDto } from '../patients/dto/patient.dto';
import { JwtPayload } from '../common/guards/permissions.guard';
import { clinicDateOnly, CLINIC_UTC_OFFSET_MS, startOfClinicDay } from '../common/date-range.util';
import {
  isMinor,
  isValidDob,
  isValidEmail,
  isValidVnPhone,
} from '../patients/domain/patient-rules';
import { AuditService } from '../audit/audit.service';
import { dentistProfileFilter, SCHEDULABLE_ACCOUNT_WHERE } from '../staff/staff-rules';
import { EmailService } from '../common/services/email.service';
import {
  AcceptBookingProposalDto,
  BookingRequestMessageDto,
  BookingRequestNoteDto,
  CreatePublicBookingRequestDto,
  isCalendarDate,
  ListBookingRequestsDto,
  PendingInRangeQueryDto,
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
      // Any move of time or dentist (reschedule, transfer, reassigned day).
      _count: { select: { rescheduleLogs: true } },
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
const DEFAULT_MAX_DAYS_AHEAD = 60;
/** How far past an empty day the public page looks for the next free one. */
const NEXT_FREE_SCAN_DAYS = 14;
/** Open requests (nearest first) checked for `slotIssue` per inbox load. */
const ISSUE_CHECK_LIMIT = 30;
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
 * Minimum notice for an online request (BOOKING_MIN_LEAD_MIN, default 120
 * minutes), so the front desk has time to confirm it. Staff booking directly
 * is not affected.
 */
export function bookingMinLeadMinutes(): number {
  const raw = process.env.BOOKING_MIN_LEAD_MIN?.trim();
  const value = raw ? Number(raw) : NaN;
  return Number.isInteger(value) && value >= 0 ? value : DEFAULT_MIN_LEAD_MIN;
}

/**
 * How far ahead an online request may be (BOOKING_MAX_DAYS_AHEAD, default
 * 60 days after the clinic's today). Staff booking directly is not affected.
 */
export function bookingMaxDaysAhead(): number {
  const raw = process.env.BOOKING_MAX_DAYS_AHEAD?.trim();
  const value = raw ? Number(raw) : NaN;
  return Number.isInteger(value) && value >= 1 && value <= 730 ? value : DEFAULT_MAX_DAYS_AHEAD;
}

/** "YYYY-MM-DD" `days` after a clinic date. */
export function addClinicDays(date: string, days: number): string {
  const d = new Date(date + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** The last clinic date an online request may be for. */
export function lastBookableDate(now = new Date()): string {
  return addClinicDays(clinicDateOnly(now), bookingMaxDaysAhead());
}

const tooFarMessage = () =>
  'Chỉ nhận đặt lịch trực tuyến trong vòng ' +
  bookingMaxDaysAhead() +
  ' ngày tới. Nếu cần hẹn xa hơn, vui lòng gọi phòng khám.';

export type { RequestIssue };

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
    private readonly availability: AvailabilityService,
  ) {}

  /**
   * Services that at least one dentist takes online bookings for today, with
   * only the dentists who have working hours in the bookable range (a weekly
   * schedule valid then, or an approved extra shift): a dentist with none
   * could only ever show "no free time". Only services the clinic offers
   * online (the front desk lists dentists per request instead).
   */
  async options() {
    const todayDate = clinicDateOnly();
    const today = new Date(todayDate);
    const rows = await this.prisma.service.findMany({
      where: {
        isActive: true,
        category: { isActive: true },
        bookableOnline: true,
      },
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
                dentistProfile: { select: { specialties: true, bio: true } },
              },
            },
          },
        },
      },
    });
    const scheduled = await this.scheduledDentists(
      [...new Set(rows.flatMap(s => s.dentistServices.map(a => a.dentist.id)))],
      todayDate,
      lastBookableDate(),
    );
    return rows
      .map(s => ({
        id: s.id,
        code: s.code,
        name: s.name,
        category: s.category.name,
        description: s.description,
        durationMinutes: s.defaultDurationMin,
        basePrice: s.basePrice,
        dentists: s.dentistServices
          .filter(a => scheduled.has(a.dentist.id))
          .map(a => ({
            id: a.dentist.id,
            fullName: a.dentist.fullName,
            specialties: a.dentist.dentistProfile?.specialties ?? [],
            bio: a.dentist.dentistProfile?.bio ?? null,
            durationMinutes: a.durationMin ?? s.defaultDurationMin,
          })),
      }))
      .filter(s => s.dentists.length > 0);
  }

  /**
   * The public price list: active services the clinic chose to show, bookable
   * online or not. `price` is the lowest price any dentist performing it
   * today charges (their own price, else the list price) and `priceFrom`
   * says the others charge more; null means "ask the clinic" (0 without the
   * service being marked free). Whether it can be booked online is what
   * options() lists.
   */
  async priceList() {
    const today = new Date(clinicDateOnly());
    const rows = await this.prisma.service.findMany({
      where: { isActive: true, showPublicPrice: true, category: { isActive: true } },
      orderBy: [{ category: { sortOrder: 'asc' } }, { name: 'asc' }],
      include: {
        category: { select: { name: true } },
        dentistServices: {
          where: {
            effectiveFrom: { lte: today },
            OR: [{ effectiveTo: null }, { effectiveTo: { gte: today } }],
            // Dentists who can be booked at the desk (as options(), without
            // the online-only conditions).
            dentist: {
              ...SCHEDULABLE_ACCOUNT_WHERE,
              userRoles: { some: { role: { code: 'dentist' } } },
              dentistProfile: { is: dentistProfileFilter('booking') },
            },
          },
          select: { price: true },
        },
      },
    });
    return rows.map(s => {
      const base = Number(s.basePrice);
      const prices = s.dentistServices.map(a => Number(a.price ?? s.basePrice));
      const paid = (prices.length ? prices : [base]).filter(p => p > 0);
      const allFree = s.isFree && prices.every(p => p === 0);
      const price = allFree ? 0 : paid.length ? Math.min(...paid) : null;
      return {
        id: s.id,
        name: s.name,
        category: s.category.name,
        durationMinutes: s.defaultDurationMin,
        isFree: allFree,
        price,
        priceFrom: price !== null && !allFree && paid.some(p => p !== price),
      };
    });
  }

  /** Of `ids`, the dentists with working hours at some point in [from, to]. */
  private async scheduledDentists(ids: string[], from: string, to: string) {
    if (!ids.length) return new Set<string>();
    const [weekly, shifts] = await Promise.all([
      this.prisma.workingSchedule.findMany({
        where: {
          dentistId: { in: ids },
          deletedAt: null,
          validFrom: { lte: new Date(to) },
          OR: [{ validTo: null }, { validTo: { gte: new Date(from) } }],
        },
        select: { dentistId: true },
        distinct: ['dentistId'],
      }),
      this.prisma.shiftRegistration.findMany({
        where: {
          dentistId: { in: ids },
          status: 'APPROVED',
          deletedAt: null,
          date: { gte: new Date(from), lte: new Date(to) },
        },
        select: { dentistId: true },
        distinct: ['dentistId'],
      }),
    ]);
    return new Set([...weekly, ...shifts].map(r => r.dentistId));
  }

  /**
   * Free start times for an online request on one day. An empty day says why
   * (`emptyReason`: CLINIC_CLOSED, CLOSED, NO_SCHEDULE, TIME_OFF, FULL,
   * TOO_SOON) and, when asked (`next`), names the next day with a free time
   * within NEXT_FREE_SCAN_DAYS.
   */
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
    const lastDate = lastBookableDate();
    if (q.date > lastDate) throw new BadRequestException(tooFarMessage());
    const { plan, until } = await this.eligibility(q.serviceId, q.dentistId, q.date, true);
    const day = await this.publicDay(q.dentistId, q.date, plan);
    const nextAvailableDate =
      q.next && !day.availableSlots.length
        ? await this.nextPublicDay(
            q.dentistId,
            q.date,
            plan,
            until && until < lastDate ? until : lastDate,
          )
        : null;
    return {
      ...day,
      serviceId: q.serviceId,
      nextAvailableDate,
      lastDate,
      maxDaysAhead: bookingMaxDaysAhead(),
    };
  }

  /**
   * The first day after `date` (up to `last`) with a free online time. The
   * dentist's weekly hours, extra shifts and changed hours for the range are
   * read once, so only days with working hours are loaded, and the search
   * stops at the first free one (at most NEXT_FREE_SCAN_DAYS days).
   */
  private async nextPublicDay(dentistId: string, date: string, plan: VisitPlan, last: string) {
    const end =
      addClinicDays(date, NEXT_FREE_SCAN_DAYS) < last
        ? addClinicDays(date, NEXT_FREE_SCAN_DAYS)
        : last;
    const from = new Date(addClinicDays(date, 1));
    const to = new Date(end);
    if (from > to) return null;
    const [weekly, shifts, changed] = await Promise.all([
      this.prisma.workingSchedule.findMany({
        where: {
          dentistId,
          deletedAt: null,
          validFrom: { lte: to },
          OR: [{ validTo: null }, { validTo: { gte: from } }],
        },
        select: { dayOfWeek: true, validFrom: true, validTo: true },
      }),
      this.prisma.shiftRegistration.findMany({
        where: { dentistId, status: 'APPROVED', deletedAt: null, date: { gte: from, lte: to } },
        select: { date: true },
      }),
      this.prisma.scheduleOverride.findMany({
        where: { dentistId, kind: 'CHANGED_HOURS', deletedAt: null, date: { gte: from, lte: to } },
        select: { date: true },
      }),
    ]);
    const extra = new Set([...shifts, ...changed].map(r => r.date.toISOString().slice(0, 10)));
    for (let next = addClinicDays(date, 1); next <= end; next = addClinicDays(next, 1)) {
      const d = new Date(next);
      const works =
        extra.has(next) ||
        weekly.some(
          w => w.dayOfWeek === d.getUTCDay() && w.validFrom <= d && (!w.validTo || w.validTo >= d),
        );
      if (works && (await this.publicDay(dentistId, next, plan)).availableSlots.length) return next;
    }
    return null;
  }

  /**
   * One day's online slots: the booking form's grid, minus the notice period.
   * A clinic-wide closure shows its reason (written for patients); a
   * dentist's own closed-day note stays internal.
   */
  private async publicDay(dentistId: string, date: string, plan: VisitPlan) {
    const data = await this.appointments.getAvailability({
      dentistId,
      date,
      slotDuration: plan.durationMin,
      bufferBeforeMin: plan.bufferBeforeMin,
      bufferAfterMin: plan.bufferAfterMin,
    });
    const minLeadMinutes = bookingMinLeadMinutes();
    const earliest = Date.now() + Math.max(minLeadMinutes * 60_000, 60_000);
    const availableSlots = data.availableSlots.filter(
      time => new Date(date + 'T' + time + ':00+07:00').getTime() > earliest,
    );
    const clinicClosed = 'clinicClosed' in data && data.clinicClosed === true;
    return {
      ...data,
      closedReason: clinicClosed ? data.closedReason : undefined,
      minLeadMinutes,
      availableSlots,
      emptyReason: availableSlots.length
        ? null
        : clinicClosed
          ? 'CLINIC_CLOSED'
          : (data.blockedReason ?? (data.availableSlots.length ? 'TOO_SOON' : 'FULL')),
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
    if (clinicDateOnly(startAt) > lastBookableDate()) {
      throw new BadRequestException(tooFarMessage());
    }
    const plan = await this.requireEligible(
      dto.serviceId,
      dto.dentistId,
      clinicDateOnly(startAt),
      true,
    );
    await this.assertSlot(dto.dentistId, startAt, plan);
    const token = randomBytes(32).toString('base64url');
    const ref = 'GS-' + randomBytes(5).toString('hex').toUpperCase();
    const row = await this.prisma.$transaction(async tx => {
      // A double submit (or a second tab) must not queue the same visit
      // twice: submissions from one phone are serialized, so the duplicate
      // check and the insert are atomic.
      await lockBookingPhone(tx, details.phone);
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
    // Only real changes are written; a field left out (or sent unchanged)
    // keeps what was stored (the public API never shows the stored details,
    // so the form cannot send them back). The checks run on the merged result.
    const changes: Prisma.BookingRequestUpdateManyMutationInput = {};
    const differs = (next: string | undefined, stored: string | null) =>
      next !== undefined && next !== '' && next !== (stored ?? '');
    const fullName = dto.fullName?.trim();
    if (differs(fullName, row.fullName)) changes.fullName = fullName;
    if (dto.dob !== undefined) {
      const dob = this.parseDob(dto.dob);
      if (dob.getTime() !== row.dob.getTime()) changes.dob = dob;
    }
    if (dto.gender !== undefined && dto.gender !== row.gender) changes.gender = dto.gender;
    const phone = dto.phone?.trim() ? this.normalize(dto.phone) : undefined;
    if (differs(phone, this.normalize(row.phone))) changes.phone = phone;
    const email = dto.email?.trim().toLowerCase();
    if (differs(email, row.email)) changes.email = email;
    const guardianName = dto.contactPersonName?.trim();
    if (differs(guardianName, row.contactPersonName)) changes.contactPersonName = guardianName;
    const guardianPhone = dto.contactPersonPhone?.trim()
      ? this.normalize(dto.contactPersonPhone)
      : undefined;
    const storedGuardianPhone = row.contactPersonPhone
      ? this.normalize(row.contactPersonPhone)
      : null;
    if (differs(guardianPhone, storedGuardianPhone)) changes.contactPersonPhone = guardianPhone;
    const reason = dto.reason?.trim();
    if (differs(reason, row.reason)) changes.reason = reason;
    if (!Object.keys(changes).length) {
      throw new BadRequestException(
        'Chưa có thông tin nào thay đổi. Vui lòng nhập thông tin phòng khám cần bổ sung.',
      );
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
    // Only the nearest open requests still ahead are checked (each costs a
    // day load); issuesFor caches days and plans per dentist and date.
    const now = Date.now();
    const issues = await this.issuesFor(
      active
        .filter(r => !r.appointmentId && effectiveStartAt(r).getTime() > now)
        .slice(0, ISSUE_CHECK_LIMIT),
    );
    return [...active, ...rest].map(r => ({
      ...this.toStaff(r),
      slotIssue: issues.get(r.id) ?? null,
    }));
  }

  /**
   * Open, unbooked requests (for one dentist, or all) whose time falls in
   * [from, to] (clinic dates), nearest first, each with `slotIssue`: why it
   * can no longer be confirmed as it stands (closed day, time-off, no
   * schedule, suspended dentist, service no longer offered, time taken), or
   * null. For showing next to the visits a schedule change affects.
   */
  async pendingInRange(q: PendingInRangeQueryDto) {
    if (q.to < q.from) throw new BadRequestException('Khoảng ngày không hợp lệ');
    if (q.to > addClinicDays(q.from, 366))
      throw new BadRequestException('Khoảng ngày tối đa 1 năm');
    const from = startOfClinicDay(q.from);
    const to = new Date(startOfClinicDay(q.to).getTime() + 24 * 60 * 60_000);
    // The time and dentist a request is about (effectiveStartAt /
    // effectiveDentistId) decide, in the query itself so `take` counts only
    // matching rows: the proposal's while one stands, else the request's.
    const range = { gte: from, lt: to };
    const plain = ACTIVE.filter(s => !PROPOSAL_STATUSES.includes(s));
    const proposal = ACTIVE.filter(s => PROPOSAL_STATUSES.includes(s));
    const requested = q.dentistId ? { preferredDentistId: q.dentistId } : {};
    const proposed = q.dentistId
      ? {
          OR: [
            { proposedDentistId: q.dentistId },
            { proposedDentistId: null, preferredDentistId: q.dentistId },
          ],
        }
      : {};
    const rows = await this.prisma.bookingRequest.findMany({
      where: {
        appointmentId: null,
        OR: [
          { status: { in: plain }, requestedStartAt: range, ...requested },
          { status: { in: proposal }, proposedStartAt: range, ...proposed },
          { status: { in: proposal }, proposedStartAt: null, requestedStartAt: range, ...proposed },
        ],
      },
      orderBy: { requestedStartAt: 'asc' },
      take: 200,
      include: STAFF_INCLUDE,
    });
    const inRange = rows.sort(
      (a, b) => effectiveStartAt(a).getTime() - effectiveStartAt(b).getTime(),
    );
    const issues = await this.issuesFor(inRange);
    return inRange.map(r => ({ ...this.toStaff(r), slotIssue: issues.get(r.id) ?? null }));
  }

  /**
   * Dentists the front desk may offer this request to: still seeing
   * patients and performing its service (online booking or not), or having
   * performed it when the patient sent the request (a service withdrawn
   * since). The exact date is checked on propose.
   */
  async dentistOptions(id: string) {
    const row = await this.prisma.bookingRequest.findUnique({
      where: { id },
      select: { serviceId: true, createdAt: true },
    });
    if (!row) throw new NotFoundException('Không tìm thấy yêu cầu đặt lịch');
    const today = new Date(clinicDateOnly());
    const sent = new Date(clinicDateOnly(row.createdAt));
    const rows = await this.prisma.dentistService.findMany({
      where: {
        serviceId: row.serviceId,
        OR: [
          {
            service: { isActive: true },
            OR: [{ effectiveTo: null }, { effectiveTo: { gte: today } }],
          },
          {
            effectiveFrom: { lte: sent },
            OR: [{ effectiveTo: null }, { effectiveTo: { gte: sent } }],
          },
        ],
        dentist: {
          status: 'ACTIVE',
          deletedAt: null,
          userRoles: { some: { role: { code: 'dentist' } } },
          OR: [
            { dentistProfile: null },
            { dentistProfile: { practiceStatus: 'ACTIVE', deletedAt: null } },
          ],
        },
      },
      select: { dentist: { select: { id: true, fullName: true } } },
    });
    const byId = new Map(rows.map(r => [r.dentist.id, r.dentist]));
    return [...byId.values()].sort((a, b) => a.fullName.localeCompare(b.fullName, 'vi'));
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
      where: await this.patientsByPhone(phones),
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
    if (!Number.isFinite(startAt.getTime()))
      throw new BadRequestException('Khung giờ không hợp lệ');
    // Any dentist who can take the visit, not only the one asked for: a
    // proposal is how a request stranded by a schedule change is rescued.
    const plan = await this.staffPlan(row, dto.dentistId, clinicDateOnly(startAt));
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
    const plan = await this.staffPlan(row, dentistId, clinicDateOnly(startAt));
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
        { id: row.id, expectedStatuses: [row.status], plan },
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
        where: await this.patientsByPhone(phones),
        select: { id: true, fullName: true, dob: true, primaryPhone: true },
        take: 20,
      });
      // Picked automatically only as before: the record's own phone is the
      // request's phone, with the same name and date of birth, and no other
      // record shares that name and date. A match through a guardian phone
      // (typed by whoever filled in the public form) always needs a person.
      const exact = matches.filter(p => this.sameNameAndDob(p, row));
      const own = this.normalize(row.phone);
      if (
        exact.length === 1 &&
        !!exact[0].primaryPhone &&
        this.normalize(exact[0].primaryPhone) === own
      ) {
        return { id: exact[0].id, created: false };
      }
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

  /**
   * Live records whose own or guardian phone is one of `phones` (normalized
   * 0xxx). Patient phones are stored as typed ("090 123 4567", "+84…"), so the
   * stored value is normalized in SQL the same way `normalize` does.
   */
  private async patientsByPhone(phones: string[]): Promise<Prisma.PatientWhereInput> {
    if (phones.length === 0) return { id: { in: [] } };
    const rows = await this.prisma.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM patients
      WHERE deleted_at IS NULL
        AND (
          regexp_replace(regexp_replace(COALESCE(primary_phone, ''), '[[:space:]()-]', '', 'g'), '^[+]84', '0')
            = ANY(${phones}::text[])
          OR regexp_replace(regexp_replace(COALESCE(contact_person_phone, ''), '[[:space:]()-]', '', 'g'), '^[+]84', '0')
            = ANY(${phones}::text[])
        )
      LIMIT 50`;
    return { deletedAt: null, id: { in: rows.map(r => r.id) } };
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
      // Same dentists as the staff booking form (PENDING_SETUP accounts
      // included, on-leave employees excluded), narrowed to those who take
      // online bookings from new patients.
      dentist: {
        ...SCHEDULABLE_ACCOUNT_WHERE,
        userRoles: { some: { role: { code: 'dentist' } } },
        dentistProfile: {
          is: {
            ...dentistProfileFilter('booking'),
            acceptsOnlineBooking: true,
            acceptsNewPatients: true,
          },
        },
      },
    };
  }

  /**
   * The dentist takes online bookings and performs this active service on
   * that clinic date; returns its length and buffers (the dentist's own
   * duration first, as the booking form does). `online`: a patient's own
   * request, so the service must also be offered online.
   */
  private async requireEligible(
    serviceId: string,
    dentistId: string,
    date: string,
    online = false,
  ) {
    return (await this.eligibility(serviceId, dentistId, date, online)).plan;
  }

  /** requireEligible, plus the assignment's last day ("YYYY-MM-DD", null = open). */
  private async eligibility(serviceId: string, dentistId: string, date: string, online = false) {
    const eligible = await this.prisma.dentistService.findFirst({
      where: {
        ...this.currentAssignment(new Date(date)),
        dentistId,
        serviceId,
        service: { isActive: true, ...(online ? { bookableOnline: true } : {}) },
      },
      select: { id: true, effectiveTo: true },
    });
    if (!eligible) throw new BadRequestException('Dịch vụ hoặc bác sĩ hiện không nhận đặt lịch');
    const plan = await this.appointments.planVisit(dentistId, [serviceId], date);
    return {
      plan: plan!,
      until: eligible.effectiveTo ? eligible.effectiveTo.toISOString().slice(0, 10) : null,
    };
  }

  /**
   * The front desk's version of requireEligible (AvailabilityService.requestPlan):
   * a service withdrawn after the patient sent the request still counts.
   */
  private staffPlan(
    row: { serviceId: string; createdAt: Date },
    dentistId: string,
    date: string,
  ): Promise<VisitPlan> {
    return this.availability.requestPlan(this.planRules(), row, dentistId, date);
  }

  private planRules(): RequestPlanRules {
    return {
      validateDentist: id => this.appointments.validateDentist(id),
      planVisit: (dentistId, serviceIds, date) =>
        this.appointments.planVisit(dentistId, serviceIds, date),
    };
  }

  /**
   * The visit fits the dentist's day: inside working hours, clear of
   * time-off, closed ranges and other bookings (with buffers). Any valid
   * start counts, on the suggested grid or not; the message says what is
   * wrong.
   */
  private async assertSlot(dentistId: string, startAt: Date, plan: VisitPlan) {
    if (!Number.isFinite(startAt.getTime()) || startAt.getTime() <= Date.now() + 60_000)
      throw new BadRequestException('Khung giờ phải ở phía trước');
    if (startAt.getUTCSeconds() !== 0 || startAt.getUTCMilliseconds() !== 0)
      throw new BadRequestException('Khung giờ không hợp lệ');
    const problem = await this.availability.checkSlot(
      dentistId,
      startAt,
      new Date(startAt.getTime() + plan.durationMin * 60_000),
      { buffers: { beforeMin: plan.bufferBeforeMin, afterMin: plan.bufferAfterMin } },
    );
    if (problem) throw new ConflictException(problem.message);
  }

  /** The dentist a request is about: the proposed one while a proposal stands. */
  private effectiveDentistId(row: {
    status: BookingRequestStatus;
    preferredDentistId: string;
    proposedDentistId?: string | null;
  }) {
    return effectiveDentistId(row);
  }

  /**
   * Why each open request can no longer be confirmed as it stands, or null
   * (AvailabilityService.requestIssues, shared with schedule-change impact).
   */
  private issuesFor(rows: OpenRequestRow[]) {
    return this.availability.requestIssues(this.planRules(), rows);
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
            rescheduled:
              (visit.rescheduleCount ?? 0) > 0 || (visit._count?.rescheduleLogs ?? 0) > 0,
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

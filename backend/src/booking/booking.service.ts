import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { BookingRequestStatus, Gender, Prisma } from '@prisma/client';
import { createHash, randomBytes, timingSafeEqual } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { AppointmentsService, VisitPlan } from '../appointments/appointments.service';
import { LOCKING_TX_OPTIONS, lockBookingPhone } from '../appointments/domain/advisory-lock';
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
  BookingArrivedDto,
  BookingRequestMessageDto,
  BookingRequestNoteDto,
  ConfirmBookingRequestDto,
  CreatePublicBookingRequestDto,
  DeclineBookingProposalDto,
  DeclineBookingRequestDto,
  isCalendarDate,
  ListBookingRequestsDto,
  PendingInRangeQueryDto,
  ProposeBookingTimeDto,
  PublicBookingNoteDto,
  PublicSlotsQueryDto,
  ReceptionistNoteDto,
  UpdateBookingContactDto,
  UpdatePublicBookingDetailsDto,
} from './dto/booking.dto';
import { formatVisitTime } from './clinic-time-format';
import {
  bookingNotifyRecipients,
  clinicAddressLine,
  clinicContactLine,
  publicAppUrl,
} from './clinic-contact';

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
      id: true,
      status: true,
      startAt: true,
      endAt: true,
      dentistId: true,
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
/** Why a time no longer works, in the patient's words (never the internal notes). */
const PATIENT_ISSUE_TEXT: Record<string, string> = {
  CLOSED: 'phòng khám nghỉ vào thời gian này',
  TIME_OFF: 'bác sĩ nghỉ vào thời gian này',
  OUTSIDE_WORKING_HOURS: 'giờ này nằm ngoài giờ làm việc của bác sĩ',
  NOT_BOOKABLE: 'bác sĩ hoặc dịch vụ này hiện không còn nhận lịch',
  SLOT_CONFLICT: 'giờ này vừa có người khác đặt',
};
export const patientIssueText = (kind: string) =>
  PATIENT_ISSUE_TEXT[kind] ?? 'giờ này không còn trống';
const slotGoneMessage = (kind: string) =>
  'Rất tiếc, giờ phòng khám đề xuất không còn dùng được: ' +
  patientIssueText(kind) +
  '. Hãy bấm “Không đồng ý giờ này” để lễ tân chọn giờ khác, hoặc gọi phòng khám.';
/** A change needs the link from the confirmation email; the phone only shows the status. */
export const MANAGE_NEEDS_LINK_MESSAGE =
  'Để thay đổi yêu cầu, vui lòng mở đường link trong email xác nhận hoặc gọi phòng khám.';
const CONTACT_CHANGE_MESSAGE =
  'Không thể đổi số điện thoại hoặc email trên trang này. Vui lòng gọi phòng khám để được hỗ trợ.';
/**
 * Open requests one person (phone + name + date of birth) may have at a
 * time; a phone shared by a family may have more, up to MAX_OPEN_PER_PHONE.
 * Requests one phone, or one email, may send per clinic day.
 */
export const MAX_OPEN_PER_PERSON = 3;
export const MAX_OPEN_PER_PHONE = 6;
export const MAX_DAILY_PER_PHONE = 8;
export const MAX_DAILY_PER_EMAIL = 5;
/** Names on the public form: letters (any script), spaces and . ' - only. */
const NAME_MAX = 100;
const NAME_PATTERN = /^[\p{L}\p{M}][\p{L}\p{M} .'’-]*$/u;
const DEFAULT_PATIENT_CANCEL_MIN_HOURS = 4;
/** A request this close to its time is flagged urgent in the clinic's email. */
const URGENT_MS = 12 * 60 * 60_000;

/**
 * How long before a confirmed visit the patient may still cancel it from
 * the link (BOOKING_PATIENT_CANCEL_MIN_HOURS, default 4); later, they call.
 */
export function patientCancelMinHours(): number {
  const raw = process.env.BOOKING_PATIENT_CANCEL_MIN_HOURS?.trim();
  const value = raw ? Number(raw) : NaN;
  return Number.isFinite(value) && value >= 0 && value <= 24 * 14
    ? value
    : DEFAULT_PATIENT_CANCEL_MIN_HOURS;
}

/** "Nguyễn Văn An" → "N*** V** A*": tells family members apart without the name. */
export function maskName(value: string): string {
  return value
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map(w => {
      const chars = [...w];
      return chars[0] + '*'.repeat(Math.min(Math.max(chars.length - 1, 1), 3));
    })
    .join(' ');
}

/** Phones as people type them: spaces, dots, dashes, (+)84 / 0084 prefixes → 0xxx. */
export function normalizePhone(value: string): string {
  const clean = value.replace(/[\s().-]/g, '');
  if (clean.startsWith('+84')) return '0' + clean.slice(3);
  if (clean.startsWith('0084')) return '0' + clean.slice(4);
  if (/^84\d{9}$/.test(clean)) return '0' + clean.slice(2);
  return clean;
}
const PROPOSAL_OPEN_MESSAGE =
  'Yêu cầu đang có giờ đề xuất nên không thể yêu cầu bổ sung (giờ đã thống nhất sẽ bị mất). ' +
  'Hãy gọi khách để trao đổi, đề xuất giờ khác hoặc từ chối yêu cầu.';

/** "HH:mm" at the clinic (UTC+7). */
function clinicHhmm(value: Date): string {
  return new Date(value.getTime() + CLINIC_UTC_OFFSET_MS).toISOString().slice(11, 16);
}

/** Names compared the way people type them: NFC, single spaces, any case. */
export function normalizeName(value: string): string {
  return value.normalize('NFC').replace(/\s+/g, ' ').trim().toLocaleLowerCase('vi');
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
        // Only when the clinic publishes this service's price.
        ...(s.showPublicPrice ? { basePrice: s.basePrice } : {}),
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
   * service being marked free). A free service that some dentists charge for
   * is "from 0" (price 0, priceFrom). Whether it can be booked online is what
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
      const all = prices.length ? prices : [base];
      const paid = all.filter(p => p > 0);
      const allFree = s.isFree && paid.length === 0;
      // Free with some dentists, paid with others: not "Miễn phí", but "từ 0 đ".
      const partlyFree = s.isFree && !allFree && all.some(p => p === 0);
      const price = allFree || partlyFree ? 0 : paid.length ? Math.min(...paid) : null;
      return {
        id: s.id,
        name: s.name,
        category: s.category.name,
        durationMinutes: s.defaultDurationMin,
        isFree: allFree,
        price,
        priceFrom: price !== null && !allFree && (partlyFree || paid.some(p => p !== price)),
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
   * dentist's own closed-day note stays internal. An empty day says why
   * (DAY_OVER: today's working hours are over).
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
    // No time left because the day is (nearly) over is not "full": the last
    // moment a visit could still start in some working window.
    const windows = data.windows ?? [];
    const lastStart = !windows.length
      ? Infinity
      : Math.max(
          ...windows.map(w => {
            const end = new Date(date + 'T' + w.endTime + ':00+07:00').getTime();
            // A window running to midnight ends on the next day.
            return (
              (w.endTime <= w.startTime ? end + 24 * 60 * 60_000 : end) - plan.durationMin * 60_000
            );
          }),
        );
    const emptyReason = availableSlots.length
      ? null
      : clinicClosed
        ? 'CLINIC_CLOSED'
        : (data.blockedReason ??
          (lastStart <= Date.now()
            ? 'DAY_OVER'
            : data.availableSlots.length || lastStart <= earliest
              ? 'TOO_SOON'
              : 'FULL'));
    return {
      ...data,
      closedReason: clinicClosed ? data.closedReason : undefined,
      minLeadMinutes,
      availableSlots,
      emptyReason,
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
    // Online, only the times the public page offers (the slot grid, notice
    // period included): an off-grid 09:07 is for the front desk to arrange.
    const offered = await this.publicDay(dto.dentistId, clinicDateOnly(startAt), plan);
    if (!offered.availableSlots.includes(clinicHhmm(startAt))) {
      throw new ConflictException(
        'Giờ này không còn trống hoặc không nằm trong các giờ nhận đặt trực tuyến. ' +
          'Vui lòng chọn một giờ trong danh sách giờ còn trống.',
      );
    }
    const token = randomBytes(32).toString('base64url');
    const ref = 'GS-' + randomBytes(5).toString('hex').toUpperCase();
    const row = await this.prisma.$transaction(async tx => {
      // A double submit (or a second tab) must not queue the same visit
      // twice: submissions from one phone are serialized, so the duplicate
      // check and the insert are atomic.
      await lockBookingPhone(tx, details.phone);
      // Open requests from this phone, for the duplicate check and the
      // limits. A family shares one phone: the same time for another person
      // (two children seen at once by two dentists) is not a duplicate.
      const openRows: Array<{
        fullName: string;
        dob: Date;
        requestedStartAt: Date;
        proposedStartAt: Date | null;
      }> = await tx.bookingRequest.findMany({
        where: { phone: details.phone, status: { in: ACTIVE }, appointmentId: null },
        select: { fullName: true, dob: true, requestedStartAt: true, proposedStartAt: true },
      });
      const samePerson = (openRows ?? []).filter(r => this.sameNameAndDob(r, details));
      if (
        samePerson.some(
          r =>
            r.requestedStartAt.getTime() === startAt.getTime() ||
            r.proposedStartAt?.getTime() === startAt.getTime(),
        )
      ) {
        throw new ConflictException(
          'Người khám này đã có yêu cầu đặt lịch đang chờ xử lý vào đúng giờ này. ' +
            'Vui lòng tra cứu lịch hẹn bằng số điện thoại hoặc gọi phòng khám.',
        );
      }
      // Spam limits, counted under the same lock as the insert.
      const dayStart = startOfClinicDay(clinicDateOnly());
      const [today, todayByEmail] = await Promise.all([
        tx.bookingRequest.count({
          where: { phone: details.phone, createdAt: { gte: dayStart } },
        }),
        details.email
          ? tx.bookingRequest.count({
              where: { email: details.email, createdAt: { gte: dayStart } },
            })
          : Promise.resolve(0),
      ]);
      if (samePerson.length >= MAX_OPEN_PER_PERSON) {
        throw new ConflictException(
          'Người khám này đã có ' +
            samePerson.length +
            ' yêu cầu đặt lịch đang chờ xử lý nên chưa nhận thêm yêu cầu trực tuyến. ' +
            'Vui lòng chờ phòng khám xử lý, hủy bớt yêu cầu bằng đường link trong email, hoặc gọi phòng khám.',
        );
      }
      if ((openRows ?? []).length >= MAX_OPEN_PER_PHONE) {
        throw new ConflictException(
          'Số điện thoại này đã có ' +
            openRows.length +
            ' yêu cầu đặt lịch đang chờ xử lý. Nếu bạn đang đặt cho nhiều người trong gia đình, ' +
            'vui lòng gọi phòng khám để được xếp lịch cùng lúc. ' +
            'Nếu bạn không gửi các yêu cầu này, hãy báo phòng khám.',
        );
      }
      if (today >= MAX_DAILY_PER_PHONE || todayByEmail >= MAX_DAILY_PER_EMAIL) {
        throw new ConflictException(
          (today >= MAX_DAILY_PER_PHONE ? 'Số điện thoại' : 'Email') +
            ' này đã gửi nhiều yêu cầu đặt lịch trong hôm nay. Vui lòng thử lại vào ngày mai hoặc gọi phòng khám.',
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
    }, LOCKING_TX_OPTIONS);
    await this.audit.log({
      action: 'BOOKING_REQUEST_SUBMITTED',
      actorUserId: null,
      targetType: 'booking_request',
      targetId: row.id,
      metadata: { referenceCode: ref },
    });
    let notificationSent = false;
    if (row.email) {
      const subject = 'Đã nhận yêu cầu đặt lịch';
      // No name in the first email: the form is open to anyone, and a "name"
      // must not turn the clinic's email into someone else's message.
      notificationSent = await this.sendNotice(
        row.email,
        subject,
        '',
        'Phòng khám đã nhận yêu cầu ' + ref + '. Đây chưa phải lịch hẹn đã xác nhận.',
        ref,
        token,
      );
      await this.recordNotice(row.id, subject, notificationSent);
    }
    void this.notifyStaff(row.id, 'Yêu cầu đặt lịch mới');
    return { referenceCode: ref, accessToken: token, status: 'PENDING_REVIEW', notificationSent };
  }

  /**
   * The status of one request. The token from the confirmation link also
   * allows changes (`canManage`); reference + phone only shows it.
   */
  async publicStatus(reference: string, access: PublicAccess) {
    const row = await this.verify(reference, access);
    return this.withIssue(row, { canManage: this.hasToken(access) });
  }

  /**
   * toPublic plus `slotIssue`, in the patient's words: an open request whose
   * time no longer works (clinic closed, dentist away or gone), or a booked
   * visit that no longer stands (the front desk will call to move it).
   */
  private async withIssue(row: any, opts: { canManage?: boolean } = {}) {
    const out = this.toPublic(row, opts);
    let kind: string | null = null;
    try {
      const visit = row.appointment;
      if (visit) {
        if (
          !visit.deletedAt &&
          ['SCHEDULED', 'CONFIRMED'].includes(visit.status) &&
          visit.startAt.getTime() > Date.now()
        ) {
          kind = await this.visitIssueKind(visit);
        }
      } else if (ACTIVE.includes(row.status)) {
        kind = (await this.issuesFor([row])).get(row.id)?.kind ?? null;
      }
    } catch (error) {
      this.logger.warn(`Could not check ${row.referenceCode}: ${String(error)}`);
    }
    return {
      ...out,
      slotIssue: kind
        ? {
            kind,
            message:
              (row.appointment ? 'Lịch hẹn cần đổi: ' : 'Thời gian này không còn phù hợp: ') +
              patientIssueText(kind) +
              '. Lễ tân sẽ liên hệ để sắp xếp giờ khác; bạn cũng có thể gọi phòng khám.',
          }
        : null,
    };
  }

  /** Why a booked visit no longer stands (dentist gone, closed, time-off, hours), or null. */
  private async visitIssueKind(visit: {
    dentistId: string;
    startAt: Date;
    endAt: Date;
  }): Promise<string | null> {
    try {
      await this.appointments.validateDentist(visit.dentistId);
    } catch (error) {
      if (error instanceof HttpException) return 'NOT_BOOKABLE';
      throw error;
    }
    const problem = await this.availability.checkSlot(visit.dentistId, visit.startAt, visit.endAt, {
      ignoreBookings: true,
    });
    return problem?.kind ?? null;
  }

  /**
   * Requests made with this phone (the patient's or the guardian's) in the
   * last 180 days, newest first. The phone alone only shows booking status
   * (time and status, with masked initials): no service or dentist, no
   * reference code, no messages, and it never allows a change (that needs
   * the token).
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
    return rows.map(row => this.toLookup(row));
  }

  async acceptProposal(
    reference: string,
    access: PublicAccess,
    dto: AcceptBookingProposalDto = {},
  ) {
    const row = await this.verify(reference, access, true);
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
    // The proposed time may have been taken since it was offered: say so now
    // rather than let the patient believe it is held.
    // The patient is told the real reason (clinic closed, dentist away or
    // gone, time taken), never "someone else booked it" for a closed day.
    const dentistId = row.proposedDentistId ?? row.preferredDentistId;
    const issue = await this.slotIssueKind(row, dentistId, row.proposedStartAt);
    if (issue) {
      void this.notifyStaff(
        row.id,
        'Khách muốn đồng ý giờ đề xuất nhưng giờ đó không còn dùng được (' +
          patientIssueText(issue) +
          ') — cần đề xuất lại',
      );
      throw new ConflictException({ message: slotGoneMessage(issue), code: 'SLOT_GONE' });
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

  /**
   * The patient turns down the proposed time (the one on their screen) and
   * asks the front desk for another: back to PENDING_REVIEW with their note.
   * The proposal stays on the request so the front desk sees what was
   * refused.
   */
  async declineProposal(
    reference: string,
    access: PublicAccess,
    dto: DeclineBookingProposalDto = {},
  ) {
    const row = await this.verify(reference, access, true);
    if (row.status !== 'PROPOSED' || !row.proposedStartAt) {
      throw new ConflictException('Không có khung giờ đề xuất nào đang chờ bạn trả lời');
    }
    const seen = dto.proposedStartAt ? new Date(dto.proposedStartAt) : row.proposedStartAt;
    if (seen.getTime() !== row.proposedStartAt.getTime()) {
      throw new ConflictException(PROPOSAL_CHANGED_MESSAGE);
    }
    // Back in review the request is about the time first asked for; one
    // already past would expire at once instead of waiting for a new time.
    if (row.requestedStartAt.getTime() <= Date.now()) {
      throw new ConflictException(
        'Giờ bạn chọn ban đầu đã qua nên yêu cầu không thể chờ xếp giờ khác. Vui lòng gọi phòng khám hoặc đặt lịch mới.',
      );
    }
    const note = dto.message?.trim();
    const patientMessage = (
      'Không đồng ý giờ đề xuất ' +
      formatVisitTime(row.proposedStartAt) +
      (note ? ': ' + note : '')
    ).slice(0, 1000);
    const result = await this.prisma.bookingRequest.updateMany({
      where: { id: row.id, status: 'PROPOSED', appointmentId: null, proposedStartAt: seen },
      data: { status: 'PENDING_REVIEW', patientMessage },
    });
    if (!result.count) throw new ConflictException('Yêu cầu đã thay đổi; hãy tải lại trạng thái.');
    await this.audit.log({
      action: 'BOOKING_REQUEST_PROPOSAL_DECLINED',
      actorUserId: null,
      targetType: 'booking_request',
      targetId: row.id,
      metadata: {
        referenceCode: row.referenceCode,
        proposedStartAt: seen.toISOString(),
        ...(note ? { note } : {}),
      },
    });
    void this.notifyStaff(row.id, 'Khách không đồng ý giờ đề xuất — cần chọn giờ khác');
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
    const row = await this.verify(reference, access, true);
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
    // The phone and email are how the clinic reaches the patient and where
    // the status link goes: never changed from the public page.
    const phone = dto.phone?.trim() ? this.normalize(dto.phone) : undefined;
    const email = dto.email?.trim().toLowerCase();
    if (differs(phone, this.normalize(row.phone)) || differs(email, row.email)) {
      throw new BadRequestException(CONTACT_CHANGE_MESSAGE);
    }
    const fullName = dto.fullName?.trim();
    if (differs(fullName, row.fullName)) changes.fullName = fullName;
    if (dto.dob !== undefined) {
      const dob = this.parseDob(dto.dob);
      if (dob.getTime() !== row.dob.getTime()) changes.dob = dob;
    }
    if (dto.gender !== undefined && dto.gender !== row.gender) changes.gender = dto.gender;
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
    if (changes.fullName) this.checkName(merged.fullName, 'Họ và tên');
    if (changes.contactPersonName) this.checkName(merged.contactPersonName!, 'Tên người giám hộ');
    this.checkContact({
      phone: merged.phone,
      dob: merged.dob,
      email: merged.email,
      contactPersonName: merged.contactPersonName,
      contactPersonPhone: merged.contactPersonPhone,
    });
    // What changed, for the front desk (a name changed to someone else's
    // must be noticed): shown as the patient's note, kept in the history.
    const diff = this.describeChanges(row, changes);
    await this.updateUnbookedRequest(row.id, row.status, {
      ...changes,
      status: 'PENDING_REVIEW',
      patientMessage: ('Khách đã bổ sung: ' + diff.text).slice(0, 1000),
    });
    await this.audit.log({
      action: 'BOOKING_REQUEST_DETAILS_UPDATED',
      actorUserId: null,
      targetType: 'booking_request',
      targetId: row.id,
      metadata: { referenceCode: row.referenceCode, changes: diff.changes },
    });
    void this.notifyStaff(row.id, 'Khách đã bổ sung thông tin — cần xử lý');
    return this.toPublic(await this.load(row.id), { canManage: true });
  }

  /**
   * The requester withdraws their open request. The front desk's message
   * stays as it was; the requester's own note goes to `patientMessage`.
   */
  async withdraw(reference: string, access: PublicAccess, dto: PublicBookingNoteDto = {}) {
    const row = await this.verify(reference, access, true);
    if (!ACTIVE.includes(row.status)) {
      throw new ConflictException(
        'Yêu cầu này không thể hủy trực tuyến; vui lòng liên hệ phòng khám',
      );
    }
    const note = dto.message?.trim() || null;
    const result = await this.prisma.bookingRequest.updateMany({
      where: { id: row.id, status: { in: ACTIVE }, appointmentId: null },
      data: { status: 'CANCELLED', patientMessage: note },
    });
    if (!result.count) throw new ConflictException('Yêu cầu đã thay đổi; hãy tải lại trạng thái.');
    await this.audit.log({
      action: 'BOOKING_REQUEST_WITHDRAWN',
      actorUserId: null,
      targetType: 'booking_request',
      targetId: row.id,
      metadata: { referenceCode: row.referenceCode, ...(note ? { note } : {}) },
    });
    void this.notifyStaff(row.id, 'Khách đã rút yêu cầu đặt lịch');
    return { referenceCode: row.referenceCode, status: 'CANCELLED' };
  }

  /**
   * The patient cancels their confirmed visit from the link (token), until
   * patientCancelMinHours() before it; later, they are asked to call. The
   * visit is cancelled only as it was read (time, status), so a visit the
   * clinic moved or checked in meanwhile is left alone.
   */
  async cancelVisit(reference: string, access: PublicAccess, dto: PublicBookingNoteDto = {}) {
    const row = await this.verify(reference, access, true);
    const visit = row.appointment;
    if (
      row.status !== 'CONFIRMED' ||
      !visit ||
      visit.deletedAt ||
      !['SCHEDULED', 'CONFIRMED'].includes(visit.status)
    ) {
      throw new ConflictException(
        'Lịch hẹn này không thể hủy trực tuyến; vui lòng liên hệ phòng khám',
      );
    }
    const minHours = patientCancelMinHours();
    if (visit.startAt.getTime() - Date.now() < minHours * 60 * 60_000) {
      throw new ConflictException(
        'Đã gần đến giờ hẹn (dưới ' +
          minHours +
          ' giờ) nên không thể hủy trực tuyến. Vui lòng gọi phòng khám để báo không đến được.',
      );
    }
    const note = dto.message?.trim() || null;
    const result = await this.prisma.appointment.updateMany({
      where: {
        id: visit.id,
        deletedAt: null,
        status: visit.status,
        startAt: visit.startAt,
      },
      data: {
        status: 'CANCELLED',
        cancelledAt: new Date(),
        cancelledReason: ('Khách hủy qua đường link đặt lịch' + (note ? ': ' + note : '')).slice(
          0,
          1000,
        ),
      },
    });
    if (!result.count) throw new ConflictException('Lịch hẹn đã thay đổi; hãy tải lại trạng thái.');
    if (note) {
      await this.prisma.bookingRequest.update({
        where: { id: row.id },
        data: { patientMessage: note.slice(0, 1000) },
      });
    }
    await this.audit.log({
      action: 'APPOINTMENT_CANCELLED',
      actorUserId: null,
      targetType: 'appointment',
      targetId: visit.id,
      metadata: {
        channel: 'PATIENT_ONLINE',
        referenceCode: row.referenceCode,
        ...(note ? { reason: note } : {}),
      },
    });
    void this.notifyStaff(row.id, 'Khách đã hủy lịch hẹn đã xác nhận (qua đường link)');
    if (row.email) {
      await this.sendNotice(
        row.email,
        'Đã hủy lịch hẹn theo yêu cầu của bạn',
        row.fullName,
        'Lịch hẹn ' +
          row.referenceCode +
          ' lúc ' +
          formatVisitTime(visit.startAt) +
          ' đã được hủy theo yêu cầu của bạn. Bạn có thể đặt lịch mới bất cứ lúc nào.',
        row.referenceCode,
      );
    }
    return this.publicStatus(reference, access);
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
    // A search (reference code, phone or name: a patient at the desk with a
    // code) looks at every request, any status, newest first.
    const search = q.q?.trim() ? this.searchWhere(q.q.trim()) : null;
    if (search) {
      const found = await this.prisma.bookingRequest.findMany({
        where: { ...search, ...(q.status ? { status: q.status } : {}) },
        orderBy: { createdAt: 'desc' },
        take: 50,
        include,
      });
      const openByPhone = await this.openCountByPhone(found.map(r => r.phone));
      return found.map(r => ({
        ...this.toStaff(r),
        slotIssue: null,
        openFromPhone: openByPhone.get(r.phone) ?? 0,
      }));
    }
    const activeStatuses = q.status ? ACTIVE.filter(s => s === q.status) : ACTIVE;
    // Open requests are few (the expiry cron closes them once their time
    // passes); read up to 500 so the order by effective time (a proposal's
    // time first) is over all of them, then show the nearest 200.
    const active = activeStatuses.length
      ? await this.prisma.bookingRequest.findMany({
          where: { status: { in: activeStatuses } },
          orderBy: { requestedStartAt: 'asc' },
          take: 500,
          include,
        })
      : [];
    active.sort((a, b) => effectiveStartAt(a).getTime() - effectiveStartAt(b).getTime());
    active.splice(200);
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
    const openByPhone = await this.openCountByPhone([...active, ...rest].map(r => r.phone));
    return [...active, ...rest].map(r => ({
      ...this.toStaff(r),
      slotIssue: issues.get(r.id) ?? null,
      // At MAX_OPEN_PER_PHONE the public form refuses that phone: the front
      // desk sees it (possibly someone else's number used to block it).
      openFromPhone: openByPhone.get(r.phone) ?? 0,
    }));
  }

  /** Requests matching a reference code, a phone (own or guardian) or a name. */
  private searchWhere(text: string): Prisma.BookingRequestWhereInput {
    const or: Prisma.BookingRequestWhereInput[] = [
      { fullName: { contains: text, mode: 'insensitive' } },
    ];
    const code = text.toUpperCase().replace(/[^0-9A-Z]/g, '');
    const body = code.startsWith('GS') ? code.slice(2) : code;
    if (body.length >= 4) or.push({ referenceCode: { contains: body } });
    const phone = normalizePhone(text);
    if (/^\d{4,}$/.test(phone)) {
      or.push({ phone: { contains: phone } }, { contactPersonPhone: { contains: phone } });
    }
    return { OR: or };
  }

  /** Open requests per phone, for the given phones. */
  private async openCountByPhone(phones: string[]) {
    const unique = [...new Set(phones)];
    if (!unique.length) return new Map<string, number>();
    const rows = await this.prisma.bookingRequest.groupBy({
      by: ['phone'],
      where: { phone: { in: unique }, status: { in: ACTIVE }, appointmentId: null },
      _count: { _all: true },
    });
    return new Map(rows.map(r => [r.phone, r._count._all]));
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
        // Same dentists validateDentist accepts when the proposal is sent.
        dentist: {
          ...SCHEDULABLE_ACCOUNT_WHERE,
          userRoles: { some: { role: { code: 'dentist' } } },
          dentistProfile: { is: dentistProfileFilter('booking') },
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
   * second run finds nothing to do. Requesters with an email are told.
   */
  async expireOverdue(now = new Date()) {
    const where: Prisma.BookingRequestWhereInput = {
      appointmentId: null,
      OR: this.byEffectiveStart(ACTIVE, 'lte', now),
    };
    const select = {
      id: true,
      referenceCode: true,
      email: true,
      fullName: true,
      phone: true,
      contactPersonPhone: true,
      status: true,
      requestedStartAt: true,
      proposedStartAt: true,
    } satisfies Prisma.BookingRequestSelect;
    const candidates = await this.prisma.bookingRequest.findMany({ where, select, take: 500 });
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
              select,
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
      // One at a time: a batch of expiries must not flood the SMTP server.
      for (const c of expired) {
        if (!c.email) continue;
        try {
          // Booked another way that day (by phone, or at the desk): the
          // patient has a visit, so "your request expired" would mislead.
          if (await this.hasVisitThatDay(c)) continue;
          await this.sendNotice(
            c.email,
            'Yêu cầu đặt lịch đã quá hạn',
            c.fullName,
            'Yêu cầu đặt lịch ' +
              c.referenceCode +
              ' lúc ' +
              formatVisitTime(effectiveStartAt(c)) +
              ' ' +
              (c.status === 'PROPOSED'
                ? 'đã quá giờ mà phòng khám chưa nhận được trả lời của bạn về giờ đề xuất'
                : c.status === 'NEEDS_INFORMATION'
                  ? 'đã quá giờ mà phòng khám chưa nhận được thông tin bổ sung'
                  : 'đã quá giờ hẹn mà chưa được phòng khám xác nhận') +
              ' nên lịch không được giữ. Vui lòng đặt lịch mới hoặc gọi phòng khám. ' +
              'Nếu bạn đã đến phòng khám, vui lòng báo lễ tân.',
            c.referenceCode,
          );
        } catch (error) {
          this.logger.warn(`Could not email the expiry of ${c.referenceCode}: ${String(error)}`);
        }
      }
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
    const select = {
      id: true,
      code: true,
      fullName: true,
      dob: true,
      email: true,
      primaryPhone: true,
      contactPersonName: true,
      contactPersonPhone: true,
    } satisfies Prisma.PatientSelect;
    const found = await this.prisma.patient.findMany({
      where: await this.patientsByPhone(phones),
      select,
      take: 20,
      orderBy: { createdAt: 'desc' },
    });
    // A returning patient on a new phone (or booked by a relative from
    // theirs): the same name and date of birth on any record, or one of the
    // request's phones in a record's phone history.
    const seen = new Set(found.map(p => p.id));
    const others = [
      ...(await this.sameNameAndDobPatients(row)),
      ...(await this.prisma.patient.findMany({
        where: {
          deletedAt: null,
          phoneHistory: {
            some: { OR: [{ oldPhone: { in: phones } }, { newPhone: { in: phones } }] },
          },
        },
        select,
        take: 10,
      })),
    ].filter(p => !seen.has(p.id) && seen.add(p.id));
    return [...found, ...others].map(p => {
      const matchedBy: Array<'primaryPhone' | 'contactPersonPhone' | 'phoneHistory'> = (
        ['primaryPhone', 'contactPersonPhone'] as const
      ).filter(field => !!p[field] && phones.includes(this.normalize(p[field]!)));
      if (!matchedBy.length && !found.includes(p) && !this.sameNameAndDob(p, row))
        matchedBy.push('phoneHistory');
      return {
        ...p,
        matchedBy,
        sameNameAndDob: this.sameNameAndDob(p, row),
        // Picking this record needs the front desk to confirm who it is.
        differentPhone: !matchedBy.some(m => m !== 'phoneHistory'),
      };
    });
  }

  /** Live records with the request's name and date of birth, whatever their phone. */
  private async sameNameAndDobPatients(
    row: { fullName: string; dob: Date },
    db: Prisma.TransactionClient = this.prisma,
  ) {
    const rows = await db.patient.findMany({
      where: { deletedAt: null, dob: row.dob },
      select: {
        id: true,
        code: true,
        fullName: true,
        dob: true,
        email: true,
        primaryPhone: true,
        contactPersonName: true,
        contactPersonPhone: true,
      },
      take: 200,
    });
    return (rows ?? []).filter(p => this.sameNameAndDob(p, row));
  }

  /**
   * What else this phone (or person) has: other open requests and upcoming
   * visits of the records on its phones or with its name and date of birth,
   * so the front desk does not book the same patient twice (a request kept
   * "just in case", or booked by phone meanwhile).
   */
  async related(id: string) {
    const row = await this.prisma.bookingRequest.findUnique({
      where: { id },
      select: { id: true, phone: true, contactPersonPhone: true, fullName: true, dob: true },
    });
    if (!row) throw new NotFoundException('Không tìm thấy yêu cầu đặt lịch');
    const phones = this.requestPhones(row);
    const [requests, byPhone, byName] = await Promise.all([
      this.prisma.bookingRequest.findMany({
        where: {
          id: { not: row.id },
          status: { in: ACTIVE },
          appointmentId: null,
          OR: [{ phone: { in: phones } }, { contactPersonPhone: { in: phones } }],
        },
        select: {
          id: true,
          referenceCode: true,
          fullName: true,
          status: true,
          requestedStartAt: true,
          proposedStartAt: true,
        },
        orderBy: { requestedStartAt: 'asc' },
        take: 20,
      }),
      this.patientsByPhone(phones),
      this.sameNameAndDobPatients(row),
    ]);
    const patientIds = [...((byPhone.id as { in: string[] })?.in ?? []), ...byName.map(p => p.id)];
    const visits = patientIds.length
      ? await this.prisma.appointment.findMany({
          where: {
            patientId: { in: [...new Set(patientIds)] },
            deletedAt: null,
            status: { in: ['SCHEDULED', 'CONFIRMED', 'CHECKED_IN', 'IN_PROGRESS'] },
            startAt: { gte: startOfClinicDay(clinicDateOnly()) },
          },
          select: {
            id: true,
            startAt: true,
            status: true,
            patient: { select: { code: true, fullName: true } },
            dentist: { select: { fullName: true } },
          },
          orderBy: { startAt: 'asc' },
          take: 20,
        })
      : [];
    return {
      requests: requests.map(r => ({ ...r, startAt: effectiveStartAt(r) })),
      visits,
    };
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
    // The patient answers from the email: a fresh link (see newAccess).
    const access = row.email ? this.newAccess() : null;
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
    const subject = 'Phòng khám đề xuất giờ khám khác';
    const sent = row.email
      ? await this.sendNotice(
          row.email,
          subject,
          row.fullName,
          'Giờ phòng khám đề xuất: ' +
            formatVisitTime(startAt) +
            ' (giờ Việt Nam)' +
            (dentistName ? ', bác sĩ ' + dentistName : '') +
            '. Lời nhắn của phòng khám: ' +
            dto.message.trim(),
          row.referenceCode,
          access?.token,
          true,
        )
      : false;
    await this.adoptAccess(id, access, sent);
    await this.recordNotice(id, subject, sent);
    return { data: await this.getForStaff(id), notificationSent: sent };
  }

  async requestInformation(id: string, dto: BookingRequestMessageDto, actor: JwtPayload) {
    const row = await this.requireActive(id);
    // NEEDS_INFORMATION leads back to PENDING_REVIEW, which would drop the
    // time and dentist already offered to (or agreed by) the patient.
    if (PROPOSAL_STATUSES.includes(row.status)) throw new ConflictException(PROPOSAL_OPEN_MESSAGE);
    // The patient could not answer in time anyway (updateDetails refuses).
    // Proposing a new time is still allowed: that rescues an overdue request.
    if (this.isOverdue(row)) throw new ConflictException(OVERDUE_STAFF_MESSAGE);
    const access = row.email ? this.newAccess() : null;
    await this.updateUnbookedRequest(id, row.status, {
      status: 'NEEDS_INFORMATION',
      responseMessage: dto.message.trim(),
      handledBy: actor.sub,
    });
    await this.auditAction('BOOKING_REQUEST_INFORMATION_REQUESTED', id, actor);
    const subject = 'Phòng khám cần bổ sung thông tin';
    const sent = row.email
      ? await this.sendNotice(
          row.email,
          subject,
          row.fullName,
          dto.message.trim(),
          row.referenceCode,
          access?.token,
          true,
        )
      : false;
    await this.adoptAccess(id, access, sent);
    await this.recordNotice(id, subject, sent);
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
    // As online: the time must still be free, or the patient would be told
    // it is agreed and then called again when confirming fails.
    const issue = await this.slotIssueKind(
      row,
      row.proposedDentistId ?? row.preferredDentistId,
      row.proposedStartAt,
    );
    if (issue) {
      throw new ConflictException(
        'Giờ đề xuất không còn dùng được (' +
          patientIssueText(issue) +
          '). Hãy đề xuất giờ khác cho khách.',
      );
    }
    await this.acceptProposedTime(id, row.proposedStartAt, actor.sub);
    await this.auditAction('BOOKING_REQUEST_PROPOSAL_ACCEPTED', id, actor, {
      channel: 'PHONE',
      proposedStartAt: row.proposedStartAt.toISOString(),
      ...(dto.note?.trim() ? { note: dto.note.trim() } : {}),
    });
    return { data: await this.getForStaff(id) };
  }

  async decline(id: string, dto: DeclineBookingRequestDto, actor: JwtPayload) {
    const row = await this.requireActive(id);
    await this.updateUnbookedRequest(id, row.status, {
      status: 'DECLINED',
      responseMessage: dto.message.trim(),
      handledBy: actor.sub,
    });
    await this.auditAction('BOOKING_REQUEST_DECLINED', id, actor, dto.spam ? { spam: true } : {});
    // Spam: the address was typed by whoever filled in the form, so the
    // clinic's mail must not go to it (nobody is waiting for an answer).
    if (dto.spam) return { data: await this.getForStaff(id), notificationSent: null };
    const subject = 'Kết quả yêu cầu đặt lịch';
    const sent = row.email
      ? await this.sendNotice(
          row.email,
          subject,
          row.fullName,
          dto.message.trim(),
          row.referenceCode,
        )
      : false;
    await this.recordNotice(id, subject, sent);
    return { data: await this.getForStaff(id), notificationSent: sent };
  }

  /**
   * The patient called to cancel their open request: CANCELLED (not
   * "declined by the clinic"), with an email saying it was at their request.
   */
  async cancelledByPhone(id: string, dto: BookingRequestNoteDto, actor: JwtPayload) {
    const row = await this.requireActive(id);
    const note = dto.note?.trim();
    await this.updateUnbookedRequest(id, row.status, {
      status: 'CANCELLED',
      patientMessage: ('Khách hủy qua điện thoại' + (note ? ': ' + note : '')).slice(0, 1000),
      handledBy: actor.sub,
    });
    await this.auditAction('BOOKING_REQUEST_WITHDRAWN', id, actor, {
      channel: 'PHONE',
      ...(note ? { note } : {}),
    });
    if (row.email) {
      await this.sendNotice(
        row.email,
        'Đã hủy yêu cầu đặt lịch theo yêu cầu của bạn',
        row.fullName,
        'Theo yêu cầu của bạn qua điện thoại, phòng khám đã hủy yêu cầu đặt lịch ' +
          row.referenceCode +
          '. Bạn có thể đặt lịch mới bất cứ lúc nào.',
        row.referenceCode,
      );
    }
    return { data: await this.getForStaff(id) };
  }

  /**
   * The patient came to the desk with an unconfirmed request. With
   * `appointmentId` (a visit of today, e.g. the walk-in just created) the
   * request is linked to it and CONFIRMED; without, it is closed as handled
   * in person. No email either way: the patient is at the desk, and the
   * request no longer expires with a "past due" email.
   */
  async arrived(id: string, dto: BookingArrivedDto, actor: JwtPayload) {
    const row = await this.requireActive(id);
    const note = dto.note?.trim();
    if (!dto.appointmentId) {
      await this.updateUnbookedRequest(id, row.status, {
        status: 'CANCELLED',
        patientMessage: ('Khách đến trực tiếp tại phòng khám' + (note ? ': ' + note : '')).slice(
          0,
          1000,
        ),
        handledBy: actor.sub,
      });
      await this.auditAction('BOOKING_REQUEST_ARRIVED', id, actor, {
        appointmentId: null,
        ...(note ? { note } : {}),
      });
      return { data: await this.getForStaff(id) };
    }
    const visit = await this.prisma.appointment.findFirst({
      where: { id: dto.appointmentId, deletedAt: null },
      select: {
        id: true,
        patientId: true,
        startAt: true,
        status: true,
        bookingRequest: { select: { id: true } },
      },
    });
    if (!visit) throw new NotFoundException('Không tìm thấy lượt khám để gắn');
    if (visit.bookingRequest)
      throw new ConflictException('Lượt khám này đã gắn với một yêu cầu đặt lịch khác');
    if (clinicDateOnly(visit.startAt) !== clinicDateOnly())
      throw new BadRequestException('Chỉ gắn được lượt khám của hôm nay');
    if (['CANCELLED', 'NO_SHOW', 'LEFT'].includes(visit.status))
      throw new BadRequestException('Lượt khám đã hủy, vắng mặt hoặc khách đã về');
    await this.updateUnbookedRequest(id, row.status, {
      status: 'CONFIRMED',
      appointmentId: visit.id,
      patientId: visit.patientId,
      handledBy: actor.sub,
    });
    await this.auditAction('BOOKING_REQUEST_ARRIVED', id, actor, {
      appointmentId: visit.id,
      patientId: visit.patientId,
      ...(note ? { note } : {}),
    });
    return { data: await this.getForStaff(id) };
  }

  /**
   * The front desk corrects the requester's details on an open request (a
   * mistyped email or phone, the wrong name): every change is in the
   * history, with the reason. A new email gets a fresh link (the old one
   * went to the wrong address and stops working once the new one is sent).
   */
  async updateContact(id: string, dto: UpdateBookingContactDto, actor: JwtPayload) {
    const row = await this.requireActive(id);
    const changes: Record<string, unknown> = {};
    if (dto.phone !== undefined) {
      const phone = this.normalize(dto.phone);
      if (phone !== row.phone) changes.phone = phone;
    }
    if (dto.email !== undefined) {
      const email = dto.email.trim().toLowerCase() || null;
      if (email !== row.email) changes.email = email;
    }
    if (dto.fullName !== undefined && dto.fullName.trim() !== row.fullName) {
      this.checkName(dto.fullName.trim(), 'Họ và tên');
      changes.fullName = dto.fullName.trim();
    }
    if (dto.dob !== undefined) {
      const dob = this.parseDob(dto.dob);
      if (dob.getTime() !== row.dob.getTime()) changes.dob = dob;
    }
    if (dto.contactPersonName !== undefined) {
      const name = dto.contactPersonName.trim() || null;
      if (name) this.checkName(name, 'Tên người giám hộ');
      if (name !== row.contactPersonName) changes.contactPersonName = name;
    }
    if (dto.contactPersonPhone !== undefined) {
      const phone = dto.contactPersonPhone.trim() ? this.normalize(dto.contactPersonPhone) : null;
      if (phone !== row.contactPersonPhone) changes.contactPersonPhone = phone;
    }
    if (!Object.keys(changes).length)
      throw new BadRequestException('Chưa có thông tin nào thay đổi');
    const merged = { ...row, ...changes } as typeof row;
    this.checkContact({
      phone: merged.phone,
      dob: merged.dob,
      email: merged.email,
      contactPersonName: merged.contactPersonName,
      contactPersonPhone: merged.contactPersonPhone,
    });
    await this.updateUnbookedRequest(id, row.status, changes);
    await this.auditAction('BOOKING_REQUEST_CONTACT_UPDATED', id, actor, {
      reason: dto.reason.trim(),
      changes: this.describeChanges(row, changes).changes,
    });
    const linkSent = changes.email ? await this.sendLink(id, actor, false) : null;
    return { data: await this.getForStaff(id), notificationSent: linkSent };
  }

  /** A fresh link to the request, emailed to its address (the old link stops working). */
  async resendLink(id: string, actor: JwtPayload) {
    const sent = await this.sendLink(id, actor, true);
    return { data: await this.getForStaff(id), notificationSent: sent };
  }

  private async sendLink(id: string, actor: JwtPayload, audited: boolean) {
    const row = await this.prisma.bookingRequest.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('Không tìm thấy yêu cầu đặt lịch');
    if (!row.email) throw new BadRequestException('Yêu cầu chưa có email để gửi đường link');
    if (!ACTIVE.includes(row.status) && row.status !== 'CONFIRMED')
      throw new ConflictException('Yêu cầu đã đóng, không cần gửi lại đường link');
    const access = this.newAccess();
    const subject = 'Đường link quản lý yêu cầu đặt lịch';
    const sent = await this.sendNotice(
      row.email,
      subject,
      row.fullName,
      'Phòng khám gửi bạn đường link để xem và thay đổi yêu cầu đặt lịch ' +
        row.referenceCode +
        '.',
      row.referenceCode,
      access.token,
      true,
    );
    await this.adoptAccess(id, access, sent);
    await this.recordNotice(id, subject, sent);
    if (audited) await this.auditAction('BOOKING_REQUEST_LINK_RESENT', id, actor, { sent });
    return sent;
  }

  /** The front desk's own note on a request (not shown to the patient). */
  async setNote(id: string, dto: ReceptionistNoteDto, actor: JwtPayload) {
    const row = await this.prisma.bookingRequest.findUnique({
      where: { id },
      select: { id: true, receptionistNote: true },
    });
    if (!row) throw new NotFoundException('Không tìm thấy yêu cầu đặt lịch');
    const note = dto.note?.trim() || null;
    await this.prisma.bookingRequest.update({ where: { id }, data: { receptionistNote: note } });
    await this.auditAction('BOOKING_REQUEST_NOTE_UPDATED', id, actor, { note });
    return { data: await this.getForStaff(id) };
  }

  /** The patient was called about an email that did not go out. */
  async markCalled(id: string, dto: BookingRequestNoteDto, actor: JwtPayload) {
    const row = await this.prisma.bookingRequest.findUnique({
      where: { id },
      select: { id: true, noticeFailedSubject: true },
    });
    if (!row) throw new NotFoundException('Không tìm thấy yêu cầu đặt lịch');
    await this.prisma.bookingRequest.update({
      where: { id },
      data: { noticeFailedAt: null, noticeFailedSubject: null },
    });
    await this.auditAction('BOOKING_REQUEST_PATIENT_CALLED', id, actor, {
      about: row.noticeFailedSubject,
      ...(dto.note?.trim() ? { note: dto.note.trim() } : {}),
    });
    return { data: await this.getForStaff(id) };
  }

  /**
   * Books the request. `startAt` (and `dentistId`): the patient asked for
   * another time by phone and agreed to it, so it is booked at once (no
   * proposal email and second step). A request already confirmed (a second
   * click, another tab) gets the same answer again, not "time taken".
   */
  async confirm(id: string, actor: JwtPayload, choice: ConfirmBookingRequestDto = {}) {
    const row = await this.prisma.bookingRequest.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('Không tìm thấy yêu cầu đặt lịch');
    if (row.status === 'CONFIRMED' && row.appointmentId) return this.alreadyConfirmed(id);
    const override = !!choice.startAt;
    const allowed: BookingRequestStatus[] = override ? ACTIVE : STAFF_ACTION_STATUSES;
    if (row.appointmentId || !allowed.includes(row.status)) {
      throw new ConflictException('Yêu cầu chưa sẵn sàng để xác nhận');
    }
    const dentistId = override
      ? (choice.dentistId ?? this.effectiveDentistId(row))
      : row.status === 'PATIENT_ACCEPTED'
        ? row.proposedDentistId
        : row.preferredDentistId;
    const startAt = override
      ? new Date(choice.startAt!)
      : row.status === 'PATIENT_ACCEPTED'
        ? row.proposedStartAt
        : row.requestedStartAt;
    if (!dentistId || !startAt || !Number.isFinite(startAt.getTime()))
      throw new ConflictException('Thiếu bác sĩ hoặc giờ hẹn đã thống nhất');
    // Checked before any patient record is created or matched. create()
    // refuses anything under a minute ahead too.
    if (startAt.getTime() <= Date.now() + 60_000) {
      throw new ConflictException(override ? 'Giờ hẹn phải ở phía trước' : OVERDUE_STAFF_MESSAGE);
    }
    let plan: VisitPlan;
    try {
      plan = await this.staffPlan(row, dentistId, clinicDateOnly(startAt));
    } catch (error) {
      // The dentist was suspended or left since the request came in.
      if (error instanceof HttpException && error.getStatus() === 404) {
        throw new ConflictException(
          error.message +
            '. Hãy chọn bác sĩ khác ở mục “Giờ thay thế” (đề xuất, hoặc xác nhận luôn nếu khách đã đồng ý qua điện thoại), hoặc từ chối yêu cầu.',
        );
      }
      throw error;
    }
    // The request is attached only as it was read here: a change in between
    // (a new proposal accepted, details updated) must not be booked from
    // stale data. updatedAt is compared to the millisecond Prisma reads.
    const unchanged: Prisma.BookingRequestWhereInput = {
      ...(row.updatedAt
        ? { updatedAt: { gte: row.updatedAt, lt: new Date(row.updatedAt.getTime() + 1) } }
        : {}),
      requestedStartAt: row.requestedStartAt,
      proposedStartAt: row.proposedStartAt,
    };
    // One transaction, one connection: the booking phone is locked first, so
    // two requests from one phone (same name and date of birth) confirmed at
    // once cannot both create a patient record; the record is created and
    // the visit booked (dentist, then patient lock) in it, so a visit that
    // cannot be booked leaves no record behind.
    const booked = await this.prisma.$transaction(async tx => {
      await lockBookingPhone(tx, this.normalize(row.phone));
      // Confirmed by another click while this one waited for the lock.
      const fresh = await tx.bookingRequest.findUnique({
        where: { id },
        select: { appointmentId: true },
      });
      if (fresh?.appointmentId) return null;
      const patient = await this.resolvePatient(row, choice, actor, tx);
      // The visit length comes from the service (the dentist's own duration
      // first); create() re-checks the slot, buffers and double-booking.
      const appointment = await this.appointments.create(
        {
          patientId: patient.id,
          dentistId,
          serviceIds: [row.serviceId],
          startAt: startAt.toISOString(),
          reason: row.reason ?? undefined,
          source: 'ONLINE',
        },
        actor,
        { id: row.id, expectedStatuses: [row.status], plan, match: unchanged, tx },
      );
      return { patient, appointment };
    }, LOCKING_TX_OPTIONS);
    if (!booked) return this.alreadyConfirmed(id);
    const { patient, appointment } = booked;
    const confirmed = await this.prisma.bookingRequest.findUniqueOrThrow({
      where: { id },
      select: {
        email: true,
        fullName: true,
        referenceCode: true,
        service: { select: { name: true } },
        appointment: { select: { startAt: true, dentist: { select: { fullName: true } } } },
      },
    });
    const dentistName = confirmed.appointment?.dentist?.fullName;
    const minHours = patientCancelMinHours();
    // A fresh link comes with the confirmation: the patient cancels from it.
    const access = confirmed.email ? this.newAccess() : null;
    const subject = 'Lịch hẹn đã được xác nhận';
    const sent = confirmed.email
      ? await this.sendNotice(
          confirmed.email,
          subject,
          confirmed.fullName,
          [
            'Lịch hẹn ' +
              confirmed.referenceCode +
              ' đã được xác nhận: ' +
              formatVisitTime(confirmed.appointment?.startAt ?? startAt) +
              (dentistName ? ', bác sĩ ' + dentistName : '') +
              (confirmed.service?.name ? ', ' + confirmed.service.name : '') +
              '.',
            'Vui lòng đến trước giờ hẹn khoảng 10 phút.',
            clinicAddressLine(),
            'Nếu không đến được, bạn có thể hủy lịch bằng đường link dưới đây trước giờ hẹn ít nhất ' +
              minHours +
              ' giờ, hoặc gọi phòng khám.',
          ]
            .filter(Boolean)
            .join(' '),
          confirmed.referenceCode,
          access?.token,
          true,
        )
      : false;
    await this.adoptAccess(id, access, sent);
    await this.recordNotice(id, subject, sent);
    await this.auditAction('BOOKING_REQUEST_CONFIRMED', id, actor, {
      appointmentId: appointment.id,
      patientId: patient.id,
      patientCreated: patient.created,
      ...(patient.identityConfirmed
        ? { identityConfirmed: true, identityNote: choice.identityNote?.trim() }
        : {}),
      ...(patient.phoneUpdated ? { patientPhoneUpdated: true } : {}),
      ...(patient.emailUpdated ? { patientEmailUpdated: true } : {}),
      ...(override ? { changedByPhone: { startAt: startAt.toISOString(), dentistId } } : {}),
    });
    return { data: await this.getForStaff(id), notificationSent: sent };
  }

  private async alreadyConfirmed(id: string) {
    return { data: await this.getForStaff(id), notificationSent: null, alreadyConfirmed: true };
  }

  /**
   * The patient record for the visit: the one the front desk picked, a new
   * one when they asked for it, or else the single record with the same
   * phone (own or guardian), name and date of birth. Any other record on
   * those phones, or a record with the same name and date of birth on
   * another phone (a returning patient on a new number), means a person
   * must choose. A picked record on another phone needs the front desk to
   * say the identity was checked (and how). The request's email is saved on
   * a matched record that has none (or replaces it when asked), so the
   * visit's reminders and changes reach the patient.
   * Runs in confirm()'s transaction (`tx`), under the booking-phone lock.
   */
  private async resolvePatient(
    row: any,
    choice: ConfirmBookingRequestDto,
    actor: JwtPayload,
    tx: Prisma.TransactionClient,
  ): Promise<{
    id: string;
    created: boolean;
    identityConfirmed?: boolean;
    phoneUpdated?: boolean;
    emailUpdated?: boolean;
  }> {
    const phones = this.requestPhones(row);
    if (choice.patientId && choice.createNewPatient) {
      throw new BadRequestException('Chọn một hồ sơ có sẵn hoặc tạo hồ sơ mới, không chọn cả hai');
    }
    if (choice.patientId) {
      const found = await tx.patient.findFirst({
        where: { id: choice.patientId, deletedAt: null },
        select: { id: true, primaryPhone: true, contactPersonPhone: true, email: true },
      });
      if (!found)
        throw new BadRequestException('Hồ sơ bệnh nhân đã chọn không tồn tại hoặc đã lưu trữ');
      const own = [found.primaryPhone, found.contactPersonPhone]
        .filter((value): value is string => !!value)
        .map(value => this.normalize(value));
      const phoneMatches = own.some(value => phones.includes(value));
      if (!phoneMatches) {
        if (!choice.confirmIdentity) {
          throw new BadRequestException({
            message:
              'Hồ sơ đã chọn không khớp số điện thoại của yêu cầu. Nếu đã xác minh đúng người ' +
              '(khách đổi số, người nhà đặt hộ), hãy đánh dấu “Đã xác minh danh tính”, ghi cách xác minh rồi xác nhận lại.',
            code: 'IDENTITY_CONFIRMATION_REQUIRED',
          });
        }
        if ((choice.identityNote?.trim().length ?? 0) < 5) {
          throw new BadRequestException(
            'Ghi cách đã xác minh danh tính (ít nhất 5 ký tự), ví dụ: khách đọc đúng ngày sinh và SĐT cũ',
          );
        }
      }
      const synced = await this.syncPatientContact(found, row, choice, phoneMatches, actor, tx);
      return { id: found.id, created: false, identityConfirmed: !phoneMatches, ...synced };
    }
    if (!choice.createNewPatient) {
      const matches = await tx.patient.findMany({
        where: await this.patientsByPhone(phones, tx),
        select: { id: true, fullName: true, dob: true, primaryPhone: true, email: true },
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
        const synced = await this.syncPatientContact(exact[0], row, choice, true, actor, tx);
        return { id: exact[0].id, created: false, ...synced };
      }
      if (matches.length > 0) {
        throw new ConflictException(
          'Đã có hồ sơ dùng số điện thoại này. Hãy chọn hồ sơ phù hợp hoặc chọn tạo hồ sơ mới trước khi xác nhận.',
        );
      }
      // No record on these phones, but one with this name and date of
      // birth: most likely a returning patient on a new number. A new record
      // would split their history (allergies, balance), so a person decides.
      if ((await this.sameNameAndDobPatients(row, tx)).length) {
        throw new ConflictException({
          message:
            'Có hồ sơ cùng họ tên và ngày sinh nhưng khác số điện thoại (khách có thể đã đổi số hoặc người nhà đặt hộ). ' +
            'Hãy chọn hồ sơ đó sau khi xác minh danh tính, hoặc chọn “Tạo hồ sơ mới” nếu là người khác.',
          code: 'PATIENT_NAMESAKE',
        });
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
    return { id: (await this.patients.create(dto, actor, tx)).id, created: true };
  }

  /**
   * Brings a matched record's contact up to date from the request: its email
   * when the record has none (or when the front desk asks to replace it),
   * its phone when the front desk asks (with phone history). Audited.
   */
  private async syncPatientContact(
    found: { id: string; primaryPhone: string | null; email: string | null },
    row: { phone: string; email: string | null },
    choice: ConfirmBookingRequestDto,
    phoneMatches: boolean,
    actor: JwtPayload,
    tx: Prisma.TransactionClient,
  ): Promise<{ phoneUpdated?: boolean; emailUpdated?: boolean }> {
    const data: Prisma.PatientUncheckedUpdateManyInput = {};
    const changes: Record<string, { from: string | null; to: string }> = {};
    const newPhone = this.normalize(row.phone);
    if (!phoneMatches && choice.updatePatientPhone) {
      data.primaryPhone = newPhone;
      changes.primaryPhone = { from: found.primaryPhone, to: newPhone };
    }
    const email = row.email?.trim().toLowerCase();
    if (
      email &&
      email !== (found.email ?? '').toLowerCase() &&
      (!found.email || choice.updatePatientEmail)
    ) {
      data.email = email;
      changes.email = { from: found.email, to: email };
    }
    if (!Object.keys(data).length) return {};
    await tx.patient.updateMany({
      where: { id: found.id },
      data: { ...data, updatedBy: actor.sub },
    });
    if (data.primaryPhone) {
      await tx.patientPhoneHistory.create({
        data: {
          patientId: found.id,
          oldPhone: found.primaryPhone ?? null,
          newPhone,
          changedBy: actor.sub,
        },
      });
    }
    await this.audit.log(
      {
        action: 'PATIENT_UPDATED',
        actorUserId: actor.sub,
        actorEmail: actor.email,
        targetType: 'patient',
        targetId: found.id,
        metadata: { source: 'BOOKING_CONFIRM', changes },
      },
      tx,
    );
    return { phoneUpdated: !!data.primaryPhone, emailUpdated: !!data.email };
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
  private async patientsByPhone(
    phones: string[],
    db: Prisma.TransactionClient = this.prisma,
  ): Promise<Prisma.PatientWhereInput> {
    if (phones.length === 0) return { id: { in: [] } };
    const rows = await db.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM patients
      WHERE deleted_at IS NULL
        AND (
          regexp_replace(regexp_replace(COALESCE(primary_phone, ''), '[[:space:]().-]', '', 'g'), '^([+]84|0084|84(?=[0-9]{9}$))', '0')
            = ANY(${phones}::text[])
          OR regexp_replace(regexp_replace(COALESCE(contact_person_phone, ''), '[[:space:]().-]', '', 'g'), '^([+]84|0084|84(?=[0-9]{9}$))', '0')
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
    const fullName = (dto.fullName ?? '').trim().replace(/\s+/g, ' ');
    if (fullName.length < 2) throw new BadRequestException('Họ và tên không hợp lệ');
    this.checkName(fullName, 'Họ và tên');
    if (dto.contactPersonName?.trim())
      this.checkName(dto.contactPersonName.trim(), 'Tên người giám hộ');
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

  /**
   * A person's name as typed on the public form: letters, spaces and . ' -
   * only, at most NAME_MAX characters, nothing that reads as a web address.
   * Names go into the clinic's emails, so the form must not carry a message.
   */
  private checkName(value: string, label: string) {
    if (
      value.length > NAME_MAX ||
      !NAME_PATTERN.test(value) ||
      /\p{L}{2,}\.\p{L}{2,}/u.test(value) ||
      /\b(https?|www)\b/i.test(value)
    ) {
      throw new BadRequestException(
        label + ' chỉ gồm chữ cái và khoảng trắng, tối đa ' + NAME_MAX + ' ký tự',
      );
    }
  }

  /** Before → after of the changed request fields, for the history and the front desk. */
  private describeChanges(row: Record<string, any>, changes: Record<string, unknown>) {
    const LABEL: Record<string, string> = {
      fullName: 'Họ tên',
      dob: 'Ngày sinh',
      gender: 'Giới tính',
      phone: 'Số điện thoại',
      email: 'Email',
      contactPersonName: 'Người giám hộ',
      contactPersonPhone: 'SĐT người giám hộ',
      reason: 'Lý do khám',
    };
    const show = (v: unknown) =>
      v instanceof Date ? v.toISOString().slice(0, 10) : v == null || v === '' ? '—' : String(v);
    const out: Record<string, { from: string; to: string }> = {};
    for (const key of Object.keys(changes)) {
      if (!LABEL[key]) continue;
      out[key] = { from: show(row[key]), to: show(changes[key]) };
    }
    return {
      changes: out,
      text: Object.entries(out)
        .map(([k, v]) => LABEL[k] + ': ' + v.from + ' → ' + v.to)
        .join('; '),
    };
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

  /**
   * Why `startAt` with `dentistId` can no longer be booked for this request
   * (the kind: CLOSED, TIME_OFF, OUTSIDE_WORKING_HOURS, SLOT_CONFLICT, or
   * NOT_BOOKABLE when the dentist or service no longer takes it), or null.
   */
  private async slotIssueKind(
    row: { serviceId: string; createdAt: Date },
    dentistId: string,
    startAt: Date,
  ): Promise<string | null> {
    let plan: VisitPlan;
    try {
      plan = await this.staffPlan(row, dentistId, clinicDateOnly(startAt));
    } catch (error) {
      if (error instanceof HttpException) return 'NOT_BOOKABLE';
      throw error;
    }
    const problem = await this.availability.checkSlot(
      dentistId,
      startAt,
      new Date(startAt.getTime() + plan.durationMin * 60_000),
      { buffers: { beforeMin: plan.bufferBeforeMin, afterMin: plan.bufferAfterMin } },
    );
    return problem?.kind ?? null;
  }

  /**
   * The requester has a visit on the request's day anyway (booked by phone
   * or at the desk): a record on the request's phones with a live visit
   * that day.
   */
  private async hasVisitThatDay(row: {
    phone: string;
    contactPersonPhone?: string | null;
    status: BookingRequestStatus;
    requestedStartAt: Date;
    proposedStartAt?: Date | null;
  }) {
    const day = clinicDateOnly(effectiveStartAt(row));
    const from = startOfClinicDay(day);
    const patients = await this.patientsByPhone(this.requestPhones(row));
    const count = await this.prisma.appointment.count({
      where: {
        patient: patients,
        deletedAt: null,
        status: { notIn: ['CANCELLED', 'NO_SHOW'] },
        startAt: { gte: from, lt: new Date(from.getTime() + 24 * 60 * 60_000) },
      },
    });
    return count > 0;
  }

  /**
   * Remembers whether the patient got the email about the request's last
   * change: a failed one (or no email to send to) leaves a "call the
   * patient" flag for the front desk until a later email goes out or they
   * mark the call made.
   */
  private async recordNotice(id: string, subject: string, sent: boolean) {
    await this.prisma.bookingRequest.update({
      where: { id },
      data: sent
        ? { notificationSentAt: new Date(), noticeFailedAt: null, noticeFailedSubject: null }
        : { noticeFailedAt: new Date(), noticeFailedSubject: subject.slice(0, 200) },
    });
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
   * A requester proves access with either the token from the confirmation
   * link (256 random bits, stored hashed), or the phone number the request
   * was made with (theirs or the guardian's). The phone only shows the
   * status: anyone may know a phone number, so every change (`manage`)
   * needs the token. The reference code is 40 random bits and the public
   * routes are rate limited, so reference + phone cannot be enumerated.
   * Both failures give the same answer, so neither reveals which part was
   * wrong.
   */
  private async verify(reference: string, access: PublicAccess, manage = false) {
    const denied = new UnauthorizedException('Mã đặt lịch hoặc số điện thoại không đúng');
    const code = this.normalizeReference(reference);
    const token = access.token?.trim();
    const phone = access.phone ? this.normalize(access.phone) : '';
    if (manage && !token) throw new ForbiddenException(MANAGE_NEEDS_LINK_MESSAGE);
    if ((!token && !phone) || (token?.length ?? 0) > 100 || phone.length > 20) throw denied;
    const row = await this.prisma.bookingRequest.findUnique({
      where: { referenceCode: code },
      select: {
        id: true,
        accessTokenHash: true,
        phone: true,
        contactPersonPhone: true,
        accessRotatedAt: true,
      },
    });
    if (token) {
      const expected = Buffer.from(row?.accessTokenHash ?? '0'.repeat(64));
      const candidate = Buffer.from(this.hash(token));
      if (!row || !timingSafeEqual(candidate, expected)) {
        // The link was replaced by a newer email (a proposal, a request for
        // details, the confirmation): say so, rather than "wrong code".
        if (row?.accessRotatedAt) {
          throw new UnauthorizedException({
            message:
              'Đường link này đã được thay bằng đường link trong email mới nhất của phòng khám (gửi lúc ' +
              formatVisitTime(row.accessRotatedAt) +
              '). Vui lòng mở email mới nhất; tra cứu bằng số điện thoại vẫn xem được tình trạng.',
            code: 'ACCESS_ROTATED',
          });
        }
        throw denied;
      }
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

  private hasToken(access: PublicAccess) {
    return !!access.token?.trim();
  }

  /**
   * What a phone alone shows: the status, time, service and dentist. No
   * reference code (it would open the request page) and no messages.
   */
  private toLookup(row: any) {
    const {
      referenceCode: _ref,
      requestedAt: _at,
      responseMessage: _msg,
      canManage: _manage,
      cancelUntil: _until,
      service: _service,
      dentist: _dentist,
      ...rest
    } = this.toPublic(row);
    // Anyone may know a phone number: no service or dentist (health data,
    // and where the person will be when), only who it is for, masked, so a
    // family sharing a phone can tell its requests apart.
    return { ...rest, patientInitials: maskName(row.fullName ?? '') };
  }

  private toPublic(row: any, { canManage = false } = {}) {
    const useProposed = ['PROPOSED', 'PATIENT_ACCEPTED'].includes(row.status);
    const visit = row.appointment;
    return {
      referenceCode: row.referenceCode,
      /** Changes need the token from the confirmation link. */
      canManage,
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
      // A confirmed visit the patient may still cancel from the link, until then.
      cancelUntil:
        visit &&
        !visit.deletedAt &&
        row.status === 'CONFIRMED' &&
        ['SCHEDULED', 'CONFIRMED'].includes(visit.status)
          ? new Date(visit.startAt.getTime() - patientCancelMinHours() * 60 * 60_000)
          : null,
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
    return normalizePhone(value);
  }
  /**
   * A new link token (256 bits; only its hash is stored). Issued with an
   * email the patient must answer (a proposal, a request for details), so a
   * lost or forwarded older link stops working.
   */
  /**
   * The emailed link's token replaces the stored one only once the email
   * went out: an undelivered link must not break the links the patient
   * already has.
   */
  private async adoptAccess(id: string, access: { hash: string } | null, sent: boolean) {
    if (!access || !sent) return;
    await this.prisma.bookingRequest.update({
      where: { id },
      data: { accessTokenHash: access.hash, accessRotatedAt: new Date() },
    });
  }

  private newAccess() {
    const token = randomBytes(32).toString('base64url');
    return { token, hash: this.hash(token) };
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
    /** The token was just replaced: earlier links no longer work. */
    rotated = false,
  ) {
    const base = publicAppUrl();
    const linkNote = token
      ? 'Dùng đường link này để xem, trả lời hoặc hủy yêu cầu' +
        (rotated ? '; đường link trong các email trước không còn dùng được.' : '.')
      : '';
    const contact = clinicContactLine();
    const link =
      base +
      '/booking/status?ref=' +
      encodeURIComponent(reference) +
      (token ? '#token=' + encodeURIComponent(token) : '');
    const html =
      '<p>Xin chào' +
      (name ? ' ' + this.escape(name) : '') +
      ',</p><p>' +
      this.escape(message) +
      '</p><p>Mã đặt lịch: <strong>' +
      this.escape(reference) +
      '</strong></p><p><a href="' +
      this.escape(link) +
      '">Xem tình trạng lịch hẹn</a></p>' +
      (linkNote ? '<p>' + this.escape(linkNote) + '</p>' : '') +
      '<p>Bạn cũng có thể tra cứu tình trạng bất cứ lúc nào tại ' +
      this.escape(base) +
      '/booking/status bằng số điện thoại đã dùng khi đặt.</p>' +
      '<p>' +
      this.escape(contact) +
      '</p>';
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
        (linkNote ? '\n' + linkNote : '') +
        '\nTra cứu bằng số điện thoại đã dùng khi đặt: ' +
        base +
        '/booking/status\n' +
        contact,
    });
  }
  /**
   * Email the clinic (BOOKING_NOTIFY_EMAILS, comma separated) when a request
   * needs the front desk. Never throws: the patient's action has already
   * succeeded and must not fail because the clinic inbox is unreachable.
   */
  private async notifyStaff(id: string, headline: string) {
    const recipients = bookingNotifyRecipients();
    if (!recipients.length) return;
    try {
      const row = await this.prisma.bookingRequest.findUniqueOrThrow({
        where: { id },
        include: {
          service: { select: { name: true } },
          preferredDentist: { select: { fullName: true } },
          proposedDentist: { select: { fullName: true } },
          appointment: { select: { startAt: true, dentist: { select: { fullName: true } } } },
        },
      });
      // The time and dentist the request is about now: the booked visit's,
      // else a standing proposal's (accepted or not), else the requested.
      const proposal = PROPOSAL_STATUSES.includes(row.status) && !!row.proposedStartAt;
      const at = row.appointment?.startAt ?? effectiveStartAt(row);
      const dentistName =
        row.appointment?.dentist?.fullName ??
        (proposal ? row.proposedDentist?.fullName : null) ??
        row.preferredDentist?.fullName;
      const urgent =
        ACTIVE.includes(row.status) && at.getTime() - Date.now() < URGENT_MS ? '[GẤP] ' : '';
      const when = at.toLocaleString('vi-VN', {
        timeZone: 'Asia/Ho_Chi_Minh',
        weekday: 'long',
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
      const base = process.env.FRONTEND_URL?.trim() || publicAppUrl();
      const link = base + '/booking-requests';
      const lines: Array<[string, string]> = [
        ['Mã', row.referenceCode],
        ['Khách', row.fullName],
        ['Điện thoại', row.phone],
        ['Dịch vụ', row.service?.name ?? '—'],
        ['Bác sĩ', dentistName ?? '—'],
        ['Thời gian', when],
        ...(row.reason ? ([['Lý do', row.reason]] as Array<[string, string]>) : []),
        ...(row.patientMessage
          ? ([['Lời nhắn của khách', row.patientMessage]] as Array<[string, string]>)
          : []),
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
            subject: '[GENSMILE] ' + urgent + headline + ' — ' + row.fullName + ', ' + when,
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

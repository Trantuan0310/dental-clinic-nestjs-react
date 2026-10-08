import { BadRequestException, HttpException, Injectable } from '@nestjs/common';
import { AppointmentStatus, BookingRequestStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { clinicDateOnly, startOfClinicDay } from '../common/date-range.util';
import { dentistProfileFilter, SCHEDULABLE_ACCOUNT_WHERE } from '../staff/staff-rules';
import {
  DayCalendar,
  SlotProblem,
  Buffers,
  buildDayCalendar,
  clinicHhmm,
  freeSlots,
  intervalProblem,
} from './domain/day-calendar';
import type { VisitPlan } from './appointments.service';

type Db = PrismaService | Prisma.TransactionClient;

/** Online requests still waiting on the clinic or the patient. */
export const OPEN_BOOKING_STATUSES: BookingRequestStatus[] = [
  'PENDING_REVIEW',
  'NEEDS_INFORMATION',
  'PROPOSED',
  'PATIENT_ACCEPTED',
];
/** While a proposal stands, its time and dentist are the request's. */
export const PROPOSAL_BOOKING_STATUSES: BookingRequestStatus[] = ['PROPOSED', 'PATIENT_ACCEPTED'];

/**
 * The time a request is about: the proposed one while a proposal is on the
 * table, otherwise the one the patient asked for.
 */
export function effectiveStartAt(row: {
  status: BookingRequestStatus | string;
  requestedStartAt: Date;
  proposedStartAt?: Date | null;
}): Date {
  return PROPOSAL_BOOKING_STATUSES.includes(row.status as BookingRequestStatus)
    ? (row.proposedStartAt ?? row.requestedStartAt)
    : row.requestedStartAt;
}

/** The dentist a request is about: the proposed one while a proposal stands. */
export function effectiveDentistId(row: {
  status: BookingRequestStatus;
  preferredDentistId: string;
  proposedDentistId?: string | null;
}): string {
  return PROPOSAL_BOOKING_STATUSES.includes(row.status)
    ? (row.proposedDentistId ?? row.preferredDentistId)
    : row.preferredDentistId;
}

/** Why an open request can no longer be booked as it stands. */
export interface RequestIssue {
  kind: string;
  message: string;
}

/** An open online request, as far as its bookability is concerned. */
export interface OpenRequestRow {
  id: string;
  status: BookingRequestStatus;
  appointmentId: string | null;
  serviceId: string;
  createdAt: Date;
  preferredDentistId: string;
  proposedDentistId: string | null;
  requestedStartAt: Date;
  proposedStartAt: Date | null;
}

/**
 * The AppointmentsService rules a request plan needs, passed in by the caller
 * (AvailabilityService cannot depend on AppointmentsService, which uses it).
 */
export interface RequestPlanRules {
  validateDentist(dentistId: string): Promise<unknown>;
  planVisit(dentistId: string, serviceIds: string[], date: string): Promise<VisitPlan | null>;
}

/**
 * Statuses that no longer hold a slot. idx_appointments_slot_active also
 * leaves COMPLETED out (migration 042); a completed visit still counts here
 * until its encounter closed (finishedEarly).
 */
export const SLOT_RELEASING_STATUSES: AppointmentStatus[] = [
  AppointmentStatus.CANCELLED,
  AppointmentStatus.NO_SHOW,
  AppointmentStatus.LEFT,
];

/**
 * A5-04: a visit completed before its booked end holds the dentist only
 * until the encounter closed (never before its own start); the rest of the
 * booked time is free again. Other visits keep their booked interval.
 */
export function finishedEarly<
  T extends {
    status?: AppointmentStatus;
    startAt: Date;
    endAt: Date;
    encounter?: { closedAt: Date | null } | null;
  },
>(b: T): T {
  const closedAt = b.encounter?.closedAt;
  if (b.status !== AppointmentStatus.COMPLETED || !closedAt || closedAt >= b.endAt) return b;
  return { ...b, endAt: closedAt > b.startAt ? closedAt : b.startAt };
}

/** Same lead time create() enforces: a start must be at least a minute ahead. */
const LEAD_MS = 60_000;
const DEFAULT_SLOT_STEP_MIN = 15;

/**
 * Minutes between suggested start times (SLOT_STEP_MIN, default 15). One
 * grid for every slot list (online booking, the booking form, rescheduling,
 * the cross-dentist search), whatever the visit's length: a 90-minute visit
 * in 08:00-12:00 can start at 10:30, not only at 08:00 and 09:30. A booking
 * is checked by the interval rules, so an off-grid time stays valid.
 */
export function slotStepMinutes(): number {
  const raw = process.env.SLOT_STEP_MIN?.trim();
  const value = raw ? Number(raw) : NaN;
  return Number.isInteger(value) && value >= 5 && value <= 60 ? value : DEFAULT_SLOT_STEP_MIN;
}

/**
 * Why a day with working hours still has no time: every window lies inside
 * time-off or closed ranges ('TIME_OFF' when any of it is time-off), else null.
 */
export function blockedAllDay(cal: DayCalendar): 'TIME_OFF' | 'CLOSED' | null {
  if (cal.windows.length === 0) return null;
  const used = new Set<'TIME_OFF' | 'CLOSED'>();
  for (const w of cal.windows) {
    let reached = w.start.getTime();
    for (const b of [...cal.blocked].sort((x, y) => x.start.getTime() - y.start.getTime())) {
      if (b.end.getTime() <= reached || b.start.getTime() > reached) continue;
      used.add(b.kind);
      reached = b.end.getTime();
      if (reached >= w.end.getTime()) break;
    }
    if (reached < w.end.getTime()) return null;
  }
  return used.has('TIME_OFF') ? 'TIME_OFF' : 'CLOSED';
}

/**
 * The single source of "when can this dentist see a patient" (ADR-0009
 * phase 4). It loads one day's rows and hands them to the pure rules in
 * domain/day-calendar.ts; booking, rescheduling, the slot picker, the
 * schedule-impact report and the cross-dentist search all go through here.
 */
@Injectable()
export class AvailabilityService {
  constructor(private readonly prisma: PrismaService) {}

  async loadDay(dentistId: string, date: string, db: Db = this.prisma): Promise<DayCalendar> {
    const day = new Date(date);
    const dayStart = startOfClinicDay(date);
    const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60_000);
    const [schedules, shifts, overrides, timeOffs, bookings, clinicClosures] = await Promise.all([
      db.workingSchedule.findMany({
        where: {
          dentistId,
          dayOfWeek: day.getUTCDay(),
          validFrom: { lte: day },
          OR: [{ validTo: null }, { validTo: { gte: day } }],
          deletedAt: null,
        },
        orderBy: { startTime: 'asc' },
        select: { startTime: true, endTime: true, slotDurationMin: true },
      }),
      // BR-APPT-027: an APPROVED shift registration opens hours that day.
      db.shiftRegistration.findMany({
        where: { dentistId, date: day, status: 'APPROVED', deletedAt: null },
        select: { startTime: true, endTime: true },
      }),
      db.scheduleOverride.findMany({
        where: { dentistId, date: day, deletedAt: null },
        select: { kind: true, startTime: true, endTime: true, reason: true },
      }),
      // BR-SCH-001: only approved time-off blocks.
      db.timeOff.findMany({
        where: {
          dentistId,
          status: 'APPROVED',
          startAt: { lt: dayEnd },
          endAt: { gt: dayStart },
          deletedAt: null,
        },
        select: { startAt: true, endAt: true },
      }),
      db.appointment.findMany({
        where: {
          dentistId,
          status: { notIn: SLOT_RELEASING_STATUSES },
          startAt: { lt: dayEnd },
          endAt: { gt: dayStart },
          deletedAt: null,
        },
        select: {
          id: true,
          status: true,
          startAt: true,
          endAt: true,
          bufferBeforeMin: true,
          bufferAfterMin: true,
          encounter: { select: { closedAt: true } },
        },
      }),
      // Migration 035: Tết/holidays close every dentist's day.
      db.clinicClosure.findMany({
        where: { startDate: { lte: day }, endDate: { gte: day }, deletedAt: null },
        select: { reason: true },
      }),
    ]);
    return buildDayCalendar({
      date,
      schedules: schedules ?? [],
      shifts: shifts ?? [],
      overrides: overrides ?? [],
      timeOffs: timeOffs ?? [],
      bookings: (bookings ?? []).map(finishedEarly),
      clinicClosures: clinicClosures ?? [],
    });
  }

  /** Why [startAt, endAt) can't be booked for the dentist, or null. */
  async checkSlot(
    dentistId: string,
    startAt: Date,
    endAt: Date,
    opts: {
      db?: Db;
      excludeAppointmentId?: string;
      ignoreBookings?: boolean;
      buffers?: Buffers;
    } = {},
  ): Promise<SlotProblem | null> {
    const cal = await this.loadDay(dentistId, clinicDateOnly(startAt), opts.db);
    return intervalProblem(
      cal,
      { start: startAt, end: endAt },
      {
        excludeBookingId: opts.excludeAppointmentId,
        ignoreBookings: opts.ignoreBookings,
        buffers: opts.buffers,
      },
    );
  }

  /** GET /appointments/availability — the booking form's slot picker. */
  async dayAvailability(
    dentistId: string,
    date: string,
    slotDuration?: number,
    buffers: Buffers = {},
    excludeAppointmentId?: string,
  ) {
    const loaded = await this.loadDay(dentistId, date);
    // Rescheduling: the visit being moved does not block its own new time.
    const cal = excludeAppointmentId
      ? { ...loaded, bookings: loaded.bookings.filter(b => b.id !== excludeAppointmentId) }
      : loaded;
    const dayOfWeek = new Date(date).getUTCDay();
    if (cal.windows.length === 0) {
      // A day off is a normal answer for a slot picker, not a 404.
      return {
        dentistId,
        date,
        dayOfWeek,
        workingHours: null,
        windows: [],
        busy: [],
        slotDuration: slotDuration ?? 30,
        availableSlots: [],
        blockedReason: cal.closedAllDay ? 'CLOSED' : 'NO_SCHEDULE',
        ...(cal.closedAllDay ? { closedReason: cal.closedReason } : {}),
        // The whole clinic is closed (its reason is meant for patients too).
        clinicClosed: cal.clinicClosed,
      };
    }
    const slotMin = slotDuration ?? cal.defaultSlotMin;
    const availableSlots = freeSlots(
      cal,
      slotMin,
      slotStepMinutes(),
      new Date(Date.now() + LEAD_MS),
      buffers,
    );
    const dayStart = startOfClinicDay(date);
    const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60_000);
    return {
      dentistId,
      date,
      dayOfWeek,
      workingHours: {
        startTime: clinicHhmm(cal.windows[0].start),
        endTime: clinicHhmm(new Date(Math.max(...cal.windows.map(w => w.end.getTime())))),
      },
      // Raw intervals (clinic "HH:mm") so the booking form can check an
      // arbitrary start + duration, not only the fixed slot grid.
      windows: cal.windows.map(w => ({
        startTime: clinicHhmm(w.start),
        endTime: clinicHhmm(w.end),
      })),
      busy: [...cal.bookings, ...cal.blocked]
        .map(b => ({
          startTime: b.start <= dayStart ? '00:00' : clinicHhmm(b.start),
          endTime: b.end >= dayEnd ? '24:00' : clinicHhmm(b.end),
        }))
        .sort((a, b) => a.startTime.localeCompare(b.startTime)),
      slotDuration: slotMin,
      availableSlots,
      // Working hours, but all of them on time-off / closed ranges.
      blockedReason: availableSlots.length ? null : blockedAllDay(cal),
    };
  }

  /**
   * GET /appointments/availability/search — who can take a visit on a date.
   * With `serviceId`, only active dentists assigned that service that day
   * (dentist_services), and the visit length is the dentist's duration
   * override or the service's; without it, every dentist taking bookings
   * (listDentistOptions' `booking` scope).
   */
  async search(q: { date: string; serviceId?: string; durationMin?: number }) {
    const day = new Date(q.date);
    const dentists = await this.prisma.user.findMany({
      where: {
        ...SCHEDULABLE_ACCOUNT_WHERE,
        userRoles: { some: { role: { code: 'dentist', deletedAt: null } } },
        OR: [{ dentistProfile: null }, { dentistProfile: dentistProfileFilter('booking') }],
        ...(q.serviceId
          ? {
              dentistServices: {
                some: {
                  serviceId: q.serviceId,
                  effectiveFrom: { lte: day },
                  OR: [{ effectiveTo: null }, { effectiveTo: { gte: day } }],
                  service: { isActive: true },
                },
              },
            }
          : {}),
      },
      select: { id: true, fullName: true, dentistProfile: { select: { calendarColor: true } } },
      orderBy: { fullName: 'asc' },
    });
    // BR-SVC-006: the dentist's duration override, else the service default;
    // the service's buffers too, as the booking form and online booking use.
    const durations = new Map<string, number>();
    let buffers: Buffers = {};
    if (q.serviceId) {
      const assignments = await this.prisma.dentistService.findMany({
        where: {
          serviceId: q.serviceId,
          dentistId: { in: dentists.map(d => d.id) },
          effectiveFrom: { lte: day },
          OR: [{ effectiveTo: null }, { effectiveTo: { gte: day } }],
        },
        select: {
          dentistId: true,
          durationMin: true,
          service: {
            select: { defaultDurationMin: true, bufferBeforeMin: true, bufferAfterMin: true },
          },
        },
      });
      for (const a of assignments) {
        durations.set(a.dentistId, a.durationMin ?? a.service.defaultDurationMin);
      }
      // One service, so one set of buffers (they belong to the service).
      const svc = assignments[0]?.service;
      if (svc) buffers = { beforeMin: svc.bufferBeforeMin, afterMin: svc.bufferAfterMin };
    }
    const notBefore = new Date(Date.now() + LEAD_MS);
    const results = await Promise.all(
      dentists.map(async d => {
        const cal = await this.loadDay(d.id, q.date);
        const durationMin = q.durationMin ?? durations.get(d.id) ?? cal.defaultSlotMin;
        return {
          dentistId: d.id,
          fullName: d.fullName,
          calendarColor: d.dentistProfile?.calendarColor ?? null,
          durationMin,
          availableSlots: freeSlots(cal, durationMin, slotStepMinutes(), notBefore, buffers),
        };
      }),
    );
    return results.filter(r => r.availableSlots.length > 0);
  }

  /**
   * The visit an online request stands for on `date` with `dentistId`: the
   * dentist still sees patients (online booking or not) and performs the
   * service then — its own duration and the service's buffers. When the
   * service was withdrawn, or the dentist's assignment to it ended, after the
   * patient sent the request, the assignment that stood then still counts
   * (as a booked visit keeps a withdrawn service on reschedule), so the
   * request can be confirmed or moved instead of being stranded.
   */
  async requestPlan(
    rules: RequestPlanRules,
    row: { serviceId: string; createdAt: Date },
    dentistId: string,
    date: string,
  ): Promise<VisitPlan> {
    await rules.validateDentist(dentistId);
    const day = new Date(date);
    const current = await this.prisma.dentistService.findFirst({
      where: {
        dentistId,
        serviceId: row.serviceId,
        effectiveFrom: { lte: day },
        OR: [{ effectiveTo: null }, { effectiveTo: { gte: day } }],
        service: { isActive: true },
      },
      select: { id: true },
    });
    if (current) return (await rules.planVisit(dentistId, [row.serviceId], date))!;
    const sent = new Date(clinicDateOnly(row.createdAt));
    const earlier = await this.prisma.dentistService.findFirst({
      where: {
        dentistId,
        serviceId: row.serviceId,
        effectiveFrom: { lte: sent },
        OR: [{ effectiveTo: null }, { effectiveTo: { gte: sent } }],
      },
      include: { service: true },
      orderBy: { effectiveFrom: 'desc' },
    });
    if (!earlier) {
      throw new BadRequestException(
        'Bác sĩ này không thực hiện dịch vụ của yêu cầu vào ngày đã chọn',
      );
    }
    const durationMin = earlier.durationMin ?? earlier.service.defaultDurationMin;
    return {
      services: [
        {
          serviceId: row.serviceId,
          serviceCode: earlier.service.code,
          serviceName: earlier.service.name,
          price: Number(earlier.price ?? earlier.service.basePrice),
          durationMin,
          bufferBeforeMin: earlier.service.bufferBeforeMin,
          bufferAfterMin: earlier.service.bufferAfterMin,
          sortOrder: 0,
        },
      ],
      durationMin,
      bufferBeforeMin: earlier.service.bufferBeforeMin,
      bufferAfterMin: earlier.service.bufferAfterMin,
    };
  }

  /**
   * Why each open, unbooked request whose time is still ahead can no longer
   * be confirmed as it stands (closed day, clinic closure, time-off, no
   * schedule, suspended dentist, service no longer offered, time taken), or
   * null. Shared by the booking-request list (`slotIssue`) and the impact
   * of a schedule change (`affectedBookingRequests`). Days and plans are
   * loaded once per dentist and date; `db` lets a caller read its own
   * uncommitted change.
   */
  async requestIssues(
    rules: RequestPlanRules,
    rows: OpenRequestRow[],
    db: Db = this.prisma,
  ): Promise<Map<string, RequestIssue | null>> {
    const days = new Map<string, Promise<DayCalendar>>();
    const plans = new Map<string, Promise<VisitPlan | RequestIssue>>();
    const now = Date.now();
    const out = new Map<string, RequestIssue | null>();
    await Promise.all(
      rows
        .filter(r => OPEN_BOOKING_STATUSES.includes(r.status) && !r.appointmentId)
        .filter(r => effectiveStartAt(r).getTime() > now)
        .map(async r => {
          const dentistId = effectiveDentistId(r);
          const startAt = effectiveStartAt(r);
          const date = clinicDateOnly(startAt);
          const planKey = [dentistId, r.serviceId, date, clinicDateOnly(r.createdAt)].join('|');
          if (!plans.has(planKey)) {
            plans.set(
              planKey,
              this.requestPlan(rules, r, dentistId, date).catch(error => {
                if (error instanceof HttpException)
                  return { kind: 'NOT_BOOKABLE', message: error.message };
                throw error;
              }),
            );
          }
          const plan = await plans.get(planKey)!;
          if ('kind' in plan) {
            out.set(r.id, plan);
            return;
          }
          const dayKey = dentistId + '|' + date;
          if (!days.has(dayKey)) days.set(dayKey, this.loadDay(dentistId, date, db));
          const problem = intervalProblem(
            await days.get(dayKey)!,
            { start: startAt, end: new Date(startAt.getTime() + plan.durationMin * 60_000) },
            { buffers: { beforeMin: plan.bufferBeforeMin, afterMin: plan.bufferAfterMin } },
          );
          out.set(r.id, problem ? { kind: problem.kind, message: problem.message } : null);
        }),
    );
    return out;
  }
}

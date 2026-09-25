import { Injectable } from '@nestjs/common';
import { AppointmentStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { clinicDateOnly, startOfClinicDay } from '../common/date-range.util';
import {
  DayCalendar,
  SlotProblem,
  Buffers,
  buildDayCalendar,
  clinicHhmm,
  freeSlots,
  intervalProblem,
} from './domain/day-calendar';

type Db = PrismaService | Prisma.TransactionClient;

/** Statuses that no longer hold a slot (same as idx_appointments_slot_active). */
export const SLOT_RELEASING_STATUSES: AppointmentStatus[] = [
  AppointmentStatus.CANCELLED,
  AppointmentStatus.NO_SHOW,
  AppointmentStatus.LEFT,
];

/** Same lead time create() enforces: a start must be at least a minute ahead. */
const LEAD_MS = 60_000;

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
    const [schedules, shifts, overrides, timeOffs, bookings] = await Promise.all([
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
          startAt: true,
          endAt: true,
          bufferBeforeMin: true,
          bufferAfterMin: true,
        },
      }),
    ]);
    return buildDayCalendar({
      date,
      schedules: schedules ?? [],
      shifts: shifts ?? [],
      overrides: overrides ?? [],
      timeOffs: timeOffs ?? [],
      bookings: bookings ?? [],
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
  ) {
    const cal = await this.loadDay(dentistId, date);
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
      };
    }
    const slotMin = slotDuration ?? cal.defaultSlotMin;
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
      availableSlots: freeSlots(cal, slotMin, slotMin, new Date(Date.now() + LEAD_MS), buffers),
      blockedReason: null,
    };
  }

  /**
   * GET /appointments/availability/search — who can take a visit on a date.
   * With `serviceId`, only active dentists assigned that service that day
   * (dentist_services), and the visit length is the dentist's duration
   * override or the service's; without it, every active dentist.
   */
  async search(q: { date: string; serviceId?: string; durationMin?: number; stepMin?: number }) {
    const day = new Date(q.date);
    const dentists = await this.prisma.user.findMany({
      where: {
        status: 'ACTIVE',
        deactivatedAt: null,
        deletedAt: null,
        userRoles: { some: { role: { code: 'dentist', deletedAt: null } } },
        OR: [
          { dentistProfile: null },
          { dentistProfile: { practiceStatus: 'ACTIVE', deletedAt: null } },
        ],
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
    // BR-SVC-006: the dentist's duration override, else the service default.
    const durations = new Map<string, number>();
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
          service: { select: { defaultDurationMin: true } },
        },
      });
      for (const a of assignments) {
        durations.set(a.dentistId, a.durationMin ?? a.service.defaultDurationMin);
      }
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
          availableSlots: freeSlots(cal, durationMin, q.stepMin ?? 15, notBefore),
        };
      }),
    );
    return results.filter(r => r.availableSlots.length > 0);
  }
}

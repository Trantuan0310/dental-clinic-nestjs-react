import { Injectable } from '@nestjs/common';
import { AppointmentStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { clinicDateOnly, endOfClinicDay, startOfClinicDay } from '../common/date-range.util';
import { loadDayCalendars, type DayKey } from '../appointments/domain/day-calendar-loader';
import { ARRIVED_STATUSES, ReportsService } from './reports.service';
import {
  capacityCells,
  median,
  percent,
  scorecardMetric,
  waitMinutes,
  type CapacityCell,
  type ScorecardMetric,
} from './practice-metrics';

const DAY_MS = 24 * 60 * 60_000;
/** A slot that no longer holds a patient: it frees the chair, so it is not a rebooking. */
const NOT_HOLDING: AppointmentStatus[] = [
  AppointmentStatus.CANCELLED,
  AppointmentStatus.NO_SHOW,
  AppointmentStatus.LEFT,
];

export interface CapacityHeatmap {
  from: string;
  to: string;
  dentistId: string | null;
  dentists: Array<{ id: string; fullName: string }>;
  cells: Array<CapacityCell & { utilization: number }>;
  totals: { availableMin: number; bookedMin: number; utilization: number | null };
}

export interface Scorecard {
  from: string;
  to: string;
  metrics: ScorecardMetric[];
}

/**
 * Practice-level measures for the Dashboard (docs/11_Improvement B1, B2):
 * how full the dentists' open hours are, and four rates against a target.
 * Everything is read from data the clinic already records.
 */
@Injectable()
export class PracticeMetricsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reports: ReportsService,
  ) {}

  async capacityHeatmap(query: {
    from?: string;
    to?: string;
    dentistId?: string;
  }): Promise<CapacityHeatmap> {
    const { fromDate, toDate } = this.reports.resolveRange(query.from, query.to);
    const dentists = await this.prisma.user.findMany({
      where: {
        deletedAt: null,
        deactivatedAt: null,
        status: { not: 'DEACTIVATED' },
        userRoles: { some: { role: { code: 'dentist' } } },
      },
      select: { id: true, fullName: true },
      orderBy: { fullName: 'asc' },
    });
    const chosen = query.dentistId ? dentists.filter(d => d.id === query.dentistId) : dentists;

    const dates: string[] = [];
    for (
      let day = startOfClinicDay(clinicDateOnly(fromDate));
      day.getTime() <= toDate.getTime();
      day = new Date(day.getTime() + DAY_MS)
    ) {
      dates.push(clinicDateOnly(day));
    }
    const keys: DayKey[] = chosen.flatMap(d => dates.map(date => ({ dentistId: d.id, date })));
    const calendars = await loadDayCalendars(this.prisma, keys, { withBookings: true });
    const cells = capacityCells([...calendars.values()]).map(c => ({
      ...c,
      utilization: Math.round((c.bookedMin / c.availableMin) * 1000) / 1000,
    }));
    const availableMin = cells.reduce((sum, c) => sum + c.availableMin, 0);
    const bookedMin = cells.reduce((sum, c) => sum + c.bookedMin, 0);
    return {
      from: clinicDateOnly(fromDate),
      to: clinicDateOnly(toDate),
      dentistId: query.dentistId ?? null,
      dentists,
      cells,
      totals: {
        availableMin,
        bookedMin,
        utilization: availableMin > 0 ? Math.round((bookedMin / availableMin) * 1000) / 1000 : null,
      },
    };
  }

  async scorecard(query: { from?: string; to?: string }): Promise<Scorecard> {
    const { fromDate, toDate } = this.reports.resolveRange(query.from, query.to);
    const [noShow, rebook, acceptance, wait] = await Promise.all([
      this.noShowRate(fromDate, toDate),
      this.rebookRate(fromDate, toDate),
      this.planAcceptance(fromDate, toDate),
      this.medianWait(fromDate, toDate),
    ]);
    return {
      from: clinicDateOnly(fromDate),
      to: clinicDateOnly(toDate),
      metrics: [noShow, rebook, acceptance, wait],
    };
  }

  /** No-shows ÷ (visits that came + no-shows): a booking not yet due is in neither. */
  private async noShowRate(from: Date, to: Date) {
    const where = { deletedAt: null, startAt: { gte: from, lte: to } };
    const [noShow, arrived] = await Promise.all([
      this.prisma.appointment.count({ where: { ...where, status: AppointmentStatus.NO_SHOW } }),
      this.prisma.appointment.count({ where: { ...where, status: { in: ARRIVED_STATUSES } } }),
    ]);
    const denominator = noShow + arrived;
    return scorecardMetric('noShowRate', percent(noShow, denominator), noShow, denominator);
  }

  /** Finished visits whose patient has a later booking that still holds a slot. */
  private async rebookRate(from: Date, to: Date) {
    const visits = await this.prisma.appointment.findMany({
      where: {
        deletedAt: null,
        status: AppointmentStatus.COMPLETED,
        startAt: { gte: from, lte: to },
      },
      select: { patientId: true, startAt: true },
    });
    if (visits.length === 0) return scorecardMetric('rebookRate', null, 0, 0);
    const latest = await this.prisma.appointment.groupBy({
      by: ['patientId'],
      where: {
        deletedAt: null,
        status: { notIn: NOT_HOLDING },
        patientId: { in: [...new Set(visits.map(v => v.patientId))] },
        startAt: { gt: from },
      },
      _max: { startAt: true },
    });
    const latestByPatient = new Map(latest.map(l => [l.patientId, l._max.startAt]));
    const rebooked = visits.filter(v => {
      const next = latestByPatient.get(v.patientId);
      return next != null && next.getTime() > v.startAt.getTime();
    }).length;
    return scorecardMetric('rebookRate', percent(rebooked, visits.length), rebooked, visits.length);
  }

  /** Of the plans proposed in the range, the share the patient accepted. */
  private async planAcceptance(from: Date, to: Date) {
    const proposedAt = { gte: from, lte: to };
    const [proposed, accepted] = await Promise.all([
      this.prisma.treatmentPlan.count({ where: { proposedAt } }),
      this.prisma.treatmentPlan.count({ where: { proposedAt, acceptedAt: { not: null } } }),
    ]);
    return scorecardMetric('planAcceptance', percent(accepted, proposed), accepted, proposed);
  }

  /** Median wait from the booked time (or later check-in) to the start of the exam. */
  private async medianWait(from: Date, to: Date) {
    const encounters = await this.prisma.encounter.findMany({
      where: {
        startedAt: { gte: from, lte: endOfClinicDay(clinicDateOnly(to)) },
        appointment: { deletedAt: null, checkedInAt: { not: null } },
      },
      select: { startedAt: true, appointment: { select: { startAt: true, checkedInAt: true } } },
    });
    const waits: number[] = [];
    for (const e of encounters) {
      const { startAt, checkedInAt } = e.appointment;
      if (!checkedInAt) continue;
      const minutes = waitMinutes(startAt, checkedInAt, e.startedAt);
      if (minutes != null) waits.push(minutes);
    }
    return scorecardMetric('medianWait', median(waits), null, waits.length);
  }
}

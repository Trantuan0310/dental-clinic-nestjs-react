import { BadRequestException, Injectable } from '@nestjs/common';
import { AppointmentStatus, InvoiceStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { clinicDateOnly, endOfClinicDay, startOfClinicDay } from '../common/date-range.util';
import { loadDayCalendars, type DayKey } from '../appointments/domain/day-calendar-loader';
import { ARRIVED_STATUSES, ReportsService } from './reports.service';
import {
  capacityCells,
  coverageCells,
  isLateCancel,
  patientFunnel,
  median,
  percent,
  scorecardMetric,
  SCORECARD_TARGETS,
  waitMinutes,
  type CapacityCell,
  type Funnel,
  type FunnelRow,
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

export interface PatientFunnel extends Funnel {
  from: string;
  to: string;
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

  private async capacityData(query: { from?: string; to?: string; dentistId?: string }) {
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
    return { fromDate, toDate, dentists, calendars: [...calendars.values()] };
  }

  async shiftCoverage(query: { from?: string; to?: string; dentistId?: string }) {
    const { dentists, calendars } = await this.capacityData(query);
    return { dentists, cells: coverageCells(calendars) };
  }

  async capacityHeatmap(query: {
    from?: string;
    to?: string;
    dentistId?: string;
  }): Promise<CapacityHeatmap> {
    const { fromDate, toDate, dentists, calendars } = await this.capacityData(query);
    const cells = capacityCells(calendars).map(c => ({
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

  async thresholds() {
    const rows = await this.prisma.kpiThreshold.findMany();
    return Object.entries(SCORECARD_TARGETS).map(([key, defaults]) => {
      const saved = rows.find(r => r.key === key);
      return {
        key: key as ScorecardMetric['key'],
        ...defaults,
        target: saved?.target ?? defaults.target,
        okAt: saved?.okAt ?? defaults.okAt,
      };
    });
  }

  async updateThresholds(
    rows: Array<{ key: ScorecardMetric['key']; target: number; okAt: number }>,
    actorId: string,
  ) {
    if (rows.length !== 6 || new Set(rows.map(r => r.key)).size !== 6) {
      throw new BadRequestException('Cần đủ sáu chỉ số, không trùng lặp.');
    }
    for (const row of rows) {
      const defaults = SCORECARD_TARGETS[row.key];
      const max = defaults?.unit === 'minutes' ? 480 : 100;
      if (
        !Object.prototype.hasOwnProperty.call(SCORECARD_TARGETS, row.key) ||
        ![row.target, row.okAt].every(n => Number.isFinite(n) && n >= 0 && n <= max) ||
        (defaults.direction === 'lower' ? row.target > row.okAt : row.target < row.okAt)
      ) {
        throw new BadRequestException('Ngưỡng KPI không hợp lệ.');
      }
    }
    await this.prisma.$transaction(
      rows.map(({ key, target, okAt }) =>
        this.prisma.kpiThreshold.upsert({
          where: { key },
          create: { key, target, okAt, updatedBy: actorId },
          update: { target, okAt, updatedBy: actorId },
        }),
      ),
    );
    return this.thresholds();
  }

  async scorecard(query: { from?: string; to?: string }): Promise<Scorecard> {
    const { fromDate, toDate } = this.reports.resolveRange(query.from, query.to);
    const [noShow, rebook, acceptance, wait, lateCancel, collection] = await Promise.all([
      this.noShowRate(fromDate, toDate),
      this.rebookRate(fromDate, toDate),
      this.planAcceptance(fromDate, toDate),
      this.medianWait(fromDate, toDate),
      this.lateCancelRate(fromDate, toDate),
      this.collectionRate(fromDate, toDate),
    ]);
    const thresholds = await this.thresholds();
    return {
      from: clinicDateOnly(fromDate),
      to: clinicDateOnly(toDate),
      metrics: [noShow, rebook, acceptance, wait, lateCancel, collection].map(metric => ({
        ...metric,
        ...thresholds.find(t => t.key === metric.key),
      })),
    };
  }

  /**
   * What became of the bookings in the range (those the clinic did not cancel
   * itself): came, was examined, paid in full, and has a later booking.
   */
  async patientFunnel(query: { from?: string; to?: string }): Promise<PatientFunnel> {
    const { fromDate, toDate } = this.reports.resolveRange(query.from, query.to);
    const appts = await this.prisma.appointment.findMany({
      where: {
        deletedAt: null,
        cancelledByClinic: false,
        startAt: { gte: fromDate, lte: toDate },
      },
      select: {
        patientId: true,
        startAt: true,
        status: true,
        source: true,
        encounter: {
          select: {
            invoices: {
              where: { status: { not: InvoiceStatus.VOIDED } },
              select: { status: true },
            },
          },
        },
      },
    });
    const paidPatients = [
      ...new Set(
        appts
          .filter(a => a.encounter?.invoices.some(i => i.status === InvoiceStatus.PAID))
          .map(a => a.patientId),
      ),
    ];
    const latest = paidPatients.length
      ? await this.prisma.appointment.groupBy({
          by: ['patientId'],
          where: {
            deletedAt: null,
            status: { notIn: NOT_HOLDING },
            patientId: { in: paidPatients },
            startAt: { gt: fromDate },
          },
          _max: { startAt: true },
        })
      : [];
    const next = new Map(latest.map(l => [l.patientId, l._max.startAt]));
    const rows: FunnelRow[] = appts.map(a => {
      const paid = !!a.encounter?.invoices.some(i => i.status === InvoiceStatus.PAID);
      const later = next.get(a.patientId);
      return {
        source: a.source,
        arrived: ARRIVED_STATUSES.includes(a.status),
        examined: !!a.encounter,
        paid,
        rebooked: paid && later != null && later.getTime() > a.startAt.getTime(),
      };
    });
    return { from: clinicDateOnly(fromDate), to: clinicDateOnly(toDate), ...patientFunnel(rows) };
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

  /** Cancellations made less than 24 hours ahead ÷ bookings (those the clinic cancelled itself are left out). */
  private async lateCancelRate(from: Date, to: Date) {
    const where = {
      deletedAt: null,
      startAt: { gte: from, lte: to },
      cancelledByClinic: false,
    };
    const [total, cancelled] = await Promise.all([
      this.prisma.appointment.count({ where }),
      this.prisma.appointment.findMany({
        where: { ...where, status: AppointmentStatus.CANCELLED, cancelledAt: { not: null } },
        select: { startAt: true, cancelledAt: true },
      }),
    ]);
    const late = cancelled.filter(a => isLateCancel(a.startAt, a.cancelledAt)).length;
    return scorecardMetric('lateCancelRate', percent(late, total), late, total);
  }

  /** Collected ÷ treatment revenue of the range, on the report's shared basis; capped at 100%. */
  private async collectionRate(from: Date, to: Date) {
    const { revenue, collected } = await this.reports.revenueAndCollected(from, to);
    const value = percent(collected, revenue);
    return scorecardMetric('collectionRate', value == null ? null : Math.min(value, 100));
  }
}

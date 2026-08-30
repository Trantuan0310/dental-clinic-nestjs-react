import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { PayrollCycle, PayrollPeriodStatus, PayrollAdjustmentType, Prisma } from '@prisma/client';
import {
  PeriodOverlapException,
  PayrollStateException,
  PayrollNotFoundException,
  PayrollForbiddenException,
} from './domain/exceptions';
import {
  assertTransition,
  isAdjustable,
  isComputable,
  isViewableByDentist,
  validateAdjustmentReason,
} from './domain/payroll-state';
import {
  computeProgressiveTax,
  DEFAULT_TAX_BRACKETS,
  TaxBracketsConfig,
} from './domain/tax-calculator';
import {
  proRateBaseSalary,
  effectiveCommissionPct,
  compRange,
  daysBetweenInclusive,
} from './domain/prorate-calculator';
import {
  CreateCompensationDto,
  UpdateCompensationDto,
  UpdatePayrollConfigDto,
  CreatePayrollPeriodDto,
  AddAdjustmentDto,
  MarkPaidDto,
} from './dto/payroll.dto';

/**
 * PayrollService â€” owns the computation, lifecycle, and audit of payroll periods.
 *
 * Cross-module concerns:
 * - Reads `Encounter` (Medical Records) and `Treatment` (revenue)
 * - Reads `WorkingSchedule` + `ShiftRegistration` (Appointments) for shift counts
 * - Reads `User` (Auth) for dentist info
 */
@Injectable()
export class PayrollService {
  private readonly logger = new Logger(PayrollService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // ============================================================================
  // PayrollConfig
  // ============================================================================

  async getConfig() {
    let config = await this.prisma.payrollConfig.findFirst();
    if (!config) {
      // BR-PAY-001: Seed default config if missing
      config = await this.prisma.payrollConfig.create({
        data: { taxBrackets: DEFAULT_TAX_BRACKETS as unknown as Prisma.InputJsonValue },
      });
    }
    return config;
  }

  /**
   * BR-PAY-023: Resolve frozen config snapshot for a period.
   * Used by compute and addAdjustment to ensure historical payroll uses
   * the config effective at period CREATION time, not current config.
   */
  async getPeriodConfigSnapshot(periodId: string) {
    const period = await this.prisma.payrollPeriod.findUnique({
      where: { id: periodId },
      select: { configSnapshot: true },
    });
    if (!period) throw new PayrollNotFoundException('PayrollPeriod', periodId);

    const snapshot = period.configSnapshot as unknown as {
      overtimeMultiplier: string | number;
      bhxhPct: string | number;
      bhytPct: string | number;
      bhtnPct: string | number;
      minGrossForBhxh: string | number;
      probationSalaryPct: string | number;
      taxBrackets: TaxBracketsConfig;
    };

    // Note: payrollCycle is intentionally omitted from the returned object.
    // The period's payrollCycle is read separately via period.payrollCycle
    // (see computePeriod). Returning undefined-as-type-cast was misleading.
    return {
      overtimeMultiplier: new Prisma.Decimal(String(snapshot.overtimeMultiplier)),
      bhxhPct: new Prisma.Decimal(String(snapshot.bhxhPct)),
      bhytPct: new Prisma.Decimal(String(snapshot.bhytPct)),
      bhtnPct: new Prisma.Decimal(String(snapshot.bhtnPct)),
      minGrossForBhxh: new Prisma.Decimal(String(snapshot.minGrossForBhxh)),
      probationSalaryPct: new Prisma.Decimal(String(snapshot.probationSalaryPct)),
      taxBrackets: snapshot.taxBrackets,
    };
  }

  async updateConfig(dto: UpdatePayrollConfigDto, actorUserId: string) {
    const oldConfig = await this.getConfig();

    const _updated = await this.prisma.payrollConfig.updateMany({
      where: {},
      data: {
        payrollCycle: dto.payrollCycle as PayrollCycle,
        overtimeMultiplier: dto.overtimeMultiplier,
        defaultTaxTncnPct: dto.defaultTaxTncnPct,
        bhxhPct: dto.bhxhPct,
        bhytPct: dto.bhytPct,
        bhtnPct: dto.bhtnPct,
        minGrossForBhxh: dto.minGrossForBhxh,
        probationSalaryPct: dto.probationSalaryPct,
        taxBrackets: dto.taxBrackets as unknown as Prisma.InputJsonValue,
        updatedByUserId: actorUserId,
      },
    });

    await this.audit.log({
      actorUserId,
      action: 'PAYROLL_CONFIG_UPDATED',
      targetType: 'PAYROLL_CONFIG',
      metadata: {
        fields: Object.keys(dto),
        oldOvertimeMultiplier: oldConfig.overtimeMultiplier,
        newOvertimeMultiplier: dto.overtimeMultiplier,
        // BR-PAY-023 note: existing periods already captured snapshot, so this
        // change only affects future period creations.
      },
    });

    return this.getConfig();
  }

  // ============================================================================
  // Compensation CRUD
  // ============================================================================

  async listCompensations(filter: { dentistId?: string; activeOn?: Date }) {
    return this.prisma.dentistCompensation.findMany({
      where: {
        deletedAt: null,
        ...(filter.dentistId && { dentistId: filter.dentistId }),
        ...(filter.activeOn && {
          effectiveFrom: { lte: filter.activeOn },
          OR: [{ effectiveTo: null }, { effectiveTo: { gte: filter.activeOn } }],
        }),
      },
      orderBy: { effectiveFrom: 'desc' },
    });
  }

  async createCompensation(dto: CreateCompensationDto, actorUserId: string) {
    // BR-PAY-022: prevent overlap. Postgres exclusion constraint will also enforce,
    // but pre-check for friendly error message.
    const overlap = await this.findCompensationOverlap(
      dto.dentistId,
      new Date(dto.effectiveFrom),
      dto.effectiveTo ? new Date(dto.effectiveTo) : null,
    );
    if (overlap) {
      throw new PeriodOverlapException(
        `Compensation already exists for this dentist in [${overlap.effectiveFrom.toISOString().slice(0, 10)}, ${overlap.effectiveTo?.toISOString().slice(0, 10) ?? 'âˆž'})`,
      );
    }

    const created = await this.prisma.dentistCompensation.create({
      data: {
        dentistId: dto.dentistId,
        effectiveFrom: new Date(dto.effectiveFrom),
        effectiveTo: dto.effectiveTo ? new Date(dto.effectiveTo) : null,
        baseSalaryVnd: dto.baseSalaryVnd,
        commissionPct: dto.commissionPct,
        overtimeHourlyVnd: dto.overtimeHourlyVnd ?? 0,
        notes: dto.notes,
        approvedByUserId: actorUserId,
        approvedAt: new Date(),
      },
    });

    await this.audit.log({
      actorUserId,
      action: 'COMPENSATION_CREATED',
      targetType: 'DENTIST_COMPENSATION',
      targetId: created.id,
      metadata: {
        dentistId: created.dentistId,
        baseSalaryVnd: created.baseSalaryVnd,
        commissionPct: created.commissionPct,
      },
    });

    return created;
  }

  async updateCompensation(id: string, dto: UpdateCompensationDto, actorUserId: string) {
    const updated = await this.prisma.dentistCompensation.update({
      where: { id },
      data: {
        effectiveTo:
          dto.effectiveTo === undefined
            ? undefined
            : dto.effectiveTo
              ? new Date(dto.effectiveTo)
              : null,
        baseSalaryVnd: dto.baseSalaryVnd,
        commissionPct: dto.commissionPct,
        overtimeHourlyVnd: dto.overtimeHourlyVnd,
        notes: dto.notes,
      },
    });

    await this.audit.log({
      actorUserId,
      action: 'COMPENSATION_UPDATED',
      targetType: 'DENTIST_COMPENSATION',
      targetId: id,
      metadata: { fields: Object.keys(dto) },
    });

    return updated;
  }

  async softDeleteCompensation(id: string, actorUserId: string) {
    // Sets effectiveTo to today (BR-PAY compensation end-of-life)
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);

    const updated = await this.prisma.dentistCompensation.update({
      where: { id },
      data: { effectiveTo: today, deletedAt: new Date() },
    });

    await this.audit.log({
      actorUserId,
      action: 'COMPENSATION_DELETED',
      targetType: 'DENTIST_COMPENSATION',
      targetId: id,
    });

    return updated;
  }

  private async findCompensationOverlap(
    dentistId: string,
    effectiveFrom: Date,
    effectiveTo: Date | null,
  ) {
    // For two ranges to overlap: A.start < B.end AND B.start < A.end
    return this.prisma.dentistCompensation.findFirst({
      where: {
        dentistId,
        deletedAt: null,
        effectiveFrom: { lt: effectiveTo ?? new Date('9999-12-31') },
        OR: [{ effectiveTo: null }, { effectiveTo: { gt: effectiveFrom } }],
      },
    });
  }

  // ============================================================================
  // PayrollPeriod lifecycle
  // ============================================================================

  async listPeriods(filter: { status?: PayrollPeriodStatus; year?: number }) {
    return this.prisma.payrollPeriod.findMany({
      where: {
        ...(filter.status && { status: filter.status }),
        ...(filter.year && {
          periodStart: {
            gte: new Date(Date.UTC(filter.year, 0, 1)),
            lte: new Date(Date.UTC(filter.year, 11, 31)),
          },
        }),
      },
      orderBy: { periodStart: 'desc' },
    });
  }

  async createPeriod(dto: CreatePayrollPeriodDto, actorUserId: string) {
    const config = await this.getConfig();
    const start = new Date(dto.periodStart);
    const end = new Date(dto.periodEnd);

    if (end <= start) {
      throw new PayrollStateException('periodEnd must be after periodStart');
    }

    // BR-PAY-003: prevent overlap
    const overlap = await this.prisma.payrollPeriod.findFirst({
      where: {
        status: { not: PayrollPeriodStatus.LOCKED },
        periodStart: { lt: end },
        periodEnd: { gt: start },
      },
    });
    if (overlap) {
      throw new PeriodOverlapException(
        `Period [${overlap.periodStart.toISOString().slice(0, 10)}, ${overlap.periodEnd.toISOString().slice(0, 10)}] already exists`,
      );
    }

    // BR-PAY-023: snapshot PayrollConfig at creation time. Future computes for this
    // period always use this snapshot, not the live config (so admin edits to
    // config later don't retroactively change historical payroll).
    const configSnapshot = {
      payrollCycle: config.payrollCycle,
      overtimeMultiplier: config.overtimeMultiplier,
      bhxhPct: config.bhxhPct,
      bhytPct: config.bhytPct,
      bhtnPct: config.bhtnPct,
      minGrossForBhxh: config.minGrossForBhxh,
      probationSalaryPct: config.probationSalaryPct,
      taxBrackets: config.taxBrackets,
      snapshottedAt: new Date().toISOString(),
    };

    const created = await this.prisma.payrollPeriod.create({
      data: {
        periodStart: start,
        periodEnd: end,
        payrollCycle: config.payrollCycle,
        configSnapshot: configSnapshot as unknown as Prisma.InputJsonValue,
        status: PayrollPeriodStatus.DRAFT,
        createdByUserId: actorUserId,
      },
    });

    await this.audit.log({
      actorUserId,
      action: 'PERIOD_CREATED',
      targetType: 'PAYROLL_PERIOD',
      targetId: created.id,
      metadata: { periodStart: start, periodEnd: end },
    });

    return created;
  }

  async getPeriodDetail(id: string) {
    const period = await this.prisma.payrollPeriod.findUnique({
      where: { id },
      include: {
        lineItems: {
          include: {
            dentist: { select: { id: true, fullName: true, email: true } },
            adjustments: true,
            encounterDetails: {
              include: {
                encounter: {
                  select: {
                    id: true,
                    startedAt: true,
                    closedAt: true,
                    patient: { select: { code: true, fullName: true } },
                  },
                },
              },
            },
          },
        },
      },
    });
    if (!period) throw new PayrollNotFoundException('PayrollPeriod', id);
    return period;
  }

  /**
   * Compute or re-compute payroll for a period. Idempotent (BR-PAY-022).
   * Replaces all existing line items.
   */
  async computePeriod(periodId: string, actorUserId: string) {
    const period = await this.prisma.payrollPeriod.findUnique({
      where: { id: periodId },
    });
    if (!period) throw new PayrollNotFoundException('PayrollPeriod', periodId);
    if (!isComputable(period.status)) {
      throw new PayrollStateException(
        `Cannot compute period in status ${period.status}. Only DRAFT or REVIEWING allowed.`,
      );
    }

    // BR-PAY-023: Use the period's SNAPSHOT, not the live config, so admin edits
    // to PayrollConfig after the period was created do NOT change this period's numbers.
    const snapshot = period.configSnapshot as unknown as {
      payrollCycle: PayrollCycle;
      overtimeMultiplier: Prisma.Decimal;
      bhxhPct: Prisma.Decimal;
      bhytPct: Prisma.Decimal;
      bhtnPct: Prisma.Decimal;
      minGrossForBhxh: Prisma.Decimal;
      probationSalaryPct: Prisma.Decimal;
      taxBrackets: TaxBracketsConfig;
    };

    const taxConfig: TaxBracketsConfig = snapshot.taxBrackets ?? DEFAULT_TAX_BRACKETS;

    // Wrap snapshot as config-like object so compute code reads unchanged.
    const config = {
      payrollCycle: snapshot.payrollCycle,
      overtimeMultiplier: new Prisma.Decimal(snapshot.overtimeMultiplier.toString()),
      bhxhPct: new Prisma.Decimal(snapshot.bhxhPct.toString()),
      bhytPct: new Prisma.Decimal(snapshot.bhytPct.toString()),
      bhtnPct: new Prisma.Decimal(snapshot.bhtnPct.toString()),
      minGrossForBhxh: new Prisma.Decimal(snapshot.minGrossForBhxh.toString()),
      probationSalaryPct: new Prisma.Decimal(snapshot.probationSalaryPct.toString()),
    };

    // All dentists with role=dentist and active status
    const dentists = await this.prisma.user.findMany({
      where: {
        status: 'ACTIVE',
        userRoles: { some: { role: { code: 'dentist' } } },
        deletedAt: null,
      },
      select: { id: true, fullName: true },
    });

    const payPeriod = { start: period.periodStart, end: period.periodEnd };

    type LineItemComputed = Awaited<ReturnType<PayrollService['computeLineItemForDentist']>>;
    const results: Array<{
      dentistId: string;
      dentistName: string;
      lineItemId: string;
      computed: LineItemComputed;
    }> = [];

    // Use a transaction so the entire compute is atomic (BR-PAY-022 idempotent).
    // Serializable isolation prevents two concurrent recompute calls from
    // producing duplicate PayrollEncounterDetail rows on the same treatment.
    await this.prisma.$transaction(
      async tx => {
        // Clear existing line items (cascade deletes details + adjustments)
        await tx.payrollLineItem.deleteMany({ where: { payrollPeriodId: periodId } });

        for (const dentist of dentists) {
          const lineItem = await this.computeLineItemForDentist(
            tx,
            dentist.id,
            payPeriod,
            config,
            taxConfig,
          );

          const { _encounterDetails, ...persistedFields } = lineItem;

          const created = await tx.payrollLineItem.create({
            data: {
              payrollPeriodId: periodId,
              dentistId: dentist.id,
              ...persistedFields,
              computationLog: lineItem.computationLog as unknown as Prisma.InputJsonValue,
              computedAt: new Date(),
            },
          });

          // Persist PayrollEncounterDetail rows (one per treatment, not per encounter)
          // Critical #2 fix: previously _encounterDetails was discarded â†’ data loss
          if (_encounterDetails.length > 0) {
            const detailRows = _encounterDetails.flatMap(enc =>
              enc.treatments.map(t => ({
                payrollLineItemId: created.id,
                payrollPeriodId: periodId,
                encounterId: enc.encounterId,
                treatmentId: t.id,
                treatmentRevenueVnd: t.revenue,
                encounterStartAt: enc.startedAt,
                encounterEndAt: enc.closedAt,
                durationMinutes: enc.durationMinutes,
                treatmentBreakdown: enc.treatments as unknown as Prisma.InputJsonValue,
              })),
            );

            // Batch create with skipDuplicates for idempotency
            await tx.payrollEncounterDetail.createMany({
              data: detailRows,
              skipDuplicates: true,
            });
          }

          results.push({
            dentistId: dentist.id,
            dentistName: dentist.fullName,
            lineItemId: created.id,
            computed: lineItem,
          });
        }
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );

    await this.audit.log({
      actorUserId,
      action: 'PERIOD_COMPUTED',
      targetType: 'PAYROLL_PERIOD',
      targetId: periodId,
      metadata: { dentistCount: dentists.length },
    });

    return { periodId, lineItems: results };
  }

  /**
   * Build (without saving) a line item for one dentist in a pay period.
   * Pulled into its own method so event-listener can re-use for incremental updates.
   */
  private async computeLineItemForDentist(
    tx: Prisma.TransactionClient,
    dentistId: string,
    payPeriod: { start: Date; end: Date },
    config: {
      payrollCycle: PayrollCycle;
      overtimeMultiplier: Prisma.Decimal;
      bhxhPct: Prisma.Decimal;
      bhytPct: Prisma.Decimal;
      bhtnPct: Prisma.Decimal;
      minGrossForBhxh: Prisma.Decimal;
      probationSalaryPct: Prisma.Decimal;
    },
    taxConfig: TaxBracketsConfig,
  ) {
    // 1. Compensation effective in this period
    const comp = await tx.dentistCompensation.findFirst({
      where: {
        dentistId,
        deletedAt: null,
        effectiveFrom: { lte: payPeriod.end },
        OR: [{ effectiveTo: null }, { effectiveTo: { gte: payPeriod.start } }],
      },
      orderBy: { effectiveFrom: 'desc' },
    });

    let baseSalaryVnd = 0;
    let commissionPct = 0;
    let overtimeHourlyVnd = 0;
    const compensationLog: Record<string, unknown> = {};

    if (comp) {
      const cRange = compRange(comp.effectiveFrom, comp.effectiveTo);
      baseSalaryVnd = proRateBaseSalary(Number(comp.baseSalaryVnd), cRange, payPeriod);
      const commissionInfo = effectiveCommissionPct(Number(comp.commissionPct), cRange, payPeriod);
      // Effective commission pct for the overlap portion (for sub-ranges, multiple comps)
      commissionPct = commissionInfo.effectivePct;
      overtimeHourlyVnd = Number(comp.overtimeHourlyVnd);
      compensationLog.compensationId = comp.id;
      compensationLog.compensationOverlapDays = commissionInfo.overlapDays;
      compensationLog.compensationPeriodDays = commissionInfo.periodDays;
    } else {
      compensationLog.note = 'No compensation for this dentist in period';
    }

    // 2. Completed encounters in period
    const encounters = await tx.encounter.findMany({
      where: {
        dentistId,
        status: 'COMPLETED',
        closedAt: { gte: payPeriod.start, lte: payPeriod.end },
      },
      include: {
        treatments: { where: { deletedAt: null } },
      },
    });

    let totalRevenueVnd = 0;
    const encounterDetails: Array<{
      encounterId: string;
      treatments: Array<{ id: string; revenue: number }>;
      startedAt: Date;
      closedAt: Date;
      durationMinutes: number;
    }> = [];

    for (const enc of encounters) {
      let encRevenue = 0;
      const treatmentBreakdown: Array<{ id: string; revenue: number }> = [];
      for (const t of enc.treatments) {
        const rev = Number(t.unitPrice);
        encRevenue += rev;
        treatmentBreakdown.push({ id: t.id, revenue: rev });
      }
      totalRevenueVnd += encRevenue;

      const durationMin =
        enc.startedAt && enc.closedAt
          ? Math.round((enc.closedAt.getTime() - enc.startedAt.getTime()) / 60_000)
          : 0;
      encounterDetails.push({
        encounterId: enc.id,
        treatments: treatmentBreakdown,
        startedAt: enc.startedAt ?? enc.closedAt ?? new Date(),
        closedAt: enc.closedAt ?? enc.startedAt ?? new Date(),
        durationMinutes: durationMin,
      });
    }

    // 3. Commission
    const commissionVnd = Math.round(totalRevenueVnd * commissionPct);

    // 4. Worked shifts: union of WorkingSchedule + ShiftRegistration.approved
    const workedShifts = await this.countPaidShifts(tx, dentistId, payPeriod);
    const { totalHours, overtimeHours, overtimeThresholdHours } = await this.computeWorkedHours(
      tx,
      dentistId,
      payPeriod,
    );
    const overtimePayVnd = Math.round(
      overtimeHours * overtimeHourlyVnd * Number(config.overtimeMultiplier),
    );

    // 5. Bonus / penalty â€” fixed: was `payrollPeriodId: undefined` which Prisma
    // silently ignores, causing adjustments to leak across periods.
    // For first-time compute, there are no adjustments yet (they're added later
    // via addAdjustment which re-aggregates). So this is 0 by design.
    const bonusVnd = 0;
    const penaltyVnd = 0;

    // 6. Gross pay
    const grossPayVnd = baseSalaryVnd + commissionVnd + overtimePayVnd + bonusVnd - penaltyVnd;

    // 7. Tax TNCN (BR-PAY-009)
    const taxableGrossForTax = Math.max(grossPayVnd, 0);
    const taxResult = computeProgressiveTax(taxableGrossForTax, taxConfig);
    const taxTncnVnd = taxResult.totalTaxVnd;

    // 8. BHXH (BR-PAY-010): cap at minGrossForBhxh Ã— 20
    // Use Prisma.Decimal math to avoid float precision loss.
    const bhxhCap = config.minGrossForBhxh.mul(20);
    const bhxhBase = grossPayVnd < bhxhCap.toNumber() ? grossPayVnd : bhxhCap.toNumber();
    const bhxhRate = config.bhxhPct.add(config.bhytPct).add(config.bhtnPct);
    const bhxhVnd = Math.round(bhxhBase * bhxhRate.toNumber());

    // 9. Net pay
    const netPayVnd = grossPayVnd - taxTncnVnd - bhxhVnd;

    // 10. Persist encounter details (will be done outside this method)
    const computationLog = {
      compensation: compensationLog,
      encountersCount: encounters.length,
      totalRevenueVnd,
      commissionVnd,
      workedShifts,
      totalHours,
      overtimeHours,
      overtimeThresholdHours, // BR-PAY-011 SPEC formula trace
      overtimePayVnd,
      taxBreakdown: taxResult.brackets,
      taxableIncomeVnd: taxResult.taxableIncomeVnd,
      bhxhCap,
      bhxhBase,
      bhxhTotalPct: config.bhxhPct.add(config.bhytPct).add(config.bhtnPct).toNumber(),
      grossPayVnd,
      taxTncnVnd,
      bhxhVnd,
      netPayVnd,
    };

    return {
      encountersCount: encounters.length,
      totalRevenueVnd,
      workedShifts,
      totalHours,
      overtimeHours,
      baseSalaryVnd,
      commissionVnd,
      overtimePayVnd,
      bonusVnd,
      penaltyVnd,
      grossPayVnd,
      taxTncnVnd,
      bhxhVnd,
      netPayVnd,
      computationLog,
      _encounterDetails: encounterDetails, // for caller to persist
    };
  }

  /**
   * Count paid shifts: union WorkingSchedule (with is_paid_shift=true) + ShiftRegistration.approved
   */
  private async countPaidShifts(
    tx: Prisma.TransactionClient,
    dentistId: string,
    payPeriod: { start: Date; end: Date },
  ): Promise<number> {
    // WorkingSchedule: count unique days in period where dayOfWeek matches + validFrom..validTo
    const workingSchedules = await tx.workingSchedule.findMany({
      where: {
        dentistId,
        deletedAt: null,
        isPaidShift: true,
        validFrom: { lte: payPeriod.end },
        OR: [{ validTo: null }, { validTo: { gte: payPeriod.start } }],
      },
    });

    const workingDays = new Set<string>();
    const days = daysBetweenInclusive(payPeriod.start, payPeriod.end);
    for (let i = 0; i < days; i++) {
      const d = new Date(payPeriod.start);
      d.setUTCDate(d.getUTCDate() + i);
      const dow = d.getUTCDay();
      if (workingSchedules.some(s => s.dayOfWeek === dow)) {
        workingDays.add(d.toISOString().slice(0, 10));
      }
    }

    // ShiftRegistration: count approved ones in period
    const shiftRegs = await tx.shiftRegistration.count({
      where: {
        dentistId,
        deletedAt: null,
        status: 'APPROVED',
        date: { gte: payPeriod.start, lte: payPeriod.end },
      },
    });

    return workingDays.size + shiftRegs;
  }

  /**
   * BR-PAY-011: Overtime computation per SPEC.
   * SPEC formula: overtime threshold = `weeks_in_period Ã— 5 workdays/week Ã— 8 hours/day`
   * Overtime hours = max(0, total_hours_worked - threshold)
   */
  private async computeWorkedHours(
    tx: Prisma.TransactionClient,
    dentistId: string,
    payPeriod: { start: Date; end: Date },
  ): Promise<{ totalHours: number; overtimeHours: number; overtimeThresholdHours: number }> {
    const encounters = await tx.encounter.findMany({
      where: {
        dentistId,
        status: 'COMPLETED',
        closedAt: { gte: payPeriod.start, lte: payPeriod.end },
      },
      select: { startedAt: true, closedAt: true },
    });

    let totalMinutes = 0;
    for (const e of encounters) {
      if (e.startedAt && e.closedAt) {
        totalMinutes += (e.closedAt.getTime() - e.startedAt.getTime()) / 60_000;
      }
    }

    const totalHours = Math.round((totalMinutes / 60) * 100) / 100;

    // SPEC formula: weeks Ã— 5 workdays Ã— 8 hours
    const periodDays = daysBetweenInclusive(payPeriod.start, payPeriod.end);
    const weeksInPeriod = periodDays / 7;
    const overtimeThresholdHours = weeksInPeriod * 5 * 8;
    // R2-6: epsilon prevents sub-cent rounding from showing 0.0 OT when actual
    // is 0.001-0.005h (due to floating-point). Threshold: 1 minute = 0.0167h.
    const OT_EPSILON = 0.01;
    const rawOvertime = totalHours - overtimeThresholdHours;
    const overtimeHours = rawOvertime > OT_EPSILON ? Math.round(rawOvertime * 100) / 100 : 0;

    return {
      totalHours,
      overtimeHours,
      overtimeThresholdHours: Math.round(overtimeThresholdHours * 100) / 100,
    };
  }

  // ============================================================================
  // Adjustments
  // ============================================================================

  async addAdjustment(
    periodId: string,
    dto: AddAdjustmentDto,
    actorUserId: string,
    actorPermissions: string[] = [],
  ) {
    // Cheap pre-check outside the transaction — UX-only fast fail. The
    // authoritative checks are re-run INSIDE the transaction below, since a
    // concurrent computePeriod() (which deletes+recreates line items) or a
    // concurrent lockPeriod()/approvePeriod() could invalidate this snapshot
    // between the pre-check and the transaction actually committing.
    const periodPrecheck = await this.prisma.payrollPeriod.findUnique({
      where: { id: periodId },
    });
    if (!periodPrecheck) throw new PayrollNotFoundException('PayrollPeriod', periodId);
    if (!isAdjustable(periodPrecheck.status)) {
      throw new PayrollStateException(
        `Cannot add adjustment in status ${periodPrecheck.status}. Only DRAFT/REVIEWING allowed.`,
      );
    }

    validateAdjustmentReason(dto.type as PayrollAdjustmentType, dto.reason);

    const lineItemPrecheck = await this.prisma.payrollLineItem.findUnique({
      where: { id: dto.lineItemId },
    });
    if (!lineItemPrecheck || lineItemPrecheck.payrollPeriodId !== periodId) {
      throw new PayrollNotFoundException('PayrollLineItem', dto.lineItemId);
    }

    // R2-4: Single dedicated `payroll.admin` permission for unambiguous admin
    // check. Replaces fragile AND-of-permissions pattern. Dentist can adjust
    // ONLY their own line item (self-adjustment is a no-op; in practice for
    // MVP dentists never have permission for this, but guard anyway).
    const isAdmin = actorPermissions.includes('payroll.admin');
    if (!isAdmin && lineItemPrecheck.dentistId !== actorUserId) {
      throw new PayrollNotFoundException('PayrollLineItem', dto.lineItemId); // 404, don't leak
    }

    // M#7: MANUAL_OVERRIDE requires elevated audit log (separate action so
    // it's easy to query for compliance review).
    const auditAction =
      dto.type === 'MANUAL_OVERRIDE' ? 'ADJUSTMENT_MANUAL_OVERRIDE' : 'ADJUSTMENT_ADDED';

    const _adjustment = await this.prisma.$transaction(
      async tx => {
        // Re-read period + line item INSIDE the transaction so the numbers we
        // compute from (and the status we gate on) reflect the current
        // committed state, not the pre-check snapshot taken before the
        // transaction opened.
        const period = await tx.payrollPeriod.findUnique({ where: { id: periodId } });
        if (!period) throw new PayrollNotFoundException('PayrollPeriod', periodId);
        if (!isAdjustable(period.status)) {
          throw new PayrollStateException(
            `Cannot add adjustment in status ${period.status}. Only DRAFT/REVIEWING allowed.`,
          );
        }

        const lineItem = await tx.payrollLineItem.findUnique({
          where: { id: dto.lineItemId },
        });
        if (!lineItem || lineItem.payrollPeriodId !== periodId) {
          throw new PayrollNotFoundException('PayrollLineItem', dto.lineItemId);
        }

        const created = await tx.payrollAdjustment.create({
          data: {
            payrollLineItemId: dto.lineItemId,
            type: dto.type as PayrollAdjustmentType,
            amountVnd: dto.amountVnd,
            reason: dto.reason,
            adjustedByUserId: actorUserId,
          },
        });

        // Re-aggregate bonus/penalty and re-compute gross/net
        const allAdjustments = await tx.payrollAdjustment.findMany({
          where: { payrollLineItemId: dto.lineItemId },
        });

        let bonusVnd = 0;
        let penaltyVnd = 0;
        for (const adj of allAdjustments) {
          const amount = Number(adj.amountVnd);
          if (adj.type === 'BONUS' || (adj.type === 'MANUAL_OVERRIDE' && amount > 0)) {
            bonusVnd += amount;
          } else {
            penaltyVnd += Math.abs(amount);
          }
        }

        const grossPayVnd =
          Number(lineItem.baseSalaryVnd) +
          Number(lineItem.commissionVnd) +
          Number(lineItem.overtimePayVnd) +
          bonusVnd -
          penaltyVnd;

        const config = await this.getPeriodConfigSnapshot(lineItem.payrollPeriodId);
        const taxConfig =
          (config.taxBrackets as unknown as TaxBracketsConfig) ?? DEFAULT_TAX_BRACKETS;
        const taxResult = computeProgressiveTax(Math.max(grossPayVnd, 0), taxConfig);
        // Critical #8: Decimal-precision-safe math for BHXH rate.
        const bhxhCap = config.minGrossForBhxh.mul(20);
        const bhxhBase = grossPayVnd < bhxhCap.toNumber() ? grossPayVnd : bhxhCap.toNumber();
        const bhxhRate = config.bhxhPct.add(config.bhytPct).add(config.bhtnPct);
        const bhxhVnd = Math.round(bhxhBase * bhxhRate.toNumber());
        const netPayVnd = grossPayVnd - taxResult.totalTaxVnd - bhxhVnd;

        await tx.payrollLineItem.update({
          where: { id: dto.lineItemId },
          data: {
            bonusVnd,
            penaltyVnd,
            grossPayVnd,
            taxTncnVnd: taxResult.totalTaxVnd,
            bhxhVnd,
            netPayVnd,
            manuallyAdjusted: true,
            adjustmentNote: `${allAdjustments.length} adjustment(s)`,
          },
        });

        return created;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );

    await this.audit.log({
      actorUserId,
      action: auditAction,
      targetType: 'PAYROLL_LINE_ITEM',
      targetId: dto.lineItemId,
      metadata: {
        type: dto.type,
        amountVnd: dto.amountVnd,
        reason: dto.reason,
        // M#7: MANUAL_OVERRIDE flags separately for compliance audit queries
        severity: dto.type === 'MANUAL_OVERRIDE' ? 'HIGH' : 'NORMAL',
      },
    });

    return this.getPeriodDetail(periodId);
  }

  // ============================================================================
  // State transitions
  // ============================================================================

  async lockPeriod(periodId: string, actorUserId: string) {
    const period = await this.prisma.payrollPeriod.findUnique({ where: { id: periodId } });
    if (!period) throw new PayrollNotFoundException('PayrollPeriod', periodId);
    assertTransition(period.status, PayrollPeriodStatus.REVIEWING);

    const updated = await this.prisma.payrollPeriod.update({
      where: { id: periodId },
      data: {
        status: PayrollPeriodStatus.REVIEWING,
        lockedByUserId: actorUserId,
        lockedAt: new Date(),
      },
    });

    await this.audit.log({
      actorUserId,
      action: 'PERIOD_LOCKED',
      targetType: 'PAYROLL_PERIOD',
      targetId: periodId,
    });

    return updated;
  }

  async approvePeriod(periodId: string, actorUserId: string) {
    const period = await this.prisma.payrollPeriod.findUnique({ where: { id: periodId } });
    if (!period) throw new PayrollNotFoundException('PayrollPeriod', periodId);
    assertTransition(period.status, PayrollPeriodStatus.APPROVED);

    const updated = await this.prisma.payrollPeriod.update({
      where: { id: periodId },
      data: {
        status: PayrollPeriodStatus.APPROVED,
        approvedByUserId: actorUserId,
        approvedAt: new Date(),
      },
    });

    await this.audit.log({
      actorUserId,
      action: 'PERIOD_APPROVED',
      targetType: 'PAYROLL_PERIOD',
      targetId: periodId,
    });

    return updated;
  }

  async markPaid(periodId: string, dto: MarkPaidDto, actorUserId: string) {
    const period = await this.prisma.payrollPeriod.findUnique({ where: { id: periodId } });
    if (!period) throw new PayrollNotFoundException('PayrollPeriod', periodId);
    assertTransition(period.status, PayrollPeriodStatus.PAID);

    const updated = await this.prisma.payrollPeriod.update({
      where: { id: periodId },
      data: {
        status: PayrollPeriodStatus.PAID,
        markedPaidByUserId: actorUserId,
        paidAt: new Date(dto.paymentDate),
        paymentReference: dto.paymentReference,
      },
    });

    await this.audit.log({
      actorUserId,
      action: 'PERIOD_PAID',
      targetType: 'PAYROLL_PERIOD',
      targetId: periodId,
      metadata: { paymentReference: dto.paymentReference, paymentDate: dto.paymentDate },
    });

    return updated;
  }

  async autoLockPeriod(periodId: string) {
    // Cron: PAID > 7 ngÃ y â†’ LOCKED
    const period = await this.prisma.payrollPeriod.findUnique({ where: { id: periodId } });
    if (!period || period.status !== PayrollPeriodStatus.PAID || !period.paidAt) return null;

    const sevenDaysAgo = new Date();
    sevenDaysAgo.setUTCDate(sevenDaysAgo.getUTCDate() - 7);

    if (period.paidAt > sevenDaysAgo) return null;

    const updated = await this.prisma.payrollPeriod.update({
      where: { id: periodId },
      data: {
        status: PayrollPeriodStatus.LOCKED,
        lockedImmutableAt: new Date(),
      },
    });

    await this.audit.log({
      actorUserId: null,
      action: 'PERIOD_AUTO_LOCKED',
      targetType: 'PAYROLL_PERIOD',
      targetId: periodId,
      metadata: { paidAt: period.paidAt },
    });

    return updated;
  }

  /**
   * BR-PAY-019: After a period is PAID or LOCKED, admin can open an
   * "adjustment period" tied to the original. The original is NOT modified;
   * the adjustment period is a new DRAFT period whose adjustments affect
   * the original line items retroactively.
   *
   * Use case: Bank returned payment; need to subtract from PAID period.
   */
  async openAdjustmentPeriod(
    originalPeriodId: string,
    actorUserId: string,
    actorPermissions: string[] = [],
  ) {
    // R2-4: defense-in-depth admin check (controller also enforces via @Permissions).
    if (!actorPermissions.includes('payroll.admin')) {
      throw new PayrollForbiddenException(
        'Only users with payroll.admin permission can open adjustment periods.',
      );
    }

    const original = await this.prisma.payrollPeriod.findUnique({
      where: { id: originalPeriodId },
    });
    if (!original) throw new PayrollNotFoundException('PayrollPeriod', originalPeriodId);

    // Only allow adjustment on PAID or LOCKED originals
    const allowed =
      original.status === PayrollPeriodStatus.PAID ||
      original.status === PayrollPeriodStatus.LOCKED;
    if (!allowed) {
      throw new PayrollStateException(
        `Adjustment period can only be opened from PAID or LOCKED, got ${original.status}`,
      );
    }

    // The adjustment period is a NEW period that points back via openedFromPeriodId.
    // We use the SAME periodStart/periodEnd so it's visually clear.
    // Snapshot fresh config (same as createPeriod).
    const config = await this.getConfig();
    const configSnapshot = {
      payrollCycle: config.payrollCycle,
      overtimeMultiplier: config.overtimeMultiplier,
      bhxhPct: config.bhxhPct,
      bhytPct: config.bhytPct,
      bhtnPct: config.bhtnPct,
      minGrossForBhxh: config.minGrossForBhxh,
      probationSalaryPct: config.probationSalaryPct,
      taxBrackets: config.taxBrackets,
      snapshottedAt: new Date().toISOString(),
      isAdjustmentFor: originalPeriodId,
    };

    // R2-3.1: Wrap in transaction so partial state is impossible if any
    // step (period create OR line item copy) fails midway.
    const adjustment = await this.prisma.$transaction(
      async tx => {
        const created = await tx.payrollPeriod.create({
          data: {
            periodStart: original.periodStart,
            periodEnd: original.periodEnd,
            payrollCycle: original.payrollCycle,
            configSnapshot: configSnapshot as unknown as Prisma.InputJsonValue,
            openedFromPeriodId: original.id,
            status: PayrollPeriodStatus.DRAFT,
            createdByUserId: actorUserId,
          },
        });

        // Copy original line items as starting point for adjustment
        const originals = await tx.payrollLineItem.findMany({
          where: { payrollPeriodId: originalPeriodId },
        });

        for (const orig of originals) {
          await tx.payrollLineItem.create({
            data: {
              payrollPeriodId: created.id,
              dentistId: orig.dentistId,
              encountersCount: orig.encountersCount,
              totalRevenueVnd: orig.totalRevenueVnd,
              workedShifts: orig.workedShifts,
              totalHours: orig.totalHours,
              overtimeHours: orig.overtimeHours,
              baseSalaryVnd: orig.baseSalaryVnd,
              commissionVnd: orig.commissionVnd,
              overtimePayVnd: orig.overtimePayVnd,
              bonusVnd: orig.bonusVnd,
              penaltyVnd: orig.penaltyVnd,
              grossPayVnd: orig.grossPayVnd,
              taxTncnVnd: orig.taxTncnVnd,
              bhxhVnd: orig.bhxhVnd,
              netPayVnd: orig.netPayVnd,
              computationLog: orig.computationLog as unknown as Prisma.InputJsonValue,
              manuallyAdjusted: true,
              adjustmentNote: `Adjustment for original period ${originalPeriodId}`,
              computedAt: new Date(),
            },
          });
        }

        return created;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );

    await this.audit.log({
      actorUserId,
      action: 'ADJUSTMENT_PERIOD_OPENED',
      targetType: 'PAYROLL_PERIOD',
      targetId: adjustment.id,
      metadata: { openedFromPeriodId: originalPeriodId, originalStatus: original.status },
    });

    return adjustment;
  }

  // ============================================================================
  // Dentist views
  // ============================================================================

  async getMyHistory(dentistId: string) {
    return this.prisma.payrollLineItem.findMany({
      where: {
        dentistId,
        period: {
          status: {
            in: [
              PayrollPeriodStatus.APPROVED,
              PayrollPeriodStatus.PAID,
              PayrollPeriodStatus.LOCKED,
            ],
          },
        },
      },
      include: {
        period: {
          select: { id: true, periodStart: true, periodEnd: true, status: true, paidAt: true },
        },
      },
      orderBy: { computedAt: 'desc' },
    });
  }

  async getMyPayslip(periodId: string, dentistId: string) {
    const lineItem = await this.prisma.payrollLineItem.findFirst({
      where: { payrollPeriodId: periodId, dentistId },
      include: {
        period: true,
        dentist: { select: { id: true, fullName: true, email: true } },
        adjustments: true,
        encounterDetails: {
          include: {
            encounter: {
              select: {
                id: true,
                startedAt: true,
                closedAt: true,
                patient: { select: { code: true, fullName: true } },
              },
            },
          },
        },
      },
    });
    if (!lineItem)
      throw new PayrollNotFoundException(
        'PayrollLineItem',
        `period=${periodId}, dentist=${dentistId}`,
      );
    if (!isViewableByDentist(lineItem.period.status)) {
      throw new PayrollStateException(
        `Period not yet viewable (status=${lineItem.period.status}). Only APPROVED+ allowed.`,
      );
    }
    return lineItem;
  }

  async getMyCurrentCompensation(dentistId: string) {
    return this.prisma.dentistCompensation.findFirst({
      where: {
        dentistId,
        deletedAt: null,
        effectiveFrom: { lte: new Date() },
        OR: [{ effectiveTo: null }, { effectiveTo: { gte: new Date() } }],
      },
      orderBy: { effectiveFrom: 'desc' },
    });
  }

  async getMyPreview(dentistId: string) {
    const currentPeriod = await this.prisma.payrollPeriod.findFirst({
      where: {
        status: { in: [PayrollPeriodStatus.DRAFT, PayrollPeriodStatus.REVIEWING] },
      },
      orderBy: { periodStart: 'desc' },
    });
    if (!currentPeriod) return null;

    return this.prisma.payrollLineItem.findFirst({
      where: { payrollPeriodId: currentPeriod.id, dentistId },
    });
  }
}

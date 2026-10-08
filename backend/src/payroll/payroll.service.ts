import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { buildDayCalendar, Interval } from '../appointments/domain/day-calendar';
import { AuditService } from '../audit/audit.service';
import { JwtPayload } from '../common/guards/permissions.guard';
import { clinicDateOnly } from '../common/date-range.util';
import {
  PayrollCycle,
  PayrollPeriodStatus,
  PayrollAdjustmentType,
  InvoiceStatus,
  Prisma,
} from '@prisma/client';
import {
  PeriodOverlapException,
  PayrollStateException,
  PayrollNotFoundException,
  PayrollForbiddenException,
  PayrollValidationException,
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
  proRateBaseSalaryParts,
  compensationOn,
  daysBetweenInclusive,
  CompensationTerm,
} from './domain/prorate-calculator';
import {
  invoiceBasisByLine,
  clinicDateValue,
  dateKey,
  minutesOf,
  minutesOutside,
  paidIntervals,
  periodDateKeys,
  periodInstantRange,
} from './domain/pay-period';
import {
  CreateCompensationDto,
  UpdateCompensationDto,
  UpdatePayrollConfigDto,
  CreatePayrollPeriodDto,
  AddAdjustmentDto,
  MarkPaidDto,
} from './dto/payroll.dto';

/** Owner decision (round 4): commission is paid on issued invoices only. */
export const COMMISSION_INVOICE_STATUSES: InvoiceStatus[] = [
  InvoiceStatus.ISSUED,
  InvoiceStatus.PARTIAL,
  InvoiceStatus.PAID,
];

/** Periods whose numbers are final; a void after this is clawed back. */
const CLOSED_PERIOD_STATUSES: PayrollPeriodStatus[] = [
  PayrollPeriodStatus.APPROVED,
  PayrollPeriodStatus.PAID,
  PayrollPeriodStatus.LOCKED,
];

/** "Hóa đơn nháp quá X ngày" warning before locking a period. */
export const DEFAULT_DRAFT_INVOICE_WARN_DAYS = 3;

/** Minimum reason length when an owner-dentist approves their own pay. */
export const SELF_APPROVAL_REASON_MIN = 10;

/** bonus/penalty from a dentist's adjustments in one period. */
export function sumAdjustments(rows: Array<{ type: string; amountVnd: Prisma.Decimal | number }>) {
  let bonusVnd = 0;
  let penaltyVnd = 0;
  for (const adj of rows) {
    const amount = Number(adj.amountVnd);
    if (adj.type === 'BONUS' || (adj.type === 'MANUAL_OVERRIDE' && amount > 0)) {
      bonusVnd += amount;
    } else {
      penaltyVnd += Math.abs(amount);
    }
  }
  return { bonusVnd, penaltyVnd };
}

const isSerializationFailure = (err: unknown): boolean =>
  (err as { code?: string })?.code === 'P2034' ||
  /could not serialize|deadlock detected|write conflict/i.test((err as Error)?.message ?? '');

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

  async listCompensations(filter: { dentistId?: string; activeOn?: Date; actor: JwtPayload }) {
    // BR-PAY-024: `payroll.compensation.read` has no .any/.own split — it's
    // held by clinic_admin (see everyone) AND dentist (should see only their
    // own comp terms). Without this, any dentist reaching this list — e.g.
    // via the admin payroll dashboard, which they can navigate to even
    // though the sensitive actions there 403 — could read every colleague's
    // base salary and commission rate. Reuse payroll.read.any (already
    // correctly admin-only) as the "see everyone" gate.
    const dentistId = filter.actor.permissions.includes('payroll.read.any')
      ? filter.dentistId
      : filter.actor.sub;

    const rows = await this.prisma.dentistCompensation.findMany({
      where: {
        deletedAt: null,
        ...(dentistId && { dentistId }),
        ...(filter.activeOn && {
          effectiveFrom: { lte: filter.activeOn },
          OR: [{ effectiveTo: null }, { effectiveTo: { gte: filter.activeOn } }],
        }),
      },
      orderBy: { effectiveFrom: 'desc' },
      include: { dentist: { select: { fullName: true } } },
    });
    return rows.map(r => ({ ...r, dentistName: r.dentist?.fullName ?? '' }));
  }

  /**
   * Owner who also practises acting on their own pay. With another active
   * user able to do it, they must do it; when the actor is the only one (the
   * usual one-admin clinic), it goes through with a stated reason and a
   * separate PAYROLL_SELF_APPROVED audit entry. Returns the trimmed reason.
   */
  private async assertSelfAction(
    actorUserId: string,
    permission: string,
    reason: string | undefined,
    what: string,
  ): Promise<string> {
    const others = await this.prisma.user.count({
      where: {
        id: { not: actorUserId },
        status: 'ACTIVE',
        deletedAt: null,
        userRoles: {
          some: {
            role: {
              deletedAt: null,
              rolePermissions: { some: { permission: { code: permission } } },
            },
          },
        },
      },
    });
    if (others > 0) {
      throw new PayrollForbiddenException(
        `Bạn không thể tự ${what} của chính mình vì phòng khám còn quản trị viên khác. Nhờ họ thực hiện.`,
      );
    }
    const trimmed = reason?.trim() ?? '';
    if (trimmed.length < SELF_APPROVAL_REASON_MIN) {
      throw new PayrollValidationException(
        `Bạn đang tự ${what} của chính mình. Nhập lý do (ít nhất ${SELF_APPROVAL_REASON_MIN} ký tự) để xác nhận.`,
      );
    }
    return trimmed;
  }

  private async logSelfApproval(
    actorUserId: string,
    operation: string,
    targetType: string,
    targetId: string,
    reason: string,
    extra: Record<string, unknown> = {},
  ) {
    await this.audit.log({
      actorUserId,
      action: 'PAYROLL_SELF_APPROVED',
      targetType,
      targetId,
      metadata: { operation, reason, ...extra },
    });
  }

  async createCompensation(dto: CreateCompensationDto, actorUserId: string) {
    const selfReason =
      dto.dentistId === actorUserId
        ? await this.assertSelfAction(
            actorUserId,
            'payroll.compensation.update',
            dto.selfApprovalReason,
            'lập chế độ lương',
          )
        : null;
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
    if (selfReason) {
      await this.logSelfApproval(
        actorUserId,
        'COMPENSATION_CREATE',
        'DENTIST_COMPENSATION',
        created.id,
        selfReason,
      );
    }

    return created;
  }

  async updateCompensation(id: string, dto: UpdateCompensationDto, actorUserId: string) {
    const current = await this.prisma.dentistCompensation.findUnique({
      where: { id },
      select: { dentistId: true },
    });
    const selfReason =
      current?.dentistId === actorUserId
        ? await this.assertSelfAction(
            actorUserId,
            'payroll.compensation.update',
            dto.selfApprovalReason,
            'sửa chế độ lương',
          )
        : null;
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
      metadata: { fields: Object.keys(dto).filter(k => k !== 'selfApprovalReason') },
    });
    if (selfReason) {
      await this.logSelfApproval(
        actorUserId,
        'COMPENSATION_UPDATE',
        'DENTIST_COMPENSATION',
        id,
        selfReason,
        { fields: Object.keys(dto).filter(k => k !== 'selfApprovalReason') },
      );
    }

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
      throw new PayrollValidationException('periodEnd must be after periodStart');
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
   *
   * Line items are upserted per (period, dentist) and keep their id; bonus,
   * penalty and clawbacks live in payroll_adjustments keyed by (period,
   * dentist) and are summed back in, so a recompute never drops them (H2).
   * `dentistIds` limits the run to those dentists (event listeners).
   */
  async computePeriod(
    periodId: string,
    actorUserId: string | null,
    opts: { dentistIds?: string[] } = {},
  ) {
    const period = await this.prisma.payrollPeriod.findUnique({
      where: { id: periodId },
    });
    if (!period) throw new PayrollNotFoundException('PayrollPeriod', periodId);
    if (!isComputable(period.status)) {
      throw new PayrollStateException(
        `Cannot compute period in status ${period.status}. Only DRAFT or REVIEWING allowed.`,
      );
    }
    // An adjustment period copies a paid period's lines; recomputing it would
    // pay the whole period a second time.
    if (period.openedFromPeriodId) {
      throw new PayrollStateException(
        'Kỳ điều chỉnh không tính lại tự động — hãy thêm thưởng/phạt cho từng bác sĩ.',
      );
    }

    const { config, taxConfig } = this.periodConfig(period.configSnapshot);
    const payPeriod = { start: period.periodStart, end: period.periodEnd };

    type LineItemComputed = Awaited<ReturnType<PayrollService['computeLineItemForDentist']>>;
    const results = await this.withSerializableRetry(() =>
      this.prisma.$transaction(
        async tx => {
          const out: Array<{
            dentistId: string;
            dentistName: string;
            lineItemId: string;
            computed: LineItemComputed;
          }> = [];
          const dentistIds =
            opts.dentistIds ?? (await this.payableDentistIds(tx, periodId, payPeriod));
          const users = dentistIds.length
            ? await tx.user.findMany({
                where: { id: { in: dentistIds } },
                select: { id: true, fullName: true },
              })
            : [];
          const lastPaidDays = await this.lastPaidDays(tx, dentistIds);

          const kept: string[] = [];
          for (const dentist of users) {
            const lineItem = await this.computeLineItemForDentist(
              tx,
              dentist.id,
              payPeriod,
              config,
              taxConfig,
              { periodId, lastPaidDay: lastPaidDays.get(dentist.id) ?? null },
            );
            const { _encounterDetails, _adjustmentCount, ...persistedFields } = lineItem;

            // Nothing to pay and nothing recorded (e.g. a schedule left open
            // after termination): no empty payslip.
            if (
              _adjustmentCount === 0 &&
              _encounterDetails.length === 0 &&
              persistedFields.grossPayVnd === 0 &&
              persistedFields.totalHours === 0 &&
              persistedFields.encountersCount === 0
            ) {
              continue;
            }
            kept.push(dentist.id);

            const data = {
              ...persistedFields,
              computationLog: lineItem.computationLog as unknown as Prisma.InputJsonValue,
              manuallyAdjusted: _adjustmentCount > 0,
              adjustmentNote: _adjustmentCount > 0 ? `${_adjustmentCount} adjustment(s)` : null,
              computedAt: new Date(),
            };
            const saved = await tx.payrollLineItem.upsert({
              where: {
                payrollPeriodId_dentistId: { payrollPeriodId: periodId, dentistId: dentist.id },
              },
              create: { payrollPeriodId: periodId, dentistId: dentist.id, ...data },
              update: data,
            });
            // Adjustments (incl. rows whose line was removed earlier) point at
            // the current line again for display.
            await tx.payrollAdjustment.updateMany({
              where: { payrollPeriodId: periodId, dentistId: dentist.id },
              data: { payrollLineItemId: saved.id },
            });

            await tx.payrollEncounterDetail.deleteMany({ where: { payrollLineItemId: saved.id } });
            if (_encounterDetails.length > 0) {
              await tx.payrollEncounterDetail.createMany({
                data: _encounterDetails.map(d => ({
                  payrollLineItemId: saved.id,
                  payrollPeriodId: periodId,
                  encounterId: d.encounterId,
                  treatmentId: d.treatmentId,
                  treatmentRevenueVnd: d.basisAmountVnd,
                  basisAmountVnd: d.basisAmountVnd,
                  commissionPct: d.commissionPct,
                  invoiceId: d.invoiceId,
                  invoiceItemId: d.invoiceItemId,
                  encounterStartAt: d.startedAt,
                  encounterEndAt: d.closedAt,
                  durationMinutes: d.durationMinutes,
                  treatmentBreakdown: d.breakdown as unknown as Prisma.InputJsonValue,
                })),
              });
            }

            out.push({
              dentistId: dentist.id,
              dentistName: dentist.fullName,
              lineItemId: saved.id,
              computed: lineItem,
            });
          }

          // Lines of dentists with nothing in this period any more; a line
          // with adjustments always stays (its dentist is in the payable set).
          const scope = opts.dentistIds ?? null;
          await tx.payrollLineItem.deleteMany({
            where: {
              payrollPeriodId: periodId,
              dentistId: scope ? { in: scope.filter(id => !kept.includes(id)) } : { notIn: kept },
              adjustments: { none: {} },
            },
          });
          return out;
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      ),
    );

    if (actorUserId) {
      await this.audit.log({
        actorUserId,
        action: 'PERIOD_COMPUTED',
        targetType: 'PAYROLL_PERIOD',
        targetId: periodId,
        metadata: { dentistCount: results.length },
      });
    }

    return { periodId, lineItems: results };
  }

  /** Re-runs a Serializable payroll transaction that lost a race (H2). */
  private async withSerializableRetry<T>(run: () => Promise<T>, attempts = 3): Promise<T> {
    for (let i = 1; ; i++) {
      try {
        return await run();
      } catch (err) {
        if (i >= attempts || !isSerializationFailure(err)) throw err;
        await new Promise(r => setTimeout(r, 50 * i));
      }
    }
  }

  private periodConfig(rawSnapshot: Prisma.JsonValue) {
    // BR-PAY-023: Use the period's SNAPSHOT, not the live config, so admin edits
    // to PayrollConfig after the period was created do NOT change this period's numbers.
    const snapshot = rawSnapshot as unknown as {
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
    const config = {
      payrollCycle: snapshot.payrollCycle,
      overtimeMultiplier: new Prisma.Decimal(snapshot.overtimeMultiplier.toString()),
      bhxhPct: new Prisma.Decimal(snapshot.bhxhPct.toString()),
      bhytPct: new Prisma.Decimal(snapshot.bhytPct.toString()),
      bhtnPct: new Prisma.Decimal(snapshot.bhtnPct.toString()),
      minGrossForBhxh: new Prisma.Decimal(snapshot.minGrossForBhxh.toString()),
      probationSalaryPct: new Prisma.Decimal(snapshot.probationSalaryPct.toString()),
    };
    return { config, taxConfig };
  }

  /**
   * Who gets a payslip (H4): anyone with pay terms, issued invoices, closed
   * encounters, paid duty time or adjustments in the period — whatever their
   * account status or roles today (PENDING_SETUP, deactivated mid-period,
   * role removed). Empty lines are skipped later.
   */
  private async payableDentistIds(
    tx: Prisma.TransactionClient,
    periodId: string,
    payPeriod: { start: Date; end: Date },
  ): Promise<string[]> {
    const range = periodInstantRange(payPeriod);
    const [comps, invoices, encounters, schedules, shifts, overrides, adjustments] =
      await Promise.all([
        tx.dentistCompensation.findMany({
          where: {
            deletedAt: null,
            effectiveFrom: { lte: payPeriod.end },
            OR: [{ effectiveTo: null }, { effectiveTo: { gte: payPeriod.start } }],
          },
          select: { dentistId: true },
        }),
        tx.invoice.findMany({
          where: {
            deletedAt: null,
            status: { in: COMMISSION_INVOICE_STATUSES },
            issuedAt: { gte: range.from, lt: range.toExclusive },
          },
          select: { encounter: { select: { dentistId: true } } },
        }),
        tx.encounter.findMany({
          where: { status: 'COMPLETED', closedAt: { gte: range.from, lt: range.toExclusive } },
          select: { dentistId: true },
        }),
        tx.workingSchedule.findMany({
          where: {
            deletedAt: null,
            isPaidShift: true,
            validFrom: { lte: payPeriod.end },
            OR: [{ validTo: null }, { validTo: { gte: payPeriod.start } }],
          },
          select: { dentistId: true },
        }),
        tx.shiftRegistration.findMany({
          where: {
            deletedAt: null,
            status: 'APPROVED',
            date: { gte: payPeriod.start, lte: payPeriod.end },
          },
          select: { dentistId: true },
        }),
        tx.scheduleOverride.findMany({
          where: {
            deletedAt: null,
            kind: 'CHANGED_HOURS',
            date: { gte: payPeriod.start, lte: payPeriod.end },
          },
          select: { dentistId: true },
        }),
        tx.payrollAdjustment.findMany({
          where: { payrollPeriodId: periodId },
          select: { dentistId: true },
        }),
      ]);
    return [
      ...new Set([
        ...comps.map(r => r.dentistId),
        ...invoices.map(r => r.encounter?.dentistId).filter((x): x is string => !!x),
        ...encounters.map(r => r.dentistId),
        ...schedules.map(r => r.dentistId),
        ...shifts.map(r => r.dentistId),
        ...overrides.map(r => r.dentistId),
        ...adjustments.map(r => r.dentistId),
      ]),
    ];
  }

  /** Termination date (last paid day, inclusive) per dentist, if any. */
  private async lastPaidDays(
    tx: Prisma.TransactionClient,
    dentistIds: string[],
  ): Promise<Map<string, Date>> {
    if (dentistIds.length === 0) return new Map();
    const rows = await tx.employee.findMany({
      where: { userId: { in: dentistIds }, deletedAt: null, terminationDate: { not: null } },
      select: { userId: true, terminationDate: true },
    });
    return new Map(
      (rows ?? [])
        .filter(r => r.userId && r.terminationDate)
        .map(r => [r.userId as string, r.terminationDate as Date]),
    );
  }

  /**
   * Build (without saving) a line item for one dentist in a pay period.
   * `ctx.periodId` enables the parts that need the saved period: clawbacks
   * and adjustments.
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
    ctx: { periodId?: string; lastPaidDay?: Date | null } = {},
  ) {
    const range = periodInstantRange(payPeriod);
    const lastPaidDay = ctx.lastPaidDay ?? null;

    // 1. Every compensation overlapping the period (H3, A6-04), each
    //    pro-rated by its own days; nothing after the termination date.
    const compRows = await tx.dentistCompensation.findMany({
      where: {
        dentistId,
        deletedAt: null,
        effectiveFrom: { lte: payPeriod.end },
        OR: [{ effectiveTo: null }, { effectiveTo: { gte: payPeriod.start } }],
      },
      orderBy: { effectiveFrom: 'asc' },
    });
    const terms: CompensationTerm[] = (compRows ?? []).map(c => ({
      id: c.id,
      monthlySalary: Number(c.baseSalaryVnd),
      commissionPct: Number(c.commissionPct),
      overtimeHourlyVnd: Number(c.overtimeHourlyVnd),
      effectiveFrom: c.effectiveFrom,
      effectiveTo: c.effectiveTo,
    }));
    const base = proRateBaseSalaryParts(terms, payPeriod, lastPaidDay);
    const baseSalaryVnd = base.total;
    // OT rate: the latest terms in the period.
    const overtimeHourlyVnd = terms.length ? terms[terms.length - 1].overtimeHourlyVnd : 0;

    // 2. Commission on invoices issued in the period (H5, owner decision):
    //    ISSUED/PARTIAL/PAID, line amount after the invoice discount pro rata.
    //    Rate = the terms in force on the visit's clinic day (the work done),
    //    so a dentist who left before the invoice was issued still earns it.
    const invoices = await tx.invoice.findMany({
      where: {
        deletedAt: null,
        status: { in: COMMISSION_INVOICE_STATUSES },
        issuedAt: { gte: range.from, lt: range.toExclusive },
        encounter: { dentistId },
      },
      select: {
        id: true,
        code: true,
        subtotal: true,
        total: true,
        issuedAt: true,
        encounter: { select: { id: true, startedAt: true, closedAt: true } },
        items: {
          where: { deletedAt: null },
          select: { id: true, treatmentId: true, description: true, lineTotal: true },
          orderBy: { sequence: 'asc' },
        },
        // Refunds count on their own date: one made after this period is
        // clawed back in the period it falls in (reconcileClawbacks).
        payments: {
          where: { kind: 'REFUND', status: 'COMPLETED', paidAt: { lt: range.toExclusive } },
          select: { amount: true },
        },
      },
      orderBy: { issuedAt: 'asc' },
    });

    let totalRevenueVnd = 0;
    let commissionRaw = 0;
    const encounterIds = new Set<string>();
    const invoicesWithoutTerms: string[] = [];
    const encounterDetails: Array<{
      encounterId: string;
      treatmentId: string | null;
      invoiceId: string;
      invoiceItemId: string;
      basisAmountVnd: number;
      commissionPct: number;
      startedAt: Date;
      closedAt: Date;
      durationMinutes: number;
      breakdown: Record<string, unknown>;
    }> = [];

    for (const inv of invoices ?? []) {
      if (!inv.encounter) continue;
      const enc = inv.encounter;
      encounterIds.add(enc.id);
      const workDay = clinicDateOnly(enc.closedAt ?? enc.startedAt ?? inv.issuedAt ?? new Date());
      const term = compensationOn(terms, workDay);
      if (!term) invoicesWithoutTerms.push(inv.code);
      const pct = term?.commissionPct ?? 0;
      const refundedVnd = (inv.payments ?? []).reduce((sum, r) => sum + Number(r.amount), 0);
      const basis = invoiceBasisByLine(
        inv.items.map(i => ({ id: i.id, lineTotal: Number(i.lineTotal) })),
        Number(inv.total),
        refundedVnd,
      );
      const startedAt = enc.startedAt ?? enc.closedAt ?? inv.issuedAt ?? new Date();
      const closedAt = enc.closedAt ?? enc.startedAt ?? inv.issuedAt ?? new Date();
      for (const item of inv.items) {
        const amount = basis.get(item.id) ?? 0;
        totalRevenueVnd += amount;
        commissionRaw += amount * pct;
        encounterDetails.push({
          encounterId: enc.id,
          treatmentId: item.treatmentId,
          invoiceId: inv.id,
          invoiceItemId: item.id,
          basisAmountVnd: amount,
          commissionPct: pct,
          startedAt,
          closedAt,
          durationMinutes: Math.max(
            0,
            Math.round((closedAt.getTime() - startedAt.getTime()) / 60_000),
          ),
          breakdown: {
            invoiceCode: inv.code,
            issuedAt: inv.issuedAt,
            description: item.description,
            lineTotal: Number(item.lineTotal),
            invoiceSubtotal: Number(inv.subtotal),
            invoiceTotal: Number(inv.total),
            invoiceRefundedVnd: refundedVnd,
            basisAmountVnd: amount,
            commissionPct: pct,
          },
        });
      }
    }

    // 3. Commission
    const commissionVnd = Math.round(commissionRaw);

    // 4. Worked hours from the day calendar (H3) + visits outside them.
    const visits = await tx.encounter.findMany({
      where: {
        dentistId,
        status: 'COMPLETED',
        closedAt: { gte: range.from, lt: range.toExclusive },
      },
      select: { id: true, startedAt: true, closedAt: true },
    });
    const { workedShifts, totalHours, overtimeHours, overtimeThresholdHours, outsideHours, days } =
      await this.resolveWorkedShifts(tx, dentistId, payPeriod, {
        lastPaidDay,
        visits: visits ?? [],
      });
    const overtimePayVnd = Math.round(
      overtimeHours * overtimeHourlyVnd * Number(config.overtimeMultiplier),
    );

    // 5. Bonus / penalty: a clawback for invoices voided after their period
    //    closed is recorded first, then every adjustment of (period, dentist).
    let adjustmentRows: Array<{ type: string; amountVnd: Prisma.Decimal | number }> = [];
    let clawbacks: Array<{ invoiceCode: string; amountVnd: number }> = [];
    if (ctx.periodId) {
      clawbacks = await this.reconcileClawbacks(tx, dentistId, ctx.periodId, payPeriod);
      adjustmentRows =
        (await tx.payrollAdjustment.findMany({
          where: { payrollPeriodId: ctx.periodId, dentistId },
          select: { type: true, amountVnd: true },
        })) ?? [];
    }
    const { bonusVnd, penaltyVnd } = sumAdjustments(adjustmentRows);

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
    const bhxhVnd = Math.round(Math.max(bhxhBase, 0) * bhxhRate.toNumber());

    // 9. Net pay
    const netPayVnd = grossPayVnd - taxTncnVnd - bhxhVnd;

    const computationLog = {
      compensation: terms.length
        ? { parts: base.parts }
        : { note: 'No compensation for this dentist in period' },
      ...(lastPaidDay && { terminatedOn: dateKey(lastPaidDay) }),
      commissionBasis: 'ISSUED_INVOICE_AFTER_DISCOUNT',
      invoicesCount: (invoices ?? []).length,
      ...(invoicesWithoutTerms.length && { invoicesWithoutCompensation: invoicesWithoutTerms }),
      encountersCount: encounterIds.size,
      totalRevenueVnd,
      commissionVnd,
      workedShifts,
      totalHours,
      overtimeHours,
      overtimeThresholdHours, // BR-PAY-011 SPEC formula trace
      overtimePayVnd,
      hoursByDay: days,
      ...(outsideHours.length && { outsideHoursEncounters: outsideHours }),
      adjustmentsCount: adjustmentRows.length,
      ...(clawbacks.length && { clawbacks }),
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
      encountersCount: encounterIds.size,
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
      _adjustmentCount: adjustmentRows.length,
    };
  }

  /**
   * H5: commission already paid in a closed period (APPROVED/PAID/LOCKED) on
   * an invoice whose basis has since dropped — voided, or refunded in part —
   * is clawed back in this open period as a DEDUCTION, dated by the void /
   * refund (only changes before this period's end count). A refund cancelled
   * later raises the basis again and the difference is paid back as a BONUS.
   * Idempotent: what was paid, minus what is owed now, minus what earlier and
   * this period's adjustments already settled. Only rows written since
   * migration 046 (with invoice_item_id) are considered.
   */
  private async reconcileClawbacks(
    tx: Prisma.TransactionClient,
    dentistId: string,
    periodId: string,
    payPeriod: { start: Date; end: Date },
  ): Promise<Array<{ invoiceCode: string; amountVnd: number }>> {
    const counted =
      (await tx.payrollEncounterDetail.findMany({
        where: {
          payrollPeriodId: { not: periodId },
          invoiceId: { not: null },
          invoiceItemId: { not: null },
          lineItem: { dentistId },
          period: { status: { in: CLOSED_PERIOD_STATUSES } },
        },
        select: {
          invoiceId: true,
          invoiceItemId: true,
          basisAmountVnd: true,
          commissionPct: true,
          period: { select: { periodStart: true, periodEnd: true } },
        },
      })) ?? [];
    if (counted.length === 0) return [];

    const range = periodInstantRange(payPeriod);
    const countedIds = [...new Set(counted.map(c => c.invoiceId as string))];
    // Only invoices that changed since: voided, refunded, or already adjusted
    // (a refund cancelled later brings refundedAmount back to 0).
    const touched =
      (await tx.payrollAdjustment.findMany({
        where: { dentistId, sourceInvoiceId: { in: countedIds } },
        select: { sourceInvoiceId: true },
      })) ?? [];
    const invoices =
      (await tx.invoice.findMany({
        where: {
          id: { in: countedIds },
          OR: [
            { status: InvoiceStatus.VOIDED },
            { refundedAmount: { gt: 0 } },
            { id: { in: touched.map(t => t.sourceInvoiceId as string) } },
          ],
        },
        select: {
          id: true,
          code: true,
          status: true,
          voidedAt: true,
          total: true,
          items: {
            where: { deletedAt: null },
            select: { id: true, lineTotal: true },
            orderBy: { sequence: 'asc' },
          },
          payments: {
            where: { kind: 'REFUND', status: 'COMPLETED', paidAt: { lt: range.toExclusive } },
            select: { amount: true },
          },
        },
      })) ?? [];

    // Settled so far by this and earlier periods (a later open period's
    // clawback must not be undone when an earlier one recomputes).
    const already =
      (await tx.payrollAdjustment.findMany({
        where: {
          dentistId,
          sourceInvoiceId: { in: invoices.map(v => v.id) },
          period: { periodStart: { lte: payPeriod.start } },
        },
        select: { sourceInvoiceId: true, type: true, amountVnd: true },
      })) ?? [];

    const made: Array<{ invoiceCode: string; amountVnd: number }> = [];
    for (const inv of invoices) {
      const rows = counted.filter(c => c.invoiceId === inv.id);
      const voided =
        inv.status === InvoiceStatus.VOIDED &&
        (!inv.voidedAt || inv.voidedAt.getTime() < range.toExclusive.getTime());
      const refunded = (inv.payments ?? []).reduce((sum, r) => sum + Number(r.amount), 0);
      const basisNow = voided
        ? new Map<string, number>()
        : invoiceBasisByLine(
            (inv.items ?? []).map(i => ({ id: i.id, lineTotal: Number(i.lineTotal) })),
            Number(inv.total),
            refunded,
          );
      const paid = Math.round(
        rows.reduce((s, r) => s + Number(r.basisAmountVnd ?? 0) * Number(r.commissionPct ?? 0), 0),
      );
      const owedNow = Math.round(
        rows.reduce(
          (s, r) =>
            s + (basisNow.get(r.invoiceItemId as string) ?? 0) * Number(r.commissionPct ?? 0),
          0,
        ),
      );
      const settled = already
        .filter(a => a.sourceInvoiceId === inv.id)
        .reduce((s, a) => s + (a.type === 'BONUS' ? -1 : 1) * Number(a.amountVnd), 0);
      const due = paid - owedNow - settled;
      if (due === 0) continue;
      const p = rows[0].period;
      const closed = `kỳ lương ${dateKey(p.periodStart)} – ${dateKey(p.periodEnd)} đã chốt`;
      await tx.payrollAdjustment.create({
        data: {
          payrollPeriodId: periodId,
          dentistId,
          type: due > 0 ? PayrollAdjustmentType.DEDUCTION : PayrollAdjustmentType.BONUS,
          amountVnd: Math.abs(due),
          reason:
            due > 0
              ? `Truy thu hoa hồng: hóa đơn ${inv.code} ${voided ? 'đã hủy' : 'đã hoàn tiền'} sau khi ${closed}`
              : `Trả lại hoa hồng: hóa đơn ${inv.code} — phiếu hoàn đã hủy sau khi ${closed}`,
          adjustedByUserId: null,
          sourceInvoiceId: inv.id,
        },
      });
      made.push({ invoiceCode: inv.code, amountVnd: -due });
    }
    return made;
  }

  /**
   * BR-PAY-011 / H3: worked hours come from the same day calendar the
   * booking screens use (buildDayCalendar): weekly paid schedule or the
   * day's CHANGED_HOURS, plus approved shifts — minus clinic closures,
   * CLOSED days/ranges and approved time-off (owner decision: unpaid).
   * Days after the termination date are not paid. Completed visits that ran
   * outside those hours are reported (not paid automatically) so an admin
   * can record the extra time as CHANGED_HOURS or a shift.
   *
   * SPEC formula: overtime threshold = `weeks_in_period × 5 workdays/week × 8 hours/day`
   * Overtime hours = max(0, total_hours_worked - threshold)
   */
  private async resolveWorkedShifts(
    tx: Prisma.TransactionClient,
    dentistId: string,
    payPeriod: { start: Date; end: Date },
    opts: {
      lastPaidDay?: Date | null;
      visits?: Array<{ id: string; startedAt: Date | null; closedAt: Date | null }>;
    } = {},
  ): Promise<{
    workedShifts: number;
    totalHours: number;
    overtimeHours: number;
    overtimeThresholdHours: number;
    outsideHours: Array<{ encounterId: string; startedAt: Date; closedAt: Date; minutes: number }>;
    days: Record<string, number>;
  }> {
    const range = periodInstantRange(payPeriod);
    const [workingSchedules, approvedShifts, overrides, timeOffs, closures] = await Promise.all([
      tx.workingSchedule.findMany({
        where: {
          dentistId,
          deletedAt: null,
          isPaidShift: true,
          validFrom: { lte: payPeriod.end },
          OR: [{ validTo: null }, { validTo: { gte: payPeriod.start } }],
        },
      }),
      tx.shiftRegistration.findMany({
        where: {
          dentistId,
          deletedAt: null,
          status: 'APPROVED',
          date: { gte: payPeriod.start, lte: payPeriod.end },
        },
        select: { date: true, startTime: true, endTime: true },
      }),
      tx.scheduleOverride.findMany({
        where: { dentistId, deletedAt: null, date: { gte: payPeriod.start, lte: payPeriod.end } },
        select: { date: true, kind: true, startTime: true, endTime: true, reason: true },
      }),
      tx.timeOff.findMany({
        where: {
          dentistId,
          deletedAt: null,
          status: 'APPROVED',
          startAt: { lt: range.toExclusive },
          endAt: { gt: range.from },
        },
        select: { startAt: true, endAt: true },
      }),
      tx.clinicClosure.findMany({
        where: {
          deletedAt: null,
          startDate: { lte: payPeriod.end },
          endDate: { gte: payPeriod.start },
        },
        select: { startDate: true, endDate: true, reason: true },
      }),
    ]);

    const byDate = <T extends { date: Date }>(rows: T[] | undefined) => {
      const m = new Map<string, T[]>();
      for (const r of rows ?? []) {
        const k = dateKey(r.date);
        m.set(k, [...(m.get(k) ?? []), r]);
      }
      return m;
    };
    const shiftsByDate = byDate(approvedShifts);
    const overridesByDate = byDate(overrides);
    const lastPaidKey = opts.lastPaidDay ? dateKey(opts.lastPaidDay) : null;

    let workedShifts = 0;
    let totalMinutes = 0;
    const days: Record<string, number> = {};
    const paidByDay = new Map<string, Interval[]>();
    const keys = periodDateKeys(payPeriod);
    for (const key of keys) {
      if (lastPaidKey && key > lastPaidKey) break;
      const day = new Date(key);
      const dayStart = new Date(`${key}T00:00:00+07:00`);
      const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60_000);
      const cal = buildDayCalendar({
        date: key,
        schedules: (workingSchedules ?? []).filter(
          s =>
            s.dayOfWeek === day.getUTCDay() &&
            (!s.validFrom || s.validFrom.getTime() <= day.getTime()) &&
            (!s.validTo || s.validTo.getTime() >= day.getTime()),
        ),
        shifts: shiftsByDate.get(key) ?? [],
        overrides: overridesByDate.get(key) ?? [],
        timeOffs: (timeOffs ?? []).filter(t => t.startAt < dayEnd && t.endAt > dayStart),
        clinicClosures: (closures ?? []).filter(
          c => dateKey(c.startDate) <= key && dateKey(c.endDate) >= key,
        ),
        bookings: [],
      });
      const paid = paidIntervals(cal);
      paidByDay.set(key, paid);
      const minutes = minutesOf(paid);
      if (minutes <= 0) continue;
      workedShifts++;
      totalMinutes += minutes;
      days[key] = Math.round((minutes / 60) * 100) / 100;
    }

    const outsideHours: Array<{
      encounterId: string;
      startedAt: Date;
      closedAt: Date;
      minutes: number;
    }> = [];
    for (const v of opts.visits ?? []) {
      if (!v.startedAt || !v.closedAt) continue;
      const minutes = minutesOutside(paidByDay.get(clinicDateOnly(v.startedAt)) ?? [], {
        start: v.startedAt,
        end: v.closedAt,
      });
      // Under 15' is a visit running a little late, not extra duty.
      if (minutes >= 15) {
        outsideHours.push({
          encounterId: v.id,
          startedAt: v.startedAt,
          closedAt: v.closedAt,
          minutes,
        });
      }
    }

    const totalHours = Math.round((totalMinutes / 60) * 100) / 100;

    // SPEC formula: weeks × 5 workdays × 8 hours
    const weeksInPeriod = daysBetweenInclusive(payPeriod.start, payPeriod.end) / 7;
    const overtimeThresholdHours = weeksInPeriod * 5 * 8;
    // R2-6: epsilon prevents sub-cent rounding from showing 0.0 OT when actual
    // is 0.001-0.005h (due to floating-point). Threshold: 1 minute = 0.0167h.
    const OT_EPSILON = 0.01;
    const rawOvertime = totalHours - overtimeThresholdHours;
    const overtimeHours = rawOvertime > OT_EPSILON ? Math.round(rawOvertime * 100) / 100 : 0;

    return {
      workedShifts,
      totalHours,
      overtimeHours,
      overtimeThresholdHours: Math.round(overtimeThresholdHours * 100) / 100,
      outsideHours,
      days,
    };
  }

  /**
   * Things to settle before locking a period: draft invoices older than
   * `draftDays` (no commission until issued), dentists with closed visits but
   * no pay terms, visits outside paid hours, dentists who left mid-period.
   */
  async getPeriodWarnings(periodId: string, draftDays = DEFAULT_DRAFT_INVOICE_WARN_DAYS) {
    const period = await this.prisma.payrollPeriod.findUnique({
      where: { id: periodId },
      include: {
        lineItems: {
          select: {
            dentistId: true,
            computationLog: true,
            dentist: { select: { fullName: true } },
          },
        },
      },
    });
    if (!period) throw new PayrollNotFoundException('PayrollPeriod', periodId);
    const payPeriod = { start: period.periodStart, end: period.periodEnd };
    const range = periodInstantRange(payPeriod);
    const draftCutoff = new Date(Date.now() - draftDays * 24 * 60 * 60_000);

    const [drafts, visits, comps, leavers] = await Promise.all([
      this.prisma.invoice.findMany({
        where: {
          deletedAt: null,
          status: InvoiceStatus.DRAFT,
          createdAt: { lte: draftCutoff },
          encounter: { closedAt: { lt: range.toExclusive } },
        },
        select: {
          id: true,
          code: true,
          total: true,
          createdAt: true,
          patient: { select: { fullName: true, code: true } },
          encounter: {
            select: { closedAt: true, dentist: { select: { id: true, fullName: true } } },
          },
        },
        orderBy: { createdAt: 'asc' },
        take: 200,
      }),
      this.prisma.encounter.findMany({
        where: { status: 'COMPLETED', closedAt: { gte: range.from, lt: range.toExclusive } },
        select: { dentistId: true, dentist: { select: { fullName: true } } },
      }),
      this.prisma.dentistCompensation.findMany({
        where: {
          deletedAt: null,
          effectiveFrom: { lte: payPeriod.end },
          OR: [{ effectiveTo: null }, { effectiveTo: { gte: payPeriod.start } }],
        },
        select: { dentistId: true },
      }),
      this.prisma.employee.findMany({
        where: {
          deletedAt: null,
          userId: { not: null },
          terminationDate: { gte: payPeriod.start, lte: payPeriod.end },
        },
        select: { userId: true, fullName: true, terminationDate: true },
      }),
    ]);

    const withTerms = new Set((comps ?? []).map(c => c.dentistId));
    const noTerms = new Map<
      string,
      { dentistId: string; dentistName: string; encounterCount: number }
    >();
    for (const v of visits ?? []) {
      if (withTerms.has(v.dentistId)) continue;
      const row = noTerms.get(v.dentistId) ?? {
        dentistId: v.dentistId,
        dentistName: v.dentist?.fullName ?? '',
        encounterCount: 0,
      };
      row.encounterCount++;
      noTerms.set(v.dentistId, row);
    }

    const outsideHoursEncounters = period.lineItems.flatMap(li => {
      const log = li.computationLog as { outsideHoursEncounters?: unknown[] } | null;
      return (log?.outsideHoursEncounters ?? []).map(e => ({
        ...(e as object),
        dentistId: li.dentistId,
        dentistName: li.dentist?.fullName ?? '',
      }));
    });

    return {
      draftInvoiceDays: draftDays,
      draftInvoices: (drafts ?? []).map(d => ({
        invoiceId: d.id,
        code: d.code,
        totalVnd: Number(d.total),
        createdAt: d.createdAt,
        ageDays: Math.floor((Date.now() - d.createdAt.getTime()) / (24 * 60 * 60_000)),
        patientName: d.patient?.fullName ?? '',
        dentistId: d.encounter?.dentist?.id ?? null,
        dentistName: d.encounter?.dentist?.fullName ?? '',
      })),
      dentistsWithoutCompensation: [...noTerms.values()],
      outsideHoursEncounters,
      terminatedDentists: (leavers ?? []).map(l => ({
        dentistId: l.userId,
        dentistName: l.fullName,
        terminationDate: l.terminationDate ? dateKey(l.terminationDate) : null,
      })),
    };
  }

  /**
   * Open (DRAFT/REVIEWING, not an adjustment period) period covering a
   * clinic day, else the latest open one when `fallbackLatest`.
   */
  async findOpenPeriodFor(instant: Date, fallbackLatest = false) {
    const day = clinicDateValue(instant);
    const open = { in: [PayrollPeriodStatus.DRAFT, PayrollPeriodStatus.REVIEWING] };
    const covering = await this.prisma.payrollPeriod.findFirst({
      where: {
        status: open,
        openedFromPeriodId: null,
        periodStart: { lte: day },
        periodEnd: { gte: day },
      },
      orderBy: { periodStart: 'desc' },
    });
    if (covering || !fallbackLatest) return covering;
    return this.prisma.payrollPeriod.findFirst({
      where: { status: open, openedFromPeriodId: null },
      orderBy: { periodStart: 'desc' },
    });
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
    if (!isAdmin) {
      throw new PayrollNotFoundException('PayrollLineItem', dto.lineItemId); // 404, don't leak
    }
    // Own line (owner who also practises): only as the sole admin, with a reason.
    const selfReason =
      lineItemPrecheck.dentistId === actorUserId
        ? await this.assertSelfAction(
            actorUserId,
            'payroll.admin',
            dto.selfApprovalReason,
            'điều chỉnh lương',
          )
        : null;

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
            // H2: owned by (period, dentist); survives any recompute.
            payrollPeriodId: periodId,
            dentistId: lineItem.dentistId,
            payrollLineItemId: dto.lineItemId,
            type: dto.type as PayrollAdjustmentType,
            amountVnd: dto.amountVnd,
            reason: dto.reason,
            adjustedByUserId: actorUserId,
          },
        });

        // Re-aggregate bonus/penalty and re-compute gross/net
        const allAdjustments = await tx.payrollAdjustment.findMany({
          where: { payrollPeriodId: periodId, dentistId: lineItem.dentistId },
        });
        const { bonusVnd, penaltyVnd } = sumAdjustments(allAdjustments);

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
    if (selfReason) {
      await this.logSelfApproval(
        actorUserId,
        'ADJUSTMENT_ADD',
        'PAYROLL_LINE_ITEM',
        dto.lineItemId,
        selfReason,
        { periodId, type: dto.type, amountVnd: dto.amountVnd },
      );
    }

    return this.getPeriodDetail(periodId);
  }

  // ============================================================================
  // State transitions
  // ============================================================================

  async lockPeriod(periodId: string, actorUserId: string) {
    const period = await this.prisma.payrollPeriod.findUnique({ where: { id: periodId } });
    if (!period) throw new PayrollNotFoundException('PayrollPeriod', periodId);
    assertTransition(period.status, PayrollPeriodStatus.REVIEWING);

    // Guarded write: only succeed if status is still what we just read.
    // Payroll transitions are money, and several admins can hold the
    // payroll dashboard open at once — with a plain .update() two of them
    // acting on the same period both pass the assertTransition() check
    // above (read before either write committed) and the later write wins
    // silently, overwriting the other's actor/timestamp attribution while
    // the audit log still records both actions as if each took effect.
    // Same guarded-updateMany pattern as inventory stock writes, shift
    // registrations and appointment status transitions.
    const locked = await this.prisma.payrollPeriod.updateMany({
      where: { id: periodId, status: period.status },
      data: {
        status: PayrollPeriodStatus.REVIEWING,
        lockedByUserId: actorUserId,
        lockedAt: new Date(),
      },
    });
    if (locked.count === 0) {
      throw new PayrollStateException(
        `Payroll period ${periodId} was changed by someone else — reload and try again`,
      );
    }
    const updated = await this.prisma.payrollPeriod.findUniqueOrThrow({
      where: { id: periodId },
    });

    await this.audit.log({
      actorUserId,
      action: 'PERIOD_LOCKED',
      targetType: 'PAYROLL_PERIOD',
      targetId: periodId,
    });

    return updated;
  }

  async approvePeriod(periodId: string, actorUserId: string, selfApprovalReason?: string) {
    const period = await this.prisma.payrollPeriod.findUnique({ where: { id: periodId } });
    if (!period) throw new PayrollNotFoundException('PayrollPeriod', periodId);
    assertTransition(period.status, PayrollPeriodStatus.APPROVED);

    // The period holds the approver's own payslip (owner who also practises).
    const ownLine = await this.prisma.payrollLineItem.findFirst({
      where: { payrollPeriodId: periodId, dentistId: actorUserId },
      select: { id: true, netPayVnd: true },
    });
    const selfReason = ownLine
      ? await this.assertSelfAction(
          actorUserId,
          'payroll.period.approve',
          selfApprovalReason,
          'duyệt kỳ lương có phiếu lương',
        )
      : null;

    // See lockPeriod() above — same guarded-write race protection.
    const approved = await this.prisma.payrollPeriod.updateMany({
      where: { id: periodId, status: period.status },
      data: {
        status: PayrollPeriodStatus.APPROVED,
        approvedByUserId: actorUserId,
        approvedAt: new Date(),
      },
    });
    if (approved.count === 0) {
      throw new PayrollStateException(
        `Payroll period ${periodId} was changed by someone else — reload and try again`,
      );
    }
    const updated = await this.prisma.payrollPeriod.findUniqueOrThrow({
      where: { id: periodId },
    });

    await this.audit.log({
      actorUserId,
      action: 'PERIOD_APPROVED',
      targetType: 'PAYROLL_PERIOD',
      targetId: periodId,
    });
    if (selfReason && ownLine) {
      await this.logSelfApproval(
        actorUserId,
        'PERIOD_APPROVE',
        'PAYROLL_PERIOD',
        periodId,
        selfReason,
        { lineItemId: ownLine.id, netPayVnd: Number(ownLine.netPayVnd) },
      );
    }

    return updated;
  }

  async markPaid(periodId: string, dto: MarkPaidDto, actorUserId: string) {
    const period = await this.prisma.payrollPeriod.findUnique({ where: { id: periodId } });
    if (!period) throw new PayrollNotFoundException('PayrollPeriod', periodId);
    assertTransition(period.status, PayrollPeriodStatus.PAID);

    // See lockPeriod() above — same guarded-write race protection. This one
    // is the costliest to get wrong: two admins marking the same period paid
    // with different payment references would leave only the later
    // reference on the record while both are audited as having paid it.
    const paid = await this.prisma.payrollPeriod.updateMany({
      where: { id: periodId, status: period.status },
      data: {
        status: PayrollPeriodStatus.PAID,
        markedPaidByUserId: actorUserId,
        paidAt: new Date(dto.paymentDate),
        paymentReference: dto.paymentReference,
      },
    });
    if (paid.count === 0) {
      throw new PayrollStateException(
        `Payroll period ${periodId} was changed by someone else — reload and try again`,
      );
    }
    const updated = await this.prisma.payrollPeriod.findUniqueOrThrow({
      where: { id: periodId },
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

    // See lockPeriod() above. Here the racing actor is the cron itself
    // against an admin (or a second cron instance): return null rather than
    // throwing, matching this method's existing "nothing to do" contract.
    const autoLocked = await this.prisma.payrollPeriod.updateMany({
      where: { id: periodId, status: period.status },
      data: {
        status: PayrollPeriodStatus.LOCKED,
        lockedImmutableAt: new Date(),
      },
    });
    if (autoLocked.count === 0) return null;
    const updated = await this.prisma.payrollPeriod.findUniqueOrThrow({
      where: { id: periodId },
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

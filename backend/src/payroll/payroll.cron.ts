import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { PayrollService } from './payroll.service';
import { ShiftRegistrationService } from './shift-registration.service';
import { PayrollPeriodStatus } from '@prisma/client';
import { computePeriodBounds } from './domain/payroll-state';

/**
 * Cron jobs for the Payroll module.
 * - Daily 00:00: auto-create current month's period if missing (BR-PAY-004).
 * - Daily 00:30: auto-cancel pending shift registrations with past date (BR-APPT-029).
 * - Daily 01:00: auto-lock PAID periods > 7 days (BR-PAY-017).
 */
@Injectable()
export class PayrollCron {
  private readonly logger = new Logger(PayrollCron.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly payroll: PayrollService,
    private readonly shifts: ShiftRegistrationService,
  ) {}

  /**
   * BR-PAY-004: Auto-create current period if missing.
   * Runs daily at 00:00. Also attempts to backfill the previous 3 days in case
   * a previous run failed (Critical #9: never silently miss a period).
   */
  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async autoCreateCurrentPeriod() {
    const config = await this.prisma.payrollConfig.findFirst();
    if (!config) return;

    const today = new Date();
    // Try today + previous 3 days (backfill)
    for (let offset = 3; offset >= 0; offset--) {
      const anchor = new Date(today);
      anchor.setUTCDate(anchor.getUTCDate() - offset);
      const { start, end } = computePeriodBounds(config.payrollCycle, anchor);

      const existing = await this.prisma.payrollPeriod.findFirst({
        where: { periodStart: start, periodEnd: end },
      });
      if (existing) continue;

      try {
        const created = await this.payroll.createPeriod(
          {
            periodStart: start.toISOString(),
            periodEnd: end.toISOString(),
            payrollCycle: config.payrollCycle,
          },
          null as any, // system actor
        );
        this.logger.log(
          `Auto-created payroll period ${start.toISOString().slice(0, 10)} → ${end.toISOString().slice(0, 10)} (id=${created.id})`,
        );
      } catch (err) {
        this.logger.error(
          `Failed to auto-create payroll period for anchor ${anchor.toISOString().slice(0, 10)}: ${(err as Error).message}`,
        );
      }
    }
  }

  /**
   * BR-APPT-029: Auto-cancel PENDING shift registrations with past date.
   * Runs daily at 00:30.
   */
  @Cron('30 0 * * *')
  async autoCancelPendingShifts() {
    const count = await this.shifts.autoCancelPastPending();
    if (count > 0) {
      this.logger.log(`Auto-cancelled ${count} pending shift registrations`);
    }
  }

  /**
   * BR-PAY-017: Auto-lock PAID periods > 7 days old.
   * Runs daily at 01:00.
   */
  @Cron('0 1 * * *')
  async autoLockPaidPeriods() {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setUTCDate(sevenDaysAgo.getUTCDate() - 7);

    const candidates = await this.prisma.payrollPeriod.findMany({
      where: {
        status: PayrollPeriodStatus.PAID,
        paidAt: { lt: sevenDaysAgo },
      },
      select: { id: true },
    });

    for (const c of candidates) {
      try {
        await this.payroll.autoLockPeriod(c.id);
        this.logger.log(`Auto-locked payroll period ${c.id}`);
      } catch (err) {
        this.logger.error(`Failed to auto-lock period ${c.id}: ${(err as Error).message}`);
      }
    }
  }
}

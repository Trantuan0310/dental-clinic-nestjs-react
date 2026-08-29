import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { PrismaService } from '../prisma/prisma.service';
import { PayrollService } from './payroll.service';
import { PayrollPeriodStatus } from '@prisma/client';

/**
 * Listener for cross-module events relevant to payroll.
 *
 * BR-PAY-022 + BD-0009: When an encounter is closed, find the current DRAFT/REVIEWING
 * payroll period and re-compute the affected line item in-place.
 *
 * If period is APPROVED/PAID/LOCKED, do nothing — period is immutable.
 * The encounter revenue is reflected via the next period's compute.
 */
@Injectable()
export class PayrollEventListener {
  private readonly logger = new Logger(PayrollEventListener.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly payroll: PayrollService,
  ) {}

  @OnEvent('encounter.closed')
  async handleEncounterClosed(payload: { encounterId: string; dentistId: string; closedAt: Date }) {
    const { closedAt } = payload;

    // Find an active payroll period containing closedAt
    const period = await this.prisma.payrollPeriod.findFirst({
      where: {
        status: { in: [PayrollPeriodStatus.DRAFT, PayrollPeriodStatus.REVIEWING] },
        periodStart: { lte: closedAt },
        periodEnd: { gte: closedAt },
      },
    });
    if (!period) {
      this.logger.debug(
        `No active payroll period for encounter closed at ${closedAt.toISOString()}`,
      );
      return;
    }

    // Re-compute entire period (idempotent + simpler than incremental)
    try {
      await this.payroll.computePeriod(period.id, null as any);
      this.logger.log(
        `Re-computed payroll period ${period.id} due to encounter ${payload.encounterId} closed`,
      );
    } catch (err) {
      this.logger.error(`Failed to re-compute period ${period.id}: ${(err as Error).message}`);
    }
  }
}

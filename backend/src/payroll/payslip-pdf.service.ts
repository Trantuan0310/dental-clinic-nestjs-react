import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PayrollService } from './payroll.service';
import { PayslipPdfData, renderPayslipPdf, renderPayslipsPdf } from '../pdf/payslip-pdf';

const SLIP_INCLUDE = {
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
} satisfies Prisma.PayrollLineItemInclude;

type SlipRow = Prisma.PayrollLineItemGetPayload<{ include: typeof SLIP_INCLUDE }>;

/** Payslip PDFs: a dentist's own, or any (one or a whole period) for payroll staff. */
@Injectable()
export class PayslipPdfService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly payroll: PayrollService,
  ) {}

  /** The dentist's own payslip, once the period is approved (as on screen). */
  async mine(periodId: string, dentistId: string) {
    const slip = (await this.payroll.getMyPayslip(periodId, dentistId)) as SlipRow;
    return { bytes: await renderPayslipPdf(toPdfData(slip)), filename: fileName(slip) };
  }

  async one(periodId: string, dentistId: string) {
    const slip = await this.prisma.payrollLineItem.findFirst({
      where: { payrollPeriodId: periodId, dentistId },
      include: SLIP_INCLUDE,
    });
    if (!slip) throw new NotFoundException('Không có phiếu lương của nhân viên này trong kỳ');
    return { bytes: await renderPayslipPdf(toPdfData(slip)), filename: fileName(slip) };
  }

  /** Every payslip of the period in one PDF, one per page. */
  async period(periodId: string) {
    const slips = await this.prisma.payrollLineItem.findMany({
      where: { payrollPeriodId: periodId },
      include: SLIP_INCLUDE,
      orderBy: { dentist: { fullName: 'asc' } },
    });
    if (slips.length === 0) throw new NotFoundException('Kỳ lương chưa có phiếu lương nào');
    const start = slips[0].period.periodStart.toISOString().slice(0, 7);
    return {
      bytes: await renderPayslipsPdf(slips.map(toPdfData)),
      filename: `phieu-luong-${start}.pdf`,
    };
  }
}

function fileName(slip: SlipRow) {
  const month = slip.period.periodStart.toISOString().slice(0, 7);
  const who = slip.dentist.fullName
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .replace(/[^A-Za-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase();
  return `phieu-luong-${month}-${who}.pdf`;
}

function toPdfData(slip: SlipRow): PayslipPdfData {
  // One row per encounter (the details hold one row per invoice line).
  const encounters = new Map<string, PayslipPdfData['encounters'][number]>();
  for (const d of slip.encounterDetails) {
    const row = encounters.get(d.encounterId) ?? {
      at: d.encounter?.closedAt ?? d.encounter?.startedAt ?? d.encounterStartAt,
      patientCode: d.encounter?.patient?.code,
      patientName: d.encounter?.patient?.fullName,
      revenueVnd: 0,
    };
    row.revenueVnd += Number(d.treatmentRevenueVnd);
    encounters.set(d.encounterId, row);
  }
  return {
    dentistName: slip.dentist.fullName,
    dentistEmail: slip.dentist.email,
    periodStart: slip.period.periodStart,
    periodEnd: slip.period.periodEnd,
    periodStatus: slip.period.status,
    paidAt: slip.period.paidAt,
    encountersCount: slip.encountersCount,
    workedShifts: slip.workedShifts,
    totalHours: Number(slip.totalHours),
    overtimeHours: Number(slip.overtimeHours),
    baseSalaryVnd: Number(slip.baseSalaryVnd),
    commissionVnd: Number(slip.commissionVnd),
    overtimePayVnd: Number(slip.overtimePayVnd),
    bonusVnd: Number(slip.bonusVnd),
    penaltyVnd: Number(slip.penaltyVnd),
    grossPayVnd: Number(slip.grossPayVnd),
    taxTncnVnd: Number(slip.taxTncnVnd),
    bhxhVnd: Number(slip.bhxhVnd),
    netPayVnd: Number(slip.netPayVnd),
    adjustments: slip.adjustments.map(a => ({
      type: a.type,
      amountVnd: Number(a.amountVnd),
      reason: a.reason,
    })),
    encounters: [...encounters.values()].sort(
      (a, b) => new Date(a.at).getTime() - new Date(b.at).getTime(),
    ),
  };
}

import { Injectable } from '@nestjs/common';
import { EncounterStatus, InvoiceStatus, ItemStatus, Prisma, RecallStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { BookingService } from '../booking/booking.service';
import { JwtPayload } from '../common/guards/permissions.guard';
import { clinicDateOnly, startOfClinicDay } from '../common/date-range.util';

/** What the bell can point at; the frontend maps each key to its page. */
export type NotificationKey =
  | 'bookingRequests'
  | 'shiftApprovals'
  | 'recallsDue'
  | 'draftInvoices'
  | 'staleEncounters'
  | 'lowStock';

export interface NotificationItem {
  key: NotificationKey;
  count: number;
}

/**
 * The header bell: what is waiting on the caller, one count per kind of
 * work. Each count is only computed for a caller who may act on it (the
 * permission of the page it links to), so a dentist never sees the front
 * desk's queue and nothing leaks through a count either.
 */
@Injectable()
export class NotificationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly booking: BookingService,
  ) {}

  async summary(actor: Pick<JwtPayload, 'sub' | 'permissions'>, now = new Date()) {
    const has = (code: string) => actor.permissions.includes(code);
    const today = new Date(clinicDateOnly(now));
    const checks: Array<[NotificationKey, boolean, () => Promise<number>]> = [
      // Online requests the front desk has to confirm, propose or decline.
      [
        'bookingRequests',
        has('booking_request.read'),
        async () => (await this.booking.pendingCount()).count,
      ],
      // Shift registrations still awaiting a decision (past ones are
      // auto-cancelled by the payroll cron).
      [
        'shiftApprovals',
        has('shift.approve'),
        () =>
          this.prisma.shiftRegistration.count({
            where: { status: 'PENDING', deletedAt: null, date: { gte: today } },
          }),
      ],
      // Recalls to call today: due by today, or a call-back date reached
      // (the Recalls page with "due today").
      [
        'recallsDue',
        has('recall.read'),
        () =>
          this.prisma.recall.count({
            where: {
              patient: { deletedAt: null },
              OR: [
                { status: RecallStatus.PENDING, dueDate: { lte: today } },
                { status: RecallStatus.POSTPONED, postponedUntil: { lte: today } },
              ],
            },
          }),
      ],
      // Closed visits whose invoice is still a draft: not billed yet.
      [
        'draftInvoices',
        has('invoice.issue') && has('invoice.read.any'),
        () =>
          this.prisma.invoice.count({
            where: { status: InvoiceStatus.DRAFT, deletedAt: null },
          }),
      ],
      // Encounters left open from an earlier day (forgot to close).
      [
        'staleEncounters',
        has('encounter.read.any') || has('encounter.read.own'),
        () =>
          this.prisma.encounter.count({
            where: {
              status: EncounterStatus.IN_PROGRESS,
              startedAt: { lt: startOfClinicDay(clinicDateOnly(now)) },
              ...(!has('encounter.read.any') && { dentistId: actor.sub }),
            } satisfies Prisma.EncounterWhereInput,
          }),
      ],
      // Items at or below their minimum (BR-INV-012), for whoever restocks.
      [
        'lowStock',
        has('inventory.update') || has('inventory.stock_in'),
        () =>
          this.prisma.inventoryItem.count({
            where: {
              deletedAt: null,
              status: ItemStatus.ACTIVE,
              minStockLevel: { gt: 0 },
              quantityOnHand: { lte: this.prisma.inventoryItem.fields.minStockLevel },
            },
          }),
      ],
    ];

    const items: NotificationItem[] = await Promise.all(
      checks
        .filter(([, allowed]) => allowed)
        .map(async ([key, , count]) => ({ key, count: await count() })),
    );
    return { items, total: items.reduce((sum, i) => sum + i.count, 0) };
  }
}

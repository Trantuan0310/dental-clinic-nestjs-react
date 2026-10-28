import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import {
  BookingRequestStatus,
  EncounterStatus,
  InvoiceStatus,
  ItemStatus,
  RecallStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { clinicDateOnly, startOfClinicDay } from '../common/date-range.util';

export type InboxType =
  | 'bookingRequest'
  | 'shiftRegistration'
  | 'draftInvoice'
  | 'recallsDue'
  | 'lowStock'
  | 'staleEncounters';

interface NewNotification {
  type: InboxType;
  title: string;
  body?: string | null;
  targetId?: string | null;
  /** Same key for the same event: a user gets it once. */
  dedupeKey: string;
}

/** Events newer than this are picked up by the scan (covers a missed run or a restart). */
const SCAN_WINDOW_MS = 24 * 60 * 60 * 1000;
/** Read and unread notifications are kept this long. */
const RETENTION_DAYS = 90;

const PAGE = 20;

/**
 * Per-user notifications behind the header bell: each one can be marked
 * read, and the list is the user's history. Producers (scanEvents, the
 * morning digest) send each event to everyone holding the permission of the
 * page that handles it.
 */
@Injectable()
export class InboxService {
  private readonly logger = new Logger(InboxService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ---------------------------------------------------------------------------
  // Reading
  // ---------------------------------------------------------------------------

  async list(userId: string, opts: { unreadOnly?: boolean; cursor?: string } = {}) {
    const where = { userId, ...(opts.unreadOnly && { readAt: null }) };
    const rows = await this.prisma.notification.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: PAGE + 1,
      ...(opts.cursor && { cursor: { id: opts.cursor }, skip: 1 }),
      select: {
        id: true,
        type: true,
        title: true,
        body: true,
        targetId: true,
        createdAt: true,
        readAt: true,
      },
    });
    const hasMore = rows.length > PAGE;
    const data = hasMore ? rows.slice(0, PAGE) : rows;
    return { data, nextCursor: hasMore ? data[data.length - 1].id : null };
  }

  unreadCount(userId: string) {
    return this.prisma.notification.count({ where: { userId, readAt: null } });
  }

  async markRead(userId: string, id: string) {
    const done = await this.prisma.notification.updateMany({
      where: { id, userId },
      data: { readAt: new Date() },
    });
    // Someone else's notification answers like a missing one.
    if (done.count === 0) throw new NotFoundException('Không tìm thấy thông báo');
  }

  async markAllRead(userId: string) {
    const done = await this.prisma.notification.updateMany({
      where: { userId, readAt: null },
      data: { readAt: new Date() },
    });
    return { updated: done.count };
  }

  // ---------------------------------------------------------------------------
  // Producing
  // ---------------------------------------------------------------------------

  /** Active accounts holding every one of `codes`. */
  async recipients(codes: string[]): Promise<string[]> {
    const rows = await this.prisma.user.findMany({
      where: {
        deletedAt: null,
        deactivatedAt: null,
        AND: codes.map(code => ({
          userRoles: {
            some: {
              role: { deletedAt: null, rolePermissions: { some: { permission: { code } } } },
            },
          },
        })),
      },
      select: { id: true },
    });
    return rows.map(r => r.id);
  }

  /** Writes `n` for each user; an event a user already has is skipped. */
  async send(userIds: string[], n: NewNotification): Promise<number> {
    if (userIds.length === 0) return 0;
    const res = await this.prisma.notification.createMany({
      data: userIds.map(userId => ({
        userId,
        type: n.type,
        title: n.title.slice(0, 200),
        body: n.body ? n.body.slice(0, 500) : null,
        targetId: n.targetId ?? null,
        dedupeKey: n.dedupeKey,
      })),
      skipDuplicates: true,
    });
    return res.count;
  }

  /**
   * New events since the last runs (every few minutes): online booking
   * requests, shift registrations to approve, draft invoices of closed
   * visits. Idempotent through the dedupe key, so overlapping runs and a
   * restart neither lose nor repeat one.
   */
  async scanEvents(now = new Date()): Promise<number> {
    const since = new Date(now.getTime() - SCAN_WINDOW_MS);
    let sent = 0;

    const [bookings, shifts, drafts] = await Promise.all([
      this.prisma.bookingRequest.findMany({
        where: { createdAt: { gte: since }, status: BookingRequestStatus.PENDING_REVIEW },
        select: { id: true, fullName: true, requestedStartAt: true, referenceCode: true },
      }),
      this.prisma.shiftRegistration.findMany({
        where: { createdAt: { gte: since }, status: 'PENDING', deletedAt: null },
        select: {
          id: true,
          date: true,
          startTime: true,
          endTime: true,
          dentist: { select: { fullName: true } },
        },
      }),
      this.prisma.invoice.findMany({
        where: { createdAt: { gte: since }, status: InvoiceStatus.DRAFT, deletedAt: null },
        select: { id: true, code: true, patient: { select: { fullName: true } } },
      }),
    ]);

    if (bookings.length) {
      const to = await this.recipients(['booking_request.read']);
      for (const b of bookings) {
        sent += await this.send(to, {
          type: 'bookingRequest',
          title: `Yêu cầu đặt lịch mới: ${b.fullName}`,
          body: `Muốn khám lúc ${clinicDateTime(b.requestedStartAt)} — mã ${b.referenceCode}`,
          targetId: b.id,
          dedupeKey: `booking:${b.id}`,
        });
      }
    }
    if (shifts.length) {
      const to = await this.recipients(['shift.approve']);
      for (const s of shifts) {
        sent += await this.send(to, {
          type: 'shiftRegistration',
          title: `${s.dentist.fullName} đăng ký ca làm việc`,
          body: `Ngày ${viDate(s.date)}, ${s.startTime}–${s.endTime} — chờ duyệt`,
          targetId: s.id,
          dedupeKey: `shift:${s.id}`,
        });
      }
    }
    if (drafts.length) {
      const to = await this.recipients(['invoice.issue', 'invoice.read.any']);
      for (const inv of drafts) {
        sent += await this.send(to, {
          type: 'draftInvoice',
          title: `Hoá đơn nháp ${inv.code} chờ phát hành`,
          body: `Bệnh nhân ${inv.patient.fullName}: phiên khám đã đóng, kiểm tra rồi phát hành hoá đơn`,
          targetId: inv.id,
          dedupeKey: `draft-invoice:${inv.id}`,
        });
      }
    }
    return sent;
  }

  /**
   * Morning digest, one per kind per day: recalls to call, low-stock items,
   * encounters left open from an earlier day (each dentist their own, the
   * clinic-wide readers all of them).
   */
  async morningDigest(now = new Date()): Promise<number> {
    const day = clinicDateOnly(now);
    const today = new Date(day);
    let sent = 0;

    const [recalls, lowStock, stale] = await Promise.all([
      this.prisma.recall.count({
        where: {
          patient: { deletedAt: null },
          OR: [
            { status: RecallStatus.PENDING, dueDate: { lte: today } },
            { status: RecallStatus.POSTPONED, postponedUntil: { lte: today } },
          ],
        },
      }),
      this.prisma.inventoryItem.count({
        where: {
          deletedAt: null,
          status: ItemStatus.ACTIVE,
          minStockLevel: { gt: 0 },
          quantityOnHand: { lte: this.prisma.inventoryItem.fields.minStockLevel },
        },
      }),
      this.prisma.encounter.findMany({
        where: { status: EncounterStatus.IN_PROGRESS, startedAt: { lt: startOfClinicDay(day) } },
        select: { dentistId: true },
      }),
    ]);

    if (recalls > 0) {
      sent += await this.send(await this.recipients(['recall.read']), {
        type: 'recallsDue',
        title: `${recalls} bệnh nhân cần gọi nhắc tái khám hôm nay`,
        body: 'Đến hạn hôm nay hoặc đã tới ngày hẹn gọi lại',
        dedupeKey: `digest:recalls:${day}`,
      });
    }
    if (lowStock > 0) {
      const [managers, receivers] = await Promise.all([
        this.recipients(['inventory.update']),
        this.recipients(['inventory.stock_in']),
      ]);
      sent += await this.send([...new Set([...managers, ...receivers])], {
        type: 'lowStock',
        title: `${lowStock} vật tư sắp hết`,
        body: 'Tồn kho bằng hoặc dưới mức tối thiểu — cần nhập thêm',
        dedupeKey: `digest:low-stock:${day}`,
      });
    }
    if (stale.length > 0) {
      const readers = await this.recipients(['encounter.read.any']);
      sent += await this.send(readers, {
        type: 'staleEncounters',
        title: `${stale.length} phiên khám còn mở từ hôm trước`,
        body: 'Đóng hoặc huỷ các phiên khám này',
        dedupeKey: `digest:stale-encounters:${day}`,
      });
      const perDentist = new Map<string, number>();
      for (const e of stale) perDentist.set(e.dentistId, (perDentist.get(e.dentistId) ?? 0) + 1);
      for (const [dentistId, count] of perDentist) {
        if (readers.includes(dentistId)) continue;
        sent += await this.send([dentistId], {
          type: 'staleEncounters',
          title: `Bạn còn ${count} phiên khám chưa đóng từ hôm trước`,
          body: 'Đóng hoặc huỷ các phiên khám này',
          dedupeKey: `digest:stale-encounters:${day}`,
        });
      }
    }
    return sent;
  }

  /** Drops notifications older than the retention window. */
  async purgeOld(now = new Date()): Promise<number> {
    const before = new Date(now.getTime() - RETENTION_DAYS * 24 * 60 * 60 * 1000);
    const res = await this.prisma.notification.deleteMany({ where: { createdAt: { lt: before } } });
    if (res.count)
      this.logger.log(`Purged ${res.count} notifications older than ${RETENTION_DAYS} days`);
    return res.count;
  }
}

/** dd/MM/yyyy of a DATE column. */
function viDate(d: Date): string {
  return d.toISOString().slice(0, 10).split('-').reverse().join('/');
}

/** HH:mm dd/MM/yyyy in clinic time (UTC+7). */
function clinicDateTime(d: Date): string {
  const local = new Date(d.getTime() + 7 * 60 * 60 * 1000).toISOString();
  return `${local.slice(11, 16)} ${local.slice(0, 10).split('-').reverse().join('/')}`;
}

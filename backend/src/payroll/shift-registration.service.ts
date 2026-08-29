import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { ShiftRegistrationStatus, Prisma } from '@prisma/client';
import {
  ShiftConflictException,
  ShiftPastDateException,
  ShiftRegistrationNotCancellableException,
  PayrollNotFoundException,
} from './domain/exceptions';
import { canTransitionShift } from './domain/payroll-state';
import { CreateShiftRegistrationDto, RejectShiftDto } from './dto/shift-registration.dto';

@Injectable()
export class ShiftRegistrationService {
  private readonly logger = new Logger(ShiftRegistrationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(filter: {
    dentistId?: string;
    status?: ShiftRegistrationStatus;
    from?: Date;
    to?: Date;
    requestorId?: string;
    isAdmin?: boolean;
  }) {
    const where: Prisma.ShiftRegistrationWhereInput = {
      deletedAt: null,
      ...(filter.status && { status: filter.status }),
      ...(filter.from && { date: { gte: filter.from } }),
      ...(filter.to && { date: { ...(filter.from ? { gte: filter.from } : {}), lte: filter.to } }),
      ...(filter.dentistId && { dentistId: filter.dentistId }),
    };

    // Row-level: dentist chỉ xem own (BR-PAY-024)
    if (!filter.isAdmin && filter.requestorId) {
      where.dentistId = filter.requestorId;
    }

    return this.prisma.shiftRegistration.findMany({
      where,
      orderBy: { date: 'asc' },
      include: {
        dentist: { select: { id: true, fullName: true, email: true } },
      },
    });
  }

  async getById(id: string, requestorId: string, isAdmin: boolean) {
    const shift = await this.prisma.shiftRegistration.findUnique({
      where: { id },
      include: {
        dentist: { select: { id: true, fullName: true, email: true } },
        approvedByUser: { select: { id: true, fullName: true } },
      },
    });
    if (!shift) throw new PayrollNotFoundException('ShiftRegistration', id);
    if (!isAdmin && shift.dentistId !== requestorId) {
      throw new PayrollNotFoundException('ShiftRegistration', id); // 404 (don't leak existence)
    }
    return shift;
  }

  /**
   * Create a new shift registration.
   * Auto-resolves dentistId: if admin and dto.dentistId provided → that; else currentUser.
   */
  async create(dto: CreateShiftRegistrationDto, requestorId: string, isAdmin: boolean) {
    const dentistId = isAdmin && dto.dentistId ? dto.dentistId : requestorId;

    // Date validation
    const date = new Date(dto.date);
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    if (date < today) {
      throw new ShiftPastDateException('Cannot register shift for past date');
    }

    // Time validation
    if (dto.startTime >= dto.endTime) {
      throw new ShiftPastDateException('endTime must be strictly after startTime');
    }

    // BR-PAY-020: conflict check vs ALL active WorkingSchedules (not just first)
    const dayOfWeek = date.getUTCDay();
    const wsConflicts = await this.prisma.workingSchedule.findMany({
      where: {
        dentistId,
        deletedAt: null,
        dayOfWeek,
        validFrom: { lte: date },
        OR: [{ validTo: null }, { validTo: { gte: date } }],
      },
    });

    for (const ws of wsConflicts) {
      const wsStart = this.timeToMinutes(ws.startTime);
      const wsEnd = this.timeToMinutes(ws.endTime);
      const newStart = this.hhmmToMinutes(dto.startTime);
      const newEnd = this.hhmmToMinutes(dto.endTime);

      if (newStart < wsEnd && newEnd > wsStart) {
        throw new ShiftConflictException(
          `Overlaps with existing working schedule (${this.minutesToHhmm(wsStart)}-${this.minutesToHhmm(wsEnd)})`,
        );
      }
    }

    // M#4: Check ALL non-cancelled shifts for this dentist on this date.
    // - APPROVED  → reject (BS already has 1 approved shift for that day)
    // - PENDING   → reject (admin should process/reject pending first)
    // (REJECTED/CANCELLED are terminal, don't block)
    const conflictingShift = await this.prisma.shiftRegistration.findFirst({
      where: {
        dentistId,
        date,
        status: {
          in: [ShiftRegistrationStatus.APPROVED, ShiftRegistrationStatus.PENDING],
        },
        deletedAt: null,
        // Exclude self when re-submitting after REJECTED→PENDING (not possible
        // in current state machine but defense in depth)
        NOT: { id: '00000000-0000-0000-0000-000000000000' },
      },
    });
    if (conflictingShift) {
      throw new ShiftConflictException(
        conflictingShift.status === ShiftRegistrationStatus.APPROVED
          ? 'BS đã có 1 ShiftRegistration APPROVED cho ngày này'
          : 'BS đã có 1 ShiftRegistration PENDING cho ngày này — chờ admin duyệt/từ chối trước',
      );
    }

    const created = await this.prisma.shiftRegistration.create({
      data: {
        dentistId,
        date,
        startTime: dto.startTime,
        endTime: dto.endTime,
        maxEncounters: dto.maxEncounters ?? null,
        notes: dto.notes ?? null,
        status: ShiftRegistrationStatus.PENDING,
        createdByUserId: requestorId,
      },
    });

    await this.audit.log({
      actorUserId: requestorId,
      action: 'SHIFT_REGISTERED',
      targetType: 'SHIFT_REGISTRATION',
      targetId: created.id,
      metadata: { dentistId, date, startTime: dto.startTime, endTime: dto.endTime },
    });

    return created;
  }

  async approve(id: string, actorUserId: string) {
    const shift = await this.prisma.shiftRegistration.findUnique({ where: { id } });
    if (!shift) throw new PayrollNotFoundException('ShiftRegistration', id);
    if (!canTransitionShift(shift.status, ShiftRegistrationStatus.APPROVED)) {
      throw new ShiftConflictException(`Cannot approve shift in status ${shift.status}`);
    }

    // BR-APPT-029: cannot approve past date
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    if (shift.date < today) {
      throw new ShiftPastDateException('Cannot approve shift for past date');
    }

    const updated = await this.prisma.shiftRegistration.update({
      where: { id },
      data: {
        status: ShiftRegistrationStatus.APPROVED,
        approvedByUserId: actorUserId,
        approvedAt: new Date(),
      },
    });

    await this.audit.log({
      actorUserId,
      action: 'SHIFT_APPROVED',
      targetType: 'SHIFT_REGISTRATION',
      targetId: id,
      metadata: { dentistId: shift.dentistId, date: shift.date },
    });

    return updated;
  }

  async reject(id: string, dto: RejectShiftDto, actorUserId: string) {
    const shift = await this.prisma.shiftRegistration.findUnique({ where: { id } });
    if (!shift) throw new PayrollNotFoundException('ShiftRegistration', id);
    if (!canTransitionShift(shift.status, ShiftRegistrationStatus.REJECTED)) {
      throw new ShiftConflictException(`Cannot reject shift in status ${shift.status}`);
    }

    const updated = await this.prisma.shiftRegistration.update({
      where: { id },
      data: {
        status: ShiftRegistrationStatus.REJECTED,
        rejectionReason: dto.reason,
        approvedByUserId: actorUserId,
      },
    });

    await this.audit.log({
      actorUserId,
      action: 'SHIFT_REJECTED',
      targetType: 'SHIFT_REGISTRATION',
      targetId: id,
      metadata: { reason: dto.reason },
    });

    return updated;
  }

  /**
   * Cancel own shift registration.
   * - Admin: any time, no penalty.
   * - Dentist: chỉ cancel được nếu >= 24h trước giờ ca (BR-APPT-028).
   * - Admin cancelling APPROVED shift < 24h before: triggers BR-PAY-014
   *   late-cancel penalty (system audit log + suggested adjustment, not auto-applied).
   */
  async cancel(id: string, requestorId: string, isAdmin: boolean) {
    const shift = await this.prisma.shiftRegistration.findUnique({ where: { id } });
    if (!shift) throw new PayrollNotFoundException('ShiftRegistration', id);

    if (!isAdmin && shift.dentistId !== requestorId) {
      throw new PayrollNotFoundException('ShiftRegistration', id);
    }

    if (!canTransitionShift(shift.status, ShiftRegistrationStatus.CANCELLED)) {
      throw new ShiftRegistrationNotCancellableException(
        `Cannot cancel shift in status ${shift.status}`,
      );
    }

    let lateCancelByAdmin = false;
    let hoursUntilShift: number | null = null;

    if (!isAdmin) {
      // BR-APPT-028: BS chỉ cancel được >= 24h trước
      const shiftStart = new Date(shift.date);
      const [hh, mm] = shift.startTime.split(':').map(Number);
      shiftStart.setUTCHours(hh, mm, 0, 0);

      const now = new Date();
      hoursUntilShift = (shiftStart.getTime() - now.getTime()) / 3_600_000;
      if (hoursUntilShift < 24) {
        throw new ShiftRegistrationNotCancellableException(
          `BS chỉ có thể hủy ca trước 24h. Còn ${hoursUntilShift.toFixed(1)} giờ.`,
        );
      }
    } else if (shift.status === ShiftRegistrationStatus.APPROVED) {
      // M#8 (BR-PAY-014): Admin cancelling an APPROVED shift < 24h before is
      // considered a late cancel. We audit it; admin can then create a PayrollAdjustment.
      const shiftStart = new Date(shift.date);
      const [hh, mm] = shift.startTime.split(':').map(Number);
      shiftStart.setUTCHours(hh, mm, 0, 0);
      hoursUntilShift = (shiftStart.getTime() - Date.now()) / 3_600_000;
      if (hoursUntilShift >= 0 && hoursUntilShift < 24) {
        lateCancelByAdmin = true;
      }
    }

    const updated = await this.prisma.shiftRegistration.update({
      where: { id },
      data: {
        status: ShiftRegistrationStatus.CANCELLED,
        cancelledAt: new Date(),
      },
    });

    const auditMetadata: Record<string, unknown> = {
      byAdmin: isAdmin,
      dentistId: shift.dentistId,
      date: shift.date,
      // Always include the flag so audit consumers can distinguish late vs early
      // admin cancels without checking key presence.
      lateCancelByAdmin,
    };
    if (lateCancelByAdmin) {
      auditMetadata.hoursUntilShift = hoursUntilShift;
      auditMetadata.recommendation =
        'Consider creating PayrollAdjustment of type PENALTY for this dentist in current period';
    }

    await this.audit.log({
      actorUserId: requestorId,
      action: 'SHIFT_CANCELLED',
      targetType: 'SHIFT_REGISTRATION',
      targetId: id,
      metadata: auditMetadata,
    });

    return updated;
  }

  /**
   * Cron job: auto-cancel PENDING shifts whose date+time has fully passed (BR-APPT-029).
   * A shift registered for TODAY morning is still valid until the start time passes,
   * so we compare (date + startTime) vs now.
   */
  async autoCancelPastPending() {
    const now = new Date();

    // Find PENDING candidates: date < today OR (date = today AND startTime < now's HH:mm)
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);

    const candidates = await this.prisma.shiftRegistration.findMany({
      where: {
        status: ShiftRegistrationStatus.PENDING,
        deletedAt: null,
        // Either: date is before today (any time)
        // Or:     date is today but startTime is already past
        OR: [
          { date: { lt: today } },
          {
            date: today,
            startTime: { lt: this.hhmmOnly(now) },
          },
        ],
      },
      select: { id: true },
    });

    if (candidates.length === 0) return 0;

    const ids = candidates.map(c => c.id);
    const result = await this.prisma.shiftRegistration.updateMany({
      where: { id: { in: ids } },
      data: {
        status: ShiftRegistrationStatus.CANCELLED,
        cancelledAt: new Date(),
      },
    });

    if (result.count > 0) {
      this.logger.log(
        `Auto-cancelled ${result.count} pending shift registrations (past date/time)`,
      );
      await this.audit.log({
        actorUserId: null,
        action: 'SHIFT_AUTO_CANCELLED',
        targetType: 'SHIFT_REGISTRATION',
        metadata: { count: result.count },
      });
    }
    return result.count;
  }

  private hhmmOnly(d: Date): string {
    return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
  }

  /**
   * BR-PAY-015: Detect no-show shifts.
   * Returns list of shifts where dentist was APPROVED but completed zero encounters
   * on that date. This is informational only — UI/admin should then create a
   * PayrollAdjustment PENALTY manually (not auto-applied to avoid false positives
   * when patient just didn't show up — that's patient no-show, not BS no-show).
   *
   * R2-5 fix: shift.date is a Postgres DATE column. Prisma returns it as
   * `Date` at midnight UTC, but JS Date arithmetic can drift by server TZ.
   * Build next-day boundary by using UTC date math, not ms arithmetic.
   */
  async detectNoShowShifts(fromDate: Date, toDate: Date) {
    const approvedShifts = await this.prisma.shiftRegistration.findMany({
      where: {
        status: ShiftRegistrationStatus.APPROVED,
        date: { gte: fromDate, lte: toDate },
        deletedAt: null,
      },
      include: {
        dentist: { select: { id: true, fullName: true } },
      },
    });

    const noShows: Array<{
      shiftId: string;
      dentistId: string;
      dentistName: string;
      date: Date;
    }> = [];

    for (const shift of approvedShifts) {
      // Compute next day as UTC midnight to avoid TZ drift.
      const dayStart = new Date(
        Date.UTC(shift.date.getUTCFullYear(), shift.date.getUTCMonth(), shift.date.getUTCDate()),
      );
      const dayEnd = new Date(dayStart);
      dayEnd.setUTCDate(dayEnd.getUTCDate() + 1);

      const encounterCount = await this.prisma.encounter.count({
        where: {
          dentistId: shift.dentistId,
          status: 'COMPLETED',
          closedAt: {
            gte: dayStart,
            lt: dayEnd,
          },
        },
      });
      if (encounterCount === 0) {
        noShows.push({
          shiftId: shift.id,
          dentistId: shift.dentistId,
          dentistName: shift.dentist.fullName,
          date: shift.date,
        });
      }
    }

    return noShows;
  }

  // ============================================================================
  // Helpers
  // ============================================================================

  private timeToMinutes(time: Date | string): number {
    if (typeof time === 'string') {
      const [h, m] = time.split(':').map(Number);
      return h * 60 + m;
    }
    return time.getUTCHours() * 60 + time.getUTCMinutes();
  }

  private hhmmToMinutes(hhmm: string): number {
    const [h, m] = hhmm.split(':').map(Number);
    return h * 60 + m;
  }

  private minutesToHhmm(minutes: number): string {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }
}

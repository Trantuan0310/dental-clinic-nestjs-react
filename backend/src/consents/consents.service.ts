import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConsentRecord, Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { dentistCanReadPatient } from '../common/dentist-patient-access';
import { JwtPayload } from '../common/guards/permissions.guard';
import { rowScope } from '../common/row-scope';
import { PrismaService } from '../prisma/prisma.service';
import { getConsentNotices, recordConsent } from './consent-record';

type RecordWithBooking = ConsentRecord & { bookingRequest?: { patientId: string | null } | null };
const BOOKING_LINK = { bookingRequest: { select: { patientId: true } } } as const;
type LedgerQuery = { q?: string; offset?: number; limit?: number };

@Injectable()
export class ConsentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async listForPatient(patientId: string, actor: JwtPayload) {
    this.requirePermission(actor, 'consent.read');
    await this.assertPatient(patientId, actor);
    const rows = await this.prisma.consentRecord.findMany({
      where: this.patientRecords(patientId),
      include: BOOKING_LINK,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });
    return rows.map(row => this.toView(row));
  }

  async recordAtDesk(
    patientId: string,
    input: { purpose: string; version: string },
    actor: JwtPayload,
    ip?: string,
  ) {
    this.requireManage(actor);
    await this.assertPatient(patientId, actor);
    const notice = getConsentNotices().desk;
    if (input.purpose !== notice.purpose)
      throw new BadRequestException('Mục đích đồng thuận không hợp lệ');
    if (input.version !== notice.version)
      throw new ConflictException(
        'Nội dung đồng thuận vừa thay đổi; tải lại trang trước khi xác nhận',
      );
    return this.prisma.$transaction(async tx =>
      this.toView(
        await recordConsent(tx, {
          channel: 'DESK',
          patientId,
          notice,
          ip,
          actorId: actor.sub,
        }),
      ),
    );
  }

  async withdraw(patientId: string, recordId: string, actor: JwtPayload) {
    this.requireManage(actor);
    await this.assertPatient(patientId, actor);
    return this.prisma.$transaction(async tx => {
      const row = await tx.consentRecord.findFirst({
        where: { id: recordId, ...this.patientRecords(patientId) },
      });
      if (!row) throw new NotFoundException('Không tìm thấy bản ghi đồng thuận');
      const updated = await tx.consentRecord.updateMany({
        where: { id: row.id, withdrawnAt: null },
        data: { withdrawnAt: new Date(), withdrawnBy: actor.sub },
      });
      if (updated.count)
        await this.audit.log(
          {
            action: 'CONSENT_WITHDRAWN',
            actorUserId: actor.sub,
            actorEmail: actor.email,
            targetType: 'ConsentRecord',
            targetId: row.id,
            metadata: { patientId },
          },
          tx,
        );
      return this.toView(
        await tx.consentRecord.findUniqueOrThrow({ where: { id: row.id }, include: BOOKING_LINK }),
      );
    });
  }

  async adminList(query: LedgerQuery, actor: JwtPayload) {
    this.requirePermission(actor, 'consent.export');
    const where = this.searchWhere(query.q);
    return this.prisma.$transaction(
      async tx => {
        const [rows, total] = await Promise.all([
          tx.consentRecord.findMany({
            where,
            include: BOOKING_LINK,
            skip: query.offset ?? 0,
            take: query.limit ?? 25,
            orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          }),
          tx.consentRecord.count({ where }),
        ]);
        return { data: rows.map(row => this.toView(row)), total };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }

  async exportCsv(query: Pick<LedgerQuery, 'q'>, actor: JwtPayload) {
    this.requirePermission(actor, 'consent.export');
    const rows = await this.prisma.consentRecord.findMany({
      where: this.searchWhere(query.q),
      include: BOOKING_LINK,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });
    const columns = [
      'id',
      'purpose',
      'version',
      'text',
      'channel',
      'createdAt',
      'withdrawnAt',
      'patientId',
      'bookingRequestId',
    ] as const;
    const cell = (value: unknown) => {
      let text = value instanceof Date ? value.toISOString() : String(value ?? '');
      if (/^[\s\uFEFF]*[=+\-@]/u.test(text) || /^[\t\r\n]/u.test(text)) text = "'" + text;
      return '"' + text.replace(/"/g, '""') + '"';
    };
    const csv =
      '\uFEFF' +
      columns.join(',') +
      '\r\n' +
      rows
        .map(row => {
          const view = this.toView(row);
          return columns.map(key => cell(view[key])).join(',');
        })
        .join('\r\n');
    await this.audit.log({
      action: 'CONSENTS_EXPORTED',
      actorUserId: actor.sub,
      actorEmail: actor.email,
      targetType: 'ConsentRecord',
      metadata: { count: rows.length },
    });
    return csv;
  }

  private requirePermission(actor: JwtPayload, permission: string) {
    if (!actor.permissions.includes(permission))
      throw new ForbiddenException('Thiếu quyền: ' + permission);
  }

  private requireManage(actor: JwtPayload) {
    this.requirePermission(actor, 'consent.manage');
    if (rowScope(actor, 'patient') !== 'any')
      throw new ForbiddenException('Thay đổi đồng thuận cần quyền xem toàn bộ bệnh nhân');
  }

  private async assertPatient(patientId: string, actor: JwtPayload) {
    const scope = rowScope(actor, 'patient');
    if (scope === 'none') throw new ForbiddenException('Bạn không có quyền xem bệnh nhân này');
    if (
      !(await this.prisma.patient.findFirst({
        where: { id: patientId, deletedAt: null },
        select: { id: true },
      }))
    ) {
      throw new NotFoundException('Không tìm thấy bệnh nhân');
    }
    if (scope === 'own' && !(await dentistCanReadPatient(this.prisma, patientId, actor.sub))) {
      throw new NotFoundException('Không tìm thấy bệnh nhân');
    }
  }

  private patientRecords(patientId: string): Prisma.ConsentRecordWhereInput {
    return { OR: [{ patientId }, { bookingRequest: { patientId } }] };
  }

  private searchWhere(q?: string): Prisma.ConsentRecordWhereInput {
    const term = q?.trim();
    if (!term) return {};
    const contains = { contains: term, mode: Prisma.QueryMode.insensitive };
    return {
      OR: [
        { purpose: contains },
        { version: contains },
        { text: contains },
        { patient: { OR: [{ fullName: contains }, { code: contains }] } },
        {
          bookingRequest: {
            OR: [
              { fullName: contains },
              { referenceCode: contains },
              { patient: { OR: [{ fullName: contains }, { code: contains }] } },
            ],
          },
        },
      ],
    };
  }

  private toView(row: RecordWithBooking) {
    return {
      id: row.id,
      purpose: row.purpose,
      version: row.version,
      text: row.text,
      channel: row.channel,
      createdAt: row.createdAt,
      withdrawnAt: row.withdrawnAt,
      patientId: row.patientId ?? row.bookingRequest?.patientId ?? null,
      bookingRequestId: row.bookingRequestId,
    };
  }
}

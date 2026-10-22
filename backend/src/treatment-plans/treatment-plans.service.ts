import { HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, TreatmentPlanItemStatus, TreatmentPlanStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { JwtPayload } from '../common/guards/permissions.guard';
import { BusinessRuleException } from '../common/exceptions/business-rule.exception';
import { rowScope } from '../common/row-scope';
import { dentistCanReadPatient } from '../common/dentist-patient-access';
import { isValidFdiToothNumber } from '../medical-records/domain/tooth-numbers';
import {
  AddTreatmentPlanItemsDto,
  CreateTreatmentPlanDto,
  TreatmentPlanItemDto,
  UpdateTreatmentPlanDto,
} from './dto/treatment-plan.dto';
import { syncPlanProgress, WORKABLE_PLAN_STATUSES } from './domain/plan-progress';

/** Plans whose lines may still be rewritten (nothing agreed yet). */
const EDITABLE: TreatmentPlanStatus[] = [TreatmentPlanStatus.DRAFT, TreatmentPlanStatus.PROPOSED];

const PLAN_INCLUDE = {
  patient: { select: { id: true, code: true, fullName: true } },
  dentist: { select: { id: true, fullName: true } },
  acceptor: { select: { id: true, fullName: true } },
  items: {
    orderBy: { sequence: 'asc' },
    include: {
      service: { select: { id: true, code: true, name: true } },
      treatments: {
        where: { deletedAt: null },
        select: {
          id: true,
          encounterId: true,
          encounter: { select: { status: true, closedAt: true } },
        },
      },
    },
  },
} satisfies Prisma.TreatmentPlanInclude;

type PlanRow = Prisma.TreatmentPlanGetPayload<{ include: typeof PLAN_INCLUDE }>;

/**
 * Treatment plans (kế hoạch điều trị nhiều buổi): a dentist lists the
 * procedures a course of treatment needs, with the quoted price; the plan is
 * shown to the patient (PROPOSED), the patient agrees (ACCEPTED), and each
 * line is ticked off when the encounter that carried it out is closed
 * (MedicalRecordsService → markPlanItemsForEncounter).
 */
@Injectable()
export class TreatmentPlansService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async listForPatient(patientId: string, actor: JwtPayload) {
    await this.assertCanReadPatient(patientId, actor);
    const rows = await this.prisma.treatmentPlan.findMany({
      where: { patientId },
      orderBy: { createdAt: 'desc' },
      include: PLAN_INCLUDE,
    });
    return rows.map(r => this.toView(r));
  }

  /** Lines a procedure in an encounter of this patient may carry out. */
  async openItems(patientId: string, actor: JwtPayload) {
    await this.assertCanReadPatient(patientId, actor);
    const items = await this.prisma.treatmentPlanItem.findMany({
      where: {
        status: TreatmentPlanItemStatus.PLANNED,
        plan: { patientId, status: { in: WORKABLE_PLAN_STATUSES } },
        // Not already taken by a treatment still on record.
        treatments: { none: { deletedAt: null, encounter: { status: { not: 'CANCELLED' } } } },
      },
      orderBy: [{ plan: { createdAt: 'asc' } }, { sequence: 'asc' }],
      include: {
        plan: { select: { id: true, title: true, dentistId: true } },
        service: { select: { id: true, code: true, name: true } },
      },
    });
    return items.map(i => ({
      id: i.id,
      planId: i.planId,
      planTitle: i.plan.title,
      serviceId: i.serviceId,
      service: i.service,
      procedure: i.procedure,
      toothNumbers: (i.toothNumbers as number[] | null) ?? [],
      quantity: i.quantity,
      unitPrice: Number(i.unitPrice),
      notes: i.notes,
    }));
  }

  async get(id: string, actor: JwtPayload) {
    const row = await this.load(id);
    await this.assertCanRead(row, actor);
    return this.toView(row);
  }

  async create(dto: CreateTreatmentPlanDto, actor: JwtPayload) {
    const patient = await this.prisma.patient.findFirst({
      where: { id: dto.patientId, deletedAt: null },
      select: { id: true },
    });
    if (!patient) throw new NotFoundException('Không tìm thấy bệnh nhân');
    await this.assertCanReadPatient(dto.patientId, actor);
    const dentistId = this.isOwnScope(actor) ? actor.sub : (dto.dentistId ?? actor.sub);
    await this.assertDentist(dentistId);
    if (dto.sourceEncounterId) {
      const enc = await this.prisma.encounter.findUnique({
        where: { id: dto.sourceEncounterId },
        select: { patientId: true },
      });
      if (!enc || enc.patientId !== dto.patientId) {
        throw this.rule(
          'Phiên khám nguồn không thuộc bệnh nhân này',
          'PLAN_SOURCE_ENCOUNTER_MISMATCH',
        );
      }
    }
    await this.assertItems(dto.items);

    const created = await this.prisma.$transaction(async tx => {
      const plan = await tx.treatmentPlan.create({
        data: {
          patientId: dto.patientId,
          dentistId,
          title: dto.title,
          notes: dto.notes?.trim() || null,
          sourceEncounterId: dto.sourceEncounterId ?? null,
          createdBy: actor.sub,
          items: { create: dto.items.map((item, i) => this.itemData(item, i)) },
        },
      });
      await this.audit.log(
        {
          action: 'TREATMENT_PLAN_CREATED',
          actorUserId: actor.sub,
          actorEmail: actor.email,
          targetType: 'treatment_plan',
          targetId: plan.id,
          metadata: {
            patientId: dto.patientId,
            dentistId,
            items: dto.items.length,
            total: this.sum(dto.items),
          },
        },
        tx,
      );
      return plan;
    });
    return this.get(created.id, actor);
  }

  async update(id: string, dto: UpdateTreatmentPlanDto, actor: JwtPayload) {
    const row = await this.load(id);
    await this.assertCanWrite(row, actor);
    if (row.updatedAt.getTime() !== new Date(dto.expectedUpdatedAt).getTime()) {
      throw new BusinessRuleException(
        'Kế hoạch vừa được người khác sửa. Tải lại để xem bản mới rồi sửa tiếp.',
        HttpStatus.CONFLICT,
        { updatedAt: row.updatedAt },
        'PLAN_STALE',
      );
    }
    if (
      row.status === TreatmentPlanStatus.CANCELLED ||
      row.status === TreatmentPlanStatus.COMPLETED
    ) {
      throw this.state('Kế hoạch đã kết thúc hoặc đã huỷ, không sửa được');
    }
    if (dto.items && !EDITABLE.includes(row.status)) {
      throw this.state(
        'Khách đã đồng ý kế hoạch: không sửa các mục đã báo giá. Thêm mục mới hoặc bỏ qua mục không làm.',
      );
    }
    if (dto.items) await this.assertItems(dto.items);
    let dentistId: string | undefined;
    if (dto.dentistId && dto.dentistId !== row.dentistId) {
      if (this.isOwnScope(actor)) {
        throw this.rule('Bác sĩ không chuyển kế hoạch cho bác sĩ khác', 'PLAN_DENTIST_LOCKED');
      }
      await this.assertDentist(dto.dentistId);
      dentistId = dto.dentistId;
    }

    await this.prisma.$transaction(async tx => {
      // Guarded write: a concurrent edit committed after the read above loses.
      const { count } = await tx.treatmentPlan.updateMany({
        where: { id, updatedAt: row.updatedAt },
        data: {
          ...(dto.title !== undefined && { title: dto.title }),
          ...(dto.notes !== undefined && { notes: dto.notes.trim() || null }),
          ...(dentistId && { dentistId }),
          // Rewriting a quote that was shown to the patient makes it a draft again.
          ...(dto.items &&
            row.status === TreatmentPlanStatus.PROPOSED && {
              status: TreatmentPlanStatus.DRAFT,
              proposedAt: null,
            }),
        },
      });
      if (count === 0) {
        throw new BusinessRuleException(
          'Kế hoạch vừa được người khác sửa. Tải lại để xem bản mới rồi sửa tiếp.',
          HttpStatus.CONFLICT,
          undefined,
          'PLAN_STALE',
        );
      }
      if (dto.items) {
        await tx.treatmentPlanItem.deleteMany({ where: { planId: id } });
        await tx.treatmentPlanItem.createMany({
          data: dto.items.map((item, i) => ({ planId: id, ...this.itemData(item, i) })),
        });
      }
      await this.audit.log(
        {
          action: 'TREATMENT_PLAN_UPDATED',
          actorUserId: actor.sub,
          actorEmail: actor.email,
          targetType: 'treatment_plan',
          targetId: id,
          metadata: {
            fields: Object.keys(dto).filter(k => k !== 'expectedUpdatedAt'),
            ...(dto.items && {
              totalBefore: this.sum(this.viewItems(row)),
              totalAfter: this.sum(dto.items),
            }),
          },
        },
        tx,
      );
    });
    return this.get(id, actor);
  }

  /** DRAFT → PROPOSED: the quote is shown to the patient. */
  async propose(id: string, actor: JwtPayload) {
    const row = await this.load(id);
    await this.assertCanWrite(row, actor);
    if (row.status !== TreatmentPlanStatus.DRAFT)
      throw this.state('Chỉ báo giá kế hoạch đang nháp');
    if (!row.items.length) throw this.rule('Kế hoạch chưa có mục nào để báo giá', 'PLAN_EMPTY');
    await this.transition(
      id,
      row.status,
      { status: TreatmentPlanStatus.PROPOSED, proposedAt: new Date() },
      actor,
      'TREATMENT_PLAN_PROPOSED',
      { total: this.sum(this.viewItems(row)) },
    );
    return this.get(id, actor);
  }

  /** The patient agreed to the plan and its quote (front desk, dentist or admin). */
  async accept(id: string, note: string | undefined, actor: JwtPayload) {
    const row = await this.load(id);
    await this.assertCanRead(row, actor);
    if (!EDITABLE.includes(row.status)) {
      throw this.state('Chỉ ghi nhận đồng ý cho kế hoạch đang nháp hoặc đã báo giá');
    }
    if (!row.items.length) throw this.rule('Kế hoạch chưa có mục nào', 'PLAN_EMPTY');
    const now = new Date();
    await this.transition(
      id,
      row.status,
      {
        status: TreatmentPlanStatus.ACCEPTED,
        acceptedAt: now,
        acceptedBy: actor.sub,
        acceptanceNote: note?.trim() || null,
        proposedAt: row.proposedAt ?? now,
      },
      actor,
      'TREATMENT_PLAN_ACCEPTED',
      { total: this.sum(this.viewItems(row)) },
    );
    return this.get(id, actor);
  }

  async cancel(id: string, reason: string, actor: JwtPayload) {
    const row = await this.load(id);
    await this.assertCanWrite(row, actor);
    if (
      row.status === TreatmentPlanStatus.CANCELLED ||
      row.status === TreatmentPlanStatus.COMPLETED
    ) {
      throw this.state('Kế hoạch đã kết thúc hoặc đã huỷ');
    }
    await this.transition(
      id,
      row.status,
      { status: TreatmentPlanStatus.CANCELLED, cancelledAt: new Date(), cancelReason: reason },
      actor,
      'TREATMENT_PLAN_CANCELLED',
      { reason },
    );
    return this.get(id, actor);
  }

  /** New lines on an agreed plan (a need found along the way). */
  async addItems(id: string, dto: AddTreatmentPlanItemsDto, actor: JwtPayload) {
    const row = await this.load(id);
    await this.assertCanWrite(row, actor);
    const agreed: TreatmentPlanStatus[] = [
      ...WORKABLE_PLAN_STATUSES,
      TreatmentPlanStatus.COMPLETED,
    ];
    if (!agreed.includes(row.status)) {
      throw this.state('Kế hoạch chưa được đồng ý: sửa trực tiếp các mục của kế hoạch');
    }
    await this.assertItems(dto.items);
    const start = row.items.reduce((m, i) => Math.max(m, i.sequence), -1) + 1;
    await this.prisma.$transaction(async tx => {
      await tx.treatmentPlanItem.createMany({
        data: dto.items.map((item, i) => ({ planId: id, ...this.itemData(item, start + i) })),
      });
      await syncPlanProgress(tx, [id]);
      await this.audit.log(
        {
          action: 'TREATMENT_PLAN_ITEMS_ADDED',
          actorUserId: actor.sub,
          actorEmail: actor.email,
          targetType: 'treatment_plan',
          targetId: id,
          metadata: { items: dto.items.length, total: this.sum(dto.items) },
        },
        tx,
      );
    });
    return this.get(id, actor);
  }

  /** A planned line that will not be done (patient declined it, no longer needed). */
  async skipItem(id: string, itemId: string, reason: string, actor: JwtPayload) {
    return this.setItemStatus(id, itemId, actor, TreatmentPlanItemStatus.SKIPPED, reason);
  }

  async unskipItem(id: string, itemId: string, actor: JwtPayload) {
    return this.setItemStatus(id, itemId, actor, TreatmentPlanItemStatus.PLANNED);
  }

  // ---------------------------------------------------------------------------

  private async setItemStatus(
    id: string,
    itemId: string,
    actor: JwtPayload,
    status: TreatmentPlanItemStatus,
    reason?: string,
  ) {
    const row = await this.load(id);
    await this.assertCanWrite(row, actor);
    const agreed: TreatmentPlanStatus[] = [
      ...WORKABLE_PLAN_STATUSES,
      TreatmentPlanStatus.COMPLETED,
    ];
    if (!agreed.includes(row.status))
      throw this.state('Chỉ bỏ qua mục của kế hoạch đã được đồng ý');
    const item = row.items.find(i => i.id === itemId);
    if (!item) throw new NotFoundException('Không tìm thấy mục kế hoạch');
    const from =
      status === TreatmentPlanItemStatus.SKIPPED
        ? TreatmentPlanItemStatus.PLANNED
        : TreatmentPlanItemStatus.SKIPPED;
    if (item.status !== from) {
      throw this.state(
        status === TreatmentPlanItemStatus.SKIPPED
          ? 'Chỉ bỏ qua được mục chưa làm'
          : 'Mục này không ở trạng thái bỏ qua',
      );
    }
    if (status === TreatmentPlanItemStatus.SKIPPED && this.liveTreatment(item)) {
      throw this.state(
        'Mục này đang được ghi trong một phiên khám chưa đóng: xoá thủ thuật đó trước',
      );
    }
    await this.prisma.$transaction(async tx => {
      const { count } = await tx.treatmentPlanItem.updateMany({
        where: { id: itemId, status: from },
        data: { status, skipReason: status === TreatmentPlanItemStatus.SKIPPED ? reason : null },
      });
      if (count === 0) throw this.state('Mục kế hoạch vừa thay đổi, tải lại rồi thử lại');
      await syncPlanProgress(tx, [id]);
      await this.audit.log(
        {
          action:
            status === TreatmentPlanItemStatus.SKIPPED
              ? 'TREATMENT_PLAN_ITEM_SKIPPED'
              : 'TREATMENT_PLAN_ITEM_UNSKIPPED',
          actorUserId: actor.sub,
          actorEmail: actor.email,
          targetType: 'treatment_plan',
          targetId: id,
          metadata: { itemId, procedure: item.procedure, ...(reason && { reason }) },
        },
        tx,
      );
    });
    return this.get(id, actor);
  }

  private async transition(
    id: string,
    from: TreatmentPlanStatus,
    data: Prisma.TreatmentPlanUpdateManyMutationInput & { acceptedBy?: string },
    actor: JwtPayload,
    action: string,
    metadata: Record<string, unknown>,
  ) {
    await this.prisma.$transaction(async tx => {
      const { count } = await tx.treatmentPlan.updateMany({
        where: { id, status: from },
        data: data as Prisma.TreatmentPlanUncheckedUpdateManyInput,
      });
      if (count === 0) throw this.state('Kế hoạch vừa thay đổi trạng thái, tải lại rồi thử lại');
      await this.audit.log(
        {
          action,
          actorUserId: actor.sub,
          actorEmail: actor.email,
          targetType: 'treatment_plan',
          targetId: id,
          metadata: { from, to: data.status, ...metadata },
        },
        tx,
      );
    });
  }

  private async load(id: string): Promise<PlanRow> {
    const row = await this.prisma.treatmentPlan.findUnique({
      where: { id },
      include: PLAN_INCLUDE,
    });
    if (!row) throw new NotFoundException('Không tìm thấy kế hoạch điều trị');
    return row;
  }

  /** A dentist whose patients are their own (row-scoped), as elsewhere in the app. */
  private isOwnScope(actor: JwtPayload) {
    return rowScope(actor, 'patient') === 'own';
  }

  private async assertCanReadPatient(patientId: string, actor: JwtPayload) {
    if (!this.isOwnScope(actor)) return;
    if (!(await dentistCanReadPatient(this.prisma, patientId, actor.sub))) {
      // Same answer as for a missing patient: no enumeration.
      throw new NotFoundException('Không tìm thấy bệnh nhân');
    }
  }

  private async assertCanRead(row: PlanRow, actor: JwtPayload) {
    if (!this.isOwnScope(actor) || row.dentistId === actor.sub) return;
    await this.assertCanReadPatient(row.patientId, actor).catch(() => {
      throw new NotFoundException('Không tìm thấy kế hoạch điều trị');
    });
  }

  /** A dentist edits only the plans they are in charge of. */
  private async assertCanWrite(row: PlanRow, actor: JwtPayload) {
    await this.assertCanRead(row, actor);
    if (this.isOwnScope(actor) && row.dentistId !== actor.sub) {
      throw new BusinessRuleException(
        'Chỉ bác sĩ phụ trách kế hoạch (hoặc quản trị viên) được sửa kế hoạch này',
        HttpStatus.FORBIDDEN,
        undefined,
        'PLAN_NOT_OWNER',
      );
    }
  }

  private async assertDentist(userId: string) {
    const user = await this.prisma.user.findFirst({
      where: {
        id: userId,
        status: 'ACTIVE',
        userRoles: { some: { role: { code: 'dentist' } } },
      },
      select: { id: true },
    });
    if (!user) {
      throw this.rule('Bác sĩ phụ trách phải là bác sĩ đang làm việc', 'PLAN_DENTIST_INVALID');
    }
  }

  private async assertItems(items: TreatmentPlanItemDto[]) {
    for (const item of items) {
      const bad = (item.toothNumbers ?? []).filter(n => !isValidFdiToothNumber(n));
      if (bad.length) {
        throw this.rule(`Số răng không hợp lệ: ${bad.join(', ')}`, 'PLAN_ITEM_INVALID_TOOTH');
      }
    }
    const serviceIds = [...new Set(items.map(i => i.serviceId).filter((v): v is string => !!v))];
    if (serviceIds.length) {
      const found = await this.prisma.service.count({ where: { id: { in: serviceIds } } });
      if (found !== serviceIds.length) {
        throw this.rule('Có dịch vụ không tồn tại trong danh mục', 'PLAN_ITEM_SERVICE_INVALID');
      }
    }
  }

  private itemData(item: TreatmentPlanItemDto, sequence: number) {
    return {
      sequence,
      serviceId: item.serviceId ?? null,
      procedure: item.procedure,
      toothNumbers: [...new Set(item.toothNumbers ?? [])] as unknown as Prisma.InputJsonValue,
      quantity: item.quantity ?? 1,
      unitPrice: item.unitPrice,
      notes: item.notes?.trim() || null,
    };
  }

  private sum(items: Array<{ quantity?: number; unitPrice: number }>) {
    return items.reduce((acc, i) => acc + (i.quantity ?? 1) * i.unitPrice, 0);
  }

  private viewItems(row: PlanRow) {
    return row.items.map(i => ({ quantity: i.quantity, unitPrice: Number(i.unitPrice) }));
  }

  /** The treatment carrying this line out in an encounter that is still open. */
  private liveTreatment(item: PlanRow['items'][number]) {
    return item.treatments.find(t => t.encounter.status === 'IN_PROGRESS') ?? null;
  }

  private toView(row: PlanRow) {
    const items = row.items.map(i => {
      const live = this.liveTreatment(i);
      return {
        id: i.id,
        sequence: i.sequence,
        serviceId: i.serviceId,
        service: i.service,
        procedure: i.procedure,
        toothNumbers: (i.toothNumbers as number[] | null) ?? [],
        quantity: i.quantity,
        unitPrice: Number(i.unitPrice),
        lineTotal: i.quantity * Number(i.unitPrice),
        notes: i.notes,
        status: i.status,
        doneAt: i.doneAt,
        skipReason: i.skipReason,
        // In an encounter that is still open: done once that encounter closes.
        inEncounterId: live?.encounterId ?? null,
        doneInEncounterId:
          i.treatments.find(t => t.encounter.status === 'COMPLETED')?.encounterId ?? null,
      };
    });
    const total = (status?: TreatmentPlanItemStatus) =>
      items.filter(i => !status || i.status === status).reduce((a, i) => a + i.lineTotal, 0);
    return {
      id: row.id,
      patient: row.patient,
      dentist: row.dentist,
      title: row.title,
      notes: row.notes,
      status: row.status,
      sourceEncounterId: row.sourceEncounterId,
      proposedAt: row.proposedAt,
      acceptedAt: row.acceptedAt,
      acceptedBy: row.acceptor,
      acceptanceNote: row.acceptanceNote,
      completedAt: row.completedAt,
      cancelledAt: row.cancelledAt,
      cancelReason: row.cancelReason,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      items,
      totals: {
        quoted: total(),
        done: total(TreatmentPlanItemStatus.DONE),
        remaining: total(TreatmentPlanItemStatus.PLANNED),
        skipped: total(TreatmentPlanItemStatus.SKIPPED),
        itemsDone: items.filter(i => i.status === TreatmentPlanItemStatus.DONE).length,
        itemsTotal: items.filter(i => i.status !== TreatmentPlanItemStatus.SKIPPED).length,
      },
    };
  }

  private rule(message: string, code: string) {
    return new BusinessRuleException(message, HttpStatus.BAD_REQUEST, undefined, code);
  }

  private state(message: string) {
    return new BusinessRuleException(message, HttpStatus.CONFLICT, undefined, 'PLAN_STATE_INVALID');
  }
}

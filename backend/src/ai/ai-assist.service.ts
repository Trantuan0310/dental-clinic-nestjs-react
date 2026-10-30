import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EncounterStatus, Gender, ItemStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RedisCacheService } from '../common/redis-cache.service';
import { AuditService } from '../audit/audit.service';
import { ReportsService } from '../reports/reports.service';
import { JwtPayload } from '../common/guards/permissions.guard';
import { rowScope } from '../common/row-scope';
import { clinicDateOnly } from '../common/date-range.util';
import { clinicOpeningHours, describeOpeningHours } from '../common/clinic-hours';
import { formatVisitTime } from '../booking/clinic-time-format';
import { AiModel, textField } from './ai-model';
import type { SummarySource } from './ai.types';
import {
  MESSAGE_SYSTEM_PROMPT,
  MessageFacts,
  NOTE_SYSTEM_PROMPT,
  REPORT_SYSTEM_PROMPT,
  buildMessageUserPrompt,
  buildNoteUserPrompt,
} from './prompts/assist-prompts';
import type { MessageDraftDto } from './dto/assist.dto';

export interface NoteDraft {
  chiefComplaint: string;
  diagnosis: string;
  treatmentPlan: string;
  notes: string;
  source: SummarySource;
  model?: string;
}

export interface MessageDraft {
  text: string;
  /** The patient's phone for "open in Zalo / call", when the draft is about one. */
  phone: string | null;
  source: SummarySource;
  model?: string;
}

export interface ReportFacts {
  from: string;
  to: string;
  patients: { total: number; newCount: number; pctChange: number };
  appointments: { total: number; arrived: number; cancelled: number; pctChange: number };
  treatmentRevenue: { total: number; pctChange: number };
  collected: { total: number; pctChange: number };
  expense: number;
  outstanding: { totalDebt: number; invoiceCount: number };
  topProcedures: Array<{ procedure: string; revenue: number; count: number }>;
  dentists: Array<{ name: string; revenue: number; percentage: number }>;
  lowStockItems: number;
}

export interface ReportCommentary {
  from: string;
  to: string;
  points: string[];
  facts: ReportFacts;
  generatedAt: string;
  source: SummarySource;
  model?: string;
  cached: boolean;
}

const NOTE_FIELD_MAX = 1000;
const MESSAGE_MAX = 800;
const POINT_MAX = 300;
const REPORT_CACHE_SECONDS = 3600;

/**
 * Drafts for the three roles (ghi chú khám, tin nhắn, nhận xét báo cáo).
 * Nothing here writes to a record or sends a message: the caller shows the
 * draft, the person edits it, and the existing endpoints save or send it.
 * Each feature keeps a plain answer for when no model is configured or the
 * model fails, so the button always does something useful.
 */
@Injectable()
export class AiAssistService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: RedisCacheService,
    private readonly audit: AuditService,
    private readonly reports: ReportsService,
    private readonly model: AiModel,
  ) {}

  // ---------------------------------------------------------------- note

  async draftNote(encounterId: string, text: string, actor: JwtPayload): Promise<NoteDraft> {
    const encounter = await this.prisma.encounter.findUnique({
      where: { id: encounterId },
      select: { id: true, dentistId: true, status: true },
    });
    const scope = rowScope(actor, 'encounter');
    if (!encounter || scope === 'none' || (scope === 'own' && encounter.dentistId !== actor.sub)) {
      throw new NotFoundException('Không tìm thấy phiên khám');
    }
    if (encounter.status !== EncounterStatus.IN_PROGRESS) {
      throw new BadRequestException('Phiên khám đã đóng: ghi chú chỉ thêm được bằng addendum');
    }

    const reply = await this.model.tryJson(
      'note draft',
      NOTE_SYSTEM_PROMPT,
      buildNoteUserPrompt(text),
      700,
    );
    const draft: NoteDraft = reply
      ? {
          chiefComplaint: textField(reply.data, 'chiefComplaint', NOTE_FIELD_MAX),
          diagnosis: textField(reply.data, 'diagnosis', NOTE_FIELD_MAX),
          treatmentPlan: textField(reply.data, 'treatmentPlan', NOTE_FIELD_MAX),
          notes: textField(reply.data, 'notes', NOTE_FIELD_MAX),
          source: reply.source,
          model: reply.model,
        }
      : { chiefComplaint: '', diagnosis: '', treatmentPlan: '', notes: '', source: 'fallback' };
    // A reply with nothing in it is no draft: keep what the dentist typed.
    if (!draft.chiefComplaint && !draft.diagnosis && !draft.treatmentPlan && !draft.notes) {
      draft.notes = text.slice(0, NOTE_FIELD_MAX);
      draft.source = 'fallback';
      delete draft.model;
    }

    await this.audit.log({
      action: 'AI_NOTE_DRAFTED',
      actorUserId: actor.sub,
      actorEmail: actor.email,
      targetType: 'encounter',
      targetId: encounterId,
      metadata: { source: draft.source, inputChars: text.length },
    });
    return draft;
  }

  // ------------------------------------------------------------- message

  async draftMessage(dto: MessageDraftDto, actor: JwtPayload): Promise<MessageDraft> {
    const env = process.env;
    const hours = clinicOpeningHours(env);
    const facts: MessageFacts = {
      kind: dto.kind,
      clinicName: env.CLINIC_NAME?.trim() || 'Phòng khám',
      clinicPhone: env.CLINIC_PHONE?.trim() || undefined,
      clinicAddress: env.CLINIC_ADDRESS?.trim() || undefined,
      clinicHours: hours ? describeOpeningHours(hours) : undefined,
      staffNote: dto.staffNote || undefined,
    };
    let greeting = 'quý khách';
    let phone: string | null = null;
    let targetType = 'message';
    let targetId: string | undefined;

    if (dto.kind === 'appointment_reminder' && !dto.appointmentId) {
      throw new BadRequestException('Thiếu lịch hẹn');
    }
    if (dto.kind === 'recall_reminder' && !dto.recallId) {
      throw new BadRequestException('Thiếu lượt tái khám');
    }
    if (dto.kind === 'reply' && !dto.customerMessage) {
      throw new BadRequestException('Dán tin nhắn của khách vào trước');
    }
    // The visit or recall the screen is about gives the greeting, the phone
    // and the facts, for its reminder and for a reply to that patient alike.
    if (dto.appointmentId) {
      const appt = await this.prisma.appointment.findFirst({
        where: { id: dto.appointmentId, deletedAt: null },
        select: {
          id: true,
          startAt: true,
          dentistId: true,
          dentist: { select: { fullName: true } },
          services: { select: { serviceName: true }, orderBy: { sortOrder: 'asc' } },
          patient: { select: { fullName: true, gender: true, primaryPhone: true } },
        },
      });
      const scope = rowScope(actor, 'appointment');
      if (!appt || scope === 'none' || (scope === 'own' && appt.dentistId !== actor.sub)) {
        throw new NotFoundException('Không tìm thấy lịch hẹn');
      }
      facts.visitTime = formatVisitTime(appt.startAt);
      facts.dentistName = appt.dentist?.fullName ?? undefined;
      facts.services = appt.services.map(s => s.serviceName);
      greeting = salutation(appt.patient.fullName, appt.patient.gender);
      phone = appt.patient.primaryPhone;
      targetType = 'appointment';
      targetId = appt.id;
    } else if (dto.recallId) {
      if (!actor.permissions.some(p => p === 'recall.read' || p === 'recall.manage')) {
        throw new ForbiddenException('Không có quyền xem danh sách tái khám');
      }
      const recall = await this.prisma.recall.findUnique({
        where: { id: dto.recallId },
        select: {
          id: true,
          dueDate: true,
          service: { select: { name: true } },
          sourceEncounter: { select: { startedAt: true } },
          patient: { select: { fullName: true, gender: true, primaryPhone: true } },
        },
      });
      if (!recall) throw new NotFoundException('Không tìm thấy lượt tái khám');
      facts.recallService = recall.service.name;
      facts.recallDue = viDate(clinicDateOnly(recall.dueDate));
      if (recall.sourceEncounter?.startedAt) {
        facts.lastVisit = viDate(clinicDateOnly(recall.sourceEncounter.startedAt));
      }
      greeting = salutation(recall.patient.fullName, recall.patient.gender);
      phone = recall.patient.primaryPhone;
      targetType = 'recall';
      targetId = recall.id;
    }
    if (dto.kind === 'reply') facts.customerMessage = dto.customerMessage;

    const reply = await this.model.tryJson(
      'message draft',
      MESSAGE_SYSTEM_PROMPT,
      buildMessageUserPrompt(facts),
      400,
    );
    const modelText = reply ? textField(reply.data, 'text', MESSAGE_MAX) : '';
    const text = fillGreeting(modelText || fallbackMessage(facts), greeting);
    const source: SummarySource = modelText && reply ? reply.source : 'fallback';

    await this.audit.log({
      action: 'AI_MESSAGE_DRAFTED',
      actorUserId: actor.sub,
      actorEmail: actor.email,
      targetType,
      targetId,
      metadata: { kind: dto.kind, source },
    });
    return { text, phone, source, ...(modelText && reply ? { model: reply.model } : {}) };
  }

  // -------------------------------------------------------------- report

  async reportCommentary(from: string, to: string, refresh: boolean): Promise<ReportCommentary> {
    const key = `ai:report:${from}:${to}`;
    if (!refresh) {
      const cached = await this.cache.getJSON<ReportCommentary>(key);
      if (cached) return { ...cached, cached: true };
    }
    const facts = await this.reportFacts(from, to);
    const reply = await this.model.tryJson(
      'report commentary',
      REPORT_SYSTEM_PROMPT,
      JSON.stringify(facts),
      700,
    );
    const modelPoints =
      reply && Array.isArray(reply.data.points)
        ? reply.data.points
            .filter((p): p is string => typeof p === 'string' && p.trim().length > 0)
            .map(p => p.replace(/\s+/g, ' ').trim().slice(0, POINT_MAX))
            .slice(0, 6)
        : [];
    const result: ReportCommentary = {
      from,
      to,
      points: modelPoints.length ? modelPoints : fallbackCommentary(facts),
      facts,
      generatedAt: new Date().toISOString(),
      source: modelPoints.length && reply ? reply.source : 'fallback',
      ...(modelPoints.length && reply ? { model: reply.model } : {}),
      cached: false,
    };
    await this.cache.setJSON(key, result, REPORT_CACHE_SECONDS);
    return result;
  }

  /** Totals only: no patient appears in what the model is given. */
  async reportFacts(from: string, to: string): Promise<ReportFacts> {
    const range = { from, to };
    const [kpis, finance, outstanding, procedures, dentists, lowStockItems] = await Promise.all([
      this.reports.dashboardKpis(range),
      this.reports.financeSummary(range),
      this.reports.outstandingSummary(),
      this.reports.revenueByProcedure({ ...range, limit: 5 }),
      this.reports.revenueByDentist(range),
      this.prisma.inventoryItem.count({
        where: {
          deletedAt: null,
          status: ItemStatus.ACTIVE,
          minStockLevel: { gt: 0 },
          quantityOnHand: { lte: this.prisma.inventoryItem.fields.minStockLevel },
        },
      }),
    ]);
    return {
      from,
      to,
      patients: {
        total: kpis.patients.total,
        newCount: kpis.patients.newCount,
        pctChange: kpis.patients.pctChange,
      },
      appointments: kpis.appointments,
      treatmentRevenue: kpis.treatmentRevenue,
      collected: kpis.collected,
      expense: finance.totalExpense,
      outstanding,
      topProcedures: procedures,
      dentists: dentists.slice(0, 5).map(d => ({
        name: d.dentistName,
        revenue: d.revenue,
        percentage: d.percentage,
      })),
      lowStockItems,
    };
  }
}

/** "chị Lan", "anh Minh", or "quý khách" when the gender is not given. */
export function salutation(fullName: string, gender: Gender): string {
  const given = fullName.trim().split(/\s+/).pop() ?? '';
  if (!given) return 'quý khách';
  if (gender === Gender.FEMALE) return `chị ${given}`;
  if (gender === Gender.MALE) return `anh ${given}`;
  return 'quý khách';
}

/** Puts the greeting where the model wrote {ten}, capitalised at the start of a sentence. */
export function fillGreeting(text: string, greeting: string): string {
  const capital = greeting.charAt(0).toUpperCase() + greeting.slice(1);
  return text
    .replace(/(^|[.!?]\s+|\n)\{ten\}/g, (_m, lead: string) => lead + capital)
    .replace(/\{ten\}/g, greeting);
}

function viDate(iso: string): string {
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
}

/** The message without a model: the same facts in a fixed sentence. */
export function fallbackMessage(f: MessageFacts): string {
  const call = f.clinicPhone ? ` Cần hỗ trợ xin gọi ${f.clinicPhone}.` : '';
  if (f.kind === 'appointment_reminder') {
    const who = f.dentistName ? ` với ${f.dentistName}` : '';
    const what = f.services?.length ? ` (${f.services.join(', ')})` : '';
    return (
      `Chào {ten}, ${f.clinicName} xin nhắc lịch hẹn lúc ${f.visitTime}${who}${what}. ` +
      `Mong {ten} xác nhận giúp phòng khám, nếu cần đổi giờ xin báo trước.${call}`
    );
  }
  if (f.kind === 'recall_reminder') {
    return (
      `Chào {ten}, đã đến hạn tái khám ${f.recallService} (${f.recallDue}) tại ${f.clinicName}. ` +
      `{ten} trả lời tin này để phòng khám sắp xếp lịch phù hợp nhé.${call}`
    );
  }
  return (
    `Chào {ten}, ${f.clinicName} đã nhận được tin nhắn. ` +
    `Phòng khám sẽ kiểm tra và phản hồi {ten} sớm nhất.${call}`
  );
}

/** "12,5 triệu đồng" / "850 nghìn đồng". */
export function vndText(amount: number): string {
  const abs = Math.abs(amount);
  const fmt = (n: number) => n.toFixed(1).replace(/\.0$/, '').replace('.', ',');
  if (abs >= 1e9) return `${fmt(amount / 1e9)} tỷ đồng`;
  if (abs >= 1e6) return `${fmt(amount / 1e6)} triệu đồng`;
  if (abs >= 1e3) return `${Math.round(amount / 1e3)} nghìn đồng`;
  return `${Math.round(amount)} đồng`;
}

function trend(pct: number): string {
  if (pct === 0) return 'không đổi so với kỳ trước';
  return `${pct > 0 ? 'tăng' : 'giảm'} ${Math.abs(pct).toString().replace('.', ',')}% so với kỳ trước`;
}

/** The commentary without a model: the same facts, plainly stated. */
export function fallbackCommentary(f: ReportFacts): string[] {
  const points = [
    `Doanh thu điều trị ${vndText(f.treatmentRevenue.total)}, ${trend(f.treatmentRevenue.pctChange)}; thực thu ${vndText(f.collected.total)}.`,
    `${f.patients.total} bệnh nhân đến khám (${f.patients.newCount} khách mới), ${trend(f.patients.pctChange)}.`,
  ];
  if (f.appointments.total + f.appointments.cancelled > 0) {
    const rate = Math.round(
      (f.appointments.cancelled / (f.appointments.total + f.appointments.cancelled)) * 100,
    );
    points.push(`${f.appointments.cancelled} lịch hẹn bị hủy (${rate}% tổng số lịch).`);
  }
  if (f.topProcedures[0]) {
    points.push(
      `Dịch vụ mang lại doanh thu cao nhất: ${f.topProcedures[0].procedure} (${vndText(f.topProcedures[0].revenue)}).`,
    );
  }
  if (f.outstanding.invoiceCount > 0) {
    points.push(
      `Còn ${f.outstanding.invoiceCount} hóa đơn chưa thu đủ, tổng ${vndText(f.outstanding.totalDebt)}: nên rà soát và nhắc khách.`,
    );
  }
  if (f.lowStockItems > 0) {
    points.push(`${f.lowStockItems} vật tư đã chạm mức tồn tối thiểu: cần lên kế hoạch nhập.`);
  }
  return points;
}

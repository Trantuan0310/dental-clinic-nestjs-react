import { BadRequestException } from '@nestjs/common';
import { InvoiceStatus } from '@prisma/client';
import type { JwtPayload } from '../../common/guards/permissions.guard';
import { clinicDateOnly } from '../../common/date-range.util';
import { clinicHhmm } from '../../appointments/domain/day-calendar';
import type { ListAppointmentsQueryDto } from '../../appointments/dto/appointment.dto';
import type { ReportsService } from '../../reports/reports.service';
import type { AppointmentsService } from '../../appointments/appointments.service';
import type { AvailabilityService } from '../../appointments/availability.service';
import type { PatientsService } from '../../patients/patients.service';
import type { BillingService } from '../../billing/billing.service';
import type { TreatmentPlansService } from '../../treatment-plans/treatment-plans.service';

/**
 * The tools the clinic assistant may call. Each wraps an existing service and
 * runs with the signed-in user's own permissions, so the assistant can see and
 * do nothing the user could not. Tool results go back to the model with
 * patients replaced by opaque refs (P1, P2…): the model never sees a patient's
 * name or phone, and the answer's refs are filled in by the browser.
 */

export interface Services {
  patients: PatientsService;
  availability: AvailabilityService;
  appointments: AppointmentsService;
  billing: BillingService;
  plans: TreatmentPlansService;
  reports: ReportsService;
}

/** Patients named in a conversation: ref → id (kept by the browser) and name (for display only). */
export class RefBook {
  private readonly byId = new Map<string, string>();
  private readonly ids = new Map<string, string>();
  private readonly names = new Map<string, string>();
  private next = 1;

  constructor(existing: Record<string, string> = {}) {
    for (const [ref, id] of Object.entries(existing)) {
      if (!/^P\d{1,3}$/.test(ref) || !/^[0-9a-f-]{36}$/i.test(id)) continue;
      this.ids.set(ref, id);
      this.byId.set(id, ref);
      this.next = Math.max(this.next, Number(ref.slice(1)) + 1);
    }
  }

  /** The ref for a patient, allocating one the first time. */
  refFor(id: string, name: string): string {
    let ref = this.byId.get(id);
    if (!ref) {
      ref = `P${this.next++}`;
      this.byId.set(id, ref);
      this.ids.set(ref, id);
    }
    this.names.set(ref, name);
    return ref;
  }

  idOf(ref: string): string | undefined {
    return this.ids.get(ref.trim().replace(/^\[|\]$/g, ''));
  }

  get all(): Record<string, string> {
    return Object.fromEntries(this.ids);
  }

  /** Names learned in this request only (earlier turns are already shown). */
  get learnedNames(): Record<string, string> {
    return Object.fromEntries(this.names);
  }
}

export type ChangeKind = "cancel_appointment" | "reschedule_appointment";
export interface ChangeAction {
  type: ChangeKind;
  payload: { proposalId: string };
  view: { patientRef: string; dentistName: string; startAt: string; endAt: string; reason: string | null; previousStartAt: string; previousEndAt: string; previousDentistName: string };
}
export type PendingAction = CreateAction | ChangeAction;
export interface CreateAction {
  type: 'create_appointment';
  /** What the confirm button sends. */
  payload: { patientId: string; dentistId: string; startAt: string; reason?: string };
  /** What the card shows; the patient is a ref the browser turns into a name. */
  view: { patientRef: string; dentistName: string; startAt: string; reason: string | null };
}

export interface ToolContext {
  services: Services;
  actor: JwtPayload;
  refs: RefBook;
  actions: PendingAction[];
  proposeChange?: (type: ChangeKind, args: Record<string, unknown>) => Promise<ChangeAction>;
}

export interface Tool {
  name: string;
  /** What the model reads: one line, then the arguments. */
  help: string;
  /** The caller needs at least one of these to see the tool at all. */
  anyOf: string[];
  run(args: Record<string, unknown>, ctx: ToolContext): Promise<unknown>;
}

const has = (actor: JwtPayload, perms: string[]) => perms.some(p => actor.permissions.includes(p));

function str(args: Record<string, unknown>, key: string, max = 120): string | undefined {
  const v = args[key];
  if (typeof v !== 'string') return undefined;
  const t = v.trim().slice(0, max);
  return t || undefined;
}

function count(args: Record<string, unknown>, key: string, def: number, max: number): number {
  const n = Number(args[key]);
  return Number.isFinite(n) && n >= 1 ? Math.min(Math.floor(n), max) : def;
}

function yearOf(d: Date | string | null | undefined): number | null {
  if (!d) return null;
  const y = new Date(d).getUTCFullYear();
  return Number.isFinite(y) ? y : null;
}

const money = (n: number) => Math.round(n);

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const PARTS = ['sáng', 'chiều', 'tối'] as const;
type Part = (typeof PARTS)[number];

/** "sáng" = before 12:00, "chiều" = 12:00 to 18:00, "tối" = from 18:00 (clinic time). */
function partOf(args: Record<string, unknown>): Part | undefined {
  const v = str(args, 'part', 10)?.toLowerCase();
  return PARTS.find(p => p === v);
}
const toMin = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
const PART_RANGE: Record<Part, [number, number]> = {
  sáng: [0, 12 * 60],
  chiều: [12 * 60, 18 * 60],
  tối: [18 * 60, 24 * 60],
};
/** Does [from, to) in minutes of the day touch the part of the day? */
const touches = (part: Part, from: number, to: number) =>
  from < PART_RANGE[part][1] && to > PART_RANGE[part][0];

function dateArg(args: Record<string, unknown>, key: string, fallback: string): string {
  const v = str(args, key, 10);
  if (!v) return fallback;
  if (!DATE_RE.test(v)) throw new BadRequestException(`${key} phải dạng YYYY-MM-DD`);
  return v;
}

async function dentistIdByName(name: string | undefined, ctx: ToolContext) {
  if (!name) return undefined;
  const want = name.toLowerCase();
  const rows = await ctx.services.appointments.listDentistOptions('booking');
  const hit = rows.filter(d => d.fullName.toLowerCase().includes(want));
  if (hit.length === 0) throw new BadRequestException(`Không có bác sĩ nào tên "${name}"`);
  if (hit.length > 1) {
    throw new BadRequestException(
      `Có nhiều bác sĩ khớp "${name}": ${hit.map(d => d.fullName).join(', ')}. Hãy hỏi người dùng chọn.`,
    );
  }
  return hit[0].id;
}

const changeTools: Tool[] = (['cancel_appointment', 'reschedule_appointment'] as const).map(type => ({
  name: `propose_${type}`,
  help: `Soạn thẻ ${type === 'cancel_appointment' ? 'hủy' : 'dời'} lịch, CHƯA thực hiện. Cần appointmentId từ appointments_on, reason (5-500 ký tự); dời lịch cần date YYYY-MM-DD, time HH:mm, dentistId tùy chọn. Nếu nhiều lịch, hỏi người dùng chọn; chỉ thực hiện sau khi bấm xác nhận.`,
  anyOf: [type === 'cancel_appointment' ? 'appointment.cancel' : 'appointment.update'],
  async run(args, ctx) {
    if (!ctx.proposeChange) throw new BadRequestException('Chưa có dịch vụ đề xuất');
    const card = await ctx.proposeChange(type, args);
    const appt = await ctx.services.appointments.getById(String(args.appointmentId), ctx.actor);
    card.view.patientRef = ctx.refs.refFor(appt.patient.id, appt.patient.fullName);
    ctx.actions.push(card);
    return { status: 'waiting_for_user_confirmation', note: 'CHƯA thay đổi lịch; người dùng phải xác nhận trên thẻ.' };
  },
}));

export const TOOLS: Tool[] = [
  ...changeTools,
  {
    name: 'find_patient',
    help: 'Tìm bệnh nhân theo tên hoặc số điện thoại người dùng vừa nêu. Tham số: {"name"?: string, "phone"?: string}. Trả về tối đa 5 bệnh nhân, mỗi người là một mã ref (P1, P2…) kèm giới tính, năm sinh, lần khám gần nhất; KHÔNG có tên.',
    anyOf: ['patient.read'],
    async run(args, ctx) {
      const name = str(args, 'name');
      const phone = str(args, 'phone', 20);
      if (!name && !phone) throw new BadRequestException('Cần tên hoặc số điện thoại');
      const res = await ctx.services.patients.lookup({ name, phone, limit: 5 }, ctx.actor);
      return {
        patients: res.candidates.map(c => ({
          ref: ctx.refs.refFor(c.id, c.fullName),
          gender: c.gender,
          birthYear: yearOf(c.dob),
          lastVisit: c.lastVisitAt ? new Date(c.lastVisitAt).toISOString().slice(0, 10) : null,
        })),
      };
    },
  },
  {
    name: 'free_slots',
    help: 'Xem giờ còn trống của các bác sĩ trong một ngày. Tham số: {"date": "YYYY-MM-DD", "dentist"?: tên bác sĩ (một phần), "durationMin"?: số phút}. Trả về từng bác sĩ (có dentistId) với các giờ bắt đầu HH:mm (giờ Việt Nam).',
    anyOf: ['appointment.read.any', 'appointment.create'],
    async run(args, ctx) {
      const date = str(args, 'date', 10);
      if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        throw new BadRequestException('date phải dạng YYYY-MM-DD');
      }
      const durationMin = Number(args.durationMin);
      const found = await ctx.services.availability.search({
        date,
        ...(Number.isFinite(durationMin) && durationMin >= 5 && durationMin <= 240
          ? { durationMin: Math.floor(durationMin) }
          : {}),
      });
      const want = str(args, 'dentist')?.toLowerCase();
      const rows = found.filter(d => !want || d.fullName.toLowerCase().includes(want));
      return {
        date,
        dentists: rows.slice(0, 8).map(d => ({
          dentistId: d.dentistId,
          name: d.fullName,
          durationMin: d.durationMin,
          slots: d.availableSlots.slice(0, 12),
          moreSlots: Math.max(0, d.availableSlots.length - 12),
        })),
        note: rows.length === 0 ? 'Không còn giờ trống (hoặc không có bác sĩ phù hợp).' : undefined,
      };
    },
  },
  {
    name: 'pending_treatments',
    help: 'Bệnh nhân đã đồng ý kế hoạch điều trị nhưng chưa đặt lịch (chờ lâu nhất trước). Tham số: {"limit"?: số, tối đa 10}. Mỗi dòng: ref, việc cần làm, bác sĩ lập kế hoạch, số ngày chờ, giá trị, lịch hẹn kế (nếu có).',
    anyOf: ['treatment_plan.read'],
    async run(args, ctx) {
      const limit = count(args, 'limit', 5, 10);
      const { summary, rows } = await ctx.services.plans.pendingTreatments(ctx.actor);
      const waiting = rows.filter(r => !r.nextAppointmentAt);
      return {
        summary,
        patients: waiting.slice(0, limit).map(r => ({
          ref: ctx.refs.refFor(r.patientId, r.patientName),
          procedures: r.procedures,
          dentist: r.dentistName,
          waitingDays: r.waitingDays,
          value: money(r.value),
        })),
        withoutAppointmentTotal: waiting.length,
      };
    },
  },
  {
    name: 'unpaid_invoices',
    help: 'Hóa đơn còn nợ (đã phát hành hoặc thanh toán một phần). Tham số: {"limit"?: số, tối đa 10}. Mỗi dòng: ref, mã hóa đơn, còn nợ.',
    anyOf: ['invoice.read.any', 'invoice.read.own'],
    async run(args, ctx) {
      const limit = count(args, 'limit', 5, 10);
      const res = await ctx.services.billing.listInvoices({
        status: [InvoiceStatus.ISSUED, InvoiceStatus.PARTIAL],
        pageSize: limit,
        actor: ctx.actor,
      });
      return {
        invoiceCount: res.summary.invoiceCount,
        totalOutstanding: money(res.summary.totalOutstanding),
        invoices: res.data.map(inv => ({
          ref: ctx.refs.refFor(inv.patientId, inv.patientName ?? ''),
          code: inv.code,
          outstanding: money(inv.outstandingAmount),
          issuedAt: inv.issuedAt ? new Date(inv.issuedAt).toISOString().slice(0, 10) : null,
        })),
      };
    },
  },
  {
    name: 'appointments_on',
    help: 'Danh sách lịch hẹn theo ngày. Tham số: {"date"?: "YYYY-MM-DD" (mặc định hôm nay), "toDate"?: ngày cuối (tối đa 14 ngày), "part"?: "sáng"|"chiều"|"tối", "dentist"?: tên bác sĩ, "status"?: SCHEDULED|CONFIRMED|CHECKED_IN|IN_PROGRESS|COMPLETED|CANCELLED|NO_SHOW, "patientRef"?: "P1"}. Trả về số lượng theo trạng thái và tối đa 25 lịch (giờ, ref bệnh nhân, bác sĩ, trạng thái, loại).',
    anyOf: ['appointment.read.any', 'appointment.read.own'],
    async run(args, ctx) {
      const today = clinicDateOnly();
      const from = dateArg(args, 'date', today);
      const to = dateArg(args, 'toDate', from);
      if (to < from || Date.parse(to) - Date.parse(from) > 14 * 86_400_000) {
        throw new BadRequestException('Khoảng ngày không hợp lệ (tối đa 14 ngày)');
      }
      const patientRef = str(args, 'patientRef', 8);
      const patientId = patientRef ? ctx.refs.idOf(patientRef) : undefined;
      if (patientRef && !patientId) {
        throw new BadRequestException('patientRef chưa có: hãy gọi find_patient trước');
      }
      const status = str(args, 'status', 12)?.toUpperCase();
      const dentistId = await dentistIdByName(str(args, 'dentist'), ctx);
      const part = partOf(args);
      const res = await ctx.services.appointments.list(
        {
          from,
          to,
          pageSize: 50,
          sort: 'asc',
          ...(patientId ? { patientId } : {}),
          ...(dentistId ? { dentistId } : {}),
          ...(status ? { status: [status] } : {}),
        } as unknown as ListAppointmentsQueryDto,
        ctx.actor,
      );
      const rows = res.data.filter(a => {
        if (!part) return true;
        const m = toMin(clinicHhmm(a.startAt));
        return touches(part, m, m + 1);
      });
      const byStatus: Record<string, number> = {};
      for (const a of rows) byStatus[a.status] = (byStatus[a.status] ?? 0) + 1;
      return {
        from,
        to,
        part: part ?? null,
        total: rows.length,
        moreThanShown: res.pagination.hasMore,
        byStatus,
        appointments: rows.slice(0, 25).map(a => ({
          appointmentId: a.id,
          date: clinicDateOnly(a.startAt),
          time: clinicHhmm(a.startAt),
          patient: ctx.refs.refFor(a.patient.id, a.patient.fullName),
          dentist: a.dentist?.fullName ?? null,
          status: a.status,
          type: a.appointmentType,
        })),
      };
    },
  },
  {
    name: 'dentist_hours',
    help: 'Ca làm việc của bác sĩ trong một ngày (ai có ca, giờ nào, ai nghỉ). Tham số: {"date"?: "YYYY-MM-DD" (mặc định hôm nay), "part"?: "sáng"|"chiều"|"tối", "dentist"?: tên bác sĩ}. Trả về từng bác sĩ với các khung giờ làm HH:mm-HH:mm và ghi chú nghỉ phép hoặc phòng khám đóng cửa.',
    anyOf: ['appointment.read.any', 'appointment.create'],
    async run(args, ctx) {
      const date = dateArg(args, 'date', clinicDateOnly());
      const part = partOf(args);
      const want = str(args, 'dentist')?.toLowerCase();
      const all = await ctx.services.appointments.listDentistOptions('booking');
      const rows = all.filter(d => !want || d.fullName.toLowerCase().includes(want));
      const cals = await Promise.all(
        rows.map(async d => ({ d, cal: await ctx.services.availability.loadDay(d.id, date) })),
      );
      const dentists = cals.map(({ d, cal }) => {
        const windows = cal.windows
          .map(w => ({ from: clinicHhmm(w.start), to: clinicHhmm(w.end) }))
          .filter(w => !part || touches(part, toMin(w.from), toMin(w.to) || 24 * 60));
        const note = cal.clinicClosed
          ? `Phòng khám đóng cửa${cal.closedReason ? `: ${cal.closedReason}` : ''}`
          : cal.closedAllDay
            ? `Nghỉ cả ngày${cal.closedReason ? `: ${cal.closedReason}` : ''}`
            : cal.blocked.some(b => b.kind === 'TIME_OFF')
              ? 'Có giờ nghỉ phép trong ngày'
              : undefined;
        return {
          name: d.fullName,
          working: windows.length > 0 && !cal.closedAllDay,
          hours: windows.map(w => `${w.from}-${w.to}`),
          note,
        };
      });
      return {
        date,
        part: part ?? null,
        working: dentists.filter(x => x.working).map(x => x.name),
        dentists,
      };
    },
  },
  {
    name: 'waiting_now',
    help: 'Bệnh nhân đã check-in và đang chờ khám hôm nay. Tham số: {"dentist"?: tên bác sĩ}. Mỗi dòng: ref, giờ hẹn, số phút đã chờ.',
    anyOf: ['appointment.read.any', 'appointment.read.own'],
    async run(args, ctx) {
      const dentistId = await dentistIdByName(str(args, 'dentist'), ctx);
      const { data } = await ctx.services.appointments.getWaitingQueue(
        dentistId,
        undefined,
        ctx.actor,
      );
      return {
        waiting: data.length,
        patients: data.slice(0, 15).map(r => ({
          ref: ctx.refs.refFor(r.patient.id, r.patient.fullName),
          bookedAt: clinicHhmm(r.appointmentStartAt),
          waitingMinutes: r.waitingMinutes,
        })),
      };
    },
  },
  {
    name: 'report_summary',
    help: 'Số liệu tổng của một khoảng ngày: số bệnh nhân, số lịch hẹn, doanh thu điều trị, đã thu, và so với kỳ trước. Tham số: {"from"?: "YYYY-MM-DD", "to"?: "YYYY-MM-DD"} (mặc định 30 ngày gần nhất). Chỉ có số tổng.',
    anyOf: ['report.revenue.read'],
    async run(args, ctx) {
      const to = dateArg(args, 'to', clinicDateOnly());
      const from = dateArg(
        args,
        'from',
        clinicDateOnly(new Date(Date.parse(to) - 29 * 86_400_000)),
      );
      const k = await ctx.services.reports.dashboardKpis({ from, to });
      return {
        from,
        to,
        patients: {
          total: k.patients.total,
          new: k.patients.newCount,
          vsPrevPercent: k.patients.pctChange,
        },
        appointments: {
          total: k.appointments.total,
          arrived: k.appointments.arrived,
          cancelled: k.appointments.cancelled,
          vsPrevPercent: k.appointments.pctChange,
        },
        treatmentRevenue: {
          total: money(k.treatmentRevenue.total),
          vsPrevPercent: k.treatmentRevenue.pctChange,
        },
        collected: { total: money(k.collected.total), vsPrevPercent: k.collected.pctChange },
      };
    },
  },
  {
    name: 'propose_appointment',
    help: 'Soạn đề xuất đặt lịch (CHƯA đặt): người dùng sẽ bấm xác nhận trên thẻ. Tham số: {"patientRef": "P1", "dentistId": id lấy từ free_slots, "date": "YYYY-MM-DD", "time": "HH:mm" (phải là một giờ trống từ free_slots), "reason"?: string}.',
    anyOf: ['appointment.create'],
    async run(args, ctx) {
      const patientId = ctx.refs.idOf(String(args.patientRef ?? ''));
      if (!patientId) {
        throw new BadRequestException('patientRef chưa có: hãy gọi find_patient trước');
      }
      const dentistId = str(args, 'dentistId', 40);
      const date = str(args, 'date', 10);
      const time = str(args, 'time', 5);
      if (!dentistId || !date || !time || !/^\d{2}:\d{2}$/.test(time)) {
        throw new BadRequestException('Cần dentistId, date (YYYY-MM-DD) và time (HH:mm)');
      }
      if (date < clinicDateOnly()) throw new BadRequestException('Ngày đã qua');
      const free = await ctx.services.availability.search({ date });
      const dentist = free.find(d => d.dentistId === dentistId);
      if (!dentist || !dentist.availableSlots.includes(time)) {
        throw new BadRequestException(
          `Giờ ${time} ngày ${date} không còn trống với bác sĩ này; hãy gọi free_slots và chọn giờ khác`,
        );
      }
      const startAt = `${date}T${time}:00+07:00`;
      const reason = str(args, 'reason', 200);
      const patientRef = ctx.refs.idOf(String(args.patientRef)) ? String(args.patientRef) : '';
      ctx.actions.push({
        type: 'create_appointment',
        payload: { patientId, dentistId, startAt, ...(reason ? { reason } : {}) },
        view: {
          patientRef: patientRef.replace(/^\[|\]$/g, ''),
          dentistName: dentist.fullName,
          startAt,
          reason: reason ?? null,
        },
      });
      return {
        status: 'waiting_for_user_confirmation',
        note: 'Đã hiện thẻ xác nhận cho người dùng. CHƯA có lịch hẹn nào được tạo; đừng nói là đã đặt.',
      };
    },
  },
];

/** The tools this user may use, in a stable order. */
export function toolsFor(actor: JwtPayload): Tool[] {
  return TOOLS.filter(t => has(actor, t.anyOf));
}

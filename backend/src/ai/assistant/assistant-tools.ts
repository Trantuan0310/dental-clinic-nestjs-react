import { BadRequestException } from '@nestjs/common';
import { InvoiceStatus } from '@prisma/client';
import type { JwtPayload } from '../../common/guards/permissions.guard';
import { clinicDateOnly } from '../../common/date-range.util';
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

export interface PendingAction {
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

export const TOOLS: Tool[] = [
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

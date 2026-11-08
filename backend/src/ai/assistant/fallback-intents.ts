/**
 * Answers for the commonest questions when the AI model is not available
 * (not configured, blocked by the gateway, down): the keywords pick a lookup
 * tool and a template writes the answer. The assistant stays useful, the
 * answer says it is the plain version, and nothing is ever written.
 */
import { clinicDateOnly } from '../../common/date-range.util';

export interface Intent {
  tool: string;
  args: Record<string, unknown>;
}

/** Lower case without diacritics, so "Chưa đặt lịch" and "chua dat lich" match alike. */
export function plain(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'd')
    .toLowerCase();
}

function dayOf(t: string, now: Date): string {
  const today = clinicDateOnly(now);
  if (/\b(ngay )?mai\b/.test(t)) return clinicDateOnly(new Date(now.getTime() + 86_400_000));
  return today;
}

function partOf(t: string): string | undefined {
  if (/\bsang\b/.test(t)) return 'sáng';
  if (/\bchieu\b/.test(t)) return 'chiều';
  if (/\btoi\b/.test(t)) return 'tối';
  return undefined;
}

export function matchIntent(text: string, now: Date = new Date()): Intent | null {
  const t = plain(text);
  const date = dayOf(t, now);
  const part = partOf(t);
  if (/(chua dat lich|cho dat lich|dieu tri.*chua|chua quay lai)/.test(t)) {
    return { tool: 'pending_treatments', args: { limit: 5 } };
  }
  if (/(con no|cong no|no tien|hoa don.*no|chua thanh toan|chua thu)/.test(t)) {
    return { tool: 'unpaid_invoices', args: { limit: 5 } };
  }
  if (/(ca lam|lich lam|bac si nao.*(lam|co ca)|ai lam|ai co ca)/.test(t)) {
    return { tool: 'dentist_hours', args: { date, ...(part ? { part } : {}) } };
  }
  if (/(dang cho|hang cho|ai cho kham)/.test(t)) return { tool: 'waiting_now', args: {} };
  if (/(doanh thu|bao cao|thu duoc|tong ket)/.test(t)) return { tool: 'report_summary', args: {} };
  if (/(gio trong|con trong|trong gio)/.test(t)) return { tool: 'free_slots', args: { date } };
  if (/(lich hen|lich kham|cuoc hen|co ai hen|hen vao)/.test(t)) {
    return { tool: 'appointments_on', args: { date, ...(part ? { part } : {}) } };
  }
  return null;
}

// ---------------------------------------------------------------- rendering

const vnd = (n: unknown) => `${Number(n ?? 0).toLocaleString('vi-VN')} ₫`;
const dm = (iso: unknown) => {
  const [, m, d] = String(iso).split('-');
  return d && m ? `${d}/${m}` : String(iso);
};
const STATUS: Record<string, string> = {
  SCHEDULED: 'đã đặt',
  CONFIRMED: 'đã xác nhận',
  CHECKED_IN: 'đã đến',
  IN_PROGRESS: 'đang khám',
  COMPLETED: 'đã khám xong',
  CANCELLED: 'đã hủy',
  NO_SHOW: 'vắng mặt',
  LEFT: 'về trước khi khám',
};

type R = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

/** The answer for a tool result; patients stay as [P1] for the browser to fill in. */
export function renderResult(tool: string, r: R): string {
  switch (tool) {
    case 'pending_treatments': {
      const n = r.withoutAppointmentTotal ?? 0;
      if (n === 0) return 'Không có bệnh nhân nào đã đồng ý điều trị mà chưa đặt lịch.';
      const lines = (r.patients as R[]).map(
        p => `- [${p.ref}]: ${p.procedures.join(', ')}, chờ ${p.waitingDays} ngày, ${vnd(p.value)}`,
      );
      return `Có ${n} bệnh nhân đã đồng ý điều trị mà chưa đặt lịch. Chờ lâu nhất:\n${lines.join('\n')}`;
    }
    case 'unpaid_invoices': {
      if (!r.invoiceCount) return 'Hiện không có hóa đơn nào còn nợ.';
      const lines = (r.invoices as R[]).map(
        i => `- [${i.ref}] ${i.code}: còn ${vnd(i.outstanding)}`,
      );
      return `Còn ${r.invoiceCount} hóa đơn chưa thu đủ, tổng ${vnd(r.totalOutstanding)}:\n${lines.join('\n')}`;
    }
    case 'dentist_hours': {
      const names = (r.working as string[]) ?? [];
      const head = `Ngày ${dm(r.date)}${r.part ? ` (buổi ${r.part})` : ''}: `;
      if (names.length === 0) return `${head}không có bác sĩ nào có ca làm.`;
      const lines = (r.dentists as R[])
        .filter(d => d.working)
        .map(d => `- ${d.name}: ${d.hours.join(', ')}${d.note ? ` (${d.note})` : ''}`);
      return `${head}${names.length} bác sĩ có ca làm:\n${lines.join('\n')}`;
    }
    case 'waiting_now': {
      if (!r.waiting) return 'Hiện không có bệnh nhân nào đang chờ khám.';
      const lines = (r.patients as R[]).map(
        p => `- [${p.ref}] hẹn ${p.bookedAt}, đã chờ ${p.waitingMinutes} phút`,
      );
      return `Đang có ${r.waiting} bệnh nhân chờ khám:\n${lines.join('\n')}`;
    }
    case 'report_summary':
      return (
        `Từ ${dm(r.from)} đến ${dm(r.to)}: ${r.patients.total} bệnh nhân (${r.patients.new} mới), ` +
        `${r.appointments.total} lịch hẹn (${r.appointments.arrived} đã đến, ${r.appointments.cancelled} hủy), ` +
        `doanh thu điều trị ${vnd(r.treatmentRevenue.total)}, đã thu ${vnd(r.collected.total)}.`
      );
    case 'free_slots': {
      const ds = (r.dentists as R[]) ?? [];
      if (ds.length === 0) return `Ngày ${dm(r.date)} không còn giờ trống.`;
      const lines = ds.map(
        d =>
          `- ${d.name}: ${d.slots.join(', ')}${d.moreSlots ? ` (và ${d.moreSlots} giờ nữa)` : ''}`,
      );
      return `Giờ còn trống ngày ${dm(r.date)}:\n${lines.join('\n')}`;
    }
    case 'appointments_on': {
      const where = `${dm(r.from)}${r.to !== r.from ? `-${dm(r.to)}` : ''}${r.part ? ` (buổi ${r.part})` : ''}`;
      if (!r.total) return `Không có lịch hẹn nào ${where}.`;
      const lines = (r.appointments as R[]).map(
        a =>
          `- ${a.date !== r.from ? `${dm(a.date)} ` : ''}${a.time} [${a.patient}], ${a.dentist ?? ''}: ${STATUS[a.status] ?? a.status}`,
      );
      return `Có ${r.total} lịch hẹn ${where}:\n${lines.join('\n')}`;
    }
    default:
      return 'Đã tra cứu xong nhưng chưa có mẫu trả lời cho kết quả này.';
  }
}

export const FALLBACK_NOTICE = 'AI chưa dùng được, đây là câu trả lời theo mẫu.';
export const FALLBACK_HELP =
  'AI chưa dùng được nên mình chỉ trả lời được vài câu cơ bản, ví dụ: "ai chưa đặt lịch điều trị", "hóa đơn nào còn nợ", "sáng nay có lịch hẹn nào", "bác sĩ nào có ca làm hôm nay", "ai đang chờ khám", "doanh thu tháng này".';

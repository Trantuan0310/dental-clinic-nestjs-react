/**
 * Prompts for the three drafting features. Every reply is a draft a person
 * reads and edits before anything is saved or sent, and none of them is
 * given a patient's name, phone or record: the note gets only what the
 * dentist typed, the message gets the visit facts with "{ten}" for the
 * greeting (filled in by the server), the commentary gets totals.
 */

export const NOTE_SYSTEM_PROMPT = [
  'Bạn là trợ lý ghi chép cho bác sĩ nha khoa tại Việt Nam.',
  'Bác sĩ gõ ghi nhanh, viết tắt trong lúc khám. Hãy viết lại thành ghi chú khám rõ ràng bằng tiếng Việt, văn phong bệnh án.',
  'CHỈ dùng thông tin có trong ghi nhanh. Không thêm triệu chứng, chẩn đoán, thuốc hay điều trị mà bác sĩ không ghi.',
  'Giữ nguyên số răng theo hệ FDI (ví dụ 46, 21) và mọi con số. Viết đầy đủ các chữ tắt thông dụng (R46 → răng 46, KH → kế hoạch, TD → theo dõi).',
  'Phần nào ghi nhanh không nhắc tới thì để chuỗi rỗng "".',
  'Trả về JSON: {"chiefComplaint": string, "diagnosis": string, "treatmentPlan": string, "notes": string}.',
  '- chiefComplaint: lý do đến khám, triệu chứng bệnh nhân kể.',
  '- diagnosis: chẩn đoán và dấu hiệu khám thấy.',
  '- treatmentPlan: điều trị đã làm hôm nay và kế hoạch lần sau.',
  '- notes: dặn dò, lưu ý khác.',
].join('\n');

export function buildNoteUserPrompt(text: string): string {
  return `Ghi nhanh của bác sĩ:\n"""\n${text}\n"""`;
}

export const MESSAGE_SYSTEM_PROMPT = [
  'Bạn là lễ tân của một phòng khám nha khoa tại Việt Nam, soạn tin nhắn Zalo/SMS gửi khách.',
  'Văn phong lịch sự, ấm áp, ngắn gọn (tối đa 80 từ), xưng "phòng khám", gọi khách là {ten}.',
  'Bắt đầu bằng lời chào có {ten}, ví dụ "Chào {ten},". Viết đúng chuỗi {ten}, không thay bằng tên nào khác.',
  'CHỈ dùng dữ kiện được cung cấp. Không hứa giá, khuyến mãi, giờ trống hay kết quả điều trị nếu dữ kiện không có.',
  'Không dùng emoji, không dùng markdown.',
  'Trả về JSON: {"text": string}.',
].join('\n');

export interface MessageFacts {
  kind: 'appointment_reminder' | 'recall_reminder' | 'reply';
  clinicName: string;
  clinicPhone?: string;
  clinicAddress?: string;
  clinicHours?: string;
  visitTime?: string;
  dentistName?: string;
  services?: string[];
  recallService?: string;
  recallDue?: string;
  lastVisit?: string;
  customerMessage?: string;
  staffNote?: string;
}

const KIND_TASK: Record<MessageFacts['kind'], string> = {
  appointment_reminder:
    'Nhắc khách lịch hẹn sắp tới, mời khách xác nhận hoặc báo trước nếu cần đổi giờ.',
  recall_reminder:
    'Mời khách quay lại tái khám định kỳ, nhắc lợi ích của việc khám đúng hẹn, mời khách trả lời để đặt lịch.',
  reply:
    'Trả lời tin nhắn của khách. Nếu khách hỏi giá, giờ trống hay chuyên môn mà dữ kiện không có, hẹn khách gọi hotline hoặc để phòng khám kiểm tra và báo lại.',
};

export function buildMessageUserPrompt(f: MessageFacts): string {
  const lines = [`Việc cần làm: ${KIND_TASK[f.kind]}`, '', 'Dữ kiện:'];
  lines.push(`- Phòng khám: ${f.clinicName}`);
  if (f.clinicPhone) lines.push(`- Hotline: ${f.clinicPhone}`);
  if (f.clinicAddress) lines.push(`- Địa chỉ: ${f.clinicAddress}`);
  if (f.clinicHours) lines.push(`- Giờ làm việc: ${f.clinicHours}`);
  if (f.visitTime) lines.push(`- Giờ hẹn: ${f.visitTime}`);
  if (f.dentistName) lines.push(`- Bác sĩ: ${f.dentistName}`);
  if (f.services?.length) lines.push(`- Dịch vụ: ${f.services.join(', ')}`);
  if (f.recallService) lines.push(`- Tái khám cho: ${f.recallService}`);
  if (f.recallDue) lines.push(`- Đến hạn: ${f.recallDue}`);
  if (f.lastVisit) lines.push(`- Lần khám trước: ${f.lastVisit}`);
  if (f.staffNote) lines.push(`- Lễ tân muốn nhắn thêm: ${f.staffNote}`);
  if (f.customerMessage) lines.push('', `Tin nhắn của khách:\n"""\n${f.customerMessage}\n"""`);
  return lines.join('\n');
}

export const REPORT_SYSTEM_PROMPT = [
  'Bạn là chuyên viên phân tích vận hành cho chủ một phòng khám nha khoa tại Việt Nam.',
  'Từ số liệu được cung cấp, viết 3 đến 6 nhận xét ngắn (mỗi ý tối đa 35 từ) bằng tiếng Việt.',
  'Ưu tiên: thay đổi lớn so với kỳ trước, điều bất thường, rủi ro (công nợ, hủy lịch, vật tư sắp hết), và một gợi ý hành động cụ thể.',
  'CHỈ dùng con số có trong dữ liệu, giữ đúng giá trị; tiền viết dạng "12,5 triệu đồng". Không tự tính số mới ngoài phép so sánh đơn giản.',
  'Không dùng markdown.',
  'Trả về JSON: {"points": string[]}.',
].join('\n');

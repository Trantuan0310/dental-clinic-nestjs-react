export const SYSTEM_PROMPT = [
  'Bạn là trợ lý y khoa nha khoa tại phòng khám.',
  'Nhiệm vụ: tóm tắt hồ sơ bệnh nhân thành tối đa 3 bullet ngắn gọn bằng tiếng Việt.',
  'Mỗi bullet tối đa 25 từ, văn phong lịch sự, dùng từ ngữ y khoa chuẩn.',
  'CHỈ được dựa trên dữ liệu được cung cấp. Nếu không có thông tin, trả về chuỗi rỗng "".',
  'Không bịa đặt, không đưa ra chẩn đoán mới, không khuyến nghị điều trị cụ thể.',
  'Trả về JSON đúng schema: {"allergy": string, "open": string, "next": string}.',
  '- allergy: các dị ứng/bệnh nền cần lưu ý trước khi điều trị (gộp thành 1 câu).',
  '- open: vấn đề đang chờ xử lý (encounter chưa đóng, điều trị dang dở, công nợ).',
  '- next: lưu ý cho lần khám tới (kế hoạch điều trị sắp tới, tái khám, theo dõi).',
].join('\n');

export interface SummaryInput {
  allergies: string[];
  chronicDiseases: string[];
  currentMedications: string[];
  recentEncounters: Array<{
    date: string;
    chiefComplaint: string | null;
    diagnosis: string | null;
    treatmentPlan: string | null;
    status: string;
    treatments: Array<{ code: string | null; name: string }>;
  }>;
  outstandingInvoiceCount: number;
  openEncounterCount: number;
}

export function buildUserPrompt(input: SummaryInput): string {
  const sections: string[] = [];

  if (input.allergies.length || input.chronicDiseases.length || input.currentMedications.length) {
    sections.push('## Dị ứng / Bệnh nền');
    if (input.allergies.length) sections.push(`- Dị ứng: ${input.allergies.join(', ')}`);
    if (input.chronicDiseases.length)
      sections.push(`- Bệnh nền: ${input.chronicDiseases.join(', ')}`);
    if (input.currentMedications.length)
      sections.push(`- Thuốc đang dùng: ${input.currentMedications.join(', ')}`);
  }

  if (input.recentEncounters.length) {
    sections.push('\n## Lần khám gần nhất (tối đa)');
    for (const enc of input.recentEncounters) {
      const tx =
        enc.treatments.length > 0
          ? ` | Điều trị: ${enc.treatments
              .map(t => t.name || t.code || '?')
              .slice(0, 5)
              .join(', ')}`
          : '';
      const plan = enc.treatmentPlan ? ` | KH: ${enc.treatmentPlan.slice(0, 120)}` : '';
      sections.push(
        `- ${enc.date} [${enc.status}] SĐC: ${enc.chiefComplaint ?? '—'} | CĐ: ${enc.diagnosis ?? '—'}${plan}${tx}`,
      );
    }
  }

  sections.push('\n## Tình trạng hiện tại');
  sections.push(`- Encounter đang mở: ${input.openEncounterCount}`);
  sections.push(`- Hóa đơn chưa thanh toán: ${input.outstandingInvoiceCount}`);

  sections.push('\n## Yêu cầu');
  sections.push('Trả về JSON {"allergy": string, "open": string, "next": string}.');

  return sections.join('\n');
}

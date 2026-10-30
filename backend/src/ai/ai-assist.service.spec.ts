import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { EncounterStatus, Gender } from '@prisma/client';
import {
  AiAssistService,
  fallbackCommentary,
  fillGreeting,
  ReportFacts,
  salutation,
  vndText,
} from './ai-assist.service';

const dentist = {
  sub: 'dentist-1',
  email: 'bs@example.invalid',
  permissions: ['clinical_note.write', 'encounter.read.own', 'appointment.read.own'],
};
const desk = {
  sub: 'desk-1',
  email: 'lt@example.invalid',
  permissions: ['appointment.read.any', 'recall.manage', 'patient.update'],
};

function setup() {
  const prisma = {
    encounter: { findUnique: jest.fn() },
    appointment: { findFirst: jest.fn() },
    recall: { findUnique: jest.fn() },
    inventoryItem: { count: jest.fn().mockResolvedValue(2), fields: { minStockLevel: 'min' } },
  };
  const cache = { getJSON: jest.fn().mockResolvedValue(null), setJSON: jest.fn() };
  const audit = { log: jest.fn() };
  const reports = {
    dashboardKpis: jest.fn().mockResolvedValue({
      patients: { total: 40, newCount: 12, returningCount: 28, pctChange: 25, sparkline: [] },
      appointments: { total: 50, arrived: 40, cancelled: 5, pctChange: 10 },
      treatmentRevenue: { total: 125_500_000, pctChange: -12.5 },
      collected: { total: 98_000_000, pctChange: 3 },
    }),
    financeSummary: jest.fn().mockResolvedValue({
      totalIncome: 98_000_000,
      totalExpense: 40_000_000,
      payrollPaid: 30_000_000,
    }),
    outstandingSummary: jest.fn().mockResolvedValue({ totalDebt: 7_200_000, invoiceCount: 3 }),
    revenueByProcedure: jest
      .fn()
      .mockResolvedValue([{ procedure: 'Niềng răng', revenue: 60_000_000, count: 2 }]),
    revenueByDentist: jest
      .fn()
      .mockResolvedValue([
        { dentistId: 'd1', dentistName: 'BS Hạnh', revenue: 80_000_000, percentage: 64, count: 30 },
      ]),
  };
  const model = { tryJson: jest.fn().mockResolvedValue(null) };
  const service = new AiAssistService(
    prisma as any,
    cache as any,
    audit as any,
    reports as any,
    model as any,
  );
  return { service, prisma, cache, audit, reports, model };
}

describe('AiAssistService', () => {
  describe('draftNote (bác sĩ)', () => {
    const open = { id: 'enc-1', dentistId: 'dentist-1', status: EncounterStatus.IN_PROGRESS };

    it('splits the quick note into the four sections from the model', async () => {
      const { service, prisma, model, audit } = setup();
      prisma.encounter.findUnique.mockResolvedValue(open);
      model.tryJson.mockResolvedValue({
        source: 'llm',
        model: 'm',
        data: {
          chiefComplaint: 'Đau răng 46 ba ngày',
          diagnosis: 'Sâu ngà răng 46',
          treatmentPlan: 'Hàn composite răng 46',
          notes: '',
        },
      });
      const draft = await service.draftNote(
        'enc-1',
        'dau R46 3 ngay, sau nga, han composite',
        dentist,
      );
      expect(draft).toMatchObject({
        chiefComplaint: 'Đau răng 46 ba ngày',
        diagnosis: 'Sâu ngà răng 46',
        treatmentPlan: 'Hàn composite răng 46',
        notes: '',
        source: 'llm',
      });
      // Only what the dentist typed goes to the model.
      expect(model.tryJson.mock.calls[0][2]).toContain('dau R46 3 ngay');
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'AI_NOTE_DRAFTED', targetId: 'enc-1' }),
      );
    });

    it('keeps the typed text as a progress note when no model answers', async () => {
      const { service, prisma } = setup();
      prisma.encounter.findUnique.mockResolvedValue(open);
      const draft = await service.draftNote('enc-1', 'TD sau 1 tuan', dentist);
      expect(draft).toMatchObject({ notes: 'TD sau 1 tuan', diagnosis: '', source: 'fallback' });
    });

    it("hides another dentist's encounter", async () => {
      const { service, prisma } = setup();
      prisma.encounter.findUnique.mockResolvedValue({ ...open, dentistId: 'other' });
      await expect(service.draftNote('enc-1', 'abc', dentist)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('refuses a closed encounter (addendums only)', async () => {
      const { service, prisma, model } = setup();
      prisma.encounter.findUnique.mockResolvedValue({ ...open, status: EncounterStatus.COMPLETED });
      await expect(service.draftNote('enc-1', 'abc', dentist)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(model.tryJson).not.toHaveBeenCalled();
    });
  });

  describe('draftMessage (lễ tân)', () => {
    const appt = {
      id: 'appt-1',
      startAt: new Date('2026-11-01T07:00:00Z'),
      dentistId: 'd1',
      dentist: { fullName: 'BS Hạnh' },
      services: [{ serviceName: 'Cạo vôi răng' }],
      patient: { fullName: 'Nguyễn Thị Lan', gender: Gender.FEMALE, primaryPhone: '0912345678' },
    };

    it('drafts a reminder without giving the model the patient name or phone', async () => {
      const { service, prisma, model } = setup();
      prisma.appointment.findFirst.mockResolvedValue(appt);
      model.tryJson.mockResolvedValue({
        source: 'llm',
        model: 'm',
        data: { text: '{ten} ơi, phòng khám nhắc lịch 14:00. Hẹn gặp {ten}!' },
      });
      const draft = await service.draftMessage(
        { kind: 'appointment_reminder', appointmentId: 'appt-1' },
        desk,
      );
      expect(draft.text).toBe('Chị Lan ơi, phòng khám nhắc lịch 14:00. Hẹn gặp chị Lan!');
      expect(draft.phone).toBe('0912345678');
      const prompt = model.tryJson.mock.calls[0][2] as string;
      expect(prompt).toContain('14:00');
      expect(prompt).toContain('Cạo vôi răng');
      expect(prompt).not.toContain('Lan');
      expect(prompt).not.toContain('0912345678');
    });

    it('falls back to a fixed sentence with the same facts', async () => {
      const { service, prisma } = setup();
      prisma.appointment.findFirst.mockResolvedValue(appt);
      const draft = await service.draftMessage(
        { kind: 'appointment_reminder', appointmentId: 'appt-1' },
        desk,
      );
      expect(draft.source).toBe('fallback');
      expect(draft.text).toMatch(
        /^Chào chị Lan, .*14:00 Chủ nhật 01\/11\/2026 với BS Hạnh \(Cạo vôi răng\)/,
      );
    });

    it('replies to the patient of the appointment the desk has open', async () => {
      const { service, prisma, model } = setup();
      prisma.appointment.findFirst.mockResolvedValue(appt);
      const draft = await service.draftMessage(
        { kind: 'reply', appointmentId: 'appt-1', customerMessage: 'Niềng răng giá bao nhiêu?' },
        desk,
      );
      expect(draft.text).toMatch(/^Chào chị Lan, /);
      expect(draft.phone).toBe('0912345678');
      const prompt = model.tryJson.mock.calls[0][2] as string;
      expect(prompt).toContain('Trả lời tin nhắn của khách');
      expect(prompt).toContain('Niềng răng giá bao nhiêu?');
    });

    it('needs a recall permission for a recall reminder', async () => {
      const { service } = setup();
      await expect(
        service.draftMessage(
          { kind: 'recall_reminder', recallId: 'r1' },
          { ...desk, permissions: ['appointment.read.any'] },
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('needs the customer message to draft a reply', async () => {
      const { service } = setup();
      await expect(service.draftMessage({ kind: 'reply' }, desk)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('hides an appointment outside a row-scoped caller', async () => {
      const { service, prisma } = setup();
      prisma.appointment.findFirst.mockResolvedValue(appt);
      await expect(
        service.draftMessage({ kind: 'appointment_reminder', appointmentId: 'appt-1' }, dentist),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('reportCommentary (quản lý)', () => {
    it('comments on totals only and caches the result', async () => {
      const { service, model, cache } = setup();
      model.tryJson.mockResolvedValue({
        source: 'llm',
        model: 'm',
        data: { points: ['Doanh thu giảm 12,5%.', '', 42, 'Nên nhắc 3 hóa đơn còn nợ.'] },
      });
      const result = await service.reportCommentary('2026-10-01', '2026-10-31', false);
      expect(result.points).toEqual(['Doanh thu giảm 12,5%.', 'Nên nhắc 3 hóa đơn còn nợ.']);
      expect(result.source).toBe('llm');
      expect(result.facts.lowStockItems).toBe(2);
      expect(cache.setJSON).toHaveBeenCalledWith(
        'ai:report:2026-10-01:2026-10-31',
        expect.objectContaining({ cached: false }),
        3600,
      );
    });

    it('returns the cached commentary unless refreshed', async () => {
      const { service, cache, model } = setup();
      cache.getJSON.mockResolvedValue({ points: ['x'], cached: false });
      expect((await service.reportCommentary('2026-10-01', '2026-10-31', false)).cached).toBe(true);
      expect(model.tryJson).not.toHaveBeenCalled();
      await service.reportCommentary('2026-10-01', '2026-10-31', true);
      expect(model.tryJson).toHaveBeenCalled();
    });

    it('states the facts plainly without a model', async () => {
      const { service } = setup();
      const result = await service.reportCommentary('2026-10-01', '2026-10-31', false);
      expect(result.source).toBe('fallback');
      expect(result.points[0]).toBe(
        'Doanh thu điều trị 125,5 triệu đồng, giảm 12,5% so với kỳ trước; thực thu 98 triệu đồng.',
      );
      expect(result.points).toContain(
        'Còn 3 hóa đơn chưa thu đủ, tổng 7,2 triệu đồng: nên rà soát và nhắc khách.',
      );
    });
  });

  describe('helpers', () => {
    it('greets by gender and given name', () => {
      expect(salutation('Trần Văn Minh', Gender.MALE)).toBe('anh Minh');
      expect(salutation('Lê Hà', Gender.UNDISCLOSED)).toBe('quý khách');
      expect(fillGreeting('Chào {ten}, hẹn gặp {ten}.', 'chị Lan')).toBe(
        'Chào chị Lan, hẹn gặp chị Lan.',
      );
    });

    it('reads money the Vietnamese way', () => {
      expect(vndText(125_500_000)).toBe('125,5 triệu đồng');
      expect(vndText(1_200_000_000)).toBe('1,2 tỷ đồng');
      expect(vndText(850_000)).toBe('850 nghìn đồng');
    });

    it('leaves out debt and stock lines when there is nothing to say', () => {
      const facts = {
        patients: { total: 0, newCount: 0, pctChange: 0 },
        appointments: { total: 0, arrived: 0, cancelled: 0, pctChange: 0 },
        treatmentRevenue: { total: 0, pctChange: 0 },
        collected: { total: 0, pctChange: 0 },
        outstanding: { totalDebt: 0, invoiceCount: 0 },
        topProcedures: [],
        dentists: [],
        lowStockItems: 0,
      } as unknown as ReportFacts;
      expect(fallbackCommentary(facts)).toHaveLength(2);
    });
  });
});

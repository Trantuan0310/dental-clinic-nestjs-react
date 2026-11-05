import { BadRequestException } from '@nestjs/common';
import { AiChatService, buildSystemPrompt } from './ai-chat.service';
import { RefBook, toolsFor } from './assistant-tools';

const PATIENT_ID = '11111111-1111-4111-8111-111111111111';
const DENTIST_ID = '22222222-2222-4222-8222-222222222222';

const desk = {
  sub: 'desk-1',
  email: 'lt@example.invalid',
  permissions: [
    'patient.read',
    'appointment.read.any',
    'appointment.create',
    'treatment_plan.read',
    'invoice.read.any',
  ],
};
const dentist = {
  sub: 'dentist-1',
  email: 'bs@example.invalid',
  permissions: ['appointment.read.own', 'invoice.read.own'],
};

function tomorrow(): string {
  return new Date(Date.now() + 36 * 3600_000).toISOString().slice(0, 10);
}

function setup(replies: Array<Record<string, unknown>>, configured = true) {
  const json = jest.fn();
  for (const r of replies) {
    json.mockResolvedValueOnce({ data: r, source: 'llm', model: 'test-model' });
  }
  const model = { configured, json };
  const audit = { log: jest.fn() };
  const patients = {
    lookup: jest.fn().mockResolvedValue({
      candidates: [
        {
          id: PATIENT_ID,
          fullName: 'Nguyễn Thị Lan',
          primaryPhone: '0901234567',
          gender: 'FEMALE',
          dob: new Date('1990-04-02'),
          lastVisitAt: new Date('2026-09-01T03:00:00Z'),
        },
      ],
    }),
  };
  const availability = {
    search: jest.fn().mockResolvedValue([
      {
        dentistId: DENTIST_ID,
        fullName: 'BS. Nguyễn Văn An',
        durationMin: 30,
        availableSlots: ['09:00', '09:30'],
      },
    ]),
  };
  const appointments = { create: jest.fn().mockResolvedValue({ id: 'appt-1' }) };
  const billing = { listInvoices: jest.fn() };
  const plans = { pendingTreatments: jest.fn() };
  const service = new AiChatService(
    model as any,
    audit as any,
    patients as any,
    availability as any,
    appointments as any,
    billing as any,
    plans as any,
  );
  return { service, model, json, audit, patients, availability, appointments, billing, plans };
}

const ask = (text: string) => [{ role: 'user' as const, content: text }];

describe('AiChatService', () => {
  it('says so when no model is configured, without calling anything', async () => {
    const t = setup([], false);
    const res = await t.service.chat(ask('xin chào'), undefined, desk);
    expect(res.source).toBe('fallback');
    expect(res.reply).toContain('chưa được cấu hình');
    expect(t.json).not.toHaveBeenCalled();
  });

  it('answers directly when no tool is needed', async () => {
    const t = setup([{ reply: 'Chào bạn, mình giúp được gì?' }]);
    const res = await t.service.chat(ask('hi'), undefined, desk);
    expect(res.reply).toBe('Chào bạn, mình giúp được gì?');
    expect(res.tools).toEqual([]);
    expect(t.audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'AI_ASSISTANT_CHAT' }),
    );
  });

  it('never shows the patient name or phone to the model; the browser gets the name', async () => {
    const t = setup([
      { tool: 'find_patient', args: { name: 'Lan' } },
      { reply: 'Có một bệnh nhân khớp: [P1], sinh 1990.' },
    ]);
    const res = await t.service.chat(ask('tìm chị Lan'), undefined, desk);
    const second = t.json.mock.calls[1][1] as string;
    expect(second).toContain('"ref":"P1"');
    expect(second).not.toContain('Nguyễn Thị Lan');
    expect(second).not.toContain('0901234567');
    expect(res.reply).toContain('[P1]');
    expect(res.names).toEqual({ P1: 'Nguyễn Thị Lan' });
    expect(res.refs).toEqual({ P1: PATIENT_ID });
  });

  it('turns propose_appointment into a card and books nothing', async () => {
    const date = tomorrow();
    const t = setup([
      { tool: 'find_patient', args: { name: 'Lan' } },
      {
        tool: 'propose_appointment',
        args: { patientRef: 'P1', dentistId: DENTIST_ID, date, time: '09:00', reason: 'Khám' },
      },
      { reply: 'Mình đã soạn thẻ, bạn xác nhận nhé.' },
    ]);
    const res = await t.service.chat(ask('đặt lịch chị Lan 9h mai với bác sĩ An'), undefined, desk);
    expect(res.actions).toHaveLength(1);
    expect(res.actions[0].payload).toEqual({
      patientId: PATIENT_ID,
      dentistId: DENTIST_ID,
      startAt: `${date}T09:00:00+07:00`,
      reason: 'Khám',
    });
    expect(res.actions[0].view.patientRef).toBe('P1');
    expect(res.actions[0].view.dentistName).toBe('BS. Nguyễn Văn An');
    expect(t.appointments.create).not.toHaveBeenCalled();
  });

  it('refuses a time that is not free and tells the model', async () => {
    const t = setup([
      { tool: 'find_patient', args: { name: 'Lan' } },
      {
        tool: 'propose_appointment',
        args: { patientRef: 'P1', dentistId: DENTIST_ID, date: tomorrow(), time: '10:00' },
      },
      { reply: 'Giờ đó đã kín.' },
    ]);
    const res = await t.service.chat(ask('đặt 10h'), undefined, desk);
    expect(res.actions).toHaveLength(0);
    expect(t.json.mock.calls[2][1]).toContain('không còn trống');
  });

  it('does not accept a ref the conversation never produced', async () => {
    const t = setup([
      {
        tool: 'propose_appointment',
        args: { patientRef: 'P9', dentistId: DENTIST_ID, date: tomorrow(), time: '09:00' },
      },
      { reply: 'Cần tìm bệnh nhân trước.' },
    ]);
    const res = await t.service.chat(ask('đặt lịch'), undefined, desk);
    expect(res.actions).toHaveLength(0);
    expect(t.json.mock.calls[1][1]).toContain('find_patient');
  });

  it('keeps refs from earlier turns', async () => {
    const t = setup([{ reply: 'ok' }]);
    const res = await t.service.chat(ask('tiếp'), { P3: PATIENT_ID, bad: 'x' }, desk);
    expect(res.refs).toEqual({ P3: PATIENT_ID });
  });

  it('hides tools the user has no permission for and rejects calling them', async () => {
    expect(toolsFor(dentist).map(t => t.name)).toEqual(['unpaid_invoices']);
    const t = setup([
      { tool: 'find_patient', args: { name: 'Lan' } },
      { reply: 'Không làm được.' },
    ]);
    await t.service.chat(ask('tìm Lan'), undefined, dentist);
    expect(t.patients.lookup).not.toHaveBeenCalled();
    expect(t.json.mock.calls[1][1]).toContain('Không có công cụ');
  });

  it('stops looping after a few tool calls', async () => {
    const t = setup(
      Array.from({ length: 8 }, () => ({ tool: 'free_slots', args: { date: tomorrow() } })),
    );
    const res = await t.service.chat(ask('xem giờ'), undefined, desk);
    expect(t.json.mock.calls.length).toBeLessThanOrEqual(5);
    expect(res.reply).toContain('chưa trả lời được');
  });

  it('falls back politely when the model fails', async () => {
    const t = setup([]);
    t.json.mockRejectedValueOnce(new Error('gateway 500'));
    const res = await t.service.chat(ask('hi'), undefined, desk);
    expect(res.source).toBe('fallback');
    expect(res.reply).toContain('không phản hồi');
  });

  it('requires the last message to be the user’s', async () => {
    const t = setup([]);
    await expect(
      t.service.chat([{ role: 'assistant', content: 'hi' }], undefined, desk),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('confirming a card books through the normal service as the user and is audited', async () => {
    const t = setup([]);
    const dto = {
      patientId: PATIENT_ID,
      dentistId: DENTIST_ID,
      startAt: '2026-11-07T09:00:00+07:00',
    };
    await t.service.confirmAppointment(dto, desk);
    expect(t.appointments.create).toHaveBeenCalledWith(dto, desk);
    expect(t.audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'AI_ACTION_EXECUTED', targetId: 'appt-1' }),
    );
  });
});

describe('RefBook', () => {
  it('reuses a patient’s ref and continues numbering', () => {
    const book = new RefBook({ P2: PATIENT_ID });
    expect(book.refFor(PATIENT_ID, 'A')).toBe('P2');
    expect(book.refFor('33333333-3333-4333-8333-333333333333', 'B')).toBe('P3');
    expect(book.idOf('[P3]')).toBe('33333333-3333-4333-8333-333333333333');
  });
});

describe('buildSystemPrompt', () => {
  it('lists only the tools given and today’s date', () => {
    const p = buildSystemPrompt(toolsFor(dentist), new Date('2026-11-05T03:00:00Z'));
    expect(p).toContain('2026-11-05');
    expect(p).toContain('Thứ năm');
    expect(p).toContain('free_slots');
    expect(p).not.toContain('find_patient:');
  });
});

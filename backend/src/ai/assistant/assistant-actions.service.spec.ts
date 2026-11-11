import { AssistantActionsService } from './assistant-actions.service';
const actor = {
  sub: 'desk',
  email: 'desk@test.invalid',
  permissions: ['appointment.read.any', 'appointment.cancel', 'appointment.update'],
};
function setup() {
  const records = new Map<string, any>();
  const prisma = {
    auditLog: {
      create: jest.fn(async ({ data }: any) => {
        const id = data.id ?? `id-${records.size}`;
        if (records.has(id)) throw { code: 'P2002' };
        const row = { ...data, id, occurredAt: new Date() };
        records.set(id, row);
        return row;
      }),
      findUnique: jest.fn(async ({ where }: any) => records.get(where.id) ?? null),
    },
  };
  const appt = {
    id: 'appt',
    patient: { id: 'patient', fullName: 'Private name' },
    dentist: { fullName: 'Dentist' },
    dentistId: 'dentist',
    startAt: new Date('2099-12-01T02:00:00Z'),
    endAt: new Date('2099-12-01T03:00:00Z'),
    updatedAt: new Date(),
    rescheduleCount: 0,
    status: 'CONFIRMED',
    services: [],
    bufferBeforeMin: 10,
    bufferAfterMin: 5,
  };
  const appointments = {
    getById: jest.fn().mockResolvedValue(appt),
    appointmentScope: jest.fn().mockReturnValue('any'),
    validateDentist: jest.fn(),
    planVisit: jest.fn().mockResolvedValue(null),
    cancel: jest.fn().mockResolvedValue({ id: 'appt' }),
    reschedule: jest.fn().mockResolvedValue({ id: 'appt' }),
  };
  const availability = {
    dayAvailability: jest.fn().mockResolvedValue({ availableSlots: ['10:00'] }),
  };
  return {
    service: new AssistantActionsService(prisma as any, appointments as any, availability as any),
    prisma,
    appointments,
    availability,
    records,
    appt,
  };
}
const cancel = { appointmentId: 'appt', reason: 'Patient requested' };
const move = { ...cancel, date: '2099-12-02', time: '10:00' };
describe('assistant appointment changes', () => {
  it('proposes without mutation and confirms cancellation once', async () => {
    const t = setup();
    const p = await t.service.propose('cancel_appointment', cancel, actor);
    expect(p.type).toBe('cancel_appointment');
    expect(p.view.startAt).toBe(t.appt.startAt.toISOString());
    expect(t.appointments.cancel).not.toHaveBeenCalled();
    expect(p.payload).toEqual({ proposalId: expect.any(String) });
    await t.service.confirm(p.payload.proposalId, actor);
    await expect(t.service.confirm(p.payload.proposalId, actor)).rejects.toThrow();
    expect(t.appointments.cancel).toHaveBeenCalledTimes(1);
    expect(t.appointments.cancel).toHaveBeenCalledWith(
      'appt',
      expect.objectContaining({ updatedAt: t.appt.updatedAt.toISOString(), reason: cancel.reason }),
      actor,
    );
  });
  it('confirms through normal rules once, including concurrent and later retries', async () => {
    const t = setup();
    const p = await t.service.propose('reschedule_appointment', move, actor);
    const outcomes = await Promise.allSettled([
      t.service.confirm(p.payload.proposalId, actor),
      t.service.confirm(p.payload.proposalId, actor),
    ]);
    expect(outcomes.some(r => r.status === 'fulfilled')).toBe(true);
    expect(t.appointments.reschedule).toHaveBeenCalledTimes(1);
    expect(t.appointments.reschedule).toHaveBeenCalledWith(
      'appt',
      expect.objectContaining({
        newStartsAt: '2099-12-02T10:00:00+07:00',
        newEndsAt: '2099-12-02T04:00:00.000Z',
        updatedAt: t.appt.updatedAt.toISOString(),
        rescheduleCount: 0,
      }),
      actor,
    );
    await expect(t.service.confirm(p.payload.proposalId, actor)).rejects.toThrow();
    expect(t.appointments.reschedule).toHaveBeenCalledTimes(1);
  });
  it('checks ownership, permission and scope again at confirmation', async () => {
    const t = setup();
    const p = await t.service.propose('cancel_appointment', cancel, actor);
    await expect(
      t.service.confirm(p.payload.proposalId, { ...actor, sub: 'other' }),
    ).rejects.toThrow();
    await expect(
      t.service.confirm(p.payload.proposalId, { ...actor, permissions: ['appointment.read.any'] }),
    ).rejects.toThrow();
    t.appointments.getById.mockRejectedValue(new Error('outside scope'));
    await expect(t.service.confirm(p.payload.proposalId, actor)).rejects.toThrow('outside scope');
    expect(t.appointments.cancel).not.toHaveBeenCalled();
  });
  it('does not retry mutation after a scheduling failure or uncertain outcome', async () => {
    const t = setup();
    const p = await t.service.propose('reschedule_appointment', move, actor);
    t.appointments.reschedule.mockRejectedValue(new Error('PATIENT_DOUBLE_BOOKED'));
    await expect(t.service.confirm(p.payload.proposalId, actor)).rejects.toThrow(
      'PATIENT_DOUBLE_BOOKED',
    );
    await expect(t.service.confirm(p.payload.proposalId, actor)).rejects.toThrow();
    expect(t.appointments.reschedule).toHaveBeenCalledTimes(1);
  });
  it('rejects expired, missing and terminal proposals', async () => {
    const t = setup();
    await expect(t.service.confirm('missing', actor)).rejects.toThrow();
    const p = await t.service.propose('cancel_appointment', cancel, actor);
    t.records.get(p.payload.proposalId).occurredAt = new Date(0);
    await expect(t.service.confirm(p.payload.proposalId, actor)).rejects.toThrow();
    t.appt.status = 'CHECKED_IN';
    await expect(t.service.propose('cancel_appointment', cancel, actor)).rejects.toThrow();
    expect(t.appointments.cancel).not.toHaveBeenCalled();
  });
  it('requires reason, valid dates, actual duration, buffers and exclusion of its own slot', async () => {
    const t = setup();
    await expect(
      t.service.propose('cancel_appointment', { ...cancel, reason: ' ' }, actor),
    ).rejects.toThrow();
    await expect(
      t.service.propose('reschedule_appointment', { ...move, date: '2099-02-30' }, actor),
    ).rejects.toThrow();
    await t.service.propose('reschedule_appointment', move, actor);
    expect(t.availability.dayAvailability).toHaveBeenCalledWith(
      'dentist',
      move.date,
      60,
      { beforeMin: 10, afterMin: 5 },
      'appt',
    );
    t.availability.dayAvailability.mockResolvedValue({ availableSlots: [] });
    await expect(t.service.propose('reschedule_appointment', move, actor)).rejects.toThrow();
  });
  it('checks dentist lead time, transfer scope, reschedule limit and changed service plan', async () => {
    const t = setup();
    t.appointments.appointmentScope.mockReturnValue('own');
    await expect(
      t.service.propose('reschedule_appointment', { ...move, dentistId: 'other' }, actor),
    ).rejects.toThrow();
    t.appt.startAt = new Date(Date.now() + 3600_000);
    await expect(t.service.propose('cancel_appointment', cancel, actor)).rejects.toThrow();
    t.appointments.appointmentScope.mockReturnValue('any');
    t.appt.startAt = new Date('2099-12-01T02:00:00Z');
    t.appt.rescheduleCount = 3;
    await expect(t.service.propose('reschedule_appointment', move, actor)).rejects.toThrow();
    t.appt.rescheduleCount = 0;
    t.appointments.planVisit.mockResolvedValue({
      durationMin: 90,
      bufferBeforeMin: 15,
      bufferAfterMin: 10,
    } as any);
    const p = await t.service.propose('reschedule_appointment', move, actor);
    expect(p.view.endAt).toBe('2099-12-02T04:30:00.000Z');
    expect(t.availability.dayAvailability).toHaveBeenLastCalledWith(
      'dentist',
      move.date,
      90,
      { beforeMin: 15, afterMin: 10 },
      'appt',
    );
  });
});

describe('assistant durable confirmation', () => {
  it('rejects replayed confirmations after a service restart', async () => {
    const t = setup();
    const p = await t.service.propose('cancel_appointment', cancel, actor);
    await t.service.confirm(p.payload.proposalId, actor);
    const restarted = new AssistantActionsService(
      t.prisma as any,
      t.appointments as any,
      t.availability as any,
    );
    await expect(restarted.confirm(p.payload.proposalId, actor)).rejects.toThrow();
    await expect(restarted.confirm(p.payload.proposalId, { ...actor, permissions: ['appointment.update'] })).rejects.toThrow();
    expect(t.appointments.cancel).toHaveBeenCalledTimes(1);
  });
  it('checks permission and expiry before acknowledging a completed proposal', async () => {
    const t = setup();
    const p = await t.service.propose('cancel_appointment', cancel, actor);
    await t.service.confirm(p.payload.proposalId, actor);
    await expect(t.service.confirm(p.payload.proposalId, { ...actor, permissions: ['appointment.update'] })).rejects.toThrow();
    t.records.get(p.payload.proposalId).occurredAt = new Date(0);
    await expect(t.service.confirm(p.payload.proposalId, actor)).rejects.toThrow();
    expect(t.appointments.cancel).toHaveBeenCalledTimes(1);
  });
  it('preserves the proposed version and propagates a stale appointment rejection', async () => {
    const t = setup();
    const before = t.appt.updatedAt.toISOString();
    const p = await t.service.propose('reschedule_appointment', move, actor);
    t.appt.updatedAt = new Date(Date.now() + 1000);
    t.appointments.reschedule.mockRejectedValue(new Error('Changed since read'));
    await expect(t.service.confirm(p.payload.proposalId, actor)).rejects.toThrow(
      'Changed since read',
    );
    expect(t.appointments.reschedule).toHaveBeenCalledWith(
      'appt',
      expect.objectContaining({ updatedAt: before }),
      actor,
    );
  });
});

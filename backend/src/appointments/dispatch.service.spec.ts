import { AppointmentStatus, QueuePriority, QueueStatus } from '@prisma/client';
import { DispatchService } from './dispatch.service';
import { createPrismaMock, PrismaMockShape, asTransaction } from '../../test/helpers/prisma-mock';
import { adminPayload } from '../../test/helpers';
import { clinicDateOnly } from '../common/date-range.util';

const appointmentsMock = () => ({
  validateDentist: jest.fn().mockResolvedValue({}),
  planVisit: jest.fn().mockResolvedValue(null),
  ensureSlotAvailable: jest.fn().mockResolvedValue(undefined),
  ensurePatientFree: jest.fn().mockResolvedValue(undefined),
  queueSlot: jest.fn(async (_tx: unknown, _d: string, from: Date, minutes: number) => ({
    startAt: from,
    endAt: new Date(from.getTime() + minutes * 60_000),
    overtime: false,
  })),
  isRowScopedDentist: jest.fn().mockReturnValue(false),
});

const plan30 = {
  services: [
    {
      serviceId: 'svc-1',
      serviceCode: 'KHAM',
      serviceName: 'Khám',
      price: 150000,
      durationMin: 30,
      bufferBeforeMin: 0,
      bufferAfterMin: 5,
      sortOrder: 0,
    },
  ],
  durationMin: 30,
  bufferBeforeMin: 0,
  bufferAfterMin: 5,
};

describe('DispatchService.reassignDay', () => {
  let prisma: PrismaMockShape;
  let service: DispatchService;
  let appointments: ReturnType<typeof appointmentsMock>;
  const audit = { log: jest.fn().mockResolvedValue(undefined) };
  const startAt = new Date(Date.now() + 3 * 86400000);
  const booking = {
    id: 'appt-1',
    patientId: 'patient-1',
    dentistId: 'dentist-1',
    status: AppointmentStatus.SCHEDULED,
    startAt,
    endAt: new Date(startAt.getTime() + 15 * 60_000),
    rescheduleCount: 2,
    bufferBeforeMin: 0,
    bufferAfterMin: 0,
    durationOverrideReason: null,
    services: [],
    patient: { code: 'BN1', fullName: 'Nguyễn Văn A' },
  };
  const dto = {
    fromDentistId: 'dentist-1',
    toDentistId: 'dentist-2',
    date: startAt.toISOString().slice(0, 10),
    reason: 'BS 1 nghỉ ốm',
  };

  beforeEach(() => {
    prisma = createPrismaMock();
    asTransaction(prisma);
    appointments = appointmentsMock();
    prisma.appointment.findMany.mockResolvedValue([booking]);
    prisma.scheduleOverride.create.mockResolvedValue({ id: 'ov-1' });
    prisma.queueEntry.findMany.mockResolvedValue([]);
    service = new DispatchService(prisma as any, audit as any, appointments as any);
  });

  afterEach(() => jest.clearAllMocks());

  it("A3-06: closes the absent dentist's day and marks the move as the clinic's", async () => {
    prisma.appointment.updateMany.mockResolvedValue({ count: 1 });

    const res = await service.reassignDay(dto, adminPayload());

    expect(prisma.scheduleOverride.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        dentistId: 'dentist-1',
        date: new Date(dto.date),
        kind: 'CLOSED',
        startTime: null,
        reason: 'Thay bác sĩ cả ngày: BS 1 nghỉ ốm',
      }),
    });
    expect(res.closedOverrideId).toBe('ov-1');
    expect(prisma.appointmentRescheduleLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ byClinic: true }),
    });

    prisma.scheduleOverride.create.mockClear();
    await service.reassignDay({ ...dto, closeFromDentist: false }, adminPayload());
    expect(prisma.scheduleOverride.create).not.toHaveBeenCalled();
  });

  it('A3-05: also takes a visit started up to 30 minutes ago; today the day closes from now', async () => {
    jest.useFakeTimers({
      now: new Date('2026-10-01T03:00:00Z'),
      doNotFake: ['nextTick', 'setImmediate'],
    });
    try {
      prisma.appointment.findMany.mockResolvedValue([]);
      await service.reassignDay({ ...dto, date: '2026-10-01' }, adminPayload());
      const where = prisma.appointment.findMany.mock.calls[0][0].where;
      expect(where.startAt.gte).toEqual(new Date('2026-10-01T02:30:00Z'));
      // Today the day is closed from now (10:00 clinic time), not from midnight.
      expect(prisma.scheduleOverride.create.mock.calls[0][0].data.startTime).toEqual(
        new Date('1970-01-01T10:00:00Z'),
      );
    } finally {
      jest.useRealTimers();
    }
  });

  it('X-5: warns when the substitute has leave pending that day', async () => {
    const availability = {
      pendingTimeOffs: jest.fn().mockResolvedValue([{ startTime: '13:00', endTime: '17:00' }]),
    };
    const withAvailability = new DispatchService(
      prisma as any,
      audit as any,
      appointments as any,
      undefined,
      availability as any,
    );
    prisma.appointment.updateMany.mockResolvedValue({ count: 1 });
    const res = await withAvailability.reassignDay(dto, adminPayload());
    expect(availability.pendingTimeOffs).toHaveBeenCalledWith('dentist-2', dto.date);
    expect(res.warning).toMatch(/đơn nghỉ đang chờ duyệt.*13:00–17:00/);
  });

  it('undo reopens the day and moves back only the visits this reassignment moved', async () => {
    prisma.scheduleOverride.findMany.mockResolvedValue([{ id: 'ov-1' }]);
    const moved = {
      ...booking,
      dentistId: 'dentist-2',
      rescheduleLogs: [
        { oldDentistId: 'dentist-1', newDentistId: 'dentist-2', newStartAt: booking.startAt },
      ],
    };
    const own = { ...booking, id: 'appt-own', dentistId: 'dentist-2', rescheduleLogs: [] };
    prisma.appointment.findMany.mockResolvedValue([moved, own]);
    prisma.appointment.updateMany.mockResolvedValue({ count: 1 });

    const res = await service.undoReassignDay(
      { ...dto, reason: 'BS 1 quay lại làm' },
      adminPayload(),
    );

    expect(prisma.scheduleOverride.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['ov-1'] } },
      data: expect.objectContaining({ deletedAt: expect.any(Date) }),
    });
    expect(res.moved.map(m => m.appointmentId)).toEqual(['appt-1']);
    expect(prisma.appointment.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: 'appt-1', dentistId: 'dentist-2' }),
        data: expect.objectContaining({ dentistId: 'dentist-1' }),
      }),
    );
  });

  it('moves only a booking still at the time, dentist and reschedule count it was checked for', async () => {
    prisma.appointment.updateMany.mockResolvedValue({ count: 1 });

    const res = await service.reassignDay(dto, adminPayload());

    expect(prisma.appointment.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'appt-1',
        dentistId: 'dentist-1',
        status: AppointmentStatus.SCHEDULED,
        startAt: booking.startAt,
        endAt: booking.endAt,
        rescheduleCount: 2,
      },
      // The reminder names the dentist: the new one gets its own.
      data: expect.objectContaining({ dentistId: 'dentist-2', reminderSentAt: null }),
    });
    expect(res.moved.map(m => m.appointmentId)).toEqual(['appt-1']);
  });

  it('moves a visit whose service was withdrawn since it was booked (as a reschedule does)', async () => {
    prisma.appointment.findMany.mockResolvedValue([
      { ...booking, services: [{ serviceId: 'svc-withdrawn' }] },
    ]);
    prisma.appointment.updateMany.mockResolvedValue({ count: 1 });

    const res = await service.reassignDay(dto, adminPayload());

    // The visit's own clinic date (the day it is moved on).
    expect(appointments.planVisit).toHaveBeenCalledWith(
      'dentist-2',
      ['svc-withdrawn'],
      clinicDateOnly(startAt),
      {
        activeServicesOnly: false,
      },
    );
    expect(res.moved.map(m => m.appointmentId)).toEqual(['appt-1']);
  });

  // A5-05: the substitute's own length applies (prices stay as booked).
  it("re-plans the visit with the substitute's durations and checks that length", async () => {
    prisma.appointment.findMany.mockResolvedValue([
      { ...booking, services: [{ serviceId: 'svc-1' }] },
    ]);
    appointments.planVisit.mockResolvedValue(plan30);
    prisma.appointment.updateMany.mockResolvedValue({ count: 1 });
    prisma.appointmentService.updateMany.mockResolvedValue({ count: 1 });
    const end30 = new Date(startAt.getTime() + 30 * 60_000);

    await service.reassignDay(dto, adminPayload());

    expect(appointments.ensureSlotAvailable).toHaveBeenCalledWith(
      'dentist-2',
      startAt,
      end30,
      expect.anything(),
      'appt-1',
      prisma,
      plan30,
    );
    expect(prisma.appointment.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          endAt: end30,
          calculatedDurationMin: 30,
          bufferAfterMin: 5,
        }),
      }),
    );
    expect(prisma.appointmentService.updateMany).toHaveBeenCalledWith({
      where: { appointmentId: 'appt-1', serviceId: 'svc-1' },
      data: { durationMin: 30, bufferBeforeMin: 0, bufferAfterMin: 5 },
    });
  });

  it("lists as not moved a longer visit that would overlap the patient's next one", async () => {
    prisma.appointment.findMany.mockResolvedValue([
      { ...booking, patientId: 'patient-1', services: [{ serviceId: 'svc-1' }] },
    ]);
    appointments.planVisit.mockResolvedValue(plan30);
    appointments.ensurePatientFree.mockRejectedValue(
      new Error('Bệnh nhân đã có lịch hẹn khác trùng khung giờ này'),
    );

    const res = await service.reassignDay(dto, adminPayload());

    expect(appointments.ensurePatientFree).toHaveBeenCalledWith(
      'patient-1',
      startAt,
      new Date(startAt.getTime() + 30 * 60_000),
      'appt-1',
      prisma,
    );
    expect(res.moved).toEqual([]);
    expect(res.failed[0].reason).toContain('Bệnh nhân đã có lịch hẹn khác');
    expect(prisma.appointment.updateMany).not.toHaveBeenCalled();
  });

  it("says when it is the substitute's longer visit that does not fit", async () => {
    prisma.appointment.findMany.mockResolvedValue([
      { ...booking, services: [{ serviceId: 'svc-1' }] },
    ]);
    appointments.planVisit.mockResolvedValue(plan30);
    appointments.ensureSlotAvailable.mockRejectedValue(
      new Error('Khung giờ này đã có lịch hẹn khác'),
    );

    const res = await service.reassignDay(dto, adminPayload());

    expect(res.failed[0].reason).toBe(
      'Bác sĩ thay cần 30 phút cho lượt này — Khung giờ này đã có lịch hẹn khác',
    );
  });

  // A3-05: a booking just started (patient on the way) is still moved.
  it('also takes bookings started within the check-in window', async () => {
    jest.useFakeTimers({ now: new Date('2026-10-01T07:00:00Z') }); // 14:00 clinic time
    try {
      prisma.appointment.updateMany.mockResolvedValue({ count: 1 });
      await service.reassignDay({ ...dto, date: '2026-10-01' }, adminPayload());
      expect(prisma.appointment.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            startAt: { gte: new Date('2026-10-01T06:30:00Z'), lt: expect.any(Date) },
          }),
        }),
      );
    } finally {
      jest.useRealTimers();
    }
  });

  it('lists a booking changed meanwhile as not moved', async () => {
    prisma.appointment.updateMany.mockResolvedValue({ count: 0 });

    const res = await service.reassignDay(dto, adminPayload());

    expect(res.moved).toEqual([]);
    expect(res.failed).toEqual([
      expect.objectContaining({
        appointmentId: 'appt-1',
        reason: 'Lịch vừa được thay đổi, tải lại rồi thử lại',
      }),
    ]);
    expect(prisma.appointmentRescheduleLog.create).not.toHaveBeenCalled();
  });

  // A3-05: patients already waiting for the absent dentist go too.
  it('moves the patients already waiting to the substitute, listing the ones that fail', async () => {
    prisma.appointment.findMany.mockResolvedValue([]);
    const waiting = (id: string, name: string) => ({
      id,
      appointmentId: `appt-${id}`,
      dentistId: 'dentist-1',
      status: QueueStatus.WAITING,
      priority: QueuePriority.ON_TIME,
      checkedInAt: new Date(),
      appointment: { startAt: new Date(), patient: { fullName: name } },
    });
    prisma.queueEntry.findMany.mockResolvedValue([waiting('q1', 'A'), waiting('q2', 'B')]);
    const transfer = jest
      .spyOn(service, 'transfer')
      .mockResolvedValueOnce({} as any)
      .mockRejectedValueOnce(new Error('Bác sĩ nghỉ phép từ 15:00 đến 17:00'));

    const res = await service.reassignDay(dto, adminPayload());

    expect(transfer).toHaveBeenCalledWith(
      'q1',
      { dentistId: 'dentist-2', reason: 'BS 1 nghỉ ốm' },
      expect.anything(),
    );
    expect(res.transferred.map(t => t.patientName)).toEqual(['A']);
    expect(res.failed).toEqual([expect.objectContaining({ patientName: 'B', checkedIn: true })]);
  });
});

describe('DispatchService.transfer', () => {
  let prisma: PrismaMockShape;
  let service: DispatchService;
  let appointments: ReturnType<typeof appointmentsMock>;
  const audit = { log: jest.fn().mockResolvedValue(undefined) };
  const entry = {
    id: 'q-1',
    appointmentId: 'appt-1',
    dentistId: 'dentist-1',
    status: QueueStatus.WAITING,
    doneAt: null,
  };
  const startAt = new Date(Date.now() + 60 * 60_000);
  const appt = {
    id: 'appt-1',
    patientId: 'patient-1',
    dentistId: 'dentist-1',
    status: AppointmentStatus.CHECKED_IN,
    startAt,
    endAt: new Date(startAt.getTime() + 30 * 60_000),
    bufferBeforeMin: 0,
    bufferAfterMin: 0,
    durationOverrideReason: null,
    services: [],
  };
  const dto = { dentistId: 'dentist-2', reason: 'BS 1 đang quá tải' };

  beforeEach(() => {
    prisma = createPrismaMock();
    asTransaction(prisma);
    appointments = appointmentsMock();
    prisma.queueEntry.findUnique.mockResolvedValue(entry);
    prisma.appointment.findUniqueOrThrow.mockResolvedValue(appt);
    prisma.appointment.updateMany.mockResolvedValue({ count: 1 });
    prisma.queueEntry.findUniqueOrThrow.mockResolvedValue({ ...entry, dentistId: 'dentist-2' });
    service = new DispatchService(prisma as any, audit as any, appointments as any);
  });

  afterEach(() => jest.clearAllMocks());

  it('requeues only an entry still open under the old dentist, as waiting', async () => {
    prisma.queueEntry.updateMany.mockResolvedValue({ count: 1 });

    await service.transfer('q-1', dto, adminPayload());

    expect(prisma.queueEntry.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'q-1',
        doneAt: null,
        dentistId: 'dentist-1',
        status: { in: [QueueStatus.WAITING, QueueStatus.CALLED, QueueStatus.SKIPPED] },
      },
      data: expect.objectContaining({
        dentistId: 'dentist-2',
        status: QueueStatus.WAITING,
        transferredFromId: 'dentist-1',
        transferReason: 'BS 1 đang quá tải',
      }),
    });
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'APPOINTMENT_TRANSFERRED' }),
    );
  });

  // A3-01: the new dentist's line, not a free slot on their calendar.
  it("joins the new dentist's queue through queueSlot, no free calendar slot needed", async () => {
    prisma.queueEntry.updateMany.mockResolvedValue({ count: 1 });

    await service.transfer('q-1', dto, adminPayload());

    expect(appointments.ensureSlotAvailable).not.toHaveBeenCalled();
    expect(appointments.queueSlot).toHaveBeenCalledWith(prisma, 'dentist-2', startAt, 30, {
      excludeAppointmentId: 'appt-1',
      overtimeReason: null,
      buffers: expect.anything(),
    });
    expect(appointments.ensurePatientFree).toHaveBeenCalled();
  });

  it('passes the reason as the overtime confirmation only when asked', async () => {
    prisma.queueEntry.updateMany.mockResolvedValue({ count: 1 });

    await service.transfer('q-1', { ...dto, allowOvertime: true }, adminPayload());

    expect(appointments.queueSlot).toHaveBeenCalledWith(
      prisma,
      'dentist-2',
      startAt,
      30,
      expect.objectContaining({ overtimeReason: 'BS 1 đang quá tải' }),
    );
  });

  it('a start minute taken meanwhile is a slot conflict, not a server error', async () => {
    const { Prisma } = jest.requireActual('@prisma/client');
    prisma.appointment.updateMany.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('dup', { code: 'P2002', clientVersion: 'x' }),
    );
    await expect(service.transfer('q-1', dto, adminPayload())).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'SLOT_CONFLICT' }),
    });
  });

  // A3-15: no fake "skip" first.
  it('moves a called patient straight away', async () => {
    prisma.queueEntry.findUnique.mockResolvedValue({ ...entry, status: QueueStatus.CALLED });
    prisma.queueEntry.updateMany.mockResolvedValue({ count: 1 });

    await expect(service.transfer('q-1', dto, adminPayload())).resolves.toBeDefined();
  });

  it('fails (rolling back the move) when the entry was closed meanwhile', async () => {
    prisma.queueEntry.updateMany.mockResolvedValue({ count: 0 });

    await expect(service.transfer('q-1', dto, adminPayload())).rejects.toThrow(
      'Bệnh nhân vừa bắt đầu khám hoặc đã rời hàng đợi — tải lại rồi thử lại',
    );
    expect(audit.log).not.toHaveBeenCalled();
  });
});

describe('DispatchService call / uncall / emergency', () => {
  let prisma: PrismaMockShape;
  let service: DispatchService;
  const audit = { log: jest.fn().mockResolvedValue(undefined) };
  const entry = {
    id: 'q-1',
    appointmentId: 'appt-1',
    dentistId: 'dentist-1',
    status: QueueStatus.CALLED,
    priority: QueuePriority.EMERGENCY,
    emergencyReason: 'Sưng mặt',
    checkedInAt: new Date('2026-10-01T02:20:00Z'),
    doneAt: null,
  };

  beforeEach(() => {
    prisma = createPrismaMock();
    prisma.queueEntry.findUnique.mockResolvedValue(entry);
    prisma.queueEntry.updateMany.mockResolvedValue({ count: 1 });
    prisma.queueEntry.findUniqueOrThrow.mockResolvedValue(entry);
    service = new DispatchService(prisma as any, audit as any, appointmentsMock() as any);
  });

  afterEach(() => jest.clearAllMocks());

  it('a second call of a patient already called changes nothing (A3-21)', async () => {
    await service.call('q-1', adminPayload());
    expect(prisma.queueEntry.updateMany).not.toHaveBeenCalled();
  });

  it('uncall puts a called patient back to waiting without counting a skip', async () => {
    await service.uncall('q-1', adminPayload());
    expect(prisma.queueEntry.updateMany).toHaveBeenCalledWith({
      where: { id: 'q-1', doneAt: null, status: { in: [QueueStatus.CALLED] } },
      data: { status: QueueStatus.WAITING, updatedBy: expect.any(String) },
    });
  });

  it('clearing an emergency restores the class recorded when it was flagged', async () => {
    prisma.auditLog.findFirst.mockResolvedValue({ metadata: { previousPriority: 'WALK_IN' } });
    await service.clearEmergency('q-1', 'Đánh nhầm cấp cứu', adminPayload());
    expect(prisma.appointment.findUniqueOrThrow).not.toHaveBeenCalled();
    expect(prisma.queueEntry.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ priority: QueuePriority.WALK_IN }),
      }),
    );
  });

  it('clearing an emergency restores the class from the check-in', async () => {
    prisma.appointment.findUniqueOrThrow.mockResolvedValue({
      visitKind: 'BOOKED',
      startAt: new Date('2026-10-01T02:00:00Z'), // checked in 20 min after
    });
    await service.clearEmergency('q-1', 'Đánh nhầm cấp cứu', adminPayload());
    expect(prisma.queueEntry.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ priority: QueuePriority.LATE, emergencyReason: null }),
      }),
    );
  });
});

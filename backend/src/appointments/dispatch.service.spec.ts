import { AppointmentStatus, QueueStatus } from '@prisma/client';
import { DispatchService } from './dispatch.service';
import { createPrismaMock, PrismaMockShape, asTransaction } from '../../test/helpers/prisma-mock';
import { adminPayload } from '../../test/helpers';
import { clinicDateOnly } from '../common/date-range.util';

describe('DispatchService.reassignDay — guarded move (race with a reschedule)', () => {
  let prisma: PrismaMockShape;
  let service: DispatchService;
  const appointments = {
    validateDentist: jest.fn().mockResolvedValue({}),
    planVisit: jest.fn().mockResolvedValue(null),
    ensureSlotAvailable: jest.fn().mockResolvedValue(undefined),
    isRowScopedDentist: jest.fn().mockReturnValue(false),
  };
  const audit = { log: jest.fn().mockResolvedValue(undefined) };
  const startAt = new Date(Date.now() + 3 * 86400000);
  const booking = {
    id: 'appt-1',
    dentistId: 'dentist-1',
    status: AppointmentStatus.SCHEDULED,
    startAt,
    endAt: new Date(startAt.getTime() + 30 * 60_000),
    rescheduleCount: 2,
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

  it('A3-05: also takes a visit started up to 30 minutes ago, and lists patients already waiting', async () => {
    jest.useFakeTimers({
      now: new Date('2026-10-01T03:00:00Z'),
      doNotFake: ['nextTick', 'setImmediate'],
    });
    try {
      prisma.appointment.findMany.mockResolvedValue([]);
      prisma.queueEntry.findMany.mockResolvedValue([
        {
          id: 'q-1',
          appointmentId: 'appt-9',
          appointment: { startAt: new Date('2026-10-01T02:30:00Z'), patient: { fullName: 'Hà' } },
        },
      ]);
      const res = await service.reassignDay({ ...dto, date: '2026-10-01' }, adminPayload());
      const where = prisma.appointment.findMany.mock.calls[0][0].where;
      expect(where.startAt.gte).toEqual(new Date('2026-10-01T02:30:00Z'));
      expect(res.waiting).toEqual([
        expect.objectContaining({ queueEntryId: 'q-1', patientName: 'Hà' }),
      ]);
      // Today the day is closed from now (10:00 clinic time), not from midnight.
      expect(prisma.scheduleOverride.create.mock.calls[0][0].data.startTime).toEqual(
        new Date('1970-01-01T10:00:00Z'),
      );
    } finally {
      jest.useRealTimers();
    }
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
});

describe('DispatchService.transfer — guarded queue move (race with a call)', () => {
  let prisma: PrismaMockShape;
  let service: DispatchService;
  const appointments = {
    validateDentist: jest.fn().mockResolvedValue({}),
    planVisit: jest.fn().mockResolvedValue(null),
    ensureSlotAvailable: jest.fn().mockResolvedValue(undefined),
    isRowScopedDentist: jest.fn().mockReturnValue(false),
  };
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
    dentistId: 'dentist-1',
    status: AppointmentStatus.CHECKED_IN,
    startAt,
    endAt: new Date(startAt.getTime() + 30 * 60_000),
    services: [],
  };
  const dto = { dentistId: 'dentist-2', reason: 'BS 1 đang quá tải' };

  beforeEach(() => {
    prisma = createPrismaMock();
    asTransaction(prisma);
    prisma.queueEntry.findUnique.mockResolvedValue(entry);
    prisma.appointment.findUniqueOrThrow.mockResolvedValue(appt);
    prisma.appointment.updateMany.mockResolvedValue({ count: 1 });
    prisma.queueEntry.findUniqueOrThrow.mockResolvedValue({ ...entry, dentistId: 'dentist-2' });
    service = new DispatchService(prisma as any, audit as any, appointments as any);
  });

  afterEach(() => jest.clearAllMocks());

  it('requeues only an entry still open, waiting or skipped, under the old dentist', async () => {
    prisma.queueEntry.updateMany.mockResolvedValue({ count: 1 });

    await service.transfer('q-1', dto, adminPayload());

    expect(prisma.queueEntry.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'q-1',
        doneAt: null,
        dentistId: 'dentist-1',
        status: { in: [QueueStatus.WAITING, QueueStatus.SKIPPED] },
      },
      data: expect.objectContaining({
        dentistId: 'dentist-2',
        status: QueueStatus.WAITING,
        transferredFromId: 'dentist-1',
        transferReason: 'BS 1 đang quá tải',
      }),
    });
    expect(prisma.queueEntry.update).not.toHaveBeenCalled();
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'APPOINTMENT_TRANSFERRED' }),
    );
  });

  it('fails (rolling back the move) when the entry was called meanwhile, instead of resetting it', async () => {
    prisma.queueEntry.updateMany.mockResolvedValue({ count: 0 });

    await expect(service.transfer('q-1', dto, adminPayload())).rejects.toThrow(
      'Bệnh nhân vừa được gọi hoặc đã rời hàng đợi — tải lại rồi thử lại',
    );
    expect(audit.log).not.toHaveBeenCalled();
  });
});

import { AppointmentStatus } from '@prisma/client';
import { DispatchService } from './dispatch.service';
import { createPrismaMock, PrismaMockShape, asTransaction } from '../../test/helpers/prisma-mock';
import { adminPayload } from '../../test/helpers';

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
    service = new DispatchService(prisma as any, audit as any, appointments as any);
  });

  afterEach(() => jest.clearAllMocks());

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
      data: expect.objectContaining({ dentistId: 'dentist-2' }),
    });
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

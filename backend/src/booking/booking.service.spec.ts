import { UnauthorizedException, ConflictException } from '@nestjs/common';
import { createHash } from 'crypto';
import { Gender } from '@prisma/client';
import { BookingService } from './booking.service';

const plan = {
  services: [],
  durationMin: 30,
  bufferBeforeMin: 5,
  bufferAfterMin: 10,
};

describe('BookingService public request security and validation', () => {
  let service: BookingService;
  let prisma: any;
  let appointments: any;
  let patients: any;
  let audit: any;
  let email: any;

  beforeEach(() => {
    prisma = {
      dentistService: { findFirst: jest.fn() },
      patient: { findMany: jest.fn().mockResolvedValue([]), findFirst: jest.fn() },
      bookingRequest: {
        create: jest.fn(),
        update: jest.fn(),
        findUnique: jest.fn(),
        findUniqueOrThrow: jest.fn(),
      },
    };
    appointments = {
      getAvailability: jest.fn(),
      planVisit: jest.fn().mockResolvedValue(plan),
      create: jest.fn(),
    };
    patients = { create: jest.fn() };
    audit = { log: jest.fn().mockResolvedValue(undefined) };
    email = { send: jest.fn().mockResolvedValue(false) };
    service = new BookingService(prisma, appointments, patients, audit, email);
  });

  const futureSlot = () => {
    const d = new Date(Date.now() + 24 * 60 * 60_000 + 8 * 60 * 60_000);
    const date = new Date(d.getTime() + 7 * 60 * 60_000).toISOString().slice(0, 10);
    return { date, startAt: new Date(date + 'T10:00:00+07:00').toISOString() };
  };

  it('rejects a booking without explicit consent before writing any personal data', async () => {
    const slot = futureSlot();
    await expect(
      service.createPublic({
        fullName: 'Nguyen An',
        dob: '1990-01-01',
        gender: Gender.FEMALE,
        phone: '0901234567',
        serviceId: 'service-1',
        dentistId: 'dentist-1',
        startAt: slot.startAt,
        consent: false,
      } as any),
    ).rejects.toThrow('đồng ý');
    expect(prisma.bookingRequest.create).not.toHaveBeenCalled();
  });

  it('stores only a hash of the one-time access token and leaves the request pending', async () => {
    const slot = futureSlot();
    prisma.dentistService.findFirst.mockResolvedValue({ id: 'assignment-1' });
    appointments.getAvailability.mockResolvedValue({ availableSlots: ['10:00'] });
    prisma.bookingRequest.create.mockImplementation(({ data }: any) =>
      Promise.resolve({
        id: 'request-1',
        referenceCode: data.referenceCode,
        fullName: data.fullName,
        email: null,
      }),
    );

    const result = await service.createPublic({
      fullName: 'Nguyen An',
      dob: '1990-01-01',
      gender: Gender.FEMALE,
      phone: '0901234567',
      serviceId: 'service-1',
      dentistId: 'dentist-1',
      startAt: slot.startAt,
      consent: true,
    } as any);

    const stored = prisma.bookingRequest.create.mock.calls[0][0].data;
    expect(result.status).toBe('PENDING_REVIEW');
    expect(result.accessToken).toHaveLength(43);
    expect(stored.accessTokenHash).toBe(
      createHash('sha256').update(result.accessToken).digest('hex'),
    );
    expect(stored.accessTokenHash).not.toBe(result.accessToken);
    expect(prisma.bookingRequest.create).toHaveBeenCalledTimes(1);
  });

  it('rejects an invalid or wrong token without returning request details', async () => {
    prisma.bookingRequest.findUnique.mockResolvedValue({
      id: 'request-1',
      accessTokenHash: createHash('sha256').update('right-token').digest('hex'),
    });
    await expect(service.publicStatus('GS-ABC', 'wrong-token')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(prisma.bookingRequest.findUniqueOrThrow).not.toHaveBeenCalled();
  });

  it('does not create a request if the availability result is stale', async () => {
    const slot = futureSlot();
    prisma.dentistService.findFirst.mockResolvedValue({ id: 'assignment-1' });
    appointments.getAvailability.mockResolvedValue({ availableSlots: [] });
    await expect(
      service.createPublic({
        fullName: 'Nguyen An',
        dob: '1990-01-01',
        gender: Gender.FEMALE,
        phone: '0901234567',
        serviceId: 'service-1',
        dentistId: 'dentist-1',
        startAt: slot.startAt,
        consent: true,
      } as any),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.bookingRequest.create).not.toHaveBeenCalled();
  });

  it('checks the slot with the service length and buffers the dentist would get', async () => {
    const slot = futureSlot();
    prisma.dentistService.findFirst.mockResolvedValue({ id: 'assignment-1' });
    appointments.getAvailability.mockResolvedValue({ availableSlots: ['10:00'] });
    prisma.bookingRequest.create.mockResolvedValue({
      id: 'request-1',
      referenceCode: 'GS-1',
      fullName: 'Nguyen An',
      email: null,
    });
    await service.createPublic({
      fullName: 'Nguyen An',
      dob: '1990-01-01',
      gender: Gender.FEMALE,
      phone: '0901234567',
      serviceId: 'service-1',
      dentistId: 'dentist-1',
      startAt: slot.startAt,
      consent: true,
    } as any);
    expect(appointments.planVisit).toHaveBeenCalledWith('dentist-1', ['service-1'], slot.date);
    expect(appointments.getAvailability).toHaveBeenCalledWith({
      dentistId: 'dentist-1',
      date: slot.date,
      slotDuration: 30,
      bufferBeforeMin: 5,
      bufferAfterMin: 10,
    });
  });

  it('refuses a dentist who does not take online bookings for that service', async () => {
    const slot = futureSlot();
    prisma.dentistService.findFirst.mockResolvedValue(null);
    await expect(
      service.createPublic({
        fullName: 'Nguyen An',
        dob: '1990-01-01',
        gender: Gender.FEMALE,
        phone: '0901234567',
        serviceId: 'service-1',
        dentistId: 'dentist-1',
        startAt: slot.startAt,
        consent: true,
      } as any),
    ).rejects.toThrow('không nhận đặt lịch');
    const where = prisma.dentistService.findFirst.mock.calls[0][0].where;
    expect(where.dentist.dentistProfile.is.acceptsOnlineBooking).toBe(true);
    expect(prisma.bookingRequest.create).not.toHaveBeenCalled();
  });

  it('confirms a request into a CONFIRMED visit linked to the request, via the normal booking path', async () => {
    const startAt = new Date(futureSlot().startAt);
    prisma.bookingRequest.findUnique.mockResolvedValue({
      id: 'request-1',
      status: 'PENDING_REVIEW',
      appointmentId: null,
      serviceId: 'service-1',
      preferredDentistId: 'dentist-1',
      requestedStartAt: startAt,
      reason: 'Đau răng',
      phone: '0901234567',
      fullName: 'Nguyen An',
      dob: new Date('1990-01-01'),
    });
    prisma.patient.findMany.mockResolvedValue([
      { id: 'patient-1', fullName: 'Nguyen An', dob: new Date('1990-01-01') },
    ]);
    prisma.dentistService.findFirst.mockResolvedValue({ id: 'assignment-1' });
    appointments.create.mockResolvedValue({ id: 'appt-1' });
    prisma.bookingRequest.findUniqueOrThrow.mockResolvedValue({
      email: null,
      fullName: 'Nguyen An',
      referenceCode: 'GS-1',
    });
    jest.spyOn(service, 'getForStaff').mockResolvedValue({ id: 'request-1' } as any);

    await service.confirm('request-1', { sub: 'staff-1', email: 's@x', permissions: [] } as any);

    expect(appointments.create).toHaveBeenCalledWith(
      {
        patientId: 'patient-1',
        dentistId: 'dentist-1',
        serviceIds: ['service-1'],
        startAt: startAt.toISOString(),
        reason: 'Đau răng',
        source: 'ONLINE',
      },
      expect.objectContaining({ sub: 'staff-1' }),
      { id: 'request-1', expectedStatuses: ['PENDING_REVIEW'] },
    );
  });
});

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
    await expect(service.publicStatus('GS-ABC', { token: 'wrong-token' })).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(prisma.bookingRequest.findUniqueOrThrow).not.toHaveBeenCalled();
  });

  describe('front desk notifications', () => {
    const slot = futureSlot();
    const submit = () =>
      service.createPublic({
        fullName: 'Nguyen An',
        dob: '1990-01-01',
        gender: Gender.FEMALE,
        phone: '0901234567',
        serviceId: 'service-1',
        dentistId: 'dentist-1',
        startAt: slot.startAt,
        consent: true,
      } as any);

    beforeEach(() => {
      prisma.dentistService.findFirst.mockResolvedValue({ id: 'assignment-1' });
      appointments.getAvailability.mockResolvedValue({ availableSlots: ['10:00'] });
      prisma.bookingRequest.create.mockResolvedValue({
        id: 'request-1',
        referenceCode: 'GS-1A2B3C4D5E',
        fullName: 'Nguyen An',
        email: null,
      });
      prisma.bookingRequest.findUniqueOrThrow.mockResolvedValue({
        id: 'request-1',
        referenceCode: 'GS-1A2B3C4D5E',
        fullName: 'Nguyen An',
        phone: '0901234567',
        status: 'PENDING_REVIEW',
        requestedStartAt: new Date(slot.startAt),
        proposedStartAt: null,
        reason: 'Đau răng <hàm>',
        service: { name: 'Khám' },
        preferredDentist: { fullName: 'BS A' },
      });
    });
    afterEach(() => {
      delete process.env.BOOKING_NOTIFY_EMAILS;
    });
    const flush = () => new Promise(resolve => setImmediate(resolve));

    it('emails every configured clinic address about a new request', async () => {
      process.env.BOOKING_NOTIFY_EMAILS = 'letan@gensmile.online, chu@gensmile.online;not-an-email';
      email.send.mockResolvedValue(true);
      await submit();
      await flush();
      const sent = email.send.mock.calls.map((c: any[]) => c[0]);
      expect(sent.map((m: any) => m.to)).toEqual(['letan@gensmile.online', 'chu@gensmile.online']);
      expect(sent[0].subject).toContain('Yêu cầu đặt lịch mới');
      expect(sent[0].html).toContain('0901234567');
      expect(sent[0].html).toContain('Đau răng &lt;hàm&gt;');
    });

    it('sends nothing when no clinic address is configured', async () => {
      await submit();
      await flush();
      expect(email.send).not.toHaveBeenCalled();
    });

    it('still accepts the request when the clinic email fails', async () => {
      process.env.BOOKING_NOTIFY_EMAILS = 'letan@gensmile.online';
      email.send.mockRejectedValue(new Error('SMTP down'));
      await expect(submit()).resolves.toMatchObject({ status: 'PENDING_REVIEW' });
      await flush();
    });

    it('counts only requests waiting on the front desk', async () => {
      prisma.bookingRequest.count = jest.fn().mockResolvedValue(3);
      await expect(service.pendingCount()).resolves.toEqual({ count: 3 });
      expect(prisma.bookingRequest.count).toHaveBeenCalledWith({
        where: { status: { in: ['PENDING_REVIEW', 'PATIENT_ACCEPTED'] } },
      });
    });
  });

  describe('lookup by reference and phone', () => {
    const stored = {
      id: 'request-1',
      accessTokenHash: createHash('sha256').update('right-token').digest('hex'),
      phone: '0901234567',
      contactPersonPhone: '0987654321',
    };
    const full = {
      ...stored,
      referenceCode: 'GS-1A2B3C4D5E',
      status: 'PENDING_REVIEW',
      createdAt: new Date(),
      requestedStartAt: new Date(),
      service: { name: 'Khám', defaultDurationMin: 15 },
      preferredDentist: { fullName: 'BS A' },
      appointment: null,
    };

    beforeEach(() => {
      prisma.bookingRequest.findUnique.mockResolvedValue(stored);
      prisma.bookingRequest.findUniqueOrThrow.mockResolvedValue(full);
    });

    it('accepts the booking phone in any common format and a loosely typed code', async () => {
      const result = await service.publicStatus('gs 1a2b3c4d5e', { phone: '+84 901 234 567' });
      expect(prisma.bookingRequest.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { referenceCode: 'GS-1A2B3C4D5E' } }),
      );
      expect(result.referenceCode).toBe('GS-1A2B3C4D5E');
      expect(result.service).toEqual({ name: 'Khám', durationMinutes: 15 });
      expect(result).not.toHaveProperty('phone');
    });

    it("accepts the guardian's phone", async () => {
      await expect(
        service.publicStatus('GS-1A2B3C4D5E', { phone: '0987 654 321' }),
      ).resolves.toMatchObject({ status: 'PENDING_REVIEW' });
    });

    it('rejects another phone, a missing credential and an unknown code alike', async () => {
      await expect(
        service.publicStatus('GS-1A2B3C4D5E', { phone: '0911111111' }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
      await expect(service.publicStatus('GS-1A2B3C4D5E', {})).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
      prisma.bookingRequest.findUnique.mockResolvedValue(null);
      await expect(service.publicStatus('GS-FFFFFFFFFF', { phone: '0901234567' })).rejects.toThrow(
        'Mã đặt lịch hoặc số điện thoại không đúng',
      );
      expect(prisma.bookingRequest.findUniqueOrThrow).not.toHaveBeenCalled();
    });

    it('lists recent requests for a phone alone, matching the guardian too', async () => {
      prisma.bookingRequest.findMany = jest.fn().mockResolvedValue([full]);
      const result = await service.lookupByPhone('+84 987 654 321');
      const where = prisma.bookingRequest.findMany.mock.calls[0][0].where;
      expect(where.OR).toEqual([{ phone: '0987654321' }, { contactPersonPhone: '0987654321' }]);
      expect(where.createdAt.gte.getTime()).toBeLessThan(Date.now());
      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({ referenceCode: 'GS-1A2B3C4D5E', status: 'PENDING_REVIEW' });
      expect(result[0]).not.toHaveProperty('phone');
      expect(result[0]).not.toHaveProperty('fullName');
    });

    it('rejects a malformed phone before querying', async () => {
      prisma.bookingRequest.findMany = jest.fn();
      await expect(service.lookupByPhone('12345')).rejects.toThrow('Số điện thoại không hợp lệ');
      await expect(service.lookupByPhone(undefined)).rejects.toThrow('Số điện thoại không hợp lệ');
      expect(prisma.bookingRequest.findMany).not.toHaveBeenCalled();
    });

    it('lets the phone holder withdraw the request', async () => {
      prisma.bookingRequest.updateMany = jest.fn().mockResolvedValue({ count: 1 });
      await expect(service.withdraw('GS-1A2B3C4D5E', { phone: '0901234567' })).resolves.toEqual({
        referenceCode: 'GS-1A2B3C4D5E',
        status: 'CANCELLED',
      });
    });
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

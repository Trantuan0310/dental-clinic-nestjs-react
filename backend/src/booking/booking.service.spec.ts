import { UnauthorizedException, ConflictException } from '@nestjs/common';
import { createHash } from 'crypto';
import { Gender } from '@prisma/client';
import { BookingService, EXPIRED_MESSAGE } from './booking.service';

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
        findFirst: jest.fn().mockResolvedValue(null),
      },
      auditLog: { createMany: jest.fn().mockResolvedValue({ count: 0 }) },
      $executeRaw: jest.fn().mockResolvedValue(1),
    };
    prisma.$transaction = jest.fn((fn: (tx: any) => unknown) => fn(prisma));
    appointments = {
      getAvailability: jest.fn(),
      planVisit: jest.fn().mockResolvedValue(plan),
      create: jest.fn(),
    };
    patients = { create: jest.fn(), softDelete: jest.fn().mockResolvedValue(undefined) };
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

    it('counts only requests waiting on the front desk whose time has not passed', async () => {
      prisma.bookingRequest.count = jest.fn().mockResolvedValue(3);
      await expect(service.pendingCount()).resolves.toEqual({ count: 3 });
      const where = prisma.bookingRequest.count.mock.calls[0][0].where;
      const now = where.OR[0].requestedStartAt.gt;
      expect(now).toBeInstanceOf(Date);
      expect(where).toEqual({
        OR: [
          { status: { in: ['PENDING_REVIEW'] }, requestedStartAt: { gt: now } },
          { status: { in: ['PATIENT_ACCEPTED'] }, proposedStartAt: { gt: now } },
          {
            status: { in: ['PATIENT_ACCEPTED'] },
            proposedStartAt: null,
            requestedStartAt: { gt: now },
          },
        ],
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

  describe('requests whose time has passed', () => {
    // 2026-10-01 08:00 at the clinic (UTC+7).
    const NOW = new Date('2026-10-01T01:00:00Z');
    const minutes = (n: number) => new Date(NOW.getTime() + n * 60_000);
    const actor = { sub: 'staff-1', email: 's@x', permissions: [] } as any;
    const request = (over: Record<string, unknown> = {}) => ({
      id: 'request-1',
      referenceCode: 'GS-1A2B3C4D5E',
      status: 'PENDING_REVIEW',
      appointmentId: null,
      serviceId: 'service-1',
      preferredDentistId: 'dentist-1',
      proposedDentistId: null,
      requestedStartAt: minutes(-10),
      proposedStartAt: null,
      reason: null,
      phone: '0901234567',
      contactPersonPhone: null,
      fullName: 'Nguyen An',
      dob: new Date('1990-01-01'),
      gender: 'FEMALE',
      email: null,
      accessTokenHash: createHash('sha256').update('right-token').digest('hex'),
      ...over,
    });

    beforeEach(() => {
      jest.useFakeTimers({ now: NOW });
      prisma.bookingRequest.updateMany = jest.fn().mockResolvedValue({ count: 1 });
      prisma.bookingRequest.findMany = jest.fn().mockResolvedValue([]);
    });
    afterEach(() => {
      jest.useRealTimers();
      delete process.env.BOOKING_MIN_LEAD_MIN;
    });

    it('expires open, unbooked requests past their effective time in one conditional update', async () => {
      prisma.bookingRequest.findMany.mockResolvedValue([
        { id: 'r1', referenceCode: 'GS-1' },
        { id: 'r2', referenceCode: 'GS-2' },
      ]);
      prisma.bookingRequest.updateMany.mockResolvedValue({ count: 2 });

      await expect(service.expireOverdue()).resolves.toEqual({ expired: 2 });

      const { where, data } = prisma.bookingRequest.updateMany.mock.calls[0][0];
      expect(data).toEqual({ status: 'EXPIRED', responseMessage: EXPIRED_MESSAGE });
      expect(where.appointmentId).toBeNull();
      expect(where.id).toEqual({ in: ['r1', 'r2'] });
      expect(where.OR).toEqual([
        {
          status: { in: ['PENDING_REVIEW', 'NEEDS_INFORMATION'] },
          requestedStartAt: { lte: NOW },
        },
        { status: { in: ['PROPOSED', 'PATIENT_ACCEPTED'] }, proposedStartAt: { lte: NOW } },
        {
          status: { in: ['PROPOSED', 'PATIENT_ACCEPTED'] },
          proposedStartAt: null,
          requestedStartAt: { lte: NOW },
        },
      ]);
      expect(prisma.auditLog.createMany).toHaveBeenCalledTimes(1);
      expect(prisma.auditLog.createMany.mock.calls[0][0].data).toEqual(
        ['r1', 'r2'].map((id, i) => ({
          action: 'BOOKING_REQUEST_EXPIRED',
          actorUserId: null,
          targetType: 'booking_request',
          targetId: id,
          metadata: { referenceCode: 'GS-' + (i + 1), expiredAt: NOW.toISOString() },
        })),
      );
    });

    it('audits only the requests actually expired when one was handled in between', async () => {
      prisma.bookingRequest.findMany
        .mockResolvedValueOnce([
          { id: 'r1', referenceCode: 'GS-1' },
          { id: 'r2', referenceCode: 'GS-2' },
        ])
        .mockResolvedValueOnce([{ id: 'r2', referenceCode: 'GS-2' }]);
      prisma.bookingRequest.updateMany.mockResolvedValue({ count: 1 });

      await expect(service.expireOverdue()).resolves.toEqual({ expired: 1 });
      const rows = prisma.auditLog.createMany.mock.calls[0][0].data;
      expect(rows.map((r: any) => r.targetId)).toEqual(['r2']);
    });

    it('tells the public page a request is overdue, by the server clock', async () => {
      prisma.bookingRequest.findUnique.mockResolvedValue(request());
      prisma.bookingRequest.findUniqueOrThrow.mockResolvedValue({
        ...request({ status: 'PROPOSED', proposedStartAt: minutes(-1) }),
        createdAt: NOW,
        appointment: null,
      });
      const overdue = await service.publicStatus('GS-1A2B3C4D5E', { phone: '0901234567' });
      expect(overdue.overdue).toBe(true);

      prisma.bookingRequest.findUniqueOrThrow.mockResolvedValue({
        ...request({ status: 'PROPOSED', proposedStartAt: minutes(30) }),
        createdAt: NOW,
        appointment: null,
      });
      const upcoming = await service.publicStatus('GS-1A2B3C4D5E', { phone: '0901234567' });
      expect(upcoming.overdue).toBe(false);
    });

    it('does nothing (and logs nothing) when no request is overdue', async () => {
      await expect(service.expireOverdue()).resolves.toEqual({ expired: 0 });
      expect(prisma.bookingRequest.updateMany).not.toHaveBeenCalled();
      expect(prisma.auditLog.createMany).not.toHaveBeenCalled();
    });

    it('refuses to confirm a request whose time has passed, before touching patient records', async () => {
      prisma.bookingRequest.findUnique.mockResolvedValue(request());
      await expect(service.confirm('request-1', actor)).rejects.toThrow('Giờ hẹn đã qua');
      expect(prisma.dentistService.findFirst).not.toHaveBeenCalled();
      expect(prisma.patient.findMany).not.toHaveBeenCalled();
      expect(patients.create).not.toHaveBeenCalled();
      expect(appointments.create).not.toHaveBeenCalled();
    });

    it('uses the accepted proposed time, not the original one, to decide', async () => {
      prisma.bookingRequest.findUnique.mockResolvedValue(
        request({
          status: 'PATIENT_ACCEPTED',
          requestedStartAt: minutes(24 * 60),
          proposedStartAt: minutes(-5),
          proposedDentistId: 'dentist-2',
        }),
      );
      await expect(service.confirm('request-1', actor)).rejects.toBeInstanceOf(ConflictException);
      expect(patients.create).not.toHaveBeenCalled();
    });

    it('archives the patient record it just created when the visit cannot be booked', async () => {
      prisma.bookingRequest.findUnique.mockResolvedValue(
        request({ requestedStartAt: minutes(24 * 60) }),
      );
      prisma.dentistService.findFirst.mockResolvedValue({ id: 'assignment-1' });
      patients.create.mockResolvedValue({ id: 'patient-new' });
      appointments.create.mockRejectedValue(new ConflictException('Slot taken'));

      await expect(service.confirm('request-1', actor)).rejects.toThrow('Slot taken');
      expect(patients.softDelete).toHaveBeenCalledWith(
        'patient-new',
        expect.objectContaining({ reason: expect.stringContaining('GS-1A2B3C4D5E') }),
        actor,
      );
    });

    it('leaves an existing patient record alone when the visit cannot be booked', async () => {
      prisma.bookingRequest.findUnique.mockResolvedValue(
        request({ requestedStartAt: minutes(24 * 60) }),
      );
      prisma.dentistService.findFirst.mockResolvedValue({ id: 'assignment-1' });
      prisma.patient.findMany.mockResolvedValue([
        { id: 'patient-1', fullName: 'Nguyen An', dob: new Date('1990-01-01') },
      ]);
      appointments.create.mockRejectedValue(new ConflictException('Slot taken'));

      await expect(service.confirm('request-1', actor)).rejects.toThrow('Slot taken');
      expect(patients.softDelete).not.toHaveBeenCalled();
    });

    it('does not let the patient accept a proposed time that has passed', async () => {
      prisma.bookingRequest.findUnique.mockResolvedValue(request());
      prisma.bookingRequest.findUniqueOrThrow.mockResolvedValue(
        request({ status: 'PROPOSED', proposedStartAt: minutes(-1) }),
      );
      await expect(
        service.acceptProposal('GS-1A2B3C4D5E', { phone: '0901234567' }),
      ).rejects.toThrow('Giờ phòng khám đề xuất đã qua');
      expect(prisma.bookingRequest.updateMany).not.toHaveBeenCalled();
    });

    it('does not take new details for a request whose time has passed', async () => {
      prisma.bookingRequest.findUnique.mockResolvedValue(request());
      prisma.bookingRequest.findUniqueOrThrow.mockResolvedValue(
        request({ status: 'NEEDS_INFORMATION' }),
      );
      await expect(
        service.updateDetails('GS-1A2B3C4D5E', { phone: '0901234567' }, {
          fullName: 'Nguyen An',
          dob: '1990-01-01',
          gender: Gender.FEMALE,
          phone: '0901234567',
        } as any),
      ).rejects.toThrow('Giờ hẹn của yêu cầu này đã qua');
      expect(prisma.bookingRequest.updateMany).not.toHaveBeenCalled();
    });

    it('does not ask for details on an overdue request, but still lets staff propose a new time', async () => {
      prisma.bookingRequest.findUnique.mockResolvedValue(request());
      await expect(
        service.requestInformation('request-1', { message: 'Cần CCCD' }, actor),
      ).rejects.toThrow('Giờ hẹn đã qua');

      const newTime = new Date('2026-10-02T03:00:00Z'); // 10:00 next day at the clinic
      prisma.dentistService.findFirst.mockResolvedValue({ id: 'assignment-1' });
      appointments.getAvailability.mockResolvedValue({ availableSlots: ['10:00'] });
      jest.spyOn(service, 'getForStaff').mockResolvedValue({ id: 'request-1' } as any);
      await service.propose(
        'request-1',
        { dentistId: 'dentist-1', startAt: newTime.toISOString(), message: 'Mời đến giờ này' },
        actor,
      );
      expect(prisma.bookingRequest.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'PROPOSED', proposedStartAt: newTime }),
        }),
      );
    });

    it('lists open requests nearest time first, then the rest newest first', async () => {
      const soon = request({ id: 'soon', requestedStartAt: minutes(60) });
      const proposedEarly = request({
        id: 'proposed',
        status: 'PROPOSED',
        requestedStartAt: minutes(24 * 60),
        proposedStartAt: minutes(30),
      });
      const late = request({ id: 'late', requestedStartAt: minutes(120) });
      const done = request({ id: 'done', status: 'EXPIRED' });
      prisma.bookingRequest.findMany
        .mockResolvedValueOnce([soon, late, proposedEarly])
        .mockResolvedValueOnce([done]);

      const rows = await service.listForStaff({});
      expect(rows.map((r: any) => r.id)).toEqual(['proposed', 'soon', 'late', 'done']);
      expect(rows[0]).not.toHaveProperty('accessTokenHash');
      expect(prisma.bookingRequest.findMany.mock.calls[1][0]).toMatchObject({
        where: {
          status: {
            notIn: ['PENDING_REVIEW', 'NEEDS_INFORMATION', 'PROPOSED', 'PATIENT_ACCEPTED'],
          },
        },
        orderBy: { createdAt: 'desc' },
        take: 97,
      });
    });

    it('filters on EXPIRED like any closed status', async () => {
      await service.listForStaff({ status: 'EXPIRED' as any });
      expect(prisma.bookingRequest.findMany).toHaveBeenCalledTimes(1);
      expect(prisma.bookingRequest.findMany.mock.calls[0][0]).toMatchObject({
        where: { status: 'EXPIRED' },
        orderBy: { createdAt: 'desc' },
      });
    });

    describe('minimum notice for online requests', () => {
      const submit = (startAt: Date) =>
        service.createPublic({
          fullName: 'Nguyen An',
          dob: '1990-01-01',
          gender: Gender.FEMALE,
          phone: '0901234567',
          serviceId: 'service-1',
          dentistId: 'dentist-1',
          startAt: startAt.toISOString(),
          consent: true,
        } as any);

      beforeEach(() => {
        prisma.dentistService.findFirst.mockResolvedValue({ id: 'assignment-1' });
        appointments.getAvailability.mockResolvedValue({
          availableSlots: ['08:30', '09:30', '10:00', '10:30', '14:00'],
        });
      });

      it('offers only slots at least 2 hours ahead by default', async () => {
        const result = await service.slots({
          serviceId: 'service-1',
          dentistId: 'dentist-1',
          date: '2026-10-01',
        });
        expect(result.availableSlots).toEqual(['10:30', '14:00']);
        expect(result.minLeadMinutes).toBe(120);
      });

      it('follows BOOKING_MIN_LEAD_MIN', async () => {
        process.env.BOOKING_MIN_LEAD_MIN = '30';
        const result = await service.slots({
          serviceId: 'service-1',
          dentistId: 'dentist-1',
          date: '2026-10-01',
        });
        expect(result.availableSlots).toEqual(['09:30', '10:00', '10:30', '14:00']);
      });

      it('refuses a request inside the notice period before writing anything', async () => {
        await expect(submit(minutes(90))).rejects.toThrow('ít nhất 2 giờ');
        expect(prisma.bookingRequest.create).not.toHaveBeenCalled();
      });

      it('refuses a second open request from the same phone for the same time', async () => {
        prisma.bookingRequest.findFirst.mockResolvedValue({ id: 'request-0' });
        const startAt = new Date('2026-10-01T07:00:00Z'); // 14:00 at the clinic
        await expect(submit(startAt)).rejects.toThrow('đã có yêu cầu đặt lịch đang chờ xử lý');
        expect(prisma.bookingRequest.findFirst).toHaveBeenCalledWith({
          where: {
            phone: '0901234567',
            status: {
              in: ['PENDING_REVIEW', 'NEEDS_INFORMATION', 'PROPOSED', 'PATIENT_ACCEPTED'],
            },
            appointmentId: null,
            OR: [{ requestedStartAt: startAt }, { proposedStartAt: startAt }],
          },
          select: { id: true },
        });
        expect(prisma.bookingRequest.create).not.toHaveBeenCalled();
      });

      it('checks for a duplicate and inserts under a per-phone lock in one transaction', async () => {
        const order: string[] = [];
        prisma.$executeRaw.mockImplementation((strings: TemplateStringsArray, ...values: any[]) => {
          order.push('lock:' + strings.join('?') + ':' + values.join(','));
          return Promise.resolve(1);
        });
        prisma.bookingRequest.findFirst.mockImplementation(() => {
          order.push('findFirst');
          return Promise.resolve(null);
        });
        prisma.bookingRequest.create.mockImplementation(() => {
          order.push('create');
          return Promise.resolve({ id: 'r1', referenceCode: 'GS-1', fullName: 'An', email: null });
        });
        await submit(new Date('2026-10-01T07:00:00Z'));
        expect(prisma.$transaction).toHaveBeenCalledTimes(1);
        expect(order).toEqual([
          'lock:SELECT pg_advisory_xact_lock(?::int4, hashtext(?)):3,0901234567',
          'findFirst',
          'create',
        ]);
      });
    });
  });
});

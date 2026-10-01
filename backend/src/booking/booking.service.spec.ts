import { UnauthorizedException, ConflictException, ForbiddenException } from '@nestjs/common';
import { createHash } from 'crypto';
import { Gender } from '@prisma/client';
import { BookingService, EXPIRED_MESSAGE } from './booking.service';
import { AvailabilityService } from '../appointments/availability.service';

const plan = {
  services: [],
  durationMin: 30,
  bufferBeforeMin: 5,
  bufferAfterMin: 10,
};

/** A day open around the clock, with nothing booked. */
const openDay = {
  date: '2099-01-01',
  windows: [{ start: new Date(0), end: new Date(8.64e15) }],
  blocked: [],
  bookings: [],
  closedAllDay: false,
  closedReason: null,
  changedHours: false,
  defaultSlotMin: 30,
};

describe('BookingService public request security and validation', () => {
  let service: BookingService;
  let prisma: any;
  let appointments: any;
  let patients: any;
  let audit: any;
  let email: any;
  let availability: any;

  beforeEach(() => {
    prisma = {
      dentistService: { findFirst: jest.fn() },
      patient: {
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      // patientsByPhone: ids of records whose stored phone normalizes to a match.
      $queryRaw: jest.fn().mockResolvedValue([]),
      bookingRequest: {
        create: jest.fn(),
        update: jest.fn(),
        findUnique: jest.fn(),
        findUniqueOrThrow: jest.fn(),
        findFirst: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
        groupBy: jest.fn().mockResolvedValue([]),
      },
      appointment: {
        count: jest.fn().mockResolvedValue(0),
        findFirst: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([]),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      patientPhoneHistory: { create: jest.fn() },
      auditLog: { createMany: jest.fn().mockResolvedValue({ count: 0 }) },
      $executeRaw: jest.fn().mockResolvedValue(1),
    };
    prisma.$transaction = jest.fn((fn: (tx: any) => unknown) => fn(prisma));
    appointments = {
      getAvailability: jest.fn(),
      planVisit: jest.fn().mockResolvedValue(plan),
      validateDentist: jest.fn().mockResolvedValue({}),
      create: jest.fn(),
    };
    patients = { create: jest.fn(), softDelete: jest.fn().mockResolvedValue(undefined) };
    audit = { log: jest.fn().mockResolvedValue(undefined) };
    email = { send: jest.fn().mockResolvedValue(false) };
    // The real request-plan/issue rules (shared with schedule changes), over
    // a stubbed calendar.
    availability = Object.assign(new AvailabilityService(prisma), {
      checkSlot: jest.fn().mockResolvedValue(null),
      loadDay: jest.fn().mockResolvedValue(openDay),
    });
    service = new BookingService(prisma, appointments, patients, audit, email, availability);
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
      expect(result[0]).toMatchObject({ status: 'PENDING_REVIEW' });
      expect(result[0]).not.toHaveProperty('phone');
      expect(result[0]).not.toHaveProperty('fullName');
      // A4-07: no service or dentist for whoever knows the number; a masked
      // name tells a family's requests apart.
      expect(result[0]).not.toHaveProperty('service');
      expect(result[0]).not.toHaveProperty('dentist');
      expect(result[0]).toHaveProperty('patientInitials');
      // The phone alone must not hand out what opens the request.
      expect(result[0]).not.toHaveProperty('referenceCode');
      expect(result[0]).not.toHaveProperty('responseMessage');
      expect(result[0]).not.toHaveProperty('canManage');
    });

    it('shows the status by reference + phone, but only the token allows changes', async () => {
      await expect(
        service.publicStatus('GS-1A2B3C4D5E', { phone: '0901234567' }),
      ).resolves.toMatchObject({ canManage: false });
      await expect(
        service.publicStatus('GS-1A2B3C4D5E', { token: 'right-token' }),
      ).resolves.toMatchObject({ canManage: true });
    });

    it('rejects a malformed phone before querying', async () => {
      prisma.bookingRequest.findMany = jest.fn();
      await expect(service.lookupByPhone('12345')).rejects.toThrow('Số điện thoại không hợp lệ');
      await expect(service.lookupByPhone(undefined)).rejects.toThrow('Số điện thoại không hợp lệ');
      expect(prisma.bookingRequest.findMany).not.toHaveBeenCalled();
    });

    it('refuses every change made with the phone alone', async () => {
      prisma.bookingRequest.updateMany = jest.fn().mockResolvedValue({ count: 1 });
      const phone = { phone: '0901234567' };
      await expect(service.withdraw('GS-1A2B3C4D5E', phone)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      await expect(service.acceptProposal('GS-1A2B3C4D5E', phone)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      await expect(service.declineProposal('GS-1A2B3C4D5E', phone)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      await expect(
        service.updateDetails('GS-1A2B3C4D5E', phone, { fullName: 'X Y' } as any),
      ).rejects.toThrow('mở đường link trong email');
      expect(prisma.bookingRequest.updateMany).not.toHaveBeenCalled();
    });

    it('lets the link holder withdraw, keeping the clinic message and telling the clinic', async () => {
      process.env.BOOKING_NOTIFY_EMAILS = 'desk@clinic.vn';
      try {
        prisma.bookingRequest.updateMany = jest.fn().mockResolvedValue({ count: 1 });
        prisma.bookingRequest.findUniqueOrThrow.mockResolvedValue({ ...full, fullName: 'An' });
        await expect(
          service.withdraw('GS-1A2B3C4D5E', { token: 'right-token' }, { message: 'Bận việc' }),
        ).resolves.toEqual({ referenceCode: 'GS-1A2B3C4D5E', status: 'CANCELLED' });
        const { data } = prisma.bookingRequest.updateMany.mock.calls[0][0];
        expect(data).toEqual({ status: 'CANCELLED', patientMessage: 'Bận việc' });
        expect(data).not.toHaveProperty('responseMessage');
        expect(audit.log).toHaveBeenCalledWith(
          expect.objectContaining({
            action: 'BOOKING_REQUEST_WITHDRAWN',
            metadata: expect.objectContaining({ note: 'Bận việc' }),
          }),
        );
        await new Promise(resolve => setImmediate(resolve));
        expect(email.send).toHaveBeenCalledWith(
          expect.objectContaining({
            to: 'desk@clinic.vn',
            subject: expect.stringContaining('rút'),
          }),
        );
      } finally {
        delete process.env.BOOKING_NOTIFY_EMAILS;
      }
    });
  });

  it('does not create a request if the time was taken meanwhile, and says why', async () => {
    const slot = futureSlot();
    prisma.dentistService.findFirst.mockResolvedValue({ id: 'assignment-1' });
    availability.checkSlot.mockResolvedValue({
      kind: 'SLOT_CONFLICT',
      message: 'Khung giờ này đã có lịch hẹn',
    });
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
    ).rejects.toThrow(new ConflictException('Khung giờ này đã có lịch hẹn'));
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
    // The interval rules, and online also the times the public page offers.
    const start = new Date(slot.startAt);
    expect(availability.checkSlot).toHaveBeenCalledWith(
      'dentist-1',
      start,
      new Date(start.getTime() + 30 * 60_000),
      { buffers: { beforeMin: 5, afterMin: 10 } },
    );
    expect(appointments.getAvailability).toHaveBeenCalledWith({
      dentistId: 'dentist-1',
      date: slot.date,
      slotDuration: 30,
      bufferBeforeMin: 5,
      bufferAfterMin: 10,
    });
  });

  it('refuses online a start the public page does not offer (off the slot grid)', async () => {
    const slot = futureSlot();
    prisma.dentistService.findFirst.mockResolvedValue({ id: 'assignment-1' });
    appointments.getAvailability.mockResolvedValue({ availableSlots: ['09:00', '09:15'] });
    await expect(
      service.createPublic({
        fullName: 'Nguyen An',
        dob: '1990-01-01',
        gender: Gender.FEMALE,
        phone: '0901234567',
        serviceId: 'service-1',
        dentistId: 'dentist-1',
        startAt: new Date(slot.date + 'T09:07:00+07:00').toISOString(),
        consent: true,
      } as any),
    ).rejects.toThrow('không nằm trong các giờ nhận đặt trực tuyến');
    expect(prisma.bookingRequest.create).not.toHaveBeenCalled();
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
    // The service itself must be offered online too.
    expect(where.service).toEqual({ isActive: true, bookableOnline: true });
    // Online booking also needs a dentist taking new patients and not on
    // leave; a PENDING_SETUP account still qualifies.
    expect(where.dentist.dentistProfile.is.acceptsNewPatients).toBe(true);
    expect(where.dentist.dentistProfile.is.employee).toEqual({ employmentStatus: 'ACTIVE' });
    expect(where.dentist.status).toEqual({ not: 'DEACTIVATED' });
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
      {
        id: 'patient-1',
        fullName: 'Nguyen An',
        dob: new Date('1990-01-01'),
        primaryPhone: '0901234567',
      },
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
      {
        id: 'request-1',
        expectedStatuses: ['PENDING_REVIEW'],
        plan,
        // Attached only as read: the times it was confirmed from.
        match: { requestedStartAt: startAt, proposedStartAt: undefined },
        tx: prisma,
      },
    );
    // Matching and creating the patient happen under the request phone's lock.
    expect(prisma.$executeRaw).toHaveBeenCalled();
    expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      maxWait: 10_000,
      timeout: 20_000,
    });
    // A request already received is still handled if the service was taken
    // offline since.
    expect(prisma.dentistService.findFirst.mock.calls[0][0].where.service).toEqual({
      isActive: true,
    });
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

    it('rolls the new patient record back with a visit that cannot be booked', async () => {
      prisma.bookingRequest.findUnique.mockResolvedValue(
        request({ requestedStartAt: minutes(24 * 60) }),
      );
      prisma.dentistService.findFirst.mockResolvedValue({ id: 'assignment-1' });
      patients.create.mockResolvedValue({ id: 'patient-new' });
      appointments.create.mockRejectedValue(new ConflictException('Slot taken'));

      await expect(service.confirm('request-1', actor)).rejects.toThrow('Slot taken');
      // Created in confirm()'s transaction (the mock client is prisma), so
      // the failed booking rolls it back; nothing is left to archive.
      expect(patients.create).toHaveBeenCalledWith(expect.anything(), actor, prisma);
      expect(patients.softDelete).not.toHaveBeenCalled();
    });

    it('leaves an existing patient record alone when the visit cannot be booked', async () => {
      prisma.bookingRequest.findUnique.mockResolvedValue(
        request({ requestedStartAt: minutes(24 * 60) }),
      );
      prisma.dentistService.findFirst.mockResolvedValue({ id: 'assignment-1' });
      prisma.patient.findMany.mockResolvedValue([
        {
          id: 'patient-1',
          fullName: 'Nguyen An',
          dob: new Date('1990-01-01'),
          primaryPhone: '0901234567',
        },
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
        service.acceptProposal('GS-1A2B3C4D5E', { token: 'right-token' }),
      ).rejects.toThrow('Giờ phòng khám đề xuất đã qua');
      expect(prisma.bookingRequest.updateMany).not.toHaveBeenCalled();
    });

    it('does not take new details for a request whose time has passed', async () => {
      prisma.bookingRequest.findUnique.mockResolvedValue(request());
      prisma.bookingRequest.findUniqueOrThrow.mockResolvedValue(
        request({ status: 'NEEDS_INFORMATION' }),
      );
      await expect(
        service.updateDetails('GS-1A2B3C4D5E', { token: 'right-token' }, {
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

      it('refuses a second open request for the same person and time', async () => {
        const startAt = new Date('2026-10-01T07:00:00Z'); // 14:00 at the clinic
        prisma.bookingRequest.findMany.mockResolvedValue([
          {
            fullName: 'nguyen  AN',
            dob: new Date('1990-01-01'),
            requestedStartAt: startAt,
            proposedStartAt: null,
          },
        ]);
        await expect(submit(startAt)).rejects.toThrow('đã có yêu cầu đặt lịch đang chờ xử lý');
        expect(prisma.bookingRequest.findMany).toHaveBeenCalledWith({
          where: {
            phone: '0901234567',
            status: {
              in: ['PENDING_REVIEW', 'NEEDS_INFORMATION', 'PROPOSED', 'PATIENT_ACCEPTED'],
            },
            appointmentId: null,
          },
          select: { fullName: true, dob: true, requestedStartAt: true, proposedStartAt: true },
        });
        expect(prisma.bookingRequest.create).not.toHaveBeenCalled();
      });

      it('accepts the same time from a shared phone for another person (A4-04)', async () => {
        const startAt = new Date('2026-10-01T07:00:00Z');
        prisma.bookingRequest.findMany.mockResolvedValue([
          {
            fullName: 'Nguyen Binh',
            dob: new Date('2018-05-05'),
            requestedStartAt: startAt,
            proposedStartAt: null,
          },
        ]);
        prisma.bookingRequest.create.mockResolvedValue({
          id: 'r2',
          referenceCode: 'GS-2',
          fullName: 'Nguyen An',
          email: null,
        });
        await expect(submit(startAt)).resolves.toMatchObject({ status: 'PENDING_REVIEW' });
      });

      it('checks for a duplicate and inserts under a per-phone lock in one transaction', async () => {
        const order: string[] = [];
        prisma.$executeRaw.mockImplementation((strings: TemplateStringsArray, ...values: any[]) => {
          order.push('lock:' + strings.join('?') + ':' + values.join(','));
          return Promise.resolve(1);
        });
        prisma.bookingRequest.findMany.mockImplementation(() => {
          order.push('findMany');
          return Promise.resolve([]);
        });
        prisma.bookingRequest.create.mockImplementation(() => {
          order.push('create');
          return Promise.resolve({ id: 'r1', referenceCode: 'GS-1', fullName: 'An', email: null });
        });
        await submit(new Date('2026-10-01T07:00:00Z'));
        expect(prisma.$transaction).toHaveBeenCalledTimes(1);
        expect(order).toEqual([
          "lock:SELECT set_config('lock_timeout', ?::text, true):5000",
          'lock:SELECT pg_advisory_xact_lock(?::int4, hashtext(?)):3,0901234567',
          "lock:SELECT set_config('lock_timeout', '0', true):",
          'findMany',
          'create',
        ]);
      });
    });
  });

  describe('audit round 2 (booking)', () => {
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
      requestedStartAt: minutes(24 * 60),
      proposedStartAt: null,
      reason: null,
      phone: '0901234567',
      contactPersonName: null,
      contactPersonPhone: null,
      fullName: 'Nguyễn Bé An',
      dob: new Date('2020-03-04'),
      gender: 'FEMALE',
      email: 'me@x.vn',
      accessTokenHash: createHash('sha256').update('right-token').digest('hex'),
      createdAt: NOW,
      appointment: null,
      ...over,
    });

    beforeEach(() => {
      jest.useFakeTimers({ now: NOW });
      prisma.bookingRequest.updateMany = jest.fn().mockResolvedValue({ count: 1 });
      prisma.bookingRequest.findMany = jest.fn().mockResolvedValue([]);
      prisma.dentistService.findFirst.mockResolvedValue({ id: 'assignment-1' });
    });
    afterEach(() => jest.useRealTimers());

    describe('matching the patient record on confirm', () => {
      beforeEach(() => {
        prisma.bookingRequest.findUniqueOrThrow.mockResolvedValue({
          email: null,
          fullName: 'Nguyễn Bé An',
          referenceCode: 'GS-1A2B3C4D5E',
        });
        appointments.create.mockResolvedValue({ id: 'appt-1' });
        jest.spyOn(service, 'getForStaff').mockResolvedValue({ id: 'request-1' } as any);
      });

      it("finds a child's record held under the guardian's phone, in both phone formats", async () => {
        prisma.bookingRequest.findUnique.mockResolvedValue(
          request({ contactPersonName: 'Mẹ', contactPersonPhone: '0987654321' }),
        );
        prisma.patient.findMany.mockResolvedValue([
          { id: 'mother', fullName: 'Trần Thị Mẹ', dob: new Date('1990-01-01') },
        ]);
        prisma.$queryRaw.mockResolvedValue([{ id: 'mother' }]);
        await expect(service.confirm('request-1', actor)).rejects.toThrow('chọn tạo hồ sơ mới');
        // Both the request's and the guardian's phone, normalized to 0xxx; the
        // SQL normalizes the stored values ("090 123 4567", "+84…") the same way.
        const sqlArgs = prisma.$queryRaw.mock.calls[0].slice(1);
        expect(sqlArgs).toContainEqual(['0901234567', '0987654321']);
        expect(prisma.patient.findMany.mock.calls[0][0].where).toEqual({
          deletedAt: null,
          id: { in: ['mother'] },
        });
        expect(patients.create).not.toHaveBeenCalled();
      });

      it('matches the name after NFC, whitespace and case folding', async () => {
        prisma.bookingRequest.findUnique.mockResolvedValue(request());
        prisma.patient.findMany.mockResolvedValue([
          {
            id: 'mother',
            fullName: 'Trần Thị Mẹ',
            dob: new Date('1990-01-01'),
            primaryPhone: '0901234567',
          },
          {
            id: 'child',
            fullName: '  NGUYỄN   bé an '.normalize('NFD'),
            dob: new Date('2020-03-04'),
            primaryPhone: '+84 901 234 567',
          },
        ]);
        await service.confirm('request-1', actor);
        expect(appointments.create.mock.calls[0][0].patientId).toBe('child');
        expect(patients.create).not.toHaveBeenCalled();
      });

      it('never picks a record found only through a guardian phone by itself', async () => {
        prisma.bookingRequest.findUnique.mockResolvedValue(request());
        prisma.patient.findMany.mockResolvedValue([
          // Same name and date of birth, but on file under the request's
          // number only as its guardian phone.
          {
            id: 'child',
            fullName: 'Nguyễn Bé An',
            dob: new Date('2020-03-04'),
            primaryPhone: null,
          },
        ]);
        await expect(service.confirm('request-1', actor)).rejects.toThrow('chọn hồ sơ phù hợp');
        expect(appointments.create).not.toHaveBeenCalled();
        expect(patients.create).not.toHaveBeenCalled();
      });

      it('creates a new record when the front desk asks, without matching', async () => {
        prisma.bookingRequest.findUnique.mockResolvedValue(request());
        patients.create.mockResolvedValue({ id: 'patient-new' });
        await service.confirm('request-1', actor, { createNewPatient: true });
        expect(prisma.patient.findMany).not.toHaveBeenCalled();
        expect(patients.create).toHaveBeenCalledWith(
          expect.objectContaining({ fullName: 'Nguyễn Bé An', primaryPhone: '0901234567' }),
          actor,
          prisma,
        );
        expect(appointments.create.mock.calls[0][0].patientId).toBe('patient-new');
        expect(audit.log).toHaveBeenCalledWith(
          expect.objectContaining({
            action: 'BOOKING_REQUEST_CONFIRMED',
            metadata: expect.objectContaining({ patientCreated: true }),
          }),
        );
      });

      it('refuses a chosen record and "new record" together', async () => {
        prisma.bookingRequest.findUnique.mockResolvedValue(request());
        await expect(
          service.confirm('request-1', actor, { patientId: 'p1', createNewPatient: true }),
        ).rejects.toThrow('không chọn cả hai');
        expect(appointments.create).not.toHaveBeenCalled();
      });

      it("accepts a chosen record that has the request's phone as guardian phone", async () => {
        prisma.bookingRequest.findUnique.mockResolvedValue(request());
        prisma.patient.findFirst.mockResolvedValue({
          id: 'child',
          primaryPhone: null,
          contactPersonPhone: '+84901234567',
        });
        await service.confirm('request-1', actor, { patientId: 'child' });
        expect(appointments.create.mock.calls[0][0].patientId).toBe('child');
      });

      it('lists candidates saying which phone matched', async () => {
        prisma.bookingRequest.findUnique.mockResolvedValue(request());
        prisma.patient.findMany.mockResolvedValue([
          {
            id: 'mother',
            code: 'BN1',
            fullName: 'Trần Thị Mẹ',
            dob: new Date('1990-01-01'),
            primaryPhone: '0901234567',
            contactPersonName: null,
            contactPersonPhone: null,
          },
          {
            id: 'child',
            code: 'BN2',
            fullName: 'Nguyễn Bé An',
            dob: new Date('2020-03-04'),
            primaryPhone: null,
            contactPersonName: 'Mẹ',
            contactPersonPhone: '+84 901 234 567',
          },
        ]);
        const result = await service.patientMatches('request-1');
        expect(result.map(r => [r.id, r.matchedBy, r.sameNameAndDob])).toEqual([
          ['mother', ['primaryPhone'], false],
          ['child', ['contactPersonPhone'], true],
        ]);
      });
    });

    it('refuses to ask for details while a proposal is open, keeping the agreed time', async () => {
      for (const status of ['PROPOSED', 'PATIENT_ACCEPTED']) {
        prisma.bookingRequest.findUnique.mockResolvedValue(
          request({ status, proposedStartAt: minutes(48 * 60), proposedDentistId: 'dentist-2' }),
        );
        await expect(
          service.requestInformation('request-1', { message: 'Cần CCCD' }, actor),
        ).rejects.toThrow('đang có giờ đề xuất');
      }
      expect(prisma.bookingRequest.updateMany).not.toHaveBeenCalled();
    });

    describe('what the patient sees once booked', () => {
      beforeEach(() => {
        prisma.bookingRequest.findUnique.mockResolvedValue(request());
      });

      it("shows the visit's dentist and time, not the ones asked for", async () => {
        prisma.bookingRequest.findUniqueOrThrow.mockResolvedValue(
          request({
            status: 'CONFIRMED',
            appointmentId: 'appt-1',
            preferredDentist: { fullName: 'BS A' },
            appointment: {
              status: 'SCHEDULED',
              startAt: minutes(72 * 60),
              endAt: minutes(72 * 60 + 30),
              rescheduleCount: 1,
              deletedAt: null,
              dentist: { fullName: 'BS B' },
            },
          }),
        );
        const result = await service.publicStatus('GS-1A2B3C4D5E', { phone: '0901234567' });
        expect(result.dentist.fullName).toBe('BS B');
        expect(result.appointment).toEqual({
          startAt: minutes(72 * 60),
          endAt: minutes(72 * 60 + 30),
          status: 'SCHEDULED',
          rescheduled: true,
        });
        const include = prisma.bookingRequest.findUniqueOrThrow.mock.calls[0][0].include;
        expect(include.appointment.select.dentist).toEqual({ select: { fullName: true } });
      });

      it('reports a visit moved without a reschedule count (dentist transfer) as moved', async () => {
        prisma.bookingRequest.findUniqueOrThrow.mockResolvedValue(
          request({
            status: 'CONFIRMED',
            appointment: {
              status: 'CONFIRMED',
              startAt: minutes(60),
              endAt: minutes(90),
              rescheduleCount: 0,
              deletedAt: null,
              dentist: { fullName: 'BS C' },
              _count: { rescheduleLogs: 1 },
            },
          }),
        );
        const result = await service.publicStatus('GS-1A2B3C4D5E', { phone: '0901234567' });
        expect(result.appointment?.rescheduled).toBe(true);
        expect(result.dentist.fullName).toBe('BS C');
      });

      it('reports an archived visit as cancelled', async () => {
        prisma.bookingRequest.findUniqueOrThrow.mockResolvedValue(
          request({
            status: 'CONFIRMED',
            appointment: {
              status: 'SCHEDULED',
              startAt: minutes(60),
              endAt: minutes(90),
              rescheduleCount: 0,
              deletedAt: NOW,
              dentist: { fullName: 'BS B' },
            },
          }),
        );
        const result = await service.publicStatus('GS-1A2B3C4D5E', { phone: '0901234567' });
        expect(result.appointment?.status).toBe('CANCELLED');
      });

      it("gives the front desk the visit's dentist too", async () => {
        prisma.bookingRequest.findUnique.mockResolvedValue(request());
        await service.getForStaff('request-1');
        const include = prisma.bookingRequest.findUnique.mock.calls[0][0].include;
        expect(include.appointment.select.dentist).toEqual({
          select: { id: true, fullName: true },
        });
      });
    });

    describe('details sent by the patient', () => {
      const update = (dto: Record<string, unknown>) =>
        service.updateDetails('GS-1A2B3C4D5E', { token: 'right-token' }, dto as any);
      beforeEach(() => {
        prisma.bookingRequest.findUnique.mockResolvedValue(request());
        prisma.bookingRequest.findUniqueOrThrow.mockResolvedValue(
          request({
            status: 'NEEDS_INFORMATION',
            dob: new Date('1990-01-01'),
            contactPersonName: 'Chồng',
            contactPersonPhone: '0987654321',
            reason: 'Đau răng',
          }),
        );
      });

      it('changes only the fields sent and keeps the rest', async () => {
        await update({ gender: 'MALE', fullName: 'Nguyễn An' });
        const { data } = prisma.bookingRequest.updateMany.mock.calls[0][0];
        expect(data).toEqual({
          gender: 'MALE',
          fullName: 'Nguyễn An',
          status: 'PENDING_REVIEW',
          // A4-24: the front desk sees what the patient changed.
          patientMessage:
            'Khách đã bổ sung: Họ tên: Nguyễn Bé An → Nguyễn An; Giới tính: FEMALE → MALE',
        });
        expect(audit.log.mock.calls.at(-1)[0].metadata.changes).toEqual({
          fullName: { from: 'Nguyễn Bé An', to: 'Nguyễn An' },
          gender: { from: 'FEMALE', to: 'MALE' },
        });
      });

      it('never changes the phone or email from the public page', async () => {
        await expect(update({ email: 'attacker@evil.test' })).rejects.toThrow(
          'Không thể đổi số điện thoại hoặc email',
        );
        await expect(update({ phone: '0912345678', fullName: 'X Y' })).rejects.toThrow(
          'Không thể đổi số điện thoại hoặc email',
        );
        expect(prisma.bookingRequest.updateMany).not.toHaveBeenCalled();
      });

      it('needs the link token: the phone alone changes nothing', async () => {
        await expect(
          service.updateDetails('GS-1A2B3C4D5E', { phone: '0901234567' }, {
            fullName: 'Nguyễn An',
          } as any),
        ).rejects.toThrow('mở đường link trong email');
        expect(prisma.bookingRequest.findUnique).not.toHaveBeenCalled();
        expect(prisma.bookingRequest.updateMany).not.toHaveBeenCalled();
      });

      it('checks the merged details (a new child dob needs the stored guardian only)', async () => {
        await update({ dob: '2021-06-01' });
        expect(prisma.bookingRequest.updateMany.mock.calls[0][0].data.dob).toEqual(
          new Date('2021-06-01T00:00:00Z'),
        );
      });

      it('treats values equal to the stored ones (after normalizing) as no change', async () => {
        await expect(
          update({
            phone: '+84 901 234 567',
            fullName: ' Nguyễn Bé An ',
            email: 'ME@x.vn',
            contactPersonPhone: '0987 654 321',
            dob: '1990-01-01',
            reason: 'Đau răng',
          }),
        ).rejects.toThrow('Chưa có thông tin nào thay đổi');
        expect(prisma.bookingRequest.updateMany).not.toHaveBeenCalled();

        await update({ phone: '0901234567', email: 'me@x.vn', reason: 'Ê buốt' });
        expect(prisma.bookingRequest.updateMany.mock.calls[0][0].data).toEqual({
          reason: 'Ê buốt',
          status: 'PENDING_REVIEW',
          patientMessage: 'Khách đã bổ sung: Lý do khám: Đau răng → Ê buốt',
        });
      });

      it('refuses an empty answer, an impossible date and a bad guardian phone', async () => {
        await expect(update({})).rejects.toThrow('Chưa có thông tin nào thay đổi');
        await expect(update({ dob: '2020-02-30' })).rejects.toThrow('Ngày sinh không hợp lệ');
        await expect(update({ contactPersonPhone: '12345' })).rejects.toThrow(
          'người giám hộ không hợp lệ',
        );
        expect(prisma.bookingRequest.updateMany).not.toHaveBeenCalled();
      });
    });

    describe('new public requests', () => {
      const submit = (over: Record<string, unknown>) =>
        service.createPublic({
          fullName: 'Nguyen An',
          dob: '1990-01-01',
          gender: Gender.FEMALE,
          phone: '0901234567',
          serviceId: 'service-1',
          dentistId: 'dentist-1',
          startAt: minutes(24 * 60).toISOString(),
          consent: true,
          ...over,
        } as any);

      it('refuses a malformed guardian phone, a blank name and an impossible dob', async () => {
        await expect(
          submit({ contactPersonName: 'Mẹ', contactPersonPhone: '0000' }),
        ).rejects.toThrow('người giám hộ không hợp lệ');
        await expect(submit({ fullName: '    ' })).rejects.toThrow('Họ và tên không hợp lệ');
        await expect(submit({ dob: '2026-02-30' })).rejects.toThrow('Ngày sinh không hợp lệ');
        expect(prisma.bookingRequest.create).not.toHaveBeenCalled();
      });
    });

    describe('answers taken by phone', () => {
      it('moves a request waiting on details back to review, audited', async () => {
        prisma.bookingRequest.findUnique.mockResolvedValue(
          request({ status: 'NEEDS_INFORMATION' }),
        );
        jest.spyOn(service, 'getForStaff').mockResolvedValue({ id: 'request-1' } as any);
        await service.markInformationReceived('request-1', { note: 'Khách gọi lại' }, actor);
        expect(prisma.bookingRequest.updateMany).toHaveBeenCalledWith({
          where: { id: 'request-1', status: 'NEEDS_INFORMATION', appointmentId: null },
          data: { status: 'PENDING_REVIEW', handledBy: 'staff-1' },
        });
        expect(audit.log).toHaveBeenCalledWith(
          expect.objectContaining({
            action: 'BOOKING_REQUEST_INFORMATION_RECEIVED',
            actorUserId: 'staff-1',
            metadata: { channel: 'STAFF', note: 'Khách gọi lại' },
          }),
        );
      });

      it('records a proposal accepted by phone, on that exact proposal', async () => {
        const proposed = minutes(48 * 60);
        prisma.bookingRequest.findUnique.mockResolvedValue(
          request({ status: 'PROPOSED', proposedStartAt: proposed }),
        );
        jest.spyOn(service, 'getForStaff').mockResolvedValue({ id: 'request-1' } as any);
        await service.markProposalAcceptedByPhone('request-1', {}, actor);
        expect(prisma.bookingRequest.updateMany).toHaveBeenCalledWith({
          where: {
            id: 'request-1',
            status: 'PROPOSED',
            appointmentId: null,
            proposedStartAt: proposed,
          },
          data: { status: 'PATIENT_ACCEPTED', handledBy: 'staff-1' },
        });
        expect(audit.log).toHaveBeenCalledWith(
          expect.objectContaining({
            action: 'BOOKING_REQUEST_PROPOSAL_ACCEPTED',
            metadata: expect.objectContaining({ channel: 'PHONE' }),
          }),
        );
      });

      it('refuses both when the time has passed or the state is wrong', async () => {
        prisma.bookingRequest.findUnique.mockResolvedValue(
          request({ status: 'NEEDS_INFORMATION', requestedStartAt: minutes(-5) }),
        );
        await expect(service.markInformationReceived('request-1', {}, actor)).rejects.toThrow(
          'Giờ hẹn đã qua',
        );
        prisma.bookingRequest.findUnique.mockResolvedValue(
          request({ status: 'PROPOSED', proposedStartAt: minutes(-5) }),
        );
        await expect(service.markProposalAcceptedByPhone('request-1', {}, actor)).rejects.toThrow(
          'Giờ hẹn đã qua',
        );
        prisma.bookingRequest.findUnique.mockResolvedValue(request());
        await expect(service.markProposalAcceptedByPhone('request-1', {}, actor)).rejects.toThrow(
          'Không có giờ đề xuất',
        );
        expect(prisma.bookingRequest.updateMany).not.toHaveBeenCalled();
      });
    });

    describe('the patient accepting a proposal', () => {
      const proposed = minutes(48 * 60);
      beforeEach(() => {
        prisma.bookingRequest.findUnique.mockResolvedValue(request());
        prisma.bookingRequest.findUniqueOrThrow.mockResolvedValue(
          request({ status: 'PROPOSED', proposedStartAt: proposed }),
        );
      });

      it('refuses when the clinic has proposed another time since', async () => {
        await expect(
          service.acceptProposal(
            'GS-1A2B3C4D5E',
            { token: 'right-token' },
            { proposedStartAt: minutes(24 * 60).toISOString() },
          ),
        ).rejects.toThrow('Phòng khám vừa đổi giờ đề xuất');
        expect(prisma.bookingRequest.updateMany).not.toHaveBeenCalled();
      });

      it('writes only while the proposal is the one seen', async () => {
        await service.acceptProposal(
          'GS-1A2B3C4D5E',
          { token: 'right-token' },
          { proposedStartAt: proposed.toISOString() },
        );
        expect(prisma.bookingRequest.updateMany.mock.calls[0][0].where).toEqual({
          id: 'request-1',
          status: 'PROPOSED',
          appointmentId: null,
          proposedStartAt: proposed,
        });
      });

      it('says so when the proposal changes between the read and the write', async () => {
        prisma.bookingRequest.updateMany.mockResolvedValue({ count: 0 });
        prisma.bookingRequest.findUnique
          .mockResolvedValueOnce(request())
          .mockResolvedValueOnce({ status: 'PROPOSED', proposedStartAt: minutes(72 * 60) });
        await expect(
          service.acceptProposal('GS-1A2B3C4D5E', { token: 'right-token' }),
        ).rejects.toThrow('Phòng khám vừa đổi giờ đề xuất');
      });
    });

    it('emails the proposed time (clinic time) and dentist with the note', async () => {
      prisma.bookingRequest.findUnique.mockResolvedValue(request());
      appointments.getAvailability.mockResolvedValue({ availableSlots: ['10:00'] });
      jest.spyOn(service, 'getForStaff').mockResolvedValue({
        id: 'request-1',
        proposedDentist: { id: 'dentist-2', fullName: 'BS. Trần Thị Bình' },
      } as any);
      await service.propose(
        'request-1',
        { dentistId: 'dentist-2', startAt: '2026-10-02T03:00:00.000Z', message: 'Mời đến giờ này' },
        actor,
      );
      const sent = email.send.mock.calls[0][0];
      expect(sent.text).toContain('10:00 thứ Sáu 02/10/2026');
      expect(sent.text).toContain('BS. Trần Thị Bình');
      expect(sent.text).toContain('Mời đến giờ này');
    });
  });
  describe('services offered online and the public price list', () => {
    const row = (overrides: Record<string, unknown> = {}) => ({
      id: 'svc-1',
      code: 'CAO_VOI',
      name: 'Cạo vôi',
      description: null,
      category: { name: 'Dự phòng' },
      defaultDurationMin: 30,
      basePrice: 400000,
      isFree: false,
      bookableOnline: true,
      dentistServices: [],
      ...overrides,
    });

    beforeEach(() => {
      prisma.service = { findMany: jest.fn().mockResolvedValue([]) };
    });

    it('lists only services offered online', async () => {
      await service.options();
      expect(prisma.service.findMany.mock.calls[0][0].where).toMatchObject({
        isActive: true,
        bookableOnline: true,
      });
    });

    it('checks that the service is offered online for slots', async () => {
      prisma.dentistService.findFirst.mockResolvedValue(null);
      await expect(
        service.slots({ serviceId: 'svc-1', dentistId: 'dentist-1', date: futureSlot().date }),
      ).rejects.toThrow('không nhận đặt lịch');
      expect(prisma.dentistService.findFirst.mock.calls[0][0].where.service).toEqual({
        isActive: true,
        bookableOnline: true,
      });
    });

    it('lists shown services whether or not they can be booked online', async () => {
      await service.priceList();
      const where = prisma.service.findMany.mock.calls[0][0].where;
      expect(where).toMatchObject({ isActive: true, showPublicPrice: true });
      expect(where.bookableOnline).toBeUndefined();
      // Prices of dentists bookable at the desk (not on leave, not suspended).
      const dentist =
        prisma.service.findMany.mock.calls[0][0].include.dentistServices.where.dentist;
      expect(dentist.status).toEqual({ not: 'DEACTIVATED' });
      expect(dentist.userRoles).toEqual({ some: { role: { code: 'dentist' } } });
      expect(dentist.dentistProfile.is).toMatchObject({
        practiceStatus: 'ACTIVE',
        employee: { employmentStatus: 'ACTIVE' },
      });
    });

    it('gives the lowest price a dentist charges, "from" when they differ', async () => {
      prisma.service.findMany.mockResolvedValue([
        row({ dentistServices: [{ price: null }, { price: 350000 }] }),
        row({ id: 'svc-2', dentistServices: [{ price: 500000 }] }),
        row({ id: 'svc-3' }),
      ]);
      const [mixed, single, none] = await service.priceList();
      expect(mixed).toMatchObject({ price: 350000, priceFrom: true, isFree: false });
      // Every dentist charges the same own price: that price, no "from".
      expect(single).toMatchObject({ price: 500000, priceFrom: false });
      // Nobody assigned: the list price.
      expect(none).toMatchObject({ price: 400000, priceFrom: false });
    });

    it('says free only for a service marked free; 0 otherwise means "ask"', async () => {
      prisma.service.findMany.mockResolvedValue([
        row({ basePrice: 0, isFree: true, dentistServices: [{ price: null }] }),
        row({ id: 'svc-2', basePrice: 0, isFree: false, dentistServices: [{ price: null }] }),
      ]);
      const [free, unset] = await service.priceList();
      expect(free).toMatchObject({ isFree: true, price: 0, priceFrom: false });
      expect(unset).toMatchObject({ isFree: false, price: null, priceFrom: false });
    });
  });

  describe('audit round 3 (slots and stranded requests)', () => {
    // 2026-10-01 08:00 at the clinic (UTC+7).
    const NOW = new Date('2026-10-01T01:00:00Z');
    const at = (date: string, hhmm: string) => new Date(`${date}T${hhmm}:00+07:00`);
    const actor = { sub: 'staff-1', email: 's@x', permissions: [] } as any;
    const request = (over: Record<string, unknown> = {}) => ({
      id: 'request-1',
      referenceCode: 'GS-1A2B3C4D5E',
      status: 'PENDING_REVIEW',
      appointmentId: null,
      serviceId: 'service-1',
      preferredDentistId: 'dentist-1',
      proposedDentistId: null,
      requestedStartAt: at('2026-10-05', '09:00'),
      proposedStartAt: null,
      createdAt: new Date('2026-09-28T03:00:00Z'),
      reason: null,
      phone: '0901234567',
      contactPersonPhone: null,
      fullName: 'Nguyen An',
      dob: new Date('1990-01-01'),
      gender: 'FEMALE',
      email: null,
      ...over,
    });
    const withdrawnAssignment = {
      id: 'assignment-old',
      durationMin: 45,
      price: null,
      service: {
        code: 'SV1',
        name: 'Tẩy trắng',
        basePrice: 100,
        defaultDurationMin: 60,
        bufferBeforeMin: 0,
        bufferAfterMin: 15,
      },
    };

    beforeEach(() => {
      jest.useFakeTimers({ now: NOW });
      prisma.bookingRequest.updateMany = jest.fn().mockResolvedValue({ count: 1 });
      prisma.bookingRequest.findMany = jest.fn().mockResolvedValue([]);
      prisma.dentistService.findMany = jest.fn().mockResolvedValue([]);
      prisma.workingSchedule = { findMany: jest.fn().mockResolvedValue([]) };
      prisma.shiftRegistration = { findMany: jest.fn().mockResolvedValue([]) };
      prisma.scheduleOverride = { findMany: jest.fn().mockResolvedValue([]) };
      prisma.service = { findMany: jest.fn().mockResolvedValue([]) };
    });
    afterEach(() => {
      jest.useRealTimers();
      delete process.env.BOOKING_MAX_DAYS_AHEAD;
    });

    describe('front desk proposals', () => {
      it('accepts any valid time, on the suggested grid or not (14:00 for a 90-minute visit)', async () => {
        prisma.bookingRequest.findUnique.mockResolvedValue(request());
        prisma.dentistService.findFirst.mockResolvedValue({ id: 'assignment-1' });
        appointments.planVisit.mockResolvedValue({ ...plan, durationMin: 90 });
        jest.spyOn(service, 'getForStaff').mockResolvedValue({ id: 'request-1' } as any);
        const startAt = at('2026-10-05', '14:00');
        await service.propose(
          'request-1',
          { dentistId: 'dentist-1', startAt: startAt.toISOString(), message: 'Mời đến giờ này' },
          actor,
        );
        expect(availability.checkSlot).toHaveBeenCalledWith(
          'dentist-1',
          startAt,
          at('2026-10-05', '15:30'),
          { buffers: { beforeMin: 5, afterMin: 10 } },
        );
        expect(appointments.getAvailability).not.toHaveBeenCalled();
        expect(prisma.bookingRequest.updateMany).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({ status: 'PROPOSED', proposedStartAt: startAt }),
          }),
        );
      });

      it('says what is wrong with a proposed time', async () => {
        prisma.bookingRequest.findUnique.mockResolvedValue(request());
        prisma.dentistService.findFirst.mockResolvedValue({ id: 'assignment-1' });
        availability.checkSlot.mockResolvedValue({
          kind: 'TIME_OFF',
          message: 'Bác sĩ nghỉ phép từ 13:00 đến 17:00 ngày 2026-10-05',
        });
        await expect(
          service.propose(
            'request-1',
            {
              dentistId: 'dentist-1',
              startAt: at('2026-10-05', '14:00').toISOString(),
              message: 'Mời đến giờ này',
            },
            actor,
          ),
        ).rejects.toThrow('Bác sĩ nghỉ phép từ 13:00');
        expect(prisma.bookingRequest.updateMany).not.toHaveBeenCalled();
      });

      it('may move the request to another dentist, who need not take online bookings', async () => {
        prisma.bookingRequest.findUnique.mockResolvedValue(request());
        prisma.dentistService.findFirst.mockResolvedValue({ id: 'assignment-2' });
        jest.spyOn(service, 'getForStaff').mockResolvedValue({ id: 'request-1' } as any);
        await service.propose(
          'request-1',
          {
            dentistId: 'dentist-2',
            startAt: at('2026-10-06', '10:00').toISOString(),
            message: 'Bác sĩ khác',
          },
          actor,
        );
        expect(appointments.validateDentist).toHaveBeenCalledWith('dentist-2');
        const where = prisma.dentistService.findFirst.mock.calls[0][0].where;
        expect(where).toMatchObject({ dentistId: 'dentist-2', serviceId: 'service-1' });
        expect(where.dentist).toBeUndefined();
        expect(prisma.bookingRequest.updateMany).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({ proposedDentistId: 'dentist-2' }),
          }),
        );
      });

      it('refuses a suspended dentist', async () => {
        prisma.bookingRequest.findUnique.mockResolvedValue(request());
        appointments.validateDentist.mockRejectedValue(
          new ConflictException('Bác sĩ đang tạm ngưng hoặc đã nghỉ, không nhận lịch hẹn'),
        );
        await expect(
          service.propose(
            'request-1',
            {
              dentistId: 'dentist-1',
              startAt: at('2026-10-05', '14:00').toISOString(),
              message: 'Mời đến giờ này',
            },
            actor,
          ),
        ).rejects.toThrow('tạm ngưng');
      });
    });

    describe('a service withdrawn after the request was sent', () => {
      it('still confirms it, with the length the assignment had', async () => {
        prisma.bookingRequest.findUnique.mockResolvedValue(request());
        prisma.dentistService.findFirst
          .mockResolvedValueOnce(null) // no current assignment
          .mockResolvedValueOnce(withdrawnAssignment); // the one when it was sent
        prisma.patient.findMany.mockResolvedValue([]);
        patients.create.mockResolvedValue({ id: 'patient-1' });
        appointments.create.mockResolvedValue({ id: 'appt-1' });
        prisma.bookingRequest.findUniqueOrThrow.mockResolvedValue({
          email: null,
          fullName: 'Nguyen An',
          referenceCode: 'GS-1',
        });
        jest.spyOn(service, 'getForStaff').mockResolvedValue({ id: 'request-1' } as any);

        await service.confirm('request-1', actor);

        const earlierWhere = prisma.dentistService.findFirst.mock.calls[1][0].where;
        const sent = new Date('2026-09-28');
        expect(earlierWhere).toMatchObject({
          dentistId: 'dentist-1',
          serviceId: 'service-1',
          effectiveFrom: { lte: sent },
          OR: [{ effectiveTo: null }, { effectiveTo: { gte: sent } }],
        });
        expect(appointments.create.mock.calls[0][2]).toEqual({
          id: 'request-1',
          expectedStatuses: ['PENDING_REVIEW'],
          match: expect.objectContaining({ requestedStartAt: expect.any(Date) }),
          tx: prisma,
          plan: expect.objectContaining({ durationMin: 45, bufferAfterMin: 15 }),
        });
      });

      it('refuses when the dentist did not perform it when the request was sent', async () => {
        prisma.bookingRequest.findUnique.mockResolvedValue(request());
        prisma.dentistService.findFirst.mockResolvedValue(null);
        await expect(service.confirm('request-1', actor)).rejects.toThrow(
          'không thực hiện dịch vụ',
        );
        expect(patients.create).not.toHaveBeenCalled();
      });
    });

    describe('open requests the schedule no longer allows', () => {
      const closedDay = {
        ...openDay,
        windows: [],
        closedAllDay: true,
        date: '2026-10-05',
      };

      it('labels a pending request on a day now closed, and leaves the others alone', async () => {
        const stranded = request();
        const fine = request({
          id: 'request-2',
          preferredDentistId: 'dentist-2',
          requestedStartAt: at('2026-10-06', '09:00'),
        });
        prisma.bookingRequest.findMany.mockResolvedValueOnce([stranded, fine]);
        prisma.dentistService.findFirst.mockResolvedValue({ id: 'assignment-1' });
        availability.loadDay.mockImplementation((dentistId: string) =>
          Promise.resolve(dentistId === 'dentist-1' ? closedDay : openDay),
        );

        const rows = await service.listForStaff({});

        expect(rows.find(r => r.id === 'request-1')!.slotIssue).toEqual({
          kind: 'CLOSED',
          message: expect.stringContaining('đóng cả ngày'),
        });
        expect(rows.find(r => r.id === 'request-2')!.slotIssue).toBeNull();
      });

      it('labels a request whose dentist was suspended', async () => {
        prisma.bookingRequest.findMany.mockResolvedValueOnce([request()]);
        appointments.validateDentist.mockRejectedValue(
          new ConflictException('Bác sĩ đang tạm ngưng hoặc đã nghỉ, không nhận lịch hẹn'),
        );
        const [row] = await service.listForStaff({});
        expect(row.slotIssue).toEqual({ kind: 'NOT_BOOKABLE', message: expect.any(String) });
      });

      it('lists open requests for a dentist and dates, by the dentist and time they are about', async () => {
        prisma.bookingRequest.findMany.mockResolvedValue([request()]);
        prisma.dentistService.findFirst.mockResolvedValue({ id: 'assignment-1' });
        availability.loadDay.mockResolvedValue(closedDay);

        const rows = await service.pendingInRange({
          dentistId: 'dentist-1',
          from: '2026-10-05',
          to: '2026-10-05',
        });

        expect(rows.map(r => r.id)).toEqual(['request-1']);
        expect(rows[0].slotIssue).toMatchObject({ kind: 'CLOSED' });
        // Filtered in the query (before `take`): the proposal's time and
        // dentist while one stands, else the request's.
        const range = { gte: at('2026-10-05', '00:00'), lt: at('2026-10-06', '00:00') };
        const toDentist1 = {
          OR: [
            { proposedDentistId: 'dentist-1' },
            { proposedDentistId: null, preferredDentistId: 'dentist-1' },
          ],
        };
        expect(prisma.bookingRequest.findMany.mock.calls[0][0]).toMatchObject({
          where: {
            appointmentId: null,
            OR: [
              {
                status: { in: ['PENDING_REVIEW', 'NEEDS_INFORMATION'] },
                requestedStartAt: range,
                preferredDentistId: 'dentist-1',
              },
              {
                status: { in: ['PROPOSED', 'PATIENT_ACCEPTED'] },
                proposedStartAt: range,
                ...toDentist1,
              },
              {
                status: { in: ['PROPOSED', 'PATIENT_ACCEPTED'] },
                proposedStartAt: null,
                requestedStartAt: range,
                ...toDentist1,
              },
            ],
          },
          take: 200,
        });
      });

      it('checks only the nearest open requests for the inbox', async () => {
        const rows = Array.from({ length: 35 }, (_, i) =>
          request({
            id: 'request-' + i,
            requestedStartAt: new Date(at('2026-10-05', '09:00').getTime() + i * 86_400_000),
          }),
        );
        prisma.bookingRequest.findMany.mockResolvedValueOnce(rows);
        prisma.dentistService.findFirst.mockResolvedValue({ id: 'assignment-1' });

        await service.listForStaff({});

        // One plan and one day per request (all on different days): 30, not 35.
        expect(appointments.validateDentist).toHaveBeenCalledTimes(30);
        expect(availability.loadDay).toHaveBeenCalledTimes(30);
      });

      it('refuses a reversed range', async () => {
        await expect(
          service.pendingInRange({ from: '2026-10-06', to: '2026-10-05' }),
        ).rejects.toThrow('Khoảng ngày không hợp lệ');
      });

      it('offers each dentist able to take the request once, by name', async () => {
        prisma.bookingRequest.findUnique.mockResolvedValue({
          serviceId: 'service-1',
          createdAt: new Date('2026-09-28T03:00:00Z'),
        });
        prisma.dentistService.findMany.mockResolvedValue([
          { dentist: { id: 'd2', fullName: 'BS Bình' } },
          { dentist: { id: 'd1', fullName: 'BS An' } },
          { dentist: { id: 'd2', fullName: 'BS Bình' } },
        ]);
        await expect(service.dentistOptions('request-1')).resolves.toEqual([
          { id: 'd1', fullName: 'BS An' },
          { id: 'd2', fullName: 'BS Bình' },
        ]);
      });
    });

    describe('public booking window and empty days', () => {
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
      });

      it('takes requests up to 60 days ahead by default, or BOOKING_MAX_DAYS_AHEAD', async () => {
        appointments.getAvailability.mockResolvedValue({ availableSlots: ['09:00'] });
        await expect(
          service.slots({ serviceId: 'service-1', dentistId: 'dentist-1', date: '2026-11-30' }),
        ).resolves.toMatchObject({ lastDate: '2026-11-30', maxDaysAhead: 60 });
        await expect(
          service.slots({ serviceId: 'service-1', dentistId: 'dentist-1', date: '2026-12-01' }),
        ).rejects.toThrow('trong vòng 60 ngày tới');
        await expect(submit(at('2026-12-01', '09:00'))).rejects.toThrow('trong vòng 60 ngày tới');
        process.env.BOOKING_MAX_DAYS_AHEAD = '7';
        await expect(submit(at('2026-10-09', '09:00'))).rejects.toThrow('trong vòng 7 ngày tới');
        expect(prisma.bookingRequest.create).not.toHaveBeenCalled();
      });

      it('says why a day is empty, hides the clinic note, and names the next free day', async () => {
        // Mondays (dentist closed that day) and Wednesdays; Tuesday is off
        // and is not loaded at all.
        prisma.workingSchedule.findMany.mockResolvedValue([
          { dayOfWeek: 1, validFrom: new Date('2026-01-01'), validTo: null },
          { dayOfWeek: 3, validFrom: new Date('2026-01-01'), validTo: null },
        ]);
        appointments.getAvailability
          .mockResolvedValueOnce({
            availableSlots: [],
            blockedReason: 'CLOSED',
            closedReason: 'Bác sĩ ốm',
            clinicClosed: false,
          })
          .mockResolvedValueOnce({ availableSlots: ['09:00'], blockedReason: null });

        const res = await service.slots({
          serviceId: 'service-1',
          dentistId: 'dentist-1',
          date: '2026-10-05',
          next: true,
        });

        expect(res.emptyReason).toBe('CLOSED');
        expect(res.closedReason).toBeUndefined();
        expect(res.nextAvailableDate).toBe('2026-10-07');
        expect(appointments.getAvailability).toHaveBeenCalledTimes(2);
        expect(appointments.getAvailability.mock.calls[1][0].date).toBe('2026-10-07');
        // Eligibility is checked once, not per scanned day.
        expect(prisma.dentistService.findFirst).toHaveBeenCalledTimes(1);
      });

      it('looks for the next free day only when asked', async () => {
        appointments.getAvailability.mockResolvedValue({ availableSlots: [], blockedReason: null });
        const res = await service.slots({
          serviceId: 'service-1',
          dentistId: 'dentist-1',
          date: '2026-10-05',
        });
        expect(res.nextAvailableDate).toBeNull();
        expect(appointments.getAvailability).toHaveBeenCalledTimes(1);
        expect(prisma.workingSchedule.findMany).not.toHaveBeenCalled();
      });

      it("shows the clinic's own closure reason to patients", async () => {
        appointments.getAvailability.mockResolvedValue({
          availableSlots: [],
          blockedReason: 'CLOSED',
          closedReason: 'Phòng khám nghỉ: Tết Nguyên đán',
          clinicClosed: true,
        });
        const res = await service.slots({
          serviceId: 'service-1',
          dentistId: 'dentist-1',
          date: '2026-10-05',
        });
        expect(res.emptyReason).toBe('CLINIC_CLOSED');
        expect(res.closedReason).toBe('Phòng khám nghỉ: Tết Nguyên đán');
      });

      it('shows the reason of a clinic-wide closure (Tết) to the patient', async () => {
        appointments.getAvailability.mockResolvedValue({
          availableSlots: [],
          blockedReason: 'CLOSED',
          closedReason: 'Phòng khám nghỉ: Nghỉ Tết',
          clinicClosed: true,
        });
        const res = await service.slots({
          serviceId: 'service-1',
          dentistId: 'dentist-1',
          date: '2026-10-05',
        });
        expect(res.emptyReason).toBe('CLINIC_CLOSED');
        expect(res.closedReason).toBe('Phòng khám nghỉ: Nghỉ Tết');
      });

      it('tells a full day from one whose remaining times are too soon', async () => {
        appointments.getAvailability.mockResolvedValue({
          availableSlots: [],
          blockedReason: null,
        });
        const full = await service.slots({
          serviceId: 'service-1',
          dentistId: 'dentist-1',
          date: '2026-10-05',
        });
        expect(full.emptyReason).toBe('FULL');
        expect(full.nextAvailableDate).toBeNull();

        appointments.getAvailability.mockResolvedValue({
          availableSlots: ['08:30'],
          blockedReason: null,
        });
        const soon = await service.slots({
          serviceId: 'service-1',
          dentistId: 'dentist-1',
          date: '2026-10-01',
        });
        expect(soon.emptyReason).toBe('TOO_SOON');
      });

      it('offers only dentists with working hours in the bookable range', async () => {
        const dentist = (id: string) => ({
          durationMin: null,
          dentist: { id, fullName: 'BS ' + id, dentistProfile: { specialties: [] } },
        });
        prisma.service.findMany.mockResolvedValue([
          {
            id: 'service-1',
            code: 'S1',
            name: 'Khám',
            category: { name: 'Tổng quát' },
            description: null,
            defaultDurationMin: 30,
            basePrice: 100,
            dentistServices: [dentist('d1'), dentist('d2'), dentist('d3')],
          },
          {
            id: 'service-2',
            code: 'S2',
            name: 'Nhổ răng',
            category: { name: 'Tổng quát' },
            description: null,
            defaultDurationMin: 30,
            basePrice: 100,
            dentistServices: [dentist('d3')],
          },
        ]);
        prisma.workingSchedule.findMany.mockResolvedValue([{ dentistId: 'd1' }]);
        prisma.shiftRegistration.findMany.mockResolvedValue([{ dentistId: 'd2' }]);

        const rows = await service.options();

        expect(rows.map(s => s.id)).toEqual(['service-1']);
        expect(rows[0].dentists.map(d => d.id)).toEqual(['d1', 'd2']);
        expect(prisma.workingSchedule.findMany.mock.calls[0][0].where).toMatchObject({
          validFrom: { lte: new Date('2026-11-30') },
          OR: [{ validTo: null }, { validTo: { gte: new Date('2026-10-01') } }],
        });
      });
    });
  });

  describe('phase 2: online booking safety and notices', () => {
    // 2026-10-01 08:00 at the clinic (UTC+7), a Thursday.
    const NOW = new Date('2026-10-01T01:00:00Z');
    const minutes = (n: number) => new Date(NOW.getTime() + n * 60_000);
    const actor = { sub: 'staff-1', email: 's@x', permissions: [] } as any;
    const TOKEN = { token: 'right-token' };
    const flush = () => new Promise(resolve => setImmediate(resolve));
    const request = (over: Record<string, unknown> = {}) => ({
      id: 'request-1',
      referenceCode: 'GS-1A2B3C4D5E',
      status: 'PENDING_REVIEW',
      appointmentId: null,
      serviceId: 'service-1',
      preferredDentistId: 'dentist-1',
      proposedDentistId: null,
      requestedStartAt: minutes(24 * 60),
      proposedStartAt: null,
      reason: null,
      phone: '0901234567',
      contactPersonName: null,
      contactPersonPhone: null,
      fullName: 'Nguyen An',
      dob: new Date('1990-01-01'),
      gender: 'FEMALE',
      email: 'an@x.vn',
      responseMessage: null,
      accessTokenHash: createHash('sha256').update('right-token').digest('hex'),
      createdAt: minutes(-60),
      updatedAt: new Date('2026-10-01T00:30:00.123Z'),
      service: { name: 'Khám', defaultDurationMin: 30 },
      preferredDentist: { fullName: 'BS A' },
      proposedDentist: null,
      appointment: null,
      ...over,
    });

    beforeEach(() => {
      // setTimeout stays real: the archive retry waits a few milliseconds.
      jest.useFakeTimers({ now: NOW, doNotFake: ['nextTick', 'setImmediate', 'setTimeout'] });
      prisma.bookingRequest.updateMany = jest.fn().mockResolvedValue({ count: 1 });
      prisma.bookingRequest.findMany = jest.fn().mockResolvedValue([]);
      prisma.dentistService.findFirst.mockResolvedValue({ id: 'assignment-1' });
    });
    afterEach(() => {
      jest.useRealTimers();
      delete process.env.BOOKING_NOTIFY_EMAILS;
    });

    describe('spam limits per phone', () => {
      const submitWith = (over: Record<string, unknown> = {}) =>
        service.createPublic({
          fullName: 'Nguyen An',
          dob: '1990-01-01',
          gender: Gender.FEMALE,
          phone: '+84 901 234 567',
          serviceId: 'service-1',
          dentistId: 'dentist-1',
          startAt: '2026-10-02T03:00:00.000Z',
          consent: true,
          ...over,
        } as any);
      const submit = () => submitWith();
      beforeEach(() => {
        appointments.getAvailability.mockResolvedValue({ availableSlots: ['10:00'] });
        prisma.bookingRequest.create.mockResolvedValue({
          id: 'r9',
          referenceCode: 'GS-9',
          fullName: 'Nguyen An',
          email: null,
        });
      });

      const openRow = (fullName: string, dob: string, hour: number) => ({
        fullName,
        dob: new Date(dob),
        requestedStartAt: minutes(24 * 60 + (hour + 4) * 60),
        proposedStartAt: null,
      });

      it('refuses a fourth open request for one person, counted under the phone lock', async () => {
        prisma.bookingRequest.findMany.mockResolvedValue([
          openRow('Nguyen An', '1990-01-01', 1),
          openRow('Nguyen An', '1990-01-01', 2),
          openRow('Nguyen An', '1990-01-01', 3),
        ]);
        await expect(submit()).rejects.toThrow('Người khám này đã có 3 yêu cầu');
        expect(prisma.bookingRequest.create).not.toHaveBeenCalled();
        expect(prisma.bookingRequest.findMany.mock.calls[0][0].where).toEqual({
          phone: '0901234567',
          status: { in: ['PENDING_REVIEW', 'NEEDS_INFORMATION', 'PROPOSED', 'PATIENT_ACCEPTED'] },
          appointmentId: null,
        });
        // Since midnight at the clinic.
        expect(prisma.bookingRequest.count.mock.calls[0][0].where).toEqual({
          phone: '0901234567',
          createdAt: { gte: new Date('2026-09-30T17:00:00Z') },
        });
        expect(prisma.$executeRaw.mock.invocationCallOrder[0]).toBeLessThan(
          prisma.bookingRequest.findMany.mock.invocationCallOrder[0],
        );
      });

      it('lets a family on one phone book for each member (A4-05), up to the phone cap', async () => {
        prisma.bookingRequest.findMany.mockResolvedValue([
          openRow('Nguyen Binh', '1988-01-01', 1),
          openRow('Nguyen Be Mot', '2016-01-01', 2),
          openRow('Nguyen Be Hai', '2018-01-01', 3),
        ]);
        await expect(submit()).resolves.toMatchObject({ status: 'PENDING_REVIEW' });
        prisma.bookingRequest.findMany.mockResolvedValue(
          [1, 2, 3, 4, 5, 6].map(h => openRow('Người ' + 'ABCDEF'[h - 1], '2000-01-0' + h, h)),
        );
        await expect(submit()).rejects.toThrow('đặt cho nhiều người trong gia đình');
      });

      it('refuses too many requests in one clinic day, per phone and per email', async () => {
        prisma.bookingRequest.count.mockResolvedValueOnce(8);
        await expect(submit()).rejects.toThrow('yêu cầu đặt lịch trong hôm nay');
        prisma.bookingRequest.count.mockResolvedValueOnce(1).mockResolvedValueOnce(5);
        await expect(submitWith({ email: 'spam@x.vn' })).rejects.toThrow(
          'Email này đã gửi nhiều yêu cầu',
        );
        expect(prisma.bookingRequest.count.mock.calls[2][0].where).toMatchObject({
          email: 'spam@x.vn',
        });
        expect(prisma.bookingRequest.create).not.toHaveBeenCalled();
      });

      it('refuses names that carry a message or a web address (A4-08)', async () => {
        for (const fullName of [
          'quý khách, tài khoản bị khóa',
          'Xác minh tại evil.example',
          'www bit ly',
          'A'.repeat(101),
        ]) {
          await expect(submitWith({ fullName })).rejects.toThrow('chỉ gồm chữ cái');
        }
        await expect(submitWith({ fullName: "Nguyễn T. O'Neil-Hà" })).resolves.toBeDefined();
      });
    });

    describe('the patient answering a proposal', () => {
      const proposed = minutes(48 * 60); // 08:00 Saturday 03/10/2026

      it('checks the proposed time is still free before accepting it', async () => {
        process.env.BOOKING_NOTIFY_EMAILS = 'desk@clinic.vn';
        prisma.bookingRequest.findUnique.mockResolvedValue(request());
        prisma.bookingRequest.findUniqueOrThrow.mockResolvedValue(
          request({
            status: 'PROPOSED',
            proposedStartAt: proposed,
            proposedDentistId: 'dentist-2',
          }),
        );
        availability.checkSlot.mockResolvedValue({
          kind: 'SLOT_CONFLICT',
          message: 'Khung giờ này đã có lịch hẹn',
        });
        await expect(service.acceptProposal('GS-1A2B3C4D5E', TOKEN)).rejects.toThrow(
          'vừa có người khác đặt',
        );
        expect(availability.checkSlot.mock.calls[0][0]).toBe('dentist-2');
        expect(availability.checkSlot.mock.calls[0][1]).toEqual(proposed);
        expect(prisma.bookingRequest.updateMany).not.toHaveBeenCalled();
        await flush();
        expect(email.send).toHaveBeenCalledWith(
          expect.objectContaining({ subject: expect.stringContaining('không còn dùng được') }),
        );
      });

      it('lets the link holder turn a proposal down: back to review with their note', async () => {
        process.env.BOOKING_NOTIFY_EMAILS = 'desk@clinic.vn';
        prisma.bookingRequest.findUnique.mockResolvedValue(request());
        prisma.bookingRequest.findUniqueOrThrow.mockResolvedValue(
          request({ status: 'PROPOSED', proposedStartAt: proposed }),
        );
        await service.declineProposal('GS-1A2B3C4D5E', TOKEN, {
          proposedStartAt: proposed.toISOString(),
          message: 'Tôi bận buổi sáng',
        });
        const { where, data } = prisma.bookingRequest.updateMany.mock.calls[0][0];
        expect(where).toEqual({
          id: 'request-1',
          status: 'PROPOSED',
          appointmentId: null,
          proposedStartAt: proposed,
        });
        expect(data).toEqual({
          status: 'PENDING_REVIEW',
          patientMessage: 'Không đồng ý giờ đề xuất 08:00 thứ Bảy 03/10/2026: Tôi bận buổi sáng',
        });
        expect(audit.log).toHaveBeenCalledWith(
          expect.objectContaining({ action: 'BOOKING_REQUEST_PROPOSAL_DECLINED' }),
        );
        await flush();
        expect(email.send).toHaveBeenCalledWith(
          expect.objectContaining({
            to: 'desk@clinic.vn',
            subject: expect.stringContaining('Khách không đồng ý giờ đề xuất'),
          }),
        );
      });

      it('does not turn down a proposal the clinic has changed, or once the first time passed', async () => {
        prisma.bookingRequest.findUnique.mockResolvedValue(request());
        prisma.bookingRequest.findUniqueOrThrow.mockResolvedValue(
          request({ status: 'PROPOSED', proposedStartAt: proposed }),
        );
        await expect(
          service.declineProposal('GS-1A2B3C4D5E', TOKEN, {
            proposedStartAt: minutes(72 * 60).toISOString(),
          }),
        ).rejects.toThrow('Phòng khám vừa đổi giờ đề xuất');
        prisma.bookingRequest.findUniqueOrThrow.mockResolvedValue(
          request({ status: 'PROPOSED', proposedStartAt: proposed, requestedStartAt: minutes(-5) }),
        );
        await expect(service.declineProposal('GS-1A2B3C4D5E', TOKEN)).rejects.toThrow(
          'Giờ bạn chọn ban đầu đã qua',
        );
        expect(prisma.bookingRequest.updateMany).not.toHaveBeenCalled();
      });
    });

    it('emails requesters with an email when their request expires', async () => {
      prisma.bookingRequest.findMany.mockResolvedValue([
        {
          id: 'r1',
          referenceCode: 'GS-1',
          email: 'an@x.vn',
          fullName: 'An',
          status: 'PENDING_REVIEW',
          requestedStartAt: minutes(-5),
          proposedStartAt: null,
        },
        {
          id: 'r2',
          referenceCode: 'GS-2',
          email: null,
          fullName: 'Bình',
          status: 'PENDING_REVIEW',
          requestedStartAt: minutes(-5),
          proposedStartAt: null,
        },
      ]);
      prisma.bookingRequest.updateMany.mockResolvedValue({ count: 2 });
      await expect(service.expireOverdue()).resolves.toEqual({ expired: 2 });
      expect(email.send).toHaveBeenCalledTimes(1);
      const sent = email.send.mock.calls[0][0];
      expect(sent.to).toBe('an@x.vn');
      expect(sent.subject).toBe('Yêu cầu đặt lịch đã quá hạn');
      expect(sent.text).toContain('07:55 thứ Năm 01/10/2026');
    });

    describe('confirming', () => {
      const startAt = new Date('2026-10-02T03:00:00Z');
      beforeEach(() => {
        prisma.bookingRequest.findUnique.mockResolvedValue(request({ requestedStartAt: startAt }));
        patients.create.mockResolvedValue({ id: 'patient-9' });
        jest.spyOn(service, 'getForStaff').mockResolvedValue({ id: 'request-1' } as any);
      });

      it('books only the request as read, and emails the visit in clinic words', async () => {
        appointments.create.mockResolvedValue({ id: 'appt-1' });
        prisma.bookingRequest.findUniqueOrThrow.mockResolvedValue({
          email: 'an@x.vn',
          fullName: 'An',
          referenceCode: 'GS-1A2B3C4D5E',
          appointment: { startAt, dentist: { fullName: 'BS. Lê Minh' } },
        });
        email.send.mockResolvedValue(true);

        await expect(service.confirm('request-1', actor)).resolves.toMatchObject({
          notificationSent: true,
        });

        const updatedAt = new Date('2026-10-01T00:30:00.123Z');
        expect(appointments.create.mock.calls[0][2].match).toEqual({
          updatedAt: { gte: updatedAt, lt: new Date(updatedAt.getTime() + 1) },
          requestedStartAt: startAt,
          proposedStartAt: null,
        });
        expect(email.send.mock.calls[0][0].text).toContain(
          '10:00 thứ Sáu 02/10/2026, bác sĩ BS. Lê Minh',
        );
      });

      it('matches and creates the patient record under the phone lock', async () => {
        appointments.create.mockResolvedValue({ id: 'appt-1' });
        prisma.bookingRequest.findUniqueOrThrow.mockResolvedValue({
          email: null,
          fullName: 'An',
          referenceCode: 'GS-1A2B3C4D5E',
          appointment: null,
        });
        await service.confirm('request-1', actor);
        // The phone lock (namespace 3), keyed by the normalized phone (after
        // the lock_timeout set_config).
        const at = prisma.$executeRaw.mock.calls.findIndex(
          (c: any[]) => c[1] === 3 && c[2] === '0901234567',
        );
        expect(at).toBeGreaterThanOrEqual(0);
        const lock = prisma.$executeRaw.mock.invocationCallOrder[at];
        expect(lock).toBeLessThan(prisma.$queryRaw.mock.invocationCallOrder[0]);
        expect(lock).toBeLessThan(patients.create.mock.invocationCallOrder[0]);
      });

      it('creates the record and the visit in one transaction, so a failed booking leaves none', async () => {
        appointments.create.mockRejectedValue(new ConflictException('Slot taken'));
        await expect(service.confirm('request-1', actor)).rejects.toThrow('Slot taken');
        // The mock transaction client is `prisma` itself.
        expect(patients.create).toHaveBeenCalledWith(expect.anything(), actor, prisma);
        expect(appointments.create.mock.calls[0][2].tx).toBe(prisma);
        expect(prisma.$transaction).toHaveBeenCalledTimes(1);
        expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), {
          maxWait: 10_000,
          timeout: 20_000,
        });
        // Nothing to archive afterwards: the rollback removed the record.
        expect(patients.softDelete).not.toHaveBeenCalled();
      });
    });

    describe('prices and lengths on the public pages', () => {
      const svc = (over: Record<string, unknown>) => ({
        id: 'service-1',
        code: 'S1',
        name: 'Khám',
        category: { name: 'Tổng quát' },
        description: null,
        defaultDurationMin: 30,
        basePrice: 100,
        showPublicPrice: true,
        isFree: false,
        dentistServices: [
          {
            durationMin: 45,
            price: null,
            dentist: { id: 'd1', fullName: 'BS 1', dentistProfile: null },
          },
        ],
        ...over,
      });
      beforeEach(() => {
        prisma.workingSchedule = { findMany: jest.fn().mockResolvedValue([{ dentistId: 'd1' }]) };
        prisma.shiftRegistration = { findMany: jest.fn().mockResolvedValue([]) };
      });

      it('leaves the price out of the booking options when the clinic hides it', async () => {
        prisma.service = {
          findMany: jest
            .fn()
            .mockResolvedValue([svc({ showPublicPrice: false }), svc({ id: 'service-2' })]),
        };
        const [hidden, shown] = await service.options();
        expect(hidden).not.toHaveProperty('basePrice');
        expect(shown.basePrice).toBe(100);
        // Each dentist's own length is what the page shows once one is chosen.
        expect(hidden.dentists[0].durationMinutes).toBe(45);
      });

      it('lists a free service some dentists charge for as "from 0"', async () => {
        prisma.service = {
          findMany: jest.fn().mockResolvedValue([
            svc({
              basePrice: 0,
              isFree: true,
              dentistServices: [{ price: null }, { price: 200000 }],
            }),
          ]),
        };
        const [row] = await service.priceList();
        expect(row).toMatchObject({ isFree: false, price: 0, priceFrom: true });
      });
    });

    it("says the day is over, not full, once today's working hours have passed", async () => {
      const windows = [{ startTime: '08:00', endTime: '17:00' }];
      const q = { serviceId: 'service-1', dentistId: 'dentist-1', date: '2026-10-01' };
      appointments.getAvailability.mockResolvedValue({
        availableSlots: [],
        blockedReason: null,
        windows,
      });
      jest.setSystemTime(new Date('2026-10-01T16:49:00Z')); // 23:49 at the clinic
      await expect(service.slots(q)).resolves.toMatchObject({ emptyReason: 'DAY_OVER' });
      jest.setSystemTime(new Date('2026-10-01T09:00:00Z')); // 16:00: 16:30 is under 2 hours away
      await expect(service.slots(q)).resolves.toMatchObject({ emptyReason: 'TOO_SOON' });
      await expect(service.slots({ ...q, date: '2026-10-05' })).resolves.toMatchObject({
        emptyReason: 'FULL',
      });
    });

    describe('emails the patient must answer', () => {
      const actorStaff = { sub: 'staff-1', email: 's@x', permissions: [] } as any;
      beforeEach(() => {
        process.env.CLINIC_PHONE = '028 1234 5678';
        jest.spyOn(service, 'getForStaff').mockResolvedValue({ id: 'request-1' } as any);
        appointments.getAvailability.mockResolvedValue({ availableSlots: ['10:00'] });
        email.send.mockResolvedValue(true);
      });
      afterEach(() => delete process.env.CLINIC_PHONE);

      it('issues a new link with a proposal, saying older links stop working', async () => {
        prisma.bookingRequest.findUnique.mockResolvedValue(request());
        await service.propose(
          'request-1',
          {
            dentistId: 'dentist-1',
            startAt: '2026-10-02T03:00:00.000Z',
            message: 'Mời đến giờ này',
          },
          actorStaff,
        );
        // The status change keeps the old link; the new one is stored once
        // the email carrying it went out.
        expect(prisma.bookingRequest.updateMany.mock.calls[0][0].data).not.toHaveProperty(
          'accessTokenHash',
        );
        const { data } = prisma.bookingRequest.update.mock.calls[0][0];
        const sent = email.send.mock.calls[0][0];
        const token = decodeURIComponent(/#token=([^\s"]+)/.exec(sent.text)![1]);
        expect(data.accessTokenHash).toBe(createHash('sha256').update(token).digest('hex'));
        expect(data.accessTokenHash).not.toBe(request().accessTokenHash);
        expect(sent.text).toContain('đường link trong các email trước không còn dùng được');
        expect(sent.text).toContain('028 1234 5678');
      });

      it('issues a new link when asking for details, and none without an email', async () => {
        prisma.bookingRequest.findUnique.mockResolvedValue(request());
        await service.requestInformation('request-1', { message: 'Cần ảnh CCCD' }, actorStaff);
        expect(prisma.bookingRequest.update.mock.calls[0][0].data.accessTokenHash).toEqual(
          expect.any(String),
        );
        expect(email.send.mock.calls[0][0].text).toContain('#token=');

        prisma.bookingRequest.update.mockClear();
        email.send.mockClear();
        prisma.bookingRequest.findUnique.mockResolvedValue(request({ email: null }));
        await service.requestInformation('request-1', { message: 'Cần ảnh CCCD' }, actorStaff);
        // No email: the patient's current link keeps working, and the front
        // desk is flagged to call (A4-17).
        expect(prisma.bookingRequest.update).toHaveBeenCalledTimes(1);
        expect(prisma.bookingRequest.update.mock.calls[0][0].data).toEqual({
          noticeFailedAt: NOW,
          noticeFailedSubject: 'Phòng khám cần bổ sung thông tin',
        });
        expect(email.send).not.toHaveBeenCalled();
      });

      it('keeps the old link when the email with the new one was not delivered', async () => {
        email.send.mockResolvedValue(false);
        prisma.bookingRequest.findUnique.mockResolvedValue(request());
        const res = await service.propose(
          'request-1',
          {
            dentistId: 'dentist-1',
            startAt: '2026-10-02T03:00:00.000Z',
            message: 'Mời đến giờ này',
          },
          actorStaff,
        );
        expect(res.notificationSent).toBe(false);
        expect(prisma.bookingRequest.updateMany.mock.calls[0][0].data).not.toHaveProperty(
          'accessTokenHash',
        );
        // Only the "call the patient" flag, never the link.
        expect(prisma.bookingRequest.update.mock.calls.map((c: any[]) => c[0].data)).toEqual([
          { noticeFailedAt: NOW, noticeFailedSubject: 'Phòng khám đề xuất giờ khám khác' },
        ]);
      });

      it('sends a plain notice (a decline) without a link token', async () => {
        prisma.bookingRequest.findUnique.mockResolvedValue(request());
        await service.decline('request-1', { message: 'Bác sĩ nghỉ' }, actorStaff);
        expect(prisma.bookingRequest.updateMany.mock.calls[0][0].data).not.toHaveProperty(
          'accessTokenHash',
        );
        expect(email.send.mock.calls[0][0].text).not.toContain('#token=');
      });
    });

    it('tells the front desk how many open requests each phone holds', async () => {
      prisma.bookingRequest.findMany.mockResolvedValueOnce([request()]).mockResolvedValueOnce([]);
      prisma.bookingRequest.groupBy.mockResolvedValue([
        { phone: '0901234567', _count: { _all: 3 } },
      ]);
      const rows = await service.listForStaff({});
      expect(rows[0].openFromPhone).toBe(3);
      expect(prisma.bookingRequest.groupBy.mock.calls[0][0].where).toEqual({
        phone: { in: ['0901234567'] },
        status: { in: ['PENDING_REVIEW', 'NEEDS_INFORMATION', 'PROPOSED', 'PATIENT_ACCEPTED'] },
        appointmentId: null,
      });
    });
  });
});

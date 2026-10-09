import { AppointmentNoticesService, isQuietHour } from './appointment-notices.service';
import { formatVisitTime } from './clinic-time-format';

describe('formatVisitTime', () => {
  it('reads the time at the clinic, with the weekday, whatever the server zone', () => {
    expect(formatVisitTime(new Date('2026-10-02T03:00:00Z'))).toBe('10:00 thứ Sáu 02/10/2026');
    // 17:30 UTC is already the next day in Vietnam.
    expect(formatVisitTime(new Date('2026-10-03T17:30:00Z'))).toBe('00:30 Chủ nhật 04/10/2026');
  });
});

describe('AppointmentNoticesService', () => {
  // 2026-10-01 08:00 at the clinic (UTC+7).
  const NOW = new Date('2026-10-01T01:00:00Z');
  const visitAt = new Date('2026-10-02T03:00:00Z'); // 10:00 Friday
  let prisma: any;
  let email: { send: jest.Mock };
  let service: AppointmentNoticesService;
  const visit = (over: Record<string, unknown> = {}) => ({
    id: 'appt-1',
    startAt: visitAt,
    status: 'SCHEDULED',
    deletedAt: null,
    patient: { fullName: 'Nguyễn An', email: 'an@x.vn', deletedAt: null },
    dentist: { fullName: 'BS. Lê Minh' },
    ...over,
  });

  let availability: { checkSlot: jest.Mock };
  let appointments: { validateDentist: jest.Mock };
  beforeEach(() => {
    jest.useFakeTimers({ now: NOW, doNotFake: ['nextTick', 'setImmediate'] });
    // EMAIL_MOCK outside production: EmailService "delivers" (logs).
    process.env.EMAIL_MOCK = 'true';
    prisma = {
      appointment: {
        findUnique: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      $executeRaw: jest.fn().mockResolvedValue(1),
    };
    email = { send: jest.fn().mockResolvedValue(true) };
    availability = { checkSlot: jest.fn().mockResolvedValue(null) };
    appointments = { validateDentist: jest.fn().mockResolvedValue({}) };
    service = new AppointmentNoticesService(
      prisma,
      email as any,
      availability as any,
      appointments as any,
    );
  });
  afterEach(() => {
    jest.useRealTimers();
    delete process.env.EMAIL_MOCK;
    delete process.env.BOOKING_NOTIFY_EMAILS;
  });

  describe('changes the clinic makes', () => {
    it('emails the patient a cancelled visit, without the internal reason', async () => {
      prisma.appointment.findUnique.mockResolvedValue(visit({ status: 'CANCELLED' }));
      await service.onCancelled({
        appointmentId: 'appt-1',
        patientId: 'p1',
        dentistId: 'd1',
        cancelledAt: NOW,
        cancelledBy: 'staff-1',
        reason: 'Khách bom lịch lần 3',
      });
      const sent = email.send.mock.calls[0][0];
      expect(sent.to).toBe('an@x.vn');
      expect(sent.subject).toBe('Lịch hẹn đã bị hủy');
      expect(sent.text).toContain('10:00 thứ Sáu 02/10/2026 với bác sĩ BS. Lê Minh');
      expect(sent.text).not.toContain('bom lịch');
    });

    it('sends nothing without an email, for a past visit, or when the lookup fails', async () => {
      const event = {
        appointmentId: 'appt-1',
        patientId: 'p1',
        dentistId: 'd1',
        cancelledAt: NOW,
        cancelledBy: 'staff-1',
      };
      prisma.appointment.findUnique.mockResolvedValue(
        visit({ patient: { fullName: 'An', email: null, deletedAt: null } }),
      );
      await service.onCancelled(event);
      prisma.appointment.findUnique.mockResolvedValue(
        visit({ startAt: new Date(NOW.getTime() - 60_000) }),
      );
      await service.onCancelled(event);
      prisma.appointment.findUnique.mockRejectedValue(new Error('db down'));
      await expect(service.onCancelled(event)).resolves.toBeUndefined();
      expect(email.send).not.toHaveBeenCalled();
    });

    it('emails the old and new time of a moved visit', async () => {
      prisma.appointment.findUnique.mockResolvedValue(visit());
      await service.onRescheduled({
        appointmentId: 'appt-1',
        oldStartAt: new Date('2026-10-01T09:00:00Z'),
        newStartAt: visitAt,
        oldDentistId: 'd1',
        newDentistId: 'd1',
      });
      // The reminder flag is cleared by the move's own transaction, not here.
      expect(prisma.$executeRaw).not.toHaveBeenCalled();
      const sent = email.send.mock.calls[0][0];
      expect(sent.subject).toBe('Lịch hẹn đã được dời');
      expect(sent.text).toContain('từ 16:00 thứ Năm 01/10/2026 sang 10:00 thứ Sáu 02/10/2026');
    });

    it('tells the patient about a new dentist at the same time', async () => {
      prisma.appointment.findUnique.mockResolvedValue(visit());
      await service.onRescheduled({
        appointmentId: 'appt-1',
        oldStartAt: visitAt,
        newStartAt: visitAt,
        oldDentistId: 'd1',
        newDentistId: 'd2',
      });
      expect(prisma.$executeRaw).not.toHaveBeenCalled();
      const sent = email.send.mock.calls[0][0];
      expect(sent.subject).toBe('Lịch hẹn đổi bác sĩ');
      expect(sent.text).toContain('được chuyển sang bác sĩ BS. Lê Minh');
    });
  });

  describe('the clinic contact and the on/off switch', () => {
    afterEach(() => {
      delete process.env.CLINIC_PHONE;
      delete process.env.CLINIC_NAME;
      delete process.env.APPOINTMENT_EMAIL_NOTICES;
    });

    it("ends every visit email with the clinic's hotline", async () => {
      process.env.CLINIC_NAME = 'Nha khoa GENSMILE';
      process.env.CLINIC_PHONE = '028 1234 5678';
      prisma.appointment.findMany.mockResolvedValue([visit()]);
      await service.sendDueReminders();
      expect(email.send.mock.calls[0][0].text).toContain(
        'vui lòng gọi Nha khoa GENSMILE: 028 1234 5678',
      );
    });

    it('sends no visit email when APPOINTMENT_EMAIL_NOTICES=false', async () => {
      process.env.APPOINTMENT_EMAIL_NOTICES = 'false';
      prisma.appointment.findUnique.mockResolvedValue(visit());
      prisma.appointment.findMany.mockResolvedValue([visit()]);
      await service.onCancelled({
        appointmentId: 'appt-1',
        patientId: 'p1',
        dentistId: 'd1',
        cancelledAt: NOW,
        cancelledBy: 'staff-1',
      });
      await service.onRescheduled({
        appointmentId: 'appt-1',
        oldStartAt: NOW,
        newStartAt: visitAt,
        oldDentistId: 'd1',
        newDentistId: 'd1',
      });
      await expect(service.sendDueReminders()).resolves.toMatchObject({ due: 0, sent: 0 });
      expect(email.send).not.toHaveBeenCalled();
    });
  });

  describe('day-ahead reminders', () => {
    it('reminds upcoming visits with an email once, claiming each before sending', async () => {
      prisma.appointment.findMany.mockResolvedValue([visit(), visit({ id: 'appt-2' })]);
      // appt-2 was claimed by another run in between.
      prisma.$executeRaw.mockResolvedValueOnce(1).mockResolvedValueOnce(0);

      await expect(service.sendDueReminders()).resolves.toEqual({
        due: 2,
        sent: 1,
        blocked: 0,
        failed: 0,
      });

      const where = prisma.appointment.findMany.mock.calls[0][0].where;
      expect(where).toMatchObject({
        status: { in: ['SCHEDULED', 'CONFIRMED'] },
        deletedAt: null,
        reminderSentAt: null,
        patient: { deletedAt: null, email: { not: null } },
      });
      expect(where.startAt.gt).toEqual(new Date(NOW.getTime() + 2 * 60 * 60_000));
      expect(where.startAt.lte).toEqual(new Date(NOW.getTime() + 24 * 60 * 60_000));
      expect(prisma.$executeRaw.mock.calls[0][0].join('?')).toContain('reminder_sent_at IS NULL');
      expect(email.send).toHaveBeenCalledTimes(1);
      expect(email.send.mock.calls[0][0].subject).toBe('Nhắc lịch khám 10:00 thứ Sáu 02/10/2026');
    });

    it('sends nothing between 21:00 and 07:00 at the clinic', async () => {
      prisma.appointment.findMany.mockResolvedValue([visit()]);
      // 22:30 and 06:59 in Vietnam.
      for (const at of ['2026-10-01T15:30:00Z', '2026-09-30T23:59:00Z']) {
        await expect(service.sendDueReminders(new Date(at))).resolves.toMatchObject({
          due: 0,
          sent: 0,
        });
      }
      expect(isQuietHour(new Date('2026-10-01T00:00:00Z'))).toBe(false); // 07:00
      expect(prisma.appointment.findMany).not.toHaveBeenCalled();
      expect(email.send).not.toHaveBeenCalled();
    });

    it('releases a reminder the mail server refused, for the next runs to retry (A4-09)', async () => {
      prisma.appointment.findMany.mockResolvedValue([
        visit({ reminderStatus: null, reminderAttempts: 0, reminderStatusFor: null }),
      ]);
      email.send.mockResolvedValue(false);
      await expect(service.sendDueReminders()).resolves.toMatchObject({
        due: 1,
        sent: 0,
        failed: 1,
      });
      const { where, data } = prisma.appointment.updateMany.mock.calls[0][0];
      expect(where).toEqual({ id: 'appt-1', reminderSentAt: NOW });
      expect(data).toMatchObject({
        reminderSentAt: null,
        reminderStatus: 'FAILED',
        reminderAttempts: 1,
        reminderStatusFor: visitAt,
      });
    });

    it('stops retrying after the last attempt and tells the clinic', async () => {
      process.env.BOOKING_NOTIFY_EMAILS = 'desk@clinic.vn';
      prisma.appointment.findMany.mockResolvedValue([
        visit({ reminderStatus: 'FAILED', reminderAttempts: 2, reminderStatusFor: visitAt }),
      ]);
      email.send.mockResolvedValueOnce(false).mockResolvedValue(true);
      await service.sendDueReminders();
      expect(prisma.appointment.updateMany.mock.calls[0][0].data).toMatchObject({
        reminderSentAt: NOW,
        reminderAttempts: 3,
      });
      expect(email.send.mock.calls[1][0].to).toBe('desk@clinic.vn');
      expect(email.send.mock.calls[1][0].text).toContain('gửi email nhắc lịch lỗi nhiều lần');
    });

    it('claims nothing while email cannot be delivered at all', async () => {
      delete process.env.EMAIL_MOCK;
      prisma.appointment.findMany.mockResolvedValue([visit()]);
      await expect(service.sendDueReminders()).resolves.toMatchObject({ due: 0, sent: 0 });
      expect(prisma.appointment.findMany).not.toHaveBeenCalled();
      expect(prisma.$executeRaw).not.toHaveBeenCalled();
    });

    it('does not remind a visit on a closed day, time-off or outside hours (A4-01/A5-08)', async () => {
      process.env.BOOKING_NOTIFY_EMAILS = 'desk@clinic.vn';
      prisma.appointment.findMany.mockResolvedValue([
        visit({ dentistId: 'd1', endAt: new Date(visitAt.getTime() + 30 * 60_000) }),
      ]);
      availability.checkSlot.mockResolvedValue({
        kind: 'CLOSED',
        message: 'Mất điện (ngày 2026-10-02)',
      });
      await expect(service.sendDueReminders()).resolves.toMatchObject({ sent: 0, blocked: 1 });
      expect(availability.checkSlot).toHaveBeenCalledWith('d1', visitAt, expect.any(Date), {
        ignoreBookings: true,
      });
      // Not claimed: a visit fixed in time is reminded by a later run.
      expect(prisma.$executeRaw).not.toHaveBeenCalled();
      expect(prisma.appointment.updateMany.mock.calls[0][0].data).toMatchObject({
        reminderStatus: 'BLOCKED',
        reminderNote: 'Mất điện (ngày 2026-10-02)',
      });
      // Only the clinic is told.
      expect(email.send).toHaveBeenCalledTimes(1);
      expect(email.send.mock.calls[0][0].to).toBe('desk@clinic.vn');
    });

    it('does not remind a visit with a dentist who no longer takes bookings', async () => {
      const { HttpException } = jest.requireActual('@nestjs/common');
      appointments.validateDentist.mockRejectedValue(
        new HttpException('Bác sĩ đang tạm nghỉ, không nhận lịch hẹn mới.', 404),
      );
      prisma.appointment.findMany.mockResolvedValue([visit()]);
      await expect(service.sendDueReminders()).resolves.toMatchObject({ blocked: 1, sent: 0 });
      expect(email.send).not.toHaveBeenCalled();
    });

    it('puts the reference code and status link in an online visit reminder', async () => {
      process.env.PUBLIC_APP_URL = 'https://nk.example';
      prisma.appointment.findMany.mockResolvedValue([
        visit({
          bookingRequest: { referenceCode: 'GS-ABC' },
          services: [{ serviceName: 'Cạo vôi' }],
        }),
      ]);
      await service.sendDueReminders();
      delete process.env.PUBLIC_APP_URL;
      const text = email.send.mock.calls[0][0].text;
      expect(text).toContain('Mã đặt lịch: GS-ABC');
      expect(text).toContain('(Cạo vôi)');
      expect(text).toContain('https://nk.example/booking/status?ref=GS-ABC');
    });

    it('lists the visits whose reminder did not go out, for their current time only', async () => {
      prisma.appointment.findMany.mockResolvedValue([
        visit({ reminderStatus: 'FAILED', reminderStatusFor: visitAt, reminderNote: 'lỗi' }),
        // Moved since it was blocked: not about this time.
        visit({
          id: 'appt-2',
          reminderStatus: 'BLOCKED',
          reminderStatusFor: new Date(0),
          reminderNote: 'x',
        }),
      ]);
      const list = await service.reminderIssues();
      expect(list.map(r => r.appointmentId)).toEqual(['appt-1']);
    });
  });
});

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

  beforeEach(() => {
    jest.useFakeTimers({ now: NOW, doNotFake: ['nextTick', 'setImmediate'] });
    prisma = {
      appointment: { findUnique: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
      $executeRaw: jest.fn().mockResolvedValue(1),
    };
    email = { send: jest.fn().mockResolvedValue(true) };
    service = new AppointmentNoticesService(prisma, email as any);
  });
  afterEach(() => jest.useRealTimers());

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
      await expect(service.sendDueReminders()).resolves.toEqual({ due: 0, sent: 0 });
      expect(email.send).not.toHaveBeenCalled();
    });
  });

  describe('day-ahead reminders', () => {
    it('reminds upcoming visits with an email once, claiming each before sending', async () => {
      prisma.appointment.findMany.mockResolvedValue([visit(), visit({ id: 'appt-2' })]);
      // appt-2 was claimed by another run in between.
      prisma.$executeRaw.mockResolvedValueOnce(1).mockResolvedValueOnce(0);

      await expect(service.sendDueReminders()).resolves.toEqual({ due: 2, sent: 1 });

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
        await expect(service.sendDueReminders(new Date(at))).resolves.toEqual({ due: 0, sent: 0 });
      }
      expect(isQuietHour(new Date('2026-10-01T00:00:00Z'))).toBe(false); // 07:00
      expect(prisma.appointment.findMany).not.toHaveBeenCalled();
      expect(email.send).not.toHaveBeenCalled();
    });

    it('does not retry a reminder the mail server refused', async () => {
      prisma.appointment.findMany.mockResolvedValue([visit()]);
      email.send.mockResolvedValue(false);
      await expect(service.sendDueReminders()).resolves.toEqual({ due: 1, sent: 0 });
      // Only the claim; the flag is not cleared for another attempt.
      expect(prisma.$executeRaw).toHaveBeenCalledTimes(1);
    });
  });
});

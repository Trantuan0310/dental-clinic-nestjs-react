import { Test } from '@nestjs/testing';
import { AppointmentsService } from './appointments.service';
import { AvailabilityService } from './availability.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { createPrismaMock, PrismaMockShape, asTransaction } from '../../test/helpers/prisma-mock';
import { adminPayload, dentistPayload } from '../../test/helpers';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { clinicDateOnly } from '../common/date-range.util';

/**
 * Editing weekly schedules, several blocks per save, multi-block changed
 * hours and clinic-wide closures. Every change lists the bookings it leaves
 * outside working time and never cancels them.
 */
describe('AppointmentsService — schedule management', () => {
  let service: AppointmentsService;
  let prisma: PrismaMockShape;
  let audit: { log: jest.Mock };
  const admin = adminPayload();
  const DAY = 24 * 60 * 60 * 1000;
  const t = (hhmm: string) => new Date(`1970-01-01T${hhmm}:00Z`);
  const today = clinicDateOnly();
  const addDays = (date: string, n: number) =>
    new Date(new Date(date).getTime() + n * DAY).toISOString().slice(0, 10);
  const dow = (date: string) => new Date(date).getUTCDay();
  const at = (date: string, hhmm: string) => new Date(`${date}T${hhmm}:00+07:00`);
  const statusOf = (e: any) => e.getStatus?.();

  beforeEach(async () => {
    prisma = createPrismaMock();
    asTransaction(prisma);
    audit = { log: jest.fn().mockResolvedValue(undefined) };
    const module = await Test.createTestingModule({
      providers: [
        AppointmentsService,
        AvailabilityService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditService, useValue: audit },
        { provide: EventEmitter2, useValue: { emit: jest.fn() } },
      ],
    }).compile();
    service = module.get(AppointmentsService);
    (prisma.user.findUnique as jest.Mock).mockResolvedValue({
      id: 'dentist-1',
      status: 'ACTIVE',
      userRoles: [{ role: { code: 'dentist' } }],
    });
    (prisma.workingSchedule.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.shiftRegistration.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.workingSchedule.create as jest.Mock).mockImplementation(async ({ data }: any) => ({
      id: `ws-${data.dayOfWeek}-${data.startTime.toISOString().slice(11, 16)}`,
      ...data,
    }));
  });

  afterEach(() => jest.clearAllMocks());

  /** The dentist performs svc-1 in `durationMin` (their own override). */
  const assignService = (durationMin: number) => {
    (prisma.dentistService.findFirst as jest.Mock).mockResolvedValue({ id: 'ds-1' });
    (prisma.dentistService.findMany as jest.Mock).mockResolvedValue([
      {
        serviceId: 'svc-1',
        durationMin,
        price: null,
        service: {
          code: 'SVC1',
          name: 'Cạo vôi',
          basePrice: 300000,
          defaultDurationMin: 30,
          bufferBeforeMin: 0,
          bufferAfterMin: 0,
        },
      },
    ]);
  };
  const request = (id: string, startAt: Date, over: Record<string, unknown> = {}) => ({
    id,
    referenceCode: `GS-${id}`,
    fullName: 'Nguyễn Văn A',
    phone: '0900000000',
    status: 'PENDING_REVIEW',
    appointmentId: null,
    serviceId: 'svc-1',
    createdAt: new Date(),
    preferredDentistId: 'dentist-1',
    proposedDentistId: null,
    requestedStartAt: startAt,
    proposedStartAt: null,
    ...over,
  });

  describe('bulk create (several weekdays × blocks)', () => {
    const dto = {
      dentistId: 'dentist-1',
      daysOfWeek: [6, 1, 2, 3, 4, 5],
      blocks: [
        { startTime: '13:30', endTime: '19:00' },
        { startTime: '08:00', endTime: '12:00' },
      ],
      validFrom: '2099-01-01',
    };

    it('saves every day × block in one transaction under the dentist lock', async () => {
      const { created } = await service.bulkCreateWorkingSchedules(dto, admin);
      expect(created).toHaveLength(12);
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(prisma.$executeRawUnsafe).toHaveBeenCalledWith(
        expect.stringMatching(/^SELECT pg_advisory_xact_lock\(1, /),
      );
      const first = (prisma.workingSchedule.create as jest.Mock).mock.calls[0][0].data;
      expect(first).toMatchObject({
        dayOfWeek: 1,
        startTime: t('08:00'),
        endTime: t('12:00'),
        shiftType: 'MORNING',
        validFrom: new Date('2099-01-01'),
        validTo: null,
      });
      expect((prisma.workingSchedule.create as jest.Mock).mock.calls[1][0].data.shiftType).toBe(
        'AFTERNOON',
      );
      expect(audit.log).toHaveBeenCalledTimes(12);
    });

    it('refuses blocks overlapping each other (400)', async () => {
      const error = await service
        .bulkCreateWorkingSchedules(
          {
            ...dto,
            blocks: [
              { startTime: '08:00', endTime: '12:30' },
              { startTime: '12:00', endTime: '17:00' },
            ],
          },
          admin,
        )
        .catch(e => e);
      expect(statusOf(error)).toBe(400);
      expect(error.message).toMatch(/không được chồng nhau/);
      expect(prisma.workingSchedule.create).not.toHaveBeenCalled();
    });

    it('refuses an end before the start and a validTo before validFrom (400, Vietnamese)', async () => {
      const reversed = await service
        .bulkCreateWorkingSchedules(
          { ...dto, blocks: [{ startTime: '12:00', endTime: '08:00' }] },
          admin,
        )
        .catch(e => e);
      expect(statusOf(reversed)).toBe(400);
      expect(reversed.message).toMatch(/Giờ kết thúc phải sau giờ bắt đầu/);

      const dates = await service
        .bulkCreateWorkingSchedules({ ...dto, validTo: '2098-12-31' }, admin)
        .catch(e => e);
      expect(statusOf(dates)).toBe(400);
      expect(dates.message).toMatch(/hết hiệu lực/);
    });

    it('names the existing schedule it overlaps (409, Vietnamese)', async () => {
      (prisma.workingSchedule.findMany as jest.Mock).mockResolvedValue([
        {
          id: 'old',
          startTime: t('08:00'),
          endTime: t('17:00'),
          validFrom: new Date('2026-01-01'),
          validTo: null,
        },
      ]);
      const error = await service.bulkCreateWorkingSchedules(dto, admin).catch(e => e);
      expect(statusOf(error)).toBe(409);
      expect(error.message).toMatch(/Thứ Hai 08:00-12:00 trùng lịch đã có 08:00-17:00/);
      expect(error.message).toMatch(/kết thúc lịch cũ/);
    });

    it('a dentist may only add their own schedule', async () => {
      await expect(
        service.bulkCreateWorkingSchedules(dto, dentistPayload('dentist-2')),
      ).rejects.toThrow(/chính mình/);
    });
  });

  describe('update / end / delete a weekly schedule', () => {
    // A running Monday-like row on the weekday of `day`, 08:00-17:00.
    const day = addDays(today, 7);
    const running = {
      id: 'ws-1',
      dentistId: 'dentist-1',
      dayOfWeek: dow(day),
      startTime: t('08:00'),
      endTime: t('17:00'),
      slotDurationMin: 30,
      validFrom: new Date('2020-01-01'),
      validTo: null,
      isPaidShift: true,
      shiftType: 'FULL_DAY',
      deletedAt: null,
    };

    beforeEach(() => {
      (prisma.workingSchedule.findFirst as jest.Mock).mockResolvedValue(running);
      (prisma.workingSchedule.update as jest.Mock).mockImplementation(async ({ data }: any) => ({
        ...running,
        ...data,
      }));
    });

    it('changes the hours of a running schedule from today: ends the old row yesterday, lists bookings left outside', async () => {
      // After the change the calendar only has 08:00-11:00 that weekday.
      (prisma.workingSchedule.findMany as jest.Mock).mockImplementation(async ({ where }: any) =>
        where.id ? [] : [{ startTime: t('08:00'), endTime: t('11:00'), slotDurationMin: 30 }],
      );
      (prisma.appointment.findMany as jest.Mock).mockResolvedValue([
        { id: 'fits', startAt: at(day, '09:00'), endAt: at(day, '09:30') },
        { id: 'outside', startAt: at(day, '11:30'), endAt: at(day, '12:00') },
        // Another weekday is not touched by this row.
        {
          id: 'other-day',
          startAt: at(addDays(day, 1), '16:00'),
          endAt: at(addDays(day, 1), '16:30'),
        },
      ]);

      const result = await service.updateWorkingSchedule(
        'ws-1',
        { startTime: '08:00', endTime: '11:00' },
        admin,
      );

      expect(prisma.workingSchedule.update).toHaveBeenCalledWith({
        where: { id: 'ws-1' },
        data: { validTo: new Date(addDays(today, -1)) },
      });
      expect((prisma.workingSchedule.create as jest.Mock).mock.calls[0][0].data).toMatchObject({
        dayOfWeek: running.dayOfWeek,
        startTime: t('08:00'),
        endTime: t('11:00'),
        validFrom: new Date(today),
        validTo: null,
      });
      expect(result.affectedAppointments.map((a: any) => a.id)).toEqual(['outside']);
      // The overlap check ignores the row being replaced.
      expect(
        (prisma.workingSchedule.findMany as jest.Mock).mock.calls.some(
          ([arg]: any) => arg.where.id?.notIn?.[0] === 'ws-1',
        ),
      ).toBe(true);
      expect(prisma.appointment.update).not.toHaveBeenCalled();
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'WORKING_SCHEDULE_UPDATED' }),
      );
    });

    it("a change from today also lists today's visits already started or checked in", async () => {
      jest.useFakeTimers({ now: at(today, '20:00'), doNotFake: ['nextTick', 'setImmediate'] });
      try {
        (prisma.workingSchedule.findMany as jest.Mock).mockImplementation(async ({ where }: any) =>
          where.id ? [] : [{ startTime: t('08:00'), endTime: t('11:00'), slotDurationMin: 30 }],
        );
        (prisma.appointment.findMany as jest.Mock).mockResolvedValue([
          {
            id: 'in-chair',
            status: 'CHECKED_IN',
            startAt: at(today, '12:00'),
            endAt: at(today, '12:30'),
          },
        ]);
        const result = await service.updateWorkingSchedule('ws-1', { endTime: '11:00' }, admin);
        const where = (prisma.appointment.findMany as jest.Mock).mock.calls[0][0].where;
        expect(where.OR[1].status.in).toEqual(
          expect.arrayContaining(['CHECKED_IN', 'IN_PROGRESS']),
        );
        expect(where.OR[1].startAt).toEqual({
          gte: new Date(`${today}T00:00:00+07:00`),
          lt: at(today, '20:00'),
        });
        expect(result.affectedAppointments.map((a: any) => a.id)).toEqual(['in-chair']);
      } finally {
        jest.useRealTimers();
      }
    });

    it('edits a schedule that has not started yet in place', async () => {
      (prisma.workingSchedule.findFirst as jest.Mock).mockResolvedValue({
        ...running,
        validFrom: new Date(addDays(today, 3)),
      });
      (prisma.appointment.findMany as jest.Mock).mockResolvedValue([]);
      await service.updateWorkingSchedule('ws-1', { startTime: '09:00' }, admin);
      expect(prisma.workingSchedule.create).not.toHaveBeenCalled();
      expect((prisma.workingSchedule.update as jest.Mock).mock.calls[0][0].data).toMatchObject({
        startTime: t('09:00'),
        endTime: t('17:00'),
      });
    });

    it('will not apply a change to past days of a running schedule', async () => {
      const error = await service
        .updateWorkingSchedule(
          'ws-1',
          { startTime: '09:00', effectiveFrom: addDays(today, -3) },
          admin,
        )
        .catch(e => e);
      expect(statusOf(error)).toBe(400);
      expect(error.message).toMatch(/từ hôm nay trở đi/);
    });

    it('ends a running schedule (validTo) no earlier than yesterday and reports bookings after it', async () => {
      const tooEarly = await service
        .updateWorkingSchedule('ws-1', { validTo: addDays(today, -2) }, admin)
        .catch(e => e);
      expect(statusOf(tooEarly)).toBe(400);

      (prisma.appointment.findMany as jest.Mock).mockResolvedValue([
        { id: 'after-end', startAt: at(day, '09:00'), endAt: at(day, '09:30') },
      ]);
      const result = await service.updateWorkingSchedule(
        'ws-1',
        { validTo: addDays(today, 1) },
        admin,
      );
      expect(prisma.workingSchedule.update).toHaveBeenLastCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ validTo: new Date(addDays(today, 1)) }),
        }),
      );
      expect(result.affectedAppointments.map((a: any) => a.id)).toEqual(['after-end']);
    });

    it("forbids a dentist from editing a colleague's schedule", async () => {
      await expect(
        service.updateWorkingSchedule('ws-1', { startTime: '09:00' }, dentistPayload('dentist-2')),
      ).rejects.toThrow(/chính mình/);
    });

    it('keeps an expired schedule unchanged (payroll history)', async () => {
      (prisma.workingSchedule.findFirst as jest.Mock).mockResolvedValue({
        ...running,
        validTo: new Date(addDays(today, -1)),
      });
      const error = await service
        .updateWorkingSchedule('ws-1', { startTime: '09:00' }, admin)
        .catch(e => e);
      expect(statusOf(error)).toBe(409);
    });

    it('deletes only a schedule that has not started yet', async () => {
      const error = await service.deleteWorkingSchedule('ws-1', admin).catch(e => e);
      expect(statusOf(error)).toBe(409);
      expect(error.message).toMatch(/Kết thúc/);

      (prisma.workingSchedule.findFirst as jest.Mock).mockResolvedValue({
        ...running,
        validFrom: new Date(addDays(today, 3)),
      });
      (prisma.appointment.findMany as jest.Mock).mockResolvedValue([]);
      const result = await service.deleteWorkingSchedule('ws-1', admin);
      expect(prisma.workingSchedule.update).toHaveBeenCalledWith({
        where: { id: 'ws-1' },
        data: { deletedAt: expect.any(Date) },
      });
      expect(result).toEqual({ affectedAppointments: [], affectedBookingRequests: [] });
    });

    it("lists open online requests the change leaves outside working hours, with the dentist's own duration", async () => {
      (prisma.workingSchedule.findMany as jest.Mock).mockImplementation(async ({ where }: any) =>
        where.id ? [] : [{ startTime: t('08:00'), endTime: t('11:00'), slotDurationMin: 30 }],
      );
      (prisma.appointment.findMany as jest.Mock).mockResolvedValue([]);
      assignService(60);
      (prisma.bookingRequest.findMany as jest.Mock).mockResolvedValue([
        request('fits', at(day, '09:00')),
        // 60 min from 10:30 runs past 11:00 (30 min, the service default, would fit).
        request('late', at(day, '10:30')),
      ]);
      const result = await service.updateWorkingSchedule('ws-1', { endTime: '11:00' }, admin);
      expect(result.affectedBookingRequests).toEqual([
        expect.objectContaining({
          id: 'late',
          referenceCode: 'GS-late',
          startAt: at(day, '10:30'),
          slotIssue: expect.objectContaining({ kind: 'OUTSIDE_WORKING_HOURS' }),
        }),
      ]);
      const where = (prisma.bookingRequest.findMany as jest.Mock).mock.calls[0][0].where;
      // A proposal's time counts only while it stands (same rule as BookingService).
      expect(where.OR.map((c: any) => c.status.in)).toEqual([
        ['PENDING_REVIEW', 'NEEDS_INFORMATION'],
        ['PROPOSED', 'PATIENT_ACCEPTED'],
      ]);
    });
  });

  describe('changed hours with several blocks and removing an override', () => {
    const day = addDays(today, 5);

    it('saves one row per block so a lunch break survives', async () => {
      (prisma.scheduleOverride.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.appointment.count as jest.Mock).mockResolvedValue(0);
      (prisma.appointment.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.scheduleOverride.create as jest.Mock).mockImplementation(async ({ data }: any) => ({
        id: `ov-${data.startTime.toISOString()}`,
        createdAt: new Date(),
        ...data,
      }));
      const result = await service.createScheduleOverride(
        {
          dentistId: 'dentist-1',
          date: day,
          kind: 'CHANGED_HOURS',
          ranges: [
            { startTime: '14:00', endTime: '18:00' },
            { startTime: '09:00', endTime: '12:00' },
          ],
          reason: 'Họp chuyên môn',
        },
        admin,
      );
      expect(result.overrides.map(o => `${o.startTime}-${o.endTime}`)).toEqual([
        '09:00-12:00',
        '14:00-18:00',
      ]);
      expect(prisma.scheduleOverride.create).toHaveBeenCalledTimes(2);
    });

    it('refuses overlapping blocks, a past day and a bad range with 400 in Vietnamese', async () => {
      const overlap = await service
        .createScheduleOverride(
          {
            dentistId: 'dentist-1',
            date: day,
            kind: 'CHANGED_HOURS',
            ranges: [
              { startTime: '09:00', endTime: '12:00' },
              { startTime: '11:00', endTime: '15:00' },
            ],
            reason: 'Họp',
          },
          admin,
        )
        .catch(e => e);
      expect(statusOf(overlap)).toBe(400);

      const past = await service
        .createScheduleOverride(
          { dentistId: 'dentist-1', date: addDays(today, -1), kind: 'CLOSED', reason: 'Sửa ghế' },
          admin,
        )
        .catch(e => e);
      expect(statusOf(past)).toBe(400);
      expect(past.message).toBe('Không thể sửa lịch của ngày đã qua');

      const reversed = await service
        .createScheduleOverride(
          {
            dentistId: 'dentist-1',
            date: day,
            kind: 'CLOSED',
            startTime: '12:00',
            endTime: '09:00',
            reason: 'Sửa ghế',
          },
          admin,
        )
        .catch(e => e);
      expect(statusOf(reversed)).toBe(400);
      expect(reversed.message).toMatch(/Giờ kết thúc phải sau giờ bắt đầu/);
    });

    it('removing changed hours lists bookings the weekly hours no longer allow', async () => {
      (prisma.scheduleOverride.findFirst as jest.Mock).mockResolvedValue({
        id: 'ov-1',
        dentistId: 'dentist-1',
        date: new Date(day),
        kind: 'CHANGED_HOURS',
      });
      // Back to the weekly 08:00-12:00 after the delete.
      (prisma.workingSchedule.findMany as jest.Mock).mockResolvedValue([
        { startTime: t('08:00'), endTime: t('12:00'), slotDurationMin: 30 },
      ]);
      (prisma.scheduleOverride.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.appointment.findMany as jest.Mock).mockResolvedValue([
        { id: 'late', startAt: at(day, '18:00'), endAt: at(day, '18:30') },
      ]);
      const result = await service.deleteScheduleOverride('ov-1', admin);
      expect(prisma.scheduleOverride.update).toHaveBeenCalledWith({
        where: { id: 'ov-1' },
        data: { deletedAt: expect.any(Date), deletedBy: admin.sub },
      });
      expect(result.affectedAppointments.map((a: any) => a.id)).toEqual(['late']);
    });
  });

  describe('clinic-wide closures (migration 035)', () => {
    const start = addDays(today, 10);
    const end = addDays(today, 16);
    const dto = { startDate: start, endDate: end, reason: 'Nghỉ Tết Nguyên đán' };

    beforeEach(() => {
      (prisma.clinicClosure.findFirst as jest.Mock).mockResolvedValue(null);
      (prisma.appointment.count as jest.Mock).mockResolvedValue(0);
      (prisma.clinicClosure.create as jest.Mock).mockImplementation(async ({ data }: any) => ({
        id: 'cc-1',
        createdAt: new Date(),
        ...data,
      }));
    });

    it('lists every booking and open online request of the closed days, cancelling none', async () => {
      (prisma.appointment.findMany as jest.Mock).mockResolvedValue([
        {
          id: 'a1',
          dentistId: 'dentist-1',
          startAt: at(start, '09:00'),
          endAt: at(start, '09:30'),
          status: 'SCHEDULED',
          dentist: { fullName: 'BS An' },
          patient: { id: 'p', code: 'BN1', fullName: 'Trần B', primaryPhone: null },
        },
      ]);
      assignService(30);
      (prisma.clinicClosure.findMany as jest.Mock).mockResolvedValue([
        { reason: 'Nghỉ Tết Nguyên đán' },
      ]);
      (prisma.bookingRequest.findMany as jest.Mock).mockResolvedValue([
        request('br-1', at(start, '08:00'), {
          status: 'PROPOSED',
          proposedStartAt: at(start, '10:00'),
        }),
      ]);
      const result = await service.createClinicClosure(dto, admin);
      expect(result).toMatchObject({ id: 'cc-1', startDate: start, endDate: end });
      expect(result.affectedAppointments).toEqual([
        expect.objectContaining({ id: 'a1', dentistName: 'BS An' }),
      ]);
      expect(result.affectedBookingRequests).toEqual([
        expect.objectContaining({
          id: 'br-1',
          startAt: at(start, '10:00'),
          slotIssue: {
            kind: 'CLOSED',
            message: `Phòng khám nghỉ: Nghỉ Tết Nguyên đán (ngày ${start})`,
          },
        }),
      ]);
      expect(prisma.appointment.update).not.toHaveBeenCalled();
      expect(prisma.$executeRawUnsafe).toHaveBeenCalledWith(
        expect.stringMatching(/^SELECT pg_advisory_xact_lock\(4, /),
      );
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'CLINIC_CLOSURE_CREATED' }),
      );
    });

    it('validates the dates and refuses an overlapping closure', async () => {
      const reversed = await service
        .createClinicClosure({ ...dto, endDate: addDays(start, -1) }, admin)
        .catch(e => e);
      expect(statusOf(reversed)).toBe(400);
      const past = await service
        .createClinicClosure({ ...dto, startDate: addDays(today, -1) }, admin)
        .catch(e => e);
      expect(statusOf(past)).toBe(400);
      const tooLong = await service
        .createClinicClosure({ ...dto, endDate: addDays(start, 60) }, admin)
        .catch(e => e);
      expect(statusOf(tooLong)).toBe(400);

      (prisma.clinicClosure.findFirst as jest.Mock).mockResolvedValue({
        id: 'cc-0',
        startDate: new Date(start),
        endDate: new Date(start),
        reason: 'Giỗ Tổ',
      });
      const overlap = await service.createClinicClosure(dto, admin).catch(e => e);
      expect(statusOf(overlap)).toBe(409);
      expect(overlap.getResponse().error).toBe('CLINIC_CLOSURE_OVERLAP');
      expect(prisma.clinicClosure.create).not.toHaveBeenCalled();
    });

    it('closes every dentist that day with the clinic reason', async () => {
      (prisma.workingSchedule.findMany as jest.Mock).mockResolvedValue([
        { startTime: t('08:00'), endTime: t('12:00'), slotDurationMin: 30 },
      ]);
      (prisma.clinicClosure.findMany as jest.Mock).mockResolvedValue([
        { reason: 'Nghỉ Tết Nguyên đán' },
      ]);
      const result = await service.getAvailability({ dentistId: 'dentist-1', date: start });
      expect(result).toMatchObject({
        blockedReason: 'CLOSED',
        availableSlots: [],
        closedReason: 'Phòng khám nghỉ: Nghỉ Tết Nguyên đán',
      });
      expect(prisma.clinicClosure.findMany).toHaveBeenCalledWith({
        where: {
          startDate: { lte: new Date(start) },
          endDate: { gte: new Date(start) },
          deletedAt: null,
        },
        select: { reason: true },
      });
    });

    it('a running closure keeps its first day; a past one is history', async () => {
      (prisma.clinicClosure.findFirst as jest.Mock).mockResolvedValue({
        id: 'cc-1',
        startDate: new Date(addDays(today, -1)),
        endDate: new Date(addDays(today, 2)),
        reason: 'Tết',
      });
      const moved = await service
        .updateClinicClosure(
          'cc-1',
          { ...dto, startDate: today, endDate: addDays(today, 3) },
          admin,
        )
        .catch(e => e);
      expect(statusOf(moved)).toBe(400);

      (prisma.clinicClosure.findFirst as jest.Mock).mockResolvedValue({
        id: 'cc-1',
        startDate: new Date(addDays(today, -5)),
        endDate: new Date(addDays(today, -2)),
        reason: 'Tết',
      });
      const past = await service.deleteClinicClosure('cc-1', admin).catch(e => e);
      expect(statusOf(past)).toBe(409);
      expect(prisma.clinicClosure.update).not.toHaveBeenCalled();
    });
  });
});

import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import {
  AvailabilityQueryDto,
  BulkCreateWorkingSchedulesDto,
  CancelAppointmentDto,
  CreateAppointmentDto,
  RescheduleAppointmentDto,
  ClinicClosureDto,
  CreateScheduleOverrideDto,
  CreateShiftRegistrationDto,
  CreateWorkingScheduleDto,
  ListAppointmentsQueryDto,
  StatusReasonDto,
  UpdateWorkingScheduleDto,
} from './appointment.dto';
import { CLINIC_TIME_MESSAGE } from '../../common/validators/is-clinic-time';

describe('ListAppointmentsQueryDto.status transform', () => {
  it('single bare value becomes a 1-element uppercase array', () => {
    const dto = plainToInstance(ListAppointmentsQueryDto, { status: 'checked_in' });
    expect(dto.status).toEqual(['CHECKED_IN']);
  });

  it('repeated query params (Express already arrays these) become an uppercase array', () => {
    const dto = plainToInstance(ListAppointmentsQueryDto, {
      status: ['checked_in', 'confirmed'],
    });
    expect(dto.status).toEqual(['CHECKED_IN', 'CONFIRMED']);
  });

  it('a comma-joined single value is split into an uppercase array (regression: used to survive as one garbage element like ["CHECKED_IN,CONFIRMED"], which Prisma 500s on since it is not a real enum value)', () => {
    const dto = plainToInstance(ListAppointmentsQueryDto, {
      status: 'checked_in,confirmed',
    });
    expect(dto.status).toEqual(['CHECKED_IN', 'CONFIRMED']);
  });

  it('undefined stays undefined', () => {
    const dto = plainToInstance(ListAppointmentsQueryDto, {});
    expect(dto.status).toBeUndefined();
  });
});

describe('AvailabilityQueryDto.slotDuration', () => {
  const errorsFor = (slotDuration: number) =>
    validateSync(
      plainToInstance(AvailabilityQueryDto, {
        dentistId: '01900000-0000-7000-8000-000000000000',
        date: '2026-09-25',
        slotDuration,
      }),
    ).map(e => e.property);

  it('accepts a visit as short as the shortest catalogue service (5 min)', () => {
    // Regression: the reschedule picker sends the visit length, and a 10-min
    // X-ray visit got a 400 instead of free slots.
    expect(errorsFor(10)).toEqual([]);
    expect(errorsFor(5)).toEqual([]);
  });

  it('still rejects lengths below 5 min', () => {
    expect(errorsFor(4)).toEqual(['slotDuration']);
  });
});

describe('schedule times ("HH:mm", 5-minute grid)', () => {
  const DENTIST = '01900000-0000-7000-8000-000000000000';
  const errors = (cls: any, body: Record<string, unknown>) =>
    validateSync(plainToInstance(cls, body) as object);
  const schedule = (startTime: unknown, endTime: unknown = '12:00') =>
    errors(CreateWorkingScheduleDto, {
      dentistId: DENTIST,
      dayOfWeek: 1,
      startTime,
      endTime,
      validFrom: '2026-10-01',
    });

  it.each(['abc', '25:00', '07:60', '8:00', '08:07', '', 800])(
    'rejects %p with a Vietnamese message',
    v => {
      const [e] = schedule(v);
      expect(e.property).toBe('startTime');
      expect(Object.values(e.constraints ?? {})).toEqual([CLINIC_TIME_MESSAGE]);
    },
  );

  it.each(['00:00', '08:05', '13:30', '23:55'])('accepts %p', v => {
    expect(schedule(v, '23:59')).toEqual([]);
  });

  it('applies to overrides, shift registrations and bulk blocks too', () => {
    expect(
      errors(CreateScheduleOverrideDto, {
        dentistId: DENTIST,
        date: '2026-10-01',
        kind: 'CHANGED_HOURS',
        ranges: [{ startTime: '09:00', endTime: '25:00' }],
        reason: 'Họp',
      }).map(e => e.property),
    ).toEqual(['ranges']);
    expect(
      errors(CreateShiftRegistrationDto, {
        dentistId: DENTIST,
        date: '2026-10-01',
        startTime: 'abc',
        endTime: '12:00',
      }).map(e => e.property),
    ).toEqual(['startTime']);
    expect(
      errors(BulkCreateWorkingSchedulesDto, {
        dentistId: DENTIST,
        daysOfWeek: [1, 1],
        blocks: [{ startTime: '07:60', endTime: '12:00' }],
        validFrom: '2026-10-01',
      })
        .map(e => e.property)
        .sort(),
    ).toEqual(['blocks', 'daysOfWeek']);
  });

  it('PATCH accepts validTo null (open-ended again) and rejects a bad date', () => {
    expect(errors(UpdateWorkingScheduleDto, { validTo: null })).toEqual([]);
    expect(
      errors(UpdateWorkingScheduleDto, { validTo: '2026-02-30' }).map(e => e.property),
    ).toEqual(['validTo']);
  });

  it('clinic closures need real dates and a reason', () => {
    expect(
      errors(ClinicClosureDto, { startDate: '2027-02-05', endDate: '2027-02-12', reason: 'Tết' }),
    ).toEqual([]);
    expect(
      errors(ClinicClosureDto, { startDate: 'x', endDate: '2027-02-12', reason: '' })
        .map(e => e.property)
        .sort(),
    ).toEqual(['reason', 'startDate']);
  });
});

describe('appointment times (create / reschedule)', () => {
  const uuid = '01900000-0000-7000-8000-000000000000';
  const createErrors = (startAt: string) =>
    validateSync(
      plainToInstance(CreateAppointmentDto, { patientId: uuid, dentistId: uuid, startAt }),
    ).flatMap(e => Object.values(e.constraints ?? {}));
  const rescheduleErrors = (newStartsAt: string) =>
    validateSync(
      plainToInstance(RescheduleAppointmentDto, {
        newStartsAt,
        newEndsAt: '2026-10-22T09:30:00+07:00',
      }),
    ).map(e => e.property);

  it('accepts an instant with Z or an offset on a whole minute', () => {
    expect(createErrors('2026-10-22T09:00:00+07:00')).toEqual([]);
    expect(createErrors('2026-10-22T02:00:00.000Z')).toEqual([]);
    expect(createErrors('2026-10-22T09:00+0700')).toEqual([]);
  });

  it('refuses a zone-less time (it was read as UTC: 09:00 became 16:00)', () => {
    expect(createErrors('2026-10-22T09:00:00')).toEqual([
      'startAt phải có múi giờ (Z hoặc ±hh:mm)',
    ]);
  });

  it('refuses seconds, as online requests do', () => {
    expect(createErrors('2026-10-22T10:07:30+07:00')).toEqual([
      'startAt phải tròn phút (không có giây)',
    ]);
    expect(createErrors('2026-10-22T10:07:00.500Z')).toHaveLength(1);
  });

  it('refuses a day that does not exist instead of rolling it over (2026-02-30)', () => {
    expect(rescheduleErrors('2026-02-30T09:00:00+07:00')).toEqual(['newStartsAt']);
    expect(rescheduleErrors('2026-10-22T09:00:00+07:00')).toEqual([]);
  });
});

describe('CancelAppointmentDto', () => {
  const errors = (body: Record<string, unknown>) =>
    validateSync(plainToInstance(CancelAppointmentDto, body)).flatMap(e =>
      Object.values(e.constraints ?? {}),
    );

  it('requires a reason of at least 5 characters (trimmed)', () => {
    expect(errors({})).toContain('Lý do hủy lịch cần ít nhất 5 ký tự');
    expect(errors({ reason: '  ok  ' })).toEqual(['Lý do hủy lịch cần ít nhất 5 ký tự']);
    expect(errors({ reason: 'Bệnh nhân bận' })).toEqual([]);
  });

  it('accepts the optional version guard', () => {
    expect(
      errors({
        reason: 'Bệnh nhân bận',
        rescheduleCount: 1,
        updatedAt: '2026-09-30T01:02:03.456Z',
      }),
    ).toEqual([]);
    expect(errors({ reason: 'Bệnh nhân bận', updatedAt: '2026-02-30T00:00:00Z' })).toHaveLength(1);
  });
});

describe('StatusReasonDto (undo of a check-in / no-show)', () => {
  const errors = (reason: unknown) =>
    validateSync(plainToInstance(StatusReasonDto, { reason })).flatMap(e =>
      Object.values(e.constraints ?? {}),
    );

  it('trims the reason before checking its length', () => {
    expect(plainToInstance(StatusReasonDto, { reason: '  Check-in nhầm  ' }).reason).toBe(
      'Check-in nhầm',
    );
    expect(errors('   abc    ')).toEqual(['Lý do cần ít nhất 5 ký tự']);
  });

  it('answers a missing reason in Vietnamese', () => {
    expect(errors(undefined)).toEqual(
      expect.arrayContaining(['Vui lòng nhập lý do', 'Lý do cần ít nhất 5 ký tự']),
    );
    expect(errors('Đánh vắng mặt nhầm')).toEqual([]);
  });
});

import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import {
  AvailabilityQueryDto,
  BulkCreateWorkingSchedulesDto,
  ClinicClosureDto,
  CreateScheduleOverrideDto,
  CreateShiftRegistrationDto,
  CreateWorkingScheduleDto,
  ListAppointmentsQueryDto,
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

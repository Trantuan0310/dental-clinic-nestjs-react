import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { AvailabilityQueryDto, ListAppointmentsQueryDto } from './appointment.dto';

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

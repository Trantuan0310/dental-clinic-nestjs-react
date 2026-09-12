import { plainToInstance } from 'class-transformer';
import { ListAppointmentsQueryDto } from './appointment.dto';

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

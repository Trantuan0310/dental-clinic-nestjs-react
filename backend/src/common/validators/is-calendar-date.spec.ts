import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { isCalendarDate } from './is-calendar-date';
import { CreatePatientDto, ListPatientsQueryDto } from '../../patients/dto/patient.dto';
import {
  AvailabilityQueryDto,
  ListAppointmentsQueryDto,
} from '../../appointments/dto/appointment.dto';

describe('isCalendarDate', () => {
  it.each(['2024-02-29', '2023-12-31', '2026-09-03T16:59:59.999Z'])('accepts %s', v => {
    expect(isCalendarDate(v)).toBe(true);
  });

  it.each(['2023-02-29', '2023-04-31', '2023-13-01', 'abc', '', 20230101, null])(
    'rejects %p (no silent roll-over)',
    v => {
      expect(isCalendarDate(v)).toBe(false);
    },
  );
});

describe('DTO limits that used to surface as 500s', () => {
  const props = (cls: any, body: object) =>
    validateSync(plainToInstance(cls, body)).map(e => e.property);

  const patient = {
    fullName: 'Nguyễn Văn A',
    dob: '1990-01-15',
    gender: 'MALE',
    primaryPhone: '0901234567',
  };

  it('accepts a normal patient', () => {
    expect(props(CreatePatientDto, patient)).toEqual([]);
  });

  it('rejects an impossible dob and over-long columns', () => {
    expect(
      props(CreatePatientDto, {
        ...patient,
        dob: '2023-02-29',
        fullName: 'x'.repeat(201),
        occupation: 'x'.repeat(101),
        contactPersonName: 'x'.repeat(201),
        contactPersonPhone: '0'.repeat(21),
      }),
    ).toEqual(
      expect.arrayContaining([
        'dob',
        'fullName',
        'occupation',
        'contactPersonName',
        'contactPersonPhone',
      ]),
    );
  });

  it('rejects a non-UUID cursor and a bad availability date', () => {
    expect(props(ListPatientsQueryDto, { cursor: 'abc' })).toContain('cursor');
    expect(props(ListAppointmentsQueryDto, { cursor: 'abc' })).toContain('cursor');
    expect(
      props(AvailabilityQueryDto, {
        dentistId: '00000000-0000-4000-8000-000000000001',
        date: 'abc',
      }),
    ).toContain('date');
  });
});

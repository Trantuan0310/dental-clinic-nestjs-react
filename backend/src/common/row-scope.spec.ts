import { assertClinicWide, isRowScoped, rowScope } from './row-scope';

const actor = (...permissions: string[]) => ({ permissions });

describe('rowScope (A6-19)', () => {
  it('maps .read.any / .read.own and denies by default', () => {
    expect(rowScope(actor('invoice.read.any', 'invoice.read.own'), 'invoice')).toBe('any');
    expect(rowScope(actor('invoice.read.own'), 'invoice')).toBe('own');
    // FE alias alone: no rows (used to fall through to "every invoice").
    expect(rowScope(actor('invoice.read'), 'invoice')).toBe('none');
    // A write permission without a read scope is not clinic-wide.
    expect(isRowScoped(actor('appointment.update', 'appointment.cancel'), 'appointment')).toBe(
      true,
    );
    expect(isRowScoped(actor('appointment.read.any'), 'appointment')).toBe(false);
  });

  it('keeps patients consistent with the appointment scope', () => {
    expect(
      rowScope(actor('patient.read', 'patient.update', 'appointment.read.any'), 'patient'),
    ).toBe('any');
    // Dentist-like custom role with roster rights: still only own patients.
    expect(
      rowScope(actor('patient.read', 'patient.update', 'appointment.read.own'), 'patient'),
    ).toBe('own');
    expect(rowScope(actor('patient.read'), 'patient')).toBe('own');
    expect(rowScope(actor('patient.delete'), 'patient')).toBe('any');
    expect(rowScope(actor(), 'patient')).toBe('none');
  });

  it('assertClinicWide closes side doors such as booking patient matches', () => {
    const desk = actor('patient.update', 'appointment.read.any');
    expect(() => assertClinicWide(desk, 'patient', 'appointment')).not.toThrow();
    // A custom role with booking_request.* but only its own calendar.
    const own = actor('patient.read', 'patient.update', 'appointment.read.own');
    expect(() => assertClinicWide(own, 'patient')).toThrow(/hồ sơ bệnh nhân toàn phòng khám/);
    expect(() => assertClinicWide(actor('patient.update'), 'patient', 'appointment')).toThrow(
      /appointment\.read\.any/,
    );
  });
});

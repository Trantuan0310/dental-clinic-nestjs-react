import {
  allocateInvoiceBasis,
  clinicDateValue,
  periodDateKeys,
  periodInstantRange,
} from './pay-period';

/** In [from, toExclusive) — the filter every payroll query uses (H1). */
const inPeriod = (instant: string, p: { start: Date; end: Date }) => {
  const { from, toExclusive } = periodInstantRange(p);
  const t = new Date(instant).getTime();
  return t >= from.getTime() && t < toExclusive.getTime();
};

describe('periodInstantRange (H1: clinic days, half-open)', () => {
  // DATE columns come back as UTC midnight.
  const sep = { start: new Date('2026-09-01'), end: new Date('2026-09-30') };
  const oct = { start: new Date('2026-10-01'), end: new Date('2026-10-31') };

  it('covers 00:00 VN of the first day to 00:00 VN after the last day', () => {
    const r = periodInstantRange(sep);
    expect(r.from.toISOString()).toBe('2026-08-31T17:00:00.000Z');
    expect(r.toExclusive.toISOString()).toBe('2026-09-30T17:00:00.000Z');
  });

  it.each([
    ['2026-09-30T10:00:00+07:00', true, false], // was lost in both periods (A6-01)
    ['2026-09-30T23:59:59+07:00', true, false],
    ['2026-10-01T00:00:00+07:00', false, true],
    ['2026-09-01T00:00:00+07:00', true, false],
    ['2026-08-31T23:59:59+07:00', false, false],
  ])('%s → Sep %s, Oct %s (each instant in exactly one period)', (instant, s, o) => {
    expect(inPeriod(instant, sep)).toBe(s);
    expect(inPeriod(instant, oct)).toBe(o);
  });

  it('lists the period clinic dates', () => {
    expect(periodDateKeys({ start: new Date('2026-09-29'), end: new Date('2026-10-02') })).toEqual([
      '2026-09-29',
      '2026-09-30',
      '2026-10-01',
      '2026-10-02',
    ]);
  });

  it('clinicDateValue maps 23:59 VN and 00:00 VN to their own clinic days', () => {
    expect(clinicDateValue(new Date('2026-09-30T23:59:00+07:00')).toISOString()).toBe(
      '2026-09-30T00:00:00.000Z',
    );
    expect(clinicDateValue(new Date('2026-10-01T00:00:00+07:00')).toISOString()).toBe(
      '2026-10-01T00:00:00.000Z',
    );
  });
});

describe('allocateInvoiceBasis (H5: discount shared pro rata)', () => {
  it('shares an invoice discount across lines', () => {
    const m = allocateInvoiceBasis(
      [
        { id: 'a', lineTotal: 6_000_000 },
        { id: 'b', lineTotal: 4_000_000 },
      ],
      10_000_000,
      5_000_000,
    );
    expect(m.get('a')).toBe(3_000_000);
    expect(m.get('b')).toBe(2_000_000);
  });

  it('rounds to đồng and the lines add up to the invoice total', () => {
    const m = allocateInvoiceBasis(
      [
        { id: 'a', lineTotal: 100_000 },
        { id: 'b', lineTotal: 100_000 },
        { id: 'c', lineTotal: 100_000 },
      ],
      300_000,
      200_000,
    );
    expect([...m.values()].reduce((s, v) => s + v, 0)).toBe(200_000);
    expect([...m.values()].every(v => Number.isInteger(v))).toBe(true);
  });

  it('a 0đ invoice gives no basis', () => {
    const m = allocateInvoiceBasis([{ id: 'a', lineTotal: 0 }], 0, 0);
    expect(m.get('a')).toBe(0);
  });
});

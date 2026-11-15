import { buildDayCalendar } from '../appointments/domain/day-calendar';
import {
  capacityCells,
  coverageCells,
  median,
  patientFunnel,
  percent,
  scorecardMetric,
  SCORECARD_TARGETS,
  waitMinutes,
} from './practice-metrics';

/** A TIME column value, as Prisma returns it. */
const time = (hhmm: string) => new Date(`1970-01-01T${hhmm}:00Z`);
const at = (date: string, hhmm: string) => new Date(`${date}T${hhmm}:00+07:00`);

function day(
  date: string,
  opts: {
    hours?: Array<[string, string]>;
    bookings?: Array<[string, string]>;
    timeOff?: [string, string];
    closure?: boolean;
  } = {},
) {
  return buildDayCalendar({
    date,
    schedules: (opts.hours ?? [['08:00', '12:00']]).map(([s, e]) => ({
      startTime: time(s),
      endTime: time(e),
    })),
    shifts: [],
    overrides: [],
    timeOffs: opts.timeOff
      ? [{ startAt: at(date, opts.timeOff[0]), endAt: at(date, opts.timeOff[1]) }]
      : [],
    clinicClosures: opts.closure ? [{ reason: 'Tết' }] : [],
    bookings: (opts.bookings ?? []).map(([s, e], i) => ({
      id: `b${i}`,
      startAt: at(date, s),
      endAt: at(date, e),
    })),
  });
}

// 2026-11-02 is a Monday (getUTCDay = 1).
const MONDAY = '2026-11-02';

describe('capacityCells', () => {
  it('retains uncovered demand when another dentist is free in the same hour', () => {
    const cells=coverageCells([day(MONDAY,{hours:[],bookings:[['09:00','09:30']]}),day(MONDAY)]);
    expect(cells.find(c=>c.hour===9)).toMatchObject({availableMin:60,bookedMin:0,demandMin:30});
  });
  it('counts open minutes per clinic hour and the booked part of them', () => {
    const cells = capacityCells([day(MONDAY, { bookings: [['08:30', '09:15']] })]);
    const cell = (hour: number) => cells.find(c => c.hour === hour);
    expect(cell(8)).toMatchObject({ weekday: 1, availableMin: 60, bookedMin: 30 });
    expect(cell(9)).toMatchObject({ availableMin: 60, bookedMin: 15 });
    expect(cell(10)).toMatchObject({ availableMin: 60, bookedMin: 0 });
    expect(cell(12)).toBeUndefined();
    expect(cells).toHaveLength(4);
  });

  it('adds the same weekday and hour of different days and dentists', () => {
    const cells = capacityCells([
      day(MONDAY, { bookings: [['08:00', '09:00']] }),
      day('2026-11-09', { bookings: [['08:00', '08:30']] }),
    ]);
    expect(cells.find(c => c.hour === 8)).toMatchObject({ availableMin: 120, bookedMin: 90 });
  });

  it('takes time-off out of the open hours instead of counting it as empty', () => {
    const cells = capacityCells([day(MONDAY, { timeOff: ['10:00', '12:00'] })]);
    expect(cells.map(c => c.hour)).toEqual([8, 9]);
  });

  it('skips closed days and a closed clinic', () => {
    expect(capacityCells([day(MONDAY, { closure: true })])).toEqual([]);
    expect(capacityCells([day(MONDAY, { hours: [] })])).toEqual([]);
  });

  it('does not count a visit that runs past closing as use of hours never offered', () => {
    const cells = capacityCells([day(MONDAY, { bookings: [['11:30', '12:45']] })]);
    expect(cells.find(c => c.hour === 11)).toMatchObject({ availableMin: 60, bookedMin: 30 });
    expect(cells.find(c => c.hour === 12)).toBeUndefined();
  });

  it('counts overlapping bookings once', () => {
    const cells = capacityCells([
      day(MONDAY, {
        bookings: [
          ['08:00', '08:40'],
          ['08:20', '09:00'],
        ],
      }),
    ]);
    expect(cells.find(c => c.hour === 8)?.bookedMin).toBe(60);
  });

  it('keeps a split day (lunch break) as two open blocks', () => {
    const cells = capacityCells([
      day(MONDAY, {
        hours: [
          ['08:00', '12:00'],
          ['13:30', '19:00'],
        ],
      }),
    ]);
    expect(cells.find(c => c.hour === 13)?.availableMin).toBe(30);
    expect(cells.find(c => c.hour === 12)).toBeUndefined();
    expect(cells.find(c => c.hour === 18)?.availableMin).toBe(60);
  });
});

describe('scorecard helpers', () => {
  it('percent keeps one decimal and is null without a denominator', () => {
    expect(percent(1, 3)).toBe(33.3);
    expect(percent(0, 0)).toBeNull();
  });

  it('median of odd, even and empty lists', () => {
    expect(median([5, 1, 3])).toBe(3);
    expect(median([1, 2, 3, 10])).toBe(2.5);
    expect(median([])).toBeNull();
  });

  it('measures the wait from the booked time, not an early check-in', () => {
    // Arrived 40 minutes early for a 09:00 booking, seen at 09:10: waited 10.
    expect(waitMinutes(at(MONDAY, '09:00'), at(MONDAY, '08:20'), at(MONDAY, '09:10'))).toBe(10);
    // Arrived late: from the check-in.
    expect(waitMinutes(at(MONDAY, '09:00'), at(MONDAY, '09:20'), at(MONDAY, '09:35'))).toBe(15);
  });

  it('drops impossible and day-long waits', () => {
    expect(waitMinutes(at(MONDAY, '09:00'), at(MONDAY, '09:00'), at(MONDAY, '08:00'))).toBeNull();
    expect(waitMinutes(at(MONDAY, '08:00'), at(MONDAY, '08:00'), at(MONDAY, '18:00'))).toBeNull();
  });

  it('every target has an acceptable edge on the bad side of it', () => {
    for (const t of Object.values(SCORECARD_TARGETS)) {
      if (t.direction === 'lower') expect(t.okAt).toBeGreaterThan(t.target);
      else expect(t.okAt).toBeLessThan(t.target);
    }
    expect(scorecardMetric('noShowRate', 4, 2, 50)).toMatchObject({
      value: 4,
      target: 5,
      direction: 'lower',
      numerator: 2,
      denominator: 50,
    });
  });
});

describe('patientFunnel', () => {
  const row = (source: string, upTo: 0 | 1 | 2 | 3 | 4) => ({
    source,
    arrived: upTo >= 1,
    examined: upTo >= 2,
    paid: upTo >= 3,
    rebooked: upTo >= 4,
  });

  it('counts each booking only as far as it got, so no step is bigger than the one before', () => {
    const f = patientFunnel([
      row('ONLINE', 4),
      row('ONLINE', 3),
      row('ONLINE', 0), // never came
      row('PHONE', 2),
      row('PHONE', 1),
    ]);
    expect(f.stages.map(s => s.count)).toEqual([5, 4, 3, 2, 1]);
    expect(f.bySource.ONLINE.map(s => s.count)).toEqual([3, 2, 2, 2, 1]);
    expect(f.bySource.PHONE.map(s => s.count)).toEqual([2, 2, 1, 0, 0]);
  });

  it('does not count a later step when an earlier one is missing', () => {
    const f = patientFunnel([
      { source: 'PHONE', arrived: false, examined: true, paid: true, rebooked: true },
    ]);
    expect(f.stages.map(s => s.count)).toEqual([1, 0, 0, 0, 0]);
  });

  it('is all zeros, with no sources, when there are no bookings', () => {
    const f = patientFunnel([]);
    expect(f.stages.map(s => s.count)).toEqual([0, 0, 0, 0, 0]);
    expect(f.bySource).toEqual({});
  });
});

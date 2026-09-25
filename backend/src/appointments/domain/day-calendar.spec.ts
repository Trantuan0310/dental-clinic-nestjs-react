import {
  DayInputs,
  SlotProblemKind,
  atClinicTime,
  buildDayCalendar,
  freeSlots,
  intervalProblem,
} from './day-calendar';

/**
 * Decision table for "can the dentist see a patient at this time"
 * (ADR-0009 phase 4). Each row is one combination of weekly schedule,
 * approved shift, override, approved time-off and existing booking, and the
 * expected answer for a visit on 2027-03-15 (clinic time).
 */
const DATE = '2027-03-15';
const t = (hhmm: string) => new Date(`1970-01-01T${hhmm}:00Z`); // TIME column value
const at = (hhmm: string) => atClinicTime(DATE, hhmm);

const base = (): DayInputs => ({
  date: DATE,
  schedules: [
    { startTime: t('08:00'), endTime: t('12:00'), slotDurationMin: 30 },
    { startTime: t('13:30'), endTime: t('17:00'), slotDurationMin: 30 },
  ],
  shifts: [],
  overrides: [],
  timeOffs: [],
  bookings: [],
});

type Row = [
  name: string,
  change: (i: DayInputs) => void,
  visit: [string, string],
  expected: SlotProblemKind | null,
];

const table: Row[] = [
  ['inside the morning window', () => {}, ['09:00', '09:30'], null],
  ['exactly fills a window edge', () => {}, ['11:30', '12:00'], null],
  ['before opening', () => {}, ['07:30', '08:00'], 'OUTSIDE_WORKING_HOURS'],
  ['spans the lunch gap', () => {}, ['11:45', '13:45'], 'OUTSIDE_WORKING_HOURS'],
  ['during lunch', () => {}, ['12:30', '13:00'], 'OUTSIDE_WORKING_HOURS'],
  ['no weekly schedule', i => (i.schedules = []), ['09:00', '09:30'], 'OUTSIDE_WORKING_HOURS'],
  [
    'no schedule but an approved shift covers it',
    i => {
      i.schedules = [];
      i.shifts = [{ startTime: '18:00', endTime: '20:00' }];
    },
    ['18:00', '18:30'],
    null,
  ],
  [
    'evening shift adds hours beside the weekly schedule',
    i => (i.shifts = [{ startTime: '18:00', endTime: '20:00' }]),
    ['19:00', '19:30'],
    null,
  ],
  [
    'whole day closed beats everything',
    i => {
      i.overrides = [{ kind: 'CLOSED', startTime: null, endTime: null, reason: 'Sửa ghế' }];
      i.shifts = [{ startTime: '18:00', endTime: '20:00' }];
    },
    ['18:00', '18:30'],
    'CLOSED',
  ],
  [
    'closed range blocks inside it',
    i =>
      (i.overrides = [
        { kind: 'CLOSED', startTime: t('09:00'), endTime: t('10:00'), reason: 'Họp' },
      ]),
    ['09:30', '10:00'],
    'CLOSED',
  ],
  [
    'closed range leaves the rest open',
    i =>
      (i.overrides = [
        { kind: 'CLOSED', startTime: t('09:00'), endTime: t('10:00'), reason: 'Họp' },
      ]),
    ['10:00', '10:30'],
    null,
  ],
  [
    'changed hours replace the weekly schedule (old morning closed)',
    i =>
      (i.overrides = [
        { kind: 'CHANGED_HOURS', startTime: t('13:00'), endTime: t('19:00'), reason: 'Đổi ca' },
      ]),
    ['09:00', '09:30'],
    'OUTSIDE_WORKING_HOURS',
  ],
  [
    'changed hours open new time (lunch now bookable)',
    i =>
      (i.overrides = [
        { kind: 'CHANGED_HOURS', startTime: t('12:00'), endTime: t('19:00'), reason: 'Đổi ca' },
      ]),
    ['12:30', '13:00'],
    null,
  ],
  [
    'changed hours still add an approved shift',
    i => {
      i.overrides = [
        { kind: 'CHANGED_HOURS', startTime: t('13:00'), endTime: t('17:00'), reason: 'Đổi ca' },
      ];
      i.shifts = [{ startTime: '08:00', endTime: '10:00' }];
    },
    ['08:30', '09:00'],
    null,
  ],
  [
    'approved time-off blocks',
    i => (i.timeOffs = [{ startAt: at('10:00'), endAt: at('12:00') }]),
    ['10:30', '11:00'],
    'TIME_OFF',
  ],
  [
    'time-off ending at the visit start does not block',
    i => (i.timeOffs = [{ startAt: at('08:00'), endAt: at('09:00') }]),
    ['09:00', '09:30'],
    null,
  ],
  [
    'multi-day time-off covering the day blocks',
    i =>
      (i.timeOffs = [
        { startAt: new Date('2027-03-14T00:00:00Z'), endAt: new Date('2027-03-17T00:00:00Z') },
      ]),
    ['09:00', '09:30'],
    'TIME_OFF',
  ],
  [
    'overlapping booking conflicts',
    i => (i.bookings = [{ id: 'b1', startAt: at('09:00'), endAt: at('09:30') }]),
    ['09:15', '09:45'],
    'SLOT_CONFLICT',
  ],
  [
    'back-to-back booking is fine',
    i => (i.bookings = [{ id: 'b1', startAt: at('08:30'), endAt: at('09:00') }]),
    ['09:00', '09:30'],
    null,
  ],
  [
    'outside hours is reported before a booking clash',
    i => (i.bookings = [{ id: 'b1', startAt: at('07:30'), endAt: at('08:30') }]),
    ['07:30', '08:00'],
    'OUTSIDE_WORKING_HOURS',
  ],
  [
    'time-off is reported before a booking clash',
    i => {
      i.timeOffs = [{ startAt: at('09:00'), endAt: at('10:00') }];
      i.bookings = [{ id: 'b1', startAt: at('09:00'), endAt: at('09:30') }];
    },
    ['09:00', '09:30'],
    'TIME_OFF',
  ],
];

describe('day calendar decision table', () => {
  it.each(table)('%s', (_name, change, [from, to], expected) => {
    const inputs = base();
    change(inputs);
    const problem = intervalProblem(buildDayCalendar(inputs), { start: at(from), end: at(to) });
    expect(problem?.kind ?? null).toBe(expected);
  });

  describe('buffers (ADR-0009 D4)', () => {
    const withBooking = (bufferAfterMin: number, bufferBeforeMin = 0) => {
      const inputs = base();
      inputs.bookings = [
        { id: 'b1', startAt: at('09:00'), endAt: at('09:30'), bufferBeforeMin, bufferAfterMin },
      ];
      return buildDayCalendar(inputs);
    };

    it("an existing booking's clean-up time blocks the next visit", () => {
      expect(intervalProblem(withBooking(10), { start: at('09:30'), end: at('10:00') })?.kind).toBe(
        'SLOT_CONFLICT',
      );
      expect(intervalProblem(withBooking(10), { start: at('09:40'), end: at('10:10') })).toBeNull();
    });

    it("the new visit's prep time must not overlap the previous booking", () => {
      const cal = withBooking(0);
      expect(
        intervalProblem(
          cal,
          { start: at('09:30'), end: at('10:00') },
          { buffers: { beforeMin: 15 } },
        )?.kind,
      ).toBe('SLOT_CONFLICT');
      expect(
        intervalProblem(
          cal,
          { start: at('09:45'), end: at('10:15') },
          { buffers: { beforeMin: 15 } },
        ),
      ).toBeNull();
    });

    it('buffers may reach past the working window but not into time-off', () => {
      const inputs = base();
      expect(
        intervalProblem(
          buildDayCalendar(inputs),
          { start: at('08:00'), end: at('08:30') },
          { buffers: { beforeMin: 10 } },
        ),
      ).toBeNull();
      inputs.timeOffs = [{ startAt: at('10:00'), endAt: at('11:00') }];
      expect(
        intervalProblem(
          buildDayCalendar(inputs),
          { start: at('09:30'), end: at('10:00') },
          { buffers: { afterMin: 10 } },
        )?.kind,
      ).toBe('TIME_OFF');
    });

    it('free slots account for buffers', () => {
      const inputs = base();
      inputs.schedules = [{ startTime: t('08:00'), endTime: t('10:00'), slotDurationMin: 30 }];
      inputs.bookings = [{ id: 'b1', startAt: at('09:00'), endAt: at('09:30'), bufferAfterMin: 0 }];
      expect(
        freeSlots(buildDayCalendar(inputs), 30, 30, new Date('2000-01-01'), { afterMin: 10 }),
      ).toEqual(['08:00', '09:30']);
    });
  });

  it('rescheduling ignores the appointment being moved', () => {
    const inputs = base();
    inputs.bookings = [{ id: 'moving', startAt: at('09:00'), endAt: at('09:30') }];
    const cal = buildDayCalendar(inputs);
    const slot = { start: at('09:15'), end: at('09:45') };
    expect(intervalProblem(cal, slot)?.kind).toBe('SLOT_CONFLICT');
    expect(intervalProblem(cal, slot, { excludeBookingId: 'moving' })).toBeNull();
  });

  it('impact checks can ignore bookings', () => {
    const inputs = base();
    inputs.bookings = [{ id: 'b1', startAt: at('09:00'), endAt: at('09:30') }];
    expect(
      intervalProblem(
        buildDayCalendar(inputs),
        { start: at('09:00'), end: at('09:30') },
        { ignoreBookings: true },
      ),
    ).toBeNull();
  });

  describe('free slots', () => {
    const notBefore = new Date('2000-01-01T00:00:00Z');

    it('steps each window, skipping bookings, time-off and closed ranges', () => {
      const inputs = base();
      inputs.schedules = [{ startTime: t('08:00'), endTime: t('10:00'), slotDurationMin: 30 }];
      inputs.bookings = [{ id: 'b1', startAt: at('08:30'), endAt: at('09:00') }];
      inputs.overrides = [
        { kind: 'CLOSED', startTime: t('09:30'), endTime: t('10:00'), reason: 'x' },
      ];
      expect(freeSlots(buildDayCalendar(inputs), 30, 30, notBefore)).toEqual(['08:00', '09:00']);
    });

    it('a longer visit needs the whole length free', () => {
      const inputs = base();
      inputs.schedules = [{ startTime: t('08:00'), endTime: t('10:00'), slotDurationMin: 30 }];
      inputs.bookings = [{ id: 'b1', startAt: at('09:00'), endAt: at('09:15') }];
      // 08:00 ends as the booking starts; 09:15 would run past 10:00.
      expect(freeSlots(buildDayCalendar(inputs), 60, 15, notBefore)).toEqual(['08:00']);
    });

    it('lists a start only once when a shift overlaps the schedule', () => {
      const inputs = base();
      inputs.schedules = [{ startTime: t('08:00'), endTime: t('09:00'), slotDurationMin: 30 }];
      inputs.shifts = [{ startTime: '08:00', endTime: '09:00' }];
      expect(freeSlots(buildDayCalendar(inputs), 30, 30, notBefore)).toEqual(['08:00', '08:30']);
    });

    it('never offers a start before notBefore', () => {
      expect(freeSlots(buildDayCalendar(base()), 30, 30, at('16:00'))).toEqual(['16:30']);
    });

    it('a closed day has no slots', () => {
      const inputs = base();
      inputs.overrides = [{ kind: 'CLOSED', startTime: null, endTime: null, reason: 'x' }];
      const cal = buildDayCalendar(inputs);
      expect(cal).toMatchObject({ closedAllDay: true, closedReason: 'x', windows: [] });
      expect(freeSlots(cal, 30, 30, notBefore)).toEqual([]);
    });
  });
});

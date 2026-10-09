import { QueuePriority, QueueStatus } from '@prisma/client';
import { Orderable, compareQueue, priorityAtCheckIn } from './queue';

/** Decision tables for the dispatch queue (ADR-0009 D5, BR-DSP-001). */
const start = new Date('2027-03-15T02:00:00Z'); // 09:00 clinic time
const plus = (min: number) => new Date(start.getTime() + min * 60_000);

describe('priority at check-in', () => {
  it.each<[string, 'BOOKED' | 'WALK_IN', number, QueuePriority]>([
    ['early arrival', 'BOOKED', -10, 'ON_TIME'],
    ['exactly on time', 'BOOKED', 0, 'ON_TIME'],
    ['15 minutes late is still on time', 'BOOKED', 15, 'ON_TIME'],
    ['16 minutes late', 'BOOKED', 16, 'LATE'],
    ['walk-in, whatever the time', 'WALK_IN', 0, 'WALK_IN'],
  ])('%s', (_name, visitKind, offset, expected) => {
    expect(priorityAtCheckIn({ visitKind, startAt: start }, plus(offset))).toBe(expected);
  });
});

describe('dispatch order', () => {
  /** `bookedMin`/`checkedInMin` are minutes after 09:00. */
  const e = (
    name: string,
    priority: QueuePriority,
    checkedInMin: number,
    status: QueueStatus = 'WAITING',
    bookedMin = checkedInMin,
  ) => ({
    name,
    priority,
    status,
    checkedInAt: plus(checkedInMin),
    appointment: { startAt: plus(bookedMin) },
  });
  const order = (rows: Array<Orderable & { name: string }>) =>
    [...rows].sort(compareQueue).map(r => r.name);

  it('an emergency goes first whatever the check-in time', () => {
    expect(
      order([
        e('walk-in', 'WALK_IN', 0),
        e('on-time', 'ON_TIME', 2),
        e('emergency', 'EMERGENCY', 30),
      ]),
    ).toEqual(['emergency', 'on-time', 'walk-in']);
  });

  it('on-time patients go by their booked time, not by who came first', () => {
    expect(
      order([
        e('booked 10:00, came 09:45', 'ON_TIME', 45, 'WAITING', 60),
        e('booked 09:30, came 09:20', 'ON_TIME', 20, 'WAITING', 30),
      ]),
    ).toEqual(['booked 09:30, came 09:20', 'booked 10:00, came 09:45']);
  });

  // A3-09: the dentist runs an hour late; the line was built by check-ins.
  it('a late patient waits behind the bookings around their arrival, not the whole day', () => {
    expect(
      order([
        e('booked 09:30', 'ON_TIME', 20, 'WAITING', 30),
        e('booked 10:00', 'ON_TIME', 50, 'WAITING', 60),
        e('booked 10:30', 'ON_TIME', 80, 'WAITING', 90),
        e('booked 09:00, came 09:16', 'LATE', 16, 'WAITING', 0),
        e('walk-in 09:05', 'WALK_IN', 5),
      ]),
    ).toEqual([
      'booked 09:30',
      'booked 09:00, came 09:16',
      'walk-in 09:05',
      'booked 10:00',
      'booked 10:30',
    ]);
  });

  it('an early check-in does not jump bookings made for earlier', () => {
    expect(
      order([
        e('booked 11:00, came 09:00', 'ON_TIME', 0, 'WAITING', 120),
        e('booked 09:30, came 09:25', 'ON_TIME', 25, 'WAITING', 30),
      ]),
    ).toEqual(['booked 09:30, came 09:25', 'booked 11:00, came 09:00']);
  });

  it('a walk-in is not kept behind later bookings forever', () => {
    expect(
      order([e('booked 11:00', 'ON_TIME', 110, 'WAITING', 120), e('walk-in 09:00', 'WALK_IN', 0)]),
    ).toEqual(['walk-in 09:00', 'booked 11:00']);
  });

  it('the same due time: earlier check-in goes first', () => {
    expect(order([e('b', 'ON_TIME', 5, 'WAITING', 0), e('a', 'ON_TIME', 1, 'WAITING', 0)])).toEqual(
      ['a', 'b'],
    );
  });

  it('the called patient is on top and skipped patients wait at the end', () => {
    expect(
      order([
        e('skipped emergency', 'EMERGENCY', 0, 'SKIPPED'),
        e('waiting walk-in', 'WALK_IN', 5),
        e('called late', 'LATE', 9, 'CALLED'),
      ]),
    ).toEqual(['called late', 'waiting walk-in', 'skipped emergency']);
  });
});

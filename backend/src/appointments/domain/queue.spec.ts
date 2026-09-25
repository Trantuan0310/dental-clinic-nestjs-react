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
  const e = (
    name: string,
    priority: QueuePriority,
    checkedInMin: number,
    status: QueueStatus = 'WAITING',
  ) => ({ name, priority, status, checkedInAt: plus(checkedInMin) });
  const order = (rows: Array<Orderable & { name: string }>) =>
    [...rows].sort(compareQueue).map(r => r.name);

  it('emergency > on time > late > walk-in, whatever the check-in time', () => {
    expect(
      order([
        e('walk-in', 'WALK_IN', 0),
        e('late', 'LATE', 1),
        e('on-time', 'ON_TIME', 2),
        e('emergency', 'EMERGENCY', 3),
      ]),
    ).toEqual(['emergency', 'on-time', 'late', 'walk-in']);
  });

  it('within a class, earlier check-in goes first', () => {
    expect(order([e('b', 'ON_TIME', 5), e('a', 'ON_TIME', 1), e('c', 'ON_TIME', 9)])).toEqual([
      'a',
      'b',
      'c',
    ]);
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

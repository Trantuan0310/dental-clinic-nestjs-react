// Optional LOCAL E2E fixture. Production booking/check-in rules stay active.
// Creates a short unpaid schedule only for today when running after hours;
// Playwright global setup removes the exact created row during teardown.
import { PrismaClient } from '@prisma/client';
import { clinicDateOnly, CLINIC_UTC_OFFSET_MS } from '../src/common/date-range.util';

const prisma = new PrismaClient();
/** How long after global setup a flow may still book (suite ≈ 6 min + 15 min lead + 30 min visit). */
const NEEDED_MIN = 60;
/** What makes a row this script's fixture (see the leftover cleanup below). */
const FIXTURE_SIGNATURE = {
  isPaidShift: false,
  slotDurationMin: 15,
  createdBy: null,
  validTo: { not: null },
} as const;
const pgTime = (minutes: number) => new Date(Date.UTC(1970, 0, 1, 0, minutes));
const minutesOf = (value: Date) => value.getUTCHours() * 60 + value.getUTCMinutes();

async function main() {
  if (process.env.NODE_ENV === 'production')
    throw new Error('Demo fixtures require a local development database');
  const host = new URL(process.env.DATABASE_URL ?? '').hostname;
  if (!['localhost', '127.0.0.1', '[::1]'].includes(host))
    throw new Error('Demo fixtures require a localhost database');
  if (process.argv[2] === 'cleanup') {
    const id = process.argv[3];
    if (!/^[0-9a-f-]{36}$/i.test(id ?? '')) throw new Error('Invalid fixture id');
    await prisma.workingSchedule.deleteMany({ where: { id, ...FIXTURE_SIGNATURE } });
    return;
  }
  const dentist = await prisma.user.findFirstOrThrow({
    where: { email: process.env.E2E_DENTIST_USERNAME ?? 'an.nguyen@clinic.local' },
  });
  // A run killed before its teardown (Ctrl-C, crash) leaves its fixture
  // behind, and today's leftover then reads as a real shift ("Current shift
  // ends too soon"). Fixtures are recognisable: unpaid, one day long, 15-min
  // slots and no creator (every schedule made through the API has one).
  const stale = await prisma.workingSchedule.deleteMany({
    where: { ...FIXTURE_SIGNATURE, dentistId: dentist.id },
  });
  if (stale.count > 0) console.error(`Removed ${stale.count} leftover demo schedule(s)`);
  const now = new Date();
  const local = new Date(now.getTime() + CLINIC_UTC_OFFSET_MS);
  const minute = local.getUTCHours() * 60 + local.getUTCMinutes();
  const date = new Date(clinicDateOnly(now));
  const schedules = await prisma.workingSchedule.findMany({
    where: {
      dentistId: dentist.id,
      dayOfWeek: date.getUTCDay(),
      deletedAt: null,
      validFrom: { lte: date },
      OR: [{ validTo: null }, { validTo: { gte: date } }],
    },
  });
  // The flows book "now + up to 15 min" for 30 min, several minutes after
  // this runs (global setup happens before the whole suite), so the dentist
  // must be working until well after that: NEEDED_MIN covers a full suite
  // run plus the latest booking a flow makes.
  if (
    schedules.some(
      s => minutesOf(s.startTime) <= minute + 3 && minutesOf(s.endTime) >= minute + NEEDED_MIN,
    )
  ) {
    process.stdout.write('none');
    return;
  }
  // A window around "now". It may overlap a shift that ends too soon or starts
  // shortly: the calendar accepts a visit that fits any one window and lists
  // each free start once (day-calendar.ts), so the overlap is harmless and
  // the suite can run at any hour except the last NEEDED_MIN of the day.
  const start = Math.max(0, minute - 2);
  const end = Math.min(1439, minute + NEEDED_MIN + 15);
  if (end < minute + NEEDED_MIN)
    throw new Error('Too close to midnight for the full demo; run after 00:00');
  const fixture = await prisma.workingSchedule.create({
    data: {
      dentistId: dentist.id,
      dayOfWeek: date.getUTCDay(),
      validFrom: date,
      validTo: date,
      startTime: pgTime(start),
      endTime: pgTime(end),
      slotDurationMin: 15,
      isPaidShift: false,
    },
  });
  process.stdout.write(fixture.id);
}

main()
  .catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

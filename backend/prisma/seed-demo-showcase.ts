/** After prisma/seed-demo-clinic.ts, from backend: npx ts-node prisma/seed-demo-showcase.ts */
import { Prisma, PrismaClient } from '@prisma/client';
import { clinicDateOnly } from '../src/common/date-range.util';
import { atClinicTime, DayCalendar, freeSlots } from '../src/appointments/domain/day-calendar';
import { dayKey, loadDayCalendars } from '../src/appointments/domain/day-calendar-loader';

const MIN = 60_000;
const DAY = 1440 * MIN;
const NOTE = 'Dữ liệu mẫu (showcase)';
const id = (group: number, index: number) =>
  `d34c1400-0000-4000-8000-${String(group * 100 + index).padStart(12, '0')}`;
const patient = (i: number) => id(1, i);
const appointment = (i: number) => id(2, i);
const names = ['An', 'Bình', 'Chi', 'Dũng', 'Giang', 'Hà'];
const description = 'Chăm sóc răng định kỳ';
const dateAt = (now: Date, offset: number) => clinicDateOnly(new Date(+now + offset * DAY));

export function showcaseSlots(now: Date, dentists: string[], calendars: Map<string, DayCalendar>) {
  // Rolling fixtures may reuse their own time on a rerun. All other bookings retain their buffers.
  const owned = new Set(Array.from({ length: 13 }, (_, i) => appointment(i)));
  for (const cal of calendars.values()) cal.bookings = cal.bookings.filter(b => !owned.has(b.id));
  function reserve(index: number, days: number[], checkIn = false) {
    for (const offset of days) {
      const date = dateAt(now, offset);
      for (let n = 0; n < dentists.length; n++) {
        const dentistId = dentists[(index + n) % dentists.length];
        const cal = calendars.get(dayKey(dentistId, date))!;
        if (checkIn && !cal.windows.some(w => w.start <= now && now < w.end)) continue;
        const starts = freeSlots(cal, 15, 15, new Date(0))
          .map(t => atClinicTime(date, t))
          .filter(t => !checkIn || (+t >= +now - 30 * MIN && +t <= +now + 15 * MIN));
        if (!starts.length) continue;
        const startAt =
          starts[
            checkIn
              ? starts.reduce(
                  (best, t, i) => (Math.abs(+t - +now) < Math.abs(+starts[best] - +now) ? i : best),
                  0,
                )
              : (index * 7) % starts.length
          ];
        const endAt = new Date(+startAt + 15 * MIN);
        cal.bookings.push({ id: appointment(index), start: startAt, end: endAt });
        return { index, dentistId, startAt, endAt };
      }
    }
    if (!checkIn) throw new Error('Không đủ khung giờ trống cho dữ liệu showcase.');
    return null;
  }
  const week = (first: number, shift: number) =>
    Array.from({ length: 7 }, (_, i) => first + ((shift + i) % 7));
  const past = Array.from({ length: 5 }, (_, i) => reserve(i, week(-7, i))!);
  const upcoming = Array.from({ length: 6 }, (_, i) => reserve(5 + i, week(i < 3 ? 1 : 8, 2 * i))!);
  const today = [reserve(11, [0], true), reserve(12, [0], true)].filter(s => s !== null);
  return { past, upcoming, today };
}

export async function seedShowcase(tx: Prisma.TransactionClient, now: Date) {
  if (!(await tx.patient.findFirst({ where: { notes: 'Dữ liệu mẫu (demo)', deletedAt: null } })))
    throw new Error('Chạy seed-demo-clinic.ts trước.');
  const dentists = (
    await tx.user.findMany({
      where: {
        status: 'ACTIVE',
        deletedAt: null,
        deactivatedAt: null,
        userRoles: { some: { role: { code: 'dentist' } } },
      },
      orderBy: { id: 'asc' },
      select: { id: true },
    })
  ).map(d => d.id);
  if (dentists.length < 2) throw new Error('Showcase cần ít nhất hai bác sĩ.');
  const keys = dentists.flatMap(dentistId =>
    Array.from({ length: 22 }, (_, i) => ({ dentistId, date: dateAt(now, i - 7) })),
  );
  const slots = showcaseSlots(
    now,
    dentists,
    await loadDayCalendars(tx, keys, { withBookings: true }),
  );

  for (const [i, name] of names.entries()) {
    const data = {
      code: `DEMO-SC-${i + 1}`,
      fullName: `Demo ${name}`,
      dob: new Date('1990-01-01'),
      gender: 'OTHER' as const,
      notes: NOTE,
    };
    await tx.patient.upsert({
      where: { id: patient(i) },
      create: { id: patient(i), ...data },
      update: {},
    });
  }
  for (const slot of [...slots.past, ...slots.upcoming, ...slots.today]) {
    const { index, dentistId, startAt, endAt } = slot;
    const person = [3, 0, 1, 2, 4, 3, 4, 5, 3, 4, 5, 4, 5][index];
    const status =
      index < 3 ? 'COMPLETED' : index === 3 ? 'NO_SHOW' : index === 4 ? 'CANCELLED' : 'CONFIRMED';
    const data: Prisma.AppointmentUncheckedCreateInput = {
      id: appointment(index),
      patientId: patient(person),
      dentistId,
      startAt,
      endAt,
      status,
      checkedInAt: status === 'COMPLETED' ? startAt : null,
      cancelledAt: status === 'CANCELLED' ? new Date(+startAt - 45 * MIN) : null,
      noShowAt: status === 'NO_SHOW' ? endAt : null,
      reminderSentAt: now,
      notes: NOTE,
      deletedAt: null,
    };
    await tx.appointment.upsert({ where: { id: appointment(index) }, create: data, update: data });
    if (index >= 3) continue;
    const visit = {
      patientId: patient(person),
      dentistId,
      appointmentId: appointment(index),
      startedAt: new Date(+startAt + 5 * MIN),
      closedAt: endAt,
      status: 'COMPLETED' as const,
    };
    const enc = await tx.encounter.upsert({
      where: { appointmentId: visit.appointmentId },
      create: visit,
      update: visit,
    });
    const total = [150000, 1000, 450000][index];
    const invoiceId = id(3, index);
    // Keep the real sequence-backed VietQR reference and any desk payments on reruns.
    const existing = await tx.invoice.findUnique({
      where: { id: invoiceId },
      select: { id: true },
    });
    if (!existing) {
      const [seq] = await tx.$queryRaw<{ n: bigint }[]>`SELECT nextval('invoice_code_seq') AS n`;
      await tx.invoice.create({
        data: {
          id: invoiceId,
          code: `INV-${clinicDateOnly(endAt).slice(0, 4)}-${String(seq.n).padStart(6, '0')}`,
          encounterId: enc.id,
          patientId: visit.patientId,
          subtotal: total,
          total,
          issuedAt: endAt,
          createdAt: endAt,
          issuedBy: dentistId,
          notes: NOTE,
          status: index === 0 ? 'PAID' : 'ISSUED',
          paidAmount: index === 0 ? total : 0,
          outstandingAmount: index === 0 ? 0 : total,
          items: { create: { description, unitPrice: total, lineTotal: total } },
          payments:
            index === 0
              ? {
                  create: {
                    id: id(4, 0),
                    method: 'CASH',
                    amount: total,
                    receivedBy: dentistId,
                    paidAt: endAt,
                  },
                }
              : undefined,
        },
      });
    } else {
      await tx.invoice.update({
        where: { id: invoiceId },
        data: { issuedAt: endAt, createdAt: endAt },
      });
      if (index === 0)
        await tx.payment.update({ where: { id: id(4, 0) }, data: { paidAt: endAt } });
    }
  }
  const absent = [11, 12].filter(i => !slots.today.some(s => s.index === i));
  await tx.appointment.updateMany({
    where: { id: { in: absent.map(appointment) }, deletedAt: null },
    data: { deletedAt: now },
  });
  for (let i = 0; i < 4; i++) {
    const dentistId = i === 3 ? slots.upcoming[0].dentistId : dentists[i % dentists.length];
    const plan = {
      patientId: patient(i),
      dentistId,
      createdBy: dentistId,
      title: description,
      status: 'ACCEPTED' as const,
      proposedAt: new Date(+now - 10 * DAY),
      acceptedAt: new Date(+now - 8 * DAY),
      notes: NOTE,
    };
    await tx.treatmentPlan.upsert({
      where: { id: id(5, i) },
      create: {
        id: id(5, i),
        ...plan,
        items: { create: { procedure: description, unitPrice: 150000 } },
      },
      update: plan,
    });
  }
  return { checkIn: slots.today.length };
}

if (require.main === module) {
  const db = new PrismaClient();
  db.$transaction(tx => seedShowcase(tx, new Date()), {
    isolationLevel: 'Serializable',
    timeout: 60000,
  })
    .then(({ checkIn }) => console.log(`Showcase hoàn tất. Có ${checkIn} lịch chờ check-in ngay.`))
    .catch(err => {
      console.error(err);
      process.exitCode = 1;
    })
    .finally(() => db.$disconnect());
}

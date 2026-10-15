/**
 * Demo data for a clinic that has been running for a while: patients,
 * past visits (exams, treatments, prescriptions, invoices, payments, no-shows,
 * cancellations), today's and the coming weeks' bookings, expenses, stock and
 * pay terms. For a DEMO site only — it is not real clinic data.
 *
 * Needs the catalogue, dentists and working hours first (prisma/clinic-setup.ts).
 * Refuses to run if the database already has appointments or invoices, so it
 * never mixes with real records (DEMO_FORCE=1 adds on top anyway).
 *
 *   DEMO_MONTHS=6 DEMO_PATIENTS=500 npx ts-node --transpile-only prisma/seed-demo-clinic.ts
 *
 * Dentists without working hours or services get them (Mon–Sat 08:00–12:00,
 * 13:30–19:00), and visits are only booked inside each dentist's hours.
 * Upcoming demo visits are marked as reminded (demo emails are @example.com).
 * A demo site seeded by an older version is fixed in place with:
 *
 *   DEMO_REPAIR=1 npx ts-node --transpile-only prisma/seed-demo-clinic.ts
 */
import { Prisma, PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';
import { backfillStaffRecords } from './staff-backfill';

const prisma = new PrismaClient();

const MONTHS = Math.min(Math.max(Number(process.env.DEMO_MONTHS ?? 6), 1), 24);
const PATIENTS = Math.min(Math.max(Number(process.env.DEMO_PATIENTS ?? 500), 20), 5000);
const FUTURE_DAYS = 21;
const VN_OFFSET_MS = 7 * 3600_000;
const DAY_MS = 86400_000;
const NOTE = 'Dữ liệu mẫu (demo)';

// ---------------------------------------------------------------- random
let state = 0x2468ace;
const rand = () => (state = (state * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
const randInt = (a: number, b: number) => Math.floor(rand() * (b - a + 1)) + a;
const pick = <T>(arr: readonly T[]): T => arr[Math.floor(rand() * arr.length)];
const chance = (p: number) => rand() < p;

// ---------------------------------------------------------------- dates (clinic = UTC+7)
/** Midnight UTC of the clinic date of `d` (the DATE value Prisma stores). */
const clinicDay = (d: Date) => new Date(Math.floor((d.getTime() + VN_OFFSET_MS) / DAY_MS) * DAY_MS);
/** The instant of clinic wall-clock `minutes` after midnight on clinic `day`. */
const at = (day: Date, minutes: number) =>
  new Date(day.getTime() + minutes * 60_000 - VN_OFFSET_MS);
const addMin = (d: Date, m: number) => new Date(d.getTime() + m * 60_000);
const SHIFTS: Array<[number, number]> = [
  [8 * 60, 12 * 60],
  [13 * 60 + 30, 19 * 60],
];

// ---------------------------------------------------------------- names
const FAMILY = [
  'Nguyễn',
  'Trần',
  'Lê',
  'Phạm',
  'Hoàng',
  'Huỳnh',
  'Phan',
  'Vũ',
  'Võ',
  'Đặng',
  'Bùi',
  'Đỗ',
  'Hồ',
  'Ngô',
  'Dương',
  'Lý',
];
const MIDDLE_M = ['Văn', 'Hữu', 'Đức', 'Minh', 'Quang', 'Thành', 'Công', 'Gia', 'Hoàng', 'Anh'];
const MIDDLE_F = ['Thị', 'Ngọc', 'Thu', 'Thanh', 'Bảo', 'Khánh', 'Mỹ', 'Phương', 'Hồng', 'Kim'];
const GIVEN_M = [
  'An',
  'Bình',
  'Cường',
  'Dũng',
  'Hải',
  'Hùng',
  'Khoa',
  'Long',
  'Minh',
  'Nam',
  'Phúc',
  'Quân',
  'Sơn',
  'Tâm',
  'Thắng',
  'Trung',
  'Tuấn',
  'Việt',
  'Vinh',
  'Huy',
];
const GIVEN_F = [
  'Anh',
  'Chi',
  'Dung',
  'Giang',
  'Hà',
  'Hạnh',
  'Hương',
  'Lan',
  'Linh',
  'Mai',
  'My',
  'Ngân',
  'Nhung',
  'Oanh',
  'Phương',
  'Quyên',
  'Thảo',
  'Trang',
  'Uyên',
  'Vy',
  'Yến',
];
const DISTRICTS = [
  'Quận 1',
  'Quận 3',
  'Quận 7',
  'Quận 10',
  'Bình Thạnh',
  'Phú Nhuận',
  'Gò Vấp',
  'Tân Bình',
  'Thủ Đức',
  'Bình Tân',
];
const STREETS = [
  'Lê Lợi',
  'Nguyễn Trãi',
  'Cách Mạng Tháng 8',
  'Điện Biên Phủ',
  'Võ Văn Tần',
  'Hai Bà Trưng',
  'Phan Xích Long',
  'Nguyễn Văn Linh',
  'Lý Thường Kiệt',
  'Trường Chinh',
];
const JOBS = [
  'Nhân viên văn phòng',
  'Giáo viên',
  'Kỹ sư',
  'Kinh doanh',
  'Sinh viên',
  'Học sinh',
  'Nội trợ',
  'Công nhân',
  'Kế toán',
  'Tự do',
  'Hưu trí',
];
const ALLERGIES = ['Penicillin', 'Lidocain', 'Aspirin', 'Hải sản'];
const CHRONIC = ['Tăng huyết áp', 'Tiểu đường type 2', 'Hen suyễn', 'Viêm dạ dày'];
const COMPLAINTS = [
  'Đau răng hàm dưới',
  'Ê buốt khi uống lạnh',
  'Chảy máu chân răng',
  'Muốn làm trắng răng',
  'Răng bị mẻ',
  'Khám định kỳ',
  'Hôi miệng',
  'Răng khôn mọc lệch',
  'Muốn niềng răng',
  'Mất răng muốn làm lại',
];
const DIAGNOSES = [
  'Sâu răng ngà',
  'Viêm nướu',
  'Viêm nha chu mức độ nhẹ',
  'Viêm tủy răng',
  'Răng khôn mọc lệch',
  'Mòn cổ răng',
  'Mất răng',
  'Răng khấp khểnh',
  'Cao răng nhiều',
];
const DRUGS = [
  ['Amoxicillin 500mg', '1 viên', '3 lần/ngày', '5 ngày', 'Uống sau ăn'],
  ['Paracetamol 500mg', '1 viên', 'Khi đau', '3 ngày', 'Cách nhau 4-6 giờ'],
  ['Ibuprofen 400mg', '1 viên', '2 lần/ngày', '3 ngày', 'Uống sau ăn'],
  ['Metronidazole 250mg', '1 viên', '2 lần/ngày', '5 ngày', 'Không uống rượu bia'],
  ['Nước súc miệng Chlorhexidine 0.12%', '15ml', '2 lần/ngày', '7 ngày', 'Súc 30 giây rồi nhổ'],
] as const;

function personName(female: boolean) {
  return `${pick(FAMILY)} ${pick(female ? MIDDLE_F : MIDDLE_M)} ${pick(female ? GIVEN_F : GIVEN_M)}`;
}
function phone(used: Set<string>) {
  for (;;) {
    let s = pick([
      '090',
      '091',
      '093',
      '094',
      '096',
      '097',
      '098',
      '086',
      '088',
      '089',
      '070',
      '079',
    ]);
    for (let i = 0; i < 7; i++) s += randInt(0, 9);
    if (!used.has(s)) return (used.add(s), s);
  }
}

async function nextval(seq: string): Promise<number> {
  const rows = await prisma.$queryRawUnsafe<Array<{ n: bigint }>>(`SELECT nextval('${seq}') AS n`);
  return Number(rows[0].n);
}

// ---------------------------------------------------------------- dentist setup
/** Same week as prisma/clinic-setup.ts: Mon–Sat, SHIFTS. */
const WORK_DAYS = [1, 2, 3, 4, 5, 6];
/** A Postgres TIME value as Prisma reads it (clinic wall-clock at 1970-01-01Z). */
const pgTime = (minutes: number) => new Date(Date.UTC(1970, 0, 1, 0, minutes));
const minutesOf = (t: Date) => t.getUTCHours() * 60 + t.getUTCMinutes();

/**
 * Every dentist the demo books for needs working hours and services, or the
 * app sees their visits as outside any schedule: reminders are BLOCKED
 * ("Bác sĩ không có lịch làm việc ngày này") and the clinic inbox is flooded
 * with "Lịch hẹn cần gọi khách". Dentists that already have them are left alone.
 */
async function ensureDentistSetup(dentistIds: string[], since: Date) {
  const services = await prisma.service.findMany({ where: { isActive: true } });
  for (const dentistId of dentistIds) {
    const hasSchedule = await prisma.workingSchedule.count({
      where: { dentistId, deletedAt: null },
    });
    if (!hasSchedule) {
      await prisma.workingSchedule.createMany({
        data: WORK_DAYS.flatMap(dayOfWeek =>
          SHIFTS.map(([from, to]) => ({
            dentistId,
            dayOfWeek,
            startTime: pgTime(from),
            endTime: pgTime(to),
            slotDurationMin: 15,
            // From the first demo day: past visits must sit inside the hours
            // too, or payroll flags every one as outside working hours.
            validFrom: since,
            shiftType: from < 12 * 60 ? ('MORNING' as const) : ('AFTERNOON' as const),
            isPaidShift: true,
          })),
        ),
      });
      console.log(`  + lịch làm việc T2–T7 cho bác sĩ ${dentistId}`);
    }
    // clinic-setup.ts opens online booking for the dentists that existed
    // when it ran, so the ones created here would otherwise stay closed and
    // the public booking page would list no dentist and no service at all.
    await prisma.dentistProfile.updateMany({
      where: { userId: dentistId, acceptsOnlineBooking: false },
      data: { acceptsOnlineBooking: true },
    });

    const hasServices = await prisma.dentistService.count({
      where: { dentistId, effectiveTo: null },
    });
    if (!hasServices) {
      const profile = await prisma.dentistProfile.findFirst({ where: { userId: dentistId } });
      const specialties = profile?.specialties ?? [];
      await prisma.dentistService.createMany({
        data: services
          .filter(s => !s.requiredSpecialty || specialties.includes(s.requiredSpecialty))
          .map(s => ({ dentistId, serviceId: s.id, effectiveFrom: since })),
      });
      console.log(`  + phân công dịch vụ cho bác sĩ ${dentistId}`);
    }
  }
}

/**
 * A dentist's working windows (clinic minutes) on `day`, from their weekly
 * schedule. Past days ignore validFrom so the history still has visits.
 */
async function windowsByDentist(dentistIds: string[]) {
  const rows = await prisma.workingSchedule.findMany({
    where: { dentistId: { in: dentistIds }, deletedAt: null },
    select: {
      dentistId: true,
      dayOfWeek: true,
      startTime: true,
      endTime: true,
      validFrom: true,
      validTo: true,
    },
  });
  return (dentistId: string, day: Date, isPast: boolean): Array<[number, number]> =>
    rows
      .filter(
        r =>
          r.dentistId === dentistId &&
          r.dayOfWeek === day.getUTCDay() &&
          (isPast || r.validFrom <= day) &&
          (!r.validTo || r.validTo >= day),
      )
      .map(r => [minutesOf(r.startTime), minutesOf(r.endTime)] as [number, number])
      .sort((a, b) => a[0] - b[0]);
}

/**
 * DEMO_REPAIR=1: fix a demo database seeded before the above existed. Gives
 * the dentists with upcoming demo visits hours and services, and marks the
 * upcoming demo visits as reminded (demo patients have @example.com
 * addresses), clearing the BLOCKED/FAILED flags they collected.
 */
async function repair() {
  const now = new Date();
  const today = clinicDay(now);
  const upcoming = { startAt: { gt: now }, patient: { notes: NOTE } };
  const dentistIds = (
    await prisma.appointment.findMany({
      where: { ...upcoming, deletedAt: null },
      select: { dentistId: true },
      distinct: ['dentistId'],
    })
  ).map(a => a.dentistId);
  const first = await prisma.appointment.findFirst({
    where: { patient: { notes: NOTE } },
    orderBy: { startAt: 'asc' },
    select: { startAt: true },
  });
  const from = first ? clinicDay(first.startAt) : today;
  await ensureDentistSetup(dentistIds, from);
  // Hours and services an older run started "today": reach back to the
  // first demo visit, so the demo history is not outside working hours.
  // Only open-ended rows of dentists with no dated history of their own.
  for (const dentistId of dentistIds) {
    const dated = await prisma.workingSchedule.count({
      where: { dentistId, deletedAt: null, validTo: { not: null } },
    });
    if (dated) continue;
    const moved = await prisma.workingSchedule.updateMany({
      where: { dentistId, deletedAt: null, validTo: null, validFrom: { gt: from } },
      data: { validFrom: from },
    });
    await prisma.dentistService.updateMany({
      where: { dentistId, effectiveTo: null, effectiveFrom: { gt: from } },
      data: { effectiveFrom: from },
    });
    if (moved.count)
      console.log(
        `  ~ lịch làm việc của bác sĩ ${dentistId} có hiệu lực từ ${from.toISOString().slice(0, 10)}`,
      );
  }
  const outside = await fixVisitsOutsideHours(upcoming);
  const fixed = await prisma.appointment.updateMany({
    where: { ...upcoming, deletedAt: null },
    data: { reminderSentAt: now, reminderStatus: null, reminderNote: null },
  });
  console.log(
    `✓ ${dentistIds.length} bác sĩ đã kiểm tra, ${fixed.count} lịch hẹn demo sắp tới không gửi nhắc; ` +
      `lịch nằm ngoài giờ làm việc: ${outside.moved} chuyển bác sĩ, ${outside.removed} xóa`,
  );
}

/**
 * Upcoming demo visits whose dentist does not work at that time (an older
 * seed, or hours edited afterwards, left them there) are what makes the
 * clinic inbox say "Bác sĩ không có lịch làm việc ngày này". Each one moves to
 * a dentist who works then and is free; none available: it is removed (soft
 * delete). Only weekly schedules are looked at (not one-day overrides, time
 * off or approved shifts), and only unfinished visits of demo patients.
 */
async function fixVisitsOutsideHours(upcoming: Prisma.AppointmentWhereInput) {
  const now = new Date();
  const dentists = (
    await prisma.user.findMany({
      where: {
        deletedAt: null,
        status: { not: 'DEACTIVATED' },
        userRoles: { some: { role: { code: 'dentist' } } },
      },
      select: { id: true },
    })
  ).map(d => d.id);
  const windowsOf = await windowsByDentist(dentists);
  const fits = (dentistId: string, startAt: Date, endAt: Date) => {
    const day = clinicDay(startAt);
    const from = minutesOf(new Date(startAt.getTime() + 7 * 60 * 60_000));
    const to = from + Math.round((endAt.getTime() - startAt.getTime()) / 60_000);
    return windowsOf(dentistId, day, false).some(([a, b]) => a <= from && to <= b);
  };
  const visits = await prisma.appointment.findMany({
    where: {
      ...upcoming,
      deletedAt: null,
      status: { in: ['SCHEDULED', 'CONFIRMED'] },
    },
    select: { id: true, dentistId: true, startAt: true, endAt: true },
    orderBy: { startAt: 'asc' },
  });
  let moved = 0;
  let removed = 0;
  for (const v of visits) {
    if (fits(v.dentistId, v.startAt, v.endAt)) continue;
    let target: string | null = null;
    for (const d of dentists) {
      if (d === v.dentistId || !fits(d, v.startAt, v.endAt)) continue;
      const busy = await prisma.appointment.count({
        where: {
          dentistId: d,
          deletedAt: null,
          status: { notIn: ['CANCELLED', 'NO_SHOW'] },
          startAt: { lt: v.endAt },
          endAt: { gt: v.startAt },
        },
      });
      if (!busy) {
        target = d;
        break;
      }
    }
    if (target) {
      await prisma.appointment.update({ where: { id: v.id }, data: { dentistId: target } });
      moved++;
    } else {
      await prisma.appointment.update({ where: { id: v.id }, data: { deletedAt: now } });
      removed++;
    }
  }
  return { moved, removed };
}

async function main() {
  if (process.env.DEMO_REPAIR === '1') return repair();
  const now = new Date();
  const today = clinicDay(now);
  const start = new Date(today.getTime() - MONTHS * 30 * DAY_MS);
  console.log(
    `Dữ liệu mẫu: ${MONTHS} tháng, ${PATIENTS} bệnh nhân (từ ${start.toISOString().slice(0, 10)})`,
  );

  const [appts, invoices] = await Promise.all([prisma.appointment.count(), prisma.invoice.count()]);
  if ((appts > 0 || invoices > 0) && process.env.DEMO_FORCE !== '1') {
    throw new Error(
      `Database đã có ${appts} lịch hẹn / ${invoices} hóa đơn. Không nạp dữ liệu mẫu để tránh trộn với dữ liệu thật (DEMO_FORCE=1 để vẫn nạp).`,
    );
  }

  // ------------------------------------------------------------ staff
  const admin = await prisma.user.findFirst({
    where: { deletedAt: null, userRoles: { some: { role: { code: 'clinic_admin' } } } },
    orderBy: { createdAt: 'asc' },
  });
  if (!admin) throw new Error('Chưa có tài khoản quản trị.');
  const roles = Object.fromEntries(
    (await prisma.role.findMany({ where: { code: { in: ['dentist', 'receptionist'] } } })).map(
      r => [r.code, r.id],
    ),
  );
  const staffHash = await argon2.hash('Password123!', { type: argon2.argon2id });
  const byRole = (code: string) =>
    prisma.user.findMany({
      where: {
        deletedAt: null,
        status: { not: 'DEACTIVATED' },
        userRoles: { some: { role: { code } } },
      },
      orderBy: { createdAt: 'asc' },
    });
  const DEMO_DENTISTS = [
    'BS. Nguyễn Minh Khoa',
    'BS. Trần Thu Hà',
    'BS. Lê Quang Huy',
    'BS. Phạm Ngọc Anh',
  ];
  const DEMO_RECEPTION = ['Lê Thị Hạnh', 'Bùi Văn Long'];
  let dentists = await byRole('dentist');
  for (let i = dentists.length; i < 4; i++) {
    await prisma.user.create({
      data: {
        email: `bacsi${i + 1}@demo.gensmile.online`,
        fullName: DEMO_DENTISTS[i],
        passwordHash: staffHash,
        status: 'ACTIVE',
        userRoles: { create: { roleId: roles.dentist } },
      },
    });
  }
  let receptionists = await byRole('receptionist');
  for (let i = receptionists.length; i < 2; i++) {
    await prisma.user.create({
      data: {
        email: `letan${i + 1}@demo.gensmile.online`,
        fullName: DEMO_RECEPTION[i],
        passwordHash: staffHash,
        status: 'ACTIVE',
        userRoles: { create: { roleId: roles.receptionist } },
      },
    });
  }
  await backfillStaffRecords(prisma);
  dentists = (await byRole('dentist')).slice(0, 6);
  receptionists = await byRole('receptionist');
  await ensureDentistSetup(
    dentists.map(d => d.id),
    start,
  );
  const windowsOf = await windowsByDentist(dentists.map(d => d.id));
  console.log(`✓ ${dentists.length} bác sĩ, ${receptionists.length} lễ tân`);

  // ------------------------------------------------------------ catalogue
  const services = await prisma.service.findMany({
    where: { isActive: true },
    orderBy: { code: 'asc' },
  });
  if (services.length === 0) throw new Error('Chưa có danh mục dịch vụ — chạy clinic-setup trước.');
  const paid = services.filter(s => Number(s.basePrice) > 0);
  const exam = services.find(s => s.code === 'KHAM_TQ') ?? services[0];
  // Common work is more frequent than implants and braces.
  const weightOf = (s: { basePrice: Prisma.Decimal }) => {
    const p = Number(s.basePrice);
    return p <= 500_000 ? 10 : p <= 2_000_000 ? 5 : p <= 8_000_000 ? 2 : 1;
  };
  const bag = paid.flatMap(s => Array(weightOf(s)).fill(s) as typeof paid);

  // Pay terms, so payroll can be computed from the app.
  for (const d of dentists) {
    if (
      !(await prisma.dentistCompensation.findFirst({ where: { dentistId: d.id, deletedAt: null } }))
    ) {
      await prisma.dentistCompensation.create({
        data: {
          dentistId: d.id,
          effectiveFrom: start,
          baseSalaryVnd: new Prisma.Decimal(pick([12_000_000, 15_000_000, 18_000_000])),
          commissionPct: new Prisma.Decimal(pick([0.1, 0.15, 0.2])),
          overtimeHourlyVnd: new Prisma.Decimal(150_000),
          approvedByUserId: admin.id,
          approvedAt: start,
          notes: NOTE,
        },
      });
    }
  }

  // ------------------------------------------------------------ patients
  const usedPhones = new Set(
    (await prisma.patient.findMany({ select: { primaryPhone: true } })).map(
      p => p.primaryPhone ?? '',
    ),
  );
  const span = today.getTime() - start.getTime();
  const patients: Array<{ id: string; joined: number }> = [];
  for (let i = 0; i < PATIENTS; i++) {
    const female = chance(0.56);
    const child = chance(0.12);
    const age = child ? randInt(5, 15) : randInt(18, 72);
    // A third were already patients before the window, the rest arrive over time.
    const joined = chance(0.3) ? start.getTime() : start.getTime() + Math.floor(rand() * span);
    const name = personName(female);
    const year = new Date(joined).getUTCFullYear();
    const p = await prisma.patient.create({
      data: {
        code: `PAT-${year}-${String(await nextval('patient_code_seq')).padStart(5, '0')}`,
        fullName: name,
        dob: new Date(Date.UTC(today.getUTCFullYear() - age, randInt(0, 11), randInt(1, 28))),
        gender: female ? 'FEMALE' : 'MALE',
        primaryPhone: child ? null : phone(usedPhones),
        contactPersonName: child ? personName(chance(0.6)) : null,
        contactPersonPhone: child ? phone(usedPhones) : null,
        email: !child && chance(0.35) ? `khach${i + 1}@example.com` : null,
        address: `${randInt(1, 399)} ${pick(STREETS)}, ${pick(DISTRICTS)}, TP.HCM`,
        occupation: child ? 'Học sinh' : pick(JOBS),
        allergies: chance(0.08) ? [pick(ALLERGIES)] : [],
        chronicDiseases: !child && chance(0.12) ? [pick(CHRONIC)] : [],
        currentMedications: [],
        notes: NOTE,
        createdAt: new Date(joined),
        createdBy: pick(receptionists).id,
      },
    });
    patients.push({ id: p.id, joined });
  }
  console.log(`✓ ${patients.length} bệnh nhân`);

  // ------------------------------------------------------------ visits
  let invoiceSeq = 0;
  const stats = { completed: 0, noShow: 0, cancelled: 0, upcoming: 0, revenue: 0 };
  const lastDay = new Date(today.getTime() + FUTURE_DAYS * DAY_MS);
  for (let day = start; day <= lastDay; day = new Date(day.getTime() + DAY_MS)) {
    if (day.getUTCDay() === 0) continue; // closed on Sundays
    const isPast = day < today;
    const isToday = day.getTime() === today.getTime();
    const eligible = patients.filter(
      p => p.joined <= Math.min(day.getTime() + DAY_MS, now.getTime()),
    );
    if (eligible.length === 0) continue;
    for (const dentist of dentists) {
      if (!isPast && !isToday && chance(0.1)) continue;
      const busyToday = new Set<string>();
      // Only inside the dentist's real working hours that day.
      for (const [from, to] of windowsOf(dentist.id, day, isPast)) {
        let cursor = from + pick([0, 15, 30]);
        const target =
          isPast || isToday ? randInt(2, 4) : chance(0.5) ? randInt(1, 3) : randInt(0, 2);
        for (let n = 0; n < target; n++) {
          const svcList = chance(0.35) ? [exam] : [pick(bag)];
          const extra = pick(bag);
          if (chance(0.2) && !svcList.includes(extra)) svcList.push(extra);
          const minutes = Math.max(
            30,
            Math.ceil(svcList.reduce((a, s) => a + s.defaultDurationMin, 0) / 15) * 15,
          );
          if (cursor + minutes > to) break;
          let patient = pick(eligible);
          for (let t = 0; t < 5 && busyToday.has(patient.id); t++) patient = pick(eligible);
          if (busyToday.has(patient.id)) continue;
          busyToday.add(patient.id);
          const startAt = at(day, cursor);
          const endAt = at(day, cursor + minutes);
          cursor += minutes + pick([0, 0, 15, 30]);
          const past = endAt <= now;
          await createVisit({ day, startAt, endAt, past, patientId: patient.id, svcRows: svcList });
        }
      }

      async function createVisit(v: {
        day: Date;
        startAt: Date;
        endAt: Date;
        past: boolean;
        patientId: string;
        svcRows: typeof services;
      }) {
        const recept = pick(receptionists);
        const p = v.patientId;
        const source = pick(['PHONE', 'PHONE', 'WALK_IN', 'ONLINE', 'RETURNING'] as const);
        const r = rand();
        const status = !v.past
          ? chance(0.6)
            ? 'CONFIRMED'
            : 'SCHEDULED'
          : r < 0.06
            ? 'NO_SHOW'
            : r < 0.14
              ? 'CANCELLED'
              : 'COMPLETED';
        const createdAt = addMin(v.startAt, -randInt(1, 14) * 1440);
        const svcRows = v.svcRows;
        const appt = await prisma.appointment.create({
          data: {
            patientId: p,
            dentistId: dentist.id,
            startAt: v.startAt,
            endAt: v.endAt,
            status,
            source,
            visitKind: source === 'WALK_IN' ? 'WALK_IN' : 'BOOKED',
            appointmentType:
              svcRows[0].code === exam.code
                ? 'CONSULTATION'
                : chance(0.2)
                  ? 'FOLLOW_UP'
                  : 'TREATMENT',
            reason: pick(COMPLAINTS),
            calculatedDurationMin: Math.round((v.endAt.getTime() - v.startAt.getTime()) / 60_000),
            // Demo patients have @example.com addresses: no reminder emails.
            reminderSentAt: v.past ? null : now,
            createdAt: createdAt < start ? start : createdAt,
            createdBy: recept.id,
            confirmedAt:
              status !== 'SCHEDULED' && status !== 'CANCELLED' ? addMin(v.startAt, -1440) : null,
            confirmedBy: status !== 'SCHEDULED' && status !== 'CANCELLED' ? recept.id : null,
            checkedInAt: status === 'COMPLETED' ? addMin(v.startAt, -randInt(0, 10)) : null,
            checkedInBy: status === 'COMPLETED' ? recept.id : null,
            noShowAt: status === 'NO_SHOW' ? addMin(v.startAt, 60) : null,
            cancelledAt: status === 'CANCELLED' ? addMin(v.startAt, -randInt(2, 48) * 60) : null,
            cancelledBy: status === 'CANCELLED' ? recept.id : null,
            cancelledReason:
              status === 'CANCELLED'
                ? pick(['Khách bận việc đột xuất', 'Khách bị ốm', 'Khách đổi ý'])
                : null,
            services: {
              create: svcRows.map((s, i) => ({
                serviceId: s.id,
                serviceCode: s.code,
                serviceName: s.name,
                price: s.basePrice,
                durationMin: s.defaultDurationMin,
                sortOrder: i,
              })),
            },
          },
        });
        if (status === 'NO_SHOW') return void stats.noShow++;
        if (status === 'CANCELLED') return void stats.cancelled++;
        if (status !== 'COMPLETED') return void stats.upcoming++;
        stats.completed++;

        const closedAt = addMin(v.endAt, randInt(0, 10));
        const diagnosis = pick(DIAGNOSES);
        const enc = await prisma.encounter.create({
          data: {
            appointmentId: appt.id,
            patientId: p,
            dentistId: dentist.id,
            status: 'COMPLETED',
            startedAt: addMin(v.startAt, randInt(0, 10)),
            closedAt,
            chiefComplaint: appt.reason,
            diagnosis,
            summary: 'Đã điều trị theo kế hoạch, hẹn tái khám nếu cần.',
            treatmentPlanText: 'Theo kế hoạch đã tư vấn với bệnh nhân.',
          },
        });
        const tooth = () => pick([11, 12, 16, 21, 26, 36, 37, 46, 47, 48, 38]);
        const treatments = [];
        for (const [i, s] of svcRows.entries()) {
          treatments.push(
            await prisma.treatment.create({
              data: {
                encounterId: enc.id,
                serviceId: s.id,
                procedure: s.name,
                listPrice: s.basePrice,
                unitPrice: s.basePrice,
                quantity: 1,
                durationMinutes: s.defaultDurationMin,
                toothNumbers: Number(s.basePrice) > 0 && chance(0.7) ? [tooth()] : Prisma.JsonNull,
                sequence: i,
                createdBy: dentist.id,
              },
            }),
          );
        }
        await prisma.clinicalNote.create({
          data: {
            encounterId: enc.id,
            chiefComplaint: appt.reason,
            diagnosis,
            treatmentPlan: 'Theo kế hoạch đã tư vấn với bệnh nhân.',
            notes: pick([
              'Bệnh nhân hợp tác tốt.',
              'Bệnh nhân hơi lo lắng, đã giải thích kỹ.',
              'Hướng dẫn chải răng đúng cách.',
            ]),
            lastEditedBy: dentist.id,
            isLocked: true,
            lockedAt: closedAt,
          },
        });
        if (chance(0.35)) {
          await prisma.prescription.create({
            data: {
              encounterId: enc.id,
              diagnosis,
              instructions: 'Dùng thuốc theo hướng dẫn, tái khám nếu còn đau.',
              createdBy: dentist.id,
              createdAt: closedAt,
              lines: {
                create: Array.from({ length: randInt(1, 3) }, (_, i) => {
                  const d = pick(DRUGS);
                  return {
                    sequence: i,
                    drugName: d[0],
                    dosage: d[1],
                    frequency: d[2],
                    duration: d[3],
                    instructions: d[4],
                  };
                }),
              },
            },
          });
        }

        const subtotal = treatments.reduce((a, t) => a + Number(t.unitPrice), 0);
        if (subtotal === 0) return; // a free exam has no invoice
        const discount = chance(0.1)
          ? Math.round((subtotal * pick([5, 10])) / 100 / 1000) * 1000
          : 0;
        const total = subtotal - discount;
        const recent = today.getTime() - v.day.getTime() < 3 * DAY_MS;
        const rr = rand();
        const invStatus =
          recent && rr < 0.15 ? 'DRAFT' : rr < 0.05 ? 'ISSUED' : rr < 0.13 ? 'PARTIAL' : 'PAID';
        const paidAmount =
          invStatus === 'PAID'
            ? total
            : invStatus === 'PARTIAL'
              ? Math.round((total * randInt(30, 70)) / 100 / 10_000) * 10_000
              : 0;
        const issuedAt = invStatus === 'DRAFT' ? null : addMin(closedAt, randInt(2, 15));
        const year = (issuedAt ?? closedAt).getUTCFullYear();
        invoiceSeq = await nextval('invoice_code_seq');
        await prisma.invoice.create({
          data: {
            code: `INV-${year}-${String(invoiceSeq).padStart(6, '0')}`,
            encounterId: enc.id,
            patientId: p,
            status: invStatus,
            subtotal: new Prisma.Decimal(subtotal),
            discountType: discount ? 'AMOUNT' : null,
            discountValue: discount ? new Prisma.Decimal(discount) : null,
            total: new Prisma.Decimal(total),
            paidAmount: new Prisma.Decimal(paidAmount),
            outstandingAmount: new Prisma.Decimal(total - paidAmount),
            issuedAt,
            issuedBy: issuedAt ? recept.id : null,
            createdAt: closedAt,
            createdBy: recept.id,
            items: {
              create: treatments.map((t, i) => ({
                treatmentId: t.id,
                sequence: i,
                description: t.procedure,
                quantity: new Prisma.Decimal(1),
                unitPrice: t.unitPrice,
                lineTotal: t.unitPrice,
              })),
            },
            payments:
              paidAmount > 0
                ? {
                    create: [
                      {
                        amount: new Prisma.Decimal(paidAmount),
                        method: chance(0.55) ? 'BANK_TRANSFER' : 'CASH',
                        kind: 'PAYMENT',
                        status: 'COMPLETED',
                        paidAt: addMin(issuedAt!, randInt(1, 20)),
                        receivedBy: recept.id,
                      },
                    ],
                  }
                : undefined,
          },
        });
        if (issuedAt) stats.revenue += total;
      }
    }
    if (day.getUTCDate() === 1)
      console.log(`  … ${day.toISOString().slice(0, 7)}: ${stats.completed} lượt khám xong`);
  }
  console.log(
    `✓ ${stats.completed} lượt khám, ${stats.noShow} vắng mặt, ${stats.cancelled} hủy, ${stats.upcoming} lịch sắp tới`,
  );

  // ------------------------------------------------------------ expenses
  const cats = await prisma.expenseCategory.findMany({ where: { isActive: true } });
  if (cats.length) {
    let n = await prisma.expense.count();
    for (let m = 0; m <= MONTHS; m++) {
      const month = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + m, 5));
      if (month > today) break;
      const items: Array<[string, number]> = [
        ['Tiền thuê mặt bằng tháng', 25_000_000],
        ['Tiền điện tháng', randInt(4, 7) * 1_000_000],
        ['Tiền nước, internet tháng', randInt(8, 15) * 100_000],
        ['Quảng cáo Facebook/Google tháng', randInt(3, 8) * 1_000_000],
        ['Mua vật tư tiêu hao', randInt(5, 15) * 1_000_000],
      ];
      for (const [desc, amount] of items) {
        n++;
        await prisma.expense.create({
          data: {
            code: `EXP-${String(n).padStart(5, '0')}`,
            amount: new Prisma.Decimal(amount),
            description: `${desc} ${month.getUTCMonth() + 1}/${month.getUTCFullYear()}`,
            expenseDate: new Date(month.getTime() + randInt(0, 20) * DAY_MS),
            status: 'APPROVED',
            categoryId: pick(cats).id,
            notes: NOTE,
            createdBy: admin.id,
          },
        });
      }
    }
    console.log('✓ Chi phí hằng tháng');
  }

  // ------------------------------------------------------------ stock
  const items = await prisma.inventoryItem.findMany({
    where: { deletedAt: null, quantityOnHand: 0 },
  });
  for (const it of items) {
    const qty = randInt(20, 200);
    await prisma.$transaction([
      prisma.stockMovement.create({
        data: {
          inventoryItemId: it.id,
          type: 'STOCK_IN',
          refType: 'MANUAL',
          quantityBefore: 0,
          quantityAfter: qty,
          diff: qty,
          reason: `Nhập kho đầu kỳ (${NOTE})`,
          performedBy: admin.id,
          performedAt: start,
        },
      }),
      prisma.inventoryItem.update({ where: { id: it.id }, data: { quantityOnHand: qty } }),
    ]);
  }
  if (items.length) console.log(`✓ Nhập kho ${items.length} vật tư`);

  console.log(`\nXONG. Doanh thu mẫu đã phát hành: ${stats.revenue.toLocaleString('vi-VN')} đ`);
  console.log('Tài khoản nhân viên mẫu (nếu được tạo): mật khẩu Password123!');
}

main()
  .catch(e => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

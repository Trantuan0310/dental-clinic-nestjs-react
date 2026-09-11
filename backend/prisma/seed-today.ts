/**
 * Seed a handful of TODAY-dated records on top of the existing seed-clinical
 * data, so "today" views (My Queue, Lịch hẹn hôm nay, Dashboard) have
 * something to show. Does NOT touch existing appointments/encounters —
 * only adds new rows, reusing existing dentists/receptionists/patients.
 *
 * Safe to re-run: it always creates a *new* small batch dated "today" at
 * fixed times, so re-running on the same real day will hit the unique
 * (dentistId, startAt) constraint and fail loudly rather than duplicate —
 * intentional, so you don't pile up junk from repeated runs.
 */

import { PrismaClient, Prisma } from '@prisma/client';

const prisma = new PrismaClient();

function addMinutes(d: Date, minutes: number): Date {
  return new Date(d.getTime() + minutes * 60_000);
}

// Clinic is Asia/Ho_Chi_Minh (UTC+7). `hour`/`minute` here are clinic wall-clock
// time; convert to the correct UTC instant so the frontend (which renders in
// UTC+7) displays the intended local time.
const CLINIC_UTC_OFFSET_HOURS = 7;
function todayAt(hour: number, minute: number): Date {
  const now = new Date();
  const localNow = new Date(now.getTime() + CLINIC_UTC_OFFSET_HOURS * 3_600_000);
  return new Date(
    Date.UTC(localNow.getUTCFullYear(), localNow.getUTCMonth(), localNow.getUTCDate(), hour, minute, 0, 0) -
      CLINIC_UTC_OFFSET_HOURS * 3_600_000,
  );
}

const REASON_TEMPLATES = [
  'Khám định kỳ',
  'Đau răng hàm dưới',
  'Tái khám sau nhổ răng',
  'Cạo vôi định kỳ',
  'Trám răng sâu',
];
const DIAGNOSIS_TEMPLATES = ['Sâu răng', 'Viêm nướu', 'Viêm quanh răng', 'Răng nhạy cảm'];
const SERVICES = [
  { procedure: 'Cạo vôi + đánh bóng', unitPrice: 450_000 },
  { procedure: 'Trám răng composite', unitPrice: 650_000 },
  { procedure: 'Nhổ răng (không biến chứng)', unitPrice: 600_000 },
];

let seed = 0x9e3779b9;
function rand(): number {
  seed = (seed * 1103515245 + 12345) & 0x7fffffff;
  return seed / 0x7fffffff;
}
function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(rand() * arr.length)];
}

async function buildCompletedBundle(args: {
  patient: { id: string };
  dentist: { id: string };
  startAt: Date;
  endAt: Date;
  receptionistId: string;
}) {
  const { patient, dentist, startAt, endAt, receptionistId } = args;

  const appt = await prisma.appointment.create({
    data: {
      patientId: patient.id,
      dentistId: dentist.id,
      startAt,
      endAt,
      status: 'COMPLETED',
      reason: pick(REASON_TEMPLATES),
      source: 'WALK_IN',
      confirmedAt: addMinutes(startAt, -60),
      confirmedBy: receptionistId,
      checkedInAt: startAt,
      checkedInBy: receptionistId,
      createdBy: receptionistId,
    },
  });

  const closedAt = addMinutes(startAt, 40);
  const diagnosis = pick(DIAGNOSIS_TEMPLATES);
  const encounter = await prisma.encounter.create({
    data: {
      appointmentId: appt.id,
      patientId: patient.id,
      dentistId: dentist.id,
      status: 'COMPLETED',
      startedAt: startAt,
      closedAt,
      summary: 'Hoàn thành liệu trình (dữ liệu demo hôm nay)',
      chiefComplaint: appt.reason ?? '',
      diagnosis,
      treatmentPlanText: 'Theo phác đồ đã thống nhất với bệnh nhân.',
    },
  });

  const svc = pick(SERVICES);
  await prisma.treatment.create({
    data: {
      encounterId: encounter.id,
      procedure: svc.procedure,
      unitPrice: new Prisma.Decimal(svc.unitPrice),
      durationMinutes: 30,
      sequence: 0,
      createdBy: dentist.id,
    },
  });
  const treatment = await prisma.treatment.findFirstOrThrow({ where: { encounterId: encounter.id } });

  await prisma.clinicalNote.create({
    data: {
      encounterId: encounter.id,
      chiefComplaint: appt.reason ?? '',
      diagnosis,
      treatmentPlan: 'Theo phác đồ đã thống nhất với bệnh nhân.',
      notes: 'Bệnh nhân hợp tác tốt trong quá trình điều trị (dữ liệu demo hôm nay).',
      lastEditedBy: dentist.id,
    },
  });

  const teeth: Array<{ number: number; condition: string }> = [];
  for (const n of [11, 12, 13, 14, 15, 16, 17, 18]) teeth.push({ number: n, condition: pick(['healthy', 'healthy', 'filled', 'cavity']) });
  for (const n of [21, 22, 23, 24, 25, 26, 27, 28]) teeth.push({ number: n, condition: pick(['healthy', 'healthy', 'filled', 'cavity']) });
  for (const n of [31, 32, 33, 34, 35, 36, 37, 38]) teeth.push({ number: n, condition: pick(['healthy', 'healthy', 'missing', 'crown']) });
  for (const n of [41, 42, 43, 44, 45, 46, 47, 48]) teeth.push({ number: n, condition: pick(['healthy', 'healthy', 'missing', 'crown']) });
  await prisma.dentalChartSnapshot.create({
    data: {
      encounterId: encounter.id,
      patientType: 'ADULT',
      teeth,
      snapshotAt: closedAt,
      snapshotBy: dentist.id,
    },
  });

  const subtotal = Number(treatment.unitPrice);
  const invoiceCount = await prisma.invoice.count();
  const invoice = await prisma.invoice.create({
    data: {
      code: `INV-2026-${(invoiceCount + 1).toString().padStart(6, '0')}`,
      encounterId: encounter.id,
      patientId: patient.id,
      status: 'PAID',
      subtotal: new Prisma.Decimal(subtotal),
      total: new Prisma.Decimal(subtotal),
      paidAmount: new Prisma.Decimal(subtotal),
      outstandingAmount: new Prisma.Decimal(0),
      issuedAt: addMinutes(closedAt, 10),
      issuedBy: receptionistId,
      createdAt: closedAt,
      createdBy: receptionistId,
      items: {
        create: [
          {
            treatmentId: treatment.id,
            sequence: 0,
            description: treatment.procedure,
            quantity: new Prisma.Decimal(1),
            unitPrice: treatment.unitPrice,
            lineTotal: treatment.unitPrice,
          },
        ],
      },
    },
  });

  await prisma.payment.create({
    data: {
      invoiceId: invoice.id,
      amount: new Prisma.Decimal(subtotal),
      method: 'CASH',
      status: 'COMPLETED',
      paidAt: addMinutes(closedAt, 15),
      receivedBy: receptionistId,
    },
  });

  return { appointmentId: appt.id, encounterId: encounter.id, patientName: (patient as any).fullName };
}

async function buildCheckedInAppointment(args: {
  patient: { id: string };
  dentist: { id: string };
  startAt: Date;
  endAt: Date;
  receptionistId: string;
}) {
  const { patient, dentist, startAt, endAt, receptionistId } = args;
  return prisma.appointment.create({
    data: {
      patientId: patient.id,
      dentistId: dentist.id,
      startAt,
      endAt,
      status: 'CHECKED_IN',
      reason: pick(REASON_TEMPLATES),
      source: 'WALK_IN',
      confirmedAt: addMinutes(startAt, -60),
      confirmedBy: receptionistId,
      checkedInAt: startAt,
      checkedInBy: receptionistId,
      createdBy: receptionistId,
    },
  });
}

async function buildScheduledAppointment(args: {
  patient: { id: string };
  dentist: { id: string };
  startAt: Date;
  endAt: Date;
  receptionistId: string;
}) {
  const { patient, dentist, startAt, endAt, receptionistId } = args;
  return prisma.appointment.create({
    data: {
      patientId: patient.id,
      dentistId: dentist.id,
      startAt,
      endAt,
      status: 'CONFIRMED',
      reason: pick(REASON_TEMPLATES),
      source: 'PHONE',
      confirmedAt: addMinutes(startAt, -120),
      confirmedBy: receptionistId,
      createdBy: receptionistId,
    },
  });
}

async function main() {
  console.log('🌱 Seeding TODAY-dated demo records…\n');

  const dentists = await prisma.user.findMany({
    where: { userRoles: { some: { role: { code: 'dentist' } } } },
    orderBy: { email: 'asc' },
  });
  const receptionists = await prisma.user.findMany({
    where: { userRoles: { some: { role: { code: 'receptionist' } } } },
    orderBy: { email: 'asc' },
  });
  if (dentists.length === 0 || receptionists.length === 0) {
    throw new Error('No dentists/receptionists found — run `npm run prisma:seed:clinical` first.');
  }

  const patients = await prisma.patient.findMany({ orderBy: { code: 'asc' }, take: 6 });
  if (patients.length < 6) {
    throw new Error('Not enough patients — run `npm run prisma:seed:clinical` first.');
  }

  const receptionistId = receptionists[0].id;
  const results: string[] = [];

  // 2 completed exams earlier today — full bundle incl. dental chart + invoice + payment
  const completedSlots = [
    { hour: 8, minute: 0 },
    { hour: 8, minute: 45 },
  ];
  for (let i = 0; i < completedSlots.length; i++) {
    const dentist = dentists[i % dentists.length];
    const patient = patients[i];
    const startAt = todayAt(completedSlots[i].hour, completedSlots[i].minute);
    const endAt = addMinutes(startAt, 30);
    const r = await buildCompletedBundle({ patient, dentist, startAt, endAt, receptionistId });
    results.push(`  ✓ COMPLETED  ${startAt.toISOString().slice(11, 16)}  ${patient.fullName} — bác sĩ ${dentist.fullName} — encounter ${r.encounterId.slice(0, 8)}… (có sơ đồ răng)`);
  }

  // 2 checked-in, waiting to be seen — test "Bắt đầu khám" flow live
  const checkedInSlots = [
    { hour: 20, minute: 30 },
    { hour: 20, minute: 45 },
  ];
  for (let i = 0; i < checkedInSlots.length; i++) {
    const dentist = dentists[(i + 2) % dentists.length];
    const patient = patients[i + 2];
    const startAt = todayAt(checkedInSlots[i].hour, checkedInSlots[i].minute);
    const endAt = addMinutes(startAt, 30);
    await buildCheckedInAppointment({ patient, dentist, startAt, endAt, receptionistId });
    results.push(`  ✓ CHECKED_IN ${startAt.toISOString().slice(11, 16)}  ${patient.fullName} — bác sĩ ${dentist.fullName} — chờ "Bắt đầu khám"`);
  }

  // 2 confirmed, later today — populate the upcoming schedule
  const scheduledSlots = [
    { hour: 21, minute: 30 },
    { hour: 22, minute: 0 },
  ];
  for (let i = 0; i < scheduledSlots.length; i++) {
    const dentist = dentists[(i + 1) % dentists.length];
    const patient = patients[i + 4];
    const startAt = todayAt(scheduledSlots[i].hour, scheduledSlots[i].minute);
    const endAt = addMinutes(startAt, 30);
    await buildScheduledAppointment({ patient, dentist, startAt, endAt, receptionistId });
    results.push(`  ✓ CONFIRMED  ${startAt.toISOString().slice(11, 16)}  ${patient.fullName} — bác sĩ ${dentist.fullName} — sắp tới`);
  }

  console.log(results.join('\n'));
  console.log('\n✓ Done — 6 appointment mới cho hôm nay (2 đã khám xong + sơ đồ răng, 2 đang chờ khám, 2 sắp tới).');
}

main()
  .catch((e) => {
    console.error('Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

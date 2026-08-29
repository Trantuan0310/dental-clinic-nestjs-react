/**
 * Seed clinical data for revenue report demo.
 *
 * Idempotent: re-running this script is safe — it skips work if clinical data
 * already exists. To reset, run `npm run db:reset` first.
 *
 * Creates:
 *   - 4 dentist users (DENTIST role)
 *   - 2 receptionist users (RECEPTIONIST role)
 *   - ~80 patients (Vietnamese names, varied demographics)
 *   - ~150 appointments in 2026 (Jan → Jul)
 *   - ~150 closed encounters with 1-4 treatments each
 *   - ~150 invoices (DRAFT / ISSUED / PARTIAL / PAID)
 *   - ~200 payments (CASH / BANK_TRANSFER) driving the revenue aggregate
 *
 * The distribution is tuned to make the revenue report look realistic:
 *   - 70% PAID, 15% PARTIAL, 10% ISSUED, 5% DRAFT
 *   - 6 service "types" with realistic prices (VND)
 *   - 7 months of data so the trend chart has shape
 */

import { PrismaClient, Prisma } from '@prisma/client';
import * as argon2 from 'argon2';
import {
  utcDate,
  pickWeighted,
  getOperatingDays,
  pad,
} from './seed-helpers';

const prisma = new PrismaClient();

// ----------------------------------------------------------------------
// Data range constants — single source of truth for the 3-month window
// ----------------------------------------------------------------------

const DATA_START_DATE = utcDate(2026, 4, 16);   // 16/05/2026
const DATA_END_DATE   = utcDate(2026, 7, 16, 23, 59, 59); // 16/08/2026

/**
 * Per-month appointment target. The dashboard needs ~30/month for the trend
 * chart to look meaningful. May is half-month (16 onward), so 28 is fine.
 */
const MONTH_TARGETS: Record<string, number> = {
  '2026-05': 28,  // 16 -> 31 May (16 days)
  '2026-06': 32,  // June full
  '2026-07': 35,  // July full
  '2026-08': 30,  // 1 -> 16 Aug (16 days)
};
const TARGET_PATIENTS = 80;

const DEFAULT_PASSWORD = 'Password123!';

const DENTISTS = [
  { email: 'an.nguyen@clinic.local',  fullName: 'BS. Nguyễn Văn An' },
  { email: 'binh.tran@clinic.local',   fullName: 'BS. Trần Thị Bình' },
  { email: 'cuong.le@clinic.local',    fullName: 'BS. Lê Hoàng Cường' },
  { email: 'dung.pham@clinic.local',   fullName: 'BS. Phạm Thị Dung' },
];

const RECEPTIONISTS = [
  { email: 'hanh.le@clinic.local',     fullName: 'Lễ tân Lê Thị Hạnh' },
  { email: 'long.bui@clinic.local',    fullName: 'Lễ tân Bùi Văn Long' },
];

const SERVICES = [
  { procedure: 'Cạo vôi + đánh bóng',         unitPrice:   450_000 },
  { procedure: 'Trám răng composite',          unitPrice:   650_000 },
  { procedure: 'Nhổ răng (không biến chứng)', unitPrice:   600_000 },
  { procedure: 'Bọc răng sứ',                 unitPrice: 4_200_000 },
  { procedure: 'Cấy ghép Implant',            unitPrice: 8_900_000 },
  { procedure: 'Niềng răng (đợt thanh toán)', unitPrice: 1_800_000 },
];

const FIRST_NAMES = [
  'Nguyễn Văn', 'Trần Thị', 'Lê Hoàng', 'Phạm Thị', 'Hoàng Thị',
  'Đỗ Quang', 'Vũ Thị', 'Bùi Văn', 'Đặng Thị', 'Ngô Văn',
  'Dương Thị', 'Lý Văn', 'Phan Thị', 'Tôn Nữ', 'Chu Văn',
];
const MIDDLE_NAMES = ['Mai', 'Hùng', 'Hồng', 'Khoa', 'Lan', 'Minh', 'Ngọc', 'Phúc', 'Quân', 'Sơn', 'Trang', 'Uyên'];
const LAST_NAMES = ['An', 'Bình', 'Cường', 'Dung', 'Hà', 'Hải', 'Hương', 'Linh', 'My', 'Nam', 'Phong', 'Quyết', 'Tú', 'Vy'];

// ----------------------------------------------------------------------
// Deterministic pseudo-random
// ----------------------------------------------------------------------

let seed = 0x12345678;
function rand(): number {
  seed = (seed * 1103515245 + 12345) & 0x7fffffff;
  return seed / 0x7fffffff;
}
function randInt(min: number, max: number): number {
  return Math.floor(rand() * (max - min + 1)) + min;
}
function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(rand() * arr.length)];
}

// ----------------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------------

function generatePatientCode(seq: number): string {
  return `PT-2026-${seq.toString().padStart(5, '0')}`;
}

function generateAppointmentCode(): string {
  // not used — code is auto-assigned by app, not stored on appointment
  return '';
}

function buildFullName(): string {
  return `${pick(FIRST_NAMES)} ${pick(MIDDLE_NAMES)} ${pick(LAST_NAMES)}`;
}

function buildPhone(): string {
  const prefixes = ['090', '091', '093', '094', '097', '098', '086', '088', '089'];
  let s = pick(prefixes);
  for (let i = 0; i < 7; i++) s += randInt(0, 9).toString();
  return s;
}

function dobFor(ageMin: number, ageMax: number): Date {
  const now = new Date('2026-07-17T00:00:00Z');
  const age = randInt(ageMin, ageMax);
  const year = now.getUTCFullYear() - age;
  const month = randInt(0, 11);
  const day = randInt(1, 28);
  return new Date(Date.UTC(year, month, day));
}

function hourSlot(hour: number, minute: number): Date {
  return new Date(Date.UTC(2026, 0, 1, hour, minute, 0, 0));
}

function addMinutes(d: Date, minutes: number): Date {
  return new Date(d.getTime() + minutes * 60_000);
}

// ----------------------------------------------------------------------
// Main
// ----------------------------------------------------------------------

const REASON_TEMPLATES = [
  'Khám định kỳ',
  'Đau răng hàm dưới',
  'Tái khám sau nhổ răng',
  'Cạo vôi định kỳ',
  'Tư vấn chỉnh nha',
  'Trám răng sâu',
  'Cấy ghép Implant',
];

const DIAGNOSIS_TEMPLATES = [
  'Sâu răng',
  'Viêm nướu',
  'Mất răng',
  'Răng khấp khểnh',
  'Viêm quanh răng',
  'Áp xe răng',
  'Răng nhạy cảm',
];

const DRUG_TEMPLATES: Array<{ drug: string; dosage: string; frequency: string; duration: string; note?: string }> = [
  { drug: 'Amoxicillin 500mg',  dosage: '1 viên',    frequency: '3 lần/ngày', duration: '5 ngày',  note: 'Sau ăn' },
  { drug: 'Paracetamol 500mg',  dosage: '1-2 viên',  frequency: 'Khi đau',     duration: '3 ngày',  note: 'Cách 4-6 giờ' },
  { drug: 'Ibuprofen 400mg',    dosage: '1 viên',    frequency: '2 lần/ngày', duration: '3 ngày',  note: 'Sau ăn' },
  { drug: 'Metronidazole 250mg',dosage: '1 viên',    frequency: '2 lần/ngày', duration: '5 ngày',  note: 'Tránh rượu' },
  { drug: 'Nước súc miệng Chlorhexidine 0.12%', dosage: '15ml', frequency: '2 lần/ngày', duration: '7 ngày' },
  { drug: 'Nystatin 500.000 IU', dosage: '1 viên',   frequency: '4 lần/ngày', duration: '7 ngày',  note: 'Ngậm tan' },
  { drug: 'Cefuroxime 250mg',   dosage: '1 viên',    frequency: '2 lần/ngày', duration: '5 ngày' },
  { drug: 'Ketorolac 10mg',     dosage: '1 viên',    frequency: 'Khi đau',     duration: '2 ngày',  note: 'Tối đa 3 viên/ngày' },
];

async function createBundle(args: {
  patient: { id: string };
  dentist: { id: string };
  startAt: Date;
  endAt: Date;
  receptionists: Array<{ id: string }>;
}) {
  const { patient, dentist, startAt, endAt, receptionists } = args;

  const appt = await prisma.appointment.create({
    data: {
      patientId: patient.id,
      dentistId: dentist.id,
      startAt,
      endAt,
      createdAt: startAt,
      status: 'COMPLETED',
      reason: pick(REASON_TEMPLATES),
      notes: null,
      source: 'WALK_IN',
      confirmedAt: addMinutes(startAt, -1440),
      confirmedBy: receptionists[0].id,
      checkedInAt: startAt,
      checkedInBy: receptionists[0].id,
      createdBy: receptionists[0].id,
    },
  });

  const closedAt = addMinutes(startAt, Math.round((endAt.getTime() - startAt.getTime()) / 60_000) + 10);
  const diagnosis = pick(DIAGNOSIS_TEMPLATES);
  const encounter = await prisma.encounter.create({
    data: {
      appointmentId: appt.id,
      patientId: patient.id,
      dentistId: dentist.id,
      status: 'COMPLETED',
      startedAt: startAt,
      closedAt,
      summary: 'Hoàn thành liệu trình',
      chiefComplaint: appt.reason ?? '',
      diagnosis,
      treatmentPlanText: 'Theo phác đồ đã thống nhất với bệnh nhân.',
    },
  });

  const treatmentCount = randInt(1, 4);
  const treatments: Prisma.TreatmentCreateManyInput[] = [];
  for (let t = 0; t < treatmentCount; t++) {
    const svc = pick(SERVICES);
    treatments.push({
      encounterId: encounter.id,
      procedure: svc.procedure,
      description: null,
      unitPrice: new Prisma.Decimal(svc.unitPrice),
      durationMinutes: pick([20, 30, 45, 60]),
      sequence: t,
      createdBy: dentist.id,
    });
  }
  await prisma.treatment.createMany({ data: treatments });

  const createdTreatments = await prisma.treatment.findMany({
    where: { encounterId: encounter.id },
    orderBy: { sequence: 'asc' },
  });

  // --------------------------------------------------------------------
  // Clinical note (1:1 with encounter)
  // --------------------------------------------------------------------
  await prisma.clinicalNote.create({
    data: {
      encounterId: encounter.id,
      chiefComplaint: appt.reason ?? '',
      diagnosis,
      treatmentPlan: 'Theo phác đồ đã thống nhất với bệnh nhân.',
      notes: `Bệnh nhân ${pick(['chịu khó hợp tác', 'hơi lo lắng', 'rất thoải mái'])} trong quá trình điều trị.`,
      isLocked: rand() < 0.25,  // 25% of notes are locked (immutable history)
      lockedAt: rand() < 0.25 ? closedAt : null,
      lastEditedBy: dentist.id,
    },
  });

  // --------------------------------------------------------------------
  // Prescription + lines (60% of encounters)
  // --------------------------------------------------------------------
  if (rand() < 0.6) {
    const lineCount = randInt(1, 3);
    await prisma.prescription.create({
      data: {
        encounterId: encounter.id,
        diagnosis,
        instructions: `Dùng theo hướng dẫn dưới đây. Tái khám sau ${randInt(7, 30)} ngày nếu triệu chứng không giảm.`,
        followUpNote: pick(['Tái khám sau 1 tuần', 'Tái khám sau 2 tuần', 'Tái khám sau 1 tháng', null as unknown as string]),
        notes: null,
        createdBy: dentist.id,
        lines: {
          create: Array.from({ length: lineCount }, (_, idx) => {
            const d = pick(DRUG_TEMPLATES);
            return {
              sequence: idx,
              drugName: d.drug,
              dosage: d.dosage,
              frequency: d.frequency,
              duration: d.duration,
              instructions: d.note ?? null,
            };
          }),
        },
      },
    });
  }

  // --------------------------------------------------------------------
  // Dental chart snapshot (1:1, deterministic JSON of "teeth")
  // --------------------------------------------------------------------
  const teeth: Array<{ number: number; condition: string }> = [];
  for (let n = 11; n <= 18; n++) teeth.push({ number: n, condition: pick(['healthy', 'healthy', 'filled', 'cavity']) });
  for (let n = 21; n <= 28; n++) teeth.push({ number: n, condition: pick(['healthy', 'healthy', 'filled', 'cavity']) });
  for (let n = 31; n <= 38; n++) teeth.push({ number: n, condition: pick(['healthy', 'healthy', 'missing', 'crown']) });
  for (let n = 41; n <= 48; n++) teeth.push({ number: n, condition: pick(['healthy', 'healthy', 'missing', 'crown']) });
  await prisma.dentalChartSnapshot.create({
    data: {
      encounterId: encounter.id,
      patientType: rand() < 0.85 ? 'ADULT' : 'CHILD',
      teeth,
      snapshotAt: closedAt,
      snapshotBy: dentist.id,
    },
  });

  const subtotal = createdTreatments.reduce((acc, t) => acc + Number(t.unitPrice), 0);
  const invoiceSeq = await getNextInvoiceSeq();
  const invoiceCode = `INV-2026-${invoiceSeq.toString().padStart(6, '0')}`;

  const r = rand();
  let invStatus: 'DRAFT' | 'ISSUED' | 'PARTIAL' | 'PAID';
  if (r < 0.05) invStatus = 'DRAFT';
  else if (r < 0.15) invStatus = 'ISSUED';
  else if (r < 0.30) invStatus = 'PARTIAL';
  else invStatus = 'PAID';

  let paidAmount = 0;
  let outstandingAmount = subtotal;
  if (invStatus === 'PAID') {
    paidAmount = subtotal;
    outstandingAmount = 0;
  } else if (invStatus === 'PARTIAL') {
    const paidFraction = randInt(30, 80) / 100;
    paidAmount = Math.round((subtotal * paidFraction) / 10_000) * 10_000;
    outstandingAmount = subtotal - paidAmount;
  }

  const invoice = await prisma.invoice.create({
    data: {
      code: invoiceCode,
      encounterId: encounter.id,
      patientId: patient.id,
      status: invStatus,
      subtotal: new Prisma.Decimal(subtotal),
      total: new Prisma.Decimal(subtotal),
      paidAmount: new Prisma.Decimal(paidAmount),
      outstandingAmount: new Prisma.Decimal(outstandingAmount),
      notes: null,
      issuedAt: invStatus === 'DRAFT' ? null : addMinutes(closedAt, 30),
      issuedBy: invStatus === 'DRAFT' ? null : receptionists[0].id,
      createdAt: closedAt,
      createdBy: receptionists[0].id,
      items: {
        create: createdTreatments.map((t, idx) => ({
          treatmentId: t.id,
          sequence: idx,
          description: t.procedure,
          quantity: new Prisma.Decimal(1),
          unitPrice: t.unitPrice,
          lineTotal: t.unitPrice,
        })),
      },
    },
  });

  if (paidAmount > 0) {
    if (rand() < 0.7) {
      await prisma.payment.create({
        data: {
          invoiceId: invoice.id,
          amount: new Prisma.Decimal(paidAmount),
          method: rand() < 0.55 ? 'BANK_TRANSFER' : 'CASH',
          status: 'COMPLETED',
          paidAt: addMinutes(closedAt, 45 + randInt(0, 240)),
          receivedBy: receptionists[0].id,
        },
      });
    } else {
      const firstFraction = randInt(40, 70) / 100;
      const firstAmount = Math.round((paidAmount * firstFraction) / 10_000) * 10_000;
      const secondAmount = paidAmount - firstAmount;
      await prisma.payment.createMany({
        data: [
          {
            invoiceId: invoice.id,
            amount: new Prisma.Decimal(firstAmount),
            method: 'BANK_TRANSFER',
            status: 'COMPLETED',
            paidAt: addMinutes(closedAt, 45),
            receivedBy: receptionists[0].id,
          },
          {
            invoiceId: invoice.id,
            amount: new Prisma.Decimal(secondAmount),
            method: 'CASH',
            status: 'COMPLETED',
            paidAt: addMinutes(closedAt, 60 + randInt(0, 240)),
            receivedBy: receptionists[0].id,
          },
        ],
      });
    }
  }

  return { appointmentId: appt.id, encounterId: encounter.id, dentistId: dentist.id, patientId: patient.id };
}

async function main() {
  console.log('🌱 Seeding clinical data…\n');

  // --------------------------------------------------------------------
  // 0. Guard: if any clinical data exists, clean & re-seed for a fresh demo
  // --------------------------------------------------------------------
  const existingInvoices = await prisma.invoice.count();
  const existingAppts = await prisma.appointment.count();
  if (existingInvoices > 0 || existingAppts > 0) {
    console.log(`↺ Found ${existingInvoices} invoices / ${existingAppts} appointments — cleaning clinical data…`);
    // Order matters: respect FKs
    await prisma.auditLog.deleteMany({});
    await prisma.expenseAudit.deleteMany({});
    await prisma.expense.deleteMany({});
    await prisma.expenseCategory.deleteMany({});
    await prisma.payrollAdjustment.deleteMany({});
    await prisma.payrollEncounterDetail.deleteMany({});
    await prisma.payrollLineItem.deleteMany({});
    await prisma.payrollPeriod.deleteMany({});
    await prisma.dentistCompensation.deleteMany({});
    await prisma.stockMovement.deleteMany({});
    await prisma.inventoryItem.deleteMany({});
    await prisma.inventoryCategory.deleteMany({});
    await prisma.shiftRegistration.deleteMany({});
    await prisma.timeOff.deleteMany({});
    await prisma.workingSchedule.deleteMany({});
    await prisma.invoiceAudit.deleteMany({});
    await prisma.invoiceItem.deleteMany({});
    await prisma.payment.deleteMany({});
    await prisma.invoice.deleteMany({});
    await prisma.dentalChartSnapshot.deleteMany({});
    await prisma.prescriptionLine.deleteMany({});
    await prisma.prescription.deleteMany({});
    await prisma.clinicalNoteAddendum.deleteMany({});
    await prisma.clinicalNote.deleteMany({});
    await prisma.treatment.deleteMany({});
    await prisma.encounter.deleteMany({});
    await prisma.appointment.deleteMany({});
    console.log('  ✓ clinical tables cleared\n');
  }

  // --------------------------------------------------------------------
  // 1. Ensure admin status is ACTIVE so we can also use it as creator
  // --------------------------------------------------------------------
  const admin = await prisma.user.findUnique({ where: { email: 'admin@clinic.local' } });
  if (!admin) {
    throw new Error('Admin user missing — run `npm run prisma:seed` first.');
  }
  await prisma.user.update({
    where: { id: admin.id },
    data: { status: 'ACTIVE' },
  });

  // --------------------------------------------------------------------
  // 2. Roles
  // --------------------------------------------------------------------
  const dentistRole = await prisma.role.findUnique({ where: { code: 'dentist' } });
  const receptionistRole = await prisma.role.findUnique({ where: { code: 'receptionist' } });
  if (!dentistRole || !receptionistRole) {
    throw new Error('Roles missing — run `npm run prisma:seed` first.');
  }

  // --------------------------------------------------------------------
  // 3. Dentists
  // --------------------------------------------------------------------
  console.log('Creating dentists…');
  const passwordHash = await argon2.hash(DEFAULT_PASSWORD, { type: argon2.argon2id });
  const dentists = [];
  for (const d of DENTISTS) {
    const user = await prisma.user.upsert({
      where: { email: d.email },
      update: { fullName: d.fullName, status: 'ACTIVE' },
      create: {
        email: d.email,
        fullName: d.fullName,
        passwordHash,
        status: 'ACTIVE',
        userRoles: { create: { roleId: dentistRole.id } },
      },
    });
    dentists.push(user);
    console.log(`  ✓ ${user.fullName} (${user.email})`);
  }

  // --------------------------------------------------------------------
  // 4. Receptionists
  // --------------------------------------------------------------------
  console.log('\nCreating receptionists…');
  const receptionists = [];
  for (const r of RECEPTIONISTS) {
    const user = await prisma.user.upsert({
      where: { email: r.email },
      update: { fullName: r.fullName, status: 'ACTIVE' },
      create: {
        email: r.email,
        fullName: r.fullName,
        passwordHash,
        status: 'ACTIVE',
        userRoles: { create: { roleId: receptionistRole.id } },
      },
    });
    receptionists.push(user);
    console.log(`  ✓ ${user.fullName} (${user.email})`);
  }

  // --------------------------------------------------------------------
  // 5. Patients
  // --------------------------------------------------------------------
  console.log('\nCreating patients…');
  const patientCount = await prisma.patient.count();
  const targetPatients = TARGET_PATIENTS;
  if (patientCount >= targetPatients) {
    console.log(`  ✓ Already have ${patientCount} patients, skipping creation.`);
  }
  const newPatients = [];
  for (let i = patientCount; i < targetPatients; i++) {
    const p = await prisma.patient.create({
      data: {
        code: generatePatientCode(i + 1),
        fullName: buildFullName(),
        dob: dobFor(18, 70),
        gender: rand() < 0.55 ? 'FEMALE' : 'MALE',
        primaryPhone: buildPhone(),
        email: rand() < 0.3 ? `patient${i + 1}@example.com` : null,
        address: pick(['Hà Nội', 'TP. HCM', 'Đà Nẵng', 'Hải Phòng', 'Cần Thơ', 'Bình Dương']),
        occupation: pick(['Kế toán', 'Giáo viên', 'Kỹ sư', 'Bác sĩ', 'Sinh viên', 'Kinh doanh', 'Nội trợ']),
        allergies: [],
        chronicDiseases: [],
        currentMedications: [],
        createdBy: receptionists[0].id,
      },
    });
    newPatients.push(p);
  }
  const patients = await prisma.patient.findMany({
    where: { id: { not: '00000000-0000-0000-0000-000000000000' } },
    take: targetPatients,
    orderBy: { code: 'asc' },
  });
  console.log(`  ✓ ${newPatients.length} new patients (total: ${patients.length})`);

  // --------------------------------------------------------------------
  // 6. Appointments + Encounters + Treatments + Invoices + Payments + Clinical notes
  //    Generate per-month targets within DATA_START_DATE..DATA_END_DATE
  // --------------------------------------------------------------------
  console.log('\nCreating appointments, encounters, invoices, payments…');

  let totalCreated = 0;
  let ptCursor = 0;
  const usedSlots = new Set<string>();
  const grandTotal = Object.values(MONTH_TARGETS).reduce((a, b) => a + b, 0);

  for (const [monthKey, monthCount] of Object.entries(MONTH_TARGETS)) {
    // monthKey looks like '2026-05'
    const [yy, mm] = monthKey.split('-').map(Number);
    const monthStart = utcDate(yy, mm - 1, Math.max(1, DATA_START_DATE.getUTCDate())); // for May use 16
    const monthEndRaw = utcDate(yy, mm, 0, 23, 59, 59);   // last day of month
    const monthStartClamped = new Date(Math.max(monthStart.getTime(), DATA_START_DATE.getTime()));
    const monthEndClamped = new Date(Math.min(monthEndRaw.getTime(), DATA_END_DATE.getTime()));
    if (monthStartClamped.getTime() > monthEndClamped.getTime()) continue;

    let attemptsInMonth = 0;
    const maxAttempts = monthCount * 6;

    while (totalCreated < grandTotal - Object.entries(MONTH_TARGETS).filter(([k]) => k > monthKey).reduce((a, [, v]) => a + v, 0) && attemptsInMonth < maxAttempts) {
      attemptsInMonth++;

      const day = randInt(monthStartClamped.getUTCDate(), monthEndClamped.getUTCDate());
      const startHour = pick([8, 9, 10, 11, 14, 15, 16, 17]);
      const startMin = pick([0, 15, 30, 45]);
      const startAt = utcDate(yy, mm - 1, day, startHour, startMin);
      if (startAt.getTime() < DATA_START_DATE.getTime() || startAt.getTime() > DATA_END_DATE.getTime()) continue;
      const duration = pick([30, 45, 60, 90]);
      const endAt = addMinutes(startAt, duration);

      const patient = patients[ptCursor % patients.length];
      ptCursor++;
      const dentist = pick(dentists);

      const slotKey = `${dentist.id}|${startAt.toISOString()}`;
      if (usedSlots.has(slotKey)) {
        let placed = false;
        for (let jitter = 1; jitter <= 6 && !placed; jitter++) {
          const altStart = addMinutes(startAt, jitter);
          const altEnd = addMinutes(endAt, jitter);
          const altKey = `${dentist.id}|${altStart.toISOString()}`;
          if (!usedSlots.has(altKey)) {
            usedSlots.add(altKey);
            await createBundle({
              patient, dentist, startAt: altStart, endAt: altEnd, receptionists,
            });
            totalCreated++;
            placed = true;
          }
        }
        continue;
      }
      usedSlots.add(slotKey);
      await createBundle({
        patient, dentist, startAt, endAt, receptionists,
      });
      totalCreated++;
    }
    console.log(`  ✓ ${monthKey} done — ${totalCreated} appointments total so far`);
  }

  // Phase 7-12 ----------------------------------------------------------------
  await seedWorkingSchedules(dentists, admin);
  await seedShiftRegistrations(dentists, admin);
  await seedInventory(admin, receptionists);
  await seedPayrollPeriods(admin, dentists, totalCreated);
  await seedExpenses(admin, receptionists);
  await seedAuditLogs(admin, dentists, receptionists, totalCreated);

  // --------------------------------------------------------------------
  // Summary
  // --------------------------------------------------------------------
  const finalCount = await prisma.invoice.count();
  const totalRevenue = await prisma.invoice.aggregate({ _sum: { total: true, paidAmount: true } });
  console.log('\n========================================');
  console.log('✓ Seed complete!');
  console.log(`  ${finalCount} invoices (${totalCreated} created)`);
  console.log(`  Total billed: ${Number(totalRevenue._sum.total ?? 0).toLocaleString('vi-VN')} ₫`);
  console.log(`  Total paid:   ${Number(totalRevenue._sum.paidAmount ?? 0).toLocaleString('vi-VN')} ₫`);
  console.log('\n  Test login:');
  console.log('    admin@clinic.local / Admin123!');
  console.log('    an.nguyen@clinic.local / Password123!');
  console.log('========================================\n');
}

async function getNextInvoiceSeq(): Promise<number> {
  // Compute the next invoice sequence based on existing rows. This avoids
  // depending on the optional `invoice_code_seq` PG sequence (which is
  // created lazily by BillingService). The format matches what the live
  // BillingService would emit: `INV-YYYY-NNNNNN`.
  const count = await prisma.invoice.count();
  return count + 1;
}

// ======================================================================
// Phase 7: Working schedules
// One Mon-Fri schedule per dentist (08:00-17:00), valid for the demo window.
// ======================================================================

async function seedWorkingSchedules(
  dentists: Array<{ id: string }>,
  admin: { id: string },
): Promise<void> {
  console.log('\nSeeding working schedules…');
  const existing = await prisma.workingSchedule.count();
  if (existing > 0) {
    console.log(`  ✓ Already have ${existing} schedules, skipping.`);
    return;
  }
  for (const dentist of dentists) {
    for (const dow of [1, 2, 3, 4, 5]) {
      await prisma.workingSchedule.create({
        data: {
          dentistId: dentist.id,
          dayOfWeek: dow,
          startTime: utcDate(2026, 0, 1, 8, 0),   // 08:00
          endTime: utcDate(2026, 0, 1, 17, 0),    // 17:00
          slotDurationMin: 30,
          validFrom: utcDate(2026, 3, 1),          // 2026-04-01
          validTo: utcDate(2026, 11, 31),         // 2026-12-31
          isPaidShift: true,
          shiftType: 'FULL_DAY',
          createdBy: admin.id,
        },
      });
    }
    console.log(`  ✓ schedule for dentist ${dentist.id.slice(0, 8)}…`);
  }
}

// ======================================================================
// Phase 8: Shift registrations
// ~5 entries per dentist (mix of PENDING / APPROVED / REJECTED)
// ======================================================================

async function seedShiftRegistrations(
  dentists: Array<{ id: string; fullName: string }>,
  admin: { id: string },
): Promise<void> {
  console.log('\nSeeding shift registrations…');
  const existing = await prisma.shiftRegistration.count();
  if (existing > 0) {
    console.log(`  ✓ Already have ${existing} shift registrations, skipping.`);
    return;
  }
  let total = 0;
  for (const dentist of dentists) {
    for (let i = 0; i < 6; i++) {
      const dateOffset = randInt(0, 90);
      const date = new Date(DATA_START_DATE.getTime() + dateOffset * 86400 * 1000);
      // skip weekends
      while (date.getUTCDay() === 0 || date.getUTCDay() === 6) date.setUTCDate(date.getUTCDate() + 1);
      const r = rand();
      const status: 'PENDING' | 'APPROVED' | 'REJECTED' =
        r < 0.6 ? 'APPROVED' : r < 0.85 ? 'PENDING' : 'REJECTED';
      await prisma.shiftRegistration.create({
        data: {
          dentistId: dentist.id,
          date,
          startTime: pick(['08:00', '13:00', '08:30']),
          endTime: pick(['12:00', '17:00', '17:30']),
          maxEncounters: randInt(4, 10),
          notes: pick([
            'Ca thường',
            'Đăng ký thêm giờ',
            'Cover ca đồng nghiệp nghỉ',
            null as unknown as string,
          ]),
          status,
          approvedByUserId: status === 'PENDING' ? null : admin.id,
          approvedAt: status === 'PENDING' ? null : new Date(date.getTime() - 86400 * 1000),
          rejectionReason: status === 'REJECTED' ? 'Trùng lịch nghỉ phép đã đăng ký' : null,
          createdByUserId: dentist.id,
        },
      });
      total++;
    }
  }
  console.log(`  ✓ ${total} shift registrations created`);
}

// ======================================================================
// Phase 9: Inventory — categories, items, movements
// 5 categories, 30 items, stock-in (initial) + stock-out (proportional to encounters)
// ======================================================================

const INVENTORY_CATEGORIES = [
  { name: 'Vật liệu tiêu hao',          description: 'Găng tay, khẩu trang, cồn, bông gòn…' },
  { name: 'Vật liệu nha khoa',           description: 'Composite, cement, amalgam, chỉ co nướu…' },
  { name: 'Dụng cụ điều trị',            description: 'Mũi khoan, kìm nhổ, cây đo túi nha chu…' },
  { name: 'Thuốc',                       description: 'Thuốc tê, thuốc kháng sinh, nước súc miệng…' },
  { name: 'Văn phòng phẩm y tế',         description: 'Hồ sơ bệnh án, bút, giấy in chuyên dụng…' },
];

interface InventoryItemTemplate {
  sku: string;
  name: string;
  categoryIdx: number;
  unit: string;
  initialQty: number;
  minStock: number;
  costPrice: number;
}

const INVENTORY_ITEMS: InventoryItemTemplate[] = [
  // Vật liệu tiêu hao
  { sku: 'CONSUM-GLV-M',    name: 'Găng tay nitrile size M (hộp 100)',   categoryIdx: 0, unit: 'hộp',  initialQty: 50, minStock: 10, costPrice: 90_000 },
  { sku: 'CONSUM-GLV-S',    name: 'Găng tay nitrile size S (hộp 100)',   categoryIdx: 0, unit: 'hộp',  initialQty: 30, minStock: 10, costPrice: 90_000 },
  { sku: 'CONSUM-MASK',     name: 'Khẩu trang y tế (hộp 50)',           categoryIdx: 0, unit: 'hộp',  initialQty: 40, minStock: 15, costPrice: 60_000 },
  { sku: 'CONSUM-ALCOHOL',  name: 'Cồn y tế 70% (chai 1L)',             categoryIdx: 0, unit: 'chai', initialQty: 20, minStock:  5, costPrice: 45_000 },
  { sku: 'CONSUM-COTTON',   name: 'Bông gòn y tế (gói 500g)',           categoryIdx: 0, unit: 'gói',  initialQty: 30, minStock:  8, costPrice: 55_000 },
  { sku: 'CONSUM-SYRINGE',  name: 'Bơm tiêm 5ml (hộp 100)',             categoryIdx: 0, unit: 'hộp',  initialQty: 25, minStock:  6, costPrice: 80_000 },
  // Vật liệu nha khoa
  { sku: 'MATERIAL-COMP-A2', name: 'Composite A2 (tuýp 4g)',            categoryIdx: 1, unit: 'tuýp', initialQty: 25, minStock:  5, costPrice: 220_000 },
  { sku: 'MATERIAL-COMP-A3', name: 'Composite A3 (tuýp 4g)',            categoryIdx: 1, unit: 'tuýp', initialQty: 18, minStock:  5, costPrice: 220_000 },
  { sku: 'MATERIAL-CEMENT',  name: 'Glass ionomer cement (tuýp)',        categoryIdx: 1, unit: 'tuýp', initialQty: 15, minStock:  3, costPrice: 320_000 },
  { sku: 'MATERIAL-ETCH',   name: 'Acid etch 37% (lọ 3ml)',             categoryIdx: 1, unit: 'lọ',   initialQty: 30, minStock:  8, costPrice: 65_000 },
  { sku: 'MATERIAL-BOND',   name: 'Bonding agent (lọ 5ml)',              categoryIdx: 1, unit: 'lọ',   initialQty: 20, minStock:  5, costPrice: 180_000 },
  // Dụng cụ điều trị
  { sku: 'TOOL-BUR-HP',     name: 'Mũi khoan HP (cái)',                  categoryIdx: 2, unit: 'cái',  initialQty: 60, minStock: 15, costPrice: 35_000 },
  { sku: 'TOOL-FORCEPS',    name: 'Kìm nhổ răng (cái)',                  categoryIdx: 2, unit: 'cái',  initialQty:  8, minStock:  2, costPrice: 380_000 },
  { sku: 'TOOL-PROBE',      name: 'Cây đo túi nha chu (cái)',            categoryIdx: 2, unit: 'cái',  initialQty: 12, minStock:  3, costPrice: 145_000 },
  { sku: 'TOOL-MIRROR',     name: 'Gương nha khoa (cái)',                categoryIdx: 2, unit: 'cái',  initialQty: 30, minStock:  8, costPrice: 25_000 },
  { sku: 'TOOL-SCALER',     name: 'Dụng cụ cạo vôi siêu âm (cái)',       categoryIdx: 2, unit: 'cái',  initialQty:  6, minStock:  2, costPrice: 950_000 },
  // Thuốc
  { sku: 'DRUG-ANES-2',     name: 'Lidocain 2% epinephrine (ống)',       categoryIdx: 3, unit: 'ống',  initialQty: 100, minStock: 30, costPrice: 12_000 },
  { sku: 'DRUG-ANES-4',     name: 'Articain 4% (ống)',                   categoryIdx: 3, unit: 'ống',  initialQty:  70, minStock: 20, costPrice: 22_000 },
  { sku: 'DRUG-AMOX',       name: 'Amoxicillin 500mg (vỉ 10)',           categoryIdx: 3, unit: 'vỉ',   initialQty: 50, minStock: 15, costPrice: 65_000 },
  { sku: 'DRUG-PARA',       name: 'Paracetamol 500mg (vỉ 10)',           categoryIdx: 3, unit: 'vỉ',   initialQty: 60, minStock: 20, costPrice: 28_000 },
  { sku: 'DRUG-IBU',        name: 'Ibuprofen 400mg (vỉ 10)',             categoryIdx: 3, unit: 'vỉ',   initialQty: 45, minStock: 12, costPrice: 35_000 },
  { sku: 'DRUG-METRO',      name: 'Metronidazole 250mg (vỉ 10)',         categoryIdx: 3, unit: 'vỉ',   initialQty: 35, minStock: 10, costPrice: 42_000 },
  { sku: 'DRUG-CHX',        name: 'Nước súc miệng Chlorhexidine (chai)',  categoryIdx: 3, unit: 'chai', initialQty: 25, minStock:  6, costPrice: 75_000 },
  // Văn phòng
  { sku: 'OFF-PAPER-A4',   name: 'Giấy A4 (ram 500 tờ)',                categoryIdx: 4, unit: 'ram',  initialQty: 30, minStock: 10, costPrice: 80_000 },
  { sku: 'OFF-FORM',        name: 'Form hồ sơ bệnh án (quyển 50)',       categoryIdx: 4, unit: 'quyển',initialQty: 25, minStock:  6, costPrice: 95_000 },
  { sku: 'OFF-PEN',         name: 'Bút bi (hộp 12)',                     categoryIdx: 4, unit: 'hộp',  initialQty: 12, minStock:  3, costPrice: 45_000 },
  { sku: 'OFF-BAG',         name: 'Túi đựng bệnh phẩm (cái)',            categoryIdx: 4, unit: 'cái',  initialQty: 200, minStock: 50, costPrice: 1_500 },
  { sku: 'OFF-GLOVE-BX',   name: 'Hộp đựng găng tay (cái)',             categoryIdx: 4, unit: 'cái',  initialQty: 10, minStock:  3, costPrice: 35_000 },
  { sku: 'OFF-SOAP',        name: 'Xà phòng rửa tay (chai 500ml)',       categoryIdx: 4, unit: 'chai', initialQty: 18, minStock:  5, costPrice: 55_000 },
  { sku: 'OFF-XRAY-FILM',  name: 'Phim X-quang (hộp 100)',              categoryIdx: 4, unit: 'hộp',  initialQty: 12, minStock:  3, costPrice: 280_000 },
];

async function seedInventory(
  admin: { id: string },
  receptionists: Array<{ id: string }>,
): Promise<void> {
  console.log('\nSeeding inventory (categories, items, movements)…');
  const existing = await prisma.inventoryItem.count();
  if (existing > 0) {
    console.log(`  ✓ Already have ${existing} inventory items, skipping.`);
    return;
  }

  // ----- Categories
  const categories: Array<{ id: string; name: string }> = [];
  for (const c of INVENTORY_CATEGORIES) {
    const row = await prisma.inventoryCategory.create({
      data: { ...c, createdBy: admin.id, updatedBy: admin.id },
    });
    categories.push({ id: row.id, name: row.name });
  }
  console.log(`  ✓ ${categories.length} categories`);

  // ----- Items
  const items: Array<{ id: string; sku: string; qty: number }> = [];
  for (const t of INVENTORY_ITEMS) {
    const cat = categories[t.categoryIdx];
    const row = await prisma.inventoryItem.create({
      data: {
        sku: t.sku,
        name: t.name,
        categoryId: cat.id,
        unit: t.unit,
        quantityOnHand: new Prisma.Decimal(t.initialQty),
        minStockLevel: new Prisma.Decimal(t.minStock),
        costPrice: new Prisma.Decimal(t.costPrice),
        status: 'ACTIVE',
        createdBy: admin.id,
      },
    });
    items.push({ id: row.id, sku: row.sku, qty: t.initialQty });
    // initial stock-in (movement) — quantityBefore/After + diff
    await prisma.stockMovement.create({
      data: {
        inventoryItemId: row.id,
        type: 'STOCK_IN',
        quantityBefore: new Prisma.Decimal(0),
        quantityAfter: new Prisma.Decimal(t.initialQty),
        diff: new Prisma.Decimal(t.initialQty),
        reason: 'Nhập kho ban đầu',
        performedBy: admin.id,
        performedAt: DATA_START_DATE,
      },
    });
  }
  console.log(`  ✓ ${items.length} items (+ initial stock-in)`);

  // ----- Stock-out movements proportional to encounters
  // Pull all encounters in the data window
  const encounters = await prisma.encounter.findMany({
    where: {
      startedAt: { gte: DATA_START_DATE, lte: DATA_END_DATE },
      status: 'COMPLETED',
    },
    select: { id: true, startedAt: true },
  });
  let movOut = 0;
  for (const enc of encounters) {
    // Each encounter consumes 1-3 items from random categories
    const usedItems = new Set<string>();
    const n = randInt(1, 3);
    for (let i = 0; i < n; i++) {
      const it = pick(items);
      if (usedItems.has(it.id)) continue;
      usedItems.add(it.id);
      const consumeQty = randInt(1, 3);
      try {
        // Lookup item to get current quantity
        const current = await prisma.inventoryItem.findUnique({ where: { id: it.id } });
        if (!current) continue;
        const newQty = Math.max(0, Number(current.quantityOnHand) - consumeQty);
        await prisma.stockMovement.create({
          data: {
            inventoryItemId: it.id,
            type: 'STOCK_OUT',
            quantityBefore: current.quantityOnHand,
            quantityAfter: new Prisma.Decimal(newQty),
            diff: new Prisma.Decimal(-consumeQty),
            refType: 'ENCOUNTER',
            refId: enc.id,
            reason: `Dùng cho phiên khám ${enc.id.slice(0, 8)}…`,
            performedBy: receptionists[0].id,
            performedAt: enc.startedAt,
          },
        });
        movOut++;
      } catch {
        // skip duplicate reference if any
      }
    }
  }
  console.log(`  ✓ ${movOut} stock-out movements (encounter-driven)`);

  // ----- Top up some items to realistic levels
  const lowItems = items.filter((i) => i.qty <= 20);
  for (const it of lowItems.slice(0, 5)) {
    const topUpQty = randInt(30, 80);
    const current = await prisma.inventoryItem.findUnique({ where: { id: it.id } });
    if (!current) continue;
    const newQty = Number(current.quantityOnHand) + topUpQty;
    await prisma.stockMovement.create({
      data: {
        inventoryItemId: it.id,
        type: 'STOCK_IN',
        quantityBefore: current.quantityOnHand,
        quantityAfter: new Prisma.Decimal(newQty),
        diff: new Prisma.Decimal(topUpQty),
        reason: 'Bổ sung hàng tuần',
        performedBy: admin.id,
        performedAt: new Date(DATA_END_DATE.getTime() - randInt(0, 7) * 86400 * 1000),
      },
    });
  }
}

// ======================================================================
// Phase 10: Payroll periods + line items
// 3 monthly periods: May, Jun, Jul (Aug partial to today)
// ======================================================================

async function seedPayrollPeriods(
  admin: { id: string; email: string },
  dentists: Array<{ id: string; fullName: string }>,
  totalEncountersCreated: number,
): Promise<void> {
  console.log('\nSeeding payroll periods + line items…');
  const existing = await prisma.payrollPeriod.count();
  if (existing > 0) {
    console.log(`  ✓ Already have ${existing} periods, skipping.`);
    return;
  }

  const config = await prisma.payrollConfig.findFirst();
  if (!config) {
    console.log('  ⚠ No PayrollConfig found — skipping (run seed.ts first)');
    return;
  }

  // Snapshot of config — what we read from PayrollConfig exactly
  const configSnapshot = {
    payrollCycle: config.payrollCycle,
    overtimeMultiplier: Number(config.overtimeMultiplier),
    defaultTaxTncnPct: Number(config.defaultTaxTncnPct),
    bhxhPct: Number(config.bhxhPct),
    bhytPct: Number(config.bhytPct),
    bhtnPct: Number(config.bhtnPct),
    minGrossForBhxh: Number(config.minGrossForBhxh),
    probationSalaryPct: Number(config.probationSalaryPct),
    taxBrackets: config.taxBrackets as unknown,
  };

  // Create dentist compensation records (one per dentist)
  for (const d of dentists) {
    const exists = await prisma.dentistCompensation.findFirst({
      where: { dentistId: d.id, effectiveTo: null },
    });
    if (!exists) {
      await prisma.dentistCompensation.create({
        data: {
          dentistId: d.id,
          effectiveFrom: utcDate(2026, 0, 1),
          baseSalaryVnd: new Prisma.Decimal(18_000_000),
          commissionPct: new Prisma.Decimal(0.08),
          overtimeHourlyVnd: new Prisma.Decimal(120_000),
          approvedByUserId: admin.id,
          approvedAt: utcDate(2026, 0, 1),
          notes: 'Hợp đồng dài hạn, full-time',
        },
      });
    }
  }

  // Create one period per month in the data window
  const periods: Array<{ start: Date; end: Date; status: 'LOCKED' | 'APPROVED' | 'PAID' | 'DRAFT' }> = [
    { start: utcDate(2026, 4,  1), end: utcDate(2026, 4, 31), status: 'PAID'    }, // May paid
    { start: utcDate(2026, 5,  1), end: utcDate(2026, 5, 30), status: 'PAID'    }, // Jun paid
    { start: utcDate(2026, 6,  1), end: utcDate(2026, 6, 31), status: 'APPROVED' }, // Jul approved
    { start: utcDate(2026, 7,  1), end: utcDate(2026, 7, 16), status: 'DRAFT'   }, // Aug partial draft
  ];

  for (const p of periods) {
    const period = await prisma.payrollPeriod.create({
      data: {
        periodStart: p.start,
        periodEnd: p.end,
        payrollCycle: 'MONTHLY',
        status: p.status,
        configSnapshot: configSnapshot as unknown as Prisma.InputJsonValue,
        createdByUserId: admin.id,
        ...(p.status !== 'DRAFT' && {
          approvedByUserId: admin.id,
          approvedAt: addMinutes(p.end, 60 * 24 * 3),
        }),
        ...(p.status === 'PAID' && {
          markedPaidByUserId: admin.id,
          paidAt: addMinutes(p.end, 60 * 24 * 7),
          paymentReference: `PAY-${p.start.getUTCFullYear()}-${String(p.start.getUTCMonth() + 1).padStart(2, '0')}`,
        }),
      },
    });

    // Encounters within this period grouped by dentist
    const encountersInPeriod = await prisma.encounter.findMany({
      where: {
        status: 'COMPLETED',
        startedAt: { gte: p.start, lte: new Date(p.end.getTime() + 86400 * 1000) },
      },
      include: { treatments: true },
    });

    for (const dentist of dentists) {
      const myEncs = encountersInPeriod.filter((e) => e.dentistId === dentist.id);
      const totalRevenue = myEncs.reduce((acc, e) => acc + e.treatments.reduce((a, t) => a + Number(t.unitPrice), 0), 0);
      const workedShifts = randInt(8, 22);   // approximated; real value depends on ShiftRegistration
      const totalHours = workedShifts * 8;
      const overtimeHours = randInt(0, 6);

      const baseSalary = 18_000_000;
      const commission = Math.round((totalRevenue * 0.08) / 1000) * 1000;
      const overtimePay = overtimeHours * 120_000;
      const bonus = randInt(0, 1) ? randInt(500_000, 2_000_000) : 0;
      const penalty = 0;
      const gross = baseSalary + commission + overtimePay + bonus - penalty;
      const tax = Math.round(gross * 0.1 / 1000) * 1000;
      const bhxh = Math.round(gross * 0.105 / 1000) * 1000;  // 8% + 1.5% + 1%
      const net = gross - tax - bhxh;

      const lineItem = await prisma.payrollLineItem.create({
        data: {
          payrollPeriodId: period.id,
          dentistId: dentist.id,
          encountersCount: myEncs.length,
          totalRevenueVnd: new Prisma.Decimal(totalRevenue),
          workedShifts,
          totalHours: new Prisma.Decimal(totalHours),
          overtimeHours: new Prisma.Decimal(overtimeHours),
          baseSalaryVnd: new Prisma.Decimal(baseSalary),
          commissionVnd: new Prisma.Decimal(commission),
          overtimePayVnd: new Prisma.Decimal(overtimePay),
          bonusVnd: new Prisma.Decimal(bonus),
          penaltyVnd: new Prisma.Decimal(penalty),
          grossPayVnd: new Prisma.Decimal(gross),
          taxTncnVnd: new Prisma.Decimal(tax),
          bhxhVnd: new Prisma.Decimal(bhxh),
          netPayVnd: new Prisma.Decimal(net),
          computationLog: {
            derivedFrom: 'seed-clinical',
            encounterCount: myEncs.length,
            computedAt: new Date().toISOString(),
          } as unknown as Prisma.InputJsonValue,
        },
      });

      // Sample encounter detail rows (just first encounter per dentist per period)
      const firstEnc = myEncs[0];
      if (firstEnc && firstEnc.treatments.length > 0) {
        await prisma.payrollEncounterDetail.create({
          data: {
            payrollLineItemId: lineItem.id,
            payrollPeriodId: period.id,
            encounterId: firstEnc.id,
            treatmentId: firstEnc.treatments[0].id,
            treatmentRevenueVnd: new Prisma.Decimal(Number(firstEnc.treatments[0].unitPrice)),
            encounterStartAt: firstEnc.startedAt,
            encounterEndAt: firstEnc.closedAt ?? firstEnc.startedAt,
            durationMinutes: firstEnc.treatments[0].durationMinutes ?? 30,
            treatmentBreakdown: firstEnc.treatments.map((t) => ({
              id: t.id,
              procedure: t.procedure,
              revenue: Number(t.unitPrice),
            })) as unknown as Prisma.InputJsonValue,
          },
        });
      }
    }
    console.log(`  ✓ period ${p.start.toISOString().slice(0, 10)} → ${p.status} (${encountersInPeriod.length} encounters across all dentists)`);
  }
}

// ======================================================================
// Phase 11: Expenses — categories + 60 expenses over 3 months
// ======================================================================

const EXPENSE_CATEGORIES = [
  { name: 'Điện nước',         description: 'Hóa đơn điện, nước hàng tháng' },
  { name: 'Vật tư y tế',       description: 'Mua vật tư tiêu hao, thiết bị' },
  { name: 'Lương nhân viên',   description: 'Lương và phụ cấp (ngoài bác sĩ)' },
  { name: 'Thuê mặt bằng',     description: 'Tiền thuê phòng khám' },
  { name: 'Marketing',         description: 'Quảng cáo Facebook, Google' },
  { name: 'Bảo trì thiết bị',  description: 'Bảo dưỡng ghế, máy X-quang' },
  { name: 'Đào tạo',           description: 'Khóa học, hội thảo' },
  { name: 'Văn phòng phẩm',    description: 'Giấy, bút, mực in' },
];

const EXPENSE_DESCRIPTIONS: Record<string, string[]> = {
  'Điện nước':        ['Hóa đơn điện tháng', 'Hóa đơn nước tháng'],
  'Vật tư y tế':      ['Nhập găng tay + khẩu trang', 'Nhập composite A2/A3', 'Nhập thuốc tê lidocain'],
  'Lương nhân viên':   ['Lương tháng cho 2 lễ tân', 'Phụ cấp cơm trưa', 'Thưởng KPI tháng'],
  'Thuê mặt bằng':     ['Tiền thuê phòng khám Q2', 'Tiền thuê phòng khám Q3'],
  'Marketing':         ['Quảng cáo Facebook tháng', 'Quảng cáo Google Ads', 'In banner quảng bá'],
  'Bảo trì thiết bị':  ['Bảo dưỡng ghế nha khoa', 'Vệ sinh máy nén khí'],
  'Đào tạo':           ['Hội thảo implant quốc tế', 'Khóa học chỉnh nha ngắn hạn'],
  'Văn phòng phẩm':    ['Mua giấy in A4', 'Mua bút bi + kẹp giấy'],
};

async function seedExpenses(
  admin: { id: string },
  receptionists: Array<{ id: string }>,
): Promise<void> {
  console.log('\nSeeding expenses…');
  const existing = await prisma.expense.count();
  if (existing > 0) {
    console.log(`  ✓ Already have ${existing} expenses, skipping.`);
    return;
  }

  // Categories
  const cats: Array<{ id: string; name: string }> = [];
  for (const c of EXPENSE_CATEGORIES) {
    const exists = await prisma.expenseCategory.findUnique({ where: { name: c.name } });
    if (exists) {
      cats.push({ id: exists.id, name: exists.name });
    } else {
      // `type` (ExpenseType enum) is set via raw SQL because the migration
      // declared the column as `text` but Prisma still casts against the
      // absent PG ENUM type. $executeRaw avoids the cast entirely.
      const id = crypto.randomUUID();
      await prisma.$executeRawUnsafe(
        `INSERT INTO expense_categories (id, name, description, type, is_active, created_at, updated_at)
         VALUES ($1::uuid, $2, $3, $4, true, now(), now())`,
        id, c.name, c.description ?? null, 'OPERATING',
      );
      cats.push({ id, name: c.name });
    }
  }

  // 60 expenses spread across the 3-month window
  const statuses: Array<'DRAFT' | 'APPROVED' | 'REJECTED' | 'REIMBURSED'> = [];
  const n60 = 60;
  for (let i = 0; i < n60; i++) {
    const r = rand();
    if (r < 0.10) statuses.push('DRAFT');
    else if (r < 0.20) statuses.push('REJECTED');
    else if (r < 0.40) statuses.push('REIMBURSED');
    else statuses.push('APPROVED');
  }

  let created = 0;
  for (let i = 0; i < n60; i++) {
    const cat = pick(cats);
    const descOptions = EXPENSE_DESCRIPTIONS[cat.name] ?? [cat.name];
    const dayOffset = randInt(0, 92);
    const expDate = new Date(DATA_START_DATE.getTime() + dayOffset * 86400 * 1000);
    const amount = randInt(500_000, 30_000_000);
    const status = statuses[i];
    // Insert via raw SQL to bypass the missing PG ENUM type for ExpenseStatus.
    const id = crypto.randomUUID();
    const code = `EXP-${pad(i + 1, 5)}`;
    const description = pick(descOptions);
    const dateStr = expDate.toISOString().slice(0, 10);
    const notesVal = rand() < 0.2 ? pick(['Đã báo cáo BGĐ', 'Cần duyệt lại']) : null;
    const receiptVal = rand() < 0.4 ? `https://storage.example.com/receipts/${code}.pdf` : null;
    await prisma.$executeRawUnsafe(
      `INSERT INTO expenses (id, code, amount, description, expense_date, status, category_id, notes, receipt_url, created_by, updated_by, created_at, updated_at, version)
       VALUES (gen_random_uuid(), $1, $2, $3, $4::date, $5, $6::uuid, $7, $8, $9::uuid, $10::uuid, now(), now(), 1)`,
      code, amount, description, dateStr, status, cat.id, notesVal, receiptVal, admin.id, admin.id,
    );
    created++;
  }
  console.log(`  ✓ ${cats.length} categories + ${created} expenses created`);
}

// ======================================================================
// Phase 12: Audit logs — 200 random events distributed over the window
// ======================================================================

const AUDIT_ACTIONS = [
  'auth.login.success',
  'auth.login.failed',
  'patient.created',
  'patient.updated',
  'appointment.created',
  'appointment.updated',
  'encounter.started',
  'encounter.closed',
  'invoice.issued',
  'invoice.paid',
  'payment.recorded',
  'prescription.created',
  'inventory.stock_in',
  'inventory.stock_out',
  'payroll.period.created',
  'payroll.period.approved',
  'expense.created',
  'expense.approved',
  'user.created',
  'user.deactivated',
  'role.permission.granted',
];

const AUDIT_TARGETS: Array<{ type: string; table: string }> = [
  { type: 'patient',     table: 'patients' },
  { type: 'appointment', table: 'appointments' },
  { type: 'encounter',    table: 'encounters' },
  { type: 'invoice',      table: 'invoices' },
  { type: 'payment',      table: 'payments' },
  { type: 'inventory',    table: 'inventory_items' },
  { type: 'payroll',      table: 'payroll_periods' },
  { type: 'expense',      table: 'expenses' },
  { type: 'user',         table: 'users' },
];

async function seedAuditLogs(
  admin: { id: string; email: string },
  dentists: Array<{ id: string; email: string }>,
  receptionists: Array<{ id: string; email: string }>,
  totalEncountersCreated: number,
): Promise<void> {
  console.log('\nSeeding audit logs…');
  const existing = await prisma.auditLog.count();
  if (existing > 200) {
    console.log(`  ✓ Already have ${existing} log entries, skipping.`);
    return;
  }
  if (existing > 0) {
    await prisma.auditLog.deleteMany({});
  }

  const allActors = [admin, ...dentists, ...receptionists];
  const total = 200;
  const opsDays = getOperatingDays(DATA_START_DATE, DATA_END_DATE);
  const samples = Array.from({ length: total }, () => {
    const action = pick(AUDIT_ACTIONS);
    const actor = pick(allActors);
    const target = rand() < 0.85 ? pick(AUDIT_TARGETS) : null;
    const day = pick(opsDays);
    const hour = randInt(7, 19);
    const minute = randInt(0, 59);
    const occurredAt = new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate(), hour, minute));
    return { action, actor, target, occurredAt };
  });

  // Group by (actor, day) — used as upsert key (no unique constraint, so just createMany in chunks)
  await prisma.auditLog.createMany({
    data: samples.map((s) => ({
      actorUserId: s.actor.id,
      actorEmailAtTime: s.actor.email,
      action: s.action,
      targetType: s.target?.type ?? null,
      targetId: null,
      metadata: s.target ? ({ module: s.target.table } as Prisma.InputJsonValue) : Prisma.JsonNull,
      ipAddress: `192.168.1.${randInt(1, 250)}`,
      userAgent: 'Mozilla/5.0 (Dental-Clinic-Seed)',
      occurredAt: s.occurredAt,
    })),
  });
  console.log(`  ✓ ${total} audit log entries created`);
}

main()
  .catch((e) => {
    console.error('Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
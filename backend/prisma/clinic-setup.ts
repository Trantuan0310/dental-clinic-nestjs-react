/**
 * Opening-day configuration for a real clinic (safe on production data).
 *
 * Adds only what is missing and never changes a row an admin may have edited:
 *   1. staff accounts from a roster file (CLINIC_STAFF_FILE), with their
 *      employee records, dentist profiles and specialties;
 *   2. the service catalogue (clinic-setup/catalog.ts), by code;
 *   3. dentist ↔ service assignments, for dentists that have none yet;
 *   4. working hours Mon–Sat 08:00–12:00 and 13:30–19:00, for dentists that
 *      have no schedule yet (RESET_SCHEDULES=1 replaces existing ones);
 *   5. inventory categories and items (stock 0), by name / SKU;
 *   6. expense categories, by name.
 * No patients, appointments or invoices are created. Running it again is a
 * no-op apart from rows that are still missing.
 *
 * RESET_PASSWORDS=a@x,b@y gives those accounts a new temporary password (for a
 * lost one; there is no admin reset screen) and ends their open sessions.
 *
 *   CLINIC_STAFF_FILE=staff.json npx ts-node --transpile-only prisma/clinic-setup.ts
 */
import { PrismaClient, Prisma } from '@prisma/client';
import * as argon2 from 'argon2';
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { backfillStaffRecords } from './staff-backfill';
import { SERVICE_CATEGORIES, SERVICES, type Specialty } from './clinic-setup/catalog';
import { EXPENSE_CATEGORIES, INVENTORY_CATEGORIES, INVENTORY_ITEMS } from './clinic-setup/supplies';

const prisma = new PrismaClient();

const SPECIALTIES: readonly Specialty[] = [
  'TONG_QUAT',
  'NHA_CHU',
  'NOI_NHA',
  'CHINH_NHA',
  'NHO_RANG',
  'PHUC_HINH',
  'IMPLANT',
  'NHA_TRE_EM',
  'THAM_MY',
];
const ROLES = ['dentist', 'receptionist', 'clinic_admin'] as const;
// Mon–Sat (0 = Sunday), clinic wall-clock time.
const WORK_DAYS = [1, 2, 3, 4, 5, 6];
const SHIFTS = [
  { start: [8, 0], end: [12, 0], shiftType: 'MORNING' as const },
  { start: [13, 30], end: [19, 0], shiftType: 'AFTERNOON' as const },
];
const SLOT_MINUTES = 15;
// Same parameters as UsersService, so these hashes verify at login.
const ARGON2 = {
  type: argon2.argon2id,
  memoryCost: 65536,
  timeCost: 3,
  parallelism: 4,
  hashLength: 32,
  saltLength: 16,
};

interface StaffEntry {
  role: (typeof ROLES)[number];
  fullName: string;
  email: string;
  phone?: string;
  licenseNumber?: string;
  specialties?: Specialty[];
  calendarColor?: string;
}

const clinicToday = () => new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);
const pgTime = ([h, m]: number[]) => new Date(Date.UTC(1970, 0, 1, h, m));
const tempPassword = () => randomBytes(9).toString('base64url');

function readRoster(): StaffEntry[] {
  const path = process.env.CLINIC_STAFF_FILE;
  if (!path) {
    console.log('• Nhân viên: không có CLINIC_STAFF_FILE, bỏ qua bước tạo tài khoản.');
    return [];
  }
  const parsed = JSON.parse(readFileSync(path, 'utf8')) as { staff?: unknown };
  if (!Array.isArray(parsed.staff)) throw new Error(`${path}: thiếu mảng "staff"`);
  const problems: string[] = [];
  const entries = (parsed.staff as StaffEntry[]).filter((s, i) => {
    const where = `staff[${i}] (${s?.email ?? '?'})`;
    if (!ROLES.includes(s.role)) problems.push(`${where}: role không hợp lệ`);
    if (!s.fullName?.trim()) problems.push(`${where}: thiếu fullName`);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.email ?? ''))
      problems.push(`${where}: email không hợp lệ`);
    for (const sp of s.specialties ?? [])
      if (!SPECIALTIES.includes(sp)) problems.push(`${where}: chuyên môn "${sp}" không hợp lệ`);
    if (s.calendarColor && !/^#[0-9A-Fa-f]{6}$/.test(s.calendarColor))
      problems.push(`${where}: calendarColor phải dạng #RRGGBB`);
    if (s.email?.toLowerCase().endsWith('@example.com')) {
      console.log(`  – bỏ qua ${s.email} (email mẫu, hãy sửa thành email thật)`);
      return false;
    }
    return true;
  });
  if (problems.length) throw new Error(`File nhân viên có lỗi:\n  ${problems.join('\n  ')}`);
  return entries;
}

async function seedStaff(roster: StaffEntry[]) {
  const created: Array<{ entry: StaffEntry; password: string }> = [];
  const roleIds = new Map(
    (await prisma.role.findMany({ where: { code: { in: [...ROLES] } } })).map(r => [r.code, r.id]),
  );
  for (const entry of roster) {
    const email = entry.email.trim().toLowerCase();
    const existing = await prisma.user.findFirst({ where: { email, deletedAt: null } });
    if (existing) {
      console.log(`  – ${email}: đã có tài khoản, giữ nguyên`);
      continue;
    }
    const password = tempPassword();
    await prisma.user.create({
      data: {
        email,
        fullName: entry.fullName.trim(),
        passwordHash: await argon2.hash(password, ARGON2),
        status: 'ACTIVE',
        userRoles: { create: { roleId: roleIds.get(entry.role)! } },
      },
    });
    created.push({ entry: { ...entry, email }, password });
  }
  // Employee records + dentist profiles, exactly as migration 019 builds them.
  await backfillStaffRecords(prisma);

  for (const entry of roster) {
    const user = await prisma.user.findFirst({
      where: { email: entry.email.trim().toLowerCase(), deletedAt: null },
      include: { dentistProfile: true },
    });
    if (!user) continue;
    if (entry.phone)
      await prisma.employee.updateMany({
        where: { userId: user.id, deletedAt: null, phone: null },
        data: { phone: entry.phone },
      });
    const profile = user.dentistProfile;
    if (entry.role !== 'dentist' || !profile || profile.specialties.length > 0) continue;
    await prisma.dentistProfile.update({
      where: { id: profile.id },
      data: {
        specialties: entry.specialties ?? [],
        acceptsOnlineBooking: true,
        ...(entry.calendarColor ? { calendarColor: entry.calendarColor } : {}),
        ...(entry.licenseNumber && !profile.licenseNumber
          ? { licenseNumber: entry.licenseNumber }
          : {}),
      },
    });
  }
  console.log(`✓ Nhân viên: tạo ${created.length} tài khoản mới`);
  return created;
}

async function seedCatalog() {
  let categories = 0;
  let services = 0;
  for (const c of SERVICE_CATEGORIES) {
    const found = await prisma.serviceCategory.findUnique({ where: { code: c.code } });
    if (!found) {
      await prisma.serviceCategory.create({ data: c });
      categories++;
    }
  }
  const categoryIds = new Map(
    (await prisma.serviceCategory.findMany()).map(c => [c.code, c.id] as const),
  );
  for (const s of SERVICES) {
    if (await prisma.service.findUnique({ where: { code: s.code } })) continue;
    await prisma.service.create({
      data: {
        code: s.code,
        categoryId: categoryIds.get(s.category)!,
        name: s.name,
        defaultDurationMin: s.minutes,
        bufferBeforeMin: s.before,
        bufferAfterMin: s.after,
        basePrice: s.price,
        requiredSpecialty: s.specialty,
      },
    });
    services++;
  }
  console.log(`✓ Dịch vụ: thêm ${categories} nhóm, ${services} dịch vụ`);
}

/** Active dentists with an active profile (the ones the booking screens list). */
async function activeDentists() {
  return prisma.user.findMany({
    where: {
      status: 'ACTIVE',
      deletedAt: null,
      userRoles: { some: { role: { code: 'dentist' } } },
      dentistProfile: { is: { practiceStatus: 'ACTIVE', deletedAt: null } },
    },
    include: { dentistProfile: true },
    orderBy: { fullName: 'asc' },
  });
}

async function seedAssignments() {
  const today = new Date(clinicToday());
  const services = await prisma.service.findMany({ where: { isActive: true } });
  let dentists = 0;
  let rows = 0;
  for (const d of await activeDentists()) {
    const open = await prisma.dentistService.count({
      where: { dentistId: d.id, effectiveTo: null },
    });
    if (open > 0) continue;
    const specialties = d.dentistProfile?.specialties ?? [];
    const data: Prisma.DentistServiceCreateManyInput[] = services
      .filter(s => !s.requiredSpecialty || specialties.includes(s.requiredSpecialty))
      .map(s => ({ dentistId: d.id, serviceId: s.id, effectiveFrom: today }));
    await prisma.dentistService.createMany({ data });
    dentists++;
    rows += data.length;
    console.log(
      `  – ${d.fullName}: ${data.length} dịch vụ (${specialties.join(', ') || 'chưa có chuyên môn'})`,
    );
  }
  console.log(`✓ Phân công dịch vụ: ${dentists} bác sĩ, ${rows} dòng`);
}

async function seedSchedules() {
  const reset = process.env.RESET_SCHEDULES === '1';
  const validFrom = new Date(clinicToday());
  let dentists = 0;
  for (const d of await activeDentists()) {
    const existing = await prisma.workingSchedule.count({
      where: { dentistId: d.id, deletedAt: null },
    });
    if (existing > 0 && !reset) continue;
    if (existing > 0)
      await prisma.workingSchedule.updateMany({
        where: { dentistId: d.id, deletedAt: null },
        data: { deletedAt: new Date() },
      });
    await prisma.workingSchedule.createMany({
      data: WORK_DAYS.flatMap(dayOfWeek =>
        SHIFTS.map(s => ({
          dentistId: d.id,
          dayOfWeek,
          startTime: pgTime(s.start),
          endTime: pgTime(s.end),
          slotDurationMin: SLOT_MINUTES,
          validFrom,
          shiftType: s.shiftType,
          isPaidShift: true,
        })),
      ),
    });
    dentists++;
  }
  console.log(
    `✓ Lịch làm việc T2–T7 08:00–12:00, 13:30–19:00: ${dentists} bác sĩ` +
      (reset ? ' (đã thay lịch cũ)' : ' (bác sĩ đã có lịch được giữ nguyên)'),
  );
}

async function seedInventory() {
  const categoryIds = new Map<string, string>();
  let categories = 0;
  for (const c of INVENTORY_CATEGORIES) {
    let row = await prisma.inventoryCategory.findFirst({
      where: { name: c.name, deletedAt: null },
    });
    if (!row) {
      row = await prisma.inventoryCategory.create({
        data: { name: c.name, description: c.description },
      });
      categories++;
    }
    categoryIds.set(c.key, row.id);
  }
  let items = 0;
  for (const [sku, key, name, unit, minStock, cost] of INVENTORY_ITEMS) {
    if (await prisma.inventoryItem.findUnique({ where: { sku } })) continue;
    await prisma.inventoryItem.create({
      data: {
        sku,
        name,
        unit,
        categoryId: categoryIds.get(key)!,
        minStockLevel: minStock,
        costPrice: cost,
        quantityOnHand: 0,
      },
    });
    items++;
  }
  console.log(`✓ Kho: thêm ${categories} nhóm, ${items} vật tư/thuốc (tồn kho 0)`);
}

async function seedExpenseCategories() {
  let added = 0;
  for (const c of EXPENSE_CATEGORIES) {
    if (await prisma.expenseCategory.findUnique({ where: { name: c.name } })) continue;
    await prisma.expenseCategory.create({ data: c });
    added++;
  }
  console.log(`✓ Danh mục chi phí: thêm ${added}`);
}

/** RESET_PASSWORDS=a@x,b@y: a lost temporary password is replaced by a new one. */
async function resetPasswords(): Promise<Array<{ email: string; password: string }>> {
  const emails = (process.env.RESET_PASSWORDS ?? '')
    .split(',')
    .map(e => e.trim().toLowerCase())
    .filter(Boolean);
  const out: Array<{ email: string; password: string }> = [];
  for (const email of emails) {
    const user = await prisma.user.findFirst({ where: { email, deletedAt: null } });
    if (!user) {
      console.log(`  – ${email}: không có tài khoản, bỏ qua`);
      continue;
    }
    const password = tempPassword();
    await prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash: await argon2.hash(password, ARGON2),
        failedLoginAttempts: 0,
        lockedUntil: null,
      },
    });
    // Sessions opened with the old password end now.
    await prisma.refreshToken.updateMany({
      where: { userId: user.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    out.push({ email, password });
  }
  return out;
}

async function main() {
  console.log('Cấu hình ban đầu phòng khám\n');
  const roster = readRoster();
  const created = await seedStaff(roster);
  await seedCatalog();
  await seedAssignments();
  await seedSchedules();
  await seedInventory();
  await seedExpenseCategories();

  const credentials = [
    ...created.map(c => ({ label: c.entry.role, email: c.entry.email, password: c.password })),
    ...(await resetPasswords()).map(r => ({ label: 'cấp lại', ...r })),
  ];

  if (credentials.length) {
    console.log('\nMật khẩu tạm — chỉ hiện MỘT LẦN, gửi riêng từng người, đăng nhập rồi đổi ngay:');
    for (const c of credentials)
      console.log(`  ${c.label.padEnd(13)} ${c.email.padEnd(34)} ${c.password}`);
  }
  console.log('\nXong.');
}

main()
  .catch(error => {
    console.error(`\nLỗi: ${error.message}`);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

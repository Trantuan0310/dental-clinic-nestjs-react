import type { PrismaClient } from '@prisma/client';

/**
 * Demo service catalogue (ADR-0009 phase 2). Idempotent: categories and
 * services are upserted by code; each demo dentist gets its specialties and
 * open-ended assignments only where none exist yet.
 */
const CATEGORIES = [
  { code: 'KHAM', name: 'Khám & tư vấn', sortOrder: 10 },
  { code: 'DU_PHONG', name: 'Dự phòng', sortOrder: 20 },
  { code: 'DIEU_TRI', name: 'Điều trị', sortOrder: 30 },
  { code: 'PHAU_THUAT', name: 'Phẫu thuật', sortOrder: 40 },
  { code: 'PHUC_HINH', name: 'Phục hình', sortOrder: 50 },
  { code: 'CHINH_NHA', name: 'Chỉnh nha', sortOrder: 60 },
];

// [code, category, name, minutes, bufferBefore, bufferAfter, price, requiredSpecialty]
type Row = [string, string, string, number, number, number, number, string | null];
const SERVICES: Row[] = [
  ['KHAM_TQ', 'KHAM', 'Khám tổng quát & tư vấn', 15, 0, 5, 0, null],
  ['CHUP_XQ', 'KHAM', 'Chụp X-quang quanh chóp', 10, 0, 0, 100_000, null],
  ['CAO_VOI', 'DU_PHONG', 'Cạo vôi + đánh bóng', 30, 0, 10, 450_000, null],
  ['TRAM_COMPOSITE', 'DIEU_TRI', 'Trám răng composite', 30, 0, 10, 650_000, null],
  ['DIEU_TRI_TUY', 'DIEU_TRI', 'Điều trị tủy (1 lần hẹn)', 60, 0, 10, 1_500_000, 'NOI_NHA'],
  ['NHO_RANG', 'PHAU_THUAT', 'Nhổ răng (không biến chứng)', 30, 5, 15, 600_000, null],
  ['NHO_RANG_KHON', 'PHAU_THUAT', 'Nhổ răng khôn', 60, 10, 20, 2_500_000, 'NHO_RANG'],
  ['BOC_SU', 'PHUC_HINH', 'Bọc răng sứ', 60, 0, 10, 4_200_000, 'PHUC_HINH'],
  ['IMPLANT', 'PHAU_THUAT', 'Cấy ghép Implant', 90, 15, 30, 8_900_000, 'IMPLANT'],
  [
    'NIENG_TAI_KHAM',
    'CHINH_NHA',
    'Niềng răng — tái khám siết dây',
    30,
    0,
    10,
    1_800_000,
    'CHINH_NHA',
  ],
];

// Demo dentists: specialties and the services they perform.
const DENTISTS: Record<string, { specialties: string[]; services: string[] }> = {
  'an.nguyen@clinic.local': {
    specialties: ['TONG_QUAT', 'NOI_NHA'],
    services: ['KHAM_TQ', 'CHUP_XQ', 'CAO_VOI', 'TRAM_COMPOSITE', 'DIEU_TRI_TUY', 'NHO_RANG'],
  },
  'binh.tran@clinic.local': {
    specialties: ['TONG_QUAT', 'NHO_RANG', 'IMPLANT'],
    services: ['KHAM_TQ', 'CHUP_XQ', 'NHO_RANG', 'NHO_RANG_KHON', 'IMPLANT'],
  },
  'cuong.le@clinic.local': {
    specialties: ['PHUC_HINH', 'THAM_MY'],
    services: ['KHAM_TQ', 'TRAM_COMPOSITE', 'BOC_SU'],
  },
  'dung.pham@clinic.local': {
    specialties: ['CHINH_NHA', 'NHA_TRE_EM'],
    services: ['KHAM_TQ', 'CAO_VOI', 'NIENG_TAI_KHAM'],
  },
};

export async function seedServiceCatalog(prisma: PrismaClient): Promise<void> {
  const categoryIds: Record<string, string> = {};
  for (const c of CATEGORIES) {
    const row = await prisma.serviceCategory.upsert({
      where: { code: c.code },
      update: {},
      create: c,
    });
    categoryIds[c.code] = row.id;
  }
  const serviceIds: Record<string, string> = {};
  for (const [code, category, name, minutes, before, after, price, specialty] of SERVICES) {
    const row = await prisma.service.upsert({
      where: { code },
      update: {},
      create: {
        code,
        categoryId: categoryIds[category],
        name,
        defaultDurationMin: minutes,
        bufferBeforeMin: before,
        bufferAfterMin: after,
        basePrice: price,
        requiredSpecialty: specialty,
      },
    });
    serviceIds[code] = row.id;
  }
  const start = new Date('2026-01-01T00:00:00Z');
  for (const [email, plan] of Object.entries(DENTISTS)) {
    const user = await prisma.user.findFirst({ where: { email, deletedAt: null } });
    if (!user) continue;
    const profile = await prisma.dentistProfile.findUnique({ where: { userId: user.id } });
    if (!profile) continue;
    if (profile.specialties.length === 0) {
      await prisma.dentistProfile.update({
        where: { id: profile.id },
        data: { specialties: plan.specialties },
      });
    }
    for (const code of plan.services) {
      const existing = await prisma.dentistService.findFirst({
        where: { dentistId: user.id, serviceId: serviceIds[code] },
      });
      if (existing) continue;
      await prisma.dentistService.create({
        data: { dentistId: user.id, serviceId: serviceIds[code], effectiveFrom: start },
      });
    }
  }
  console.log(
    `  ✓ ${SERVICES.length} services in ${CATEGORIES.length} categories, assigned to demo dentists`,
  );
}

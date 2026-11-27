/**
 * Public profiles and patient reviews for the demo dentists, so the online
 * booking page has something to show: title, position, year practice began,
 * training, career, awards, and reviews on part of the demo visits of the last
 * 90 days. Only empty profile fields are filled, only demo patients' visits
 * (DEMO_PATIENT_NOTE) get reviews, and a visit already reviewed is skipped:
 * safe to run again.
 *
 *   from backend: npx ts-node --transpile-only prisma/seed-demo-profiles.ts
 *   on the VPS:   bash scripts/demo-profiles-vps.sh
 */
import { PrismaClient } from '@prisma/client';
import { DEMO_PATIENT_NOTE, DEMO_SUMMARY } from './seed-demo-charts';

const PROFILES = [
  {
    title: 'ThS. BS',
    position: 'Giám đốc chuyên môn',
    specialties: ['TONG_QUAT', 'PHUC_HINH', 'IMPLANT'],
    practiceSince: 2009,
    education: [
      'Thạc sĩ Răng Hàm Mặt, Đại học Y Dược TP.HCM (2015)',
      'Bác sĩ Răng Hàm Mặt, Đại học Y Hà Nội (2009)',
      'Chứng chỉ Implant nha khoa, Đại học Yonsei, Hàn Quốc (2017)',
    ],
    experience: [
      '2019 – nay: Giám đốc chuyên môn, Nha khoa GenSmile',
      '2013 – 2019: Bác sĩ điều trị, Khoa Phục hình, Bệnh viện Răng Hàm Mặt Trung ương',
      '2009 – 2013: Bác sĩ nội trú, Bệnh viện Răng Hàm Mặt TP.HCM',
    ],
    awards: ['Hội viên Hội Răng Hàm Mặt Việt Nam', 'Báo cáo viên Hội nghị Implant toàn quốc 2023'],
    bio: 'Hơn 15 năm điều trị phục hình và cấy ghép Implant; chú trọng giải thích kỹ phương án và chi phí trước khi điều trị.',
  },
  {
    title: 'BS. CKI',
    position: 'Trưởng nhóm Nội nha',
    specialties: ['TONG_QUAT', 'NOI_NHA', 'THAM_MY'],
    practiceSince: 2014,
    education: [
      'Bác sĩ Chuyên khoa I Răng Hàm Mặt, Đại học Y Dược Huế (2019)',
      'Bác sĩ Răng Hàm Mặt, Đại học Y Dược Huế (2014)',
      'Khóa nội nha vi phẫu, Hội Nội nha Việt Nam (2021)',
    ],
    experience: [
      '2020 – nay: Bác sĩ điều trị tủy và nha khoa tổng quát, Nha khoa GenSmile',
      '2014 – 2020: Bác sĩ điều trị, Phòng khám Răng Hàm Mặt, Bệnh viện Trung ương Huế',
    ],
    awards: ['Chứng nhận nội nha vi phẫu (2021)'],
    bio: 'Điều trị tủy, trám răng thẩm mỹ, điều trị ê buốt; khám nhẹ nhàng, phù hợp người sợ đau.',
  },
  {
    title: 'BS',
    position: 'Bác sĩ Chỉnh nha',
    specialties: ['CHINH_NHA', 'TONG_QUAT'],
    practiceSince: 2016,
    education: [
      'Bác sĩ Răng Hàm Mặt, Đại học Y Hà Nội (2016)',
      'Chứng chỉ Chỉnh nha khay trong suốt (2020)',
      'Định hướng Chỉnh nha, Bệnh viện Răng Hàm Mặt Trung ương (2018)',
    ],
    experience: [
      '2021 – nay: Bác sĩ chỉnh nha, Nha khoa GenSmile',
      '2016 – 2021: Bác sĩ điều trị, Trung tâm Chỉnh nha Hà Nội',
    ],
    awards: ['Hơn 300 ca chỉnh nha hoàn tất'],
    bio: 'Chỉnh nha mắc cài và khay trong suốt cho trẻ em và người lớn; theo dõi sát tiến độ từng tháng.',
  },
  {
    title: 'BS',
    position: 'Bác sĩ Nha khoa trẻ em',
    specialties: ['NHA_TRE_EM', 'TONG_QUAT', 'NHA_CHU'],
    practiceSince: 2018,
    education: [
      'Bác sĩ Răng Hàm Mặt, Đại học Y Dược Cần Thơ (2018)',
      'Khóa Nha khoa trẻ em, Hội Nha khoa trẻ em Việt Nam (2022)',
    ],
    experience: [
      '2022 – nay: Bác sĩ nha khoa trẻ em và tổng quát, Nha khoa GenSmile',
      '2018 – 2022: Bác sĩ điều trị, Phòng khám Nha khoa Thành phố Cần Thơ',
    ],
    awards: [],
    bio: 'Khám và điều trị răng sữa, dự phòng sâu răng cho trẻ; tạo cảm giác an tâm cho bé ngay lần đầu.',
  },
];

const COMMENTS: Record<number, string[]> = {
  5: [
    'Bác sĩ giải thích rất kỹ, làm nhẹ tay, không đau chút nào.',
    'Phòng khám sạch sẽ, đúng giờ hẹn, bác sĩ tận tâm.',
    'Trám răng xong ăn uống bình thường, rất hài lòng.',
    'Bác sĩ tư vấn chi phí rõ ràng trước khi làm, không phát sinh.',
    'Bé nhà mình rất sợ nha sĩ nhưng bác sĩ dỗ khéo, bé hợp tác tốt.',
    '',
  ],
  4: [
    'Bác sĩ làm tốt, chỉ phải chờ khoảng 15 phút.',
    'Điều trị ổn, lễ tân nhắc lịch chu đáo.',
    'Khám kỹ, giá hợp lý. Sẽ quay lại.',
    '',
  ],
  3: ['Điều trị ổn nhưng hôm đó phải chờ khá lâu.', 'Bình thường, mong phòng khám thêm chỗ để xe.'],
};

/** Deterministic pseudo-random from a uuid, so a re-run picks the same visits. */
const hash = (id: string) => [...id].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);

export async function seedDemoProfiles(prisma: PrismaClient) {
  const profiles = await prisma.dentistProfile.findMany({
    where: { deletedAt: null },
    orderBy: { createdAt: 'asc' },
  });
  let filled = 0;
  for (const [i, profile] of profiles.entries()) {
    const p = PROFILES[i % PROFILES.length];
    const data: Record<string, string | number> = {};
    if (!profile.title) data.title = p.title;
    if (!profile.position) data.position = p.position;
    if (!profile.practiceSince) data.practiceSince = p.practiceSince;
    if (!profile.education) data.education = p.education.join('\n');
    if (!profile.experience) data.experience = p.experience.join('\n');
    if (!profile.awards && p.awards.length) data.awards = p.awards.join('\n');
    if (!profile.bio) data.bio = p.bio;
    const specialties = profile.specialties.length ? undefined : p.specialties;
    if (Object.keys(data).length || specialties) {
      await prisma.dentistProfile.update({
        where: { id: profile.id },
        data: { ...data, ...(specialties ? { specialties } : {}) },
      });
      filled++;
    }
  }

  const since = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
  const visits = await prisma.encounter.findMany({
    where: {
      status: 'COMPLETED',
      summary: DEMO_SUMMARY,
      closedAt: { gte: since },
      patient: { notes: DEMO_PATIENT_NOTE },
      dentistReview: null,
    },
    select: { id: true, dentistId: true, patientId: true, closedAt: true },
  });
  let reviews = 0;
  for (const v of visits) {
    const h = hash(v.id);
    if (h % 100 >= 30) continue; // about 3 visits in 10 get a review
    const roll = (h >> 8) % 100;
    const rating = roll < 68 ? 5 : roll < 92 ? 4 : 3;
    const options = COMMENTS[rating];
    const comment = options[(h >> 16) % options.length] || null;
    await prisma.dentistReview.create({
      data: {
        dentistId: v.dentistId,
        patientId: v.patientId,
        encounterId: v.id,
        rating,
        comment,
        // A day or two after the visit.
        createdAt: new Date(
          Math.min(Date.now(), (v.closedAt ?? new Date()).getTime() + (1 + (h % 2)) * 86_400_000),
        ),
      },
    });
    reviews++;
  }
  return { filled, reviews };
}

if (require.main === module) {
  const prisma = new PrismaClient();
  seedDemoProfiles(prisma)
    .then(r => console.log(`✓ ${r.filled} hồ sơ bác sĩ bổ sung, ${r.reviews} đánh giá mẫu`))
    .catch(e => {
      console.error(e);
      process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
}

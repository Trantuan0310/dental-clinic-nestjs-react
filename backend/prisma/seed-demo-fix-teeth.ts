/**
 * Repairs demo data seeded before demo-teeth.ts existed, where any patient got
 * any service on any tooth for any complaint (an adult with "root canal on a
 * baby tooth" on 36, a child with an implant, "lost a tooth" diagnosed as
 * "worn neck" and treated by gum surgery). Only demo patients
 * (DEMO_PATIENT_NOTE) are touched, and only the visits the seed made
 * (summary DEMO_SUMMARY): visits staff made on the demo site stay as they are.
 *
 * 1. A child with adult-only work becomes a young adult (19–22, same birthday).
 * 2. An adult's children's treatment becomes the adult one (ADULT_FOR); the
 *    price stays, the invoice line is renamed.
 * 3. Tooth numbers are redrawn to suit the service (teethFor).
 * 4. Reason for the visit and diagnosis follow the main service (clinicalFor);
 *    a penicillin-allergic patient's amoxicillin becomes clindamycin.
 * 5. The tooth charts the demo seed wrote are rebuilt (seedDemoCharts).
 *
 *   from backend: npx ts-node --transpile-only prisma/seed-demo-fix-teeth.ts
 *   on the VPS:   bash scripts/demo-teeth-vps.sh
 * Safe to run again.
 */
import { Prisma, PrismaClient } from '@prisma/client';
import {
  ADULT_FOR,
  childOnly,
  clinicalFor,
  fitsAge,
  isPenicillin,
  teethFor,
} from './demo-teeth';
import { DEMO_PATIENT_NOTE, DEMO_SUMMARY, seedDemoCharts } from './seed-demo-charts';

const pick = <T>(xs: readonly T[]): T => xs[Math.floor(Math.random() * xs.length)];
const YEAR_MS = 365.25 * 24 * 3600 * 1000;
const isChild = (dob: Date, at: Date) => at.getTime() - dob.getTime() < 16 * YEAR_MS;

export async function fixDemoTeeth(prisma: PrismaClient) {
  const services = await prisma.service.findMany();
  const byCode = new Map(services.map(s => [s.code, s]));
  const byId = new Map(services.map(s => [s.id, s]));
  const demo = { notes: DEMO_PATIENT_NOTE };
  const seededVisit = { patient: demo, summary: DEMO_SUMMARY };
  const out = { grownUp: 0, swapped: 0, teeth: 0, notes: 0, drugs: 0, charts: 0 };

  // 1. Children with adult work.
  const kids = await prisma.patient.findMany({
    where: { ...demo, dob: { gt: new Date(Date.now() - 16 * YEAR_MS) } },
    select: {
      id: true,
      dob: true,
      primaryPhone: true,
      contactPersonPhone: true,
      encounters: { select: { treatments: { select: { serviceId: true } } } },
    },
  });
  for (const k of kids) {
    const adultWork = k.encounters.some(e =>
      e.treatments.some(t => t.serviceId && !fitsAge(byId.get(t.serviceId)!, true)),
    );
    if (!adultWork) continue;
    const dob = new Date(k.dob);
    dob.setUTCFullYear(new Date().getUTCFullYear() - 19 - Math.floor(Math.random() * 4));
    await prisma.patient.update({
      where: { id: k.id },
      data: { dob, primaryPhone: k.primaryPhone ?? k.contactPersonPhone },
    });
    out.grownUp++;
  }

  // 2–3. Each treatment of a seeded visit.
  const treatments = await prisma.treatment.findMany({
    where: { encounter: seededVisit },
    select: {
      id: true,
      serviceId: true,
      toothNumbers: true,
      encounter: { select: { startedAt: true, patient: { select: { dob: true } } } },
    },
  });
  for (const t of treatments) {
    let svc = t.serviceId ? byId.get(t.serviceId) : undefined;
    if (!svc) continue;
    const child = isChild(t.encounter.patient.dob, t.encounter.startedAt ?? new Date());
    const data: Prisma.TreatmentUpdateInput = {};
    if (!child && childOnly(svc) && byCode.get(ADULT_FOR[svc.code])) {
      svc = byCode.get(ADULT_FOR[svc.code])!;
      data.service = { connect: { id: svc.id } };
      data.procedure = svc.name;
      await prisma.invoiceItem.updateMany({
        where: { treatmentId: t.id },
        data: { description: svc.name },
      });
      out.swapped++;
    }
    const had = Array.isArray(t.toothNumbers) && t.toothNumbers.length > 0;
    const teeth = teethFor(svc.code, child, pick);
    if (!teeth) data.toothNumbers = Prisma.JsonNull;
    else if (had || data.service) data.toothNumbers = teeth;
    if (Object.keys(data).length) {
      await prisma.treatment.update({ where: { id: t.id }, data });
      out.teeth++;
    }
  }

  // 4. Reason, diagnosis and drugs of each seeded visit.
  const visits = await prisma.encounter.findMany({
    where: seededVisit,
    select: {
      id: true,
      appointmentId: true,
      patient: { select: { allergies: true } },
      treatments: { orderBy: { sequence: 'asc' }, select: { serviceId: true, unitPrice: true } },
    },
  });
  for (const v of visits) {
    const main = v.treatments.find(t => Number(t.unitPrice) > 0) ?? v.treatments[0];
    const code = (main?.serviceId && byId.get(main.serviceId)?.code) || 'KHAM_TQ';
    const [chiefComplaint, diagnosis] = clinicalFor(code);
    await prisma.encounter.update({ where: { id: v.id }, data: { chiefComplaint, diagnosis } });
    await prisma.clinicalNote.updateMany({
      where: { encounterId: v.id },
      data: { chiefComplaint, diagnosis },
    });
    await prisma.prescription.updateMany({ where: { encounterId: v.id }, data: { diagnosis } });
    if (v.appointmentId) {
      await prisma.appointment.update({
        where: { id: v.appointmentId },
        data: { reason: chiefComplaint },
      });
    }
    out.notes++;
    if (!JSON.stringify(v.patient.allergies).toLowerCase().includes('penicillin')) continue;
    const lines = await prisma.prescriptionLine.findMany({
      where: { prescription: { encounterId: v.id } },
      select: { id: true, drugName: true },
    });
    for (const l of lines.filter(x => isPenicillin(x.drugName))) {
      await prisma.prescriptionLine.update({
        where: { id: l.id },
        data: { drugName: 'Clindamycin 300mg', dosage: '1 viên', frequency: '3 lần/ngày' },
      });
      out.drugs++;
    }
  }

  // 5. Charts the demo seed wrote (by the visit's dentist, when it closed).
  const charted = await prisma.encounter.findMany({
    where: { ...seededVisit, status: 'COMPLETED', dentalChart: { isNot: null } },
    select: {
      dentistId: true,
      closedAt: true,
      dentalChart: { select: { id: true, snapshotBy: true, snapshotAt: true } },
    },
  });
  const seeded = charted
    .filter(
      v =>
        v.dentalChart!.snapshotBy === v.dentistId &&
        v.dentalChart!.snapshotAt.getTime() === v.closedAt?.getTime(),
    )
    .map(v => v.dentalChart!.id);
  await prisma.dentalChartSnapshot.deleteMany({ where: { id: { in: seeded } } });
  out.charts = await seedDemoCharts(prisma);
  return out;
}

if (require.main === module) {
  const prisma = new PrismaClient();
  fixDemoTeeth(prisma)
    .then(o =>
      console.log(
        `✓ ${o.grownUp} bệnh nhân nhỏ tuổi có điều trị người lớn đổi thành 19–22 tuổi, ` +
          `${o.swapped} điều trị trẻ em của người lớn đổi sang dịch vụ người lớn, ` +
          `${o.teeth} điều trị sửa số răng, ${o.notes} lần khám sửa lý do/chẩn đoán, ` +
          `${o.drugs} thuốc nhóm Penicillin của người dị ứng đổi sang Clindamycin, ` +
          `${o.charts} sơ đồ răng dựng lại`,
      ),
    )
    .catch(e => {
      console.error(e);
      process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
}

/**
 * Dental chart snapshots for the demo visits, so the tooth chart shows colour
 * and each tooth has a history. For every demo patient, walks their closed
 * visits in order and marks the teeth treated so far by the kind of work
 * (filling, crown, implant, extraction); each visit gets the chart as it stood
 * after it. Only visits without a snapshot are written: safe to run again.
 *
 *   from backend: npx ts-node --transpile-only prisma/seed-demo-charts.ts
 *   on the VPS:   bash scripts/demo-charts-vps.sh
 */
import { Prisma, PrismaClient } from '@prisma/client';
import { isMinor } from '../src/patients/domain/patient-rules';

/** The summary seed-demo-clinic.ts writes on every visit it closes. */
export const DEMO_SUMMARY = 'Đã điều trị theo kế hoạch, hẹn tái khám nếu cần.';
/** The note seed-demo-clinic.ts puts on every demo patient. */
export const DEMO_PATIENT_NOTE = 'Dữ liệu mẫu (demo)';

type Status = 'filled' | 'crowned' | 'implant' | 'missing' | 'cavity';

/** What a procedure leaves the tooth as; null when it does not change it. */
export function statusAfter(procedure: string): Status | null {
  const p = procedure.toLowerCase();
  if (p.includes('implant')) return 'implant';
  if (p.includes('nhổ')) return 'missing';
  if (p.includes('bọc') || p.includes('mão') || p.includes('sứ') || p.includes('veneer'))
    return 'crowned';
  if (p.includes('hàn') || p.includes('trám') || p.includes('tủy') || p.includes('composite'))
    return 'filled';
  return null;
}

export async function seedDemoCharts(prisma: PrismaClient) {
  const visits = await prisma.encounter.findMany({
    where: { status: 'COMPLETED', patient: { notes: DEMO_PATIENT_NOTE } },
    orderBy: [{ patientId: 'asc' }, { startedAt: 'asc' }],
    select: {
      id: true,
      patientId: true,
      dentistId: true,
      closedAt: true,
      patient: { select: { dob: true } },
      dentalChart: { select: { teeth: true } },
      treatments: { where: { deletedAt: null }, select: { procedure: true, toothNumbers: true } },
    },
  });
  let written = 0;
  let chart: Record<string, { status: string; notes: string }> = {};
  let current = '';
  for (const v of visits) {
    if (v.patientId !== current) {
      current = v.patientId;
      chart = {};
    }
    if (v.dentalChart) {
      // A chart already there (a dentist's own) is the truth from here on.
      chart = { ...(v.dentalChart.teeth as typeof chart) };
      continue;
    }
    for (const t of v.treatments) {
      const status = statusAfter(t.procedure);
      const teeth = Array.isArray(t.toothNumbers) ? (t.toothNumbers as unknown[]) : [];
      if (!status) continue;
      for (const n of teeth) chart[String(n)] = { status, notes: t.procedure };
    }
    if (Object.keys(chart).length === 0) continue;
    await prisma.dentalChartSnapshot.create({
      data: {
        encounterId: v.id,
        patientType: isMinor(v.patient.dob, v.closedAt ?? new Date()) ? 'CHILD' : 'ADULT',
        teeth: { ...chart } as unknown as Prisma.InputJsonValue,
        snapshotAt: v.closedAt ?? new Date(),
        snapshotBy: v.dentistId,
      },
    });
    written++;
  }
  return written;
}

if (require.main === module) {
  const prisma = new PrismaClient();
  seedDemoCharts(prisma)
    .then(n => console.log(`✓ ${n} sơ đồ răng mẫu`))
    .catch(e => {
      console.error(e);
      process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
}

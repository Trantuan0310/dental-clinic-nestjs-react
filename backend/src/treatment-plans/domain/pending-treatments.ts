/**
 * Accepted treatment that has no appointment yet (docs/11_Improvement A7):
 * the patient agreed to a plan, lines are still to do, and nothing is
 * booked for them. Pure grouping of the open lines; the service loads them.
 */

export interface OpenLine {
  procedure: string;
  quantity: number;
  unitPrice: number;
  plan: {
    id: string;
    title: string;
    dentistId: string;
    dentistName: string | null;
    acceptedAt: Date | null;
    createdAt: Date;
    patient: { id: string; code: string; fullName: string; primaryPhone: string | null };
  };
}

export interface PendingTreatment {
  patientId: string;
  patientCode: string;
  patientName: string;
  phone: string | null;
  /** The dentist of the plan that has waited longest: who the next visit is usually with. */
  dentistId: string;
  dentistName: string | null;
  planTitles: string[];
  /** The first few procedures, for a glance; `lineCount` is the whole. */
  procedures: string[];
  lineCount: number;
  /** Quoted price of every open line (quantity × unit price). */
  value: number;
  /** When the oldest of these plans was accepted. */
  acceptedAt: string;
  waitingDays: number;
  /** The patient's next live appointment, or null when nothing is booked. */
  nextAppointmentAt: string | null;
}

const DAY_MS = 24 * 60 * 60_000;
const GLANCE = 3;

export function groupPendingTreatments(
  lines: OpenLine[],
  nextAppointmentByPatient: Map<string, Date>,
  now: Date,
): PendingTreatment[] {
  const byPatient = new Map<string, OpenLine[]>();
  for (const line of lines) {
    const list = byPatient.get(line.plan.patient.id) ?? [];
    list.push(line);
    byPatient.set(line.plan.patient.id, list);
  }
  const rows: PendingTreatment[] = [];
  for (const [patientId, own] of byPatient) {
    const since = (l: OpenLine) => (l.plan.acceptedAt ?? l.plan.createdAt).getTime();
    const oldest = own.reduce((a, b) => (since(b) < since(a) ? b : a));
    const next = nextAppointmentByPatient.get(patientId) ?? null;
    rows.push({
      patientId,
      patientCode: oldest.plan.patient.code,
      patientName: oldest.plan.patient.fullName,
      phone: oldest.plan.patient.primaryPhone,
      dentistId: oldest.plan.dentistId,
      dentistName: oldest.plan.dentistName,
      planTitles: [...new Set(own.map(l => l.plan.title))],
      procedures: [...new Set(own.map(l => l.procedure))].slice(0, GLANCE),
      lineCount: own.length,
      value: own.reduce((sum, l) => sum + l.quantity * l.unitPrice, 0),
      acceptedAt: new Date(since(oldest)).toISOString(),
      waitingDays: Math.max(0, Math.floor((now.getTime() - since(oldest)) / DAY_MS)),
      nextAppointmentAt: next ? next.toISOString() : null,
    });
  }
  // Nothing booked first, the longest wait first within each group.
  return rows.sort(
    (a, b) =>
      Number(a.nextAppointmentAt !== null) - Number(b.nextAppointmentAt !== null) ||
      b.waitingDays - a.waitingDays ||
      b.value - a.value,
  );
}

export function summarizePending(rows: PendingTreatment[]) {
  const unbooked = rows.filter(r => r.nextAppointmentAt === null);
  return {
    patients: rows.length,
    unscheduledPatients: unbooked.length,
    unscheduledValue: unbooked.reduce((sum, r) => sum + r.value, 0),
  };
}

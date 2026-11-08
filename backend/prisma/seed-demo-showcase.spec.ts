import { Prisma } from '@prisma/client';
import { seedShowcase } from './seed-demo-showcase';

const now = new Date('2026-11-04T03:08:00Z'); // Wednesday, 10:08 in the clinic

function demoDb() {
  type Row = Record<string, any>;
  function table() {
    const rows = new Map<string, Row>();
    function create({ data }: Row) {
      if (rows.has(data.id)) throw new Error('duplicate ' + data.id);
      rows.set(data.id, data);
      return data;
    }
    function upsert({ where, create: data, update }: Row) {
      const key = where.id ?? where.appointmentId;
      const row = rows.get(key);
      if (row) return Object.assign(row, update);
      return create({ data: { id: key, ...data } });
    }
    return {
      rows,
      create,
      upsert,
      update: ({ where, data }: Row) => Object.assign(rows.get(where.id)!, data),
      findUnique: ({ where }: Row) => rows.get(where.id),
    };
  }
  const dentists = [{ id: 'a' }, { id: 'b' }];
  const empty = { findMany: () => [] };
  const appointments = table();
  const payments = table();
  const invoices = table();
  let sequence = 0;
  return {
    user: { findMany: () => dentists },
    patient: { ...table(), findFirst: jest.fn(() => ({ id: 'demo' }) as Row | null) },
    treatmentPlan: table(),
    encounter: table(),
    payment: payments,
    invoice: {
      ...invoices,
      create: ({ data }: Row) => {
        if (data.payments) payments.create({ data: data.payments.create });
        return invoices.create({ data });
      },
    },
    appointment: {
      ...appointments,
      findMany: () =>
        [...appointments.rows.values()].filter(
          a => !a.deletedAt && !['NO_SHOW', 'CANCELLED'].includes(a.status),
        ),
      updateMany: ({ where, data }: Row) =>
        where.id.in.forEach((key: string) => {
          const row = appointments.rows.get(key);
          if (row && !row.deletedAt) Object.assign(row, data);
        }),
    },
    workingSchedule: {
      findMany: () =>
        dentists.flatMap(d =>
          Array.from({ length: 6 }, (_, i) => ({
            dentistId: d.id,
            dayOfWeek: i + 1,
            validFrom: new Date('2025-01-01'),
            validTo: null,
            startTime: new Date('1970-01-01T08:00:00Z'),
            endTime: new Date('1970-01-01T18:00:00Z'),
          })),
        ),
    },
    shiftRegistration: empty,
    scheduleOverride: empty,
    timeOff: empty,
    clinicClosure: empty,
    employee: empty,
    $queryRaw: () => [{ n: ++sequence }],
  };
}

describe('showcase seed (in memory)', () => {
  const run = (db: ReturnType<typeof demoDb>, time = now) =>
    seedShowcase(db as unknown as Prisma.TransactionClient, time);

  it('fills both weeks, the accepted-plan list, scorecard and paid-to-rebooked funnel on reruns', async () => {
    const db = demoDb();
    const busy = {
      id: 'existing',
      dentistId: 'a',
      startAt: new Date('2026-11-04T03:00:00Z'),
      endAt: new Date('2026-11-04T03:15:00Z'),
      status: 'CONFIRMED',
    };
    db.appointment.create({ data: busy });
    for (let pass = 0; pass < 2; pass++) {
      expect(await run(db)).toEqual({ checkIn: 2 });
      const visits = [...db.appointment.rows.values()].filter(a => a.id !== busy.id);
      expect(visits).toHaveLength(13);
      const today = visits.filter(a => a.startAt.toISOString().startsWith('2026-11-04'));
      expect(new Set(today.map(a => a.patientId)).size).toBe(2);
      for (const a of today) {
        expect(a.status).toBe('CONFIRMED');
        expect(a.checkedInAt).toBeNull();
        expect(+now - +a.startAt).toBeGreaterThanOrEqual(-15 * 60000);
        expect(+now - +a.startAt).toBeLessThanOrEqual(30 * 60000);
        expect(
          a.dentistId === busy.dentistId && a.startAt < busy.endAt && a.endAt > busy.startAt,
        ).toBe(false);
      }
      const future = visits.filter(a => a.startAt >= new Date('2026-11-05T00:00:00+07:00'));
      expect(future).toHaveLength(6);
      expect(future.filter(a => a.startAt < new Date('2026-11-12T00:00:00+07:00'))).toHaveLength(3);
      expect(new Set(future.map(a => a.dentistId)).size).toBe(2);
      expect(new Set(future.map(a => a.startAt.getUTCHours())).size).toBeGreaterThan(1);
      const plans = [...db.treatmentPlan.rows.values()];
      expect(plans).toHaveLength(4);
      expect(
        plans.every(
          p =>
            p.status === 'ACCEPTED' && p.items.create.unitPrice > 0 && p.proposedAt < p.acceptedAt,
        ),
      ).toBe(true);
      expect(plans.filter(p => future.some(a => a.patientId === p.patientId))).toHaveLength(1);
      expect(visits.some(a => a.status === 'NO_SHOW' && a.noShowAt)).toBe(true);
      const cancelled = visits.find(a => a.status === 'CANCELLED')!;
      expect(+cancelled.startAt - +cancelled.cancelledAt).toBe(45 * 60000);
      const invoices = [...db.invoice.rows.values()];
      expect(invoices.filter(i => i.status === 'ISSUED').map(i => i.outstandingAmount)).toEqual([
        1000, 450000,
      ]);
      const paid = invoices.find(i => i.status === 'PAID')!;
      const encounter = db.encounter.rows.get(paid.encounterId)!;
      const visit = db.appointment.rows.get(encounter.appointmentId)!;
      expect(visit.status).toBe('COMPLETED');
      expect(+encounter.startedAt - +visit.checkedInAt).toBe(5 * 60000);
      expect(future.some(a => a.patientId === paid.patientId)).toBe(true);
      expect(db.payment.rows.size).toBe(1);
    }
    expect(await run(db, new Date('2026-11-07T17:05:00Z'))).toEqual({ checkIn: 0 }); // Sunday in Vietnam
    expect([...db.appointment.rows.values()].filter(a => a.deletedAt)).toHaveLength(2);
    expect(db.patient.rows.size).toBe(6);
    expect(db.invoice.rows.size).toBe(3);
  });

  it('requires the base demo seed before writing', async () => {
    const db = demoDb();
    db.patient.findFirst.mockReturnValue(null);
    await expect(run(db)).rejects.toThrow('seed-demo-clinic');
    expect(db.patient.rows.size).toBe(0);
  });
});

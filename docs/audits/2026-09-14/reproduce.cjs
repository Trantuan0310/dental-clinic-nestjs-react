// Run from any directory: node docs/audits/2026-09-14/reproduce.cjs
// Reproduces current defects. No real DB, HTTP requests, email, or production writes.
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '../../..');
const backend = path.join(root, 'backend');
const dep = name => require(path.join(backend, 'node_modules', name));
dep('ts-node').register({ project: path.join(backend, 'tsconfig.json'), transpileOnly: true });
const src = name => require(path.join(backend, 'src', name));
const { MedicalRecordsService } = src('medical-records/medical-records.service');
const { AppointmentsService } = src('appointments/appointments.service');
const { PayrollService } = src('payroll/payroll.service');
const { InventoryService } = src('inventory/inventory.service');
const { PatientsService } = src('patients/patients.service');
const { BillingService } = src('billing/billing.service');
const { ExpenseService } = src('expense/expense.service');
const { proRateBaseSalary, compRange } = src('payroll/domain/prorate-calculator');
const { computePeriodBounds } = src('payroll/domain/payroll-state');
const { DEFAULT_TAX_BRACKETS } = src('payroll/domain/tax-calculator');
const { SnapshotDentalChartDto, CreateTreatmentDto, CreatePrescriptionDto } = src('medical-records/dto/medical-record.dto');
const { ValidationPipe } = dep('@nestjs/common');
const { Prisma } = dep('@prisma/client');
const actor = { sub: 'dentist-a', email: 'audit@example.invalid', permissions: ['encounter.read.own', 'appointment.read.own', 'invoice.read.own'] };
const audit = { log: async () => {} };
const events = { emit: () => {} };
const time = value => new Date(`1970-01-01T${value}:00Z`);
const period = { start: new Date('2026-09-01Z'), end: new Date('2026-09-30Z') };
const pipe = new ValidationPipe({ whitelist: true, transform: true, transformOptions: { enableImplicitConversion: true } });
const cases = [];
const test = (id, body) => cases.push({ id, body });

test('MR-01 closed treatment can be edited and deleted', async () => {
  const treatment = { id: 't', encounterId: 'e', deletedAt: null, encounter: { dentistId: actor.sub, status: 'COMPLETED' }, unitPrice: 500000 };
  const db = { treatment: { findUnique: async () => treatment, update: async ({ data }) => Object.assign(treatment, data) } };
  const service = new MedicalRecordsService(db, audit, events);
  await service.updateTreatment('e', 't', { unitPrice: 1 }, actor);
  await service.deleteTreatment('e', 't', actor);
  assert.equal(treatment.unitPrice, 1);
  assert.ok(treatment.deletedAt);
});

test('MR-02 locked completed note rejects permitted addendum', async () => {
  const db = { encounter: { findUnique: async () => ({ dentistId: actor.sub, status: 'COMPLETED', closedAt: new Date(), clinicalNote: { id: 'n', isLocked: true } }) } };
  await assert.rejects(new MedicalRecordsService(db, audit, events).addAddendum('e', { content: 'An additional note' }, actor), error => error.getResponse().details === 'Encounter is closed');
});

test('MR-03 concurrent close decrements stock twice', async () => {
  let stock = 10;
  let status = 'IN_PROGRESS';
  let emitted = 0;
  const db = {
    encounter: { findUnique: async () => ({ id: 'e', appointmentId: 'a', patientId: 'p', dentistId: actor.sub, status, treatments: [{ id: 't', procedure: 'Test', unitPrice: 100, inventoryUsages: [{ inventoryItemId: 'i', quantity: 2, unit: 'ml' }] }] }), update: async () => { status = 'COMPLETED'; } },
    inventoryItem: { findUnique: async () => ({ id: 'i', name: 'Item', quantityOnHand: stock }), updateMany: async ({ data }) => { stock -= data.quantityOnHand.decrement; return { count: 1 }; } },
    stockMovement: { create: async () => ({}) }, clinicalNote: { updateMany: async () => ({ count: 0 }) }, appointment: { update: async () => ({}) }, encounterAudit: { create: async () => ({}) },
  };
  db.$transaction = fn => fn(db);
  const service = new MedicalRecordsService(db, audit, { emit: () => emitted++ });
  await Promise.all([service.closeEncounter('e', {}, actor), service.closeEncounter('e', {}, actor)]);
  assert.equal(stock, 6);
  assert.equal(emitted, 2);
});

test('MR-04 whitelist strips dental chart teeth', async () => {
  const result = await pipe.transform({ patientType: 'ADULT', teeth: { 11: 'Filling' } }, { type: 'body', metatype: SnapshotDentalChartDto });
  assert.equal(result.teeth, undefined);
});

test('MR-05 valid child tooth 55 rejected', async () => {
  await assert.rejects(pipe.transform({ procedure: 'Test treatment', unitPrice: 100, toothNumbers: [55] }, { type: 'body', metatype: CreateTreatmentDto }));
});

test('MR-06 prescription quantity discarded by DTO', async () => {
  const result = await pipe.transform({ lines: [{ drugName: 'Test drug', quantity: 20, dosage: '1', frequency: 'daily' }] }, { type: 'body', metatype: CreatePrescriptionDto });
  assert.equal(result.lines[0].quantity, undefined);
});

test('MR-07 deleted prescription prevents replacement', async () => {
  const db = { encounter: { findUnique: async () => ({ dentistId: actor.sub, status: 'IN_PROGRESS' }) }, prescription: { findUnique: async () => ({ id: 'p', deletedAt: new Date() }) } };
  await assert.rejects(new MedicalRecordsService(db, audit, events).upsertPrescription('e', { lines: [{ drugName: 'Test' }] }, actor));
});

test('PAY-01 mid-period open-ended compensation paid full month', async () => {
  const actual = proRateBaseSalary(30000000, compRange(new Date('2026-09-16Z'), null), period);
  assert.equal(actual, 30000000);
  assert.notEqual(actual, 15000000);
});

test('PAY-02 last day noon excluded by period bounds', async () => {
  const { end } = computePeriodBounds('MONTHLY', new Date('2026-09-14Z'));
  assert.equal(end.toISOString(), '2026-09-30T00:00:00.000Z');
  assert.ok(new Date('2026-09-30T05:00:00Z') > end);
});

test('PAY-03 recurring schedule counted outside effective dates', async () => {
  const db = { workingSchedule: { findMany: async () => [{ dayOfWeek: 1, validFrom: new Date('2026-09-21Z'), validTo: new Date('2026-09-21Z'), startTime: time('08:00'), endTime: time('16:00') }] }, shiftRegistration: { findMany: async () => [] } };
  const result = await new PayrollService(db, audit).resolveWorkedShifts(db, actor.sub, period);
  assert.equal(result.totalHours, 32);
  assert.notEqual(result.totalHours, 8);
});

test('PAY-04 only first recurring shift of a day counted', async () => {
  const db = { workingSchedule: { findMany: async () => [{ dayOfWeek: 1, startTime: time('08:00'), endTime: time('12:00') }, { dayOfWeek: 1, startTime: time('13:00'), endTime: time('17:00') }] }, shiftRegistration: { findMany: async () => [] } };
  const result = await new PayrollService(db, audit).resolveWorkedShifts(db, actor.sub, { start: new Date('2026-09-14Z'), end: new Date('2026-09-14Z') });
  assert.equal(result.totalHours, 4);
});

test('PAY-05 older compensation not loaded; all revenue uses latest rate', async () => {
  const db = {
    dentistCompensation: { findFirst: async () => ({ id: 'new', effectiveFrom: new Date('2026-09-16Z'), effectiveTo: new Date('2026-09-30Z'), baseSalaryVnd: 40000000, commissionPct: 0.2, overtimeHourlyVnd: 0 }) },
    encounter: { findMany: async () => [{ id: 'old-encounter', startedAt: new Date('2026-09-05T01:00Z'), closedAt: new Date('2026-09-05T02:00Z'), treatments: [{ id: 't', unitPrice: 1000000 }] }] },
    workingSchedule: { findMany: async () => [] }, shiftRegistration: { findMany: async () => [] },
  };
  const dec = n => new Prisma.Decimal(n);
  const config = { payrollCycle: 'MONTHLY', overtimeMultiplier: dec(1.5), bhxhPct: dec(0), bhytPct: dec(0), bhtnPct: dec(0), minGrossForBhxh: dec(0), probationSalaryPct: dec(1) };
  const result = await new PayrollService(db, audit).computeLineItemForDentist(db, actor.sub, period, config, DEFAULT_TAX_BRACKETS);
  assert.equal(result.baseSalaryVnd, 20000000);
  assert.equal(result.commissionVnd, 200000);
});

test('PAY-06 computation can delete lines after concurrent approval', async () => {
  let status = 'DRAFT';
  let deletedAtStatus;
  const configSnapshot = { payrollCycle: 'MONTHLY', overtimeMultiplier: 1.5, bhxhPct: 0.08, bhytPct: 0.015, bhtnPct: 0.01, minGrossForBhxh: 1000000, probationSalaryPct: 0.85, taxBrackets: DEFAULT_TAX_BRACKETS };
  const db = { payrollPeriod: { findUnique: async () => ({ id: 'p', status, periodStart: period.start, periodEnd: period.end, configSnapshot }) }, user: { findMany: async () => { status = 'APPROVED'; return []; } }, payrollLineItem: { deleteMany: async () => { deletedAtStatus = status; } } };
  db.$transaction = fn => fn(db);
  await new PayrollService(db, audit).computePeriod('p', 'admin');
  assert.equal(deletedAtStatus, 'APPROVED');
});

test('APPT-01 cron overwrites concurrent check-in', async () => {
  let status = 'SCHEDULED';
  const db = { appointment: {
    findMany: async () => { status = 'CHECKED_IN'; return [{ id: 'a' }]; },
    updateMany: async ({ where, data }) => { assert.equal(where.status, undefined); status = data.status; return { count: 1 }; },
  } };
  await new AppointmentsService(db, audit, events).autoMarkNoShow();
  assert.equal(status, 'NO_SHOW');
});

test('APPT-02 afternoon booking checks morning schedule only', async () => {
  const db = { appointment: { findFirst: async () => null }, workingSchedule: { findFirst: async () => ({ startTime: time('08:00'), endTime: time('12:00') }) } };
  await assert.rejects(new AppointmentsService(db, audit, events).ensureSlotAvailable(actor.sub, new Date('2026-09-14T14:00Z'), new Date('2026-09-14T14:30Z'), actor), /outside working hours/);
});

test('APPT-03 local 09:00 becomes 02:00Z but schedule starts 08:00Z', async () => {
  const service = new AppointmentsService({}, audit, events);
  const appointment = new Date('2026-09-14T09:00:00+07:00');
  const schedule = service.combineDateAndTime('2026-09-14', '08:00');
  assert.ok(appointment < schedule);
  assert.equal(schedule.toISOString(), '2026-09-14T08:00:00.000Z');
});

test('SHIFT-01 legacy API accepts another dentist ID', async () => {
  let created;
  const db = { workingSchedule: { findMany: async () => [] }, shiftRegistration: { findMany: async () => [], create: async ({ data }) => { created = data; return { id: 's', ...data }; } } };
  const date = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
  await new AppointmentsService(db, audit, events).createShiftRegistration({ dentistId: 'dentist-b', date, startTime: '08:00', endTime: '12:00' }, actor);
  assert.equal(created.dentistId, 'dentist-b');
});

test('BILL-01 by-encounter endpoint returns another dentists invoice', async () => {
  const { BillingController } = src('billing/billing.controller');
  const otherInvoice = { id: 'private-invoice', encounterId: 'other-encounter', total: 1000000 };
  const db = { invoice: { findUnique: async () => otherInvoice } };
  const result = await new BillingController(new BillingService(db, audit, {})).byEncounter('other-encounter');
  assert.equal(result.data[0].id, 'private-invoice');
});

test('INV-01 low-stock item beyond first 200 is omitted', async () => {
  const rows = Array.from({ length: 201 }, (_, i) => ({ id: String(i), quantityOnHand: i === 200 ? 1 : 100, minStockLevel: 10 }));
  const db = { inventoryItem: { findMany: async ({ take }) => rows.slice(0, take) } };
  const result = await new InventoryService(db, audit).listItems({ lowStockOnly: 'true' });
  assert.equal(result.length, 0);
});

test('EXP-01 reimbursed expense excluded from finance aggregate', async () => {
  const db = { expense: { aggregate: async ({ where }) => ({ _sum: { amount: where.status === 'REIMBURSED' ? 500000 : null } }) } };
  assert.equal(await new ExpenseService(db, audit).aggregateApproved(period.start, period.end), 0);
});

test('PT-01 update can remove every patient contact', async () => {
  let patient = { id: 'p', dob: new Date('2020-01-01Z'), primaryPhone: null, contactPersonName: 'Parent', contactPersonPhone: '0901234567' };
  const db = { patient: { findUnique: async () => patient, update: async ({ data }) => (patient = { ...patient, ...data }) } };
  db.$transaction = fn => fn(db);
  await new PatientsService(db, audit).update('p', { contactPersonName: null, contactPersonPhone: null }, actor);
  assert.equal(patient.contactPersonName, null);
  assert.equal(patient.contactPersonPhone, null);
  assert.equal(patient.primaryPhone, null);
});

(async () => {
  let reproduced = 0;
  for (const { id, body } of cases) {
    try { await body(); reproduced++; console.log(`REPRODUCED ${id}`); }
    catch (error) { console.error(`NOT REPRODUCED ${id}: ${error.stack}`); }
  }
  console.log(JSON.stringify({ reproduced, total: cases.length, note: 'Defect demonstrations, not passing correctness tests; DB interleavings are simulated.' }));
  process.exitCode = reproduced === cases.length ? 0 : 1;
})();

import { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import * as request from 'supertest';
import * as argon2 from 'argon2';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { BillingService } from '../../src/billing/billing.service';
import { JwtService } from '@nestjs/jwt';
import { createTestApp } from '../helpers/create-test-app';

describe('Real HTTP and PostgreSQL regression', () => {
  let app: INestApplication;
  let db: PrismaClient;
  const tokens: Record<string, string> = {};
  const cookies: Record<string, string> = {};
  const users: Record<string, string> = {};
  let serial = 0;
  let patientId: string;
  let appointmentId: string;
  let encounterId: string;
  let invoiceId: string;
  const password = 'Password123!';
  const api = (method: 'get' | 'post' | 'put' | 'patch', path: string, role = 'admin') =>
    request(app.getHttpServer())[method](`/api/v1${path}`).auth(tokens[role], { type: 'bearer' });
  const patientBody = () => ({
    fullName: `Test patient ${++serial}`,
    dob: '1995-01-15',
    gender: 'MALE',
    primaryPhone: '0912345678',
  });
  async function patient() {
    const result = await api('post', '/patients').send(patientBody()).expect(201);
    return result.body.data.id as string;
  }
  function slot() {
    const start = new Date(Date.now() + (48 * 60 + ++serial * 30) * 60000);
    return {
      startAt: start.toISOString(),
      endAt: new Date(start.getTime() + 15 * 60000).toISOString(),
    };
  }
  async function fixtureEncounter() {
    const p = await patient();
    const start = new Date(Date.now() - ++serial * 60000);
    const a = await db.appointment.create({
      data: {
        patientId: p,
        dentistId: users.dentist,
        startAt: start,
        endAt: new Date(start.getTime() + 60000),
        status: 'CHECKED_IN',
      },
    });
    const result = await api('post', '/medical-records/encounters/start', 'dentist')
      .send({ appointmentId: a.id })
      .expect(200);
    return result.body.data.encounterId as string;
  }
  async function invoiceFor(id: string) {
    for (let i = 0; i < 100; i++) {
      const invoice = await db.invoice.findUnique({ where: { encounterId: id } });
      if (invoice) return invoice;
      await new Promise(resolve => setTimeout(resolve, 30));
    }
    throw new Error(`No invoice generated for encounter ${id}`);
  }
  beforeAll(async () => {
    const name = process.env.ISOLATED_TEST_DB;
    if (
      !name ||
      !/^dental_clinic_test_\d+_\d+$/.test(name) ||
      new URL(process.env.DATABASE_URL!).pathname !== `/${name}`
    )
      throw new Error('Dedicated test database required');
    db = new PrismaClient();
    const hash = await argon2.hash(password);
    const admin = await db.user.findFirstOrThrow({ where: { email: 'admin@clinic.local' } });
    await db.user.update({
      where: { id: admin.id },
      data: { status: 'ACTIVE', passwordHash: hash },
    });
    users.admin = admin.id;
    for (const [key, roleCode] of [
      ['dentist', 'dentist'],
      ['other', 'dentist'],
      ['reception', 'receptionist'],
    ]) {
      const role = await db.role.findFirstOrThrow({ where: { code: roleCode } });
      const u = await db.user.create({
        data: {
          email: `${key}@test.local`,
          fullName: key,
          passwordHash: hash,
          status: 'ACTIVE',
          userRoles: { create: { roleId: role.id } },
        },
      });
      users[key] = u.id;
    }
    for (let dayOfWeek = 0; dayOfWeek < 7; dayOfWeek++) {
      await db.workingSchedule.create({
        data: {
          dentistId: users.dentist,
          dayOfWeek,
          startTime: new Date('1970-01-01T00:00:00Z'),
          endTime: new Date('1970-01-01T23:59:00Z'),
          validFrom: new Date('2020-01-01'),
          isPaidShift: false,
        },
      });
    }
    app = await createTestApp();
    for (const key of Object.keys(users)) {
      const result = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: key === 'admin' ? 'admin@clinic.local' : `${key}@test.local`, password })
        .expect(200);
      tokens[key] = result.body.data.accessToken;
      expect(tokens[key]).toEqual(expect.any(String));
      const header = result.headers['set-cookie'][0];
      expect(header).toContain('HttpOnly');
      expect(header).toContain('SameSite=Strict');
      cookies[key] = header.split(';')[0];
      expect(result.body.data.refreshToken).toBeUndefined();
    }
  }, 60000);
  afterAll(async () => {
    await app?.close();
    await db?.$disconnect();
  });

  it('exposes unversioned production readiness with a live database', async () => {
    const response = await request(app.getHttpServer()).get('/health/ready').expect(200);
    expect(response.body).toEqual({ status: 'ok' });
  });

  it('rejects unauthenticated HTTP requests', async () => {
    await request(app.getHttpServer()).get('/api/v1/patients').expect(401);
  });
  it('rejects invalid access tokens', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .auth('invalid', { type: 'bearer' })
      .expect(401);
  });
  it('rejects an expired signed access token', async () => {
    const token = app
      .get(JwtService)
      .sign({ sub: users.admin, email: 'admin@clinic.local' }, { expiresIn: -10 });
    await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .auth(token, { type: 'bearer' })
      .expect(401);
  });
  it('returns current authenticated identity', async () => {
    const r = await api('get', '/auth/me', 'dentist').expect(200);
    expect(r.body.data.id).toBe(users.dentist);
  });
  it('rejects wrong login password', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'admin@clinic.local', password: 'Wrong123!' })
      .expect(401);
  });
  it('enforces the login rate limit', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'admin@clinic.local', password })
      .expect(429);
  });
  it('blocks receptionist payroll access', async () => {
    await api('get', '/payroll/config', 'reception').expect(403);
  });
  it('rejects invalid resource UUID', async () => {
    await api('get', '/patients/not-a-uuid').expect(400);
  });
  it('returns 404 for absent patient', async () => {
    await api('get', `/patients/${randomUUID()}`).expect(404);
  });
  it('rejects future date of birth', async () => {
    await api('post', '/patients')
      .send({ ...patientBody(), dob: '2099-01-01' })
      .expect(400);
  });
  it('requires guardian contact for children', async () => {
    await api('post', '/patients')
      .send({ ...patientBody(), dob: new Date().toISOString().slice(0, 10) })
      .expect(400);
  });
  it('creates a patient with a unique code and UUID v7', async () => {
    patientId = await patient();
    const p = await db.patient.findUniqueOrThrow({ where: { id: patientId } });
    expect(p.id[14]).toBe('7');
    expect(p.code).toBeTruthy();
    expect(p.fullName).toContain('Test patient');
  });
  it('distinguishes the twelfth birthday from the day before it', async () => {
    const birthday = new Date();
    birthday.setFullYear(birthday.getFullYear() - 12);
    const today = `${birthday.getFullYear()}-${String(birthday.getMonth() + 1).padStart(2, '0')}-${String(birthday.getDate()).padStart(2, '0')}`;
    await api('post', '/patients')
      .send({ ...patientBody(), dob: today })
      .expect(201);
    birthday.setDate(birthday.getDate() + 1);
    const tomorrow = `${birthday.getFullYear()}-${String(birthday.getMonth() + 1).padStart(2, '0')}-${String(birthday.getDate()).padStart(2, '0')}`;
    await api('post', '/patients')
      .send({ ...patientBody(), dob: tomorrow })
      .expect(400);
  });
  it('rejects malformed patient phone numbers', async () => {
    await api('post', '/patients')
      .send({ ...patientBody(), primaryPhone: '123' })
      .expect(400);
  });
  it('validates appointment interval', async () => {
    const s = slot();
    await api('post', '/appointments')
      .send({ patientId, dentistId: users.dentist, ...s, endAt: s.startAt, source: 'PHONE' })
      .expect(400);
  });
  it('creates a near-term appointment through the real API', async () => {
    const start = new Date(Date.now() + 3 * 60000);
    const r = await api('post', '/appointments', 'reception')
      .send({
        patientId,
        dentistId: users.dentist,
        startAt: start.toISOString(),
        endAt: new Date(start.getTime() + 15 * 60000).toISOString(),
        source: 'PHONE',
      })
      .expect(201);
    appointmentId = r.body.data.id;
    expect((await db.appointment.findUniqueOrThrow({ where: { id: appointmentId } })).status).toBe(
      'SCHEDULED',
    );
  });
  it('restricts appointment detail to the assigned dentist', async () => {
    await api('get', `/appointments/${appointmentId}`, 'other').expect(404);
  });
  it('checks in and persists the actor', async () => {
    await api('post', `/appointments/${appointmentId}/check-in`, 'reception').send({}).expect(200);
    const a = await db.appointment.findUniqueOrThrow({ where: { id: appointmentId } });
    expect(a.status).toBe('CHECKED_IN');
    expect(a.checkedInBy).toBe(users.reception);
  });
  it('starts a real encounter and synchronizes appointment status', async () => {
    const r = await api('post', '/medical-records/encounters/start', 'dentist')
      .send({ appointmentId })
      .expect(200);
    encounterId = r.body.data.encounterId;
    expect((await db.appointment.findUniqueOrThrow({ where: { id: appointmentId } })).status).toBe(
      'IN_PROGRESS',
    );
    expect(await db.encounter.count({ where: { appointmentId } })).toBe(1);
  });
  it('starts the same encounter idempotently under concurrent requests', async () => {
    const responses = await Promise.all([
      api('post', '/medical-records/encounters/start', 'dentist').send({ appointmentId }),
      api('post', '/medical-records/encounters/start', 'dentist').send({ appointmentId }),
    ]);
    expect(responses.map(r => r.status)).toEqual([200, 200]);
    expect(responses.map(r => r.body.data.encounterId)).toEqual([encounterId, encounterId]);
    expect(await db.encounter.count({ where: { appointmentId } })).toBe(1);
  });
  it('locks date of birth after an encounter exists', async () => {
    await api('patch', `/patients/${patientId}`).send({ dob: '1996-01-15' }).expect(409);
  });
  it('blocks receptionist clinical note writes', async () => {
    await api('put', `/medical-records/encounters/${encounterId}/clinical-note`, 'reception')
      .send({ diagnosis: 'Unauthorized' })
      .expect(403);
  });
  it('blocks another dentist from accessing the encounter', async () => {
    await api('get', `/medical-records/encounters/${encounterId}`, 'other').expect(404);
  });
  it('writes a clinical note', async () => {
    await api('put', `/medical-records/encounters/${encounterId}/clinical-note`, 'dentist')
      .send({ diagnosis: 'Dental caries', notes: 'Test consultation' })
      .expect(200);
    expect(await db.clinicalNote.count({ where: { encounterId } })).toBe(1);
  });
  it('adds a treatment and persists its decimal price', async () => {
    await api('post', `/medical-records/encounters/${encounterId}/treatments`, 'dentist')
      .send({ procedure: 'Dental filling', toothNumbers: [16], unitPrice: 350000 })
      .expect(201);
    const t = await db.treatment.findFirstOrThrow({ where: { encounterId } });
    expect(Number(t.unitPrice)).toBe(350000);
  });
  it('persists prescription quantities and units', async () => {
    await api('post', `/medical-records/encounters/${encounterId}/prescription`, 'dentist')
      .send({
        diagnosis: 'Dental caries',
        lines: [
          {
            drugName: 'Paracetamol',
            dosage: '500 mg',
            frequency: 'Twice daily',
            durationDays: 3,
            quantity: 6,
            unit: 'tablet',
          },
        ],
      })
      .expect(201);
    const p = await db.prescription.findUniqueOrThrow({
      where: { encounterId },
      include: { lines: true },
    });
    expect(p.lines[0].quantity).toBe(6);
    expect(p.lines[0].unit).toBe('tablet');
  });
  it('closes the encounter, locks its note and creates exactly one draft invoice', async () => {
    await api('post', `/medical-records/encounters/${encounterId}/close`, 'dentist')
      .send({ summary: 'Completed filling' })
      .expect(200);
    const i = await invoiceFor(encounterId);
    invoiceId = i.id;
    expect(Number(i.total)).toBe(350000);
    expect(i.status).toBe('DRAFT');
    expect((await db.clinicalNote.findUniqueOrThrow({ where: { encounterId } })).isLocked).toBe(
      true,
    );
    expect((await db.appointment.findUniqueOrThrow({ where: { id: appointmentId } })).status).toBe(
      'COMPLETED',
    );
  });
  it('adds an addendum without editing the sealed note and enforces the 30-day window', async () => {
    const e = await db.encounter.findUniqueOrThrow({ where: { id: encounterId } });
    await api(
      'post',
      `/medical-records/encounters/${encounterId}/clinical-note/addendums`,
      'dentist',
    )
      .send({ content: 'Follow-up correction' })
      .expect(201);
    await db.encounter.update({
      where: { id: encounterId },
      data: { closedAt: new Date(Date.now() - 31 * 86400000) },
    });
    try {
      await api(
        'post',
        `/medical-records/encounters/${encounterId}/clinical-note/addendums`,
        'dentist',
      )
        .send({ content: 'Too late correction' })
        .expect(403);
    } finally {
      await db.encounter.update({ where: { id: encounterId }, data: { closedAt: e.closedAt } });
    }
    expect((await db.clinicalNote.findUniqueOrThrow({ where: { encounterId } })).diagnosis).toBe(
      'Dental caries',
    );
  });
  it('rejects closing the same encounter twice', async () => {
    await api('post', `/medical-records/encounters/${encounterId}/close`, 'dentist')
      .send({})
      .expect(409);
    expect(await db.invoice.count({ where: { encounterId } })).toBe(1);
  });
  it('blocks clinical note changes after close', async () => {
    await api('put', `/medical-records/encounters/${encounterId}/clinical-note`, 'dentist')
      .send({ diagnosis: 'Modified' })
      .expect(409);
  });
  it('rejects payment before issuing invoice', async () => {
    await api('post', `/billing/invoices/${invoiceId}/payments`)
      .send({ amount: 100000, method: 'CASH' })
      .expect(409);
  });
  it('enforces optimistic invoice version checks', async () => {
    await api('post', `/billing/invoices/${invoiceId}/issue`).send({ version: 999 }).expect(409);
  });
  it('applies decimal invoice discounts and refuses stale versions', async () => {
    const original = await db.invoice.findUniqueOrThrow({ where: { id: invoiceId } });
    await api('put', `/billing/invoices/${invoiceId}/discount`)
      .send({ discountType: 'PERCENT', discountValue: 10, version: original.version })
      .expect(200);
    const discounted = await db.invoice.findUniqueOrThrow({ where: { id: invoiceId } });
    expect(Number(discounted.total)).toBe(315000);
    expect(Number(discounted.outstandingAmount)).toBe(315000);
    await api('put', `/billing/invoices/${invoiceId}/discount`)
      .send({ discountType: 'PERCENT', discountValue: 0, version: original.version })
      .expect(409);
    await api('put', `/billing/invoices/${invoiceId}/discount`)
      .send({ discountType: 'PERCENT', discountValue: 0, version: discounted.version })
      .expect(200);
  });
  it('issues the invoice', async () => {
    const i = await db.invoice.findUniqueOrThrow({ where: { id: invoiceId } });
    await api('post', `/billing/invoices/${invoiceId}/issue`)
      .send({ version: i.version })
      .expect(200);
  });
  it('rejects overpayment without a payment row', async () => {
    const r = await api('post', `/billing/invoices/${invoiceId}/payments`).send({
      amount: 350001,
      method: 'CASH',
    });
    expect(r.status).toBe(400);
    expect(await db.payment.count({ where: { invoiceId } })).toBe(0);
  });
  it('records partial payment and reconciles the balance', async () => {
    await api('post', `/billing/invoices/${invoiceId}/payments`)
      .send({ amount: 100000, method: 'CASH' })
      .expect(201);
    const i = await db.invoice.findUniqueOrThrow({ where: { id: invoiceId } });
    expect(Number(i.paidAmount)).toBe(100000);
    expect(Number(i.outstandingAmount)).toBe(250000);
  });
  it('settles the invoice and reconciles the payment ledger', async () => {
    await api('post', `/billing/invoices/${invoiceId}/payments`)
      .send({ amount: 250000, method: 'BANK_TRANSFER' })
      .expect(201);
    const i = await db.invoice.findUniqueOrThrow({ where: { id: invoiceId } });
    const sum = await db.payment.aggregate({ where: { invoiceId }, _sum: { amount: true } });
    expect(i.status).toBe('PAID');
    expect(Number(i.outstandingAmount)).toBe(0);
    expect(Number(sum._sum.amount)).toBe(Number(i.paidAmount));
  });
  it('blocks other dentist invoice access', async () => {
    await api('get', `/billing/invoices/${invoiceId}`, 'other').expect(404);
  });
  it('serializes competing overlapping bookings', async () => {
    const s = slot();
    const p = await patient();
    const body = { patientId: p, dentistId: users.dentist, ...s, source: 'PHONE' };
    const results = await Promise.all([
      api('post', '/appointments').send(body),
      api('post', '/appointments').send(body),
    ]);
    expect(results.map(r => r.status).sort()).toEqual([201, 409]);
    expect(
      await db.appointment.count({
        where: { dentistId: users.dentist, startAt: new Date(s.startAt) },
      }),
    ).toBe(1);
  });
  it('allows a new booking after cancelling the same slot', async () => {
    const s = slot();
    const p = await patient();
    const body = { patientId: p, dentistId: users.dentist, ...s, source: 'PHONE' };
    const r = await api('post', '/appointments').send(body).expect(201);
    await api('post', `/appointments/${r.body.data.id}/cancel`)
      .send({ reason: 'Test cancellation' })
      .expect(200);
    await api('post', '/appointments').send(body).expect(201);
  });
  it('rejects competing payments without double collecting or a server error', async () => {
    const id = await fixtureEncounter();
    await api('post', `/medical-records/encounters/${id}/treatments`, 'dentist')
      .send({ procedure: 'Concurrent payment fixture', unitPrice: 100000 })
      .expect(201);
    await api('post', `/medical-records/encounters/${id}/close`, 'dentist').send({}).expect(200);
    const invoice = await invoiceFor(id);
    await api('post', `/billing/invoices/${invoice.id}/issue`)
      .send({ version: invoice.version })
      .expect(200);
    const results = await Promise.all([
      api('post', `/billing/invoices/${invoice.id}/payments`).send({
        amount: 100000,
        method: 'CASH',
      }),
      api('post', `/billing/invoices/${invoice.id}/payments`).send({
        amount: 100000,
        method: 'CASH',
      }),
    ]);
    expect(results.filter(r => r.status === 201)).toHaveLength(1);
    expect([400, 409]).toContain(results.find(r => r.status !== 201)!.status);
    expect(await db.payment.count({ where: { invoiceId: invoice.id } })).toBe(1);
    expect(
      Number((await db.invoice.findUniqueOrThrow({ where: { id: invoice.id } })).outstandingAmount),
    ).toBe(0);
  });
  it('rolls back all inventory changes when closing with insufficient stock', async () => {
    const id = await fixtureEncounter();
    const first = await db.inventoryItem.create({
      data: {
        sku: `rollback-a-${++serial}`,
        name: 'Enough stock',
        unit: 'piece',
        quantityOnHand: 10,
      },
    });
    const second = await db.inventoryItem.create({
      data: {
        sku: `rollback-b-${++serial}`,
        name: 'Insufficient stock',
        unit: 'piece',
        quantityOnHand: 0,
      },
    });
    await api('post', `/medical-records/encounters/${id}/treatments`, 'dentist')
      .send({
        procedure: 'Stock rollback treatment',
        unitPrice: 100000,
        inventoryUsages: [
          { inventoryItemId: first.id, quantity: 2, unit: 'piece' },
          { inventoryItemId: second.id, quantity: 1, unit: 'piece' },
        ],
      })
      .expect(201);
    await api('post', `/medical-records/encounters/${id}/close`, 'dentist').send({}).expect(422);
    expect(
      Number(
        (await db.inventoryItem.findUniqueOrThrow({ where: { id: first.id } })).quantityOnHand,
      ),
    ).toBe(10);
    expect((await db.encounter.findUniqueOrThrow({ where: { id } })).status).toBe('IN_PROGRESS');
    expect(await db.invoice.count({ where: { encounterId: id } })).toBe(0);
    expect(await db.stockMovement.count({ where: { inventoryItemId: first.id } })).toBe(0);
  });
  it('rejects invalid expense dates as client errors', async () => {
    await api('post', '/expenses')
      .send({ amount: 1000, description: 'Bad date', expenseDate: 'invalid' })
      .expect(400);
  });
  it('creates, approves and reimburses an expense', async () => {
    const r = await api('post', '/expenses')
      .send({
        amount: 125000,
        description: 'Test supplies',
        expenseDate: new Date().toISOString().slice(0, 10),
      })
      .expect(201);
    const id = r.body.data.id;
    await api('post', `/expenses/${id}/approve`).send({}).expect(403);
    const role = await db.role.findFirstOrThrow({ where: { code: 'clinic_admin' } });
    await db.userRole.create({ data: { userId: users.other, roleId: role.id } });
    try {
      await api('post', `/expenses/${id}/approve`, 'other').send({}).expect(200);
    } finally {
      await db.userRole.deleteMany({ where: { userId: users.other, roleId: role.id } });
    }
    await api('post', `/expenses/${id}/reimburse`).send({}).expect(200);
    expect((await db.expense.findUniqueOrThrow({ where: { id } })).status).toBe('REIMBURSED');
    await api('post', `/expenses/${id}/reimburse`).send({}).expect(409);
  });
  it('loads actual payroll configuration', async () => {
    const r = await api('get', '/payroll/config').expect(200);
    expect(r.body.data).toBeTruthy();
  });
  it('computes payroll and persists each approved payment transition', async () => {
    const r = await api('post', '/payroll/periods')
      .send({ periodStart: '2025-02-01', periodEnd: '2025-02-28', payrollCycle: 'MONTHLY' })
      .expect(201);
    const id = r.body.data.id;
    await api('post', `/payroll/periods/${id}/compute`).send({}).expect(200);
    await api('post', `/payroll/periods/${id}/lock`).send({}).expect(200);
    await api('post', `/payroll/periods/${id}/approve`).send({}).expect(200);
    await api('post', `/payroll/periods/${id}/mark-paid`)
      .send({ paymentDate: '2025-03-01', paymentReference: 'ISOLATED-TEST' })
      .expect(200);
    expect((await db.payrollPeriod.findUniqueOrThrow({ where: { id } })).status).toBe('PAID');
    await api('post', `/payroll/periods/${id}/compute`).send({}).expect(409);
  });
  it('creates inventory and records incoming and outgoing stock', async () => {
    const r = await api('post', '/inventory/items')
      .send({ sku: `HTTP-${++serial}`, name: 'Test stock', quantityOnHand: 5, unit: 'piece' })
      .expect(201);
    const id = r.body.data.id;
    await api('post', `/inventory/items/${id}/stock-in`)
      .send({ quantity: 2, reason: 'Test receipt' })
      .expect(200);
    await api('post', `/inventory/items/${id}/stock-out`)
      .send({ quantity: 3, reason: 'Test consumption' })
      .expect(200);
    expect(
      Number((await db.inventoryItem.findUniqueOrThrow({ where: { id } })).quantityOnHand),
    ).toBe(4);
    expect(await db.stockMovement.count({ where: { inventoryItemId: id } })).toBe(2);
  });
  it('rejects foreign keys and rolls back the enclosing transaction', async () => {
    const code = `ROLLBACK-${++serial}`;
    await expect(
      db.$transaction(async tx => {
        const p = await tx.patient.create({
          data: { code, fullName: 'Rollback fixture', dob: new Date('1990-01-01'), gender: 'MALE' },
        });
        await tx.appointment.create({
          data: {
            patientId: p.id,
            dentistId: randomUUID(),
            startAt: new Date(),
            endAt: new Date(),
          },
        });
      }),
    ).rejects.toMatchObject({ code: 'P2003' });
    expect(await db.patient.count({ where: { code } })).toBe(0);
  });
  it('enforces unique patient codes', async () => {
    const p = await db.patient.findUniqueOrThrow({ where: { id: patientId } });
    await expect(
      db.patient.create({
        data: { code: p.code, fullName: 'Duplicate', dob: new Date('1990-01-01'), gender: 'MALE' },
      }),
    ).rejects.toMatchObject({ code: 'P2002' });
  });
  it('rotates refresh tokens and rejects reuse', async () => {
    const r = await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .set('Cookie', cookies.other)
      .expect(200);
    expect(r.body.data.accessToken).toEqual(expect.any(String));
    await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .set('Cookie', cookies.other)
      .expect(401);
  });
  it('logs out and revokes the refresh cookie', async () => {
    const r = await api('post', '/auth/logout', 'reception')
      .set('Cookie', cookies.reception)
      .expect(204);
    expect(r.headers['set-cookie'][0]).toContain('refreshToken=;');
    await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .set('Cookie', cookies.reception)
      .expect(401);
  });
  it('rejects a soft-deleted user with a previously valid access token', async () => {
    await db.user.update({ where: { id: users.other }, data: { deletedAt: new Date() } });
    await api('get', '/auth/me', 'other').expect(401);
  });
  it('keeps calendar filtering within the Vietnam day at UTC boundaries', async () => {
    const p = await patient();
    const inside = await db.appointment.create({
      data: {
        patientId: p,
        dentistId: users.dentist,
        startAt: new Date('2025-01-14T17:30:00Z'),
        endAt: new Date('2025-01-14T17:45:00Z'),
      },
    });
    await db.appointment.create({
      data: {
        patientId: p,
        dentistId: users.dentist,
        startAt: new Date('2025-01-14T16:59:00Z'),
        endAt: new Date('2025-01-14T17:14:00Z'),
      },
    });
    const r = await api('get', '/appointments')
      .query({ patientId: p, from: '2025-01-15', to: '2025-01-15' })
      .expect(200);
    expect(r.body.data.map((a: { id: string }) => a.id)).toEqual([inside.id]);
  });
  it('cannot expand dentist list visibility by changing dentistId', async () => {
    const r = await api('get', '/appointments', 'dentist')
      .query({ dentistId: users.other })
      .expect(200);
    expect(r.body.data.length).toBeGreaterThan(0);
    expect(r.body.data.every((a: { dentistId: string }) => a.dentistId === users.dentist)).toBe(
      true,
    );
  });
  it('supports cursor pagination without repeating appointments', async () => {
    const first = await api('get', '/appointments').query({ pageSize: 1 }).expect(200);
    expect(first.body.pagination.hasMore).toBe(true);
    const next = await api('get', '/appointments')
      .query({ pageSize: 1, cursor: first.body.pagination.nextCursor })
      .expect(200);
    expect(next.body.data[0].id).not.toBe(first.body.data[0].id);
  });
  it('upgrades an invoice sequence behind existing data without code collisions', async () => {
    await db.invoice.update({ where: { id: invoiceId }, data: { code: 'INV-2026-900000' } });
    await db.$queryRawUnsafe("SELECT setval('invoice_code_seq', 1, false)");
    const sql = readFileSync(
      'prisma/migrations/015_sync_invoice_code_sequence/migration.sql',
      'utf8',
    );
    await db.$queryRawUnsafe(sql.slice(sql.indexOf('WITH current_codes')));
    const code = await app.get(BillingService).generateInvoiceCode();
    expect(Number(code.split('-')[2])).toBeGreaterThan(900000);
  });
  it('filters repeated lower-case appointment statuses without server errors', async () => {
    const r = await api('get', '/appointments?status=checked_in&status=in_progress').expect(200);
    expect(
      r.body.data.every((a: { status: string }) =>
        ['CHECKED_IN', 'IN_PROGRESS'].includes(a.status),
      ),
    ).toBe(true);
  });
  it('rejects an invalid appointment status filter', async () => {
    await api('get', '/appointments?status=INVALID').expect(400);
  });
  it('soft deletes and restores a patient without removing the database row', async () => {
    const p = await patient();
    await request(app.getHttpServer())
      .delete(`/api/v1/patients/${p}`)
      .auth(tokens.admin, { type: 'bearer' })
      .send({ reason: 'Test soft delete' })
      .expect(204);
    expect((await db.patient.findUniqueOrThrow({ where: { id: p } })).deletedAt).not.toBeNull();
    await api('post', `/patients/${p}/restore`).send({}).expect(200);
    expect((await db.patient.findUniqueOrThrow({ where: { id: p } })).deletedAt).toBeNull();
  });
  it('serializes stock deductions without negative inventory', async () => {
    const item = await db.inventoryItem.create({
      data: { sku: `RACE-${++serial}`, name: 'Concurrent stock', unit: 'piece', quantityOnHand: 5 },
    });
    const results = await Promise.all([
      api('post', `/inventory/items/${item.id}/stock-out`).send({
        quantity: 4,
        reason: 'Concurrent usage',
      }),
      api('post', `/inventory/items/${item.id}/stock-out`).send({
        quantity: 4,
        reason: 'Concurrent usage',
      }),
    ]);
    expect(results.filter(r => r.status === 200)).toHaveLength(1);
    expect([400, 409, 422]).toContain(results.find(r => r.status !== 200)!.status);
    expect(
      Number((await db.inventoryItem.findUniqueOrThrow({ where: { id: item.id } })).quantityOnHand),
    ).toBe(1);
    expect(await db.stockMovement.count({ where: { inventoryItemId: item.id } })).toBe(1);
  });
  it('groups issued revenue on the Vietnam calendar day', async () => {
    const invoice = await db.invoice.findUniqueOrThrow({ where: { id: invoiceId } });
    await db.invoice.update({
      where: { id: invoiceId },
      data: { issuedAt: new Date('2025-01-14T17:30:00Z') },
    });
    const r = await api('get', '/billing/reports/revenue-by-day')
      .query({ from: '2025-01-15', to: '2025-01-15' })
      .expect(200);
    expect(r.body.data).toEqual([
      { date: '2025-01-15', revenue: Number(invoice.total), invoiceCount: 1 },
    ]);
  });
  it('blocks check-in outside the time window', async () => {
    const p = await patient();
    const s = slot();
    const r = await api('post', '/appointments')
      .send({ patientId: p, dentistId: users.dentist, ...s, source: 'PHONE' })
      .expect(201);
    await api('post', `/appointments/${r.body.data.id}/check-in`, 'reception').send({}).expect(400);
    expect((await db.appointment.findUniqueOrThrow({ where: { id: r.body.data.id } })).status).toBe(
      'SCHEDULED',
    );
  });
  it('rejects bookings during dentist time off', async () => {
    const p = await patient();
    const s = slot();
    const leave = await db.timeOff.create({
      data: {
        dentistId: users.dentist,
        startAt: new Date(s.startAt),
        endAt: new Date(s.endAt),
        type: 'VACATION',
        createdBy: users.admin,
      },
    });
    try {
      await api('post', '/appointments')
        .send({ patientId: p, dentistId: users.dentist, ...s, source: 'PHONE' })
        .expect(400);
    } finally {
      await db.timeOff.delete({ where: { id: leave.id } });
    }
  });
  it('accepts both shifts and rejects a booking spanning the lunch break', async () => {
    const role = await db.role.findFirstOrThrow({ where: { code: 'dentist' } });
    const dentist = await db.user.create({
      data: {
        email: 'split-shift@test.local',
        fullName: 'Split shift',
        passwordHash: 'fixture-not-used-for-login',
        userRoles: { create: { roleId: role.id } },
      },
    });
    const p = await patient();
    const date = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
    for (const [start, end] of [
      ['08:00', '12:00'],
      ['14:00', '17:00'],
    ])
      await db.workingSchedule.create({
        data: {
          dentistId: dentist.id,
          dayOfWeek: new Date(date).getUTCDay(),
          validFrom: new Date('2020-01-01'),
          startTime: new Date(`1970-01-01T${start}:00Z`),
          endTime: new Date(`1970-01-01T${end}:00Z`),
          isPaidShift: false,
        },
      });
    for (const [start, end, status] of [
      ['08:00', '08:30', 201],
      ['14:00', '14:30', 201],
      ['11:45', '12:15', 400],
    ] as const)
      await api('post', '/appointments')
        .send({
          patientId: p,
          dentistId: dentist.id,
          startAt: `${date}T${start}:00+07:00`,
          endAt: `${date}T${end}:00+07:00`,
          source: 'PHONE',
        })
        .expect(status);
  });
  it('blocks writes to cancelled encounters', async () => {
    const id = await fixtureEncounter();
    await api('post', `/medical-records/encounters/${id}/cancel`)
      .send({ reason: 'Patient declined treatment' })
      .expect(200);
    await api('put', `/medical-records/encounters/${id}/clinical-note`, 'dentist')
      .send({ diagnosis: 'Blocked change' })
      .expect(409);
    await api('post', `/medical-records/encounters/${id}/treatments`, 'dentist')
      .send({ procedure: 'Blocked treatment', unitPrice: 1000 })
      .expect(409);
  });
  it('rejects overlapping payroll periods and reversed date ranges', async () => {
    await api('post', '/payroll/periods')
      .send({ periodStart: '2025-02-15', periodEnd: '2025-03-15', payrollCycle: 'MONTHLY' })
      .expect(409);
    await api('post', '/payroll/periods')
      .send({ periodStart: '2025-04-30', periodEnd: '2025-04-01', payrollCycle: 'MONTHLY' })
      .expect(400);
  });
  it('allows reuse of a soft-deleted email and prevents duplicate active accounts', async () => {
    const original = await db.user.create({
      data: {
        email: 'reusable@test.local',
        fullName: 'Original',
        passwordHash: 'fixture',
        deletedAt: new Date(),
      },
    });
    const active = await db.user.create({
      data: { email: original.email, fullName: 'Active replacement', passwordHash: 'fixture' },
    });
    expect(active.id).not.toBe(original.id);
    await expect(
      db.user.create({
        data: { email: original.email, fullName: 'Duplicate active', passwordHash: 'fixture' },
      }),
    ).rejects.toMatchObject({ code: 'P2002' });
  });

  describe('staff: employees and dentist profiles (ADR-0009 phase 1)', () => {
    let employeeId: string;

    // A dentist of its own: earlier tests soft-delete `other` and give
    // `dentist` future bookings. Signed directly (the login route is
    // rate-limited and the rate-limit test above has used it up).
    beforeAll(async () => {
      const role = await db.role.findFirstOrThrow({
        where: { code: 'dentist' },
        include: { rolePermissions: { include: { permission: true } } },
      });
      const u = await db.user.create({
        data: {
          email: 'staff-dentist@test.local',
          fullName: 'Staff dentist',
          passwordHash: 'fixture',
          status: 'ACTIVE',
          userRoles: { create: { roleId: role.id } },
        },
      });
      users.staffDentist = u.id;
      tokens.staffDentist = app.get(JwtService).sign({
        sub: u.id,
        email: u.email,
        permissions: role.rolePermissions.map(rp => rp.permission.code),
      });
      for (let dayOfWeek = 0; dayOfWeek < 7; dayOfWeek++) {
        await db.workingSchedule.create({
          data: {
            dentistId: u.id,
            dayOfWeek,
            startTime: new Date('1970-01-01T00:00:00Z'),
            endTime: new Date('1970-01-01T23:59:00Z'),
            validFrom: new Date('2020-01-01'),
            isPaidShift: false,
          },
        });
      }
    });

    it('backfilled the seeded admin as a MANAGER employee', async () => {
      const admin = await db.employee.findFirstOrThrow({ where: { userId: users.admin } });
      expect(admin).toMatchObject({ employeeType: 'MANAGER', employmentStatus: 'ACTIVE' });
      expect(admin.code).toMatch(/^NV-\d{5}$/);
    });

    it('lets reception read but not create employees', async () => {
      await api('get', '/employees', 'reception').expect(200);
      await api('post', '/employees', 'reception')
        .send({ fullName: 'Không được tạo', employeeType: 'ASSISTANT' })
        .expect(403);
    });

    it('creates an employee, links an account and makes them a dentist', async () => {
      const created = await api('post', '/employees')
        .send({ fullName: 'Staff dentist', employeeType: 'ASSISTANT', phone: '0901234567' })
        .expect(201);
      employeeId = created.body.data.id;
      expect(created.body.data.code).toMatch(/^NV-\d{5}$/);

      await api('post', `/employees/${employeeId}/dentist-profile`).send({}).expect(409);
      await api('post', `/employees/${employeeId}/account`)
        .send({ userId: users.staffDentist })
        .expect(200);
      const profile = await api('post', `/employees/${employeeId}/dentist-profile`)
        .send({ licenseNumber: 'CCHN-TEST-001', calendarColor: '#0891B2', defaultSlotMinutes: 45 })
        .expect(201);
      expect(profile.body.data.userId).toBe(users.staffDentist);

      const options = await api('get', '/appointments/dentists', 'reception').expect(200);
      expect(options.body.data).toContainEqual(
        expect.objectContaining({
          id: users.staffDentist,
          calendarColor: '#0891B2',
          practiceStatus: 'ACTIVE',
        }),
      );
    });

    it('refuses to link an account that already belongs to an employee', async () => {
      const second = await api('post', '/employees')
        .send({ fullName: 'Second', employeeType: 'OTHER' })
        .expect(201);
      const res = await api('post', `/employees/${second.body.data.id}/account`)
        .send({ userId: users.staffDentist })
        .expect(409);
      expect(res.body.code).toBe('STAFF_LINK_CONFLICT');
    });

    it('rejects a duplicate license number', async () => {
      const emp = await api('post', '/employees')
        .send({ fullName: 'dentist', employeeType: 'DENTIST' })
        .expect(201);
      await api('post', `/employees/${emp.body.data.id}/account`)
        .send({ userId: users.dentist })
        .expect(200);
      const res = await api('post', `/employees/${emp.body.data.id}/dentist-profile`)
        .send({ licenseNumber: 'CCHN-TEST-001' })
        .expect(409);
      expect(res.body.code).toBe('LICENSE_NUMBER_TAKEN');
    });

    it('lets a dentist edit only the self-service fields of their own profile', async () => {
      await api('patch', `/dentists/${users.staffDentist}`, 'staffDentist')
        .send({ bio: 'Nha chu', specialties: ['NHA_CHU'] })
        .expect(200);
      await api('patch', `/dentists/${users.staffDentist}`, 'staffDentist')
        .send({ licenseNumber: 'CCHN-FAKE' })
        .expect(403);
      await api('patch', `/dentists/${users.staffDentist}`, 'dentist')
        .send({ bio: 'x' })
        .expect(403);
    });

    it('blocks suspending a dentist with upcoming bookings, then refuses new bookings once suspended', async () => {
      const start = new Date(Date.now() + 5 * 24 * 60 * 60000);
      const booked = await db.appointment.create({
        data: {
          patientId,
          dentistId: users.staffDentist,
          startAt: start,
          endAt: new Date(start.getTime() + 30 * 60000),
          status: 'CONFIRMED',
        },
      });
      const blocked = await api('post', `/dentists/${users.staffDentist}/deactivate`)
        .send({ status: 'SUSPENDED', reason: 'Tạm nghỉ phép dài' })
        .expect(409);
      expect(blocked.body.code).toBe('DENTIST_HAS_FUTURE_APPOINTMENTS');
      expect(blocked.body.details.appointments.map((a: { id: string }) => a.id)).toContain(
        booked.id,
      );

      await db.appointment.update({ where: { id: booked.id }, data: { status: 'CANCELLED' } });
      await api('post', `/dentists/${users.staffDentist}/deactivate`)
        .send({ status: 'SUSPENDED', reason: 'Tạm nghỉ phép dài' })
        .expect(200);

      const s = slot();
      await api('post', '/appointments', 'reception')
        .send({ patientId, dentistId: users.staffDentist, ...s, source: 'PHONE' })
        .expect(404);
      const options = await api('get', '/appointments/dentists', 'reception').expect(200);
      expect(options.body.data.map((d: { id: string }) => d.id)).not.toContain(users.staffDentist);
    });

    it('terminating an employee deactivates the linked account', async () => {
      const emp = await api('post', '/employees')
        .send({ fullName: 'reception', employeeType: 'RECEPTIONIST' })
        .expect(201);
      await api('post', `/employees/${emp.body.data.id}/account`)
        .send({ userId: users.reception })
        .expect(200);
      await api('post', `/employees/${emp.body.data.id}/terminate`)
        .send({ reason: 'Hết hợp đồng lao động' })
        .expect(200);
      const account = await db.user.findUniqueOrThrow({ where: { id: users.reception } });
      expect(account.status).toBe('DEACTIVATED');
      expect(
        await db.refreshToken.count({ where: { userId: users.reception, revokedAt: null } }),
      ).toBe(0);
    });
  });

  describe('service catalogue (ADR-0009 phase 2)', () => {
    let categoryId: string;
    let serviceId: string;
    let dentistId: string;

    beforeAll(async () => {
      const role = await db.role.findFirstOrThrow({ where: { code: 'dentist' } });
      const u = await db.user.create({
        data: {
          email: 'catalog-dentist@test.local',
          fullName: 'Catalog dentist',
          passwordHash: 'fixture',
          status: 'ACTIVE',
          userRoles: { create: { roleId: role.id } },
        },
      });
      dentistId = u.id;
      const employee = await db.employee.create({
        data: {
          code: 'NV-CAT01',
          fullName: 'Catalog dentist',
          employeeType: 'DENTIST',
          userId: u.id,
        },
      });
      await db.dentistProfile.create({
        data: {
          employeeId: employee.id,
          userId: u.id,
          calendarColor: '#65A30D',
          specialties: ['TONG_QUAT'],
        },
      });
    });

    it('lets only admins manage the catalogue', async () => {
      await api('post', '/service-categories', 'dentist')
        .send({ code: 'TEST_CAT', name: 'Nhóm thử' })
        .expect(403);
      const category = await api('post', '/service-categories')
        .send({ code: 'TEST_CAT', name: 'Nhóm thử', sortOrder: 99 })
        .expect(201);
      categoryId = category.body.data.id;
      const created = await api('post', '/services')
        .send({
          code: 'TEST_SVC',
          categoryId,
          name: 'Dịch vụ thử',
          defaultDurationMin: 25,
          bufferAfterMin: 5,
          basePrice: 300000,
        })
        .expect(201);
      serviceId = created.body.data.id;
      expect(created.body.data.basePrice).toBe(300000);
      const duplicate = await api('post', '/services')
        .send({ code: 'TEST_SVC', categoryId, name: 'Trùng mã', defaultDurationMin: 30 })
        .expect(409);
      expect(duplicate.body.code).toBe('CATALOG_CODE_TAKEN');
      await api('get', '/services', 'dentist').expect(200);
    });

    it('rejects a service requiring a specialty the dentist lacks', async () => {
      const implant = await api('post', '/services')
        .send({
          code: 'TEST_IMPLANT',
          categoryId,
          name: 'Implant thử',
          defaultDurationMin: 90,
          requiredSpecialty: 'IMPLANT',
        })
        .expect(201);
      const res = await api('post', `/dentists/${dentistId}/services`)
        .send({ serviceId: implant.body.data.id })
        .expect(409);
      expect(res.body.code).toBe('SPECIALTY_REQUIRED');
    });

    it('assigns a service once and lists the dentist as able to perform it', async () => {
      const assigned = await api('post', `/dentists/${dentistId}/services`)
        .send({ serviceId, durationMin: 30 })
        .expect(201);
      expect(assigned.body.data).toMatchObject({
        effectiveDurationMin: 30,
        effectivePrice: 300000,
        current: true,
      });
      const overlap = await api('post', `/dentists/${dentistId}/services`)
        .send({ serviceId })
        .expect(409);
      expect(overlap.body.code).toBe('ASSIGNMENT_OVERLAP');
      const performers = await api('get', `/services/${serviceId}/dentists`, 'dentist').expect(200);
      expect(performers.body.data.map((a: { dentist: { id: string } }) => a.dentist.id)).toContain(
        dentistId,
      );
    });

    it('deactivating a service ends its assignments and blocks new ones', async () => {
      await api('post', `/services/${serviceId}/deactivate`).expect(200);
      const rows = await db.dentistService.findMany({ where: { serviceId } });
      expect(rows.every(r => r.effectiveTo !== null)).toBe(true);
      await api('post', `/dentists/${dentistId}/services`)
        .send({
          serviceId,
          effectiveFrom: new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10),
        })
        .expect(409);
      const listed = await api('get', '/services').expect(200);
      expect(listed.body.data.map((s: { id: string }) => s.id)).not.toContain(serviceId);
    });
  });

  it("a custom role holding encounter.cancel cannot cancel another dentist's encounter", async () => {
    // encounter.cancel is admin-only in the seeded roles; a custom role may be
    // given it, and must then be limited to its own encounters like every
    // other clinical write (404, not 403, so ids can't be probed).
    const encounterId = await fixtureEncounter();
    // Permissions are reloaded from the database on every request
    // (JwtStrategy), so the custom role has to exist for real.
    const perms = await db.permission.findMany({
      where: { code: { in: ['encounter.read.own', 'encounter.cancel'] } },
    });
    const role = await db.role.create({
      data: {
        code: 'senior_dentist_test',
        name: 'Bác sĩ trưởng (test)',
        rolePermissions: { create: perms.map(p => ({ permissionId: p.id })) },
      },
    });
    const senior = await db.user.create({
      data: {
        email: 'senior-dentist@test.local',
        fullName: 'Senior dentist',
        passwordHash: 'fixture',
        status: 'ACTIVE',
        userRoles: { create: { roleId: role.id } },
      },
    });
    const token = app
      .get(JwtService)
      .sign({ sub: senior.id, email: senior.email, permissions: [] });
    await request(app.getHttpServer())
      .post(`/api/v1/medical-records/encounters/${encounterId}/cancel`)
      .auth(token, { type: 'bearer' })
      .send({ reason: 'Không phải lượt khám của tôi' })
      .expect(404);
    expect((await db.encounter.findUniqueOrThrow({ where: { id: encounterId } })).status).toBe(
      'IN_PROGRESS',
    );
    await api('post', `/medical-records/encounters/${encounterId}/cancel`)
      .send({ reason: 'Quản trị hủy' })
      .expect(200);
  });
});

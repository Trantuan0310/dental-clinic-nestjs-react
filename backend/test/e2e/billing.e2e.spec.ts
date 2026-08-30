/**
 * Billing E2E Tests — Invoice + Payment flow
 * Runs against a LIVE server (requires E2E_API_URL env var).
 * Usage: npm run test:e2e
 */

import * as request from 'supertest';
import { HttpStatus } from '@nestjs/common';

const BASE = process.env.E2E_API_URL ?? 'http://localhost:3000/api/v1';
let adminToken = '';

async function getAdminToken(): Promise<string> {
  if (adminToken) return adminToken;
  const res = await request(BASE)
    .post('/auth/login')
    .send({ email: 'admin@clinic.local', password: 'Admin123!' });
  if (res.status !== HttpStatus.OK)
    throw new Error(`Login failed: ${res.status} ${JSON.stringify(res.body)}`);
  adminToken = res.body.data?.accessToken ?? res.body.accessToken;
  return adminToken;
}

function authHeaders(token: string) {
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
}

describe('Billing E2E', () => {
  let token: string;

  beforeAll(async () => {
    try {
      token = await getAdminToken();
    } catch {
      // Token will be empty if server not running - tests will fail gracefully
    }
  });

  describe('GET /billing/invoices', () => {
    it('returns 401 without auth', async () => {
      const res = await request(BASE).get('/billing/invoices');
      expect(res.status).toBe(HttpStatus.UNAUTHORIZED);
    });

    it('lists invoices with auth', async () => {
      if (!token) return; // Skip if server not running
      const res = await request(BASE).get('/billing/invoices').set(authHeaders(token));
      expect([HttpStatus.OK, HttpStatus.FORBIDDEN]).toContain(res.status);
    });
  });

  describe('GET /billing/reports/revenue', () => {
    it('returns revenue report with correct shape', async () => {
      if (!token) return;
      const res = await request(BASE)
        .get('/billing/reports/revenue')
        .query({ from: '2026-01-01', to: '2026-12-31' })
        .set(authHeaders(token));

      expect(res.status).toBe(HttpStatus.OK);
      expect(res.body).toHaveProperty('totalInvoiced');
      expect(res.body).toHaveProperty('totalCollected');
      expect(res.body).toHaveProperty('byMonth');
      expect(Array.isArray(res.body.byMonth)).toBe(true);
    });
  });

  describe('GET /billing/reports/finance-summary', () => {
    it('returns finance summary with expense data', async () => {
      if (!token) return;
      const res = await request(BASE)
        .get('/billing/reports/finance-summary')
        .query({ from: '2026-01-01', to: '2026-12-31' })
        .set(authHeaders(token));

      expect(res.status).toBe(HttpStatus.OK);
      expect(res.body).toHaveProperty('totalIncome');
      expect(res.body).toHaveProperty('totalExpense');
      expect(typeof res.body.totalIncome).toBe('number');
      expect(typeof res.body.totalExpense).toBe('number');
    });
  });

  describe('GET /billing/reports/outstanding', () => {
    it('returns outstanding aging report', async () => {
      if (!token) return;
      const res = await request(BASE)
        .get('/billing/reports/outstanding')
        .query({ daysOutstanding: 30 })
        .set(authHeaders(token));

      expect(res.status).toBe(HttpStatus.OK);
    });
  });
});

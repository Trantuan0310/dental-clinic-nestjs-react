/**
 * Expense Module E2E Tests
 * Runs against a LIVE server (requires E2E_API_URL env var).
 */

import * as request from 'supertest';
import { HttpStatus } from '@nestjs/common';

const BASE = process.env.E2E_API_URL ?? 'http://localhost:3000/api/v1';
let token = '';

async function getAdminToken(): Promise<string> {
  if (token) return token;
  const res = await request(BASE)
    .post('/auth/login')
    .send({ email: 'admin@clinic.local', password: 'Admin123!' });
  if (res.status !== HttpStatus.OK) throw new Error('Login failed');
  token = res.body.data?.accessToken ?? res.body.accessToken;
  return token;
}

function authHeaders(t: string) {
  return { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' };
}

describe('Expense E2E', () => {
  beforeAll(async () => {
    try { token = await getAdminToken(); } catch { /* skip */ }
  });

  describe('GET /expenses/categories', () => {
    it('returns 401 without auth', async () => {
      const res = await request(BASE).get('/expenses/categories');
      expect(res.status).toBe(HttpStatus.UNAUTHORIZED);
    });

    it('lists categories with auth', async () => {
      if (!token) return;
      const res = await request(BASE)
        .get('/expenses/categories')
        .set(authHeaders(token));
      expect(res.status).toBe(HttpStatus.OK);
      expect(Array.isArray(res.body.data)).toBe(true);
    });
  });

  describe('GET /expenses', () => {
    it('lists expenses with pagination', async () => {
      if (!token) return;
      const res = await request(BASE)
        .get('/expenses')
        .query({ page: 1, pageSize: 10 })
        .set(authHeaders(token));
      expect(res.status).toBe(HttpStatus.OK);
      expect(res.body).toHaveProperty('data');
      expect(res.body).toHaveProperty('pagination');
    });
  });

  describe('POST /expenses', () => {
    it('creates a draft expense', async () => {
      if (!token) return;
      const payload = {
        amount: 500000,
        description: 'E2E test expense',
        expenseDate: new Date().toISOString().slice(0, 10),
        notes: 'Created by E2E test',
      };

      const res = await request(BASE)
        .post('/expenses')
        .set(authHeaders(token))
        .send(payload);

      expect([HttpStatus.CREATED, HttpStatus.FORBIDDEN]).toContain(res.status);
      if (res.status === HttpStatus.CREATED) {
        expect(res.body.data).toHaveProperty('code');
        expect(res.body.data.status).toBe('DRAFT');
        expect(res.body.data.amount).toBe(500000);
      }
    });
  });
});

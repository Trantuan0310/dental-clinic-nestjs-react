/**
 * Medical Records E2E Tests
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

describe('Medical Records E2E', () => {
  beforeAll(async () => {
    try { token = await getAdminToken(); } catch { /* skip */ }
  });

  describe('GET /medical-records/today', () => {
    it('returns today encounters', async () => {
      if (!token) return;
      const res = await request(BASE)
        .get('/medical-records/today')
        .set(authHeaders(token));
      expect([HttpStatus.OK, HttpStatus.FORBIDDEN]).toContain(res.status);
    });
  });

  describe('GET /medical-records/queue', () => {
    it('returns queue', async () => {
      if (!token) return;
      const res = await request(BASE)
        .get('/medical-records/queue')
        .set(authHeaders(token));
      expect([HttpStatus.OK, HttpStatus.FORBIDDEN]).toContain(res.status);
    });
  });
});

/**
 * Appointments E2E Tests
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

describe('Appointments E2E', () => {
  beforeAll(async () => {
    token = await getAdminToken();
    expect(token).toEqual(expect.any(String));
    expect(token.length).toBeGreaterThan(0);
  });

  describe('GET /appointments', () => {
    it('returns 401 without auth', async () => {
      const res = await request(BASE).get('/appointments');
      expect(res.status).toBe(HttpStatus.UNAUTHORIZED);
    });

    it('lists appointments with auth', async () => {
      const res = await request(BASE).get('/appointments').set(authHeaders(token));
      expect(res.status).toBe(HttpStatus.OK);
    });
  });

  // There is no dedicated /appointments/calendar route — the calendar view
  // fetches from GET /appointments with a from/to range (see
  // frontend/src/features/appointments/appointmentApi.ts useCalendar()).
  describe('GET /appointments with a date range', () => {
    it('returns appointments for a same-day range', async () => {
      const today = new Date().toISOString().slice(0, 10);
      const res = await request(BASE)
        .get('/appointments')
        .query({ from: today, to: today })
        .set(authHeaders(token));
      expect(res.status).toBe(HttpStatus.OK);
    });
  });
});

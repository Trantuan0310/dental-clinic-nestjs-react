import { chromium, type FullConfig } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';

/**
 * Logs in once per role and saves the authenticated browser state to disk,
 * so individual tests can start already-authenticated (via `storageState`
 * in playwright.config.ts) instead of re-submitting the login form.
 *
 * This matters beyond speed: POST /auth/login is throttled to 5 requests/
 * 60s (see backend/src/auth/auth.controller.ts). With ~50 tests each doing
 * their own fresh login, the suite blew through that limit almost
 * immediately — every login past the first handful got a 429, the page
 * never left /login, and `page.waitForURL(...)` in the old per-test login
 * helper timed out. Logging in once here and reusing the saved session
 * sidesteps the throttle entirely.
 */
async function globalSetup(config: FullConfig) {
  const backendRoot = resolve('../backend');
  const fixtureCommand = (args: string[], dentistEmail?: string) => execFileSync(process.execPath, [
    '-r', 'ts-node/register', 'prisma/seed-demo-window.ts', ...args,
  ], {
    cwd: backendRoot,
    encoding: 'utf8',
    env: dentistEmail ? { ...process.env, E2E_DENTIST_USERNAME: dentistEmail } : process.env,
  }).trim();
  // flow-patient-to-payment books the main dentist and flow-inventory-stock-out
  // the second one: both must book within 15 minutes of "now" to be able to
  // check in, so on one calendar the first booking left the second no slot.
  const demoDentists = [
    process.env.E2E_DENTIST_USERNAME ?? 'an.nguyen@clinic.local',
    process.env.E2E_SECOND_DENTIST_USERNAME ?? 'binh.tran@clinic.local',
  ];
  const scheduleIds: string[] = [];
  const cleanup = () => {
    for (const id of scheduleIds.splice(0)) {
      fixtureCommand(['cleanup', id]);
      console.log('[e2e] Temporary demo schedule removed.');
    }
  };
  const baseURL = config.projects[0].use.baseURL ?? 'http://localhost:5173';
  const authDir = process.env.E2E_AUTH_DIR ?? 'e2e/.auth';
  mkdirSync(authDir, { recursive: true });
  const browser = await chromium.launch();

  const roles: Array<{ email: string; password: string; file: string }> = [
    {
      email: process.env.E2E_USERNAME ?? 'admin@clinic.local',
      password: process.env.E2E_PASSWORD ?? 'Admin123!',
      file: `${authDir}/admin.json`,
    },
    {
      email: process.env.E2E_DENTIST_USERNAME ?? 'an.nguyen@clinic.local',
      password: process.env.E2E_DENTIST_PASSWORD ?? 'Password123!',
      file: `${authDir}/dentist.json`,
    },
  ];

  try {
  // On by default: the base seed never creates a WorkingSchedule row (see
  // backend/prisma/seed.ts), so flow-patient-to-payment.spec.ts's booking
  // step always 400s with "Dentist has no working schedule for this day"
  // unless something provides one. The fixture is a no-op when a real
  // schedule already covers today, so leaving it on for ordinary runs is
  // safe — set E2E_DEMO_SCHEDULE=0 to opt out (e.g. against a DB that's
  // already seeded with a real recurring schedule).
  if (process.env.E2E_DEMO_SCHEDULE !== '0') {
    for (const email of demoDentists) {
      const scheduleId = fixtureCommand([], email);
      if (scheduleId !== 'none') {
        scheduleIds.push(scheduleId);
        console.log(`[e2e] Temporary local demo schedule for ${email}: ${scheduleId}`);
      }
    }
  }
  for (const role of roles) {
    const page = await browser.newPage({ baseURL });
    await page.goto('/login');
    await page.getByLabel(/email/i).fill(role.email);
    await page.getByLabel(/mật khẩu|password/i).fill(role.password);
    await page.getByRole('button', { name: /đăng nhập/i }).click();
    await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 15_000 });
    await page.context().storageState({ path: role.file });
    await page.close();
  }

  } catch (error) {
    cleanup();
    throw error;
  } finally {
    await browser.close();
  }
  return cleanup;
}

export default globalSetup;

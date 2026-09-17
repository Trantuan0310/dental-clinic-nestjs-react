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
  const fixtureCommand = (args: string[]) => execFileSync(process.execPath, [
    '-r', 'ts-node/register', 'prisma/seed-demo-window.ts', ...args,
  ], { cwd: backendRoot, encoding: 'utf8' }).trim();
  let scheduleId = 'none';
  const cleanup = () => {
    if (scheduleId !== 'none') {
      fixtureCommand(['cleanup', scheduleId]);
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
  scheduleId = process.env.E2E_DEMO_SCHEDULE === '1' ? fixtureCommand([]) : 'none';
  if (scheduleId !== 'none') console.log(`[e2e] Temporary local demo schedule: ${scheduleId}`);
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

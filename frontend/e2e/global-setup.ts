import { chromium, type FullConfig } from '@playwright/test';
import { mkdirSync } from 'node:fs';

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
  const baseURL = config.projects[0].use.baseURL ?? 'http://localhost:5173';
  mkdirSync('e2e/.auth', { recursive: true });
  const browser = await chromium.launch();

  const roles: Array<{ email: string; password: string; file: string }> = [
    {
      email: process.env.E2E_USERNAME ?? 'admin@clinic.local',
      password: process.env.E2E_PASSWORD ?? 'Admin123!',
      file: 'e2e/.auth/admin.json',
    },
    {
      email: process.env.E2E_DENTIST_USERNAME ?? 'an.nguyen@clinic.local',
      password: process.env.E2E_DENTIST_PASSWORD ?? 'Password123!',
      file: 'e2e/.auth/dentist.json',
    },
  ];

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

  await browser.close();
}

export default globalSetup;

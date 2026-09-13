import { test, expect, type Page } from './fixtures';
import type { Browser } from '@playwright/test';

/**
 * Local login helper (deliberately NOT the shared login() in fixtures.ts,
 * which only supports one role via env vars). Mirrors its implementation
 * exactly, just parameterized per role so all three can log in fresh in
 * the same file.
 */
async function loginAs(page: Page, email: string, password: string): Promise<void> {
  await page.goto('/login');
  await page.getByLabel(/email/i).fill(email);
  await page.getByLabel(/mật khẩu|password/i).fill(password);
  await page.getByRole('button', { name: /đăng nhập/i }).click();
  await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 15_000 });
}

/**
 * A dedicated, guaranteed-blank context for a test that performs a real
 * interactive login. `browser.newContext()` with no arguments looks like
 * it should start empty, but the `browser` fixture provided by
 * @playwright/test inherits `use.storageState` from playwright.config.ts
 * (here, 'e2e/.auth/admin.json') as a default for ANY context it creates —
 * including ones you construct yourself, not just the built-in `context`/
 * `page` fixtures. Confirmed live while debugging this file: a bare
 * `browser.newContext()` in the 'dentist' test below came back with
 * admin's refreshToken cookie already set (`context.cookies()` returned it
 * before any navigation), so `goto('/login')` immediately bounced to the
 * admin-authenticated dashboard instead of showing the login form, and the
 * next line (`getByLabel(/email/i).fill(...)`) hung for the full test
 * timeout waiting for a field that was never going to appear. Passing an
 * explicit empty storageState is the fix — see Playwright's own docs on
 * "test isolation" for the same gotcha.
 */
function freshContext(browser: Browser) {
  return browser.newContext({ storageState: { cookies: [], origins: [] } });
}

/**
 * QA supplement to appointment-booking.spec.ts (2026-09-12).
 *
 * appointment-booking.spec.ts relies on the globally pre-baked
 * storageState (e2e/.auth/*.json, captured once in global-setup.ts). Reusing
 * that same captured session across multiple fresh browser contexts trips
 * the backend's refresh-token-reuse detector (see
 * backend/src/auth/auth.service.ts getUserFromRefreshToken /
 * TokenReuseDetectedException): the first context to silently refresh
 * rotates the token, and every other context still holding the old
 * snapshot gets treated as replaying a stolen token, which revokes ALL
 * sessions and bounces the page back to /login. That's what made
 * "appointment list page loads" and "can switch between calendar views"
 * fail consistently (reproduced both with default parallel workers and
 * with --workers=1) — the shared snapshot, not the appointments feature.
 *
 * These tests dodge that entirely by performing a fresh, real login per
 * test (via loginAs() below, which POSTs /auth/login and gets its own
 * unique token pair) instead of depending on the shared storageState.
 *
 * The rest of the suite now fixes the general case differently (see
 * fixtures.ts: the default `page`/`context` fixtures share one long-lived,
 * self-rotating context per storageState instead of a frozen one-shot
 * snapshot). That fix only works for tests that don't themselves log in —
 * these three deliberately DO (to prove each role's own login works), so
 * they keep their own disposable context per test instead of the shared
 * fixture, same reasoning either way: never call a real login on a session
 * other tests expect to still be valid afterward. See freshContext() above
 * for why that disposable context needs an explicit empty storageState.
 */
test.describe('Appointment booking — per-role access (fresh login, no shared storageState)', () => {
  test('dentist can log in and reach the appointments calendar + list', async ({ browser }) => {
    const context = await freshContext(browser);
    const page = await context.newPage();
    try {
      await loginAs(page, 'an.nguyen@clinic.local', 'Password123!');

      await page.goto('/appointments');
      await page.waitForLoadState('networkidle');
      await expect(page.getByRole('button', { name: /^ngày$/i })).toBeVisible();
      await expect(page.getByRole('button', { name: /^tuần$/i })).toBeVisible();
      await expect(page.getByRole('button', { name: /^tháng$/i })).toBeVisible();

      await page.goto('/appointments/list');
      await page.waitForLoadState('networkidle');
      await expect(page.locator('main')).toBeVisible();
    } finally {
      await context.close();
    }
  });

  test('receptionist can log in and reach the appointments calendar + list', async ({ browser }) => {
    const context = await freshContext(browser);
    const page = await context.newPage();
    try {
      await loginAs(page, 'hanh.le@clinic.local', 'Password123!');

      await page.goto('/appointments');
      await page.waitForLoadState('networkidle');
      await expect(page.getByRole('button', { name: /^ngày$/i })).toBeVisible();

      await page.goto('/appointments/list');
      await page.waitForLoadState('networkidle');
      await expect(page.locator('main')).toBeVisible();
    } finally {
      await context.close();
    }
  });

  test('clinic_admin can log in and reach the appointments calendar + list', async ({ browser }) => {
    const context = await freshContext(browser);
    const page = await context.newPage();
    try {
      await loginAs(page, 'admin@clinic.local', 'Admin123!');

      await page.goto('/appointments');
      await page.waitForLoadState('networkidle');
      await expect(page.getByRole('button', { name: /^ngày$/i })).toBeVisible();

      await page.goto('/appointments/list');
      await page.waitForLoadState('networkidle');
      await expect(page.locator('main')).toBeVisible();
    } finally {
      await context.close();
    }
  });
});

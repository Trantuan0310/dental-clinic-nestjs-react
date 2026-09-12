import { test, expect, type Page } from './fixtures';

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
 */
test.describe('Appointment booking — per-role access (fresh login, no shared storageState)', () => {
  test('dentist can log in and reach the appointments calendar + list', async ({ page }) => {
    await loginAs(page, 'an.nguyen@clinic.local', 'Password123!');

    await page.goto('/appointments');
    await page.waitForLoadState('networkidle');
    await expect(page.getByRole('button', { name: /^ngày$/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /^tuần$/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /^tháng$/i })).toBeVisible();

    await page.goto('/appointments/list');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('main')).toBeVisible();
  });

  test('receptionist can log in and reach the appointments calendar + list', async ({ page }) => {
    await loginAs(page, 'hanh.le@clinic.local', 'Password123!');

    await page.goto('/appointments');
    await page.waitForLoadState('networkidle');
    await expect(page.getByRole('button', { name: /^ngày$/i })).toBeVisible();

    await page.goto('/appointments/list');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('main')).toBeVisible();
  });

  test('clinic_admin can log in and reach the appointments calendar + list', async ({ page, context }) => {
    // Unlike dentist/receptionist, admin is the project's DEFAULT
    // storageState (playwright.config.ts use.storageState), so this
    // context starts pre-authenticated as admin — goto('/login') would
    // just bounce back to the dashboard with no form to fill. Clear
    // storage first to genuinely exercise the login form.
    await context.clearCookies();
    await page.goto('/');
    await page.evaluate(() => localStorage.clear());
    await loginAs(page, 'admin@clinic.local', 'Admin123!');

    await page.goto('/appointments');
    await page.waitForLoadState('networkidle');
    await expect(page.getByRole('button', { name: /^ngày$/i })).toBeVisible();

    await page.goto('/appointments/list');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('main')).toBeVisible();
  });
});

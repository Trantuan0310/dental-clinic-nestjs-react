import { test, expect } from './fixtures';

/**
 * Appointment Booking E2E Test
 * Happy path: Login → Navigate to calendar → Create appointment
 */
test.describe('Appointment Booking', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('calendar page loads with view toolbar', async ({ page }) => {
    await page.goto('/appointments');
    await page.waitForLoadState('networkidle');

    // Should have view switcher (day/week/month). Scope to the toolbar
    // buttons — a plain text locator also matches the page subtitle
    // "Xem lịch hẹn theo ngày/tuần/tháng" (strict-mode violation).
    await expect(page.getByRole('button', { name: /^ngày$/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /^tuần$/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /^tháng$/i })).toBeVisible();
  });

  test('appointment list page loads', async ({ page }) => {
    await page.goto('/appointments/list');
    await page.waitForLoadState('networkidle');

    // Page should render without crash
    await expect(page.locator('main')).toBeVisible();
  });

  test('can switch between calendar views', async ({ page }) => {
    await page.goto('/appointments');
    await page.waitForLoadState('networkidle');

    // Switch to month view
    await page.getByRole('button', { name: /^tháng$/i }).click();
    await page.waitForLoadState('networkidle');

    // Switch to week view
    await page.getByRole('button', { name: /^tuần$/i }).click();
    await page.waitForLoadState('networkidle');

    // Switch to day view
    await page.getByRole('button', { name: /^ngày$/i }).click();
    await page.waitForLoadState('networkidle');
  });
});

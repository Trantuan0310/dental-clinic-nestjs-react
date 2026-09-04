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

    // Should have view switcher (day/week/month)
    await expect(page.getByText(/ngày|day/i)).toBeVisible();
    await expect(page.getByText(/tuần|week/i)).toBeVisible();
    await expect(page.getByText(/tháng|month/i)).toBeVisible();
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
    await page.getByText(/tháng|month/i).click();
    await page.waitForLoadState('networkidle');

    // Switch to week view
    await page.getByText(/tuần|week/i).click();
    await page.waitForLoadState('networkidle');

    // Switch to day view
    await page.getByText(/ngày|day/i).click();
    await page.waitForLoadState('networkidle');
  });
});

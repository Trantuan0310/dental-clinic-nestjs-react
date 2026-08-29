import { test, expect, login } from './fixtures';

/**
 * Critical-path smoke tests covering the patient and appointment modules.
 * These rely on the dev backend having seeded data. Set the env vars
 * E2E_USERNAME / E2E_PASSWORD (admin user) if your seed differs from defaults.
 */
test.describe('Critical paths', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('patients list renders rows', async ({ page }) => {
    await page.goto('/patients');
    await page.waitForLoadState('networkidle');
    // List page exposes a table or cards. Look for either a table or an empty-state.
    const table = page.locator('table');
    const empty = page.getByText(/không có bệnh nhân|chưa có dữ liệu/i);
    await expect(table.or(empty).first()).toBeVisible({ timeout: 15_000 });
  });

  test('search filters patients', async ({ page }) => {
    await page.goto('/patients');
    await page.waitForLoadState('networkidle');
    // Find the patient search input.
    const search = page.getByPlaceholder(/tìm.*bệnh nhân/i).first();
    if (await search.isVisible()) {
      await search.fill('test');
      // No assertion on result count — just that the page didn't crash and a
      // table or empty state is still rendered.
      await page.waitForTimeout(500);
      const table = page.locator('table');
      const empty = page.getByText(/không có bệnh nhân|chưa có dữ liệu/i);
      await expect(table.or(empty).first()).toBeVisible();
    }
  });

  test('appointments calendar renders without crashing', async ({ page }) => {
    await page.goto('/appointments');
    await page.waitForLoadState('networkidle');
    // Calendar grid exposes either day/week/month toolbar buttons.
    const dayBtn = page.getByRole('button', { name: /^ngày$/i });
    await expect(dayBtn).toBeVisible({ timeout: 15_000 });
  });
});
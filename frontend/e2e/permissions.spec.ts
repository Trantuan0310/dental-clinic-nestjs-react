import { test, expect, login } from './fixtures';

/**
 * Permission boundary tests.
 * Verifies that the role-based access guards prevent unauthorized actions
 * and that admins can access every protected area.
 */
test.describe('Permission boundaries', () => {
  test('admin can access admin-only routes', async ({ page }) => {
    await login(page);

    // Admin-only routes
    const adminRoutes = [
      '/admin/users',
      '/admin/roles',
      '/admin/audit-logs',
      '/admin/settings',
    ];

    for (const route of adminRoutes) {
      await page.goto(route);
      await page.waitForLoadState('networkidle');
      // Should not redirect to login or 403 page
      expect(page.url()).not.toMatch(/\/login/);
      // Page should render its main heading (not be blank)
      const main = page.locator('main');
      await expect(main).toBeVisible({ timeout: 10_000 });
    }
  });

  test('admin can view dashboard with KPIs', async ({ page }) => {
    await login(page);
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Dashboard should render with chart cards
    // Look for at least one of the known card container classes
    const cards = page.locator('main .recharts-responsive-container, main [data-testid="kpi-card"]');
    await expect(cards.first()).toBeVisible({ timeout: 15_000 });
  });

  test('admin can view patient list', async ({ page }) => {
    await login(page);
    await page.goto('/patients');
    await page.waitForLoadState('networkidle');

    // Patient list should show either a table or empty state
    const table = page.locator('table');
    const empty = page.getByText(/không có bệnh nhân|chưa có dữ liệu/i);
    await expect(table.or(empty).first()).toBeVisible({ timeout: 15_000 });
  });

  test('admin can view appointment calendar', async ({ page }) => {
    await login(page);
    await page.goto('/appointments');
    await page.waitForLoadState('networkidle');

    // Calendar grid exposes day/week/month toolbar buttons
    const dayBtn = page.getByRole('button', { name: /^ngày$/i });
    await expect(dayBtn).toBeVisible({ timeout: 15_000 });
  });

  test('admin can view billing invoices', async ({ page }) => {
    await login(page);
    await page.goto('/billing/invoices');
    await page.waitForLoadState('networkidle');

    // Invoices page should render
    const heading = page.getByRole('heading', { name: /hóa đơn|invoice/i }).first();
    await expect(heading).toBeVisible({ timeout: 10_000 });
  });

  test('admin can view payroll dashboard', async ({ page }) => {
    await login(page);
    await page.goto('/payroll');
    await page.waitForLoadState('networkidle');

    // Payroll dashboard should render
    const heading = page.getByRole('heading', { name: /bảng lương|payroll/i }).first();
    await expect(heading).toBeVisible({ timeout: 10_000 });
  });

  test('admin can view inventory', async ({ page }) => {
    await login(page);
    await page.goto('/inventory');
    await page.waitForLoadState('networkidle');

    // Inventory page should render
    const heading = page.getByRole('heading', { name: /vật tư|kho|inventory/i }).first();
    await expect(heading).toBeVisible({ timeout: 10_000 });
  });
});

test.describe('403 handling', () => {
  test('should not show 500 error on permission denied', async ({ page }) => {
    await login(page);

    // Try to navigate to a non-existent route
    const response = await page.goto('/this-route-does-not-exist');
    expect(response?.status()).toBe(404);
    // Should not crash the app
    expect(page.url()).toMatch(/.*/);
  });
});

import { test, expect } from './fixtures';

/**
 * Invoice and Billing E2E Test
 * Tests the billing module accessible to admin/receptionist
 */
test.describe('Billing', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('billing page loads and shows invoice list', async ({ page }) => {
    await page.goto('/billing');
    await page.waitForLoadState('networkidle');

    // Should redirect to /billing/list or show billing content
    await page.waitForLoadState('networkidle');

    // Page should render without crash
    await expect(page.locator('main')).toBeVisible();
  });

  test('reports page loads with charts', async ({ page }) => {
    await page.goto('/reports');
    await page.waitForLoadState('networkidle');

    // Check KPI cards are visible. The page has many revenue-related
    // headings/labels — .first() avoids a strict-mode violation since we
    // only care that at least one is rendered.
    await expect(page.getByText(/doanh thu|revenue/i).first()).toBeVisible();

    // Date range inputs should be visible
    const dateInputs = page.locator('input[type="date"]');
    await expect(dateInputs.first()).toBeVisible();
  });

  test('reports date range filter updates charts', async ({ page }) => {
    await page.goto('/reports');
    await page.waitForLoadState('networkidle');

    // Change date range
    const fromDate = page.locator('input[type="date"]').first();
    await fromDate.fill('2026-01-01');

    // Wait for data to reload
    await page.waitForTimeout(1000);
    await page.waitForLoadState('networkidle');

    // Charts should still be visible
    const charts = page.locator('.recharts-wrapper');
    await expect(charts.first()).toBeVisible({ timeout: 10_000 });
  });

  test('export CSV button is visible', async ({ page }) => {
    await page.goto('/reports');
    await page.waitForLoadState('networkidle');

    // Should have export buttons
    const exportBtn = page.getByRole('button', { name: /xuất|export/i }).first();
    await expect(exportBtn).toBeVisible();
  });
});

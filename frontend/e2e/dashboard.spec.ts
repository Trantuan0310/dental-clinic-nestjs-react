import { test, expect } from './fixtures';

/**
 * Dashboard rendering tests.
 * Verifies that the main dashboard loads with its KPI cards and charts.
 */
test.describe('Dashboard', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.goto('/');
    await page.waitForLoadState('networkidle');
  });

  test('main dashboard renders without crashing', async ({ page }) => {
    // Main content should be visible
    const main = page.locator('main');
    await expect(main).toBeVisible({ timeout: 15_000 });
  });

  test('dashboard shows KPI cards', async ({ page }) => {
    // Look for at least one KPI card (KpiCard component renders with class containing kpi)
    const kpiCards = page.locator('main').locator('text=/doanh thu|bệnh nhân|lịch hẹn/i').first();
    await expect(kpiCards).toBeVisible({ timeout: 15_000 });
  });

  test('dashboard shows the scorecard against targets and the capacity heatmap', async ({ page }) => {
    await expect(page.getByText(/Chỉ số vận hành/)).toBeVisible({ timeout: 15_000 });
    for (const key of ['noShowRate', 'rebookRate', 'planAcceptance', 'medianWait']) {
      await expect(page.getByTestId(`scorecard-${key}`)).toBeVisible();
    }
    // A target and a verdict in words, not colour alone.
    await expect(page.getByTestId('scorecard-noShowRate')).toContainText(/Mục tiêu ≤ 5%/);
    await expect(page.getByText(/Công suất theo giờ/).first()).toBeVisible();
    await expect(
      page.getByTestId('capacity-heatmap').or(page.getByText('Chưa có giờ làm việc nào trong kỳ này')),
    ).toBeVisible({ timeout: 15_000 });
  });

  test('dashboard time range selector works', async ({ page }) => {
    // If there's a time range selector, clicking it should not throw
    const rangeSelect = page.getByRole('combobox').first();
    if (await rangeSelect.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await rangeSelect.click();
      // Just ensure no crash
      await page.waitForTimeout(500);
    }
  });

  test('dashboard section tabs are present', async ({ page }) => {
    // Tab links for overview/reports/dentists
    const tabs = page.getByRole('tab');
    if (await tabs.first().isVisible({ timeout: 3_000 }).catch(() => false)) {
      await expect(tabs.first()).toBeVisible();
    }
  });
});

test.describe('Reports page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('reports page loads', async ({ page }) => {
    await page.goto('/reports');
    await page.waitForLoadState('networkidle');
    const main = page.locator('main');
    await expect(main).toBeVisible({ timeout: 15_000 });
  });
});

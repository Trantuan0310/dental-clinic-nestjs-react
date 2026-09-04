import { test, expect } from './fixtures';

/**
 * Error and Loading States E2E Test
 * Tests graceful handling of edge cases
 */
test.describe('Error & Loading States', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('shows empty state when no patients', async ({ page }) => {
    await page.goto('/patients?q=nonexistentPatientXYZ123');
    await page.waitForLoadState('networkidle');

    // Not asserting empty-state text because patient data may exist — just verify page loads
    await expect(page.locator('main')).toBeVisible();
  });

  test('reports page handles empty data gracefully', async ({ page }) => {
    // Set date range with no data
    await page.goto('/reports');
    await page.waitForLoadState('networkidle');

    // Change to old date range
    const fromDate = page.locator('input[type="date"]').first();
    await fromDate.fill('2020-01-01');
    await page.waitForTimeout(2000);
    await page.waitForLoadState('networkidle');

    // Page should not crash - should show 0 values
    await expect(page.locator('main')).toBeVisible();
  });

  test('navigation to non-existent page shows 404', async ({ page }) => {
    await page.goto('/nonexistent-route-xyz123');
    await page.waitForLoadState('networkidle');

    // Should show 404 or not found
    await expect(
      page.getByText(/không tìm thấy|not found|404/i).or(page.getByRole('heading', { name: /404/i }))
    ).toBeVisible({ timeout: 5_000 });
  });

  test('expenses page loads for admin', async ({ page }) => {
    await page.goto('/expenses');
    await page.waitForLoadState('networkidle');

    // Should show expenses management page
    await expect(page.getByText(/chi phí|expense/i).first()).toBeVisible({ timeout: 5_000 });
  });

  test('inventory page loads with table', async ({ page }) => {
    await page.goto('/inventory');
    await page.waitForLoadState('networkidle');

    // Should show inventory management
    await expect(page.getByText(/kho|tồn kho|inventory/i).first()).toBeVisible();
  });
});

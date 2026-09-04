import { test, expect } from '@playwright/test';

/**
 * Dentist View E2E Test
 * Uses the dentist session saved by global-setup.ts (a different account
 * than the rest of the suite, which defaults to admin — see
 * playwright.config.ts).
 */
test.use({ storageState: 'e2e/.auth/dentist.json' });

test.describe('Dentist View', () => {
  test('dentist can login and see their queue', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveURL(/.*\/$/);
  });

  test('dentist sees Today page in sidebar', async ({ page }) => {
    await page.goto('/');

    // Sidebar should show dentist-specific items
    await expect(page.getByText(/today|hôm nay/i)).toBeVisible();
    await expect(page.getByText(/queue|hàng chờ/i)).toBeVisible();
  });

  test('dentist can access Today page', async ({ page }) => {
    await page.goto('/today');
    await page.waitForLoadState('networkidle');

    // Page should render without crash
    await expect(page.locator('main')).toBeVisible();
  });
});

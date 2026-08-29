import { test, expect } from '@playwright/test';

/**
 * Dentist View E2E Test
 * Uses dentist credentials to test role-specific views
 */
test.describe('Dentist View', () => {
  test('dentist can login and see their queue', async ({ page }) => {
    // Login as dentist
    await page.goto('/login');
    await page.getByLabel(/email/i).fill('dentist@clinic.local');
    await page.getByLabel(/mật khẩu|password/i).fill('Dentist@123');
    await page.getByRole('button', { name: /đăng nhập/i }).click();
    await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 15_000 });

    // Should be on dashboard
    await expect(page).toHaveURL(/.*\/$/);
  });

  test('dentist sees Today page in sidebar', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel(/email/i).fill('dentist@clinic.local');
    await page.getByLabel(/mật khẩu|password/i).fill('Dentist@123');
    await page.getByRole('button', { name: /đăng nhập/i }).click();
    await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 15_000 });

    // Sidebar should show dentist-specific items
    await expect(page.getByText(/today|hôm nay/i)).toBeVisible();
    await expect(page.getByText(/queue|hàng chờ/i)).toBeVisible();
  });

  test('dentist can access Today page', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel(/email/i).fill('dentist@clinic.local');
    await page.getByLabel(/mật khẩu|password/i).fill('Dentist@123');
    await page.getByRole('button', { name: /đăng nhập/i }).click();
    await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 15_000 });

    // Navigate to today
    await page.goto('/today');
    await page.waitForLoadState('networkidle');

    // Page should render without crash
    await expect(page.locator('main')).toBeVisible();
  });
});

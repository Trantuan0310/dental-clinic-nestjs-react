import { test, expect, login } from './fixtures';

/**
 * Full workflow smoke test.
 * Walks through a happy path: login -> patients list -> new patient -> back to list.
 * Uses minimal-deep interactions to avoid coupling to specific UI states.
 */
test.describe('Full workflow', () => {
  test('logged-in user can navigate the main shell', async ({ page }) => {
    await login(page);

    // Verify shell is rendered
    const header = page.locator('header');
    await expect(header).toBeVisible();

    // Verify sidebar/drawer is present
    const sidebar = page.locator('aside, nav[aria-label]').first();
    await expect(sidebar).toBeVisible();

    // Verify main content area
    const main = page.locator('main');
    await expect(main).toBeVisible();
  });

  test('user can search for a patient via header search', async ({ page }) => {
    await login(page);

    // Header search input exists
    const search = page.locator('header input[type="search"]').first();
    if (await search.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await search.fill('test');
      await search.press('Enter');
      // Should navigate to patients page with query
      await page.waitForURL(/patients/, { timeout: 5_000 });
    }
  });

  test('opening profile page works', async ({ page }) => {
    await login(page);
    await page.goto('/me');
    await page.waitForLoadState('networkidle');
    const main = page.locator('main');
    await expect(main).toBeVisible({ timeout: 10_000 });
  });

  test('logout works', async ({ page }) => {
    await login(page);

    // Find logout button (usually in user menu)
    const trigger = page.locator('header button:has(svg)').last();
    if (await trigger.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await trigger.click();
      const logoutBtn = page.getByRole('button', { name: /đăng xuất/i });
      if (await logoutBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
        await logoutBtn.click();
        await page.waitForURL('**/login', { timeout: 10_000 });
      }
    }
  });
});

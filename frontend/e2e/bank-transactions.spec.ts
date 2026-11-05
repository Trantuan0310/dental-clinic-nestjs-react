import { test, expect, getSharedContext } from './fixtures';

/**
 * A6.3: the list of bank transfers the system left for a person. CI has no
 * bank, so this checks the page opens from the menu with its two lists; the
 * webhook itself runs against real PostgreSQL in test/isolated.
 */
test('the bank-transfers-to-check page opens from the menu with its two lists', async ({ browser }) => {
  // Shared admin context: the admin.json refresh cookie is single-use.
  const admin = await getSharedContext(browser, 'e2e/.auth/admin.json');
  const page = await admin.newPage();
  try {
    await page.goto('/');
    await page.getByRole('link', { name: 'Chuyển khoản cần xử lý' }).click();
    await expect(page).toHaveURL(/\/billing\/bank-transactions$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Chuyển khoản cần xử lý' })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Cần xử lý' })).toBeVisible();
    await page.getByRole('tab', { name: 'Đã xử lý' }).click();
    await expect(page.getByRole('tab', { name: 'Đã xử lý' })).toHaveAttribute('aria-selected', 'true');
  } finally {
    await page.close();
  }
});

import { test, expect, getSharedContext } from './fixtures';

/**
 * The item page's "Xem tất cả" opened /inventory/movements, a page that did
 * not exist (404). It is the stock history now: one item from that link,
 * every item once the item filter is cleared, filters kept in the URL.
 */
test('the item page links to its full stock history', async ({ browser }) => {
  // Shared admin context: the admin.json refresh cookie is single-use.
  const admin = await getSharedContext(browser, 'e2e/.auth/admin.json');
  const page = await admin.newPage();
  try {
    await page.goto('/inventory');
    const firstRow = page.locator('tbody tr').first();
    await expect(firstRow).toBeVisible({ timeout: 15_000 });
    await firstRow.click();
    await expect(page).toHaveURL(/\/inventory\/items\//);

    await page.getByRole('link', { name: 'Xem tất cả' }).click();
    await expect(page).toHaveURL(/\/inventory\/movements\?itemId=/);
    await expect(page.getByRole('heading', { level: 1, name: 'Lịch sử xuất nhập' })).toBeVisible();
    await expect(page.getByText(/^Vật tư: /)).toBeVisible();

    await page.getByRole('button', { name: 'Xem tất cả vật tư' }).click();
    await expect(page).toHaveURL(/\/inventory\/movements$/);
    await expect(page.getByRole('columnheader', { name: 'Vật tư' })).toBeVisible();
  } finally {
    await page.close();
  }
});

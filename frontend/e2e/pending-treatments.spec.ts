import { test, expect, getSharedContext } from './fixtures';

/**
 * A7: accepted treatment with nothing booked. CI has no fixed plan data, so
 * this checks the page and its two lists render; the grouping and the
 * "booked or not" rule are covered by the backend unit tests.
 */
test('the treatment-to-book list opens from the menu with its two lists', async ({ browser }) => {
  // Shared admin context: the admin.json refresh cookie is single-use.
  const admin = await getSharedContext(browser, 'e2e/.auth/admin.json');
  const page = await admin.newPage();
  try {
    await page.goto('/');
    await page.getByRole('link', { name: 'Điều trị chờ đặt lịch' }).click();
    await expect(page).toHaveURL(/\/pending-treatments$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Điều trị chờ đặt lịch' })).toBeVisible();
    await expect(page.getByTestId('pending-summary')).toBeVisible({ timeout: 15_000 });

    await expect(page.getByRole('tab', { name: 'Chưa đặt lịch' })).toBeVisible();
    await page.getByRole('tab', { name: 'Đã có lịch' }).click();
    await expect(page.getByRole('tab', { name: 'Đã có lịch' })).toHaveAttribute('aria-selected', 'true');
  } finally {
    await page.close();
  }
});

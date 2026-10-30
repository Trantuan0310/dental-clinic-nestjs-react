import { test, expect, getSharedContext } from './fixtures';

/**
 * The manager's AI commentary on the Reports page. CI runs without a model,
 * so this checks the plain-facts answer the button falls back to; the model
 * path is covered by the backend unit tests (ai-assist.service.spec.ts).
 */
test('reports page comments on the selected period', async ({ browser }) => {
  // Shared admin context: the admin.json refresh cookie is single-use.
  const admin = await getSharedContext(browser, 'e2e/.auth/admin.json');
  const page = await admin.newPage();
  try {
    await page.goto('/reports');
    const card = page.getByRole('heading', { name: 'AI nhận xét kỳ báo cáo' });
    await expect(card).toBeVisible({ timeout: 15_000 });

    await page.getByRole('button', { name: 'Nhận xét', exact: true }).click();
    const points = page.getByTestId('report-commentary').locator('li');
    await expect(points.first()).toBeVisible();
    expect(await points.count()).toBeGreaterThanOrEqual(2);
    await expect(page.getByText(/Bản nháp do AI soạn|Chưa dùng được AI/)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Soạn lại' })).toBeVisible();
  } finally {
    await page.close();
  }
});

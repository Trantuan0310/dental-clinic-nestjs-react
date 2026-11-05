import { test, expect, getSharedContext } from './fixtures';

/** The manager's patient journey card on the Dashboard shows, with data or its empty state. */
test('dashboard shows the patient journey card', async ({ browser }) => {
  // Shared admin context: the admin.json refresh cookie is single-use.
  const admin = await getSharedContext(browser, 'e2e/.auth/admin.json');
  const page = await admin.newPage();
  try {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: /Hành trình bệnh nhân/ })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId('patient-funnel').or(page.getByText('Chưa có lịch hẹn nào trong kỳ này'))).toBeVisible();
  } finally {
    await page.close();
  }
});

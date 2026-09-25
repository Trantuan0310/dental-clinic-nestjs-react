import { test, expect } from './fixtures';

/** BR-SCH-001: a dentist's leave is a request until an admin approves it. */
test.use({ storageState: 'e2e/.auth/dentist.json' });

test('a dentist requests leave, sees it pending and withdraws it', async ({ page }) => {
  const start = new Date(Date.now() + 45 * 86400000);
  const local = (d: Date, hh: string) => `${d.toISOString().slice(0, 10)}T${hh}`;
  const reason = `E2E xin nghỉ ${Date.now()}`;

  await page.goto('/schedule');
  await page.getByRole('tab', { name: /^Nghỉ phép/ }).click();
  await page.getByRole('button', { name: /xin nghỉ phép/i }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByText(/chờ duyệt và chưa chặn lịch hẹn/)).toBeVisible();
  await dialog.getByLabel('Từ').fill(local(start, '08:00'));
  await dialog.getByLabel('Đến').fill(local(start, '12:00'));
  await dialog.getByLabel('Lý do (không bắt buộc)').fill(reason);
  await dialog.getByRole('button', { name: /gửi đơn/i }).click();
  await expect(dialog).toBeHidden();

  const row = page.locator('tbody tr', { hasText: reason });
  await expect(row.getByText('Chờ duyệt')).toBeVisible();
  // A dentist cannot approve their own request.
  await expect(row.getByRole('button', { name: 'Duyệt' })).toHaveCount(0);
  await row.getByRole('button', { name: 'Hủy' }).click();
  await expect(row.getByText('Đã hủy')).toBeVisible();
});

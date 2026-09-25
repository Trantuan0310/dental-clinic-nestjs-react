import { test, expect } from './fixtures';

/**
 * ADR-0009 phase 3 — admin side: close one day of a dentist's calendar,
 * see it listed, then remove it. (The dentist's leave request is covered by
 * schedule-time-off-request.spec.ts.)
 */
test('admin closes a dentist day and removes the override', async ({ page }) => {
  const day = new Date(Date.now() + 40 * 86400000);
  const iso = day.toISOString().slice(0, 10);
  const shown = `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
  const reason = `E2E đóng lịch ${Date.now()}`;

  await page.goto('/schedule');
  await page.getByRole('tab', { name: 'Ngoại lệ theo ngày' }).click();
  await page.getByRole('button', { name: /thêm ngoại lệ/i }).click();
  const dialog = page.getByRole('dialog');
  const dentist = dialog.getByLabel('Bác sĩ');
  await dentist.selectOption({ index: 1 });
  await dialog.getByLabel('Ngày').fill(iso);
  await dialog.getByLabel('Lý do').fill(reason);
  await dialog.getByRole('button', { name: /^lưu$/i }).click();
  await expect(dialog).toBeHidden();

  const row = page.locator('tbody tr', { hasText: reason });
  await expect(row).toContainText(shown);
  await expect(row).toContainText('Cả ngày');
  await row.getByRole('button', { name: `Xóa ngoại lệ ngày ${shown}` }).click();
  await expect(row).toBeHidden();
});

import { test, expect } from './fixtures';

/**
 * ADR-0009 phase 6 — front desk dispatch board: a walk-in joins Dung's
 * queue, is put first as an emergency, called, skipped, then leaves (LEFT
 * frees the slot, so the spec can run again). Dung's demo window is opened
 * by global-setup.
 */
test('front desk calls, prioritises, skips and closes a queued patient', async ({ page }) => {
  await page.goto('/appointments/list');
  await page.getByRole('button', { name: 'Khách vãng lai' }).click();
  const walkIn = page.getByRole('dialog', { name: 'Tiếp nhận khách vãng lai' });
  await walkIn.getByLabel('Tìm bệnh nhân *').fill('Lê');
  const pick = walkIn.getByRole('button', { name: /chọn →/i }).first();
  const name = (await pick.locator('span.font-medium').innerText()).trim();
  await pick.click();
  await walkIn.getByLabel('Bác sĩ *').selectOption({ label: 'BS. Phạm Thị Dung' });
  await walkIn.getByRole('button', { name: 'Tiếp nhận' }).click();
  await expect(walkIn).toBeHidden();

  await page.goto('/dispatch');
  const board = page.getByRole('region', { name: 'Hàng đợi BS. Phạm Thị Dung' });
  const item = board.getByRole('listitem').filter({ hasText: name });
  await expect(item).toContainText('Vãng lai');

  const dialog = page.getByRole('dialog');
  await item.getByRole('button', { name: 'Cấp cứu' }).click();
  await dialog.getByLabel(/Lý do/).fill('Sưng mặt, sốt cao');
  await dialog.getByRole('button', { name: 'Đưa lên đầu' }).click();
  await expect(item).toContainText('Cấp cứu');

  await item.getByRole('button', { name: 'Gọi', exact: true }).click();
  await expect(item).toContainText('Đang gọi');

  await item.getByRole('button', { name: 'Bỏ qua' }).click();
  await dialog.getByLabel(/Lý do/).fill('Gọi 2 lần không thấy');
  await dialog.getByRole('button', { name: 'Bỏ qua' }).click();
  await expect(item).toContainText('Đã bỏ qua');
  await expect(item.getByRole('button', { name: 'Gọi lại' })).toBeVisible();

  await item.getByRole('button', { name: 'Đã về' }).click();
  await dialog.getByLabel(/Lý do/).fill('Chờ lâu, xin về');
  await dialog.getByRole('button', { name: 'Xác nhận đã về' }).click();
  await expect(item).toBeHidden();
});

test('reassigning a day reports what moved', async ({ page }) => {
  const day = new Date(Date.now() + 45 * 86400000).toISOString().slice(0, 10);
  await page.goto('/dispatch');
  await page.getByRole('button', { name: 'Thay bác sĩ cả ngày' }).click();
  const dialog = page.getByRole('dialog', { name: 'Thay bác sĩ cả ngày' });
  await dialog.getByLabel('Bác sĩ vắng').selectOption({ label: 'BS. Lê Hoàng Cường' });
  await dialog.getByLabel('Bác sĩ thay').selectOption({ label: 'BS. Trần Thị Bình' });
  await dialog.getByLabel('Ngày').fill(day);
  await dialog.getByLabel(/Lý do/).fill('Bác sĩ đi hội thảo');
  await dialog.getByRole('button', { name: 'Chuyển lịch hẹn' }).click();
  await expect(dialog).toContainText(/Đã chuyển \d+ lịch hẹn/);
});

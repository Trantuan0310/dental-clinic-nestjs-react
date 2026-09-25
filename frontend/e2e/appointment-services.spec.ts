import { test, expect } from './fixtures';

/**
 * ADR-0009 phase 5 — front desk books a visit by services (length follows
 * the services, a different length needs a reason) and takes a walk-in who
 * then leaves before the exam (LEFT). Uses Cường and Dung, whose demo
 * windows global-setup opens around "now".
 */
test('booking by service sets the length and records the services', async ({ page }) => {
  await page.goto('/appointments/list');
  await page.getByRole('button', { name: 'Tạo lịch hẹn' }).first().click();
  const dialog = page.getByRole('dialog');

  await dialog.getByRole('button', { name: 'Tìm bệnh nhân' }).click();
  await dialog.getByLabel('Tìm bệnh nhân').fill('Nguyễn');
  await dialog.getByRole('button', { name: /chọn →/i }).first().click();

  await dialog.getByLabel('Bác sĩ').selectOption({ label: 'BS. Lê Hoàng Cường' });
  await dialog.getByLabel(/Khám tổng quát/).check();
  await expect(dialog.getByText('Tổng 15 phút · chuẩn bị 0′ trước, dọn dẹp 5′ sau')).toBeVisible();
  await expect(dialog.getByLabel('Thời lượng', { exact: true })).toHaveValue('15');

  // A length other than the services' total asks for a reason.
  await dialog.getByLabel('Thời lượng', { exact: true }).selectOption('30');
  await expect(dialog.getByLabel(/Lý do đổi thời lượng/)).toBeVisible();
  await dialog.getByLabel('Thời lượng', { exact: true }).selectOption('15');
  await expect(dialog.getByLabel(/Lý do đổi thời lượng/)).toBeHidden();

  const firstFree = dialog.getByText('Giờ trống phù hợp').locator('..').getByRole('button').first();
  await firstFree.click();
  await dialog.getByRole('button', { name: 'Tạo lịch hẹn' }).click();
  await expect(dialog).toBeHidden();
});

test('a walk-in is checked in at once and can leave before the exam', async ({ page }) => {
  await page.goto('/appointments/list');
  await page.getByRole('button', { name: 'Khách vãng lai' }).click();
  const dialog = page.getByRole('dialog', { name: 'Tiếp nhận khách vãng lai' });

  await dialog.getByLabel('Tìm bệnh nhân *').fill('Trần');
  const pick = dialog.getByRole('button', { name: /chọn →/i }).first();
  const patientCode = (await pick.innerText()).match(/PT-\d{4}-\d+/)?.[0] ?? '';
  expect(patientCode).not.toBe('');
  await pick.click();
  await dialog.getByLabel('Bác sĩ *').selectOption({ label: 'BS. Phạm Thị Dung' });
  await dialog.getByLabel(/Khám tổng quát/).check();
  await dialog.getByRole('button', { name: 'Tiếp nhận' }).click();
  await expect(dialog).toBeHidden();

  // The new visit's drawer opens: checked in, with its service.
  const drawer = page.getByRole('dialog').filter({ hasText: 'Khách vãng lai' });
  await expect(drawer.getByLabel('Dịch vụ của lịch hẹn')).toContainText('Khám tổng quát');
  await expect(drawer.getByLabel('Nhật ký thao tác')).toContainText('Tiếp nhận khách vãng lai');

  await drawer.getByRole('button', { name: 'Bệnh nhân đã về' }).click();
  const confirm = page.getByRole('dialog', { name: 'Bệnh nhân đã về (chưa khám)' });
  await confirm.getByRole('button', { name: 'Bệnh nhân chờ lâu, xin về' }).click();
  await confirm.getByRole('button', { name: 'Xác nhận đã về' }).click();
  await expect(confirm).toBeHidden();
  await expect(
    page.locator('tbody tr', { hasText: patientCode }).filter({ hasText: 'BS. Phạm Thị Dung' }).first(),
  ).toContainText('Đã về (chưa khám)');
});

import { test, expect } from './fixtures';

/**
 * Service catalogue (ADR-0009 phase 2): admin creates a service, assigns it
 * to a seeded dentist with a duration override, ends the assignment, then
 * retires the service.
 */
test('admin manages a service and its assignment to a dentist', async ({ page }) => {
  test.setTimeout(90_000);
  const stamp = String(Date.now()).slice(-6);
  const code = `E2E_${stamp}`;
  const name = `Dịch vụ e2e ${stamp}`;

  await page.goto('/services');
  await expect(page.getByText('Cạo vôi + đánh bóng')).toBeVisible();
  await page.getByRole('button', { name: /thêm dịch vụ/i }).click();
  let dialog = page.getByRole('dialog');
  await dialog.getByLabel('Mã dịch vụ').fill(code);
  await dialog.getByLabel('Tên dịch vụ').fill(name);
  await dialog.getByLabel('Thời lượng').selectOption('45');
  await dialog.getByLabel('Dọn dẹp sau').selectOption('10');
  await dialog.getByLabel('Giá niêm yết (VND)').fill('350000');
  await dialog.getByRole('button', { name: /tạo dịch vụ/i }).click();
  await expect(dialog).toBeHidden();
  const serviceRow = page.locator('tbody tr', { hasText: name });
  await expect(serviceRow).toContainText('45 phút');
  await expect(serviceRow).toContainText('350.000');

  // ---- Assign to a seeded dentist with a duration override ----
  await page.goto('/dentists');
  await page.getByRole('link', { name: /Nguyễn Văn An/ }).click();
  await expect(page.getByText('Dịch vụ thực hiện')).toBeVisible();
  await page.getByRole('button', { name: 'Phân công', exact: true }).click();
  dialog = page.getByRole('dialog');
  await dialog.getByLabel('Dịch vụ').selectOption({ label: `${name} (45 phút · 350.000 ₫)` });
  await dialog.getByLabel('Thời lượng riêng (phút)').fill('60');
  await dialog.getByRole('button', { name: /^phân công$/i }).click();
  await expect(dialog).toBeHidden();
  const assignment = page.locator('li', { hasText: name });
  await expect(assignment).toContainText('60 phút (riêng)');

  // ---- End it (started today, so it ends today and stays listed) ----
  await assignment.getByRole('button', { name: `Ngừng phân công ${name}` }).click();
  await expect(assignment.getByRole('button', { name: `Ngừng phân công ${name}` })).toHaveCount(0);

  // ---- Retire the service ----
  await page.goto('/services');
  await serviceRow.getByRole('button', { name: 'Ngừng' }).click();
  await expect(serviceRow).toBeHidden();
  await page.getByText('Hiện cả dịch vụ đã ngừng').click();
  await expect(serviceRow.getByText('Đã ngừng')).toBeVisible();
});

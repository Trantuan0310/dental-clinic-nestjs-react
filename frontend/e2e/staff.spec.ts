import { test, expect } from './fixtures';
import { randomVnPhone } from './flow-helpers';

/**
 * Staff (ADR-0009 phase 1): employee → login account → dentist profile →
 * suspend / reinstate → terminate, through the real UI as clinic admin.
 * The new account stays PENDING_SETUP (it is activated from the invite),
 * so it is checked on the dentist pages rather than in the booking form.
 */
test.describe.configure({ mode: 'serial' });

test('admin creates an employee, gives them an account and makes them a dentist', async ({ page }) => {
  test.setTimeout(90_000);
  const stamp = Date.now();
  const name = `E2E Bác sĩ ${stamp}`;

  await page.goto('/staff');
  await page.getByRole('button', { name: /thêm nhân viên/i }).click();
  let dialog = page.getByRole('dialog');
  await dialog.getByLabel('Họ và tên').fill(name);
  await dialog.getByLabel('Loại nhân viên').selectOption('DENTIST');
  await dialog.getByLabel('Số điện thoại').fill(randomVnPhone());
  await dialog.getByRole('button', { name: /tạo nhân viên/i }).click();
  await expect(dialog).toBeHidden();

  await page.getByLabel('Tìm nhân viên').fill(name);
  await page.getByRole('button', { name: /^tìm$/i }).click();
  const row = page.locator('tbody tr', { hasText: name });
  await expect(row).toBeVisible();
  await expect(row.getByText(/^NV-\d{5}$/)).toBeVisible();

  // ---- Login account (BR-STAFF-003) ----
  await row.getByRole('button', { name: `Tạo tài khoản cho ${name}` }).click();
  dialog = page.getByRole('dialog');
  await dialog.getByLabel('Email đăng nhập').fill(`e2e.dentist.${stamp}@clinic.local`);
  await dialog.getByRole('button', { name: /^tạo tài khoản$/i }).click();
  await expect(dialog).toBeHidden();
  await expect(row.getByText(`e2e.dentist.${stamp}@clinic.local`)).toBeVisible();

  // ---- Dentist profile (BR-STAFF-002) ----
  await row.getByRole('button', { name: `Tạo hồ sơ bác sĩ cho ${name}` }).click();
  dialog = page.getByRole('dialog');
  await dialog.getByLabel('Số chứng chỉ hành nghề').fill(`CCHN-E2E-${stamp}`);
  await dialog.getByRole('button', { name: 'Nha chu' }).click();
  await dialog.getByRole('button', { name: 'Chọn màu #0891B2' }).click();
  await dialog.getByRole('button', { name: /tạo hồ sơ bác sĩ/i }).click();
  await expect(dialog).toBeHidden();

  // ---- Dentist pages ----
  await row.getByRole('link', { name }).click();
  await expect(page).toHaveURL(/\/dentists\/[0-9a-f-]{36}$/);
  await expect(page.getByRole('heading', { name })).toBeVisible();
  await expect(page.getByText('Nha chu')).toBeVisible();
  await expect(page.getByText(`CCHN-E2E-${stamp}`)).toBeVisible();

  // ---- Suspend and reinstate (BR-STAFF-004: no bookings, so allowed) ----
  await page.getByRole('button', { name: /tạm đình chỉ \/ ngừng/i }).click();
  dialog = page.getByRole('dialog');
  await dialog.getByLabel('Lý do').fill('Nghỉ phép dài hạn');
  await dialog.getByRole('button', { name: /xác nhận/i }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByText('Tạm đình chỉ', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: /cho hành nghề lại/i }).click();
  await expect(page.getByText('Đang hành nghề', { exact: true })).toBeVisible();

  // ---- Terminate (BR-STAFF-005) ----
  await page.goto('/staff');
  await page.getByLabel('Tìm nhân viên').fill(name);
  await page.getByRole('button', { name: /^tìm$/i }).click();
  await row.getByRole('button', { name: `Cho ${name} nghỉ việc` }).click();
  dialog = page.getByRole('dialog');
  await expect(dialog.getByText(/tài khoản đăng nhập của nhân viên sẽ bị vô hiệu hóa/i)).toBeVisible();
  await dialog.getByLabel('Lý do').fill('Kết thúc kiểm thử e2e');
  await dialog.getByRole('button', { name: /cho nghỉ việc/i }).click();
  await expect(dialog).toBeHidden();
  await expect(row.getByText('Đã nghỉ việc')).toBeVisible();
});

test('the dentists page lists seeded dentists with their practice status', async ({ page }) => {
  await page.goto('/dentists');
  const card = page.getByRole('link', { name: /Nguyễn Văn An/ });
  await expect(card).toBeVisible();
  await expect(card.getByText('Đang hành nghề')).toBeVisible();
});

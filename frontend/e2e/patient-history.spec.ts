import { test, expect } from './fixtures';
import { randomVnPhone } from './flow-helpers';

/**
 * A patient reads their own visit history through a link: staff issue it on
 * the patient record; the public page opens it without an account. Asking by
 * phone never reveals whether the number is on file.
 */
test('staff issues a history link and the patient opens it', async ({ page, browser }) => {
  test.setTimeout(60_000);
  const patientName = `E2E History ${Date.now()}`;
  await page.goto('/patients/new');
  await page.getByLabel(/^họ tên/i).fill(patientName);
  await page.getByLabel(/ngày sinh/i).fill('1988-05-20');
  await page.getByLabel(/sđt chính/i).fill(randomVnPhone());
  await page.getByRole('button', { name: /^lưu$/i }).click();
  await page.waitForURL(/\/patients\/[0-9a-f-]{20,}$/i, { timeout: 15_000 });

  await page.getByRole('button', { name: 'Gửi link tra cứu lịch sử' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByText('Đường dẫn tra cứu lịch sử khám')).toBeVisible();
  const url = await dialog.getByLabel('Đường dẫn').inputValue();
  expect(url).toMatch(/\/lich-su\/[A-Za-z0-9_-]{43}$/);

  // A fresh browser with no staff session. The empty storageState matters:
  // a bare newContext() inherits the saved admin session, and the public page
  // loading would rotate its refresh cookie, which revokes the shared session
  // every later test runs on.
  const visitor = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  const pub = await visitor.newPage();
  try {
    await pub.goto(new URL(url).pathname);
    await expect(pub.getByRole('heading', { name: `Lịch sử khám của ${patientName}` })).toBeVisible({ timeout: 15_000 });
    await expect(pub.getByText('Chưa có lần khám nào được ghi nhận.')).toBeVisible();

    await pub.goto('/lich-su/' + 'x'.repeat(43));
    await expect(pub.getByText('Đường dẫn không hợp lệ hoặc đã hết hạn')).toBeVisible();

    await pub.goto('/tra-cuu-lich-su');
    await pub.getByLabel('Số điện thoại').fill('0999 999 999');
    await pub.getByRole('button', { name: 'Gửi đường dẫn cho tôi' }).click();
    await expect(pub.getByRole('status')).toContainText('Nếu số điện thoại khớp hồ sơ');
  } finally {
    await visitor.close();
  }
});

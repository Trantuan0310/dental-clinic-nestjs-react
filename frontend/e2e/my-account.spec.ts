import { test, expect } from './fixtures';

/**
 * Account self-service without changing any real password (the suite shares
 * the admin session): the "Tài khoản của tôi" page checks the new password
 * before submitting and reports a wrong current password in plain words, and
 * an admin can email a password link to a colleague, which leaves that
 * colleague's current password untouched.
 */
test('my account page validates a password change', async ({ page }) => {
  await page.goto('/me');
  await expect(page.getByRole('heading', { name: 'Tài khoản của tôi' })).toBeVisible();
  await expect(page.getByText('admin@clinic.local')).toBeVisible();

  const current = page.getByLabel(/^Mật khẩu hiện tại/);
  const next = page.getByLabel(/^Mật khẩu mới/);
  const again = page.getByLabel(/^Nhập lại mật khẩu mới/);
  const submit = page.getByRole('button', { name: 'Đổi mật khẩu' });

  await current.fill('whatever');
  await next.fill('short1');
  await again.fill('short1');
  await submit.click();
  await expect(page.getByText('Mật khẩu phải có ít nhất 8 ký tự')).toBeVisible();

  await next.fill('NewPass2026');
  await again.fill('NewPass2027');
  await submit.click();
  await expect(page.getByText('Mật khẩu nhập lại không khớp')).toBeVisible();

  await current.fill('definitely-not-the-password1');
  await again.fill('NewPass2026');
  await submit.click();
  await expect(page.getByText('Mật khẩu hiện tại không đúng')).toBeVisible();
  // Still signed in: a wrong current password is not a session problem.
  await expect(page).toHaveURL(/\/me$/);
});

test('admin emails a colleague a password link', async ({ page }) => {
  await page.goto('/admin/users');
  await page.getByRole('button', { name: 'Gửi link đặt mật khẩu cho hanh.le@clinic.local' }).click();
  await expect(page.getByText(/Đã gửi link (thiết lập tài khoản|đặt lại mật khẩu) tới hanh.le@clinic.local/)).toBeVisible();
});

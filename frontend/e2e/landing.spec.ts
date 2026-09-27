import { test, expect } from './fixtures';

/**
 * Public landing page: a visitor with no staff session opening "/" gets the
 * clinic's home page (not the login redirect), sees bookable services with
 * prices, and a service's "Đặt" link opens the booking form with that
 * service already chosen. Signed-in staff still land on the dashboard at "/"
 * (covered by the shell/dashboard specs).
 */
test.use({ storageState: { cookies: [], origins: [] } });

test('visitors get the landing page and can book a listed service', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Nụ cười khỏe đẹp');
  await expect(page.getByRole('heading', { name: 'Dịch vụ & bảng giá' })).toBeVisible();

  const services = page.locator('#dich-vu');
  const firstBook = services.getByRole('link', { name: /^Đặt lịch / }).first();
  await expect(firstBook).toBeVisible();
  await expect(services.getByText(/\d[\d.]* đ$|Miễn phí/).first()).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Đội ngũ bác sĩ' })).toBeVisible();

  const label = (await firstBook.getAttribute('aria-label'))!.replace(/^Đặt lịch /, '');
  await firstBook.click();
  await expect(page).toHaveURL(/\/booking\?service=/);
  await expect(page.getByRole('heading', { name: 'Đặt lịch khám' })).toBeVisible();
  await expect(page.getByLabel('Dịch vụ').locator('option:checked')).toContainText(label);
});

test('staff sign-in stays reachable from the landing page', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: 'Nhân viên đăng nhập' }).click();
  await expect(page).toHaveURL(/\/login$/);
});

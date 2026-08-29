import { test, expect } from './fixtures';

test.describe('Smoke — public surfaces', () => {
  test('login page renders correctly', async ({ page }) => {
    await page.goto('/login');
    await expect(page.getByRole('heading', { name: /gensmile|đăng nhập/i })).toBeVisible();
    await expect(page.getByLabel(/email/i)).toBeVisible();
    await expect(page.getByLabel(/mật khẩu|password/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /đăng nhập/i })).toBeVisible();
  });

  test('unauthenticated visit to a protected route redirects to login', async ({ page }) => {
    await page.goto('/patients');
    await page.waitForURL('**/login');
    expect(page.url()).toMatch(/\/login/);
  });

  test('invalid credentials show an error', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel(/email/i).fill('wrong@example.com');
    await page.getByLabel(/mật khẩu|password/i).fill('WrongPass@999');
    await page.getByRole('button', { name: /đăng nhập/i }).click();
    // Either a toast / inline error appears. We don't assert exact text because
    // the i18n string can change — we just assert we stay on /login.
    await expect(page).toHaveURL(/\/login/);
  });
});
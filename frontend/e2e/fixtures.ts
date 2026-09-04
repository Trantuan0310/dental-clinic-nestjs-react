import { test as base, expect, type Page } from '@playwright/test';

/**
 * Shared login helper for authenticated E2E flows. Tests that need a logged-in
 * state should call `await login(page)` in their setup.
 *
 * If `E2E_USERNAME` / `E2E_PASSWORD` env vars are set they take precedence,
 * otherwise we fall back to the seeded admin credentials.
 */
export async function login(page: Page): Promise<void> {
  const username = process.env.E2E_USERNAME ?? 'admin@clinic.local';
  const password = process.env.E2E_PASSWORD ?? 'Admin123!';

  await page.goto('/login');
  await page.getByLabel(/email/i).fill(username);
  await page.getByLabel(/mật khẩu|password/i).fill(password);
  await page.getByRole('button', { name: /đăng nhập/i }).click();
  await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 15_000 });
}

export async function logout(page: Page): Promise<void> {
  const trigger = page.locator('header button:has(svg)').last();
  await trigger.click();
  await page.getByRole('button', { name: /đăng xuất/i }).click();
  await page.waitForURL('**/login');
}

export const test = base;
export { expect };
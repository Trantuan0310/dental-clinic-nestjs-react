import { test, expect } from './fixtures';

/**
 * Home page photos: the admin uploads a hero and a gallery picture on
 * "Ảnh trang chủ", a visitor sees them on the landing page, and removing
 * them brings the page back to the logo. The picture is drawn in the page
 * (canvas → PNG) so the spec needs no fixture file.
 */
async function photo(page: import('@playwright/test').Page, color: string) {
  const b64 = await page.evaluate((fill) => {
    const c = document.createElement('canvas');
    c.width = 400;
    c.height = 300;
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = fill;
    ctx.fillRect(0, 0, 400, 300);
    return c.toDataURL('image/png').split(',')[1];
  }, color);
  return { name: 'photo.png', mimeType: 'image/png', buffer: Buffer.from(b64, 'base64') };
}

test('admin puts clinic photos on the home page', async ({ page, browser }) => {
  await page.goto('/admin/site-media');
  await expect(page.getByRole('heading', { name: 'Ảnh trang chủ' })).toBeVisible();

  await page.getByLabel(/Tải ảnh chính|Đổi ảnh chính/).setInputFiles(await photo(page, '#2BA3A0'));
  const hero = page.getByRole('img', { name: 'Ảnh chính của trang chủ' });
  await expect(hero).toBeVisible();

  await page.getByLabel('Chú thích (không bắt buộc)').fill('Phòng điều trị e2e');
  await page.getByLabel('Thêm ảnh').setInputFiles(await photo(page, '#F4B860'));
  await expect(page.getByRole('img', { name: 'Phòng điều trị e2e' })).toBeVisible();

  const guest = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  const home = await guest.newPage();
  await home.goto('/');
  const heroImg = home.locator('#top img[src*="/public/media/"]');
  await expect(heroImg).toBeVisible();
  expect(await heroImg.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);
  await expect(home.getByRole('heading', { name: 'Không gian phòng khám' })).toBeVisible();
  await expect(home.getByRole('img', { name: 'Phòng điều trị e2e' })).toBeVisible();

  // Clean up so the spec can run again and the home page is back to the logo.
  await page.getByRole('button', { name: 'Xóa ảnh Phòng điều trị e2e' }).click();
  await expect(page.getByRole('img', { name: 'Phòng điều trị e2e' })).toBeHidden();
  await page.getByRole('button', { name: 'Xóa', exact: true }).click();
  await expect(hero).toBeHidden();
  await home.reload();
  await expect(home.locator('#top img[src="/logo-full.svg"]')).toBeVisible();
  await guest.close();
});

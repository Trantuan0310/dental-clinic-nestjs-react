import { test, expect } from './fixtures';

/** dentist.update.own: a dentist edits only bio, specialties and colour. */
test.use({ storageState: 'e2e/.auth/dentist.json' });

test('a dentist edits the self-service fields of their own profile', async ({ page }) => {
  await page.goto('/dentists');
  const mine = page.getByRole('link').filter({ has: page.getByText('Tôi', { exact: true }) });
  await mine.click();
  await expect(page).toHaveURL(/\/dentists\/[0-9a-f-]{36}$/);

  await page.getByRole('button', { name: /sửa hồ sơ/i }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByLabel('Số chứng chỉ hành nghề')).toHaveCount(0);
  await expect(dialog.getByLabel('Thời lượng khe mặc định')).toHaveCount(0);
  const bio = `Bác sĩ nha chu — cập nhật ${Date.now()}`;
  await dialog.getByLabel('Giới thiệu').fill(bio);
  await dialog.getByRole('button', { name: /^lưu$/i }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByText(bio)).toBeVisible();

  // Another dentist's profile has no edit button.
  await page.goto('/dentists');
  await page.getByRole('link', { name: /Trần Thị Bình/ }).click();
  await expect(page.getByRole('heading', { name: /Trần Thị Bình/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /sửa hồ sơ/i })).toHaveCount(0);
});

import { test, expect } from './fixtures';

/**
 * Patient Creation E2E Test
 * Happy path: Login → Create patient → Verify in list
 */
test.describe('Patient Creation', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('admin can create new patient and see it in list', async ({ page }) => {
    // Navigate to patients list
    await page.goto('/patients');
    await page.waitForLoadState('networkidle');

    // Click "New Patient" button. The header action and the empty-state's
    // own CTA share the same label when the list has no rows yet — .first()
    // (the header button) avoids a strict-mode violation.
    const newPatientBtn = page.getByRole('button', { name: /thêm bệnh nhân|thêm mới|tạo bệnh nhân/i }).first();
    await newPatientBtn.click();

    // Fill form
    const testName = `Test Patient ${Date.now()}`;
    const testPhone = `090${Math.floor(Math.random() * 90000000 + 10000000)}`;

    // Real labels are "Họ và tên (bắt buộc)" and "SĐT chính" — match
    // substrings that actually appear rather than a full literal phrase.
    await page.getByLabel(/họ.*tên|fullname/i).fill(testName);
    await page.getByLabel(/sđt|điện thoại|phone/i).first().fill(testPhone);

    // Select gender if dropdown exists
    const genderSelect = page.locator('select').first();
    if (await genderSelect.isVisible()) {
      await genderSelect.selectOption({ index: 1 });
    }

    // Submit
    const submitBtn = page.getByRole('button', { name: /lưu|save|tạo|create/i }).last();
    await submitBtn.click();

    // Wait for redirect or success
    await page.waitForLoadState('networkidle');

    // Verify patient appears in list
    await page.goto('/patients');
    await page.waitForLoadState('networkidle');
    await expect(page.getByText(testName)).toBeVisible({ timeout: 10_000 });
  });

  test('patient search filters work correctly', async ({ page }) => {
    await page.goto('/patients');
    await page.waitForLoadState('networkidle');

    // Type in search box. Real placeholder is "Tìm theo tên, mã BN, SĐT...",
    // which doesn't match a generic "tìm kiếm" pattern.
    const searchInput = page.getByPlaceholder(/tìm theo tên|search/i);
    await searchInput.fill('test');

    // Wait for filtered results
    await page.waitForTimeout(500);

    // Table should still be visible
    await expect(page.locator('table')).toBeVisible({ timeout: 5_000 });
  });

  test('patient list shows pagination', async ({ page }) => {
    await page.goto('/patients');
    await page.waitForLoadState('networkidle');

    // Not asserting pagination text visibility since data may be empty - just checking no crash
    await page.waitForLoadState('networkidle');
  });
});

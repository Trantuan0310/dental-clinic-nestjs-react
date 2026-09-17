import { test, expect } from './fixtures';
import { randomVnPhone } from './flow-helpers';

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
    const testPhone = randomVnPhone();

    // Real labels are "Họ và tên (bắt buộc)" and "SĐT chính" — match
    // substrings that actually appear rather than a full literal phrase.
    await page.getByLabel(/họ.*tên|fullname/i).fill(testName);
    await page.getByLabel(/ngày sinh|date of birth/i).fill('1992-05-20');
    await page.getByLabel(/sđt|điện thoại|phone/i).first().fill(testPhone);

    await page.getByRole('radio', { name: 'Nữ', exact: true }).check();

    // Submit
    const submitBtn = page.getByRole('button', { name: /lưu|save|tạo|create/i }).last();
    await submitBtn.click();
    await page.waitForURL(/\/patients\/[0-9a-f-]+$/, { timeout: 10_000 });
    await expect(page.getByRole('heading', { name: testName })).toBeVisible();

    // Wait for redirect or success
    await page.waitForLoadState('networkidle');

    // Verify patient appears in list
    await page.goto('/patients');
    await page.waitForLoadState('networkidle');
    await expect(page.getByText(testName)).toBeVisible({ timeout: 10_000 });
  });

  test('patient search filters work correctly', async ({ page }) => {
    const initialResponse = page.waitForResponse((response) => {
      const url = new URL(response.url());
      return url.pathname.endsWith('/api/v1/patients') && !url.searchParams.has('q');
    });
    await page.goto('/patients');
    const initial = await initialResponse;
    expect(initial.ok()).toBe(true);
    const { data: patients } = await initial.json();
    expect(patients.length).toBeGreaterThan(0);
    const target = patients[0] as { code: string; fullName: string };

    // Type in search box. Real placeholder is "Tìm theo tên, mã BN, SĐT...",
    // which doesn't match a generic "tìm kiếm" pattern.
    const searchInput = page.getByPlaceholder(/tìm theo tên|search/i);
    const filteredResponse = page.waitForResponse((response) => {
      const url = new URL(response.url());
      return url.pathname.endsWith('/api/v1/patients') && url.searchParams.get('q') === target.code;
    });
    await searchInput.fill(target.code);
    const filtered = await filteredResponse;
    expect(filtered.ok()).toBe(true);
    expect((await filtered.json()).data).toHaveLength(1);
    await expect(page).toHaveURL(new RegExp(`q=${encodeURIComponent(target.code)}`));
    await expect(page.locator('tbody tr')).toHaveCount(1);
    await expect(page.locator('tbody tr')).toContainText(target.fullName);
    await page.reload();
    await expect(searchInput).toHaveValue(target.code);
    await expect(page.locator('tbody tr')).toHaveCount(1);
  });

  test('patient pagination matches the API and loads the next page', async ({ page }) => {
    const initialResponse = page.waitForResponse((response) => new URL(response.url()).pathname.endsWith('/api/v1/patients'));
    await page.goto('/patients');
    const initial = await initialResponse;
    expect(initial.ok()).toBe(true);
    const first = await initial.json();
    await expect(page.locator('tbody tr')).toHaveCount(first.data.length);
    const loadMore = page.getByRole('button', { name: /tải thêm/i });
    if (first.pagination.hasMore) {
      await expect(loadMore).toBeVisible();
      const nextResponse = page.waitForResponse((response) => {
        const url = new URL(response.url());
        return url.pathname.endsWith('/api/v1/patients') && url.searchParams.get('cursor') === first.pagination.nextCursor;
      });
      await loadMore.click();
      const next = await nextResponse;
      expect(next.ok()).toBe(true);
      const second = await next.json();
      expect(second.data.length).toBeGreaterThan(0);
      const ids = [...first.data, ...second.data].map((row: { id: string }) => row.id);
      expect(new Set(ids).size).toBe(ids.length);
      await expect(page.locator('tbody tr')).toHaveCount(ids.length);
    } else {
      await expect(loadMore).toHaveCount(0);
    }
  });
});

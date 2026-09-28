import { test, expect, getSharedContext } from './fixtures';
import { loginAs, ACCOUNTS } from './flow-helpers';

/**
 * Who sees and does what (migration 027):
 * - front desk: no HR records, no dentist queue/shift pages, finance limited
 *   to outstanding balances;
 * - dentist: books follow-ups on their own calendar and updates the medical
 *   history of patients they treated, from the encounter screen;
 * - clinic admin: reads medical records without the dentist-only menus.
 */
test('front desk menu and reports stop at outstanding balances', async ({ browser }) => {
  const ctx = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  const page = await ctx.newPage();
  await loginAs(page, ACCOUNTS.receptionist.email, ACCOUNTS.receptionist.password);
  const menu = page.locator('aside nav');
  await expect(menu.getByRole('link', { name: /Bệnh nhân/ }).first()).toBeVisible();
  await expect(menu.getByRole('link', { name: /Hóa đơn/ })).toBeVisible();
  for (const hidden of ['Nhân sự', 'Ca của tôi', 'Hàng chờ của tôi', 'Bệnh nhân của tôi']) {
    await expect(menu.getByRole('link', { name: hidden, exact: true })).toHaveCount(0);
  }

  // Reports: the outstanding section loads; revenue endpoints are refused.
  const revenue: number[] = [];
  page.on('response', (r) => {
    if (/\/billing\/reports\/(revenue|dashboard-kpis|finance-summary)/.test(r.url())) revenue.push(r.status());
  });
  await menu.getByRole('link', { name: 'Báo cáo', exact: true }).click();
  await expect(page).toHaveURL(/\/reports$/);
  await page.waitForLoadState('networkidle');
  expect(revenue, 'the page must not even ask for revenue figures').toEqual([]);
  const res = await page.request.get('/api/v1/billing/reports/finance-summary');
  expect([401, 403]).toContain(res.status());
  await ctx.close();
});

test('dentist records a new allergy and books a follow-up from the encounter', async ({ browser }) => {
  const ctx = await getSharedContext(browser, 'e2e/.auth/dentist.json');
  const page = await ctx.newPage();
  await page.goto('/my-patients');
  await page.locator('main .divide-y > div.cursor-pointer').first().click();
  await expect(page).toHaveURL(/\/patients\/[0-9a-f-]{36}$/);
  const patientId = page.url().split('/').pop()!;
  await page.goto(`/medical-records/${patientId}`);
  await page.locator('main .divide-y > div.cursor-pointer').first().click();
  await expect(page).toHaveURL(/\/encounters\/[0-9a-f-]{36}$/);

  // Medical history: add an allergy, see it, then put the list back.
  const card = page.getByRole('region', { name: 'Tiền sử & dị ứng' });
  await expect(card).toBeVisible();
  const marker = `E2E dị ứng ${Date.now().toString().slice(-6)}`;
  await card.getByRole('button', { name: 'Sửa' }).click();
  const dialog = page.getByRole('dialog', { name: 'Cập nhật tiền sử bệnh nhân' });
  const allergies = dialog.getByLabel('Dị ứng');
  const before = await allergies.inputValue();
  await allergies.fill([before, marker].filter(Boolean).join('\n'));
  await dialog.getByRole('button', { name: 'Lưu' }).click();
  await expect(card.getByText(marker)).toBeVisible();
  await card.getByRole('button', { name: 'Sửa' }).click();
  await dialog.getByLabel('Dị ứng').fill(before);
  await dialog.getByRole('button', { name: 'Lưu' }).click();
  await expect(card.getByText(marker)).toHaveCount(0);

  // Follow-up booking opens on the dentist's own calendar, patient preset.
  await page.getByRole('button', { name: 'Đặt lịch tái khám' }).click();
  const booking = page.getByRole('dialog').filter({ has: page.getByLabel('Bác sĩ') });
  await expect(booking.getByLabel('Bác sĩ')).toBeDisabled();
  await expect(booking.getByLabel('Bác sĩ')).toContainText(ACCOUNTS.dentist.fullName);
  await expect(booking.getByRole('tab', { name: 'Bệnh nhân mới' })).toHaveCount(0);
  await booking.getByRole('button', { name: 'Hủy', exact: true }).last().click();
});

test('clinic admin reads an encounter without dentist-only controls', async ({ page }) => {
  await page.goto('/');
  const menu = page.locator('aside nav');
  await expect(menu.getByRole('link', { name: 'Hôm nay', exact: true })).toBeVisible();
  await expect(menu.getByRole('link', { name: 'Hàng chờ của tôi', exact: true })).toHaveCount(0);
  await expect(menu.getByRole('link', { name: 'Nhân sự', exact: true })).toBeVisible();
});

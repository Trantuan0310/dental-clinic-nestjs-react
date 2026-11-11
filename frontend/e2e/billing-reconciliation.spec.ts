import { test, expect, getSharedContext } from './fixtures';

test('missing invoices filters in the server before paging and resets page when scope changes', async ({ browser }) => {
  const admin = await getSharedContext(browser, 'e2e/.auth/admin.json');
  const page = await admin.newPage();
  const freeRow = (index: number) => ({ encounterId: `free-${index}`, closedAt: '2026-11-10T09:00:00.000Z', patientId: 'patient', patientCode: `F${index}`, patientName: `Free ${index}`, dentistId: 'dentist', dentistName: 'Dentist', explicitlyFree: true, voidedInvoice: null });
  const actionable = { encounterId: 'manual', closedAt: '2026-11-10T09:00:00.000Z', patientId: 'patient', patientCode: 'A1', patientName: 'Actionable patient', dentistId: 'dentist', dentistName: 'Dentist', explicitlyFree: false, voidedInvoice: null };
  const voided = { ...actionable, encounterId: 'voided', patientName: 'Voided patient', voidedInvoice: { id: 'voided-id', code: 'V1', voidReason: 'Correction' } };
  const routeQueries: string[] = [];
  await page.route('**/api/v1/billing/reconciliation/missing-invoices**', async route => {
    const url = new URL(route.request().url());
    const scope = url.searchParams.get('scope') ?? 'all';
    const pageNumber = Number(url.searchParams.get('page') ?? 1);
    const summary = url.searchParams.get('summary') === 'true';
    routeQueries.push(`${scope}:${pageNumber}:${summary}`);
    const rows = summary ? [] : scope === 'actionable' ? [actionable, voided] : scope === 'free' ? Array.from({ length: 50 }, (_, i) => freeRow((pageNumber - 1) * 50 + i)) : [...Array.from({ length: 50 }, (_, i) => freeRow(i)), actionable, voided];
    const scopeTotal = scope === 'actionable' ? 2 : scope === 'free' ? 659 : 661;
    await route.fulfill({ json: { data: rows, pagination: { page: pageNumber, pageSize: 50, total: 661, actionable: 2, explicitlyFree: 659, scope, scopeTotal, hasPrevious: pageNumber > 1, hasMore: pageNumber * 50 < scopeTotal } } });
  });
  try {
    await page.goto('/billing/list');
    const banner = page.getByText('Cần xử lý: 2 · Miễn phí rõ ràng: 659').locator('..').locator('..');
    const toggle = banner.getByRole('button', { name: 'Xem', exact: true });
    await toggle.click();
    const filter = banner.getByRole('combobox', { name: 'Lọc phiên thiếu hóa đơn' });
    await expect(filter).toHaveValue('actionable');
    await expect(banner.getByText('Actionable patient')).toBeVisible();
    await expect(banner.getByText('Voided patient')).toBeVisible();
    await expect(banner.getByRole('listitem')).toHaveCount(2);
    expect(routeQueries).toContain('actionable:1:false');

    await filter.selectOption('free');
    await expect(banner.getByRole('listitem')).toHaveCount(50);
    await expect(banner.getByText('Free 0')).toBeVisible();
    await banner.getByRole('button', { name: 'Trang tiếp' }).click();
    await expect(banner.getByText('Free 50')).toBeVisible();
    await expect(banner.getByText('Trang 2 / 14')).toBeVisible();
    await filter.selectOption('actionable');
    await expect(banner.getByRole('listitem')).toHaveCount(2);
    await expect(banner.getByText('Actionable patient')).toBeVisible();
    expect(routeQueries).toContain('free:2:false');
    expect(routeQueries).toContain('actionable:1:false');
  } finally {
    await page.close();
  }
});

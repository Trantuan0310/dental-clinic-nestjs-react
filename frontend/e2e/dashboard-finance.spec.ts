import { test, expect, type Page } from '@playwright/test';

const thresholds = () => [
  { key: 'noShowRate', unit: 'percent', direction: 'lower', target: 5, okAt: 10 },
  { key: 'rebookRate', unit: 'percent', direction: 'higher', target: 85, okAt: 70 },
  { key: 'planAcceptance', unit: 'percent', direction: 'higher', target: 75, okAt: 60 },
  { key: 'medianWait', unit: 'minutes', direction: 'lower', target: 15, okAt: 30 },
  { key: 'lateCancelRate', unit: 'percent', direction: 'lower', target: 5, okAt: 10 },
  { key: 'collectionRate', unit: 'percent', direction: 'higher', target: 95, okAt: 85 },
];

async function mockSession(page: Page, permissions: string[]) {
  const user = { id: 'admin', email: 'admin@example.test', fullName: 'Test Admin', status: 'active', roles: ['clinic_admin'], permissions };
  await page.addInitScript(() => localStorage.setItem('gensmile.i18n', 'en'));
  await page.route('**/api/v1/**', async route => {
    const path = new URL(route.request().url()).pathname;
    let body: unknown = { data: [] };
    if (path.endsWith('/auth/refresh')) body = { data: { accessToken: 'test', user, accessTokenExpiresIn: 3600 } };
    else if (path.endsWith('/auth/me')) body = { data: user };
    else if (path.endsWith('/kpi-thresholds')) body = { data: thresholds() };
    else if (path.endsWith('/scorecard')) body = { data: { metrics: thresholds().map(t => ({ ...t, value: 4, numerator: 4, denominator: 100 })) } };
    else if (path.endsWith('/dashboard-kpis')) body = { patients: { total: 0, pctChange: 0 }, appointments: { total: 0, pctChange: 0 }, treatmentRevenue: { total: 0, pctChange: 0 }, collected: { total: 0, pctChange: 0 } };
    else if (path.endsWith('/finance-summary')) body = { totalIncome: 500, totalExpense: 200, payrollPaid: 100 };
    else if (path.endsWith('/outstanding-summary')) body = { totalDebt: 800, invoiceCount: 2 };
    else if (path.endsWith('/financial-waterfall')) body = { data: { netRevenue: 800, netCollected: 500, remaining: 300, basis: {}, steps: [
      { key: 'gross', amount: 1000, from: 0, to: 1000 },
      { key: 'discount', amount: -200, from: 1000, to: 800 },
      { key: 'collectionBridge', amount: -300, from: 800, to: 500 },
      { key: 'remaining', amount: 300, total: true, from: 0, to: 300 },
    ] } };
    else if (path.endsWith('/dentist-panels')) body = { data: [
      { dentistId: 'a', dentistName: 'Dentist A', revenue: 800, visits: 2, proposed: 2, accepted: 1, acceptancePct: 50 },
      { dentistId: 'b', dentistName: 'Dentist B', revenue: -100, visits: 0, proposed: 0, accepted: 0, acceptancePct: null },
    ] };
    else if (path.endsWith('/monthly-aging')) body = { data: [
      { month: '2026-01', asOf: '2026-01-31', D0_30: 800, D31_60: 0, D61_90: 0, D90_PLUS: 0, total: 800 },
      { month: '2026-02', asOf: '2026-02-28', D0_30: 0, D31_60: 800, D61_90: 0, D90_PLUS: 0, total: 800 },
    ] };
    await route.fulfill({ json: body });
  });
}

test('admin edits all six thresholds, validates ordering, retains a failed save and reloads saved values', async ({ page }) => {
  await mockSession(page, ['settings.read', 'role.upsert']);
  let saved = thresholds();
  let fail = true;
  await page.route('**/billing/reports/kpi-thresholds', async route => {
    if (route.request().method() === 'PUT') {
      if (fail) { await route.fulfill({ status: 400, json: { message: 'Invalid request' } }); return; }
      const body = route.request().postDataJSON() as { thresholds: typeof saved };
      expect(body.thresholds).toHaveLength(6);
      saved = saved.map(row => ({ ...row, ...body.thresholds.find(r => r.key === row.key) }));
    }
    await route.fulfill({ json: { data: saved } });
  });
  await page.goto('/admin/settings');
  const inputs = page.getByRole('spinbutton');
  await expect(inputs).toHaveCount(12);
  const save = page.getByRole('button', { name: 'Save KPI thresholds' });
  await inputs.nth(0).fill('11');
  await expect(save).toBeDisabled();
  await inputs.nth(0).fill('2');
  await save.click();
  await expect(page.getByRole('alert').filter({ hasText: 'Save failed' })).toBeVisible();
  await expect(inputs.nth(0)).toHaveValue('2');
  fail = false;
  await save.click();
  await expect(page.getByRole('status').filter({ hasText: 'Saved.' })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('spinbutton').nth(0)).toHaveValue('2');
});

test('dashboard renders financial waterfall, shared-scale dentists and monthly aging', async ({ page }) => {
  await mockSession(page, ['report.read', 'report.revenue.read', 'report.outstanding.read']);
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await expect(page.getByText('Financial waterfall', { exact: true })).toBeVisible();
  await expect(page.getByText('Collection timing bridge', { exact: true }).first()).toBeVisible();
  await expect(page.getByText('Dentist A', { exact: true })).toBeVisible();
  await expect(page.getByText('Dentist B', { exact: true })).toBeVisible();
  const table = page.getByRole('table', { name: 'Monthly outstanding by age' });
  await expect(table.getByRole('row')).toHaveCount(3);
  await expect(table.getByRole('columnheader', { name: '0–30 days' })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(table).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(errors).toEqual([]);
});

test('revenue-only reader cannot fetch aging or edit thresholds', async ({ page }) => {
  await mockSession(page, ['report.read', 'report.revenue.read', 'settings.read']);
  const requests: string[] = [];
  page.on('request', request => requests.push(request.url()));
  await page.goto('/');
  await expect(page.getByText('Financial waterfall', { exact: true })).toBeVisible();
  await expect(page.getByText('Monthly aging', { exact: true })).toHaveCount(0);
  expect(requests.some(url => url.includes('/monthly-aging'))).toBe(false);
  await page.goto('/admin/settings');
  await expect(page.getByRole('spinbutton')).toHaveCount(0);
  expect(requests.some(url => url.includes('/kpi-thresholds'))).toBe(false);
});

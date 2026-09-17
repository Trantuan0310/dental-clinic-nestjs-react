import { test, expect, type Page } from './fixtures';
import { mkdirSync } from 'node:fs';
import type { Encounter } from '../src/types/medical-records';
import type { Invoice } from '../src/types/billing';

// These responses cover rare edge cases with the real API response shapes.
// Real persistence and role transitions are tested in flow-patient-to-payment.
const encounter: Encounter = {
  id: 'demo-encounter', code: 'ENC-DEMO', patientId: 'demo-patient',
  patientName: 'Bệnh nhân kiểm tra bản in', patientCode: 'BN-DEMO',
  dentistId: 'demo-dentist', dentistName: 'Bác sĩ demo', status: 'in_progress',
  startedAt: '2026-09-15T17:10:00Z', createdAt: '2026-09-15T17:10:00Z',
  notes: [], treatments: [],
  prescriptions: [{
    id: 'demo-rx', encounterId: 'demo-encounter', issuedAt: '2026-09-15T17:20:00Z',
    items: [{ id: 'demo-line', drugName: 'Thuốc demo', dosage: '500mg', frequency: '2 lần/ngày',
      quantity: 10, unit: 'viên', durationDays: 5 }],
  }],
};

async function savePrint(page: Page, name: string) {
  const dir = `artifacts/print-checks/${process.env.E2E_RUN_ID}`;
  mkdirSync(dir, { recursive: true });
  await page.emulateMedia({ media: 'print' });
  await expect(page.locator('.print-document')).toBeVisible();
  await expect(page.locator('header').first()).toBeHidden();
  await expect(page.locator('.print-document button:visible')).toHaveCount(0);
  await page.screenshot({ path: `${dir}/${name}.png`, fullPage: true });
  await page.pdf({ path: `${dir}/${name}.pdf`, format: 'A4', printBackground: true });
}

test.describe('Dentist UI regressions', () => {
  test.use({ storageState: 'e2e/.auth/dentist.json' });

  test('queue uses Vietnam calendar day and retains encounters in progress after reload', async ({ page }) => {
    await page.clock.setFixedTime(new Date('2026-09-16T00:30:00+07:00'));
    const row = (id: string, name: string, startAt: string, status: string) => ({
      id, patientId: id, dentistId: 'demo-dentist', status, startAt,
      endAt: new Date(new Date(startAt).getTime() + 15 * 60_000).toISOString(),
      checkedInAt: startAt, createdAt: startAt,
      patient: { id, code: `BN-${id}`, fullName: name },
      dentist: { id: 'demo-dentist', fullName: 'Bác sĩ demo' },
      ...(status === 'IN_PROGRESS' ? { encounter: { id: 'demo-encounter' } } : {}),
    });
    const queries: URL[] = [];
    await page.route('**/api/v1/appointments?*', async route => {
      queries.push(new URL(route.request().url()));
      await route.fulfill({ json: { data: [
        row('waiting', 'Bệnh nhân chờ hôm nay', '2026-09-15T17:25:00Z', 'CHECKED_IN'),
        row('ongoing', 'Bệnh nhân đang khám', '2026-09-15T17:20:00Z', 'IN_PROGRESS'),
        row('yesterday', 'Bệnh nhân ngày trước', '2026-09-15T16:40:00Z', 'CHECKED_IN'),
      ], pagination: { pageSize: 50, hasMore: false, nextCursor: null } } });
    });
    await page.goto('/my-queue');
    await expect(page.getByText('Bệnh nhân chờ hôm nay', { exact: true })).toBeVisible();
    await expect(page.getByText('Bệnh nhân đang khám', { exact: true })).toBeVisible();
    await expect(page.getByText('Bệnh nhân ngày trước', { exact: true })).toHaveCount(0);
    expect(queries[0].searchParams.get('from')).toBe('2026-09-16');
    expect(queries[0].searchParams.get('to')).toBe('2026-09-16');
    expect(queries[0].searchParams.getAll('status')).toEqual(['checked_in', 'in_progress']);
    await page.reload();
    await expect(page.getByRole('button', { name: 'Tiếp tục khám', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Bắt đầu khám', exact: true })).toBeVisible();
  });

  test('queue API failure shows a retry action and recovers without a false empty state', async ({ page }) => {
    let fail = true;
    await page.route('**/api/v1/appointments?*', route => route.fulfill(fail
      ? { status: 403, json: { message: 'Forbidden' } }
      : { json: { data: [], pagination: { pageSize: 50, hasMore: false, nextCursor: null } } }));
    await page.goto('/my-queue');
    await expect(page.getByText('Không thể tải hàng đợi', { exact: true })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText('Không có bệnh nhân nào đang chờ', { exact: true })).toHaveCount(0);
    fail = false;
    await page.getByRole('button', { name: 'Thử lại', exact: true }).click();
    await expect(page.getByText('Không có bệnh nhân nào đang chờ', { exact: true })).toBeVisible();
  });

  test('existing prescription cannot be created twice and completed encounter stays printable', async ({ page }) => {
    let status: Encounter['status'] = 'in_progress';
    await page.route('**/api/v1/medical-records/encounters/demo-encounter', route =>
      route.fulfill({ json: { data: { ...encounter, status } } }));
    await page.goto('/encounters/demo-encounter');
    await page.getByRole('tab', { name: 'Đơn thuốc', exact: true }).click();
    await expect(page.getByText('10 viên', { exact: true })).toBeVisible();
    await expect(page.getByText('5 ngày', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Tạo đơn thuốc', exact: true })).toHaveCount(0);
    status = 'completed';
    await page.reload();
    await page.getByRole('tab', { name: 'Đơn thuốc', exact: true }).click();
    await expect(page.getByRole('button', { name: /đóng encounter/i })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'In đơn thuốc', exact: true })).toBeVisible();
    await savePrint(page, 'prescription');
    await expect(page.getByText('Thuốc demo', { exact: true })).toBeVisible();
    status = 'cancelled';
    await page.emulateMedia({ media: 'screen' });
    await page.reload();
    await expect(page.getByRole('button', { name: /đóng encounter/i })).toHaveCount(0);
    await page.getByRole('tab', { name: 'Điều trị', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Thêm điều trị', exact: true })).toHaveCount(0);
  });
});

test('invoice print contains saved services and amounts in dark mode', async ({ page }) => {
  const invoice: Invoice = {
    id: 'demo-invoice', code: 'INV-DEMO-PRINT', patientId: 'demo-patient',
    patientName: encounter.patientName, patientCode: encounter.patientCode,
    status: 'PAID', subtotal: 350_000, total: 350_000, paidAmount: 350_000,
    outstandingAmount: 0, version: 2, createdAt: encounter.createdAt,
    items: [{ id: 'item', sequence: 1, description: 'Hàn răng Composite demo',
      quantity: 1, unitPrice: 350_000, lineTotal: 350_000 }], payments: [],
  };
  await page.route('**/api/v1/billing/invoices/demo-invoice', route =>
    route.fulfill({ json: { data: invoice } }));
  await page.goto('/billing/invoices/demo-invoice');
  await expect(page.getByRole('heading', { name: invoice.code, exact: true })).toBeVisible();
  await page.evaluate(() => document.documentElement.classList.add('dark'));
  await savePrint(page, 'invoice');
  await expect(page.getByText('Hàn răng Composite demo', { exact: true })).toBeVisible();
  await expect(page.getByText('HÓA ĐƠN DỊCH VỤ', { exact: true })).toBeVisible();
  expect(await page.locator('.print-document').evaluate(el => getComputedStyle(el).visibility)).toBe('visible');
  expect(await page.getByText('Hàn răng Composite demo', { exact: true }).evaluate(el => getComputedStyle(el).color)).toBe('rgb(17, 17, 17)');
});

test('dashboard invoice shortcut opens the actual invoice list', async ({ page }) => {
  await page.goto('/');
  const shortcut = page.locator('main').getByRole('link', { name: 'Hóa đơn', exact: true });
  await expect(shortcut).toBeVisible();
  await shortcut.click();
  await expect(page).toHaveURL(/\/billing\/list$/);
  await expect(page.getByRole('heading', { name: /hóa đơn/i }).first()).toBeVisible();
});

test('unsaved patient form blocks sidebar navigation and browser back', async ({ page }) => {
  await page.goto('/patients');
  await page.getByRole('button', { name: /^tạo bệnh nhân$/i }).first().click();
  await expect(page).toHaveURL(/\/patients\/new$/);
  await page.getByLabel(/họ và tên/i).fill('Dữ liệu chưa lưu');
  page.on('dialog', dialog => dialog.dismiss());
  await page.locator('aside').getByRole('link', { name: /^dashboard$/i }).click();
  await expect(page).toHaveURL(/\/patients\/new$/);
  await expect(page.getByLabel(/họ và tên/i)).toHaveValue('Dữ liệu chưa lưu');
  await page.goBack();
  await expect(page).toHaveURL(/\/patients\/new$/);
  await expect(page.getByLabel(/họ và tên/i)).toHaveValue('Dữ liệu chưa lưu');
  page.removeAllListeners('dialog');
  page.once('dialog', dialog => dialog.accept());
  await page.locator('aside').getByRole('link', { name: /^dashboard$/i }).click();
  await expect(page).not.toHaveURL(/\/patients\/new$/);
});

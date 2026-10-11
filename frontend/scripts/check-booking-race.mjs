// Run with Vite on port 5173. All API responses are fixtures.
import { chromium, expect } from '@playwright/test';
import { existsSync, mkdirSync } from 'node:fs';
const browser = await chromium.launch({
  ...(process.env.CHROMIUM_PATH || existsSync('/usr/bin/chromium')
    ? { executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium' } : {}),
});
const page = await browser.newPage({ viewport: { width: 320, height: 900 } });
const errors = [];
page.on('pageerror', error => errors.push(error.message));
const base = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:5173';
const service = { id: 'service', name: 'Khám và tư vấn sức khỏe răng miệng toàn diện', category: 'GENERAL', durationMinutes: 30, dentists: [{ id: 'dentist', fullName: 'Bác sĩ Nguyễn Thị Minh Anh', specialties: [] }] };
let optionsFail = false;
let delayedDate;
let releaseOld;
const oldResponse = new Promise(resolve => { releaseOld = resolve; });
await page.route('**/api/**', async route => {
  const url = new URL(route.request().url());
  if (url.pathname.endsWith('/public/booking/options')) {
    return route.fulfill(optionsFail ? { status: 400, json: { message: 'Fixture failure' } } : { json: { data: [service] } });
  }
  if (url.pathname.endsWith('/public/booking/slots')) {
    const old = url.searchParams.get('date') === delayedDate;
    if (old) await oldResponse;
    return route.fulfill({ json: { data: { availableSlots: old ? ['09:00'] : ['14:00', '15:00'] } } });
  }
  return route.fulfill({ status: 400, json: { message: 'Fixture unavailable' } });
});
try {
  await page.goto(base + '/booking');
  const date = page.getByLabel('Ngày', { exact: true });
  const dentist = page.getByLabel('Bác sĩ', { exact: true });
  const time = page.getByLabel('Giờ còn trống', { exact: true });
  await expect(date).toBeVisible();
  delayedDate = await date.inputValue();
  const oldRequest = page.waitForRequest(request => request.url().includes('/public/booking/slots') && new URL(request.url()).searchParams.get('date') === delayedDate);
  await page.getByLabel('Dịch vụ', { exact: true }).selectOption('service');
  await expect(dentist).toHaveValue('dentist');
  await oldRequest;
  const tomorrow = new Date(delayedDate + 'T00:00:00Z');
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  await date.fill(tomorrow.toISOString().slice(0, 10));
  await expect(time).toBeEnabled();
  await time.selectOption('14:00');
  const oldFinished = page.waitForResponse(response => response.url().includes('/public/booking/slots') && new URL(response.url()).searchParams.get('date') === delayedDate);
  releaseOld();
  await (await oldFinished).finished();
  // Let the obsolete fetch's React update run before checking that it was ignored.
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await expect(time).toHaveValue('14:00');
  await expect(time.locator('option')).toHaveText(['Chọn giờ', '14:00', '15:00']);
  console.log('PASS latest date wins after stale response; single dentist selected automatically');
  const behalf = page.getByRole('checkbox', { name: /Tôi đặt hộ/ });
  await page.getByLabel('Ngày sinh', { exact: true }).fill('2020-01-01');
  const guardian = page.getByLabel('Người liên hệ / giám hộ (bắt buộc)', { exact: true });
  await expect(guardian).toBeVisible();
  await expect(guardian).toHaveAttribute('required', '');
  await behalf.check();
  await behalf.uncheck();
  await expect(behalf).not.toBeChecked();
  await expect(guardian).toBeVisible();
  await page.getByLabel('Ngày sinh', { exact: true }).fill('1990-01-01');
  await expect(guardian).toBeHidden();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  mkdirSync('artifacts/ui-polish', { recursive: true });
  await page.screenshot({ path: 'artifacts/ui-polish/booking-loaded-320.png', fullPage: true });
  console.log('PASS guardian requirement and toggle; loaded booking fits 320px');
  optionsFail = true;
  await page.reload();
  await expect(page.getByRole('alert')).toContainText('Không tải được danh sách dịch vụ');
  await expect(page.getByText('Phòng khám chưa mở dịch vụ đặt lịch trực tuyến.', { exact: false })).toHaveCount(0);
  expect(errors).toEqual([]);
  console.log('PASS failed options reports error honestly; no runtime errors');
} finally {
  releaseOld();
  await browser.close();
}

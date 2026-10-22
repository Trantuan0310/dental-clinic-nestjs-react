import { test, expect } from './fixtures';
import { ACCOUNTS, randomVnPhone } from './flow-helpers';

/**
 * Treatment plan (kế hoạch điều trị nhiều buổi) as the admin: draw up a plan
 * for a new patient, quote it, record the patient's agreement, skip a line,
 * then cancel it. Carrying a line out in an encounter is covered by the
 * backend tests (medical-records.service.spec.ts).
 */
test('admin drafts, quotes, agrees and cancels a treatment plan', async ({ page }) => {
  test.setTimeout(90_000);

  const patientName = `E2E Plan Patient ${Date.now()}`;
  await page.goto('/patients/new');
  await page.getByLabel(/^họ tên/i).fill(patientName);
  await page.getByLabel(/ngày sinh/i).fill('1990-03-15');
  await page.getByLabel(/sđt chính/i).fill(randomVnPhone());
  await page.getByRole('button', { name: /^lưu$/i }).click();
  await page.waitForURL(/\/patients\/[0-9a-f-]{20,}$/i, { timeout: 15_000 });

  await page.getByRole('tab', { name: 'Kế hoạch điều trị' }).click();
  await expect(page.getByText('Chưa có kế hoạch điều trị nào.')).toBeVisible();
  await page.getByRole('button', { name: 'Lập kế hoạch' }).click();
  await page.waitForURL(/\/treatment-plans\/new\?patientId=/);

  await page.getByLabel('Tiêu đề').fill('Điều trị tổng quát E2E');
  const dentist = page.getByLabel('Bác sĩ phụ trách');
  const dentistValue = await dentist.locator('option', { hasText: ACCOUNTS.dentist.fullName }).getAttribute('value');
  await dentist.selectOption(dentistValue!);

  const first = page.getByTestId('plan-line').nth(0);
  await first.getByLabel('Thủ thuật').fill('Trám răng composite');
  await first.getByLabel('Răng').fill('16, 26');
  await first.getByLabel('SL').fill('2');
  await first.getByLabel('Đơn giá').fill('350000');
  await page.getByRole('button', { name: 'Thêm dòng' }).click();
  const second = page.getByTestId('plan-line').nth(1);
  await second.getByLabel('Thủ thuật').fill('Cạo vôi răng');
  await second.getByLabel('Đơn giá').fill('300000');
  await expect(page.getByText('Tổng báo giá: 1.000.000')).toBeVisible();

  // A tooth number outside FDI is refused before anything is sent.
  await second.getByLabel('Răng').fill('19');
  await page.getByRole('button', { name: 'Lưu', exact: true }).click();
  await expect(page.getByText('Số răng không hợp lệ: 19')).toBeVisible();
  await second.getByLabel('Răng').fill('');

  await page.getByRole('button', { name: 'Lưu', exact: true }).click();
  await page.waitForURL(/\/treatment-plans\/[0-9a-f-]{36}$/, { timeout: 15_000 });
  await expect(page.getByRole('heading', { name: 'Điều trị tổng quát E2E' })).toBeVisible();
  await expect(page.getByTestId('plan-item')).toHaveCount(2);
  await expect(page.getByText('Nháp', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Báo giá cho khách' }).click();
  await expect(page.getByText('Đã báo giá', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Ghi nhận khách đồng ý' }).click();
  const accept = page.getByRole('dialog');
  await accept.getByLabel('Ghi chú (tuỳ chọn)').fill('Khách đồng ý, trả theo buổi');
  await accept.getByRole('button', { name: 'Xác nhận đồng ý' }).click();
  await expect(page.getByText('Khách đã đồng ý', { exact: true })).toBeVisible();
  await expect(page.getByText(/Đồng ý ngày .*Khách đồng ý, trả theo buổi/)).toBeVisible();

  // Agreed lines are locked; one the patient no longer wants is skipped.
  const scaling = page.getByTestId('plan-item').filter({ hasText: 'Cạo vôi răng' });
  await scaling.getByRole('button', { name: 'Bỏ qua' }).click();
  const skip = page.getByRole('dialog');
  await skip.getByLabel('Lý do bỏ qua').fill('Khách hẹn làm sau');
  await skip.getByRole('button', { name: 'Bỏ qua mục này' }).click();
  await expect(scaling.getByText('Khách hẹn làm sau')).toBeVisible();
  await expect(page.getByText('0/1 mục')).toBeVisible();

  await page.getByRole('button', { name: 'Huỷ kế hoạch' }).click();
  const cancel = page.getByRole('dialog');
  await cancel.getByLabel('Lý do huỷ').fill('Khách chuyển phòng khám khác');
  await cancel.getByRole('button', { name: 'Huỷ kế hoạch' }).click();
  await expect(page.getByText(/Đã huỷ ngày .*Khách chuyển phòng khám khác/)).toBeVisible();

  // The patient page lists it.
  await page.getByRole('link', { name: 'Về hồ sơ bệnh nhân' }).click();
  await page.getByRole('tab', { name: 'Kế hoạch điều trị' }).click();
  await expect(page.getByTestId('patient-plan').filter({ hasText: 'Điều trị tổng quát E2E' })).toContainText('Đã huỷ');
});

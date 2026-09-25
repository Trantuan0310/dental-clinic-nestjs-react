import { test, expect } from './fixtures';

/**
 * Online booking: a patient sends a request from the public page (no login),
 * sees it pending on the status page, and the front desk confirms it into a
 * visit from the requests inbox. The seed lets every dentist take online
 * bookings; the spec books the first free slot in the coming days, so it can
 * run again (each run takes a new slot and a new patient).
 */
test('patient requests a visit online and the front desk confirms it', async ({ page, browser }) => {
  const suffix = Date.now().toString().slice(-6);
  const name = `Khách Online ${suffix}`;
  const phone = `09${suffix}${Math.floor(10 + Math.random() * 89)}`;

  // A patient has no staff session: start from an empty storage state.
  const guest = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  const pub = await guest.newPage();
  await pub.goto('/booking');
  await expect(pub.getByRole('heading', { name: 'Đặt lịch khám' })).toBeVisible();

  const service = pub.getByLabel('Dịch vụ');
  const exam = service.locator('option', { hasText: 'Khám tổng quát' });
  await service.selectOption((await exam.getAttribute('value'))!);
  const dentist = pub.getByLabel('Bác sĩ');
  await expect(dentist.locator('option')).not.toHaveCount(1);
  await dentist.selectOption({ index: 1 });

  // First day in the coming two weeks with a free slot, asked of the same
  // public endpoint the page uses (so the form is filled once, not raced).
  const serviceId = await service.inputValue();
  const dentistId = await dentist.inputValue();
  let day = '';
  for (let k = 1; k <= 14 && !day; k++) {
    const candidate = new Date(Date.now() + 7 * 3600_000 + k * 86_400_000)
      .toISOString()
      .slice(0, 10);
    const res = await pub.request.get(
      `/api/v1/public/booking/slots?serviceId=${serviceId}&dentistId=${dentistId}&date=${candidate}`,
    );
    if (res.ok() && ((await res.json()).data.availableSlots ?? []).length > 0) day = candidate;
  }
  expect(day, 'a free online slot in the next 14 days').not.toBe('');
  await pub.getByLabel('Ngày', { exact: true }).fill(day);
  const time = pub.getByLabel('Giờ còn trống');
  await expect(time).toBeEnabled();
  await time.selectOption({ index: 1 });

  await pub.getByLabel('Họ và tên').fill(name);
  await pub.getByLabel('Ngày sinh').fill('1990-05-01');
  await pub.getByLabel('Số điện thoại', { exact: true }).fill(phone);
  await pub.getByRole('checkbox').check();
  await pub.getByRole('button', { name: 'Gửi yêu cầu đặt lịch' }).click();

  await expect(pub).toHaveURL(/\/booking\/status\?ref=GS-/);
  await expect(pub.getByText('Đang chờ lễ tân xem xét')).toBeVisible();
  const reference = new URL(pub.url()).searchParams.get('ref')!;

  // Front desk (the admin session holds booking_request.manage).
  await page.goto('/booking-requests');
  const row = page.getByRole('row').filter({ hasText: name });
  await expect(row).toContainText(reference);
  await row.getByRole('button', { name: 'Xử lý' }).click();
  await page.getByRole('button', { name: 'Xác nhận lịch' }).click();
  await expect(row).toContainText('Đã xác nhận');

  // The patient's status page now shows the confirmed visit.
  await pub.reload();
  await expect(pub.getByText('Lịch hẹn đã được xác nhận')).toBeVisible();
  await guest.close();
});

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
  // Names on the public form are letters only: the run's suffix as letters.
  const name = `Khách Online ${suffix.replace(/\d/g, (d) => 'ABCDEFGHIK'[Number(d)])}`;
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
  await pub.getByRole('checkbox', { name: /Tôi đồng ý/ }).check();
  await pub.getByRole('button', { name: 'Gửi yêu cầu đặt lịch' }).click();

  await expect(pub).toHaveURL(/\/booking\/status\?new=1&ref=GS-/);
  await expect(pub.getByRole('heading', { name: 'Đã gửi yêu cầu đặt lịch' })).toBeVisible();
  await expect(pub.getByText('Đang chờ lễ tân xem xét')).toBeVisible();
  const reference = new URL(pub.url()).searchParams.get('ref')!;

  // From another device the patient needs only their phone number, typed
  // however they like; an unknown number says so instead of failing silently.
  const other = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  const lookup = await other.newPage();
  await lookup.goto('/booking/status');
  await lookup.getByLabel('Số điện thoại').fill('0399 999 990');
  await lookup.getByRole('button', { name: 'Xem lịch hẹn' }).click();
  await expect(lookup.getByRole('alert')).toContainText('Chưa có lịch đặt nào');
  await lookup.getByLabel('Số điện thoại').fill(phone.replace(/(\d{4})(\d{3})(\d+)/, '$1 $2 $3'));
  await lookup.getByRole('button', { name: 'Xem lịch hẹn' }).click();
  await expect(lookup.getByText('Đang chờ lễ tân xem xét')).toBeVisible();
  // The phone alone shows the status only: no reference code, no changes.
  await expect(lookup.getByText(reference, { exact: true })).toHaveCount(0);
  await expect(lookup.getByText(/Trang này chỉ xem được tình trạng/)).toBeVisible();
  await expect(lookup.getByText('Tôi muốn hủy yêu cầu này')).toHaveCount(0);

  // Front desk (the admin session holds booking_request.manage). The sidebar
  // counts requests waiting on them, including this one.
  await page.goto('/booking-requests');
  const pendingBadge = page
    .getByRole('link', { name: /Yêu cầu đặt lịch/ })
    .getByLabel(/yêu cầu chờ xử lý/);
  await expect(pendingBadge).toBeVisible();
  const pendingBefore = Number(await pendingBadge.textContent());
  const row = page.getByRole('row').filter({ hasText: name });
  await expect(row).toContainText(reference);
  await row.getByRole('button', { name: 'Xử lý' }).click();
  await page.getByRole('button', { name: 'Xác nhận lịch' }).click();
  await expect(row).toContainText('Đã xác nhận');
  // Confirming it takes it off the front desk's count.
  if (pendingBefore > 1) await expect(pendingBadge).toHaveText(String(pendingBefore - 1));
  else await expect(pendingBadge).toBeHidden();

  // The patient's status page now shows the confirmed visit, with a way to
  // put it in their calendar; on another device the code from the email and
  // the phone open it too (view only).
  await pub.reload();
  await expect(pub.getByText('Lịch hẹn đã được xác nhận')).toBeVisible();
  await expect(pub.getByRole('link', { name: 'Thêm vào Google Calendar' })).toBeVisible();
  await lookup.goto('/booking/status?ref=' + reference);
  await lookup.getByLabel('Số điện thoại').fill(phone);
  await lookup.getByRole('button', { name: 'Xem lịch hẹn' }).click();
  await expect(lookup.getByText('Lịch hẹn đã được xác nhận')).toBeVisible();
  await expect(lookup.getByText(reference, { exact: true })).toBeVisible();
  await other.close();
  await guest.close();
});

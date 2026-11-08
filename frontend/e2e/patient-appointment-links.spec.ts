import { test, expect } from './fixtures';

const baseAppointment = {
  startAt: '2026-11-16T03:00:00.000Z',
  endAt: '2026-11-16T03:30:00.000Z',
  status: 'SCHEDULED',
  confirmedByPatient: false,
  confirmedAt: null,
  dentist: { fullName: 'BS. Nguyễn An' },
  services: [{ name: 'Khám tổng quát' }],
  canConfirm: true,
  canReschedule: true,
  canCancel: true,
  cancelUntil: '2026-11-15T03:00:00.000Z',
  rescheduleRequest: null,
};

test('patient confirms and asks to move an appointment from the public link', async ({ browser }) => {
  const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  const page = await context.newPage();
  let confirmed = false;
  let rescheduleBody: Record<string, unknown> | undefined;
  await page.route('**/api/v1/public/appointment-links/valid-token**', async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith('/slots')) {
      return route.fulfill({ json: { data: { date: '2026-11-17', slots: [{ startAt: '2026-11-17T03:00:00.000Z', endAt: '2026-11-17T03:30:00.000Z' }] } } });
    }
    if (route.request().method() === 'POST' && url.pathname.endsWith('/confirm')) {
      confirmed = true;
      return route.fulfill({ json: { data: { ...baseAppointment, confirmedByPatient: true, confirmedAt: '2026-11-08T00:00:00Z' } } });
    }
    if (route.request().method() === 'POST' && url.pathname.endsWith('/reschedule')) {
      const body = route.request().postDataJSON() as Record<string, string>;
      rescheduleBody = body;
      return route.fulfill({ json: { data: { ...baseAppointment, confirmedByPatient: true, canConfirm: false, rescheduleRequest: { id: 'req-1', status: 'PENDING', requestedStartAt: body.startAt, requestedEndAt: null, note: body.note ?? null, holdUntil: null } } } });
    }
    return route.fulfill({ json: { data: { ...baseAppointment, confirmedByPatient: confirmed, canConfirm: !confirmed } } });
  });
  await page.goto('/lich-hen/valid-token');
  await expect(page.getByRole('heading', { name: 'Lịch hẹn của bạn' })).toBeVisible();
  await expect(page.getByText('BS. Nguyễn An')).toBeVisible();
  await page.getByRole('button', { name: 'Xác nhận lịch hẹn' }).click();
  await expect(page.getByRole('status')).toContainText('Bạn đã xác nhận lịch hẹn');
  expect(confirmed).toBe(true);

  await page.getByLabel('Ngày muốn dời').fill('2026-11-17');
  const slot = page.getByLabel('Giờ còn trống');
  await expect(slot.locator('option')).toHaveCount(2);
  await slot.selectOption({ index: 1 });
  await page.getByLabel('Ghi chú dời lịch').fill('Buổi sáng nếu có thể');
  await page.getByRole('button', { name: 'Gửi yêu cầu dời lịch' }).click();
  await expect(page.getByText(/đã gửi yêu cầu dời lịch/i)).toBeVisible();
  expect(rescheduleBody).toEqual({ startAt: '2026-11-17T03:00:00.000Z', note: 'Buổi sáng nếu có thể' });
  await context.close();
});

test('invalid patient link shows a generic message without appointment details', async ({ browser }) => {
  const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  const page = await context.newPage();
  await page.route('**/api/v1/public/appointment-links/not-valid', (route) => route.fulfill({ status: 404, json: { message: 'Not found' } }));
  await page.goto('/lich-hen/not-valid');
  await expect(page.getByRole('alert')).toContainText('Liên kết không hợp lệ hoặc đã hết hạn');
  await expect(page.getByText('BS. Nguyễn An')).toHaveCount(0);
  await context.close();
});

test('cancel confirmation remains visible even when that link has expired', async ({ browser }) => {
  const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  const page = await context.newPage();
  await page.route('**/api/v1/public/appointment-links/**', async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith('/cancel')) {
      return route.fulfill({ json: { data: { ...baseAppointment, status: 'CANCELLED', canConfirm: false, canReschedule: false, canCancel: false } } });
    }
    if (url.pathname.endsWith('/slots')) {
      return route.fulfill({ json: { data: { date: '2026-11-17', slots: [{ startAt: '2026-11-17T03:00:00.000Z', endAt: '2026-11-17T03:30:00.000Z' }] } } });
    }
    if (url.pathname.endsWith('/expired-after-cancel')) {
      return route.fulfill({ status: 404, json: { message: 'Not found' } });
    }
    return route.fulfill({ json: { data: baseAppointment } });
  });
  await page.goto('/lich-hen/cancel-link');
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'Hủy lịch hẹn' }).click();
  await expect(page.getByRole('status')).toContainText('Lịch hẹn đã được hủy');
  await expect(page.getByRole('alert')).toHaveCount(0);
  await page.goto('/lich-hen/expired-after-cancel');
  await expect(page.getByRole('alert')).toContainText('Liên kết không hợp lệ hoặc đã hết hạn');
  await expect(page.getByText('Lịch hẹn đã được hủy')).toHaveCount(0);
  await context.close();
});

test('changing link token clears the previous link form and feedback', async ({ browser }) => {
  const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  const page = await context.newPage();
  await page.route('**/api/v1/public/appointment-links/**', async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith('/slots')) return route.fulfill({ json: { data: { date: '2026-11-17', slots: [{ startAt: '2026-11-17T03:00:00.000Z', endAt: '2026-11-17T03:30:00.000Z' }] } } });
    if (url.pathname.endsWith('/reschedule')) return route.fulfill({ json: { data: { ...baseAppointment, rescheduleRequest: { id: 'req-2', status: 'PENDING', requestedStartAt: '2026-11-17T03:00:00.000Z', requestedEndAt: '2026-11-17T03:30:00.000Z', note: 'Xin đổi', holdUntil: null } } } });
    return route.fulfill({ json: { data: baseAppointment } });
  });
  await page.goto('/lich-hen/first-link');
  await page.getByLabel('Ngày muốn dời').fill('2026-11-17');
  await page.getByLabel('Giờ còn trống').selectOption({ index: 1 });
  await page.getByLabel('Ghi chú dời lịch').fill('Xin đổi');
  await page.getByRole('button', { name: 'Gửi yêu cầu dời lịch' }).click();
  await expect(page.getByRole('status')).toContainText('Đã gửi yêu cầu dời lịch');
  await page.evaluate(() => {
    window.history.pushState({}, '', '/lich-hen/second-link');
    window.dispatchEvent(new PopStateEvent('popstate'));
  });
  await expect(page.getByText('Đã gửi yêu cầu dời lịch')).toHaveCount(0);
  await expect(page.getByLabel('Ngày muốn dời')).toHaveValue('');
  await expect(page.getByLabel('Ghi chú dời lịch')).toHaveValue('');
  await context.close();
});

test('staff reviews and approves a patient reschedule request', async ({ page }) => {
  let approveBody: Record<string, unknown> | undefined;
  await page.route('**/api/v1/appointment-links/reschedule-requests', (route) => route.fulfill({ json: { data: [{
    id: 'request-1', appointmentId: 'appointment-1', requestedStartAt: '2026-11-17T03:00:00.000Z', requestedEndAt: '2026-11-17T03:30:00.000Z', note: 'Buổi sáng', status: 'PENDING', holdUntil: null, createdAt: '2026-11-08T00:00:00.000Z',
    appointment: { id: 'appointment-1', startAt: '2026-11-16T03:00:00.000Z', endAt: '2026-11-16T03:30:00.000Z', status: 'CONFIRMED', confirmedByPatient: true, patient: { id: 'patient-1', fullName: 'Nguyễn Minh Anh', primaryPhone: '0900000000' }, dentist: { id: 'dentist-1', fullName: 'BS. Nguyễn An' } },
  }] } }));
  await page.route('**/api/v1/appointment-links/reschedule-requests/request-1/approve', async (route) => {
    approveBody = route.request().postDataJSON();
    return route.fulfill({ json: { data: { id: 'request-1', status: 'APPROVED' } } });
  });
  await page.goto('/appointment-links/reschedule-requests');
  await expect(page.getByRole('heading', { name: 'Yêu cầu dời lịch' })).toBeVisible();
  await expect(page.getByText('Nguyễn Minh Anh')).toBeVisible();
  await page.getByRole('button', { name: 'Duyệt và dời lịch' }).click();
  await expect.poll(() => approveBody).toEqual({});
});

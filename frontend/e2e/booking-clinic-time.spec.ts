import { test, expect } from './fixtures';
import { ACCOUNTS, loginAs } from './flow-helpers';

/**
 * Issue #8: the booking form used the browser's time zone, so a front desk
 * PC not set to Vietnam time booked the wrong hour. This browser runs in
 * UTC; the time picked in the form must still be sent as clinic time.
 */
test('a front desk PC set to UTC still books clinic wall-clock time', async ({ browser }) => {
  // Explicitly empty storage: the `browser` fixture would otherwise hand this
  // context admin.json, and reusing admin's refresh token here revokes every
  // admin session for the rest of the suite (see appointment-booking-roles).
  const context = await browser.newContext({
    timezoneId: 'UTC',
    storageState: { cookies: [], origins: [] },
  });
  const page = await context.newPage();
  try {
    await loginAs(page, ACCOUNTS.receptionist.email, ACCOUNTS.receptionist.password);
    // A weekday at least 10 days out (seeded schedules run Monday–Friday).
    let day = new Date(Date.now() + 7 * 3600000 + 10 * 86400000);
    while ([0, 6].includes(day.getUTCDay())) day = new Date(day.getTime() + 86400000);
    const date = day.toISOString().slice(0, 10);

    await page.goto('/appointments/list');
    await page.getByRole('button', { name: 'Tạo lịch hẹn' }).first().click();
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('button', { name: 'Tìm bệnh nhân' }).click();
    await dialog.getByLabel('Tìm bệnh nhân').fill('Phạm');
    await dialog.getByRole('button', { name: /chọn →/i }).first().click();
    await dialog.getByLabel('Bác sĩ').selectOption({ label: 'BS. Trần Thị Bình' });
    await dialog.getByLabel('Ngày *').fill(date);

    const firstFree = dialog.getByText('Giờ trống phù hợp').locator('..').getByRole('button').first();
    const time = (await firstFree.innerText()).trim();
    await firstFree.click();

    const request = page.waitForRequest(
      (r) => r.method() === 'POST' && new URL(r.url()).pathname.endsWith('/api/v1/appointments'),
    );
    await dialog.getByRole('button', { name: 'Tạo lịch hẹn' }).click();
    const body = (await request).postDataJSON() as { startAt: string };
    expect(body.startAt).toBe(new Date(`${date}T${time}:00+07:00`).toISOString());
    await expect(dialog).toBeHidden();
  } finally {
    await context.close();
  }
});

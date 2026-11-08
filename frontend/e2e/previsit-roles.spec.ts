import { randomBytes, createHash } from 'node:crypto';
import { PrismaClient } from '../../backend/node_modules/@prisma/client';
import { expect, getSharedContext, persistAuthState, test } from './fixtures';
import { ACCOUNTS, loginAs } from './flow-helpers';

test('patient confirms and reports an allergy, reception approves, dentist sees it', async ({ browser }) => {
  const url = process.env.DATABASE_URL && new URL(process.env.DATABASE_URL);
  test.skip(!url || !['localhost', '127.0.0.1'].includes(url.hostname) || url.pathname !== '/dental_e2e',
    'Requires the dedicated local dental_e2e fixture database');
  const db = new PrismaClient();
  const guest = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  const staff = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  const dentist = await (await getSharedContext(browser, 'e2e/.auth/dentist.json')).newPage();
  try {
    const code = 'UAT-' + Date.now();
    const patient = await db.patient.create({ data: {
      code, fullName: code, dob: new Date('1995-01-15'), gender: 'MALE',
    } });
    const doctor = await db.user.findUniqueOrThrow({ where: { email: ACCOUNTS.dentist.email } });
    const startAt = new Date(Date.now() + 7 * 86400000);
    const token = randomBytes(32).toString('base64url');
    const appointment = await db.appointment.create({ data: {
      patientId: patient.id, dentistId: doctor.id, startAt, endAt: new Date(+startAt + 1800000),
      status: 'SCHEDULED',
    } });
    await db.appointmentLink.create({ data: {
      appointmentId: appointment.id, patientId: patient.id, expiresAt: startAt,
      tokenHash: createHash('sha256').update(token).digest('hex'),
    } });
    const page = await guest.newPage();
    await page.goto('/lich-hen/' + token);
    await page.getByRole('button', { name: 'Xác nhận lịch hẹn' }).click();
    await expect(page.getByText('Bạn đã xác nhận lịch hẹn.')).toBeVisible();
    await page.getByText('Phiếu khai trước khi đến', { exact: true }).click();
    await page.getByLabel('Lý do khám').fill('Khám định kỳ');
    await page.getByRole('button', { name: 'Tiếp tục' }).click();
    await page.getByLabel('Dị ứng', { exact: true }).fill('Latex UAT');
    await page.getByRole('button', { name: 'Gửi phiếu' }).click();
    await expect(page.getByText(/Đã nhận phiếu khai/)).toBeVisible();
    const reception = await staff.newPage();
    await loginAs(reception, ACCOUNTS.receptionist.email, ACCOUNTS.receptionist.password);
    await reception.goto('/appointments/list?open=' + appointment.id);
    await expect(reception.getByText('Khách đã xác nhận').last()).toBeVisible();
    await reception.getByText('Có phiếu khai chờ duyệt').click();
    await expect(reception.getByText(/Khách đã khai: Latex UAT/)).toBeVisible();
    await reception.getByRole('button', { name: 'Duyệt phiếu' }).click();
    await expect(reception.getByText('Đã duyệt phiếu khai')).toBeVisible();
    await dentist.goto('/patients/' + patient.id);
    await expect(dentist.getByText(/Latex UAT/).first()).toBeVisible();
  } finally {
    await Promise.all([guest.close(), staff.close(), dentist.close(), db.$disconnect()]);
    await persistAuthState();
  }
});

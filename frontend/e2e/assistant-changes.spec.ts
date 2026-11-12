import { test, expect, type Page } from '@playwright/test';
async function propose(page: Page, type: string, readonly = false) {
  await page.route('**/ai/assistant/chat', route => route.fulfill({ json: { data: {
    source: 'llm', reply: 'Chờ xác nhận', refs: {}, names: { P1: 'Test patient' }, actions: [{
      type, payload: { proposalId: 'proposal-1' }, view: { patientRef: 'P1', dentistName: 'New dentist',
        startAt: '2099-12-02T10:00:00+07:00', endAt: '2099-12-02T11:00:00+07:00', reason: 'Patient requested',
        previousStartAt: '2099-12-01T09:00:00+07:00', previousEndAt: '2099-12-01T10:00:00+07:00', previousDentistName: 'Old dentist' },
    }],
  } } }));
  page.on('pageerror', error => { throw error; });
  await page.goto(`/e2e/assistant-changes.html${readonly ? '?readonly' : ''}`);
  await page.getByTestId('assistant-input').fill('Đổi lịch');
  await page.getByTestId('assistant-input').press('Enter');
  await expect(page.getByTestId('assistant-card')).toContainText('Test patient');
}
for (const type of ['cancel_appointment', 'reschedule_appointment'] as const) {
  test(`${type} waits for confirmation and sends only the proposal ID`, async ({ page }) => {
    let confirmations = 0;
    let body: unknown;
    await page.route('**/ai/assistant/actions/confirm-change', async route => {
      confirmations++; body = route.request().postDataJSON();
      await route.fulfill({ json: { data: { id: 'appt' } } });
    });
    await propose(page, type);
    const card = page.getByTestId('assistant-card');
    expect(confirmations).toBe(0);
    if (type === 'reschedule_appointment') await expect(card).toContainText('Old dentist');
    await card.getByRole('button', { name: type === 'cancel_appointment' ? 'Xác nhận hủy lịch' : 'Xác nhận dời lịch' }).click();
    await expect(card).toContainText(type === 'cancel_appointment' ? 'Đã hủy lịch' : 'Đã dời lịch');
    await expect(card.getByRole('button')).toHaveCount(0);
    expect(confirmations).toBe(1);
    expect(body).toEqual({ proposalId: 'proposal-1' });
  });
}
test('own-scope read-only user can chat but cannot confirm', async ({ page }) => {
  await propose(page, 'cancel_appointment', true);
  await expect(page.getByTestId('assistant-card').getByRole('button')).toHaveCount(0);
});
test('confirmation failure never claims success', async ({ page }) => {
  await page.route('**/ai/assistant/actions/confirm-change', route => route.fulfill({ status: 409, json: { message: 'Lịch đã thay đổi' } }));
  await propose(page, 'cancel_appointment');
  const card = page.getByTestId('assistant-card');
  await card.getByRole('button', { name: 'Xác nhận hủy lịch' }).click();
  await expect(page.getByText('Lịch đã thay đổi', { exact: true })).toBeVisible();
  await expect(card).not.toContainText('Đã hủy lịch');
});

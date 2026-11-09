import { expect, test } from './fixtures';

test('patient submits a pre-visit form from the mobile appointment page', async ({ browser }) => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    storageState: { cookies: [], origins: [] },
  });
  const page = await context.newPage();
  const url = '**/api/v1/public/appointment-links/test-intake';
  const startAt = new Date(Date.now() + 86400000).toISOString();
  await page.route('**/api/v1/public/consent-notices', route => route.fulfill({
    json: { data: { intake: { text: 'UAT intake notice', version: 'uat-v1' } } },
  }));
  await page.route(url, route => route.fulfill({ json: { data: {
    startAt, endAt: startAt, services: [], status: 'SCHEDULED',
    canConfirm: true, canCancel: true, canReschedule: true, confirmedByPatient: false,
  } } }));
  let submitted: unknown;
  await page.route(url + '/intake', route => {
    submitted = route.request().postDataJSON();
    return route.fulfill({ status: 201, json: { data: { status: 'PENDING' } } });
  });
  await page.goto('/lich-hen/test-intake');
  await page.getByText('Phiếu khai trước khi đến', { exact: true }).click();
  await page.getByLabel('Lý do khám').fill('Khám định kỳ');
  await page.getByRole('button', { name: 'Tiếp tục' }).click();
  await page.getByLabel('Dị ứng', { exact: true }).fill('Latex\nPenicillin');
  await page.getByRole('checkbox', { name: 'UAT intake notice' }).check();
  await page.getByRole('button', { name: 'Gửi phiếu' }).click();
  await expect(page.getByText(/Đã nhận phiếu khai/)).toBeVisible();
  expect(submitted).toEqual({
    reason: 'Khám định kỳ', allergies: ['Latex', 'Penicillin'],
    emergencyContact: '', chronicDiseases: [], currentMedications: [],
    consent: true, consentVersion: 'uat-v1',
  });
  await context.close();
});

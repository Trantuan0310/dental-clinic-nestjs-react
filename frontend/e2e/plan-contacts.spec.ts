import { test, expect } from './fixtures';

test('the uncontacted filter keeps the other plan of the same patient', async ({ page }) => {
  const plans = [
    {
      id: 'a',
      title: 'A UAT',
      contacts: [
        { id: 'c', channel: 'PHONE', outcome: 'CALL_BACK', contactedAt: '2030-01-02T02:00:00Z' },
      ],
    },
    { id: 'b', title: 'B UAT', contacts: [] },
  ];
  await page.route('**/treatment-plans/pending', route =>
    route.fulfill({
      json: {
        data: {
          rows: [
            {
              patientId: 'p',
              patientName: 'Test',
              patientCode: 'UAT',
              procedures: ['Test'],
              plans,
              lineCount: 2,
              value: 1000,
              waitingDays: 1,
              nextAppointmentAt: null,
            },
          ],
        },
      },
    }),
  );
  await page.goto('/pending-treatments');
  await expect(page.getByText('Liên hệ · A UAT (1)')).toBeVisible();
  await page.getByRole('checkbox', { name: 'Chưa liên hệ thành công' }).check();
  await expect(page.getByText('Liên hệ · A UAT (1)')).toHaveCount(0);
  await page.getByText('Liên hệ · B UAT (0)').click();
  await page.getByRole('button', { name: 'Soạn tin mời' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
});

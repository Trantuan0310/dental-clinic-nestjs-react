import { test, expect } from './fixtures';

test('opening a waitlist booking keeps the service and clinic time selected', async ({ page }) => {
  const slot = { startAt: '2030-05-06T02:30:00Z', dentistId: 'doc' };
  await page.route('**/api/v1/waitlist*', route => route.fulfill({ json: { slot, data: [{
    id: 'entry', patientId: 'patient', serviceId: 'svc', dentistId: null, period: 'AM',
    fromDate: '2030-05-06', toDate: '2030-05-06', patient: { fullName: 'Khách UAT' },
    service: { name: 'Dịch vụ UAT' }, dentist: null, note: '',
  }] } }));
  await page.route('**/api/v1/dentists/doc/services?*', route => route.fulfill({ json: { data: [{
    current: true, effectiveDurationMin: 30, effectivePrice: 100000,
    service: { id: 'svc', name: 'Dịch vụ UAT', isActive: true },
  }] } }));
  await page.goto('/waitlist');
  await page.getByRole('button', { name: 'Đặt lịch', exact: true }).click();
  await expect(page.getByRole('checkbox', { name: /Dịch vụ UAT/ })).toBeChecked();
  await expect(page.locator('input[type=time]')).toHaveValue('09:30');
});

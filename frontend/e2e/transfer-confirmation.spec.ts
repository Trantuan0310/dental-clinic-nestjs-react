import { expect, test } from '@playwright/test';

test('open invoice announces an incoming bank payment and retains the receipt on reload', async ({ page }) => {
  const id = '00000000-0000-4000-8000-000000000302';
  const user = { id: 'staff', email: 'staff@example.test', fullName: 'Demo', status: 'active', roles: ['receptionist'], permissions: ['invoice.read', 'invoice.payment.create'] };
  const now = new Date().toISOString();
  let paid = false;
  await page.addInitScript(() => localStorage.setItem('gensmile.i18n', 'en'));
  await page.route('**/api/v1/**', async route => {
    const path = new URL(route.request().url()).pathname;
    let data: unknown = [];
    if (path.endsWith('/auth/refresh')) data = { accessToken: 'test', user, accessTokenExpiresIn: 3600 };
    if (path.endsWith('/auth/me')) data = user;
    if (path.endsWith('/payment-qr')) data = { configured: true, payable: !paid, amount: 2000, content: 'INV2000' };
    if (path.endsWith('/invoices/' + id)) data = {
      id, code: 'INV-2000', status: paid ? 'PAID' : 'ISSUED', createdAt: now, issuedAt: now,
      subtotal: 2000, total: 2000, paidAmount: paid ? 2000 : 0, outstandingAmount: paid ? 0 : 2000,
      patientId: 'patient', patientName: 'Demo', items: [], audits: [],
      payments: paid ? [{ id: 'receipt', method: 'BANK_TRANSFER', amount: 2000, paidAt: now }] : [],
    };
    await route.fulfill({ json: { data } });
  });
  await page.goto('/billing/invoices/' + id);
  await expect(page.getByRole('heading', { name: 'INV-2000' })).toBeVisible();
  const toast = page.getByRole('status').filter({ hasText: 'by bank transfer' });
  await expect(toast).toHaveCount(0);
  paid = true;
  await expect(toast).toBeVisible({ timeout: 15000 });
  const receipt = page.locator('.payment-confirmation');
  await expect(receipt).toContainText('Remaining balance: 0');
  await page.reload();
  await expect(receipt).toBeVisible();
  await expect(toast).toHaveCount(0);
});

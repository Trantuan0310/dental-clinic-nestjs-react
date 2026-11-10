import { test, expect } from './fixtures';

test('inventory exports the suggested order for the selected lead time', async ({ page }) => {
  await page.route('**/inventory/reorder?*', route =>
    route.fulfill({
      json: {
        data: [
          {
            id: 'i',
            sku: 'UAT-1',
            name: 'Vật tư thử',
            unit: 'cái',
            stock: 4,
            daily30: 0.1,
            daily90: 0.05,
            daysLeft: 40,
            suggested: 2,
          },
        ],
      },
    }),
  );
  await page.goto('/inventory');
  await page.locator('summary').filter({ hasText: 'Nên nhập' }).click();
  await page.getByLabel('Số ngày đặt hàng').fill('60');
  await expect(page.getByRole('cell', { name: 'UAT-1' })).toBeVisible();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Xuất CSV', exact: true }).click();
  expect((await download).suggestedFilename()).toBe('nen-nhap-60-ngay.csv');
});

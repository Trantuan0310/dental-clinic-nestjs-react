import { test, expect } from './fixtures';
test('approver sees uncovered bookings and free chair time separately', async ({ page }) => {
  await page.route('**/billing/reports/shift-coverage?*', route =>
    route.fulfill({
      json: {
        data: {
          dentists: [],
          cells: [{ weekday: 1, hour: 9, availableMin: 60, bookedMin: 0, demandMin: 30 }],
        },
      },
    }),
  );
  await page.goto('/shifts/pending');
  await page.locator('summary').filter({ hasText: 'Phủ ca so với lịch đặt' }).click();
  await expect(
    page.getByRole('table', { name: 'Giờ làm khả dụng (phút)' }).getByText('Trống 60′'),
  ).toBeVisible();
  await expect(
    page.getByRole('table', { name: 'Nhu cầu lịch đặt (phút)' }).getByText('Thiếu 30′'),
  ).toBeVisible();
});

import { test, expect } from './fixtures';

test('reception sees two chairs and the next patient', async ({ page }) => {
  await page.route('**/api/v1/queue/chairs', route => route.fulfill({ json: {data: [
    { dentistId: '1', name: 'BS An', current: [{ name: 'Khách đang khám', startedAt: new Date().toISOString() }], next: null, waiting: 0 },
    { dentistId: '2', name: 'BS Bình', current: [], next: { id: 'q1', name: 'Khách kế tiếp', called: false, minutes: 31 }, waiting: 1 },
  ]} }));
  await page.goto('/dispatch');
  await page.getByRole('button', {name:'Bảng ghế'}).click();
  const board = page.getByRole('region', {name:'Bảng ghế'});
  await expect(board.getByText('BS An')).toBeVisible();
  await expect(board.getByText('BS Bình')).toBeVisible();
  await expect(board.getByText('Chờ 31 phút')).toBeVisible();
});

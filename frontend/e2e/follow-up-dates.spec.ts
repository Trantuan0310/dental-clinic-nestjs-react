import { test, expect } from './fixtures';

test('desk can choose a service recall date and then edit it', async ({page}) => {
  await page.route('**/appointments/follow-up/*/*', route => route.fulfill({json:{data:[
    {id:'a',service:'Dịch vụ A',date:'2030-02-28'},
    {id:'b',service:'Dịch vụ B',date:'2030-05-31'},
  ]}}));
  await page.goto('/appointments?type=follow_up&patientId=123&encounterId=456');
  await page.getByRole('button',{name:'Dịch vụ B · 31/05/2030'}).click();
  const date = page.getByRole('dialog').locator('input[type=date]').first();
  await expect(date).toHaveValue('2030-05-31');
  await date.fill('2030-06-01');
  await expect(date).toHaveValue('2030-06-01');
});

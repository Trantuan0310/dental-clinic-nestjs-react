import { test, expect, getSharedContext } from './fixtures';

/**
 * The floating assistant. CI runs without a model, so the answer is the
 * "not configured" notice; the tool loop and the confirm card are covered by
 * the backend unit tests (ai-chat.service.spec.ts). This checks the chat opens,
 * sends, shows the answer and never creates anything by itself.
 */
test('assistant chat opens and answers', async ({ browser }) => {
  // Shared admin context: the admin.json refresh cookie is single-use.
  const admin = await getSharedContext(browser, 'e2e/.auth/admin.json');
  const page = await admin.newPage();
  try {
    await page.goto('/dashboard');
    await page.getByTestId('assistant-open').click();
    await expect(page.getByTestId('assistant-panel')).toBeVisible();

    await page.getByTestId('assistant-input').fill('Ai chưa đặt lịch điều trị?');
    await page.getByRole('button', { name: 'Gửi' }).click();

    await expect(page.getByTestId('assistant-reply').first()).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId('assistant-card')).toHaveCount(0);

    await page.getByRole('button', { name: 'Đóng trợ lý' }).click();
    await expect(page.getByTestId('assistant-panel')).toBeHidden();
  } finally {
    await page.close();
  }
});

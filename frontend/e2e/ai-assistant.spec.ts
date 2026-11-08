import { test, expect, getSharedContext } from './fixtures';

test('only template replies carry the fallback label in a mixed conversation', async ({ browser }) => {
  const admin = await getSharedContext(browser, 'e2e/.auth/admin.json');
  const page = await admin.newPage();
  try {
    let source = 'fallback';
    await page.route('**/ai/assistant/chat', (route) => route.fulfill({
      json: { data: { source, reply: 'Câu trả lời', actions: [], refs: {}, names: {} } },
    }));
    await page.goto('/');
    await page.getByTestId('assistant-open').click();
    const input = page.getByTestId('assistant-input');
    const replies = page.getByTestId('assistant-reply');
    await input.fill('Lịch hôm nay?');
    await input.press('Enter');
    await expect(replies.first().getByText('Trả lời theo mẫu', { exact: true })).toBeVisible();

    source = 'llm';
    await input.fill('Lịch ngày mai?');
    await input.press('Enter');
    await expect(replies.nth(1)).toHaveText('Câu trả lời');
    await expect(replies.first().getByText('Trả lời theo mẫu', { exact: true })).toBeVisible();
  } finally {
    await page.close();
  }
});

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
    await page.goto('/');
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

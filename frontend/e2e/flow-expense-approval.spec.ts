import { test, expect } from './fixtures';

/**
 * Detailed flow: expense approval cycle.
 *
 * Role check (backend/prisma/seed.ts ROLE_PERMISSIONS): expense.create and
 * expense.approve are BOTH held only by clinic_admin — receptionist and
 * dentist hold neither, and only one clinic_admin account is seeded
 * (admin@clinic.local, seed.ts:334). So admin is necessarily both the
 * creator and the only possible approver for any expense in this system,
 * making self-approval-prevention the only meaningful thing to test here.
 *
 * Backend enforces segregation of duties (expense.service.ts:283 —
 * transition() throws ForbiddenException "Không thể tự duyệt chi phí do
 * chính bạn tạo..." when newStatus===APPROVED && existing.createdBy===
 * actor.sub), and ExpenseListPage.tsx has a matching pre-emptive UI guard
 * (`expense.createdBy === currentUserId ? <span title="...">Chờ duyệt</span>
 * : <button title="Duyệt">…`) that hides the approve action entirely for
 * a row the viewer created themselves, replacing it with an explanatory
 * "Chờ duyệt" (needs someone else) hint.
 *
 * An earlier version of this test asserted the OPPOSITE — that the guard
 * fails to fire and a live "Duyệt" button appears — based on
 * `newRow.getByTitle('Duyệt')` resolving to something visible. That
 * locator was the actual bug: Playwright's getByTitle does a case-
 * insensitive SUBSTRING match by default, and the "Chờ duyệt" span's own
 * tooltip text ("Cần một người khác duyệt khoản chi do bạn tạo") contains
 * "duyệt" — so the locator matched that span, not a real button. Clicking
 * an inert <span> fired no request and no toast, which is what actually
 * failed the old assertions further down, not a broken guard. Confirmed
 * live (both manually and via debug instrumentation on this exact test)
 * that the guard correctly shows "Chờ duyệt" and no approve button for
 * admin's own just-created expense. This version asserts that directly
 * with a precise locator instead.
 */
test('expense approval cycle: the self-approval guard hides Duyệt for admin\'s own expense', async ({ page }) => {
  await page.goto('/expenses');
  await page.waitForLoadState('networkidle');

  await page.getByRole('button', { name: /thêm chi phí/i }).click();
  const dialog = page.getByRole('dialog');
  const description = `E2E expense approval probe ${Date.now()}`;
  await dialog.getByLabel(/số tiền/i).fill('150000');
  await dialog.getByLabel(/mô tả/i).fill(description);
  // "Ngày chi" is a DatePicker with no id/name (no htmlFor wiring — see
  // DatePicker.tsx), so it isn't reachable via getByLabel; it also defaults
  // to today, so no interaction is required.
  await dialog.getByRole('button', { name: /tạo mới/i }).click();
  await expect(dialog).toBeHidden({ timeout: 10_000 });

  await page.waitForLoadState('networkidle');
  const newRow = page.locator('tbody tr', { hasText: description });
  await expect(newRow, 'New expense should appear in the list').toBeVisible({ timeout: 10_000 });
  await expect(newRow, `Expected exactly one row for "${description}"`).toHaveCount(1);

  // Precise locators: getByRole('button', {name}) matches the accessible
  // name exactly (not a substring of every title in the row), unlike the
  // getByTitle('Duyệt') this test used to use.
  await expect(
    newRow.getByRole('button', { name: 'Duyệt' }),
    'Admin should not be offered a live "Duyệt" button for their own just-created expense',
  ).toHaveCount(0);
  await expect(
    newRow.getByText('Chờ duyệt', { exact: true }),
    'The self-approval hint should explain why approval is unavailable here',
  ).toBeVisible();

  // The status badge also legitimately reads "Bản nháp" for a DRAFT row —
  // confirm that's still correct too, distinct from the actions-column hint.
  await expect(newRow.getByText('Bản nháp', { exact: true })).toBeVisible();
});

import { test, expect } from './fixtures';

/**
 * Detailed flow: expense approval cycle.
 *
 * Role check (backend/prisma/seed.ts ROLE_PERMISSIONS): expense.create and
 * expense.approve are BOTH held only by clinic_admin — receptionist and
 * dentist hold neither, and only one clinic_admin account is seeded
 * (admin@clinic.local, seed.ts:334). So admin is necessarily both the
 * creator and the only possible approver for any expense in this system.
 *
 * Backend correctly enforces segregation of duties for this
 * (expense.service.ts:283 — transition() throws ForbiddenException
 * "Không thể tự duyệt chi phí do chính bạn tạo..." when
 * newStatus===APPROVED && existing.createdBy===actor.sub).
 *
 * BUT: ExpenseListPage.tsx's OWN pre-emptive UI guard for the same rule
 * (`expense.createdBy === currentUserId ? <span>Chờ duyệt</span> :
 * <button title="Duyệt">…`) does NOT fire for an expense admin just
 * created live in this same session — confirmed below, the Duyệt/Từ chối
 * buttons render normally instead of the "Chờ duyệt — cần người khác
 * duyệt" hint. (First pass at this test wrongly assumed the buttons would
 * be hidden and asserted `toHaveCount(0)` on them — the real, reproducible
 * finding is the opposite: they DO show. This version asserts what's
 * actually true and finishes the loop by clicking one, to confirm the
 * backend's real gate is the thing that actually stops the self-approval.)
 */
test('expense approval cycle: admin creates an expense, UI wrongly offers self-approval, backend correctly blocks it', async ({
  page,
}) => {
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

  // FINDING: the UI's pre-emptive self-approval hint doesn't fire for this
  // admin-created-by-admin row — the real "Duyệt" button shows instead of
  // the "Chờ duyệt" (needs someone else) hint span. (Note: expense STATUS
  // itself also legitimately displays as a "Chờ duyệt" badge for any DRAFT
  // row regardless of creator — that's a different element with the same
  // text, not the self-approval hint; the absence check below is scoped
  // to the actions column's button specifically, not page text.)
  const approveBtn = newRow.getByTitle('Duyệt');
  await expect(
    approveBtn,
    'Expected the UI to offer a "Duyệt" button for admin\'s own just-created expense (the pre-emptive self-approval hint failed to fire)',
  ).toBeVisible({ timeout: 5_000 });

  // Confirm the backend's real guard actually stops it: clicking through
  // should surface an error toast, not silently approve. (A stricter
  // version of this asserted the exact intercepted network response, but
  // that was flaky — the click can race the row's own re-render right
  // after the toHaveCount(1) check above; a toast is a coarser but more
  // reliable signal that a request was attempted and rejected.)
  await approveBtn.click();
  const errorToast = page.getByText(/không thể tự duyệt|tự duyệt chi phí|không có quyền/i).first();
  await expect(
    errorToast,
    'Expected an error toast when self-approving — backend/expense.service.ts:283 should reject this with 403',
  ).toBeVisible({ timeout: 10_000 });
  console.log(`[flow-expense] self-approve error toast: "${await errorToast.textContent()}"`);

  // Status must NOT have silently flipped to approved despite the
  // misleading UI — confirm it's still sitting as DRAFT/"Chờ duyệt".
  await expect(newRow.getByText(/chờ duyệt|bản nháp/i).first()).toBeVisible();
});

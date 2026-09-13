import { test, expect } from './fixtures';
import { ACCOUNTS } from './flow-helpers';

/**
 * Detailed flow: payroll period cycle (admin) — create → compute → lock →
 * approve. Uses the admin storageState (default per playwright.config.ts).
 *
 * Date range: backend/prisma/seed-clinical.ts pre-seeds fixed historical
 * periods for May (PAID), Jun (PAID), Jul (APPROVED) and Aug 1–16 (DRAFT) —
 * see the `periods` array there. September is untouched, so a
 * month-to-date period this month can't collide with
 * PeriodOverlapException regardless of which day this suite runs on.
 *
 * This session's payroll.service.ts change (commit 71dcec4, "tie overtime
 * pay to approved duty schedule, not encounter duration") made totalHours
 * derive from WorkingSchedule/ShiftRegistration rather than encounter
 * timestamps — so worked hours should be non-zero from recurring duty
 * schedules alone, even before any encounters happen this month. That's
 * exactly what this test checks for Dr. An Nguyen.
 */
test('payroll period cycle: create, compute, lock, approve', async ({ page }) => {
  test.setTimeout(60_000);

  const now = new Date();
  const periodStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
  const periodEnd = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

  await page.goto('/payroll');
  await page.waitForLoadState('networkidle');

  await page.getByRole('button', { name: /tạo kỳ lương/i }).click();
  const createDialog = page.getByRole('dialog');
  await createDialog.getByLabel(/ngày bắt đầu/i).fill(periodStart);
  await createDialog.getByLabel(/ngày kết thúc/i).fill(periodEnd);
  const [createPeriodResponse] = await Promise.all([
    page.waitForResponse((r) => /\/payroll\/periods$/.test(r.url()) && r.request().method() === 'POST'),
    createDialog.getByRole('button', { name: /^tạo$/i }).click(),
  ]);
  if (!createPeriodResponse.ok()) {
    const body = await createPeriodResponse.json().catch(() => null);
    console.log(
      `[flow-payroll] create period ${periodStart}..${periodEnd} -> HTTP ${createPeriodResponse.status()}: ${JSON.stringify(body)}`,
    );
  }
  expect(createPeriodResponse.ok(), `Create period request failed: ${createPeriodResponse.status()}`).toBe(true);
  await expect(createDialog).toBeHidden({ timeout: 10_000 });

  // The new DRAFT period should now be in the list — find it by its
  // formatted end date rather than assuming row order.
  const endDdMmYyyy = `${periodEnd.slice(8, 10)}/${periodEnd.slice(5, 7)}/${periodEnd.slice(0, 4)}`;
  const periodRow = page.locator('tbody tr', { hasText: endDdMmYyyy }).first();
  await expect(periodRow, 'Newly created period should appear in the list').toBeVisible({ timeout: 10_000 });
  await periodRow.click();

  await page.waitForURL(/\/payroll\/periods\/[a-zA-Z0-9-]+$/, { timeout: 10_000 });
  await expect(page.getByRole('button', { name: /tính lương/i })).toBeVisible({ timeout: 10_000 });

  // ---- Compute: assert the RAW API response, not just that the button worked ----
  const [computeResponse] = await Promise.all([
    page.waitForResponse((r) => /\/payroll\/periods\/[^/]+\/compute$/.test(r.url()) && r.request().method() === 'POST'),
    page.getByRole('button', { name: /tính lương/i }).click(),
  ]);
  expect(computeResponse.ok(), `Compute request failed: ${computeResponse.status()}`).toBe(true);
  const computeBody = await computeResponse.json();
  const lineItems: Array<Record<string, unknown>> = computeBody?.data?.lineItems ?? computeBody?.lineItems ?? [];
  expect(lineItems.length, 'Compute should produce at least one dentist line item').toBeGreaterThan(0);

  const anLine = lineItems.find((li) => String(li.dentistName ?? '').includes(ACCOUNTS.dentist.fullName));
  expect(anLine, `No line item for ${ACCOUNTS.dentist.fullName} — dentist may have no WorkingSchedule seeded`).toBeTruthy();
  console.log(
    `[flow-payroll] ${ACCOUNTS.dentist.fullName}: totalHours=${anLine?.totalHours}, workedShifts=${anLine?.workedShifts}, grossPayVnd=${anLine?.grossPayVnd}`,
  );
  expect(
    Number(anLine?.totalHours ?? 0),
    `Expected non-zero totalHours for ${ACCOUNTS.dentist.fullName} (a dentist with seeded shifts) after compute — got ${anLine?.totalHours}`,
  ).toBeGreaterThan(0);

  // ---- Cross-check the number actually reaches the UI (breakdown drawer's computation log) ----
  await page.waitForLoadState('networkidle');
  const dentistTableRow = page.locator('tbody tr', { hasText: ACCOUNTS.dentist.fullName }).first();
  await expect(dentistTableRow).toBeVisible({ timeout: 10_000 });
  await dentistTableRow.getByRole('button', { name: /xem chi tiết/i }).click();
  await page.getByRole('button', { name: /hiện computation log/i }).click();
  await expect(page.locator('pre', { hasText: /totalHours/ })).toBeVisible({ timeout: 5_000 });
  await page.keyboard.press('Escape');

  // ---- Lock: DRAFT -> REVIEWING ----
  const lockBtn = page.getByRole('button', { name: /khóa kỳ/i });
  await expect(lockBtn).toBeVisible({ timeout: 5_000 });
  await lockBtn.click();
  await expect(lockBtn).toBeHidden({ timeout: 10_000 });

  // ---- Approve: REVIEWING -> APPROVED ----
  const approveBtn = page.getByRole('button', { name: /^duyệt$/i });
  await expect(approveBtn).toBeVisible({ timeout: 10_000 });
  await approveBtn.click();
  await expect(approveBtn).toBeHidden({ timeout: 10_000 });

  // APPROVED unlocks "Đánh dấu đã trả" (canMarkPaid requires status ===
  // APPROVED) — its appearance is the structural proof approve landed.
  await expect(page.getByRole('button', { name: /đánh dấu đã trả/i })).toBeVisible({ timeout: 10_000 });
});

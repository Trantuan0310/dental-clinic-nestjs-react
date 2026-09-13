import { test, expect, getSharedContext } from './fixtures';
import { ACCOUNTS } from './flow-helpers';

/**
 * 5th flow (tester's judgment, per the brief): shift registration →
 * approval. Chosen because it's a distinct 2-role, permission-sensitive
 * cycle (backend/prisma/seed.ts: dentist holds shift.register, only
 * clinic_admin holds shift.approve — the earlier role/permission audit
 * commit dbb1154 deliberately stripped shift.approve from receptionist)
 * feeding directly into payroll's workedShifts/totalHours, which the
 * flow-payroll-period-cycle.spec.ts flow depends on.
 *
 * Uses the pre-baked dentist.json / admin.json storageStates — no fresh
 * login needed. Both go through fixtures.ts's getSharedContext() rather
 * than a raw browser.newContext({storageState}) call: that static
 * snapshot's refresh cookie is single-use (rotation-on-every-refresh), so
 * a fresh, uncached context reading the same file a second time — from
 * this file's own re-runs, or from any other spec that also touches
 * dentist.json/admin.json — trips the backend's reuse detector and gets
 * logged out immediately on load. getSharedContext() caches one evolving
 * context per storageState per worker so every consumer shares the same
 * valid, continuously-rotating session instead of each reading a frozen
 * one-shot snapshot. Neither context is closed in the finally block below
 * for the same reason — closing a shared context would break it for
 * whichever other test in this worker reuses it next.
 */
test.describe.configure({ mode: 'serial' });

test('shift registration cycle: dentist registers, admin approves', async ({ browser }) => {
  test.setTimeout(60_000);

  const dentistCtx = await getSharedContext(browser, 'e2e/.auth/dentist.json');
  const adminCtx = await getSharedContext(browser, 'e2e/.auth/admin.json');
  const dentistPage = await dentistCtx.newPage();
  const adminPage = await adminCtx.newPage();

  try {
    // Every dentist has a recurring Mon–Fri 08:00–17:00 WorkingSchedule
    // (backend/prisma/seed-clinical.ts seedWorkingSchedules) and
    // shift-registration.service.ts rejects a new registration that
    // overlaps it (ScheduleOverlapException) — registering "08:00–17:00"
    // (this modal's own defaults) on an ordinary future weekday would
    // always conflict with that standing schedule. Seeded ad-hoc
    // ShiftRegistration rows also explicitly skip weekends. A Saturday,
    // comfortably far out, avoids both.
    // Randomize how far out (2-8 weeks): a fixed "next Saturday 14 days
    // out" is deterministic per calendar day, so re-running this test on
    // the same day (as happened while debugging it) collides with a
    // registration a previous run already created for that dentist+date
    // and 409s — confirmed live: "Error: Create shift request failed: 409"
    // on a same-day rerun.
    const target = new Date();
    target.setDate(target.getDate() + 14 + Math.floor(Math.random() * 42));
    while (target.getDay() !== 6) target.setDate(target.getDate() + 1);
    const iso = `${target.getFullYear()}-${String(target.getMonth() + 1).padStart(2, '0')}-${String(target.getDate()).padStart(2, '0')}`;
    const ddMmYyyy = `${String(target.getDate()).padStart(2, '0')}/${String(target.getMonth() + 1).padStart(2, '0')}/${target.getFullYear()}`;

    // ---- Dentist registers a shift ----
    await dentistPage.goto('/my-shifts');
    await dentistPage.waitForLoadState('networkidle');
    // The header action and the (initially-empty) "upcoming" tab's own
    // empty-state CTA share the exact label "Đăng ký ca mới" — the same
    // dual-CTA pattern already called out in patient-create.spec.ts —
    // so .first() (the header button) avoids a strict-mode violation.
    await dentistPage.getByRole('button', { name: /đăng ký ca mới/i }).first().click();
    const registerDialog = dentistPage.getByRole('dialog');
    await registerDialog.getByLabel(/ngày/i).fill(iso);
    const [createResponse] = await Promise.all([
      dentistPage.waitForResponse(
        (r) => /\/shifts\/registrations$/.test(r.url()) && r.request().method() === 'POST',
      ),
      registerDialog.getByRole('button', { name: /^đăng ký$/i }).click(),
    ]);
    expect(createResponse.ok(), `Create shift request failed: ${createResponse.status()}`).toBe(true);
    await expect(registerDialog).toBeHidden({ timeout: 10_000 });

    // Reload rather than trust networkidle alone — the list query is
    // invalidated in the mutation's onSuccess, but the resulting refetch is
    // a separate tick that a "networkidle" check can land just ahead of,
    // which would otherwise still show the pre-mutation (empty) list.
    await dentistPage.reload();
    await dentistPage.waitForLoadState('networkidle');
    const myRow = dentistPage.locator('tr', { hasText: ddMmYyyy }).first();
    await expect(myRow, 'Newly registered shift should appear in "Sắp tới"').toBeVisible({ timeout: 10_000 });
    await expect(myRow.getByText(/chờ duyệt/i)).toBeVisible();

    // ---- Admin approves it from the approval inbox ----
    await adminPage.goto('/shifts/pending');
    await adminPage.waitForLoadState('networkidle');
    // Scope to direct children of the `divide-y` list container
    // (ShiftApprovalInbox.tsx) rather than a bare `div` match — a bare
    // hasText match on "div" also matches ancestor wrappers up to the page
    // shell, whose nearest common div is NOT the one holding the Duyệt
    // button (that lives in a sibling of the text-bearing inner div, not
    // an ancestor of it).
    const pendingCard = adminPage
      .locator('.divide-y > div')
      .filter({ hasText: ACCOUNTS.dentist.fullName })
      .filter({ hasText: ddMmYyyy })
      .first();
    await expect(pendingCard, `Pending inbox should show ${ACCOUNTS.dentist.fullName}'s ${ddMmYyyy} request`).toBeVisible({
      timeout: 10_000,
    });
    await pendingCard.getByRole('button', { name: /^duyệt$/i }).click();
    await expect(pendingCard).toBeHidden({ timeout: 10_000 });

    // ---- Confirm the dentist now sees it as approved ----
    await dentistPage.reload();
    await dentistPage.waitForLoadState('networkidle');
    const updatedRow = dentistPage.locator('tr', { hasText: ddMmYyyy }).first();
    await expect(updatedRow.getByText(/đã duyệt/i)).toBeVisible({ timeout: 10_000 });
  } finally {
    // Close only the pages, not the (shared, cached) contexts — see the
    // getSharedContext() comment above.
    await dentistPage.close().catch(() => {});
    await adminPage.close().catch(() => {});
  }
});

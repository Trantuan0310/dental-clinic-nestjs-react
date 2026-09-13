import { test, expect, getSharedContext } from './fixtures';
import { loginAs, ACCOUNTS, randomVnPhone } from './flow-helpers';

/**
 * Detailed flow: inventory stock-out via encounter close.
 *
 * Backend design (backend/src/medical-records/medical-records.service.ts
 * closeEncounter()): closing an encounter decrements stock ONLY for
 * inventory items attached to a treatment via `inventoryUsages`, recording
 * a StockMovement(type STOCK_OUT, refType ENCOUNTER) per usage. This test
 * drives that path end-to-end through the real UI (not the API directly).
 *
 * This test originally documented that the "Thêm điều trị" modal had no
 * way to attach an inventory item at all, making this backend path
 * unreachable from a real session (asserted hasInventoryControl === false,
 * stock unchanged). That gap is now fixed — TreatmentsTab.tsx has a
 * "Vật tư sử dụng" picker — so this now exercises the picker for real and
 * asserts the opposite: stock decrements and a movement row appears.
 */
test.describe.configure({ mode: 'serial' });

test('inventory stock decrements when an encounter using it is closed', async ({ browser }) => {
  test.setTimeout(120_000);

  // admin/dentist contexts are shared+cached (see getSharedContext() in
  // fixtures.ts) — the static e2e/.auth/*.json snapshot's refresh cookie is
  // single-use, and this suite has several files touching the same two
  // role snapshots. `reception` stays a throwaway context: it does its own
  // fresh loginAs() and is never reused by anyone else. Its storageState is
  // an explicit empty object, not a bare browser.newContext() — the
  // `browser` fixture inherits use.storageState (admin.json) as a default
  // for ANY context it creates, fixture or manual, so an unqualified
  // newContext() here would come back pre-authenticated as admin and
  // loginAs() would hang forever on a login form that never appears (see
  // freshContext() in appointment-booking-roles.spec.ts, where this was
  // actually diagnosed).
  const admin = await getSharedContext(browser, 'e2e/.auth/admin.json');
  const reception = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  const dentistCtx = await getSharedContext(browser, 'e2e/.auth/dentist.json');

  const adminPage = await admin.newPage();
  const receptionPage = await reception.newPage();
  const dentistPage = await dentistCtx.newPage();

  try {
    // ---- Baseline: read the first active inventory item's stock level ----
    await adminPage.goto('/inventory');
    await adminPage.waitForLoadState('networkidle');
    const firstRow = adminPage.locator('tbody tr').first();
    await expect(firstRow, 'Inventory list should have at least one seeded item').toBeVisible({ timeout: 15_000 });
    const itemName = (await firstRow.locator('td').nth(1).textContent())?.trim() ?? '';
    await firstRow.click();
    await adminPage.waitForLoadState('networkidle');

    // `text-4xl` is a one-off class on this page — only the big stock-count
    // <p> in the "Tồn kho" sidebar card uses it (InventoryItemDetailPage.tsx)
    // — and the movement list's `space-y-2` wrapper is likewise unique to
    // the "Lịch sử xuất nhập" card body, so both can be targeted directly
    // without fragile ancestor-climbing from the card's heading text.
    const stockNumber = adminPage.locator('p.text-4xl');
    await expect(stockNumber).toBeVisible({ timeout: 10_000 });
    const beforeQty = Number((await stockNumber.textContent())?.trim());
    const movementRowsBefore = await adminPage.locator('.space-y-2 > div').count();
    expect(Number.isFinite(beforeQty), `Could not parse a numeric stock level for "${itemName}"`).toBe(true);

    // ---- Create a minimal checked-in patient + appointment (receptionist) ----
    await loginAs(receptionPage, ACCOUNTS.receptionist.email, ACCOUNTS.receptionist.password);
    const testName = `E2E Inventory Patient ${Date.now()}`;
    const testPhone = randomVnPhone();

    await receptionPage.goto('/patients/new');
    await receptionPage.getByLabel(/họ và tên/i).fill(testName);
    await receptionPage.getByLabel(/ngày sinh/i).fill('1990-03-15');
    await receptionPage.getByLabel(/sđt chính/i).fill(testPhone);
    await receptionPage.getByRole('button', { name: /^lưu$/i }).click();

    // Surface a validation/server error immediately with its exact text
    // instead of only a bare "waitForURL timed out" 15s later.
    const patientFormError = await receptionPage
      .locator('[role="alert"]')
      .first()
      .textContent({ timeout: 2_000 })
      .catch(() => null);
    if (patientFormError) console.log(`[flow-inventory] patient form shows an alert right after submit: "${patientFormError}"`);

    // Must exclude /patients/new itself — see the note in
    // flow-patient-to-payment.spec.ts (a loose regex here previously
    // masked a real client-side validation failure).
    await receptionPage.waitForURL(/\/patients\/[0-9a-f-]{20,}$/i, { timeout: 15_000 });

    await receptionPage.goto('/appointments/list');
    await receptionPage.waitForLoadState('networkidle');
    await receptionPage.getByRole('button', { name: /tạo lịch hẹn/i }).click();
    const dialog = receptionPage.getByRole('dialog');
    await dialog.getByRole('tab', { name: /tra cứu nhanh/i }).click();
    await dialog.getByLabel(/tìm bệnh nhân/i).fill(testPhone);
    await dialog.getByText(testName).click();

    const dentistSelect = dialog.locator('select').nth(1);
    const dentistValue = await dentistSelect.locator('option').evaluateAll((opts, name) => {
      const match = opts.find((o) => (o.textContent ?? '').includes(name));
      return match ? (match as HTMLOptionElement).value : null;
    }, ACCOUNTS.dentist.fullName);
    await dentistSelect.selectOption(dentistValue!);

    // Time must be close to "now" — check-in right after only succeeds
    // inside the backend's -15min/+30min check-in window (see the same
    // note in flow-patient-to-payment.spec.ts), and it must stay on today
    // for /my-queue to list it at all.
    const nowMinutes = new Date().getHours() * 60 + new Date().getMinutes();
    const offsetsFromNow = [3, 8, -6, 13, -11];
    const timeInput = dialog.locator('input[type="time"]');
    const createBtn = dialog.getByRole('button', { name: /^tạo lịch hẹn$/i });
    let created = false;
    for (let attempt = 0; attempt < offsetsFromNow.length && !created; attempt++) {
      const minutesFromMidnight = (nowMinutes + offsetsFromNow[attempt] + 1440) % 1440;
      const hh = String(Math.floor(minutesFromMidnight / 60)).padStart(2, '0');
      const mm = String(minutesFromMidnight % 60).padStart(2, '0');
      await timeInput.fill(`${hh}:${mm}`);
      await createBtn.click();
      const result = await Promise.race([
        dialog.waitFor({ state: 'hidden', timeout: 8_000 }).then(() => 'closed' as const),
        dialog.getByRole('alert').waitFor({ state: 'visible', timeout: 8_000 }).then(() => 'error' as const),
      ]).catch(() => 'timeout' as const);
      created = result === 'closed';
    }
    expect(created, 'Could not create the setup appointment after retrying several times-of-day').toBe(true);

    await receptionPage.waitForLoadState('networkidle');
    const apptRow = receptionPage.locator('tbody tr', { hasText: testName }).first();
    await apptRow.click();
    await receptionPage.getByRole('button', { name: /^check-in$/i }).click();

    // ---- Dentist starts encounter, adds ONE treatment, closes it ----
    // Scoped the same way as flow-patient-to-payment.spec.ts: our
    // just-checked-in patient sorts last in the queue if anyone else is
    // already waiting, so a page-wide "first button" click would be wrong.
    await dentistPage.goto('/my-queue');
    await dentistPage.waitForLoadState('networkidle');
    const queueCard = dentistPage.locator('.space-y-3 > div').filter({ hasText: testName });
    await expect(queueCard).toBeVisible({ timeout: 15_000 });
    await queueCard.getByRole('button', { name: /bắt đầu khám/i }).click();
    await dentistPage.waitForURL(/\/encounters\/[a-zA-Z0-9-]+$/, { timeout: 15_000 });

    await dentistPage.getByRole('tab', { name: /điều trị/i }).click();
    await dentistPage.getByRole('button', { name: /thêm điều trị/i }).click();

    await dentistPage.getByLabel(/số răng/i).fill('24');
    await dentistPage.getByLabel(/tên thủ thuật/i).fill('E2E stock-out probe treatment');
    await dentistPage.getByLabel(/đơn giá/i).fill('200000');

    // ---- Attach 1 unit of the same item checked above via the "Vật tư sử
    // dụng" picker (TreatmentsTab.tsx), then add it to the treatment's usage
    // list BEFORE submitting the treatment itself. ----
    const materialSelect = dentistPage.getByLabel(/vật tư sử dụng/i);
    await expect(materialSelect).toBeVisible({ timeout: 5_000 });
    const materialOptionValue = await materialSelect.locator('option').evaluateAll((opts, name) => {
      const match = opts.find((o) => (o.textContent ?? '').includes(name));
      return match ? (match as HTMLOptionElement).value : null;
    }, itemName);
    expect(materialOptionValue, `Inventory item "${itemName}" not found in the materials picker`).toBeTruthy();
    await materialSelect.selectOption(materialOptionValue!);
    await dentistPage.getByLabel(/số lượng vật tư sử dụng/i).fill('1');
    await dentistPage.getByRole('button', { name: /thêm vật tư vào danh sách/i }).click();
    // itemName comes from whatever the inventory list's first row happens
    // to be, so escape it before building a RegExp — several seeded names
    // contain literal parens/% that would otherwise be read as regex syntax.
    const escapedItemName = itemName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    await expect(dentistPage.getByText(new RegExp(`${escapedItemName}.*—.*1`))).toBeVisible({ timeout: 5_000 });

    await dentistPage.getByRole('button', { name: /^thêm$/i }).click();
    await expect(dentistPage.getByText('E2E stock-out probe treatment')).toBeVisible({ timeout: 10_000 });

    await dentistPage.getByRole('button', { name: /đóng encounter/i }).click();
    await dentistPage.getByLabel(/tóm tắt cuối cùng/i).fill('E2E inventory probe — 1 unit attached via the materials picker.');
    const checkboxes = dentistPage.locator('input[type="checkbox"]');
    for (let i = 0; i < (await checkboxes.count()); i++) await checkboxes.nth(i).check();
    await dentistPage.getByRole('button', { name: /đóng encounter/i }).click();
    await expect(dentistPage.getByRole('button', { name: /đóng encounter/i })).toBeHidden({ timeout: 15_000 });

    // ---- Re-check the same inventory item ----
    await adminPage.goto('/inventory');
    await adminPage.waitForLoadState('networkidle');
    await adminPage.locator('tbody tr', { hasText: itemName }).first().click();
    await adminPage.waitForLoadState('networkidle');
    await expect(stockNumber).toBeVisible({ timeout: 10_000 });
    const afterQty = Number((await stockNumber.textContent())?.trim());
    const movementRowsAfter = await adminPage.locator('.space-y-2 > div').count();

    console.log(
      `[flow-inventory] item="${itemName}" qty ${beforeQty} -> ${afterQty}, ` +
        `movement rows ${movementRowsBefore} -> ${movementRowsAfter}`,
    );

    // The materials picker now exists (TreatmentsTab.tsx) and this test
    // attached 1 unit of the item above, so closing the encounter should
    // decrement stock by exactly that and record one new StockMovement row
    // (closeEncounter() in medical-records.service.ts).
    expect(afterQty, 'Closing an encounter with an attached inventory usage should decrement stock').toBe(beforeQty - 1);
    expect(movementRowsAfter, 'Closing should record exactly one new stock movement').toBe(movementRowsBefore + 1);
  } finally {
    // Swallow close() errors individually — see the same note in
    // flow-patient-to-payment.spec.ts (a timed-out test's own teardown can
    // otherwise race this and report a misleading "already closed" error
    // in place of whatever actually failed).
    //
    // admin/dentistCtx are shared+cached (getSharedContext()) — close only
    // their pages, never the context, or the next reuser in this worker
    // fails against an already-closed one. reception is this test's own.
    await adminPage.close().catch(() => {});
    await reception.close().catch(() => {});
    await dentistPage.close().catch(() => {});
  }
});

import { test, expect, getSharedContext, saveDemoVideo, persistAuthState } from './fixtures';
import { loginAs, ACCOUNTS, randomVnPhone, clinicNowMinutes } from './flow-helpers';

/**
 * Detailed end-to-end journey ("test luồng chi tiết") requested by the
 * product owner: patient creation all the way through to a paid invoice,
 * crossing THREE roles the way a real clinic day would.
 *
 * receptionist (fresh login — no pre-baked storageState for this role) →
 * dentist (reuses e2e/.auth/dentist.json) → admin (reuses
 * e2e/.auth/admin.json) all inside ONE test via separate browser contexts,
 * so the whole journey is a single narrative and shares no mutable
 * module-level state across `test()` blocks.
 *
 * Kept to ONE fresh login (receptionist) to stay well under the
 * 5-req/60s /auth/login throttle.
 *
 * The dentist/admin contexts come from fixtures.ts's getSharedContext(),
 * not a raw browser.newContext({storageState}) — that static snapshot's
 * refresh cookie is single-use, so a second independent read of the same
 * file (this test's own re-run, or flow-shift-registration.spec.ts, which
 * touches the same two files) would trip the backend's reuse detector.
 * getSharedContext() caches one evolving context per storageState per
 * worker instead.
 */
test.describe.configure({ mode: 'serial' });

test('full patient-to-payment journey: receptionist books, dentist treats, admin collects payment', async ({ browser }) => {
  test.setTimeout(120_000);

  // Explicit empty storageState, NOT a bare browser.newContext() — the
  // `browser` fixture inherits use.storageState (admin.json) from
  // playwright.config.ts as a default for ANY context it creates, fixture
  // or manual. A "fresh" context without this override comes back
  // pre-authenticated as admin, so loginAs() below would goto('/login'),
  // get silently bounced back to the dashboard, and hang forever on a
  // login form that's never going to appear. See the comment on
  // freshContext() in appointment-booking-roles.spec.ts, where this was
  // actually diagnosed.
  const reception = await browser.newContext({
    storageState: { cookies: [], origins: [] }, timezoneId: 'Asia/Ho_Chi_Minh',
    ...(process.env.E2E_RECORD_VIDEO ? { recordVideo: {
      dir: process.env.E2E_VIDEO_DIR!, size: { width: 1280, height: 720 },
    } } : {}),
  });
  const dentistCtx = await getSharedContext(browser, 'e2e/.auth/dentist.json');
  const adminCtx = await getSharedContext(browser, 'e2e/.auth/admin.json');

  const receptionPage = await reception.newPage();
  const dentistPage = await dentistCtx.newPage();
  const adminPage = await adminCtx.newPage();

  const testName = `E2E Flow Patient ${Date.now()}`;
  const testPhone = randomVnPhone();
  const t0 = Date.now();
  // Explicit checkpoints so that if the overall test.setTimeout fires, the
  // console output (captured live, unlike screenshots — which can come back
  // blank if the timeout races the runner's own teardown) still tells us
  // exactly how far the journey got.
  const checkpoint = (label: string) => console.log(`[flow-patient-to-payment] +${((Date.now() - t0) / 1000).toFixed(1)}s ${label}`);

  try {
    // ---- Step 1: receptionist creates the patient (standalone /patients/new) ----
    await loginAs(receptionPage, ACCOUNTS.receptionist.email, ACCOUNTS.receptionist.password);

    await receptionPage.goto('/patients/new');
    await receptionPage.getByLabel(/họ và tên/i).fill(testName);
    await receptionPage.getByLabel(/ngày sinh/i).fill('1992-05-20');
    await receptionPage.getByLabel(/sđt chính/i).fill(testPhone);
    await receptionPage.getByRole('button', { name: /^lưu$/i }).click();

    // Surface a validation/server error immediately (with its exact text)
    // instead of only a bare "waitForURL timed out" a full 15s later — a
    // prior run hit exactly this (invalid-phone client validation) and the
    // generic timeout alone didn't say why.
    const patientFormError = await receptionPage
      .locator('[role="alert"]')
      .first()
      .textContent({ timeout: 2_000 })
      .catch(() => null);
    if (patientFormError) checkpoint(`patient form shows an alert right after submit: "${patientFormError}"`);

    // PatientForm navigates to /patients/:id (a UUID) on success. Matching
    // loosely on /patients/<anything> is wrong — it also matches the
    // CURRENT /patients/new URL before submission even completes (a bug
    // caught live: an invalid phone silently blocked react-hook-form
    // submission client-side, the page never left /patients/new, and this
    // loose regex still resolved immediately against that same URL,
    // masking the real failure behind a confusing "text not found" error
    // on the next line instead of surfacing the actual validation alert).
    await receptionPage.waitForURL(/\/patients\/[0-9a-f-]{20,}$/i, { timeout: 15_000 });
    await expect(receptionPage.getByText(testName).first()).toBeVisible({ timeout: 10_000 });
    checkpoint('step 1 done: patient created');

    // ---- Step 2: receptionist books an appointment for this patient with Dr. An Nguyen ----
    await receptionPage.goto('/appointments/list');
    await receptionPage.waitForLoadState('networkidle');
    await receptionPage.getByRole('button', { name: /^tạo lịch hẹn$/i }).first().click();

    const bookingDialog = receptionPage.getByRole('dialog');
    await expect(bookingDialog).toBeVisible();

    // Use "Tra cứu nhanh" (lookup) instead of the big patient <select> — the
    // freshly-created patient is guaranteed findable by its unique phone,
    // whereas the select's option order/pagination is not something this
    // test controls.
    await bookingDialog.getByRole('tab', { name: /tra cứu nhanh/i }).click();
    await bookingDialog.getByLabel(/tìm bệnh nhân/i).fill(testPhone);
    await bookingDialog.getByText(testName).click();

    // Back on the info tab: the "Bác sĩ" <select> has no htmlFor/label
    // wiring (see AppointmentFormModal.tsx — the <label> is a plain
    // sibling, not connected via id), so getByLabel can't find it. Pick the
    // <select> that actually offers Dr. An Nguyen rather than guessing its
    // index among the dialog's selects, then resolve that <option>'s value,
    // so the appointment is deterministically assigned to the dentist
    // account this test logs into next.
    const dentistSelect = bookingDialog
      .locator('select')
      .filter({ has: receptionPage.locator('option', { hasText: ACCOUNTS.dentist.fullName }) });
    await expect(dentistSelect).toBeVisible();
    const dentistValue = await dentistSelect
      .locator('option')
      .evaluateAll((opts, name) => {
        const match = opts.find((o) => (o.textContent ?? '').includes(name));
        return match ? (match as HTMLOptionElement).value : null;
      }, ACCOUNTS.dentist.fullName);
    expect(dentistValue, `Dentist option containing "${ACCOUNTS.dentist.fullName}" not found`).toBeTruthy();
    await dentistSelect.selectOption(dentistValue!);
    await bookingDialog.getByLabel(/thời lượng/i).selectOption('15');

    // The appointment must land on today AND close to right now: step 3
    // checks the patient in immediately after, and the backend only allows
    // check-in from 15 min before to 30 min after the scheduled start
    // (CHECKIN_WINDOW_BEFORE/AFTER_MIN in appointments.service.ts) with no
    // override exposed by this UI button — a "random time today" slot (e.g.
    // picked for a 9am default) would fail check-in outside that window.
    // /my-queue (step 4) also only lists TODAY's checked-in appointments,
    // ruling out dodging seed-data collisions with a future date instead.
    // Backend does enforce a real double-booking check (ScheduleOverlap/
    // SlotConflictException), so retry with small offsets from "now" — all
    // safely inside the check-in window — until one isn't already taken.
    // Clinic wall-clock time, not the runner's — see clinicNowMinutes().
    const nowMinutes = clinicNowMinutes();
    const offsetsFromNow = [3, 8, 13, 15];
    const timeInput = bookingDialog.locator('input[type="time"]');
    const createBtn = bookingDialog.getByRole('button', { name: /^tạo lịch hẹn$/i });
    let created = false;
    for (let attempt = 0; attempt < offsetsFromNow.length && !created; attempt++) {
      const minutesFromMidnight = nowMinutes + offsetsFromNow[attempt];
      if (minutesFromMidnight + 15 > 1440) continue;
      const hh = String(Math.floor(minutesFromMidnight / 60)).padStart(2, '0');
      const mm = String(minutesFromMidnight % 60).padStart(2, '0');
      await timeInput.fill(`${hh}:${mm}`);
      const responsePromise = receptionPage.waitForResponse(response =>
        response.request().method() === 'POST' && new URL(response.url()).pathname.endsWith('/api/v1/appointments'),
      );
      await createBtn.click();
      const response = await responsePromise;
      created = response.ok();
      if (created) await expect(bookingDialog).toBeHidden();
      else {
        expect(response.status(), 'Retry only actual slot conflicts').toBe(409);
        checkpoint(`slot ${hh}:${mm} unavailable: ${JSON.stringify(await response.json())}`);
        await expect(bookingDialog.getByRole('alert')).toBeVisible();
      }
    }
    expect(created, 'Could not create the appointment after retrying several times-of-day (see last server error in the dialog)').toBe(true);
    checkpoint('step 2 done: appointment booked');

    // ---- Step 3: receptionist checks the patient in ----
    await receptionPage.waitForLoadState('networkidle');
    const apptRow = receptionPage.locator('tbody tr', { hasText: testName }).first();
    await expect(apptRow).toBeVisible({ timeout: 10_000 });
    await apptRow.click();

    const checkInBtn = receptionPage.getByRole('button', { name: /^check-in$/i });
    await expect(checkInBtn).toBeVisible({ timeout: 10_000 });
    await checkInBtn.click();
    await expect(checkInBtn).toBeHidden({ timeout: 10_000 });
    checkpoint('step 3 done: checked in');

    // ---- Step 4: dentist starts the encounter from their queue ----
    // MyQueuePage sorts by check-in time ascending, so our just-checked-in
    // patient is likely LAST, not first, if anyone else is already waiting
    // today — scope the click to the specific card (a direct child of the
    // page's one `.space-y-3` list wrapper) instead of a page-wide
    // `.first()`, which would otherwise start the wrong patient's encounter.
    await dentistPage.goto('/my-queue');
    await dentistPage.waitForLoadState('networkidle');
    const queueCard = dentistPage.locator('.space-y-3 > div').filter({ hasText: testName });
    await expect(queueCard).toBeVisible({ timeout: 15_000 });
    await queueCard.getByRole('button', { name: /bắt đầu khám/i }).click();

    await dentistPage.waitForURL(/\/encounters\/[a-zA-Z0-9-]+$/, { timeout: 15_000 });
    checkpoint('step 4 done: encounter started');

    // ---- Step 5: dentist adds a treatment ----
    await dentistPage.getByRole('tab', { name: /điều trị/i }).click();
    await dentistPage.getByRole('button', { name: /thêm điều trị/i }).click();
    await dentistPage.getByLabel(/số răng/i).fill('16');
    await dentistPage.getByLabel(/tên thủ thuật/i).fill('Hàn răng Composite (E2E)');
    await dentistPage.getByLabel(/đơn giá/i).fill('350000');
    await dentistPage.getByRole('button', { name: /^thêm$/i }).click();
    await expect(dentistPage.getByText('Hàn răng Composite (E2E)', { exact: true })).toBeVisible({ timeout: 10_000 });
    checkpoint('step 5 done: treatment added');

    // ---- Step 6: dentist writes a clinical note ----
    await dentistPage.getByRole('tab', { name: /ghi chú/i }).click();
    await dentistPage.getByRole('button', { name: /thêm ghi chú/i }).click();
    const noteText = 'E2E: bệnh nhân hợp tác tốt, không biến chứng sau thủ thuật.';
    await dentistPage.getByLabel(/nội dung/i).fill(noteText);
    // Two "Thêm" buttons can exist momentarily (tab toolbar + modal) —
    // scope to the modal dialog to avoid ambiguity.
    await dentistPage.getByRole('dialog').getByRole('button', { name: /^thêm$/i }).click();
    await expect(dentistPage.getByText(noteText)).toBeVisible({ timeout: 10_000 });
    checkpoint('step 6 done: clinical note added');

    // ---- Step 7: dentist creates and reloads a complete prescription ----
    await dentistPage.getByRole('tab', { name: /đơn thuốc/i }).click();
    await dentistPage.getByRole('button', { name: /^tạo đơn thuốc$/i }).click();
    const prescriptionDialog = dentistPage.getByRole('dialog');
    await prescriptionDialog.getByRole('button', { name: /thêm thuốc/i }).click();
    await prescriptionDialog.getByLabel(/tên thuốc/i).fill('Amoxicillin 500mg (E2E)');
    await prescriptionDialog.getByLabel(/^liều$/i).fill('500mg');
    await prescriptionDialog.getByLabel(/tần suất/i).fill('3 lần/ngày');
    await prescriptionDialog.getByLabel(/số lượng/i).fill('12');
    await prescriptionDialog.getByLabel(/đơn vị/i).fill('viên');
    await prescriptionDialog.getByLabel(/số ngày/i).fill('4');
    await prescriptionDialog.getByRole('button', { name: /^tạo đơn thuốc$/i }).click();
    await expect(prescriptionDialog).toBeHidden({ timeout: 10_000 });

    await dentistPage.reload();
    await dentistPage.waitForLoadState('networkidle');
    await dentistPage.getByRole('tab', { name: /đơn thuốc/i }).click();
    await expect(dentistPage.getByText('Amoxicillin 500mg (E2E)', { exact: true })).toBeVisible();
    await expect(dentistPage.getByText('12 viên', { exact: true })).toBeVisible();
    await expect(dentistPage.getByText('4 ngày', { exact: true })).toBeVisible();
    checkpoint('step 7 done: prescription persisted after reload');

    // ---- Step 8: dentist closes the encounter ----
    await dentistPage.getByRole('button', { name: /đóng encounter/i }).click();
    await dentistPage.getByLabel(/tóm tắt cuối cùng/i).fill('E2E: hoàn tất hàn răng 16, hẹn tái khám nếu cần.');
    const checkboxes = dentistPage.locator('input[type="checkbox"]');
    const cbCount = await checkboxes.count();
    for (let i = 0; i < cbCount; i++) {
      await checkboxes.nth(i).check();
    }
    const closeBtn = dentistPage.getByRole('button', { name: /đóng encounter/i });
    await expect(closeBtn).toBeEnabled();
    await closeBtn.click();

    // Closing is irreversible and removes the "Đóng Encounter" affordance
    // entirely (EncounterDetailPage only renders it while !isCompleted) —
    // its disappearance is the structural proof the close actually landed,
    // independent of any toast copy.
    await expect(dentistPage.getByRole('button', { name: /đóng encounter/i })).toBeHidden({ timeout: 15_000 });
    await dentistPage.getByRole('tab', { name: /đơn thuốc/i }).click();
    await dentistPage.evaluate(() => {
      window.print = () => document.body.setAttribute('data-print-called', 'true');
    });
    await dentistPage.getByRole('button', { name: /in đơn thuốc/i }).click();
    await expect(dentistPage.locator('body')).toHaveAttribute('data-print-called', 'true');
    checkpoint('step 8 done: encounter closed and prescription remains printable');

    // ---- Step 9: confirm an invoice was auto-created (admin, billing list) ----
    await adminPage.goto('/billing/list');
    await adminPage.waitForLoadState('networkidle');
    await adminPage.getByPlaceholder(/tìm theo mã hóa đơn/i).fill(testName);
    await adminPage.waitForLoadState('networkidle');
    const invoiceRow = adminPage.locator('tbody tr', { hasText: testName }).first();
    await expect(invoiceRow, 'Encounter close should auto-create a draft invoice for this patient').toBeVisible({
      timeout: 15_000,
    });
    await invoiceRow.click();
    await adminPage.waitForLoadState('networkidle');
    checkpoint('step 9 done: invoice found and opened');

    // ---- Step 10: issue the invoice, then record full payment ----
    const issueBtn = adminPage.getByRole('button', { name: /phát hành/i });
    await expect(issueBtn).toBeVisible({ timeout: 10_000 });
    await issueBtn.click();
    await expect(issueBtn).toBeHidden({ timeout: 10_000 });

    const payBtn = adminPage.getByRole('button', { name: /thu tiền/i });
    await expect(payBtn).toBeVisible({ timeout: 10_000 });
    await payBtn.click();

    const paymentDialog = adminPage.getByRole('dialog');
    await paymentDialog.getByText(/^thu hết/i).click();
    await paymentDialog.getByRole('button', { name: /xác nhận/i }).click();
    await expect(paymentDialog).toBeHidden({ timeout: 10_000 });
    checkpoint('step 10 done: invoice issued + payment recorded');

    // ---- Step 11: confirm invoice status reflects the payment ----
    await expect(adminPage.getByRole('button', { name: /thu tiền/i })).toBeHidden({ timeout: 10_000 });
    await expect(adminPage.getByText('Đã thanh toán', { exact: true })).toBeVisible({ timeout: 10_000 });
    await adminPage.reload();
    await expect(adminPage.getByText('Đã thanh toán', { exact: true })).toBeVisible();
    await expect(adminPage.getByText('Hàn răng Composite (E2E)', { exact: true })).toBeVisible();
    checkpoint('step 11 done: invoice confirmed paid');
  } finally {
    // Swallow close() errors individually — if the overall test.setTimeout
    // already tore contexts down, a second close() here would otherwise
    // throw "Target page, context or browser has been closed" and that
    // secondary error is what Playwright reports as THE failure, masking
    // whichever real assertion/step actually caused the timeout (the
    // checkpoint() log above is the reliable source of truth for that).
    //
    // reception is this test's own throwaway context (own login, own
    // disposal); dentistCtx/adminCtx are shared+cached (see
    // getSharedContext() above) — close only their pages, never the
    // context itself, or the next test/file reusing that same cached
    // context would fail against an already-closed one.
    for (const [page, role] of [[receptionPage, 'receptionist'], [dentistPage, 'dentist'], [adminPage, 'admin']] as const) {
      await saveDemoVideo(page, `patient-to-payment-${role}`).catch(() => {});
    }
    await reception.close().catch(() => {});
    await persistAuthState();
  }
});

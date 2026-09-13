import type { Page } from '@playwright/test';

/**
 * Shared helpers for the "detailed flow" E2E specs (flow-*.spec.ts).
 *
 * These specs each drive a full multi-step business journey (patient →
 * payment, payroll period cycle, etc.) and frequently need MORE THAN ONE
 * role logged in within a single test (e.g. receptionist books/checks-in,
 * then a dentist treats). Reusing the globally pre-baked storageState
 * (e2e/.auth/admin.json, e2e/.auth/dentist.json — see global-setup.ts) for
 * roles that already have a snapshot avoids burning login-throttle budget;
 * `loginAs` below is only for roles with NO pre-baked snapshot
 * (receptionist), mirroring the pattern already established in
 * appointment-booking-roles.spec.ts.
 */
export async function loginAs(page: Page, email: string, password: string): Promise<void> {
  await page.goto('/login');
  await page.getByLabel(/email/i).fill(email);
  await page.getByLabel(/mật khẩu|password/i).fill(password);
  await page.getByRole('button', { name: /đăng nhập/i }).click();
  await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 15_000 });
}

// Seeded accounts used across the flow specs (see backend/prisma/seed.ts /
// seed-clinical.ts). Password is the shared seed default unless noted.
export const ACCOUNTS = {
  admin: { email: 'admin@clinic.local', password: 'Admin123!' },
  receptionist: { email: 'hanh.le@clinic.local', password: 'Password123!' },
  dentist: {
    email: 'an.nguyen@clinic.local',
    password: 'Password123!',
    // Full name as seeded (backend/prisma/seed-clinical.ts DENTISTS) — used
    // to pick this exact dentist out of the appointment form's <select>,
    // since that control's options aren't otherwise addressable by id from
    // the UI alone.
    fullName: 'Nguyễn Văn An',
  },
};

export function isoDateOnly(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * A syntactically valid VN mobile number for patient-form fixtures.
 *
 * NOTE: the pattern copied from patient-create.spec.ts (`090${8-digit
 * random}`) is actually WRONG — it produces 11 digits, one too many for
 * PatientForm's own VN_PHONE_REGEX (^0(3|5|7|8|9)[0-9]{8}$, 10 digits
 * total). A non-empty value that fails that regex blocks react-hook-form
 * submission client-side, so the form silently never submits. Confirmed
 * live: flow-patient-to-payment.spec.ts's first run hit exactly this,
 * staying on /patients/new with "Số điện thoại không hợp lệ" showing.
 */
export function randomVnPhone(): string {
  const rest = Math.floor(Math.random() * 90_000_000 + 10_000_000); // 8 digits
  return `09${rest}`; // "0" + "9" + 8 digits = 10 total
}

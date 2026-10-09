import { isValidEmail } from '../patients/domain/patient-rules';

/**
 * The clinic's name and hotline for patient emails: the same CLINIC_NAME /
 * CLINIC_PHONE the landing page is built with (docker-compose passes them to
 * the backend too).
 */
export function clinicContactLine(env: NodeJS.ProcessEnv = process.env): string {
  const name = env.CLINIC_NAME?.trim() || 'phòng khám';
  const phone = env.CLINIC_PHONE?.trim();
  return phone
    ? 'Cần hỗ trợ, vui lòng gọi ' + name + ': ' + phone + '.'
    : 'Cần hỗ trợ, vui lòng liên hệ ' + name + '.';
}

/** "Địa chỉ: …" for visit emails (CLINIC_ADDRESS), or '' when not set. */
export function clinicAddressLine(env: NodeJS.ProcessEnv = process.env): string {
  const address = env.CLINIC_ADDRESS?.trim();
  return address ? 'Địa chỉ: ' + address + '.' : '';
}

/**
 * Root of the links in patient emails: PUBLIC_APP_URL, else FRONTEND_URL
 * (same site), else the local dev server. Never another clinic's domain.
 */
export function publicAppUrl(env: NodeJS.ProcessEnv = process.env): string {
  const url = env.PUBLIC_APP_URL?.trim() || env.FRONTEND_URL?.trim() || 'http://localhost:5173';
  return url.replace(/\/+$/, '');
}

/**
 * What a production deploy is missing for patient booking emails to make
 * sense (links to this site, a number to call, a sender), or [] (logged once
 * at startup by BookingCron).
 */
export function bookingEmailConfigProblems(env: NodeJS.ProcessEnv = process.env): string[] {
  if (env.NODE_ENV !== 'production') return [];
  const problems: string[] = [];
  if (!env.PUBLIC_APP_URL?.trim() && !env.FRONTEND_URL?.trim())
    problems.push('PUBLIC_APP_URL (links in booking emails would point to localhost)');
  if (!env.CLINIC_PHONE?.trim())
    problems.push('CLINIC_PHONE (booking emails ask patients to call the clinic)');
  if (!env.EMAIL_FROM?.trim())
    problems.push('EMAIL_FROM (default sender is likely marked as spam)');
  return problems;
}

/**
 * Whether EmailService can deliver at all: SMTP configured, or EMAIL_MOCK
 * outside production (the log is the delivery there). When it cannot, the
 * reminder job claims nothing, so reminders go out once email is fixed.
 */
export function emailDeliverable(env: NodeJS.ProcessEnv = process.env): boolean {
  if (env.EMAIL_MOCK === 'true') return env.NODE_ENV !== 'production';
  return !!(env.SMTP_HOST && env.SMTP_USER && env.SMTP_PASS);
}

/**
 * Emails about booked visits (cancelled, moved, day-ahead reminder) go to
 * every patient with an email, however the visit was booked: a patient
 * booked by phone needs to know of a change as much as one who booked
 * online. APPOINTMENT_EMAIL_NOTICES=false turns them off (online-booking
 * request emails are not affected).
 */
export function appointmentEmailNoticesEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.APPOINTMENT_EMAIL_NOTICES?.trim().toLowerCase() !== 'false';
}

/** Notify-the-clinic recipients (BOOKING_NOTIFY_EMAILS, comma separated). */
export function bookingNotifyRecipients(env: NodeJS.ProcessEnv = process.env): string[] {
  return (env.BOOKING_NOTIFY_EMAILS ?? '')
    .split(/[,;\s]+/)
    .map(v => v.trim())
    .filter(v => v && isValidEmail(v));
}

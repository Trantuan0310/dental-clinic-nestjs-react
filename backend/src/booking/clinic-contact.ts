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

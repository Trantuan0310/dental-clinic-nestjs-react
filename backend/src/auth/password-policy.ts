/**
 * One password rule for every place a password is chosen (reset link,
 * account setup, change password) and checked (login). The frontend mirrors
 * it in src/lib/passwordPolicy.ts.
 */
export const PASSWORD_MIN_LENGTH = 8;
/** Upper bound so a huge input cannot make argon2 hashing expensive. */
export const PASSWORD_MAX_LENGTH = 128;

export const PASSWORD_LENGTH_MESSAGE = `Mật khẩu phải có từ ${PASSWORD_MIN_LENGTH} đến ${PASSWORD_MAX_LENGTH} ký tự`;

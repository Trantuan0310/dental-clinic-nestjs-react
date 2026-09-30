import type { AxiosError } from 'axios';

// A message that is plainly English (framework defaults such as "phone must
// be longer than…" or "Too Many Requests") is not shown to patients.
const ENGLISH = /\b(must|should|not allowed|forbidden|unauthorized|too many requests|internal server error)\b/i;
const readable = (text: string) => !ENGLISH.test(text);

/** The server's message when it sent one, else the page's own Vietnamese fallback. */
export function bookingErrorMessage(error: unknown, fallback: string): string {
  const response = (error as AxiosError<{ message?: unknown }>)?.response;
  if (response?.status === 429)
    return 'Bạn thao tác quá nhanh. Vui lòng đợi một phút rồi thử lại.';
  const message = response?.data?.message;
  if (typeof message === 'string' && message && readable(message)) return message;
  if (Array.isArray(message)) {
    const shown = message.filter((m): m is string => typeof m === 'string' && readable(m));
    if (shown.length) return shown.join(', ');
  }
  return fallback;
}

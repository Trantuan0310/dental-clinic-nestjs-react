import type { AxiosError } from 'axios';

/** The server's message when it sent one, else the page's own Vietnamese fallback. */
export function bookingErrorMessage(error: unknown, fallback: string): string {
  const message = (error as AxiosError<{ message?: unknown }>)?.response?.data?.message;
  if (typeof message === 'string' && message) return message;
  if (Array.isArray(message) && message.length) return message.join(', ');
  return fallback;
}

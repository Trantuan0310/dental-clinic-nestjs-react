import type { AxiosError } from 'axios';

export interface ApiErrorBody {
  statusCode: number;
  /** Machine-readable code set by the backend exception filter (e.g. SLOT_CONFLICT). */
  code?: string;
  details?: unknown;
  error: string;
  title?: string;
  message: string | string[];
  detail?: string;
  type?: string;
  instance?: string;
}

export function getApiErrorMessage(error: unknown, fallback = 'Có lỗi xảy ra'): string {
  const axiosError = error as AxiosError<ApiErrorBody>;
  const data = axiosError?.response?.data;
  if (!data) return axiosError?.message ?? fallback;
  if (Array.isArray(data.message)) return data.message.join('; ');
  if (typeof data.message === 'string') return data.message;
  return data.title ?? data.error ?? fallback;
}

export function getApiErrorTitle(error: unknown): string | undefined {
  const data = (error as AxiosError<ApiErrorBody>)?.response?.data;
  return data?.title ?? data?.error;
}

/** The backend's machine-readable error code, for branching on a specific failure. */
export function getApiErrorCode(error: unknown): string | undefined {
  return (error as AxiosError<ApiErrorBody>)?.response?.data?.code;
}

/** The structured `details` payload that accompanies some business-rule errors. */
export function getApiErrorDetails<T = unknown>(error: unknown): T | undefined {
  return (error as AxiosError<ApiErrorBody>)?.response?.data?.details as T | undefined;
}

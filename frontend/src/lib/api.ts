import type { AxiosError, AxiosRequestConfig, InternalAxiosRequestConfig } from 'axios';
import axios from 'axios';

const API_BASE_URL =
  (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? '/api/v1';

export interface AuthEnvelope<T> {
  data: T;
  requestId?: string;
  serverTime?: string;
}

export const unwrap = <T>(env: AuthEnvelope<T>): T => env.data;

export const api = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true,
  headers: { 'Content-Type': 'application/json' },
});

type AccessTokenHolder = { token: string | null; set: (t: string | null) => void; clear: () => void };

export const tokenStore: AccessTokenHolder = (() => {
  let token: string | null = null;
  return {
    get token() {
      return token;
    },
    set(t: string | null) {
      token = t;
    },
    clear() {
      token = null;
    },
  };
})();

api.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const t = tokenStore.token;
  if (t) {
    config.headers.set('Authorization', `Bearer ${t}`);
  }
  return config;
});

type Retryable = AxiosRequestConfig & { _retry?: boolean; _retries?: number };

let isRefreshing = false;
let waitQueue: Array<(token: string | null) => void> = [];

function flushQueue(token: string | null) {
  waitQueue.forEach((cb) => cb(token));
  waitQueue = [];
}

// Status codes that are safe to retry with backoff.
function isRetryableError(status?: number): boolean {
  if (status === undefined) return true; // network error
  return status >= 500 || status === 408 || status === 429;
}

const RETRY_DELAYS_MS = [300, 800, 2000];
const MAX_RETRIES = 3;

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

api.interceptors.response.use(
  (resp) => resp,
  async (error: AxiosError) => {
    const original = error.config as Retryable | undefined;
    const status = error.response?.status;

    // ---------------------------------------------------------------------
    // 1) Token refresh flow for 401 (non-auth endpoints).
    // ---------------------------------------------------------------------
    if (
      status === 401 &&
      original &&
      !original._retry &&
      original.url &&
      !original.url.includes('/auth/')
    ) {
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          waitQueue.push((token) => {
            if (token) {
              original._retry = true;
              original.headers = original.headers ?? {};
              (original.headers as Record<string, string>)['Authorization'] = `Bearer ${token}`;
              resolve(api(original));
            } else {
              reject(error);
            }
          });
        });
      }

      original._retry = true;
      isRefreshing = true;
      try {
        const resp = await axios.post<{ data: { accessToken: string } }>(
          `${API_BASE_URL}/auth/refresh`,
          {},
          { withCredentials: true },
        );
        const newToken = resp.data.data.accessToken;
        tokenStore.set(newToken);
        flushQueue(newToken);
        original.headers = original.headers ?? {};
        (original.headers as Record<string, string>)['Authorization'] = `Bearer ${newToken}`;
        return api(original);
      } catch (refreshError) {
        flushQueue(null);
        tokenStore.clear();
        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }

    // ---------------------------------------------------------------------
    // 2) Retry-with-backoff for transient 5xx / network errors.
    // Skipped for POST/PUT/PATCH/DELETE to avoid double-submit; only safe
    // idempotent verbs (GET/HEAD/OPTIONS) get automatic retry.
    // ---------------------------------------------------------------------
    if (original && isRetryableError(status)) {
      const method = (original.method ?? 'get').toLowerCase();
      const isIdempotent = method === 'get' || method === 'head' || method === 'options';
      if (!isIdempotent) return Promise.reject(error);

      const attempt = original._retries ?? 0;
      if (attempt >= MAX_RETRIES) return Promise.reject(error);

      const delay = RETRY_DELAYS_MS[attempt] ?? RETRY_DELAYS_MS[RETRY_DELAYS_MS.length - 1];
      original._retries = attempt + 1;
      await sleep(delay);
      return api(original);
    }

    // ---------------------------------------------------------------------
    // 3) Surface the server-provided requestId (if any) on the error so
    //    client logs can be correlated with backend traces.
    // ---------------------------------------------------------------------
    const requestId = (error.response?.data as { requestId?: string } | undefined)?.requestId;
    if (requestId) {
      (error as AxiosError & { requestId?: string }).requestId = requestId;
      console.warn(`[api] requestId=${requestId} status=${status} url=${original?.url}`);
    }

    return Promise.reject(error);
  },
);
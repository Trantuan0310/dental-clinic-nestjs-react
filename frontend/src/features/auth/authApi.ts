import { useAuthStore } from '@/stores/authStore';
import { api, tokenStore, unwrap } from '@/lib/api';
import type { AuthEnvelope, LoginResponse, UserInfo } from '@/types/auth';

const setSession = (payload: LoginResponse) => {
  useAuthStore.getState().setSession(payload.user, payload.accessToken);
};

const clearSession = () => {
  useAuthStore.getState().clear();
  tokenStore.clear();
};

// Refresh tokens rotate on every use (old one revoked, new one issued), so
// two callers racing to refresh at once — e.g. StrictMode's double effect
// invocation on SessionBoot's mount — send the same stale cookie twice: the
// first call rotates it, the second trips reuse detection and fails. Single-
// flighting refresh() so concurrent callers share one in-flight request.
let refreshInFlight: Promise<LoginResponse | null> | null = null;

export const authApi = {
  async login(email: string, password: string): Promise<LoginResponse> {
    const payload = unwrap(
      (await api.post<AuthEnvelope<LoginResponse>>('/auth/login', { email, password })).data,
    );
    setSession(payload);
    return payload;
  },
  async logout(): Promise<void> {
    try {
      await api.post('/auth/logout');
    } finally {
      clearSession();
    }
  },
  async refresh(): Promise<LoginResponse | null> {
    if (refreshInFlight) return refreshInFlight;
    refreshInFlight = (async () => {
      try {
        const payload = unwrap(
          (await api.post<AuthEnvelope<LoginResponse>>('/auth/refresh')).data,
        );
        setSession(payload);
        return payload;
      } catch {
        clearSession();
        return null;
      } finally {
        refreshInFlight = null;
      }
    })();
    return refreshInFlight;
  },
  async me(): Promise<UserInfo> {
    return unwrap((await api.get<AuthEnvelope<UserInfo>>('/auth/me')).data);
  },
};

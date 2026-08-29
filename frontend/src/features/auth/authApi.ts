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
    try {
      const payload = unwrap(
        (await api.post<AuthEnvelope<LoginResponse>>('/auth/refresh')).data,
      );
      setSession(payload);
      return payload;
    } catch {
      clearSession();
      return null;
    }
  },
  async me(): Promise<UserInfo> {
    return unwrap((await api.get<AuthEnvelope<UserInfo>>('/auth/me')).data);
  },
};

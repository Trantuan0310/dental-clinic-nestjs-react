export type UserStatus = 'active' | 'pending_setup' | 'deactivated';
export type RoleCode = 'clinic_admin' | 'receptionist' | 'dentist';

export interface UserInfo {
  id: string;
  email: string;
  fullName: string;
  status: UserStatus;
  roles: RoleCode[];
  permissions: string[];
}

export interface LoginResponse {
  accessToken: string;
  accessTokenExpiresIn: number;
  user: UserInfo;
}

export interface AuthEnvelope<T> {
  data: T;
}

export interface ApiError {
  statusCode: number;
  error: string;
  title?: string;
  message: string | string[];
  detail?: string;
  type?: string;
  instance?: string;
}
export interface UserResponse {
  id: string;
  email: string;
  fullName: string;
  status: string;
  roles: string[];
  permissions: string[];
}

export interface LoginResponse {
  accessToken: string;
  accessTokenExpiresIn: number;
  user: UserResponse;
}

export interface MeResponse {
  id: string;
  email: string;
  fullName: string;
  status: string;
  roles: string[];
  permissions: string[];
}

export interface LoginHistoryItem {
  occurredAt: Date;
  action: string;
  ipAddress: string | null;
  userAgent: string | null;
}

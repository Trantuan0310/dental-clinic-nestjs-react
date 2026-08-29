export interface UserResponse {
  id: string;
  email: string;
  fullName: string;
  status: string;
  roles: string[];
  permissions: string[];
  failedLoginAttempts?: number;
  lockedUntil?: Date | null;
  lastLoginAt?: Date | null;
  deactivatedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface UserListItem {
  id: string;
  email: string;
  fullName: string;
  status: string;
  roles: string[];
  lastLoginAt: Date | null;
  createdAt: Date;
  deactivatedAt: Date | null;
}

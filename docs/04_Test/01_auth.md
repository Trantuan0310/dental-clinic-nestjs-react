# Test Cases — Auth Module

> **Module:** Auth (login, refresh, logout, password, login history)
> **Priority:** P0 — entry point, security-critical.
> **Test file:** `backend/src/auth/auth.service.spec.ts`

---

## 1. Purpose

Verify authentication flows: login with credentials, refresh token rotation, logout single/all devices, change/forgot/reset password, login history cursor pagination, account lockout.

## 2. Endpoints covered

| Endpoint | Method | Permission | File test |
|---|---|---|---|
| `/api/v1/auth/login` | POST | public (rate-limited) | service |
| `/api/v1/auth/refresh` | POST | public (refresh token) | service |
| `/api/v1/auth/logout` | POST | authenticated | service |
| `/api/v1/auth/logout-all` | POST | authenticated | service |
| `/api/v1/auth/me` | GET | authenticated | service |
| `/api/v1/auth/change-password` | POST | authenticated | service |
| `/api/v1/auth/forgot-password` | POST | public | service |
| `/api/v1/auth/reset-password` | POST | public (token) | service |
| `/api/v1/auth/me/login-history` | GET | authenticated | service |

## 3. Test environment

- Mock `PrismaService` (full schema).
- Mock `argon2` hash/verify.
- Mock `JwtService` sign/verify.
- Use fixtures: `validUser`, `validRefreshToken`, `validPasswordResetToken`, `validLoginHistoryItem`.

## 4. Test cases

### TC-AUTH-001 — login — Happy path

- **Setup:** valid user with `passwordHash` set, refresh token table empty.
- **Input:** `{ email: 'admin@test.com', password: 'Secret123' }`.
- **Expected:** accessToken returned, refreshToken created in DB, loginHistory entry recorded, audit log `LOGIN_SUCCESS`.

### TC-AUTH-002 — login — Wrong password increments lockout counter

- **Setup:** valid user with `failedLoginCount = 4`.
- **Input:** valid email, wrong password.
- **Expected:** throws `UnauthorizedException`, `failedLoginCount = 5`, audit `LOGIN_FAILED`.

### TC-AUTH-003 — login — Account locked after 5 failures

- **Setup:** user with `status = 'LOCKED'`.
- **Expected:** throws `UnauthorizedException('ACCOUNT_LOCKED')`.

### TC-AUTH-004 — login — Rate limit (Phase 2 — e2e)

- **Setup:** 6 requests/minute/IP.
- **Expected:** 6th request → 429.

### TC-AUTH-005 — refresh — Token rotation

- **Setup:** active refresh token in DB.
- **Expected:** new accessToken + new refreshToken issued; old token marked `revokedAt`.

### TC-AUTH-006 — refresh — Reuse of revoked token triggers reuse-detection

- **Setup:** refresh token with `revokedAt != null`.
- **Expected:** all user's refresh tokens revoked (logout-all), audit `REFRESH_REUSED`.

### TC-AUTH-007 — logout — Single session

- **Setup:** active refresh token.
- **Expected:** token marked `revokedAt`, no exception.

### TC-AUTH-008 — logout-all — All sessions

- **Setup:** user with 3 active refresh tokens.
- **Expected:** `updateMany` with `userId`, all tokens revoked.

### TC-AUTH-009 — change-password — Wrong old password

- **Setup:** user, old password not matching.
- **Expected:** `UnauthorizedException('INVALID_OLD_PASSWORD')`.

### TC-AUTH-010 — change-password — Success invalidates all sessions

- **Expected:** all refresh tokens revoked, audit `PASSWORD_CHANGED`.

### TC-AUTH-011 — forgot-password — Always 200, no user enumeration

- **Setup:** non-existing email.
- **Expected:** returns `{ ok: true }` without throwing, no token created.

### TC-AUTH-012 — reset-password — Expired token

- **Setup:** reset token `expiresAt < now`.
- **Expected:** throws `BadRequestException('TOKEN_EXPIRED')`.

### TC-AUTH-013 — reset-password — Token already used

- **Setup:** reset token `usedAt != null`.
- **Expected:** throws `BadRequestException('TOKEN_USED')`.

### TC-AUTH-014 — login-history — Cursor pagination

- **Expected:** `take: limit + 1`, returns `nextCursor` if more pages exist.

### TC-AUTH-015 — Defense-in-depth — Locked account cannot login even with correct password

- **Verify:** `auth.service.login()` rejects BEFORE password verify.
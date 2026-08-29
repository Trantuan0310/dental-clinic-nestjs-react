# API — Authentication & Identity Module

> **Module:** Auth
> **Base:** Kế thừa toàn bộ quy ước từ [`api-conventions.md`](./api-conventions.md). File này chỉ specific cho module Auth.
> **Ngày tạo:** 2026-07-13

---

## Base path

```
/api/v1/auth       — Public + private auth endpoints
/api/v1/admin      — Admin-only (Users + Roles management)
/api/v1/admin/audit-logs
```

---

## 1. Public auth endpoints

### 1.1 `POST /api/v1/auth/login`

**Auth:** Public (rate limit 5 req/phút/IP — conventions §4.3)

**Request:**
```json
{
  "email": "admin@clinic.local",
  "password": "Secret123"
}
```

**Validation:**
- `email`: required, RFC 5322, lowercase normalized trước khi check DB
- `password`: required, string 1-200 chars (validate format ở DB layer)

**Response 200 OK:**
```json
{
  "data": {
    "accessToken": "eyJhbGc...",
    "accessTokenExpiresIn": 900,
    "user": {
      "id": "uuid",
      "email": "admin@clinic.local",
      "fullName": "Nguyen Van A",
      "status": "active",
      "roles": ["clinic_admin"],
      "permissions": ["user.create", "patient.create", "..."]
    }
  }
}
```

**Set cookie:**
```
refreshToken=<token>; HttpOnly; Secure; SameSite=Strict; Path=/api/v1/auth; Max-Age=604800
```

**Response 401 Unauthorized** (sai credentials):
```json
{
  "type": "about:blank",
  "title": "Invalid credentials",
  "status": 401
}
```

**Response 429 Too Many Requests** (account locked — BR-AUTH-003):
```json
{
  "type": "about:blank",
  "title": "Account temporarily locked",
  "status": 429,
  "retryAfter": 600,
  "detail": "Tài khoản bị tạm khóa do nhập sai quá nhiều lần. Thử lại sau 600 giây."
}
```

**Audit log:** luôn ghi `login_success` hoặc `login_failed`.

---

### 1.2 `POST /api/v1/auth/refresh`

**Auth:** Cookie `refreshToken` only (không cần access token)

**Request:** empty body (cookie là đủ)

**Response 200 OK:** giống login

**Set cookie:** rotate (xem BR-AUTH-006)

**Response 401:**
- Refresh token không tồn tại / hết hạn / đã revoked → 401
- **Reuse detection** (BR-AUTH-007): token đã revoke bị dùng → revoke TẤT CẢ refresh tokens của user + 401

---

### 1.3 `POST /api/v1/auth/logout`

**Auth:** Login required (cookie + access token)

**Request:** empty

**Response 204:** clear cookie

**Side effect:** revoke refresh token hiện tại

---

### 1.4 `POST /api/v1/auth/logout-all`

**Auth:** Login required

**Side effect:** revoke TẤT CẢ refresh tokens của user

**Response 204**

**Audit log:** `logout_all`

---

### 1.5 `POST /api/v1/auth/forgot-password`

**Auth:** Public (rate limit 3 req/phút/IP)

**Request:**
```json
{ "email": "user@clinic.local" }
```

**Response 204 No Content:** luôn 204, kể cả email không tồn tại (chống enumeration, BR-AUTH-005)

**Side effect:** Nếu email tồn tại → sinh reset token, hash + lưu DB, gửi email (MOCK ở MVP: in token ra console backend).

**Audit log:** `password_reset_requested`

---

### 1.6 `POST /api/v1/auth/reset-password`

**Auth:** Public (token trong body)

**Request:**
```json
{
  "token": "uuid-from-email",
  "newPassword": "NewSecret456"
}
```

**Validation newPassword:**
- ≥ 8 chars
- ≥ 1 chữ + ≥ 1 số
- không chứa local-part của email (case-insensitive)
- không nằm trong top 100k password phổ biến (BR-AUTH-002)

**Response 200 OK:**
```json
{
  "data": { "message": "Password updated successfully" }
}
```

**Side effect:**
- Update `password_hash`
- Revoke tất cả refresh tokens của user

**Response 400 Bad Request:** token invalid / expired / used

---

## 2. Private auth endpoints (cần access token)

### 2.1 `GET /api/v1/auth/me`

**Auth:** Login required

**Response 200:**
```json
{
  "data": {
    "id": "uuid",
    "email": "user@clinic.local",
    "fullName": "Nguyen Van A",
    "status": "active",
    "roles": ["receptionist"],
    "permissions": ["patient.create", "appointment.create", "..."]
  }
}
```

---

### 2.2 `POST /api/v1/auth/change-password`

**Auth:** Login required + `user.change_own_password` permission

**Request:**
```json
{
  "currentPassword": "OldSecret123",
  "newPassword": "NewSecret456"
}
```

**Validation:**
- `currentPassword`: phải đúng (verify argon2id)
- `newPassword`: cùng rule như reset-password

**Response 204**

**Side effect:**
- Update password
- Revoke tất cả refresh tokens của user (BR-AUTH-012)
- Audit `password_changed`

**Response 401:** current password sai

---

### 2.3 `GET /api/v1/auth/me/login-history`

**Auth:** Login required

**Query:**
- `limit` (int, default 20, max 100)
- `cursor` (UUID của audit_log, optional — dùng cursor-based theo conventions §2.3)

**Response 200:**
```json
{
  "data": [
    {
      "occurredAt": "2026-07-13T10:00:00Z",
      "action": "login_success",
      "ipAddress": "10.0.0.5",
      "userAgent": "Mozilla/5.0..."
    }
  ],
  "pagination": {
    "pageSize": 20,
    "nextCursor": "uuid",
    "hasMore": true
  }
}
```

---

## 3. Admin endpoints — User management

> Tất cả endpoint trong `/api/v1/admin/users/**` yêu cầu permission tương ứng (xem Actor Permissions Matrix §3.6).

### 3.1 `GET /api/v1/admin/users`

**Permission:** `user.read`

**Query:**
- `q` (string, full-text search name/email/code)
- `status` (enum: `active`, `pending_setup`, `deactivated`)
- `roleId` (UUID, filter by role)
- `pageSize`, `cursor`, `sort` (conventions §2.3)
- `includeDeleted` (boolean, default false)

**Response 200:**
```json
{
  "data": [
    {
      "id": "uuid",
      "email": "user@clinic.local",
      "fullName": "Nguyen Van B",
      "status": "active",
      "roles": ["receptionist"],
      "lastLoginAt": "2026-07-12T08:00:00Z",
      "createdAt": "2026-01-15T08:00:00Z",
      "deactivatedAt": null
    }
  ],
  "pagination": { "pageSize": 20, "nextCursor": "uuid", "hasMore": true }
}
```

---

### 3.2 `POST /api/v1/admin/users`

**Permission:** `user.create`

**Request:**
```json
{
  "email": "newuser@clinic.local",
  "fullName": "Nguyen Van C",
  "roleIds": ["uuid-role-receptionist"],
  "sendInvite": true
}
```

**Response 201:**
```json
{
  "data": {
    "id": "uuid",
    "email": "newuser@clinic.local",
    "status": "pending_setup",
    "createdAt": "..."
  }
}
```

**Side effect:**
- Tạo User với `password_hash = random` (chưa đặt password)
- Status = `pending_setup`
- Gán roles
- Nếu `sendInvite = true`: gửi email setup link (MOCK)
- Audit `user_created`

**Validation errors:**
- 409: email đã tồn tại (active)
- 422: invalid email format

---

### 3.3 `GET /api/v1/admin/users/:id`

**Permission:** `user.read`

**Response 200:**
```json
{
  "data": {
    "id": "uuid",
    "email": "user@clinic.local",
    "fullName": "Nguyen Van A",
    "status": "active",
    "roles": ["receptionist", "..."],
    "permissions": ["patient.create", "..."],
    "failedLoginAttempts": 0,
    "lockedUntil": null,
    "lastLoginAt": "...",
    "deactivatedAt": null,
    "createdAt": "...",
    "updatedAt": "..."
  }
}
```

---

### 3.4 `PATCH /api/v1/admin/users/:id`

**Permission:** `user.update`

**Request (subset):**
```json
{
  "fullName": "Nguyen Van A Updated"
}
```

> **Không cho đổi email qua PATCH** (audit nghiêm ngặt). Email đổi phải qua flow riêng (out of MVP scope).

**Response 200:** user object

**Side effect:**
- Update user
- Audit `user_updated` (action mới thêm vào BR-AUTH-017 nếu cần)

---

### 3.5 `PUT /api/v1/admin/users/:id/roles`

**Permission:** `user.update`

**Request:**
```json
{
  "roleIds": ["uuid-role-dentist"]
}
```

**Side effect:**
- Replace tất cả roles của user
- Apply BR-AUTH-013 (đổi role → revoke all sessions)
- Apply BR-AUTH-015 (last admin guard)
- Audit `user_role_changed`

**Response 200:** user object với roles mới

**Response 409:**
- "Cannot remove last admin" (BR-AUTH-015)
- "Cannot deactivate last admin"

---

### 3.6 `POST /api/v1/admin/users/:id/deactivate`

**Permission:** `user.deactivate`

**Request:**
```json
{ "reason": "Resigned" }
```

**Side effect:**
- Set `deactivated_at = now()`
- Revoke all refresh tokens (BR-AUTH-014)
- Audit `user_deactivated`

**Response 204**

**Response 409:** "Cannot deactivate last admin"

---

### 3.7 `POST /api/v1/admin/users/:id/reactivate`

**Permission:** `user.deactivate` (cùng permission, xem matrix)

**Response 204**

**Side effect:**
- Set `deactivated_at = NULL`
- Status remains `active` (KHÔNG reset password)
- Audit `user_reactivated`

---

### 3.8 `POST /api/v1/admin/users/:id/reset-password`

**Permission:** `user.reset_password`

**Request:**
```json
{ "sendEmail": true }
```

**Side effect:**
- Generate random password mới (32 chars)
- Update `password_hash`
- Set status = `pending_setup` (user phải đổi lại lần đầu login)
- Revoke all refresh tokens
- Nếu `sendEmail = true`: gửi email với password mới (MOCK: in ra console)
- Audit `user_password_reset_by_admin`

**Response 200:**
```json
{
  "data": {
    "temporaryPassword": "abc123..."  // chỉ trả khi sendEmail = false, để admin gửi manual
  }
}
```

---

### 3.9 `GET /api/v1/admin/users/:id/login-history`

**Permission:** `user.read`

Tương tự `GET /auth/me/login-history` nhưng xem của user khác.

---

## 4. Admin endpoints — Role management

### 4.1 `GET /api/v1/admin/roles`

**Permission:** `role.upsert`

**Response 200:**
```json
{
  "data": [
    {
      "id": "uuid",
      "code": "receptionist",
      "name": "Lễ tân",
      "description": "...",
      "isSystem": true,
      "permissionCount": 12,
      "userCount": 5
    }
  ],
  "pagination": { ... }
}
```

---

### 4.2 `POST /api/v1/admin/roles`

**Permission:** `role.upsert`

**Request:**
```json
{
  "code": "senior_dentist",
  "name": "Bác sĩ cao cấp",
  "description": "Bác sĩ có thêm quyền",
  "permissionCodes": ["patient.create", "patient.update", "..."]
}
```

**Response 201:** role object

**Validation:**
- 409: code trùng
- 422: invalid permission code

---

### 4.3 `PATCH /api/v1/admin/roles/:id`

**Permission:** `role.upsert`

**Request (subset):**
```json
{
  "name": "...",
  "description": "...",
  "permissionCodes": ["..."]
}
```

> **Không cho đổi `code`** (audit nghiêm ngặt).
> Nếu đổi `permissionCodes` → revoke all sessions của users có role này (BR-AUTH-013 mở rộng).

**Response 200:** role object

**Response 409:** "Cannot modify system role code"

---

### 4.4 `DELETE /api/v1/admin/roles/:id`

**Permission:** `role.upsert`

**Side effect:** Soft-delete role nếu `userCount = 0`

**Response 204**

**Response 409:**
- "Cannot delete system role" (BR-AUTH-009)
- "Cannot delete role with active users"

---

### 4.5 `GET /api/v1/admin/permissions`

**Permission:** `role.upsert`

**Response 200:** danh sách 30 permissions (read-only cho admin xem)

---

## 5. Admin — Audit logs

### 5.1 `GET /api/v1/admin/audit-logs`

**Permission:** `system.audit.read`

**Query:**
- `actor` (UUID, actor_user_id)
- `action` (enum từ BR-AUTH-017)
- `targetType` (enum)
- `targetId` (UUID)
- `from`, `to` (timestamp range)
- `pageSize`, `cursor`, `sort`

**Response 200:**
```json
{
  "data": [
    {
      "id": "uuid",
      "actorUserId": "uuid-or-null",
      "actorEmailAtTime": "user@clinic.local",
      "action": "login_failed",
      "targetType": null,
      "targetId": null,
      "metadata": { "ipAddress": "...", "reason": "wrong_password" },
      "ipAddress": "10.0.0.5",
      "userAgent": "Mozilla/5.0",
      "occurredAt": "2026-07-13T10:00:00Z"
    }
  ],
  "pagination": { ... }
}
```

---

## 6. Validation rules tổng hợp (Auth-specific)

| Field | Rule |
| ----- | ---- |
| email | RFC 5322, lowercased trước khi check |
| password (new/reset) | ≥ 8 chars, ≥ 1 letter + ≥ 1 digit, không chứa local-part email, không trong top 100k common |
| fullName | 1-200 chars, trim |
| role code | snake_case, 3-50 chars |
| permission code | snake_case, format `<resource>.<action>` |

---

## 7. Error responses (specific cho Auth)

| Status | Title | Khi nào |
| :----: | ----- | ------- |
| 400 | Invalid token | Reset password token invalid/expired/used |
| 401 | Invalid credentials | Login sai email/password |
| 401 | Session expired | Refresh token invalid/revoked/expired |
| 401 | Token reuse detected | Refresh token đã revoke bị dùng (BR-AUTH-007) |
| 403 | Admin only | Endpoints /admin/** không phải admin |
| 409 | Email already exists | Tạo user với email trùng |
| 409 | Cannot remove last admin | BR-AUTH-015 |
| 409 | Cannot delete system role | BR-AUTH-009 |
| 422 | Password too weak | BR-AUTH-002 |
| 429 | Account locked | BR-AUTH-003 |

---

## 8. Idempotency

Các POST endpoints cần `Idempotency-Key` header (xem conventions §5.2):

| Endpoint | Required? |
| -------- | :-------: |
| `POST /auth/login` | ✅ (tránh tạo session trùng) |
| `POST /auth/forgot-password` | Optional |
| `POST /auth/reset-password` | ✅ |
| `POST /auth/change-password` | Optional |
| `POST /admin/users/:id/deactivate` | ✅ |
| `POST /admin/users/:id/reset-password` | ✅ |

---

## 9. OpenAPI annotations checklist

Mỗi endpoint cần:

- [ ] `@ApiOperation({ summary, description })`
- [ ] `@ApiResponse` cho 200/201 + 4xx codes
- [ ] `@ApiBearerAuth()` (trừ public)
- [ ] `@ApiBody({ type: ZodDto })`
- [ ] `@ApiQuery` cho query params
- [ ] `@ApiCookieAuth('refreshToken')` cho endpoints dùng cookie

---

## Related

- [api-conventions.md](./api-conventions.md) — quy ước chung
- [SPEC Auth](../03_Specification/Auth/SPEC.md) — đầy đủ BR + flow
- [Actor Permissions Matrix §3.6](../01_Architecture/actor-permissions-matrix.md)
- [Schema Auth](../04_Database/schema-per-module/auth.md)
# Test Cases — Users Module

> **Module:** Users (admin)
> **Priority:** P0 — user administration, RBAC critical.
> **Test file:** `backend/src/users/users.service.spec.ts`

---

## 1. Purpose

Cover user listing, creation, updates, role management, deactivation/reactivation, password reset by admin, login history cursor pagination.

## 2. Endpoints covered

| Endpoint | Method | Permission |
|---|---|---|
| `/api/v1/admin/users` | GET | `user.read` |
| `/api/v1/admin/users` | POST | `user.create` |
| `/api/v1/admin/users/:id` | GET | `user.read` |
| `/api/v1/admin/users/:id` | PATCH | `user.update` |
| `/api/v1/admin/users/:id/roles` | PUT | `user.assign_role` |
| `/api/v1/admin/users/:id/deactivate` | POST | `user.deactivate` |
| `/api/v1/admin/users/:id/reactivate` | POST | `user.reactivate` |
| `/api/v1/admin/users/:id/reset-password` | POST | `user.reset_password` |
| `/api/v1/admin/users/:id/login-history` | GET | `user.read` |

## 3. Test environment

- Mock `PrismaService`, `AuthService` (for password hashing).
- Use fixtures: `validUser`, `validAdminUser`, `validRole`, `validUserRole`.

## 4. Test cases

### TC-USR-001 — list — Returns paginated users with role codes

- **Expected:** `findMany` with `rolePermissions` include, result maps role codes.

### TC-USR-002 — create — Hashes password before insert

- **Verify:** `argon2.hash` called once; `passwordHash` in DB ≠ plaintext.

### TC-USR-003 — create — Email uniqueness

- **Setup:** existing user with same email.
- **Expected:** `ConflictException`.

### TC-USR-004 — update — Updates name, phone, status

- **Expected:** `update` called with proper data; old email preserved.

### TC-USR-005 — updateRoles — Replaces user roles transactionally

- **Verify:** `prisma.$transaction` invoked; old `userRoles` deleted; new roles created.

### TC-USR-006 — deactivate — Rejects deactivating last admin

- **Setup:** user is the only one with `admin` role code.
- **Expected:** `ConflictException('LAST_ADMIN_CANNOT_BE_DEACTIVATED')`.

### TC-USR-007 — deactivate — Soft-deletes user

- **Verify:** `status = 'INACTIVE'`, `deletedAt = now()`, audit `USER_DEACTIVATED`.

### TC-USR-008 — reactivate — Restores user

- **Verify:** `status = 'ACTIVE'`, `deletedAt = null`.

### TC-USR-009 — resetPassword — Generates new temp password, logs audit

- **Verify:** `update` with `passwordHash`, audit `PASSWORD_RESET_BY_ADMIN`.

### TC-USR-010 — loginHistory — Cursor pagination

- **Verify:** `take: limit + 1`, returns `nextCursor` if more.
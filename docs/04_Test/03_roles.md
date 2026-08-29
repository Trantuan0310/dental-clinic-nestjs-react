# Test Cases — Roles Module

> **Module:** Roles (admin)
> **Priority:** P1 — RBAC matrix management.
> **Test file:** `backend/src/roles/roles.service.spec.ts`

---

## 1. Purpose

Cover role listing, retrieval, creation, and deletion, with checks for system roles, roles with assigned users, and permission assignment.

## 2. Endpoints covered

| Endpoint | Method | Permission |
|---|---|---|
| `/api/v1/admin/roles` | GET | `role.read` |
| `/api/v1/admin/roles/permissions` | GET | `role.read` |
| `/api/v1/admin/roles/:id` | GET | `role.read` |
| `/api/v1/admin/roles` | POST | `role.create` |
| `/api/v1/admin/roles/:id` | PATCH | `role.update` |
| `/api/v1/admin/roles/:id` | DELETE | `role.delete` |

## 3. Test cases

### TC-ROLE-001 — list — Returns roles with permissionCount and userCount

- **Verify:** result contains `permissionCount = rolePermissions.length`, `userCount = userRoles.length`.

### TC-ROLE-002 — getById — 404 when missing

- **Setup:** `findUniqueOrThrow` throws.
- **Expected:** `NotFoundException`.

### TC-ROLE-003 — getPermissions — Returns flat list of permission objects

- **Expected:** array of `{ id, code, description }` not just codes.

### TC-ROLE-004 — create — ConflictException on duplicate code

- **Setup:** `findUnique({ where: { code } })` returns existing.
- **Expected:** `ConflictException`.

### TC-ROLE-005 — create — NotFoundException on missing permission codes

- **Setup:** `permission.findMany` returns fewer than requested.
- **Expected:** `NotFoundException`.

### TC-ROLE-006 — create — Audit log ROLE_CREATED

- **Verify:** `audit.log` called with `action: 'ROLE_CREATED'`.

### TC-ROLE-007 — delete — CannotDeleteSystemRoleException for system roles

- **Setup:** role with `isSystem = true`.
- **Expected:** `ConflictException('CANNOT_DELETE_SYSTEM_ROLE')`.

### TC-ROLE-008 — delete — CannotDeleteRoleWithUsersException when users assigned

- **Setup:** role with `userRoles.length > 0`.
- **Expected:** `ConflictException('CANNOT_DELETE_ROLE_WITH_USERS')`.

### TC-ROLE-009 — delete — Soft-deletes role

- **Verify:** `update` with `deletedAt = now()`.
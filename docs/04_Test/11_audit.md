# Test Cases — Audit Module

> **Module:** Audit
> **Priority:** P2 — read-only, low risk.
> **Test files:** `backend/src/audit/audit.service.spec.ts`, `audit.controller.spec.ts`

---

## 1. Purpose

Cover audit log writing from services, and audit log listing with filters + cursor pagination.

## 2. Endpoints covered (1 endpoint)

| Endpoint | Method | Permission |
|---|---|---|
| `/api/v1/admin/audit-logs` | GET | `system.audit.read` |

## 3. Test cases

### TC-AUDIT-001 — log — Writes record with all fields

- **Verify:** `prisma.auditLog.create` called with full data.

### TC-AUDIT-002 — log — Defaults null fields when omitted

- **Verify:** `actorUserId, actorEmail, targetType, targetId, ipAddress, userAgent = null`.

### TC-AUDIT-003 — list — Returns paginated logs

- **Verify:** `take: limit + 1`, `orderBy: occurredAt desc`.

### TC-AUDIT-004 — list — Returns nextCursor when more pages exist

- **Verify:** `nextCursor` set to `data[length-1].id` when `hasMore`.

### TC-AUDIT-005 — list — Filter by actor, action, targetType

- **Verify:** `where` includes the filters.

### TC-AUDIT-006 — list — Date range filter from/to

- **Verify:** `where.occurredAt.gte / lte`.

### TC-AUDIT-007 — list — Cursor-based pagination using occurredAt lt

- **Verify:** `findUnique({ id: cursor, select: { occurredAt } })`, then `lt: occurredAt`.

### TC-AUDIT-008 — list — Ignores invalid cursor

- **Setup:** cursor log not found.
- **Verify:** still returns results without `lt` filter.
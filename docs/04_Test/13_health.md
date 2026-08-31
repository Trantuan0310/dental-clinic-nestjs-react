# Test Cases — Health Module (Common)

> **Module:** Health (smoke check)
> **Priority:** P3 — simple smoke test.
> **Test file:** `backend/src/common/health.controller.spec.ts`

---

## 1. Purpose

Verify health check endpoint responds OK for load balancer / Docker healthcheck.

## 2. Endpoints covered (1 endpoint)

| Endpoint | Method | Permission |
|---|---|---|
| `/health` (ngoài global prefix `/api`, xem `main.ts`) | GET | public |

## 3. Test cases

### TC-HC-001 — check — Returns ok with timestamp

- **Verify:** `status: 'ok'`, `timestamp: ISO string`.

### TC-HC-002 — check — No DB dependency (lightweight smoke test)

- **Verify:** no Prisma calls.
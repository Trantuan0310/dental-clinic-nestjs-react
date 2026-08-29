# Test Cases — Inventory Module

> **Module:** Inventory (items, stock movements, categories)
> **Priority:** P0 — R2-9 atomic stock, đụng vào medical-records.
> **Test file:** `backend/src/inventory/inventory.service.spec.ts`

---

## 1. Purpose

Cover item creation, stock-in, stock-out (with guarded updates), stock adjustments, including checks for SKU uniqueness and insufficient stock.

## 2. Endpoints covered (12 endpoints)

| Endpoint | Method | Permission |
|---|---|---|
| `/api/v1/inventory/items` | GET | `inventory.read` |
| `/api/v1/inventory/items/low-stock` | GET | `inventory.read` |
| `/api/v1/inventory/items/:id` | GET | `inventory.read` |
| `/api/v1/inventory/items` | POST | `inventory.create` |
| `/api/v1/inventory/items/:id` | PATCH | `inventory.update` |
| `/api/v1/inventory/items/:id` | DELETE | `inventory.delete` |
| `/api/v1/inventory/items/:id/stock-in` | POST | `inventory.stock_in` |
| `/api/v1/inventory/items/:id/stock-out` | POST | `inventory.stock_out` |
| `/api/v1/inventory/items/:id/adjust` | POST | `inventory.adjust` |
| `/api/v1/inventory/items/:id/movements` | GET | `inventory.read` |
| `/api/v1/inventory/categories` | GET | `inventory.read` |
| `/api/v1/inventory/categories` | POST | `inventory.create` |

## 3. Test cases

### TC-INV-001 — create — Validates SKU uniqueness

- **Setup:** existing item with same SKU.
- **Expected:** `ConflictException`.

### TC-INV-002 — create — Initializes stock to 0

- **Verify:** `stockOnHand: 0`.

### TC-INV-003 — stockIn — Increments stock, creates movement

- **Verify:** `updateMany({ where: { id, stockOnHand: { gte: 0 } } })` (no negative).
- **Verify:** `stockMovement.create({ type: 'IN', quantity })`.

### TC-INV-004 — stockOut — R2-9 guarded update (no negative stock)

- **Setup:** item `stockOnHand: 10`.
- **Input:** `quantity: 20`.
- **Verify:** `updateMany({ where: { id, stockOnHand: { gte: 20 } } })` returns `{ count: 0 }`.
- **Expected:** throws `InsufficientStockException`.

### TC-INV-005 — stockOut — R2-9 success

- **Setup:** item `stockOnHand: 10`.
- **Input:** `quantity: 5`.
- **Verify:** `updateMany` returns `{ count: 1 }`, `stockOnHand = 5`, movement `OUT` recorded.

### TC-INV-006 — adjustStock — Positive and negative deltas

- **Verify:** `update({ stockOnHand: prev + delta })`; rejects if result < 0.

### TC-INV-007 — lowStockReport — Returns items below minStockLevel

- **Verify:** `where.stockOnHand: { lte: minStockLevel }`.

### TC-INV-008 — movements — Cursor pagination + filter by item

- **Verify:** `take: limit + 1`, filter `itemId`.

### TC-INV-009 — update — Soft-deletes inactive items

- **Verify:** `update({ deletedAt: now })`.

### TC-INV-010 — categories — CRUD without stock logic

- **Verify:** simple `create / list` flow.
# API — Inventory Module

> **Module:** Inventory (Items, Categories, Stock Movements)
> **Base:** Kế thừa toàn bộ quy ước từ [`api-conventions.md`](./api-conventions.md).
> **Scope MVP:** Đơn giản — không có lô/hạn.
> **Ngày tạo:** 2026-07-13

---

## Base path

```
/api/v1/inventory/categories              — CRUD
/api/v1/inventory/items                   — CRUD + actions
/api/v1/inventory/items/:id/movements     — Stock movements
/api/v1/inventory/items/:id/adjust        — Action: stock adjustment
/api/v1/inventory/items/:id/transfer      — Action: transfer (placeholder MVP)
/api/v1/inventory/low-stock               — Low-stock dashboard
/api/v1/inventory/alerts                  — Stock alerts
```

---

## 1. Categories

### 1.1 `GET /api/v1/inventory/categories`

**Auth:** Login required
**Permission:** `inventory.read`

**Query:**
- `q` (string, search name)
- `includeDeleted` (bool, admin)

**Response 200:**
```json
{
  "data": [
    {
      "id": "uuid",
      "code": "ENDO_SUPPLIES",
      "name": "Vật tư nội nha",
      "description": "Gutta-percha, file tay, file máy, ...",
      "parentId": null,
      "itemCount": 12,
      "lowStockItemCount": 2,
      "isActive": true,
      "createdAt": "..."
    }
  ],
  "pagination": { ... }
}
```

---

### 1.2 `POST /api/v1/inventory/categories`

**Auth:** Login required
**Permission:** `inventory.category.create` (Admin)

**Request:**
```json
{
  "code": "ENDO_SUPPLIES",
  "name": "Vật tư nội nha",
  "description": "...",
  "parentId": null
}
```

**Validation:**
- `code`: snake_case upper, 3-30 chars
- `name`: 1-100 chars

**Side effect:** Audit `category_created`

**Response 201:** category object

---

### 1.3 `PATCH /api/v1/inventory/categories/:id`

**Auth:** Login required
**Permission:** `inventory.category.update` (Admin)

**Request (subset):**
```json
{
  "name": "...",
  "description": "..."
}
```

**Response 200:** category object

---

### 1.4 `DELETE /api/v1/inventory/categories/:id`

**Auth:** Login required
**Permission:** `inventory.category.delete` (Admin)

**Side effect:** Soft-delete. Item trong category remain nhưng category hiển thị `[Deleted]` trong UI.

**Response 204**

---

## 2. Inventory Items CRUD

### 2.1 `GET /api/v1/inventory/items`

**Auth:** Login required
**Permission:** `inventory.read`

**Query:**
| Param | Type | Default | Description |
| ----- | ---- | :-----: | ----------- |
| `q` | string | — | Full-text search name/sku |
| `categoryId` | uuid | — | Filter |
| `isActive` | bool | true | Active filter |
| `lowStockOnly` | bool | false | Filter `quantityOnHand ≤ reorderPoint` |
| `pageSize` | int | 20 | — |
| `cursor` | string | — | Cursor pagination |
| `sort` | string | `name:asc` | — |
| `includeDeleted` | bool | false | Admin only |

**Response 200:**
```json
{
  "data": [
    {
      "id": "uuid",
      "sku": "GP-30",
      "name": "Gutta-percha 30#",
      "description": "Gutta-percha size 30, đóng gói 6 cây/hộp",
      "categoryId": "uuid",
      "categoryName": "Vật tư nội nha",
      "unit": "cây",
      "quantityOnHand": 25,
      "reservedQuantity": 3,
      "availableQuantity": 22,
      "reorderPoint": 10,
      "reorderQuantity": 50,
      "costPerUnitCents": 50000,
      "currency": "VND",
      "isLowStock": false,
      "isActive": true,
      "lastMovementAt": "2026-07-15T09:30:00Z",
      "createdAt": "..."
    }
  ],
  "pagination": { ... }
}
```

> **BR-INV-001: Số lượng:**
> - `quantityOnHand` = tổng đã nhập − tổng đã xuất ± adjustments
> - `reservedQuantity` = tổng đang "reserve" bởi treatments chưa đóng encounter
> - `availableQuantity` = `quantityOnHand − reservedQuantity`
> - Available phải ≥ quantity mới cho tạo treatment

---

### 2.2 `POST /api/v1/inventory/items`

**Auth:** Login required
**Permission:** `inventory.item.create` (Admin)

**Request:**
```json
{
  "sku": "GP-30",
  "name": "Gutta-percha 30#",
  "description": "...",
  "categoryId": "uuid",
  "unit": "cây",
  "reorderPoint": 10,
  "reorderQuantity": 50,
  "costPerUnitCents": 50000,
  "initialQuantityOnHand": 100,
  "isActive": true
}
```

**Validation:**
- `sku`: required, 1-50 chars, unique per clinic (partial unique idx — only active items)
- `name`: 1-200 chars
- `unit`: enum (free text basically) — vd `cây`, `ống`, `hộp`, `ml`, `gói`
- `reorderPoint`: integer ≥ 0
- `costPerUnitCents`: integer ≥ 0

**Side effect:**
- Tạo item
- Tạo stock_movement đầu tiên (`initialQuantityOnHand`) với reason = `initial_stock`
- Audit `item_created`

**Response 201:** item object

---

### 2.3 `GET /api/v1/inventory/items/:id`

**Auth:** Login required
**Permission:** `inventory.read`

**Response 200:** giống 2.1 — chi tiết item, bao gồm:
- `createdByUserId`
- `deactivatedAt`
- `reorderHistoryCount` (lịch sử cảnh báo đã view)

---

### 2.4 `PATCH /api/v1/inventory/items/:id`

**Auth:** Login required
**Permission:** `inventory.item.update` (Admin)

**Request (subset):**
```json
{
  "name": "...",
  "description": "...",
  "reorderPoint": 15,
  "reorderQuantity": 100,
  "costPerUnitCents": 55000,
  "isActive": true
}
```

> **Lưu ý:**
> - Đổi `quantityOnHand` KHÔNG qua PATCH — phải qua `POST /adjust`
> - Đổi `sku` không cho phép (audit nghiêm ngặt)

**Response 200:** item object

---

### 2.5 `POST /api/v1/inventory/items/:id/adjust`

**Auth:** Login required
**Permission:** `inventory.item.adjust` (Admin + Receptionist với item-level permission)

**Idempotency:** Required

**Request:**
```json
{
  "deltaQuantity": -3,
  "reason": "broken_during_treatment",
  "note": "Bị gãy khi lấy tủy răng 27, bệnh nhân PAT-2026-00050",
  "relatedEncounterId": "uuid-optional"
}
```

**Validation:**
- `deltaQuantity`: khác 0, integer (âm = giảm, dương = tăng)
- `quantityOnHand` sau khi adjust ≥ 0 (BR-INV-005)
- `reason`: enum
  - `stock_in` (manual stock-in)
  - `broken` (hỏng)
  - `lost` (thất lạc)
  - `count_correction` (đếm lại sai)
  - `returned_to_supplier` (trả NCC)
  - `received_from_supplier` (nhập lại từ NCC — same as stock_in but tagged)

**Side effect (BR-INV-023 fixed):**
- Bỏ qua no-op adjustment (delta = 0): vẫn ghi log nhưng return `noop: true`
- Tạo `stock_movements` row
- Update `quantityOnHand` (atomic — row lock)
- Update `isLowStock` flag
- Audit `stock_adjusted`

**Response 200:**
```json
{
  "data": {
    "id": "uuid",
    "quantityOnHand": 47,
    "movement": {
      "id": "uuid",
      "deltaQuantity": -3,
      "reason": "broken_during_treatment",
      "createdAt": "..."
    }
  }
}
```

**Response 422:**
- "Adjustment would result in negative stock" (BR-INV-005)

---

### 2.6 `POST /api/v1/inventory/items/:id/deactivate`

**Auth:** Login required
**Permission:** `inventory.item.delete` (Admin)

**Request:**
```json
{ "reason": "Ngừng sử dụng" }
```

**Side effect:**
- Set `isActive = false`, `deactivatedAt = now()`
- Không cho tạo treatment mới dùng item này
- Lịch sử còn lại

**Response 204**

---

## 3. Stock Movements (lịch sử)

### 3.1 `GET /api/v1/inventory/items/:id/movements`

**Auth:** Login required
**Permission:** `inventory.read`

**Query:**
- `type` (enum: `in` \| `out` \| `adjust`)
- `from` (date)
- `to` (date)
- `pageSize`, `cursor`, `sort` (conventions §2.3)

**Response 200:**
```json
{
  "data": [
    {
      "id": "uuid",
      "type": "out",
      "quantity": -3,
      "quantityBefore": 50,
      "quantityAfter": 47,
      "reason": "treatment_consumption",
      "note": "Sử dụng trong encounter ...23",
      "relatedEncounterId": "uuid-encounter",
      "relatedTreatmentId": "uuid-treatment",
      "performedByUserId": "uuid-dentist",
      "performedAt": "2026-07-15T09:30:00Z"
    },
    {
      "id": "uuid",
      "type": "in",
      "quantity": 100,
      "reason": "initial_stock",
      "relatedEncounterId": null,
      "performedByUserId": "uuid-admin",
      "performedAt": "2026-07-01T10:00:00Z"
    },
    {
      "id": "uuid",
      "type": "adjust",
      "quantity": -3,
      "reason": "broken",
      "performedByUserId": "uuid-receptionist",
      "performedAt": "2026-07-16T11:00:00Z"
    }
  ],
  "pagination": { ... }
}
```

---

## 4. Cross-module events (ADR-0008)

### 4.1 Publisher: Encounter close → Inventory consumes

Khi encounter close (`POST /encounters/:id/close` xem API MR §1.5), MedicalRecords phát event `EncounterClosed` trong cùng transaction. Inventory subscriber sẽ:

1. Re-read tất cả treatments của encounter (locked sau close)
2. Re-read tất cả `treatment_inventory_usages`
3. Với mỗi usage → tạo `stock_movements` row với:
   - `type = out`
   - `quantity = -usage.quantityUsed`
   - `reason = treatment_consumption`
   - `relatedEncounterId = encounter.id`
   - `relatedTreatmentId = treatment.id`
4. Atomic với encounter close (cùng transaction) (BR-INV-004/005)

**Idempotency:** Re-fire safe vì movements là immutable.

**Reservation cleanup:** Sau khi encounter close, reservation được "consume" → không cần giữ `reservedQuantity` nữa (vì đã trừ thực sự).

---

### 4.2 Nếu encounter cancel

- `EncounterCancelled` event → KHÔNG release stock (vì chưa bao giờ trừ)
- Chỉ release các reservation đang pending

---

## 5. Low-stock & Alerts

### 5.1 `GET /api/v1/inventory/low-stock`

**Auth:** Login required
**Permission:** `inventory.read`

**Query:**
- `categoryId` (optional)
- `pageSize`, `cursor`

**Response 200:**
```json
{
  "data": [
    {
      "id": "uuid",
      "sku": "GP-30",
      "name": "Gutta-percha 30#",
      "categoryName": "Vật tư nội nha",
      "quantityOnHand": 5,
      "reservedQuantity": 3,
      "availableQuantity": 2,
      "reorderPoint": 10,
      "reorderQuantity": 50,
      "lowStockSinceAt": "2026-07-12T08:00:00Z"
    }
  ],
  "summary": {
    "totalLowStockItems": 4
  },
  "pagination": { ... }
}
```

> **Dashboard badge:** Frontend gọi endpoint này mỗi 60s, hiển thị badge số lượng low-stock items.

---

### 5.2 `GET /api/v1/inventory/alerts`

**Auth:** Login required
**Permission:** `inventory.alert.read`

**Query:**
- `severity` (enum: `low` \| `critical` \| `out`)
- `acknowledged` (bool)
- `pageSize`, `cursor`

**Response 200:**
```json
{
  "data": [
    {
      "id": "uuid",
      "type": "low_stock",
      "severity": "low",
      "itemId": "uuid",
      "itemSku": "GP-30",
      "itemName": "Gutta-percha 30#",
      "currentQuantity": 5,
      "threshold": 10,
      "triggeredAt": "2026-07-12T08:00:00Z",
      "acknowledgedAt": null,
      "acknowledgedByUserId": null
    }
  ],
  "pagination": { ... }
}
```

**Severity:**
- `low`: ≤ reorderPoint
- `critical`: ≤ reorderPoint / 2
- `out`: = 0

---

### 5.3 `POST /api/v1/inventory/alerts/:id/acknowledge`

**Auth:** Login required
**Permission:** `inventory.alert.read` (cùng permission đọc)

**Request:**
```json
{
  "note": "Đã đặt mua thêm 100 cây"
}
```

**Side effect:**
- Set `acknowledgedAt = now()`, `acknowledgedByUserId`
- Alert vẫn còn trong DB (cho audit)
- Audit `alert_acknowledged`

**Response 200:** alert object

---

## 6. Validation rules (Inventory-specific)

| Field | Rule |
| ----- | ---- |
| `sku` | string 1-50 chars, ASCII alphanumeric + `-_`, unique khi `isActive` |
| `name` | 1-200 chars |
| `unit` | string 1-20 chars |
| `reorderPoint` | integer 0-999999 |
| `reorderQuantity` | integer 0-999999, ≥ `reorderPoint` |
| `costPerUnitCents` | integer ≥ 0 |
| `quantityOnHand` | integer 0-999999 |
| `deltaQuantity` | integer, ≠ 0 |

---

## 7. Error responses (Inventory-specific)

| Status | Title | Khi nào |
| :----: | ----- | ------- |
| 409 | SKU already exists | unique constraint trên `(sku)` khi active |
| 409 | Cannot delete category with items | |
| 409 | Cannot delete item with movements | (luôn luôn giữ lại — soft delete) |
| 422 | Adjustment would result in negative stock | BR-INV-005 |
| 422 | Insufficient stock for treatment | BR-INV-004 |
| 422 | Cannot use inactive item in treatment | — |

---

## 8. Atomic guarantees (BR + ADR)

| Action | Atomic |
| ------ | :----: |
| Item creation + initial movement | ✅ (1 transaction) |
| Stock adjustment + movement log | ✅ |
| Encounter close + stock out (qty reservation → out) + invoice draft | ✅ (ADR-0008) |
| Multiple adjustments on same item | ✅ (row-level lock) |

---

## 9. Idempotency

| Endpoint | Required |
| -------- | :------: |
| `POST /inventory/items` | ✅ |
| `POST /inventory/items/:id/adjust` | ✅ |
| `POST /inventory/items/:id/deactivate` | ✅ |
| `POST /inventory/alerts/:id/acknowledge` | Optional |

---

## 10. Audit log mapping

| Action | Trigger |
| ------ | ------- |
| `category_created` | POST /categories |
| `category_updated` | PATCH /categories/:id |
| `category_deleted` | DELETE /categories/:id |
| `item_created` | POST /items |
| `item_updated` | PATCH /items/:id |
| `item_deactivated` | POST /items/:id/deactivate |
| `stock_adjusted` | POST /items/:id/adjust |
| `stock_consumed` | (auto, encounter close, §4.1) |
| `stock_initial` | POST /items (initial movement) |
| `alert_acknowledged` | POST /alerts/:id/acknowledge |

---

## Related

- [api-conventions.md](./api-conventions.md)
- [SPEC Inventory](../03_Specification/Inventory/SPEC.md)
- [BD-0004: Inventory scope](../01_Architecture/business-decisions.md#bd-0004)
- [ADR-0008: Transactional events](../ADR/0008-transactional-encounter-close.md)
- [Schema Inventory](../04_Database/schema-per-module/inventory.md)
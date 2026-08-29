# Blueprint: Inventory Module

> **Loại tài liệu:** Blueprint (khám phá trước spec).
> **Module:** `Inventory` — Quản lý vật tư tiêu hao, nhập/xuất kho, cảnh báo sắp hết.

---

## Vấn đề

Phòng khám cần:

1. Quản lý danh sách vật tư (composite, thuốc tê, găng tay, khẩu trang…).
2. Theo dõi số lượng tồn kho.
3. Tự động trừ kho khi encounter đóng có sử dụng vật tư (event `EncounterClosed`).
4. Lễ tân/admin nhập kho khi mua thêm.
5. Cảnh báo vật tư sắp hết (low-stock badge trên dashboard).
6. Lịch sử mọi thay đổi tồn kho (audit).

## Phạm vi giả định (Assumptions)

- MVP đơn giản: chỉ đếm & trừ, **KHÔNG** quản lý lô/hạn (BD-0004 đã chốt).
- Stock-in không cần approval (chốt ở Q1).
- Low-stock alert: badge dashboard (chốt ở Q2).
- Đơn vị: tự do text (g, ml, cái, hộp, viên).
- Số lượng có thể decimal (vd: 0.5g composite).
- Auto stock-out từ `EncounterClosed` event (BR-MR-016).
- Soft-delete cho inventory item (giữ lịch sử).
- BS không nhập kho; chỉ xem khi cần (chọn vật tư trong encounter).

## Câu hỏi cần trả lời (Open Questions)

1. **Hao phí/spoilage:** Lễ tân có thể tạo stock-out thủ công với type `waste` cho vật tư hỏng? — Có.
2. **Điều chỉnh tồn kho thủ công (adjustment):** Cho admin điều chỉnh ± với reason? — Có (kiểm kê).
3. **Giá vốn (cost price):** Lưu để tính giá vốn? — MVP chỉ lưu cost cho admin, không bắt buộc.
4. **Multi-location:** Kho chính + kho phụ? — MVP chỉ 1 kho.
5. **Barcode:** Quét mã vạch? — Sau MVP.
6. **Reorder point:** Tự động đề xuất nhập khi đến ngưỡng? — Sau MVP.
7. **Minimum stock level:** Cấu hình per-item, default 0 (không cảnh báo).

## Workflow dự kiến

### Workflow 1: Tạo inventory item

```mermaid
sequenceDiagram
  participant Admin
  participant API
  participant DB

  Admin->>API: POST /inventory/items
  Note over Admin: Body: { name, sku?, categoryId, unit, minStockLevel, costPrice? }
  API->>API: Validate name unique
  API->: quantityOnHand = 0
  API->: status = active
  API->DB: Tạo InventoryItem
  API-->>Admin: 201
```

### Workflow 2: Stock-in (nhập kho)

```mermaid
sequenceDiagram
  participant LT
  participant API
  participant DB

  LT->>API: POST /inventory/items/:id/stock-in
  Note over LT: Body: { quantity, supplierName?, note?, unitPrice? }
  API->: Validate quantity > 0
  API->: BEGIN TRANSACTION
  API->DB: quantityOnHand += quantity
  API->DB: Tạo StockMovement { type: stock_in, quantity, refType: manual }
  API->: COMMIT
  API-->>LT: 200 Item + Movement
```

### Workflow 3: Auto stock-out từ encounter close (event)

```mermaid
sequenceDiagram
  participant API as MedicalRecords API
  participant EB as EventBus
  participant API2 as Inventory API
  participant DB

  Note over API: Encounter closed
  API->>EB: Emit "EncounterClosed" { inventoryUsages }

  EB->>API2: Subscribe handler
  API2->: BEGIN TRANSACTION
  API2->: Validate stock từng item (BR-MR-010)
  alt Stock không đủ
    API2->: ROLLBACK
    API2->EB: NACK (MedicalRecords sẽ rollback encounter close)
  else OK
    API2->: Tạo StockMovement[] { type: stock_out, refType: encounter, refId }
    API2->: UPDATE quantityOnHand cho từng item
    API2->: COMMIT
    API2-->>EB: ACK
  end
```

> **Quan trọng:** Validate stock xảy ra TRONG transaction của encounter close (BR-MR-018). Handler này là participant trong transaction.

### Workflow 4: Stock-out thủ công (hao phí/spoilage)

```mermaid
sequenceDiagram
  participant LT
  participant API
  participant DB

  LT->>API: POST /inventory/items/:id/stock-out
  Note over LT: Body: { quantity, reason, refType: 'waste' | 'adjustment' }
  API->: Validate quantity > 0
  API->: Validate quantity ≤ quantityOnHand
  API->: BEGIN TRANSACTION
  API2->DB: quantityOnHand -= quantity
  API2->DB: Tạo StockMovement { type: stock_out, refType: manual, reason }
  API2->: COMMIT
  API-->>LT: 200
```

### Workflow 5: Adjustment (kiểm kê)

```mermaid
sequenceDiagram
  participant Admin
  participant API
  participant DB

  Admin->>API: POST /inventory/items/:id/adjust
  Note over Admin: Body: { newQuantity, reason }
  API->: Validate newQuantity ≥ 0
  API->: BEGIN TRANSACTION
  API->: diff = newQuantity - currentQuantity
  API->DB: UPDATE quantityOnHand = newQuantity
  API->DB: Tạo StockMovement { type: adjustment, quantity = abs(diff), direction, reason }
  API->: COMMIT
  API-->>Admin: 200
```

### Workflow 6: Low-stock dashboard

```mermaid
sequenceDiagram
  participant User
  participant FE
  participant API
  participant DB

  User->>FE: Mở dashboard
  FE->: GET /inventory/low-stock
  API->: SELECT WHERE quantityOnHand < minStockLevel AND status = active
  API-->>FE: danh sách { id, name, current, min, deficit }
  FE-->>User: Hiển thị badge số lượng + danh sách
```

### Workflow 7: Lịch sử stock movement

```mermaid
sequenceDiagram
  participant Actor
  participant API
  participant DB

  Actor->>API: GET /inventory/items/:id/movements?from=...&to=...
  API->: SELECT * WHERE itemId = ? ORDER BY created_at DESC
  API-->>Actor: danh sách movements
```

## Màn hình dự kiến

| Màn hình | Mục đích | Actor |
| -------- | -------- | ----- |
| Inventory item list | Danh sách vật tư, search, filter category, low-stock | Lễ tân, Admin |
| Inventory item detail | Chi tiết + lịch sử stock movement | Lễ tân, Admin |
| Item create/edit | Tạo / sửa item | Admin |
| Stock-in modal | Nhập kho | Lễ tân, Admin |
| Stock-out modal (manual) | Hao phí, điều chỉnh | Lễ tân, Admin |
| Adjust modal | Kiểm kê (admin) | Admin |
| Category manager | CRUD category | Admin |
| Low-stock badge | Hiển thị trên dashboard | All (view) |
| Item picker (trong encounter) | Chọn vật tư khi ghi Treatment | BS |

## Entity dự kiến

| Entity | Field chính |
| ------ | ----------- |
| **InventoryItem** | id, sku (UK), name, categoryId, unit, quantityOnHand, minStockLevel, costPrice, status (active/discontinued), notes, createdAt, updatedAt, deletedAt |
| **InventoryCategory** | id, name (UK), description, parentId (optional), createdAt |
| **StockMovement** | id, itemId, type (stock_in/stock_out/adjustment), quantity (decimal, ≥ 0), direction (+/-), refType (manual/encounter/adjustment), refId (optional), reason, performedBy, performedAt, unitPriceAtMovement (snapshot), notes |

## Rule dự kiến (preview)

| Rule ID | Mô tả |
| ------- | ----- |
| BR-INV-001 | Item name unique per active status |
| BR-INV-002 | Quantity ≥ 0, không âm |
| BR-INV-003 | Stock-in/out quantity > 0 |
| BR-INV-004 | Auto stock-out từ event `EncounterClosed` (BR-MR-016) |
| BR-INV-005 | Auto stock-out atomic với encounter close (BR-MR-018) |
| BR-INV-006 | Stock-out manual phải có reason |
| BR-INV-007 | Stock-out không được vượt quantityOnHand (BR-MR-011) |
| BR-INV-008 | Adjustment phải có reason |
| BR-INV-009 | StockMovement append-only (không update/delete) |
| BR-INV-010 | Unit free text (vd: "g", "ml", "cái") |
| BR-INV-011 | Cost price ≥ 0, optional |
| BR-INV-012 | Low-stock alert: `quantityOnHand < minStockLevel` |
| BR-INV-013 | Soft-delete item: quantityOnHand giữ nguyên, không cho stock-in/out mới |
| BR-INV-014 | Discontinued item: không dùng trong encounter mới (chỉ trong read-only historical) |
| BR-INV-015 | Item name + category phải hợp lệ |
| BR-INV-016 | Category name unique per parent |
| BR-INV-017 | Self-reference category: parentId không được là chính nó (cycle check) |
| BR-INV-018 | Unit price snapshot tại thời điểm stock-in (cho tính giá vốn trung bình sau) |
| BR-INV-019 | QuantityOnHand cập nhật chỉ qua StockMovement (không sửa trực tiếp) |
| BR-INV-020 | Low-stock badge cho dashboard: `count(*) WHERE quantityOnHand < minStockLevel AND status = active` |
| BR-INV-021 | BS xem được item list (read-only) để chọn vật tư trong treatment |
| BR-INV-022 | BS không tạo/sửa item, không stock-in/out |

## API dự kiến

| Endpoint | Method | Permission |
| -------- | ------ | ---------- |
| /inventory/items | GET | `inventory.read` |
| /inventory/items | POST | `inventory.create` (admin only) |
| /inventory/items/:id | GET | `inventory.read` |
| /inventory/items/:id | PATCH | `inventory.update` (admin) |
| /inventory/items/:id | DELETE | `inventory.delete` (admin, soft) |
| /inventory/items/:id/restore | POST | `inventory.delete` (admin) |
| /inventory/items/:id/stock-in | POST | `inventory.stock_in` |
| /inventory/items/:id/stock-out | POST | `inventory.stock_out` (manual) |
| /inventory/items/:id/adjust | POST | `inventory.adjust` (admin) |
| /inventory/items/:id/movements | GET | `inventory.read` |
| /inventory/categories | GET | `inventory.read` |
| /inventory/categories | POST | `inventory.create` (admin) |
| /inventory/categories/:id | PATCH / DELETE | `inventory.update` / `.delete` |
| /inventory/low-stock | GET | `inventory.read` |

## Rủi ro & giảm thiểu

| Rủi ro | Giảm thiểu |
| ------ | ---------- |
| Race condition khi 2 BS cùng dùng vật tư | Validate stock tại server trong transaction. Có thể cần lock row (SELECT FOR UPDATE). |
| Encounter close fail vì stock không đủ | BR-INV-005: rollback encounter. |
| Item name trùng khi tạo | Validate unique + UI gợi ý. |
| Adjust sai → quantityOnHand sai | Adjust phải có reason + admin only + audit log. |
| Discontinued item còn dùng | UI không cho pick trong encounter mới. |
| Performance query low-stock | Index `(status, quantityOnHand, min_stock_level)` (partial index). |
| Stock-in vượt capacity | Không giới hạn (cho MVP). Admin tự quản lý. |

---

## Tiếp theo

Viết `SPEC.md` đầy đủ 10 mục.
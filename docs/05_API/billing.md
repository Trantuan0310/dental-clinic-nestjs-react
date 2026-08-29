# API — Billing Module

> **Module:** Billing (Invoice, Invoice Items, Payments)
> **Base:** Kế thừa toàn bộ quy ước từ [`api-conventions.md`](./api-conventions.md).
> **Ngày tạo:** 2026-07-13

---

## Base path

```
/api/v1/invoices                      — CRUD + actions
/api/v1/invoices/:id/items            — Invoice line items (read-only, tạo qua encounter close)
/api/v1/invoices/:id/payments         — Payments collection
/api/v1/invoices/:id/payments/:pid   — Payment detail + actions
/api/v1/invoices/:id/issue            — Action: draft → issued
/api/v1/invoices/:id/void             — Action: cancel invoice
/api/v1/patients/:id/invoices         — Cross-module helper
/api/v1/reports/revenue               — Báo cáo (read-only)
/api/v1/reports/outstanding           — Báo cáo (read-only)
```

---

## 1. Invoice CRUD

### 1.1 `GET /api/v1/invoices`

**Auth:** Login required
**Permission:** `invoice.read` (Receptionist + Admin + Dentist read-only)

**Query:**
| Param | Type | Default | Description |
| ----- | ---- | :-----: | ----------- |
| `q` | string | — | Search by invoice code / patient code / name |
| `status` | enum | — | `draft` \| `issued` \| `partial` \| `paid` \| `void` |
| `patientId` | uuid | — | Filter |
| `encounterId` | uuid | — | Filter |
| `from` | date | — | Issue date range start |
| `to` | date | — | Issue date range end |
| `minOutstandingCents` | int | — | Filter còn nợ > X |
| `pageSize` | int | 20 | — |
| `cursor` | string | — | Cursor pagination |
| `sort` | string | `issuedAt:desc` | — |

**Response 200:**
```json
{
  "data": [
    {
      "id": "uuid",
      "code": "INV-2026-00123",
      "patientId": "uuid",
      "patientCode": "PAT-2026-00046",
      "patientName": "Nguyen Van A",
      "encounterId": "uuid",
      "status": "partial",
      "totalAmountCents": 4500000,
      "paidAmountCents": 3000000,
      "outstandingAmountCents": 1500000,
      "currency": "VND",
      "issuedAt": "2026-07-15T10:00:00Z",
      "issuedByUserId": "uuid-receptionist",
      "dueDate": null,
      "createdAt": "2026-07-15T09:45:00Z"
    }
  ],
  "pagination": { ... }
}
```

---

### 1.2 `GET /api/v1/invoices/:id`

**Auth:** Login required
**Permission:** `invoice.read`

**Response 200:**
```json
{
  "data": {
    "id": "uuid",
    "code": "INV-2026-00123",
    "patient": { "id": "uuid", "code": "PAT-2026-00046", "fullName": "Nguyen Van A", "primaryPhone": "..." },
    "encounterId": "uuid",
    "encounterSummary": { "occurredAt": "2026-07-15T09:00:00Z", "chiefComplaint": "..." },
    "status": "partial",
    "items": [
      {
        "id": "uuid",
        "treatmentId": "uuid",
        "description": "Điều trị tủy răng 26",
        "toothNumber": 26,
        "quantity": 1,
        "unitPriceCents": 3500000,
        "lineTotalCents": 3500000
      },
      {
        "id": "uuid",
        "description": "Trám răng 16",
        "toothNumber": 16,
        "quantity": 1,
        "unitPriceCents": 1000000,
        "lineTotalCents": 1000000
      }
    ],
    "subtotalCents": 4500000,
    "discountCents": 0,
    "totalAmountCents": 4500000,
    "paidAmountCents": 3000000,
    "outstandingAmountCents": 1500000,
    "currency": "VND",
    "payments": [
      {
        "id": "uuid",
        "amountCents": 3000000,
        "method": "cash",
        "receivedByUserId": "uuid-receptionist",
        "receivedAt": "2026-07-15T10:05:00Z",
        "referenceNumber": null
      }
    ],
    "issuedAt": "2026-07-15T10:00:00Z",
    "dueDate": null,
    "voidedAt": null,
    "voidReason": null,
    "notes": null,
    "createdAt": "2026-07-15T09:45:00Z",
    "updatedAt": "2026-07-15T10:05:00Z"
  }
}
```

---

### 1.3 `POST /api/v1/invoices` (Manual / Ad-hoc)

**Auth:** Login required
**Permission:** `invoice.create` (Receptionist + Admin)

> **Br-BILL-014:** Hầu hết invoice auto-tạo qua encounter close. Endpoint này cho phép tạo ad-hoc invoice (vd bán thuốc riêng không qua encounter).

**Request:**
```json
{
  "patientId": "uuid",
  "items": [
    {
      "description": "Bán thuốc riêng",
      "quantity": 1,
      "unitPriceCents": 500000
    }
  ],
  "notes": "Bán thuốc không qua encounter"
}
```

**Side effect:**
- Generate invoice code (`INV-YYYY-NNNNN`)
- Status = `draft`
- Audit `invoice_created`

**Response 201:** invoice object

---

### 1.4 `POST /api/v1/invoices/from-encounter/:encounterId`

**Auth:** Login required
**Permission:** `invoice.create`

> Thường được auto-tạo qua event `EncounterClosed`. Endpoint này cho phép tạo manually cho encounter cũ chưa có invoice (reconciliation).

**Request:** empty

**Side effect:**
- Kéo tất cả treatment lines từ encounter (chưa invoiced)
- Tạo invoice draft
- Audit

**Response 201:** invoice object

**Response 409:** "Encounter already has invoice"

---

### 1.5 `POST /api/v1/invoices/:id/issue`

**Auth:** Login required
**Permission:** `invoice.issue` (Receptionist + Admin)

**Request:**
```json
{
  "note": "Gửi cho bệnh nhân review"
}
```

**Side effect:**
- Status: `draft` → `issued`
- Set `issuedAt = now()`, `issuedByUserId`
- Generate `dueDate` (default = issued + 30 ngày, configurable ở Clinic Settings — out of MVP)

**Audit:** `invoice_issued`

**Response 200:** invoice object

**Response 422:** "Invoice has no items"

---

### 1.6 `PATCH /api/v1/invoices/:id`

**Auth:** Login required
**Permission:** `invoice.update` (Receptionist + Admin — chỉ `issued` status)

**Request (subset):**
```json
{
  "dueDate": "2026-08-15",
  "notes": "Bệnh nhân xin gia hạn thanh toán"
}
```

> **Lưu ý:**
> - Items KHÔNG sửa sau issue (để audit nguyên vẹn). Nếu sai → void + tạo lại invoice mới.
> - `discountCents` chỉ Admin.

**Response 200:** invoice object

**Response 409:**
- "Cannot modify items of issued invoice"

---

### 1.7 `POST /api/v1/invoices/:id/void`

**Auth:** Login required
**Permission:** `invoice.void` (Admin only — Receptionist tạo issue mới)

**Request:**
```json
{
  "reason": "Sai giá - in lại invoice mới",
  "adminPassword": "..." // lý do pháp lý — re-auth admin
}
```

**Side effect:**
- Status: bất kỳ → `void`
- Set `voidedAt`, `voidReason`, `voidedByUserId`
- KHÔNG refund payments đã nhận (cần xử lý riêng — ngoài MVP)

**Audit:** `invoice_voided`

**Response 200:** invoice object

**Response 422:** "Cannot void paid invoice with non-reversed payments" (BR-BILL-011)

---

## 2. Payments

### 2.1 `GET /api/v1/invoices/:id/payments`

**Auth:** Login required
**Permission:** `payment.read`

**Response 200:**
```json
{
  "data": [
    {
      "id": "uuid",
      "invoiceId": "uuid",
      "amountCents": 1500000,
      "method": "cash",
      "currency": "VND",
      "receivedAt": "2026-07-15T10:05:00Z",
      "receivedByUserId": "uuid",
      "receivedByName": "Lễ tân Nguyễn V",
      "referenceNumber": null,
      "note": "Đợt 1"
    }
  ],
  "pagination": { ... }
}
```

---

### 2.2 `POST /api/v1/invoices/:id/payments`

**Auth:** Login required
**Permission:** `payment.create` (Receptionist + Admin)

**Rate limit:** 30 req/phút
**Idempotency:** Required (xem conventions §5.2 — refund tránh trừ tiền 2 lần)

**Request:**
```json
{
  "amountCents": 1500000,
  "method": "cash",
  "paidAt": "2026-07-15T10:05:00Z",
  "referenceNumber": "TXN-202607151005",
  "note": "Đợt 1"
}
```

**Validation:**
- Invoice phải ∈ {`issued`, `partial`}
- `amountCents` ≤ `outstandingAmountCents`
- `paidAt` ≤ now
- `method`: enum `cash` \| `bank_transfer` \| `card` \| `e_wallet`

**Side effect (ATOMIC):**
1. Insert payment row
2. Recalculate invoice:
   - `paidAmountCents += amountCents`
   - If `paidAmountCents == totalAmountCents` → status `paid`
   - If `0 < paidAmountCents < totalAmountCents` → status `partial`
3. Audit `payment_received`

**Response 201:** payment object

**Response 422:**
- "Payment exceeds outstanding amount"
- "Cannot pay voided invoice"

---

### 2.3 `POST /api/v1/payments/:id/reverse` (Admin only)

**Auth:** Login required
**Permission:** `payment.reverse` (Admin only)

**Idempotency:** Required

**Request:**
```json
{
  "reason": "Bệnh nhân trả lại tiền",
  "adminPassword": "..."
}
```

**Side effect:**
- Soft-delete payment
- Recalculate invoice status
  - If was `paid` → `issued` (or `partial` nếu còn nợ)
- Audit `payment_reversed`

**Atomic:** toàn bộ trong 1 transaction với invoice update.

**Response 200:** payment object (status = reversed)

---

## 3. Cross-module helpers

### 3.1 `GET /api/v1/patients/:id/invoices`

**Auth:** Login required
**Permission:** `invoice.read` + (Receptionist/Admin OR Dentist read-only)

**Query:** tương tự 1.1

**Response 200:** tương tự 1.1

---

### 3.2 `GET /api/v1/encounters/:id/invoice`

**Auth:** Login required
**Permission:** `invoice.read`

**Response 200:**
```json
{
  "data": {
    "id": "uuid",
    "code": "INV-2026-00123",
    "status": "draft",
    "totalAmountCents": 4500000
  }
}
```

Hoặc 404 nếu encounter không có invoice.

---

## 4. Reports

### 4.1 `GET /api/v1/reports/revenue`

**Auth:** Login required
**Permission:** `report.revenue.read` (Admin only)

**Query:**
- `from` (date, required)
- `to` (date, required)
- `groupBy` (enum: `day` \| `week` \| `month`, default `day`)
- `paymentMethod` (optional)

**Response 200:**
```json
{
  "data": {
    "dateRange": { "from": "2026-07-01", "to": "2026-07-31" },
    "byGroup": [
      {
        "period": "2026-07-15",
        "totalInvoicedCents": 45000000,
        "totalCollectedCents": 32000000,
        "totalOutstandingCents": 13000000,
        "invoiceCount": 12,
        "paymentCount": 8
      }
    ],
    "summary": {
      "totalInvoicedCents": 450000000,
      "totalCollectedCents": 320000000,
      "outstandingCents": 130000000
    }
  }
}
```

---

### 4.2 `GET /api/v1/reports/outstanding`

**Auth:** Login required
**Permission:** `report.outstanding.read` (Admin only)

**Query:**
- `asOf` (date, default today)
- `minAmountCents` (optional)
- `sortBy` (enum: `amount` \| `days`, default `days`)

**Response 200:**
```json
{
  "data": [
    {
      "invoiceId": "uuid",
      "invoiceCode": "INV-2026-00123",
      "patientCode": "PAT-2026-00046",
      "patientName": "Nguyen Van A",
      "patientPhone": "0987654321",
      "outstandingAmountCents": 1500000,
      "daysOutstanding": 15,
      "issuedAt": "2026-07-15"
    }
  ],
  "pagination": { ... }
}
```

---

## 5. Validation rules (Billing-specific)

| Field | Rule |
| ----- | ---- |
| `amountCents` | integer ≥ 0, ≤ `outstandingAmountCents` |
| `paidAt` | ISO 8601 UTC, ≤ now |
| `method` | enum 4 value |
| `referenceNumber` | string 1-100 (cho bank_transfer, e_wallet) |
| `dueDate` | date ≥ today |
| `unitPriceCents` | integer ≥ 0 |
| `discountCents` | integer ≥ 0 (Admin only) |

---

## 6. Error responses (Billing-specific)

| Status | Title | Khi nào |
| :----: | ----- | ------- |
| 409 | Invoice already has payments | (không cho xóa, chỉ void) |
| 409 | Cannot modify items of issued invoice | BR-BILL-005 |
| 409 | Cannot void paid invoice without payment reversal | BR-BILL-011 |
| 422 | Payment exceeds outstanding amount | BR-BILL-008 |
| 422 | Cannot pay voided invoice | — |
| 422 | Invoice has no items | BR-BILL-002 |
| 422 | Reason required for void | — |

---

## 7. Cross-module events

| Event | Publisher | Subscriber | Action |
| ----- | --------- | ---------- | ------ |
| `EncounterClosed` | MedicalRecords | Billing | Auto-tạo invoice draft. BR-BILL-001 + SPEC §2.1 (đã chuẩn theo ADR-0008) |
| `PaymentReceived` | Billing | (logging) | Audit + state update |
| `InvoicePaid` | Billing | (logging) | Audit |

> **Atomic (ADR-0008):** Encounter close → invoice draft cùng transaction.

---

## 8. Idempotency

| Endpoint | Required |
| -------- | :------: |
| `POST /invoices` | ✅ |
| `POST /invoices/from-encounter/:encId` | ✅ |
| `POST /invoices/:id/issue` | Optional |
| `POST /invoices/:id/void` | ✅ |
| `POST /invoices/:id/payments` | ✅ ✅ (Critical) |
| `POST /payments/:id/reverse` | ✅ |

---

## 9. Audit log mapping

| Action | Trigger |
| ------ | ------- |
| `invoice_created` | POST /invoices, POST /invoices/from-encounter |
| `invoice_updated` | PATCH /invoices/:id |
| `invoice_issued` | POST /invoices/:id/issue |
| `invoice_voided` | POST /invoices/:id/void |
| `payment_received` | POST /invoices/:id/payments |
| `payment_reversed` | POST /payments/:id/reverse |

---

## Related

- [api-conventions.md](./api-conventions.md)
- [SPEC Billing](../03_Specification/Billing/SPEC.md)
- [BD-0003: Pay after service](../01_Architecture/business-decisions.md#bd-0003)
- [ADR-0008: Transactional events](../ADR/0008-transactional-encounter-close.md)
- [Schema Billing](../04_Database/schema-per-module/billing.md)
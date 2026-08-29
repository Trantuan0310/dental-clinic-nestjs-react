# Test Cases — Billing Module

> **Module:** Billing (invoices, payments, reports)
> **Priority:** P0 — R2-9 guarded update quan trọng, payment.
> **Test file:** `backend/src/billing/billing.service.spec.ts`

---

## 1. Purpose

Cover invoice creation from encounters, payment recording, discount updates, issuing, voiding, and reports. Special focus on **R2-9** optimistic locking for guarded updates.

## 2. Endpoints covered (20 endpoints)

| Endpoint | Method | Permission |
|---|---|---|
| `/api/v1/invoices` | GET | `invoice.read` |
| `/api/v1/invoices/:id` | GET | `invoice.read` |
| `/api/v1/invoices/from-encounter` | POST | `invoice.create` |
| `/api/v1/invoices/:id/issue` | POST | `invoice.issue` |
| `/api/v1/invoices/:id/discount` | PATCH | `invoice.discount` |
| `/api/v1/invoices/:id/notes` | PATCH | `invoice.update` |
| `/api/v1/invoices/:id/void` | POST | `invoice.void` |
| `/api/v1/invoices/:id/payments` | POST | `payment.create` |
| `/api/v1/invoices/:id/payments` | GET | `payment.read` |
| `/api/v1/invoices/:id/audits` | GET | `invoice.read` |
| `/api/v1/encounters/:id/invoice` | GET | `invoice.read` |
| `/api/v1/reports/revenue` | GET | `report.read` |
| `/api/v1/reports/outstanding` | GET | `report.read` |
| `/api/v1/reports/kpis` | GET | `report.read` |
| `/api/v1/reports/by-day` | GET | `report.read` |
| `/api/v1/reports/by-month` | GET | `report.read` |
| `/api/v1/reports/by-procedure` | GET | `report.read` |
| `/api/v1/reports/by-dentist` | GET | `report.read` |
| `/api/v1/reports/finance-summary` | GET | `report.read` |
| `/api/v1/reports/appointments-by-day` | GET | `report.read` |

## 3. Test cases

### TC-BILL-001 — createFromEncounter — Aggregates treatments + prescriptions

- **Verify:** `invoiceItem.create` per treatment; `total = sum(items)`.

### TC-BILL-002 — issue — DRAFT → ISSUED transition

- **Setup:** invoice with `status: 'DRAFT'`, `version: 0`.
- **Input:** `{ version: 0 }`.
- **Expected:** `update({ status: 'ISSUED' })`; `version` incremented.

### TC-BILL-003 — issue — Rejects when invoice is already ISSUED

- **Setup:** invoice with `status: 'ISSUED'`.
- **Expected:** `InvoiceNotEditableException`.

### TC-BILL-004 — issue — Version mismatch (R2-9)

- **Setup:** invoice `version: 1` in DB, DTO `version: 0`.
- **Expected:** `InvoiceVersionMismatchException`.

### TC-BILL-005 — recordPayment — R2-9 guarded update (no over-pay)

- **Setup:** invoice `outstandingAmount: 100`.
- **Input:** `amount: 200`.
- **Verify:** `updateMany({ where: { id, outstandingAmount: { gte: 200 } } })` returns `{ count: 0 }`.
- **Expected:** throws `PaymentExceedsOutstandingException`.

### TC-BILL-006 — recordPayment — R2-9 guarded update success

- **Setup:** invoice `outstandingAmount: 100`.
- **Input:** `amount: 50`.
- **Verify:** `updateMany` returns `{ count: 1 }`, payment created, `outstandingAmount` = 50.

### TC-BILL-007 — updateDiscount — R2-9 guarded update (no over-discount)

- **Setup:** invoice `subtotal: 100`, no existing discount.
- **Input:** `discountValue: 150`.
- **Expected:** throws `DiscountExceedsSubtotalException`.

### TC-BILL-008 — voidInvoice — Requires reason, soft delete

- **Verify:** `update({ status: 'VOID', voidedAt: now, voidedReason })`, audit `INVOICE_VOIDED`.

### TC-BILL-009 — reports — Date range filter

- **Verify:** `where.createdAt.gte / lte` applied.

### TC-BILL-010 — reports — Group by dentist aggregates correctly

- **Verify:** sum of invoices per dentist matches expected total.

### TC-BILL-011 — paymentsList — Cursor pagination

- **Verify:** `take: limit + 1`, `nextCursor` if more pages.
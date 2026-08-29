# [PAY-007] Admin PeriodDetail dùng sai endpoint — cần admin-side line-item breakdown

## Priority
🔴 P0 — Blocking

## Status
Open

## Owner
Backend

## Estimated Effort
45–60 phút

## Created
2026-07-18

---

## Context

- **Frontend file vi phạm:** `frontend/src/features/payroll/PeriodDetailPage.tsx` (dòng **75–82**)

Khi admin (role `ADMIN` hoặc `OWNER`) mở drawer "Xem breakdown" của một payroll line item trong `PeriodDetailPage`, frontend hiện đang gọi:

```
GET /api/v1/payroll/me/payslip/:periodId
```

Endpoint này có **2 hạn chế nghiêm trọng** đối với use case admin:

1. **Ownership filter:** Handler lọc theo `dentistId === req.user.id` — tức là chỉ trả về payslip của **chính user đang login**. Admin là tài khoản hệ thống, không phải bác sĩ điều trị, nên luôn nhận `403 Forbidden` hoặc `404 Not Found`.
2. **Status filter:** Chỉ trả về khi period ở trạng thái `APPROVED+` (tức `APPROVED`, `PAID`, `LOCKED`). Admin cần audit/xem **mọi status** (`DRAFT`, `REVIEWING`, ...) để chẩn đoán lỗi hoặc duyệt.

Hậu quả UX: drawer breakdown **rỗng**, admin không thể xem chi tiết cấu thành lương của bất kỳ dentist nào → chặn luồng payroll review.

## Proposed Solution

### Endpoint mới

```
GET /api/v1/payroll/periods/:periodId/line-items/:lineItemId/breakdown
```

### Response shape (đề xuất, cần cross-check với frontend `usePayrollBreakdown()` hiện có)

```typescript
{
  lineItem: PayrollLineItem,
  dentistCompensation: DentistCompensation | null,
  adjustments: PayrollAdjustment[],
  timeRange: {
    startIso: string,   // ISO 8601
    endIso: string
  },
  encounters: EncounterSummary[],   // list encounter IDs (+ minimal info) contributed revenue
  computedAt: string,               // ISO timestamp when line item was calculated
  calculationNotes?: string[]       // optional: human-readable notes (e.g. "manual override applied")
}
```

### Implementation outline

1. **DTO + types**
   - Trong `backend/src/payroll/dto/`, tạo `LineItemBreakdownResponseDto` (mapping 1-1 với shape trên).
   - Import các type Prisma hiện có, không tạo entity mới.

2. **Controller** (`backend/src/payroll/payroll.controller.ts`)
   ```typescript
   @Get('periods/:periodId/line-items/:lineItemId/breakdown')
   @Permissions('payroll.read.any')     // từ matrix §3.9
   @UseGuards(JwtAuthGuard, PermissionsGuard)
   async getLineItemBreakdown(
     @Param('periodId') periodId: string,
     @Param('lineItemId') lineItemId: string,
   ) { return this.payrollService.getLineItemBreakdown(periodId, lineItemId); }
   ```

3. **Service** (`backend/src/payroll/payroll.service.ts`)
   - Không filter theo `dentistId` ownership (admin xem bất kỳ ai).
   - Không filter theo `period.status` (mọi status đều xem được).
   - Query line item → include `dentistCompensation` (1-1) → include `adjustments` (1-n) → include `encounters` (m-n via `EncounterContribution` table nếu có, hoặc `treatmentSession` join).
   - Tính `timeRange` từ period (`period.startDate`, `period.endDate`).
   - Trả về `computedAt` từ `lineItem.calculatedAt`.

4. **Permission guard**
   - `@Permissions('payroll.read.any')` (đã có trong matrix `docs/05_API/permissions.md` §3.9).
   - Verify dentist role **không** có permission này → test 403.

### Tests

- **Unit (Jest spec):** `payroll.service.spec.ts` — 1 test cho `getLineItemBreakdown()`:
  - Given admin request line item của dentist X trong period status `DRAFT` → trả về payload đầy đủ (không throw).
- **E2E (Supertest):** 1 test cho permission guard:
  - Admin token → `200 OK`
  - Dentist token → `403 Forbidden`

## Acceptance Criteria

- [ ] DTO `LineItemBreakdownResponseDto` định nghĩa trong `backend/src/payroll/dto/`.
- [ ] Controller method mới trong `payroll.controller.ts` mapped đúng route `:periodId/line-items/:lineItemId/breakdown`.
- [ ] Service method `getLineItemBreakdown()` không filter ownership, không filter period status.
- [ ] Response include đầy đủ: `lineItem`, `dentistCompensation`, `adjustments`, `timeRange`, `encounters`, `computedAt`.
- [ ] Permission guard `@Permissions('payroll.read.any')` (matrix §3.9).
- [ ] Cross-check response shape với hook frontend `usePayrollBreakdown()` hiện có — nếu frontend đang expect field nào khác, sync trước khi release.
- [ ] 1 unit test (Jest) cho service.
- [ ] 1 e2e test (Supertest) cho permission guard (admin OK, dentist 403).

## Dependencies

- **PAY-006** — frontend form config cần hoạt động đúng để admin sửa `defaultTaxTncnPct`, sau đó mới audit breakdown.
- **PAY-012** — nếu line item không tồn tại, error code `PAYROLL_LINE_ITEM_NOT_FOUND` cần map trong filter.

## Related Files

- `frontend/src/features/payroll/PeriodDetailPage.tsx:75-82` (endpoint sai)
- `frontend/src/features/payroll/hooks/usePayrollBreakdown.ts` (nếu có)
- `backend/src/payroll/payroll.controller.ts`
- `backend/src/payroll/payroll.service.ts`
- `backend/src/payroll/payroll.service.spec.ts`
- `backend/test/payroll.e2e-spec.ts`
- `docs/05_API/permissions.md` (§3.9)

## Related Specs

- `docs/03_Specification/Payroll/SPEC.md` (§6 — Period detail & breakdown)
- `docs/03_Specification/Permissions/SPEC.md` (§3.9 — Permission matrix)

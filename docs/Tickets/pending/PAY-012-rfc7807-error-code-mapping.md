# [PAY-012] Payroll + Shift modules thiếu error code discriminator trong RFC 7807 responses

## Priority
🟡 P2 — UX enhancement

## Status
Open

## Owner
Backend

## Estimated Effort
2–3 giờ (có thể chia incremental theo từng module)

## Created
2026-07-18

---

## Context

- **Frontend files bị ảnh hưởng:**
  - `frontend/src/features/payroll/PeriodListPage.tsx`
  - `frontend/src/features/shift/RegisterShiftPage.tsx`
  - `frontend/src/features/payroll/CompensationEditorPage.tsx`
  - `frontend/src/features/payroll/PeriodDetailPage.tsx`

- **SPEC UI §13** yêu cầu mỗi lỗi vi phạm business rule phải có message chuyên biệt, thân thiện, bằng tiếng Việt (hoặc song ngữ), hiển thị inline ở field hoặc toast.

Hiện trạng:
- Backend đã trả về RFC 7807 (`application/problem+json`) shape đúng chuẩn (`type`, `title`, `status`, `detail`, `instance`).
- **Thiếu** extension field `code` — một discriminator ngắn, ổn định, snake_case SCREAMING để frontend có thể `switch (err.code)` render UI phù hợp.
- Frontend hiện chỉ show `err.message` raw → lộ message tiếng Anh / server stack → UX chưa tốt.

## Proposed Solution

### Bước 1 — Review filter hiện tại

Mở `backend/src/common/filters/http-exception.filter.ts`. Xác định:
- Có đang override response shape không, hay để Nest mặc định?
- Nếu có override, thêm 1 field `code` ở top-level (giữ nguyên mọi field RFC 7807 khác).

### Bước 2 — Định nghĩa enum error code

Tạo (hoặc mở rộng) file `backend/src/common/errors/codes.ts`:

```typescript
export enum PayrollErrorCode {
  PAYROLL_PERIOD_OVERLAP = 'PAYROLL_PERIOD_OVERLAP',
  PAYROLL_COMPENSATION_OVERLAP = 'PAYROLL_COMPENSATION_OVERLAP',
  PAYROLL_PERIOD_NOT_EDITABLE = 'PAYROLL_PERIOD_NOT_EDITABLE',
  PAYROLL_MANUAL_OVERRIDE_REASON_TOO_SHORT = 'PAYROLL_MANUAL_OVERRIDE_REASON_TOO_SHORT',
  PAYROLL_PERIOD_LOCKED = 'PAYROLL_PERIOD_LOCKED',
  // Mở rộng thêm nếu cần
}

export enum ShiftErrorCode {
  SHIFT_CONFLICT_WITH_WORKING_SCHEDULE = 'SHIFT_CONFLICT_WITH_WORKING_SCHEDULE',
  SHIFT_CANCEL_TOO_LATE = 'SHIFT_CANCEL_TOO_LATE',
  SHIFT_OUTSIDE_REGISTRATION_WINDOW = 'SHIFT_OUTSIDE_REGISTRATION_WINDOW',
}
```

### Bước 3 — Update custom exceptions

Trong `backend/src/payroll/exceptions/` và `backend/src/shift/exceptions/`, mỗi custom exception (ví dụ `PeriodOverlapException`) thêm 1 field `code`:

```typescript
export class PeriodOverlapException extends HttpException {
  constructor(detail: string) {
    super(
      {
        type: 'https://dental-clinic.example/errors/payroll/period-overlap',
        title: 'Period overlap',
        status: HttpStatus.CONFLICT,
        detail,
        code: PayrollErrorCode.PAYROLL_PERIOD_OVERLAP,   // ← mới
      },
      HttpStatus.CONFLICT,
    );
  }
}
```

### Bước 4 — Update filter

Filter phải surface `code` ra top-level response (kể cả khi exception raise không phải custom — fallback `code = `${module}_UNKNOWN_ERROR`).

```typescript
// http-exception.filter.ts (sketch)
const body = exception.getResponse();
const code = body?.code ?? defaultCodeForModule(module);

response.status(status).json({
  type: body?.type ?? 'about:blank',
  title: body?.title ?? exception.message,
  status,
  detail: body?.detail ?? exception.message,
  instance: request.url,
  code,   // ← RFC 7807 extension, hợp lệ spec
});
```

### Bước 5 — Document

Tạo mới (nếu chưa có) `docs/05_API/error-codes.md` chứa bảng:

| Code | HTTP Status | Title | Module | Mô tả tiếng Việt |
|------|-------------|-------|--------|--------------------|
| `PAYROLL_PERIOD_OVERLAP` | 409 | Period overlap | payroll | Chu kỳ payroll mới bị trùng ngày với chu kỳ đã có. |
| `SHIFT_CONFLICT_WITH_WORKING_SCHEDULE` | 409 | Shift conflict | shift | Ca đăng ký trùng với lịch cố định. |
| ... | ... | ... | ... | ... |

### Bước 6 — Test

- 1 Jest spec cho `http-exception.filter.ts`:
  - Mock exception raise `PeriodOverlapException` → assert response body có field `code === 'PAYROLL_PERIOD_OVERLAP'`.
  - Mock exception generic (BadRequest) → assert fallback code xuất hiện.

## Acceptance Criteria

- [ ] Review `backend/src/common/filters/http-exception.filter.ts` và document cách shape hiện tại.
- [ ] Định nghĩa enum `PayrollErrorCode` và `ShiftErrorCode` trong `backend/src/common/errors/codes.ts` với ít nhất 8 code theo danh sách spec.
- [ ] Update mỗi custom exception mang theo `code` tương ứng (`PeriodOverlapException`, `CompensationOverlapException`, v.v.).
- [ ] Filter thêm `code` vào response body (RFC 7807 extension) — verify vẫn giữ các field chuẩn (`type`, `title`, `status`, `detail`, `instance`).
- [ ] Tạo `docs/05_API/error-codes.md` (nếu chưa có) liệt kê tất cả code + HTTP status + mô tả tiếng Việt.
- [ ] 1 Jest spec cho filter verify code xuất hiện đúng trong response body.

## Dependencies

- **PAY-006, PAY-007, PAY-011** — các ticket này validate field / resource; nếu backend raise lỗi (400, 403, 404, 409), error code discriminator phải có sẵn để frontend react chuẩn.

## Related Files

- `backend/src/common/filters/http-exception.filter.ts`
- `backend/src/common/errors/codes.ts` (mới hoặc mở rộng)
- `backend/src/payroll/exceptions/*.exception.ts`
- `backend/src/shift/exceptions/*.exception.ts`
- `docs/05_API/error-codes.md` (mới)
- `frontend/src/features/payroll/PeriodListPage.tsx`
- `frontend/src/features/shift/RegisterShiftPage.tsx`
- `frontend/src/features/payroll/CompensationEditorPage.tsx`
- `frontend/src/features/payroll/PeriodDetailPage.tsx`

## Related Specs

- `docs/03_Specification/UI/SPEC.md` (§13 — Error handling & UX messages)
- `docs/05_API/error-codes.md`
- RFC 7807 — Problem Details for HTTP APIs

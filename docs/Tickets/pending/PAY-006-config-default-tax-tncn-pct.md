# [PAY-006] PayrollConfigPage thiếu field `defaultTaxTncnPct`

## Priority
🔴 P0 — Blocking

## Status
Open

## Owner
Backend

## Estimated Effort
15 phút

## Created
2026-07-18

---

## Context

- **Frontend file vi phạm:** `frontend/src/features/payroll/PayrollConfigPage.tsx`
- **Frontend type:** `frontend/src/types/payroll.ts`
- **Backend spec tham chiếu:** `docs/03_Specification/Payroll/SPEC.md` §8.1

Theo SPEC §8.1, body của request `PUT /payroll/config` phải chứa field `defaultTaxTncnPct: 0.10` (tax rate TNCN mặc định áp dụng khi admin chưa override theo dentist). Form hiện tại ở `PayrollConfigPage.tsx` không render input nào cho field này. Cùng lúc đó, type `UpdatePayrollConfigPayload` trong `frontend/src/types/payroll.ts` cũng không khai báo property tương ứng.

Hậu quả:
- Nếu backend bắt buộc field → request submit từ UI sẽ fail validation (400).
- Nếu backend chấp nhận optional → giá trị mặc định 10% bị nullify mỗi lần lưu (admin lỡ tay save lại là rate biến mất).
- Dù scenario nào, hành vi hiện tại không nhất quán với SPEC và sinh bug khi admin refresh form.

## Proposed Solution

### Backend verification steps

1. Mở `backend/src/payroll/dto/` và xác định class `UpdatePayrollConfigDto` (hoặc tương đương). Xác nhận:
   - Field `defaultTaxTncnPct` có khai báo `@IsOptional()` hay `@IsNumber()` required?
   - Validator nào được dùng (`class-validator`)?
2. Đọc handler trong `backend/src/payroll/payroll.controller.ts` cho route `PUT /api/v1/payroll/config`:
   - Có dùng `PartialType` (chấp nhận partial) hay `@Body() full: UpdatePayrollConfigDto` (bắt buộc đầy đủ)?
3. Mở `backend/prisma/schema.prisma`, tìm model `PayrollConfig` và confirm column `defaultTaxTncnPct` tồn tại với `@default(0.10)`.

### Documentation kết quả

Tạo ghi chú ngắn trong `docs/03_Specification/Payroll/SPEC.md` (hoặc comment inline trong DTO) ghi rõ:

- Endpoint có chấp nhận **partial update** không?
- Nếu có: liệt kê các field optional (`defaultTaxTncnPct`, `payrollCycleDay`, ...)
- Nếu không: ghi rõ "full body required", ping frontend thêm field vào form + type

### Frontend follow-up (chỉ báo cáo, không sửa trong ticket này)

Sau khi backend confirm contract:
- Nếu full body: front-end cần thêm `<InputNumber name="defaultTaxTncnPct">` + cập nhật `UpdatePayrollConfigPayload`.
- Nếu partial: chỉ cần preload giá trị hiện tại để admin thấy trước khi save.

## Acceptance Criteria

- [ ] Verify `backend/src/payroll/dto/` và document hành vi `UpdatePayrollConfigDto` đối với `defaultTaxTncnPct`.
- [ ] Document endpoint `PUT /api/v1/payroll/config` có chấp nhận **partial update** hay bắt buộc **full body** (và tham chiếu SPEC §8.1).
- [ ] Nếu backend bắt buộc full body → báo lại để frontend team thêm field vào `PayrollConfigPage.tsx` + type `UpdatePayrollConfigPayload`.
- [ ] Nếu partial OK → document rõ các field optional trong DTO comment.
- [ ] Cross-check với `PayrollConfig.defaultTaxTncnPct` trong `backend/prisma/schema.prisma` (default value, nullable, scale/precision).
- [ ] Cập nhật 1 dòng vào `docs/03_Specification/Payroll/SPEC.md` §8.1 mô tả contract mới (nếu cần).

## Dependencies

- **PAY-012** (error code mapping) — nếu backend trả 400 do thiếu field, error response cần có `code` discriminator rõ ràng để frontend biết phản hồi.

## Related Files

- `frontend/src/features/payroll/PayrollConfigPage.tsx`
- `frontend/src/types/payroll.ts`
- `backend/src/payroll/dto/update-payroll-config.dto.ts` (hoặc tên tương đương)
- `backend/src/payroll/payroll.controller.ts`
- `backend/prisma/schema.prisma`
- `docs/03_Specification/Payroll/SPEC.md` (§8.1)

## Related Specs

- `docs/03_Specification/Payroll/SPEC.md` §8.1 — Payroll config
- `docs/05_API/permissions.md` (§3.9 — Permission matrix)

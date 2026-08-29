# Tickets Index

Tổng hợp tất cả các ticket đang mở. Mỗi ticket được track trong `pending/` (chưa bắt đầu) hoặc `in-progress/` / `done/` (cập nhật khi có owner nhận).

Last updated: 2026-07-18

---

## Pending

| ID | Priority | Title | Owner | Estimate | Status |
|----|----------|-------|-------|----------|--------|
| [PAY-006](./pending/PAY-006-config-default-tax-tncn-pct.md) | 🔴 P0 | PayrollConfigPage thiếu field `defaultTaxTncnPct` (verify backend DTO contract) | Backend | 15 min | Open |
| [PAY-007](./pending/PAY-007-admin-line-item-breakdown-endpoint.md) | 🔴 P0 | Admin PeriodDetail dùng sai endpoint `payslip/me/...` — tạo admin-side line-item breakdown | Backend | 45–60 min | Open |
| [PAY-011](./pending/PAY-011-me-working-schedules-endpoint.md) | 🟡 P2 | RegisterShiftPage thiếu working schedule preview — endpoint cho user hiện tại | Backend | 10–30 min | Open |
| [PAY-012](./pending/PAY-012-rfc7807-error-code-mapping.md) | 🟡 P2 | Payroll + Shift modules thiếu error code discriminator trong RFC 7807 responses | Backend | 2–3 h | Open |

---

## Conventions

- **ID prefix:** `PAY-*` cho nhóm Payroll/Shift; mở rộng prefix khác (BIL-* billing, APT-* appointment, ...) khi có ticket mới.
- **Priority:** 🔴 P0 blocking → 🟠 P1 important → 🟡 P2 nice-to-have → 🟢 P3 backlog.
- **Owner:** Backend / Frontend / Fullstack / DevOps / QA.
- **File naming:** `<ID>-kebab-case-title.md`, đặt trong `pending/` (hoặc folder tương ứng trạng thái).

## Lifecycle

```
pending/  →  in-progress/  →  done/
            (khi owner nhận)   (khi merged + verified)
```

Khi chuyển trạng thái, move file giữa các folder và cập nhật cột `Status` ở bảng trên.

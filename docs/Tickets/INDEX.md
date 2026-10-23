# Tickets Index

Tổng hợp tất cả các ticket đang mở. Mỗi ticket được track trong `pending/` (chưa bắt đầu) hoặc `in-progress/` / `done/` (cập nhật khi có owner nhận).

Last updated: 2026-10-22

---

## Pending

Không còn ticket mở.

## Done

| ID | Title | Đóng |
|----|-------|------|
| [PAY-006](./done/PAY-006-config-default-tax-tncn-pct.md) | PayrollConfigPage thiếu field `defaultTaxTncnPct` | 22/10/2026 — đã có |
| [PAY-007](./done/PAY-007-admin-line-item-breakdown-endpoint.md) | Admin PeriodDetail dùng sai endpoint | 22/10/2026 — đã có |
| [PAY-011](./done/PAY-011-me-working-schedules-endpoint.md) | RegisterShiftPage thiếu working schedule preview | 22/10/2026 — không còn áp dụng |
| [PAY-012](./done/PAY-012-rfc7807-error-code-mapping.md) | Payroll + Shift thiếu error code | 22/10/2026 — đã có |


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

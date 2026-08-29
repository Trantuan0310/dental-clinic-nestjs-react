# UI Spec — Payroll & Shift Management (Phase 9)

> **Ngày tạo:** 2026-07-15
> **Phase:** 9
> **Tham khảo:** `../../03_Specification/Payroll/SPEC.md` §4 (Screens), BD-0009, BD-0010.
>
> Màn hình theo role:
> - **Admin**: cấu hình, setup compensation, tạo/tính/duyệt kỳ lương, duyệt ShiftRegistration
> - **Receptionist**: duyệt ShiftRegistration (không có quyền payroll)
> - **Dentist**: đăng ký ca tự do, xem lương của mình

---

## 1. Admin — Payroll Config

### Route: `/admin/payroll/config`

| Element | Type | Required Permission | Notes |
| ------- | ---- | ------------------- | ----- |
| Page header | `<H1>` Cấu hình Payroll | `payroll.config.read` | |
| Form sections | `<Card>` × 4: Cycle, Overtime, Tax, BHXH | | |
| Cycle dropdown | `<Select>` (WEEKLY/BIWEEKLY/MONTHLY) | | Default MONTHLY |
| Overtime multiplier | `<NumberInput>` step 0.1 min 1.0 max 3.0 | | Default 1.5 |
| Personal deduction | `<NumberInput>` VND | | Default 11,000,000 |
| Tax brackets editor | `<Table>` rows × 5 (Bậc 1-5) | | Edit rate + threshold |
| BHXH/BHYT/BHTN % | `<NumberInput>` 3 fields | | Default 8/1.5/1 |
| Min gross for BHXH | `<NumberInput>` VND | | Default 4,680,000 (lương tối thiểu vùng) |
| Probation salary % | `<NumberInput>` 0-100 | | Default 85% |
| Save button | `<Button variant=primary>` | `payroll.config.update` | Show toast "Đã lưu" |
| Audit log link | `<Link>` "Lịch sử thay đổi" | `system.audit.read` | Navigate to filter `entity=PAYROLL_CONFIG` |

### Edge cases

- Confirm dialog khi thay đổi cycle (đang có period DRAFT → cảnh báo).
- Snapshot warning: "Thay đổi tax rate không ảnh hưởng period đã khởi tạo."

---

## 2. Admin — Compensation List

### Route: `/admin/payroll/compensations`

| Element | Type | Required Permission | Notes |
| ------- | ---- | ------------------- | ----- |
| Filter bar | `<FilterBar>` dentist (dropdown) | | |
| DataTable | Server-side | | Columns: BS, Base salary, Commission %, Effective from, Effective to, Actions |
| Add new | `<Button>+ Thêm chính sách</Button>` | `payroll.compensation.update` | |
| Row click | Navigate to `/admin/payroll/compensations/:dentistId` (history) | | |

---

## 3. Admin — Compensation Editor

### Route: `/admin/payroll/compensations/:dentistId`

Hiển thị **timeline** các version (effective dating).

| Element | Type | Notes |
| ------- | ---- | ----- |
| Dentist card | `<Avatar>` + tên + email | |
| Timeline | `<Timeline>` các version theo effective_from DESC | Mỗi node: dates, base, commission, status (active/ended) |
| Add version | `<Button>+ Thêm version mới</Button>` | Modal form |
| Edit version | Inline edit cho version active | |

### Modal: Add Compensation Version

| Field | Validation | Default |
| ----- | ---------- | ------- |
| Effective from (date) | Required, ≥ today | today |
| Effective to (date) | Optional, > from | null |
| Base salary (VND) | Required, ≥ 0 | current active value |
| Commission % | 0-100, decimal | current active value |
| Overtime hourly (VND) | ≥ 0 | current active value |
| Notes | ≤ 1000 chars | |

**Conflict check** (BR-PAY-022): API trả 422 nếu overlap. Show inline error.

---

## 4. Admin — Period List

### Route: `/admin/payroll/periods`

| Element | Type | Notes |
| ------- | ---- | ----- |
| Filter | Status (multi-select), Year | |
| DataTable | Period start/end, Status badge, Total gross, Total net, Created at, Actions | |
| Status badge | Color: DRAFT=gray, REVIEWING=blue, APPROVED=green, PAID=emerald, LOCKED=slate | |
| Create new | `<Button>+ Tạo kỳ mới</Button>` | Modal: chọn tháng |

### Modal: Create Period

| Field | Validation |
| ----- | ---------- |
| Period start (date) | Required, ngày 1 của tháng |
| Period end (date) | Required, ngày cuối tháng, > start |

---

## 5. Admin — Period Detail

### Route: `/admin/payroll/periods/:id`

| Element | Type | Notes |
| ------- | ---- | ----- |
| Header | Status badge + Lock/Approve/Mark-paid buttons theo state machine | |
| Summary cards | Total gross, Total net, Total tax, Total BHXH, Encounter count | |
| Tabs | "Line items" / "Audit log" | |
| Line items table | BS, Encounters, Revenue, Base, Commission, Gross, Tax, BHXH, Net, Actions | |
| Recompute button | Allowed DRAFT/REVIEWING | Show "Đang tính toán..." progress |

### Line item row actions

- **View breakdown**: Mở drawer hiện encounter details + computation log
- **Add adjustment**: Modal form (chỉ DRAFT/REVIEWING)
- **View adjustments**: Nếu đã có

### Modal: Add Adjustment

| Field | Validation | Notes |
| ----- | ---------- | ----- |
| Type (radio) | BONUS / PENALTY / DEDUCTION / MANUAL_OVERRIDE | |
| Amount (VND) | Required, != 0 | Có thể âm |
| Reason | Required, 5-500 chars; MANUAL_OVERRIDE ≥ 50 chars | |

### Action bar (state machine)

| Status | Available actions |
| ------ | ----------------- |
| DRAFT | Compute, Lock, Edit, Delete (cascade) |
| REVIEWING | Compute, Approve, Adjust, Revert-to-DRAFT (admin override, audit) |
| APPROVED | Mark paid, View payslips |
| PAID | (read-only, except audit) |
| LOCKED | (read-only) |

---

## 6. Admin — Shift Approval Inbox

### Route: `/admin/shifts/pending`

Badge trên sidebar khi có PENDING requests.

| Element | Type | Notes |
| ------- | ---- | ----- |
| DataTable | BS, Date, Time range, Max encounters, Notes, Requested at, Actions | |
| Approve | `<Button variant=success>Duyệt</Button>` | `shift.approve` |
| Reject | `<Button variant=outline>Reject</Button>` | Modal: nhập reason |
| Bulk approve | Checkbox multi-select | |

---

## 7. Dentist — Register Shift

### Route: `/my-shifts/new`

| Element | Type | Required Permission | Notes |
| ------- | ---- | ------------------- | ----- |
| Date picker | `<DatePicker>` min = today | `shift.register` | |
| Start time / End time | `<TimePicker>` × 2 | | end > start |
| Max encounters | `<NumberInput>` optional | | |
| Notes | `<Textarea>` | | |
| Working schedule preview | Sidebar: "Ca cố định của bạn: T2-T6 8h-17h" | | Giúp BS biết để tránh conflict |
| Submit | `<Button>Đăng ký</Button>` | | Status: PENDING |

**Conflict feedback**: 422 từ API → toast "Trùng với working schedule" + show working schedule của ngày đó.

---

## 8. Dentist — My Shifts (history)

### Route: `/my-shifts`

| Element | Type | Notes |
| ------- | ---- | ----- |
| Tabs | "Sắp tới" / "Đã qua" / "Đã hủy" | |
| DataTable | Date, Time, Status, Approved by, Notes | |
| Row actions (PENDING) | Cancel | |
| Row actions (APPROVED, ≥ 24h) | Cancel | |
| Row actions (APPROVED, < 24h) | (disabled) Cancel với tooltip "Phải hủy trước 24h" | |

---

## 9. Dentist — My Payroll History

### Route: `/my-payroll`

| Element | Type | Required Permission | Notes |
| ------- | ---- | ------------------- | ----- |
| DataTable | Tháng, Trạng thái, Net pay, Paid at, Actions | `payroll.read.own` | Chỉ PAID/APPROVED/LOCKED |
| View payslip | `<Link>` → `/my-payroll/:periodId` | | |
| Preview current | `<Button>Ước tính tháng này</Button>` → `/my-payroll/preview` | | Gọi `/payroll/me/preview` |

### Empty state (BS mới chưa có period)

> "Chưa có kỳ lương nào. Kỳ lương đầu tiên sẽ xuất hiện sau khi admin tạo và tính toán."

---

## 10. Dentist — Payslip Detail

### Route: `/my-payroll/:periodId`

| Element | Type | Notes |
| ------- | ---- | ----- |
| Header | Period (MM/YYYY), Status badge | |
| Earnings breakdown | Table: Base, Commission, Overtime, Bonus → Subtotal gross | |
| Deductions | Tax TNCN, BHXH, BHYT, BHTN, Other | Tooltip giải thích cách tính |
| **Net pay** | Highlight lớn, màu success | |
| Adjustments | List các bonus/penalty manual (nếu có) | |
| Encounter breakdown | Table các encounter contributing | Encounter date, treatment summary, revenue |
| Computation log | Expandable `<Accordion>` JSON view | |

---

## 11. Dentist — My Compensation

### Route: `/my-compensation`

| Element | Type | Required Permission | Notes |
| ------- | ---- | ------------------- | ----- |
| Current policy card | Effective from, Base, Commission %, Overtime hourly | `payroll.compensation.read` | |
| History timeline | Các version cũ (read-only) | | |

---

## 12. Receptionist — Shift Approval

### Route: `/shifts/pending` (giống Admin §6, nhưng chỉ approve/reject)

Cùng chức năng như Admin §6. Receptionist không có quyền payroll nên không thấy sidebar Payroll.

---

## 13. Cross-cutting UI

### Audit log viewer

Tất cả actions payroll + shift đều có audit log. Filter:
- Entity type: `PAYROLL_PERIOD`, `PAYROLL_LINE_ITEM`, `PAYROLL_ADJUSTMENT`, `DENTIST_COMPENSATION`, `SHIFT_REGISTRATION`
- Date range
- Actor

### Notifications (in-app)

| Event | Recipient | Channel |
| ----- | --------- | ------- |
| ShiftRegistration PENDING created | Admin/Receptionist | Bell icon badge |
| ShiftRegistration APPROVED | Dentist (owner) | Toast + bell |
| ShiftRegistration REJECTED | Dentist (owner) | Toast (red) + bell |
| Payroll period COMPUTED | Admin | Bell |
| Payroll period APPROVED | Admin (audit) | — |
| Payroll period PAID | Dentist (own) | Toast "Phiếu lương tháng X đã sẵn sàng" + bell |

### Loading states

- **Compute** payroll: hiển thị modal progress với steps (Loading config → Computing encounters → Computing tax → Done). Estimated time ~3-5s cho phòng khám 5 BS.
- **Approve shift**: Optimistic update với revert on error.

### Error states

- **422 period overlap** (khi tạo period): "Kỳ lương tháng này đã tồn tại."
- **422 shift conflict**: "Trùng với working schedule: T2 8h-17h. Vui lòng chọn khung giờ khác."
- **403 cancel < 24h**: "Chỉ có thể hủy ca trước 24h. Liên hệ admin nếu cần thiết."
- **409 BS cancel approved shift của BS khác**: Forbidden.

---

## 14. Accessibility (a11y)

- Tất cả form có label rõ ràng.
- Status badge có aria-label (e.g., "Đã khóa, chờ duyệt").
- Modal trap focus.
- Color contrast đạt WCAG AA (đặc biệt status badge với màu sắc).
- DataTable có keyboard navigation.

---

## 15. Responsive

- Desktop: 2-column layout (form + preview) cho compensation editor.
- Tablet: 1-column, modal chiếm 80% width.
- Mobile: chỉ xem (read-only), không cho phép edit payroll. Shift register vẫn dùng được.

---

## Liên kết

- Spec: [`../../03_Specification/Payroll/SPEC.md`](../../03_Specification/Payroll/SPEC.md)
- BD: [`../../01_Architecture/business-decisions.md`](../../01_Architecture/business-decisions.md) §BD-0009, §BD-0010
- Design system: `../design-system.md`
- Navigation map: `../navigation-map.md`
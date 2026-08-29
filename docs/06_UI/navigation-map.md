# Navigation Map & Component Library

> **Mục đích:** Map toàn bộ routes của app + danh sách components shared.
> **Tham chiếu:** [`design-system.md`](design-system.md).
> **Ngày tạo:** 2026-07-13

---

# PHẦN A: NAVIGATION MAP

## App-level layout

```
┌────────────────────────────────────────────────────────────────┐
│  HEADER (fixed top)                                             │
│  [Logo]  [Search 🔍]              [🔔 Notifications]  [👤 User]│
├──────────┬─────────────────────────────────────────────────────┤
│          │                                                      │
│  SIDEBAR │   MAIN CONTENT (scrollable, padded)                 │
│  (fixed  │                                                      │
│   left)  │                                                      │
│          │                                                      │
│          │                                                      │
│          │                                                      │
└──────────┴─────────────────────────────────────────────────────┘
```

- **Header:** luôn hiển thị
- **Sidebar:** collapse được, ẩn trên mobile (dùng hamburger menu)
- **Main:** `<Outlet />` từ React Router

---

## Routes — tổng quan

| Route | Screen | Roles có quyền |
| ----- | ------ | -------------- |
| `/login` | Login | Public |
| `/forgot-password` | Forgot Password | Public |
| `/reset-password` | Reset Password | Public |
| `/` | Dashboard | All (filtered) |
| `/today` | Today (Dentist) | Dentist |
| `/my-queue` | My Queue | Dentist |
| `/my-patients` | My Patients | Dentist |
| `/my-schedule` | My Schedule | Dentist |
| `/patients` | Patient List | Receptionist, Admin, Dentist |
| `/patients/new` | Create Patient | Receptionist, Admin |
| `/patients/:id` | Patient Detail | All (row-level) |
| `/patients/:id/edit` | Edit Patient | Receptionist, Admin |
| `/patients/:id/encounters` | Patient Encounters | All |
| `/patients/:id/invoices` | Patient Invoices | Receptionist, Admin |
| `/patients/lookup` | Quick Lookup (modal) | All |
| `/appointments` | Calendar | Receptionist, Admin, Dentist (own) |
| `/checkin` | Check-in | Receptionist |
| `/queue` | Waiting Queue | Receptionist, Dentist |
| `/encounters/:id` | Encounter Detail | Dentist (own), Receptionist (read) |
| `/invoices` | Invoice List | Receptionist, Admin |
| `/invoices/new` | Create Ad-hoc Invoice | Receptionist, Admin |
| `/invoices/:id` | Invoice Detail | Receptionist, Admin |
| `/payments` | Payments List | Receptionist, Admin |
| `/reports/revenue` | Revenue Report | Admin, Dentist |
| `/inventory` | Inventory List | Receptionist (read), Admin |
| `/inventory/new` | Create Item | Admin |
| `/inventory/items/:id` | Item Detail | Receptionist (read), Admin |
| `/inventory/items/:id/edit` | Edit Item | Admin |
| `/inventory/movements` | Movement History | Admin |
| `/inventory/categories` | Categories | Admin |
| `/inventory/alerts` | Low Stock Alerts | All |
| `/admin/users` | User List | Admin |
| `/admin/users/new` | Create User | Admin |
| `/admin/users/:id` | User Detail | Admin |
| `/admin/roles` | Role List | Admin |
| `/admin/roles/:id` | Role Detail | Admin |
| `/admin/settings` | Clinic Settings | Admin |
| `/admin/audit-logs` | Audit Logs | Admin |
| `/me` | My Profile | All |
| `/404` | Not Found | Public |

**Total: ~40 routes**

---

## Role-based route filtering

### Admin

```
SIDE BAR                         MAIN                                  REQUIRED PERMISSION
──────                          ─────                                 ─────────────────
🏠 Dashboard                    / (overview + all stats)                — (authenticated)
👥 Users                       /admin/users, /admin/users/:id           user.read
🎭 Roles & Permissions         /admin/roles, /admin/roles/:id          role.upsert
🏥 Clinic Settings             /admin/settings                         settings.read
📋 Audit Logs                  /admin/audit-logs                      system.audit.read
📦 Inventory                   /inventory (full CRUD)                  inventory.*
🔄 Movements                   /inventory/movements                   inventory.read
📅 Appointments                /appointments                          appointment.read.any
👤 Patients                    /patients                              patient.*
🧾 Invoices                    /invoices, /invoices/new                invoice.*
💰 Payments                    /payments                              payment.create
📊 Reports                     /reports/revenue                        report.revenue.read
👤 My Profile                  /me                                    — (authenticated)
```

### Receptionist

```
SIDE BAR                         MAIN                           REQUIRED PERMISSION
──────                          ─────                          ─────────────────
🏠 Dashboard                    /                               — (authenticated)
📅 Appointments                 /appointments                   appointment.read
✅ Check-in                     /checkin                        appointment.check_in
📋 Queue                       /queue                           appointment.check_in
👤 Patients                    /patients (full)                  patient.*
📦 Inventory                   /inventory (READ + stock-in/out)  inventory.read
🧾 Invoices                    /invoices (full)                 invoice.*
💰 Payments                    /payments (full)                  payment.create
👤 My Profile                  /me                             — (authenticated)
```

> Receptionist **không thấy** route Users, Roles, Audit Logs trong sidebar. Nếu gõ URL trực tiếp → 403.

### Dentist

```
SIDE BAR                         MAIN                         REQUIRED PERMISSION
──────                          ─────                        ─────────────────
🏠 Today                       /today                        appointment.read.own
📋 My Queue                   /my-queue                      appointment.check_in
👤 My Patients                /my-patients                   patient.read.medical_history
📅 My Schedule                /my-schedule                  appointment.read.own
🦷 Encounter (from queue)    /encounters/:id                encounter.read
👤 My Profile                /me                            — (authenticated)
```

> ⚠️ **Lưu ý:** Dentist **không thấy** Invoices, Payments, Inventory trong sidebar. Dentist không có quyền `report.revenue.read` (chỉ Admin). Xem chi tiết appointment → vào qua queue hoặc calendar.

---

## Route guards

### ProtectedRoute

```tsx
<Route
  path="/admin/users"
  element={
    <ProtectedRoute requiredPermission="user.read">
      <UserList />
    </ProtectedRoute>
  }
/>
```

### Behavior

- Unauthenticated → redirect `/login`
- Authenticated but missing permission → 403 page (không redirect)
- Permission check ở **cả server** (NestJS Guard) **và client** (chỉ ẩn UI, không phải security)

---

## Navigation patterns

### Breadcrumbs

Hiển thị trên mọi trang (trừ Dashboard):

```
🏠 Phòng khám / Bệnh nhân / Nguyễn Văn A
```

Click vào segment → navigate ngược.

### Back button

- Mọi Detail page có nút "← Quay lại" ở góc trên trái
- Behavior: navigate về URL trước (dùng `useNavigate(-1)`)

### Deep linking

Tất cả Detail pages đều có URL cố định (có thể bookmark/share):
- `/patients/abc-123` → BN cụ thể
- `/encounters/def-456` → Encounter cụ thể
- `/invoices/INV-2026-00078` → HĐ cụ thể

---

## Search (global)

Header có search bar dùng `Ctrl+K` để focus:

```
┌────────────────────────────────────────┐
│ 🔍 Tìm kiếm...                        │
└────────────────────────────────────────┘
```

Dropdown kết quả:
- **Patients:** Tìm theo tên, SĐT, mã BN → click vào Patient Detail
- **Appointments:** Tìm theo APT code → click vào Appointment
- **Invoices:** Tìm theo INV code → click vào Invoice
- **Users:** (Admin only) Tìm theo email, tên

API: `GET /search?q=...` (TODO: cần tổng hợp endpoint)

---

## Notifications

Bell icon ở header hiển thị:
- Low stock alert (chung cho tất cả roles)
- Appointment sắp đến (cho Dentist: trong 15 phút)
- Invoice quá hạn (cho Receptionist)

Click bell → dropdown list + link "Xem tất cả".

---

## User menu

Click avatar ở góc phải header:

```
┌────────────────────────────┐
│ 👤 Nguyễn Văn A           │
│    admin@clinic.local      │
│ ─────────────────────────  │
│ ⚙️ Cài đặt cá nhân        │
│ 👤 Hồ sơ của tôi           │
│ ─────────────────────────  │
│ 🚪 Đăng xuất              │
└────────────────────────────┘
```

---

# PHẦN B: COMPONENT LIBRARY

> Chi tiết mỗi component ở `components/<name>.md`. Phần này chỉ liệt kê.

## Core components

| Component | Mô tả | File |
| --------- | ----- | ---- |
| **Button** | 5 variants × 3 sizes + loading state | [`components/button.md`](components/button.md) |
| **Input** | Text, email, password, number, tel | [`components/input.md`](components/input.md) |
| **Select** | Dropdown, searchable, multi-select | [`components/select.md`](components/select.md) |
| **Textarea** | Auto-grow, char counter | [`components/textarea.md`](components/textarea.md) |
| **Checkbox** | Single, indeterminate, group | [`components/checkbox.md`](components/checkbox.md) |
| **Radio** | Group với label | [`components/radio.md`](components/radio.md) |
| **DatePicker** | Single date, range, time, datetime | [`components/date-picker.md`](components/date-picker.md) |
| **FileUpload** | Drag-drop, preview | [`components/file-upload.md`](components/file-upload.md) |
| **Form** | Auto layout, validation, error display | [`components/form.md`](components/form.md) |

## Data display

| Component | Mô tả | File |
| --------- | ----- | ---- |
| **DataTable** | Sort, filter, pagination, row selection | [`components/data-table.md`](components/data-table.md) |
| **StatusBadge** | Color theo status enum | [`components/status-badge.md`](components/status-badge.md) |
| **EmptyState** | Icon + message + CTA | [`components/empty-state.md`](components/empty-state.md) |
| **Loading** | Skeleton + spinner | [`components/loading.md`](components/loading.md) |
| **ErrorBoundary** | Fallback UI cho unhandled errors | [`components/error-boundary.md`](components/error-boundary.md) |
| **Avatar** | Image + fallback initials | [`components/avatar.md`](components/avatar.md) |
| **Tag/Chip** | Removable, color variants | [`components/tag.md`](components/tag.md) |

## Feedback

| Component | Mô tả | File |
| --------- | ----- | ---- |
| **Toast** | Success, error, warning, info | [`components/toast.md`](components/toast.md) |
| **Modal** | Center, slide-over, fullscreen | [`components/modal.md`](components/modal.md) |
| **ConfirmDialog** | Confirm before dangerous action | [`components/confirm-dialog.md`](components/confirm-dialog.md) |
| **Alert** | Inline alert (info, warning, error) | [`components/alert.md`](components/alert.md) |

## Layout

| Component | Mô tả | File |
| --------- | ----- | ---- |
| **Card** | Container với header, body, footer | [`components/card.md`](components/card.md) |
| **Tabs** | Horizontal, vertical, lazy load | [`components/tabs.md`](components/tabs.md) |
| **Accordion** | Collapsible sections | [`components/accordion.md`](components/accordion.md) |
| **Drawer** | Side panel (slide from right) | [`components/drawer.md`](components/drawer.md) |

## Specialized (domain)

| Component | Mô tả | File |
| --------- | ----- | ---- |
| **DentalChart** | 32 răng grid với click-to-edit | [`components/dental-chart.md`](components/dental-chart.md) |
| **Calendar** | Day/week/month views | [`components/calendar.md`](components/calendar.md) |
| **KPI Card** | Big number + label + delta | [`components/kpi-card.md`](components/kpi-card.md) |
| **PermissionGuard** | Ẩn UI nếu user không có permission | [`components/permission-guard.md`](components/permission-guard.md) |

> **Component spec status:** All 28 component spec files have been created in `docs/06_UI/components/`. Each file contains a TODO placeholder to be filled during Phase 7 (UI Implementation).

---

## Component priority cho MVP

**Phase 1 (phải có):**
- Button, Input, Select, DatePicker
- Form, Validation, ErrorBoundary
- DataTable, EmptyState, Loading
- Modal, ConfirmDialog, Toast
- Card, Tabs, Avatar

**Phase 2 (nice to have):**
- FileUpload, Drawer, Accordion
- Checkbox, Radio, Textarea
- Tag, StatusBadge, Alert

**Phase 3 (specialized):**
- DentalChart, Calendar, KPI Card
- PermissionGuard

---

## Form patterns

### Layout

```
┌─ Form Section ────────────────────────────────────┐
│  Section Title                                     │
│  ─────────────────────────                         │
│  Field 1:        [____________]                    │
│                  Helper text                       │
│                                                    │
│  Field 2:        [____________]                    │
│                  ⚠ Error message                   │
│                                                    │
│  [Cancel]                          [Submit Button] │
└────────────────────────────────────────────────────┘
```

- **Layout:** Label left, input right (2-column on desktop)
- **Required:** Marked với `*`
- **Error:** Red border + error message dưới field
- **Helper:** Gray text dưới field
- **Disabled:** Gray background, not-allowed cursor

### Validation

Dùng Zod schema share với backend. Khi load form → `useForm({ resolver: zodResolver(schema) })`. Errors tự động hiển thị inline.

### Submit

- Button disabled khi form invalid hoặc đang submit
- Show spinner trong button khi đang submit
- Success → toast + redirect (or close modal)
- Error → toast + giữ form để user sửa

---

## DataTable patterns

### Props

```ts
interface DataTableProps<T> {
  data: T[]
  columns: ColumnDef<T>[]
  isLoading?: boolean
  pagination?: {
    pageSize: number
    onPageSizeChange: (size: number) => void
    hasMore: boolean
    onLoadMore: () => void
  }
  sorting?: {
    sort: string
    onSortChange: (sort: string) => void
  }
  filtering?: FilterConfig[]
  rowSelection?: {
    selectedIds: string[]
    onSelectionChange: (ids: string[]) => void
  }
  onRowClick?: (row: T) => void
  emptyState?: ReactNode
}
```

### Features

- **Sort:** Click header → sort asc → desc → none
- **Filter:** Per-column filter (text, select, date range)
- **Pagination:** Server-side page numbers (`« 1 2 3 ... »`). Default pageSize: 20.
- **Row click:** Optional, navigate to detail
- **Bulk actions:** Selected rows → action menu top-right
- **Sticky header:** Khi scroll dài
- **Responsive:** Ẩn cột ít quan trọng trên mobile

---

## Toast patterns

### Position

Bottom-right (fixed).

### Types

| Type | Icon | Color | Auto-dismiss |
| ---- | ---- | ----- | :-----------: |
| Success | ✓ | Green | 5s |
| Error | ✕ | Red | Manual close |
| Warning | ⚠ | Amber | 8s |
| Info | ℹ | Blue | 5s |

### Stack

Max 3 toasts cùng lúc. Nếu > 3 → xếp hàng.

### API

```ts
toast.success("Đã lưu thành công")
toast.error("Không thể xóa — có ràng buộc")
toast.warning("Email đã tồn tại")
toast.info("Có 3 thông báo mới")
```

---

## Related

- [`design-system.md`](design-system.md) — tokens, typography, colors
- [`../../PROJECT_RULES.md`](../../PROJECT_RULES.md) — nguyên tắc UI
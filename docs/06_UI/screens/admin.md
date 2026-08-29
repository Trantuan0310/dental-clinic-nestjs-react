# Admin Screens

> **Role:** Clinic Administrator
> **Permission:** `user.*`, `role.*`, `system.*`
> **File này:** Wireframe + flow cho các màn hình Admin.
> **Tham chiếu:** [`design-system.md`](../design-system.md) + [`api-conventions.md`](../../05_API/api-conventions.md) + [`auth.md`](../../05_API/auth.md).
> **Ngày tạo:** 2026-07-13

---

## Sidebar cho Admin

```
┌────────────────────────────┐
│ ClinicFlow          [≡]    │
├────────────────────────────┤
│ 🏠 Dashboard               │
│                            │
│ QUẢN LÝ                    │
│ 👥 Người dùng              │
│ 🎭 Phân quyền              │
│                            │
│ CÀI ĐẶT                    │
│ 🏥 Phòng khám             │
│ 📋 Audit logs              │
│                            │
│ ─────────────────────────  │
│ ❓ Trợ giúp                │
│ 🚪 Đăng xuất              │
└────────────────────────────┘
```

> Chỉ Admin mới thấy "Phân quyền" và "Audit logs" trong sidebar.

---

## Screen 1: Login

**Path:** `/login`
**Permission:** Public

### Wireframe

```
┌────────────────────────────────────────┐
│                                        │
│         ClinicFlow                     │
│                                        │
│  ┌──────────────────────────────────┐  │
│  │ Email                             │  │
│  │ [admin@clinic.local          ]   │  │
│  │                                  │  │
│  │ Mật khẩu                       [👁]│  │
│  │ [••••••••••••••             ]    │  │
│  │                                  │  │
│  │ ☐ Ghi nhớ đăng nhập              │  │
│  │                                  │  │
│  │ [       Đăng nhập       ]       │  │
│  │                                  │  │
│  │ Quên mật khẩu?                   │  │
│  └──────────────────────────────────┘  │
│                                        │
└────────────────────────────────────────┘
```

### Behavior

- POST `/auth/login` (RFC 7807 errors)
- Sau success: redirect `/`
- Remember me → set localStorage flag, refresh token expiry = 30 ngày thay vì 7
- Quên mật khẩu → modal với email input → POST `/auth/forgot-password`

### Validation

- Email: required, email format
- Password: required
- Rate limit: 5 lần sai → tài khoản bị khóa 15 phút → hiển thị "Tài khoản tạm khóa. Vui lòng thử lại sau 15 phút."

---

## Screen 2: Dashboard (Admin)

**Path:** `/`
**Permission:** Authenticated

### Wireframe

```
┌─────────────────────────────────────────────────────────┐
│ Dashboard                                    [Filter ▼] │
├─────────────────────────────────────────────────────────┤
│  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐       │
│  │ Bệnh nhân│ │ Lịch hẹn│ │ Doanh thu│ │ Tồn kho │       │
│  │   245   │ │   18    │ │ 45.2M ₫ │ │   12 ⚠  │       │
│  │ hôm nay │ │ hôm nay │ │ tháng này│ │ sắp hết │       │
│  └─────────┘ └─────────┘ └─────────┘ └─────────┘       │
│                                                          │
│  ┌─────────────────────┐ ┌──────────────────────┐       │
│  │ Lịch hẹn hôm nay    │ │ Low stock alerts     │       │
│  │ ─────────────────── │ │ ───────────────────  │       │
│  │ 09:00 BS.Tran - A   │ │ ⚠ Amoxicillin 500mg │       │
│  │ 10:00 BS.Lee - B    │ │   Còn: 30 / Min: 50  │       │
│  │ 11:00 BS.Tran - C   │ │ ⚠ Khẩu trang        │       │
│  │ ...                 │ │   Còn: 20 / Min: 100 │       │
│  └─────────────────────┘ └──────────────────────┘       │
│                                                          │
│  ┌────────────────────────────────────────────────┐     │
│  │ Biểu đồ doanh thu 30 ngày                     │     │
│  │ [Line chart]                                    │     │
│  └────────────────────────────────────────────────┘     │
└─────────────────────────────────────────────────────────┘
```

### Components

- 4 KPI cards (top row) — số liệu hôm nay/tháng
- 2 panels (middle row) — today's appointments + low stock
- 1 chart (bottom) — revenue line chart

### API calls

- `GET /dashboard/summary` (TODO: cần thêm module Dashboard)
- `GET /appointments?date=today`
- `GET /inventory/items?lowStock=true&pageSize=10`

---

## Screen 3: User List

**Path:** `/admin/users`
**Permission:** `user.read`

### Wireframe

```
┌──────────────────────────────────────────────────────────┐
│ Người dùng                            [+ Tạo người dùng] │
├──────────────────────────────────────────────────────────┤
│ [🔍 Tìm kiếm email, tên...] [Trạng thái ▼] [Phòng ban▼]│
│                                                          │
│ ┌──────────────────────────────────────────────────────┐ │
│ │ Email              │ Tên         │ Vai trò │ Trạng thái │ │
│ ├──────────────────────────────────────────────────────┤ │
│ │ admin@clinic.local │ Nguyễn V.A  │ Admin   │ 🟢 Active  │ │
│ │ receptionist@...   │ Trần T.B    │ Reception│ 🟡 Pending│ │
│ │ dentist@...        │ Lê V.C      │ Dentist  │ 🟢 Active  │ │
│ │ ...                                                  │ │
│ └──────────────────────────────────────────────────────┘ │
│                                                          │
│                « 1 2 3 ... 12 »           20 / trang  ▼  │
└──────────────────────────────────────────────────────────┘
```

### Behavior

- Click row → `/admin/users/:id`
- Click "+ Tạo người dùng" → modal form
- Click action icon (edit/deactivate) → menu popover
- Search: debounce 300ms, gọi `GET /admin/users?q=...`

### Filters

- `q`: search email/fullName
- `status`: `active`, `pending_setup`, `deactivated`
- `roleId`: filter by role

---

## Screen 4: User Detail

**Path:** `/admin/users/:id`
**Permission:** `user.read`

### Wireframe

```
┌──────────────────────────────────────────────────────────┐
│ ← Quay lại    Người dùng: Nguyễn Văn A      [⋮ Actions] │
├──────────────────────────────────────────────────────────┤
│  ┌────────────────┐  ┌────────────────────────────────┐ │
│  │  [Avatar]      │  │ Nguyễn Văn A                   │ │
│  │                │  │ admin@clinic.local             │ │
│  │                │  │ Vai trò: Quản trị viên          │ │
│  │                │  │ Trạng thái: 🟢 Active          │ │
│  └────────────────┘  │ Đăng nhập cuối: 5 phút trước   │ │
│                      └────────────────────────────────┘ │
│                                                          │
│  [Tabs: Thông tin | Vai trò | Hoạt động | Audit]        │
│  ────────────────────────────────────────────────       │
│                                                          │
│  ┌──────────────────────────────────────────────────┐  │
│  │ Thông tin cơ bản                                  │  │
│  │ ─────────────────────────────────────────────    │  │
│  │ Email       admin@clinic.local      (immutable)  │  │
│  │ Họ và tên   Nguyễn Văn A          [✏️ Edit]    │  │
│  │ Trạng thái  🟢 Active                            │  │
│  │ Tạo lúc     01/01/2026 08:00                        │  │
│  └──────────────────────────────────────────────────┘  │
│                                                          │
│  ┌──────────────────────────────────────────────────┐  │
│  │ Bảo mật                                           │  │
│  │ ─────────────────────────────────────────────    │  │
│  │ [Đặt lại mật khẩu]   [Vô hiệu hóa]              │  │
│  └──────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────┘
```

### Tab "Hoạt động" (login history)

```
┌─────────────────────────────────────────────────────┐
│ Lịch sử đăng nhập                                    │
├─────────────────────────────────────────────────────┤
│ 2026-07-13 09:30   ✅ Đăng nhập thành công   IP: 10...│
│ 2026-07-13 09:25   ❌ Sai mật khẩu          IP: 10...│
│ 2026-07-12 17:45   ✅ Đăng nhập thành công   IP: 192..│
└─────────────────────────────────────────────────────┘
```

### Action menu (⋮)

```
┌─────────────────────┐
│ ✏️ Sửa thông tin    │
│ 🔑 Đặt lại MK       │
│ ─────────────────── │
│ ❌ Vô hiệu hóa      │
│ 🔄 Kích hoạt lại   │
└─────────────────────┘
```

### Confirmation

- **Vô hiệu hóa:** ConfirmDialog "Vô hiệu hóa tài khoản này? User sẽ bị đăng xuất khỏi tất cả thiết bị."
- **Đặt lại MK:** ConfirmDialog "Đặt lại mật khẩu? Mật khẩu mới sẽ được gửi qua email."

---

## Screen 5: Role List

**Path:** `/admin/roles`
**Permission:** `role.upsert`

### Wireframe

```
┌──────────────────────────────────────────────────────────┐
│ Phân quyền                            [+ Tạo vai trò]    │
├──────────────────────────────────────────────────────────┤
│ ┌──────────────────────────────────────────────────────┐ │
│ │ Mã           │ Tên              │ Người dùng │ Trạng thái│ │
│ ├──────────────────────────────────────────────────────┤ │
│ │ admin        │ Quản trị viên    │     2      │  🔒   │ │
│ │ dentist      │ Bác sĩ           │     5      │  🔒   │ │
│ │ receptionist │ Lễ tân           │     3      │  🔒   │ │
│ │ senior_dentist│ Bác sĩ cao cấp  │     1      │  ✏️   │ │
│ └──────────────────────────────────────────────────────┘ │
│                                                          │
│ 🔒 = System role (không sửa/xóa)                       │
└──────────────────────────────────────────────────────────┘
```

---

## Screen 6: Role Editor

**Path:** `/admin/roles/:id` hoặc modal khi tạo

### Wireframe

```
┌──────────────────────────────────────────────────────────┐
│ Sửa vai trò: Bác sĩ cao cấp                     [✕]    │
├──────────────────────────────────────────────────────────┤
│ Mã vai trò     senior_dentist              (immutable)  │
│ ┌──────────────────────────────────────────────────────┐ │
│ │ Tên hiển thị                                         │ │
│ │ [Bác sĩ cao cấp                              ]       │ │
│ │                                                      │ │
│ │ Mô tả                                                │ │
│ │ [Bác sĩ có thêm quyền xem báo cáo          ]       │ │
│ │                                                      │ │
│ │ Quyền hạn                                  [Tất cả] │ │
│ │ ┌──────────────────────────────────────────────────┐ │ │
│ │ │ ☐ Bệnh nhân (Patient)                            │ │ │
│ │ │   ☑ patient.create                               │ │ │
│ │ │   ☑ patient.read                                 │ │ │
│ │ │   ☑ patient.update                               │ │ │
│ │ │   ☑ patient.read.medical_history                  │ │ │
│ │ │ ☐ patient.delete                                 │ │ │
│ │ │ ──────────────────────────────────────────────    │ │ │
│ │ │ ☑ Lịch hẹn (Appointment)                        │ │ │
│ │ │   ☑ appointment.* (tất cả)                       │ │ │
│ │ │ ☐ Hồ sơ khám (Medical Record)                    │ │ │
│ │ │ ☑ Báo cáo (Report)                               │ │ │
│ │ │   ☑ report.revenue.read                          │ │ │
│ │ └──────────────────────────────────────────────────┘ │ │
│ │                                                      │ │
│ │ [Hủy]                          [Lưu thay đổi]       │ │
│ └──────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────┘
```

### Permission tree

Phân nhóm theo resource (xem `actor-permissions-matrix.md`). Thứ tự nhóm:

- **Nhân viên (User):** user.create, user.read, user.update, user.deactivate, user.reset_password
- **Vai trò (Role):** role.upsert
- **Hệ thống (System):** system.audit.read
- **Bệnh nhân (Patient):** patient.create, patient.read, patient.read.basic, patient.read.medical_history, patient.update, patient.delete
- **Lịch hẹn (Appointment):** appointment.create, appointment.read, appointment.update, appointment.check_in, appointment.cancel, appointment.mark_no_show
- **Hồ sơ khám (Encounter/Note/Treatment/Rx/Chart):** encounter.*, clinical_note.*, treatment.*, prescription.*, dental_chart.*
- **Hóa đơn (Invoice):** invoice.create, invoice.read, invoice.update, invoice.issue, invoice.void
- **Thanh toán (Payment):** payment.create, payment.reverse
- **Kho (Inventory):** inventory.*

---

## Screen 7: Clinic Settings

**Path:** `/admin/settings`
**Permission:** `system.settings.read`

### Wireframe

```
┌──────────────────────────────────────────────────────────┐
│ Cài đặt phòng khám                                        │
├──────────────────────────────────────────────────────────┤
│ [Tabs: Thông tin | Giờ làm việc | Thông báo]            │
│                                                          │
│ ┌────────────────────────────────────────────────────┐  │
│ │ Thông tin chung                                    │  │
│ │ ──────────────────────────────────────────         │  │
│ │ Tên phòng khám   [Nha khoa Sài Gòn          ]    │  │
│ │ Địa chỉ          [123 Lê Lợi, Q1, TP.HCM    ]    │  │
│ │ Số điện thoại    [+84 28 1234 5678          ]    │  │
│ │ Email            [contact@clinic.local        ]    │  │
│ │ Mã số thuế       [0123456789                  ]    │  │
│ │                                                     │  │
│ │ [Lưu thay đổi]                                      │  │
│ └────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────┘
```

> Clinic settings không phải bảng trong DB MVP — chỉ là config đơn giản. Có thể làm thành bảng `clinic_settings` sau.

---

## Screen 8: Audit Logs

**Path:** `/admin/audit-logs`
**Permission:** `system.audit.read`

### Wireframe

```
┌──────────────────────────────────────────────────────────┐
│ Audit logs                          [Export CSV] [🔄 Ref] │
├──────────────────────────────────────────────────────────┤
│ [Hành động ▼] [Người thực hiện ▼] [Loại ĐT ▼]          │
│ [Từ ngày 📅] [Đến ngày 📅]                              │
│                                                          │
│ ┌──────────────────────────────────────────────────────┐ │
│ │ Thời gian          │ Hành động         │ Actor │ ĐT  │ │
│ ├──────────────────────────────────────────────────────┤ │
│ │ 2026-07-13 10:30  │ invoice.issued    │ Le T.B│ INV │ │
│ │ 2026-07-13 10:25  │ user.deactivated  │ Ng V.A│ USR │ │
│ │ 2026-07-13 10:20  │ payment.created   │ Le T.B│ INV │ │
│ │ 2026-07-13 10:15  │ encounter.closed  │ Sys   │ ENC │ │
│ └──────────────────────────────────────────────────────┘ │
│                                                          │
│              « 1 2 3 ... 50 »        50 / trang  ▼      │
└──────────────────────────────────────────────────────────┘
```

### Filters

| Filter | Description |
| ------ | ----------- |
| Action | Select from action code list (see BR-AUTH-017 + BR-LOG-001) |
| Actor user | Filter by who performed the action |
| Entity type | USR=User, INV=Invoice, ENC=Encounter, APT=Appointment, PTN=Patient, PAY=Payment, INV=Inventory |
| Date range | From/To date pickers |

> **Entity type codes:** USR (User), APT (Appointment), ENC (Encounter), INV (Invoice), PAY (Payment), PTN (Patient), ITM (Inventory Item), ROL (Role)

---

## Common Admin patterns

### ConfirmDialog

Bất kỳ action nguy hiểm nào (delete, deactivate, void) đều phải qua ConfirmDialog:

```
┌─────────────────────────────────────┐
│ Xác nhận                       [✕] │
├─────────────────────────────────────┤
│ Bạn có chắc muốn vô hiệu hóa       │
│ tài khoản "Nguyễn Văn A"?          │
│                                     │
│ Hành động này sẽ:                  │
│ - Đăng xuất khỏi tất cả thiết bị  │
│ - Không thể đăng nhập lại          │
│ - Lưu lại lịch sử audit            │
│                                     │
│ [Hủy]            [Vô hiệu hóa]    │
└─────────────────────────────────────┘
```

### Toast notifications

- Success (xanh): "Đã lưu thành công"
- Error (đỏ): "Không thể xóa — có ràng buộc dữ liệu"
- Warning (vàng): "Email đã tồn tại trong hệ thống"
- Auto-dismiss sau 5s cho success, không auto-dismiss cho error

### Loading states

- Page-level: skeleton table
- Action-level: spinner inline trong button

---

## Related

- [`design-system.md`](../design-system.md)
- [`../../05_API/auth.md`](../../05_API/auth.md)
- [`../screens/receptionist.md`](receptionist.md)
- [Permission Matrix](../../01_Architecture/actor-permissions-matrix.md)
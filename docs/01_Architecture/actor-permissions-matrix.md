# Actor × Permission Matrix

> **Mục đích:** Ma trận chi tiết Role × Action × Permission Code.
> **Đóng vai "luật" cho RBAC.** Mọi nơi khác (code, spec, API) phải tham chiếu ma trận này — không tự ý thêm permission.
>
> Khi cần thêm permission mới → sửa file này **TRƯỚC**, code và API spec điều chỉnh sau.

---

## 1. Actors / Roles

| Role code | Tên Tiếng Việt | Mô tả 1 dòng |
| --------- | -------------- | ------------ |
| `clinic_admin` | Quản trị viên | Toàn quyền quản lý người dùng, settings, xem báo cáo. |
| `receptionist` | Lễ tân | Đặt lịch, check-in, thu tiền, quản lý bệnh nhân (không có medical). |
| `dentist` | Bác sĩ | Tạo và sửa hồ sơ y tế, điều trị. Không sửa role người khác. |

> Cấu hình thêm/sửa role được thực hiện qua Permission code `role.update` (chỉ `clinic_admin`).

---

## 2. Permission naming convention

Format: **`<resource>.<action>`** hoặc **`<resource>.<action>.<scope>`**.

Trong đó:

- `<resource>` — tài nguyên (snake_case): `patient`, `appointment`, `encounter`, `invoice`, ...
- `<action>` — động từ thường dùng trong CRUD + các action nghiệp vụ:
  - `create`, `read`, `update`, `delete` (soft-delete mặc định).
  - `cancel` (vd: appointment.cancel).
  - `mark_paid`, `refund` (vd: invoice.mark_paid).
  - `<action_own>` (vd: read.own) — chỉ trên record mình sở hữu.
  - `<action_any>` (vd: read.any) — trên mọi record.
  - `<action_pii>` — truy cập dữ liệu nhạy cảm (VD hồ sơ y tế).

### Ví dụ

| Permission code | Ý nghĩa |
| --------------- | ------- |
| `patient.create` | Tạo patient |
| `patient.read` | Đọc thông tin patient (không bao gồm medical record) |
| `patient.read.medical_history` | Đọc hồ sơ y tế patient (PII) |
| `appointment.read.own` | Chỉ xem appointment do mình tạo |
| `invoice.refund` | Hoàn tiền hóa đơn |
| `ai.summary.read` | Xem AI tóm tắt hồ sơ bệnh nhân (Phase 8.0) |

---

## 3. Ma trận tổng (MVP)

> ✅ = cho phép. ❌ = không cho phép. 🔒 = có nhưng qua row-level filter (xem chú thích).

### 3.1 Patient module

| Action | Admin | Receptionist | Dentist | Permission code |
| ------ | :---: | :----------: | :-----: | --------------- |
| Tạo patient | ✅ | ✅ | ❌ | `patient.create` |
| Xem danh sách | ✅ | ✅ | ✅ | `patient.read` |
| Xem chi tiết (cơ bản) | ✅ | ✅ | ✅ | `patient.read.basic` |
| Xem lịch sử khám | ✅ | 🔒 | 🔒 | `patient.read.medical_history` (receptionist: không xem clinical note/treatment) |
| Cập nhật thông tin cơ bản | ✅ | ✅ | ❌ | `patient.update` |
| Soft-delete | ✅ | ❌ | ❌ | `patient.delete` |
| Hard-delete | ❌ | ❌ | ❌ | (chỉ qua DB batch, không qua API) |

**Chú thích row-level:**
- Dentist chỉ thấy bệnh nhân đã từng khám với mình (`encounter.dentist_id = currentUser`).
- Receptionist thấy tất cả (để đặt lịch), nhưng không thấy clinical note.

### 3.2 Appointment module

| Action | Admin | Receptionist | Dentist | Permission code |
| ------ | :---: | :----------: | :-----: | --------------- |
| Đặt lịch | ✅ | ✅ | ❌ | `appointment.create` |
| Xem lịch phòng khám (toàn bộ) | ✅ | ✅ | ❌ | `appointment.read.any` |
| Xem lịch cá nhân (dentist) | ✅ | ❌ | 🔒 | `appointment.read.own` |
| Cập nhật lịch | ✅ | ✅ | ❌ | `appointment.update` |
| Check-in | ✅ | ✅ | ❌ | `appointment.check_in` |
| Hủy lịch (trước giờ hẹn) | ✅ | ✅ | 🔒 (chỉ hủy lịch của mình, trước 24h) | `appointment.cancel` |
| Đánh dấu no-show | ✅ | ✅ | ❌ | `appointment.mark_no_show` |

### 3.3 Medical Records module

| Action | Admin | Receptionist | Dentist | Permission code |
| ------ | :---: | :----------: | :-----: | --------------- |
| Bắt đầu Encounter (từ appointment) | ✅ | ❌ | ✅ | `encounter.create` |
| Ghi clinical note | ✅ | ❌ | 🔒 (chỉ encounter mình tạo) | `clinical_note.create` |
| Cập nhật clinical note | ✅ | ❌ | 🔒 (chỉ của mình, trong 24h) | `clinical_note.update` |
| Xem clinical note | ✅ | ❌ | 🔒 (của mình + liên quan) | `clinical_note.read` |
| Tạo Treatment | ✅ | ❌ | 🔒 | `treatment.create` |
| Cập nhật Treatment | ✅ | ❌ | 🔒 | `treatment.update` |
| Xem Treatment | ✅ | ❌ | ✅ | `treatment.read` |
| Tạo / sửa Prescription | ✅ | ❌ | 🔒 | `prescription.create` |
| Xem Prescription | ✅ | ❌ | ✅ | `prescription.read` |
| Cập nhật Dental Chart | ✅ | ❌ | 🔒 | `dental_chart.update` |
| Xem Dental Chart | ✅ | ❌ | ✅ | `dental_chart.read` |
| Đóng encounter | ✅ | ❌ | 🔒 | `encounter.close` |

### 3.4 Billing module

| Action | Admin | Receptionist | Dentist | Permission code |
| ------ | :---: | :----------: | :-----: | --------------- |
| Xem danh sách invoice | ✅ | ✅ | 🔒 (chỉ của mình / của ca mình khám) | `invoice.read` |
| Tạo / cập nhật invoice (draft) | ✅ | ✅ | 🔒 | `invoice.update` |
| Phát hành invoice (draft → issued) | ✅ | ✅ | ❌ | `invoice.issue` |
| Xác nhận thanh toán (thu tiền) | ✅ | ✅ | ❌ | `payment.create` |
| Hoàn tiền / void invoice | ✅ | ❌ | ❌ | `payment.reverse` |
| Xem báo cáo doanh thu | ✅ | ❌ | ❌ | `report.revenue.read` |

> Invoice **luôn sinh tự động** từ `EncounterClosed` event (BR-BILL-002: 1 Invoice = 1 Encounter). Không có "invoice tạo tay" ở MVP.
> `invoice.issue` là permission **riêng** để chuyển trạng thái draft → issued (BR-BILL-001). Không phải `payment.create` (BR-BILL-008 đã sửa: `payment.create` chỉ tạo Payment, không liên quan issue status).

### 3.5 Inventory module

| Action | Admin | Receptionist | Dentist | Permission code |
| ------ | :---: | :----------: | :-----: | --------------- |
| Xem danh sách vật tư | ✅ | ✅ | ✅ | `inventory.read` |
| Tạo vật tư mới | ✅ | ❌ | ❌ | `inventory.create` |
| Cập nhật vật tư | ✅ | ❌ | ❌ | `inventory.update` |
| Nhập kho (nhập từ nhà cung cấp) | ✅ | ✅ | ❌ | `inventory.stock_in` |
| Điều chỉnh kiểm kê | ✅ | ❌ | ❌ | `inventory.adjust` |
| Cấu hình ngưỡng sắp hết (`minStockLevel`) | ✅ | ❌ | ❌ | `inventory.update` (cùng permission với cập nhật item) |
| Xem danh sách low-stock | ✅ | ✅ | ✅ | `inventory.read` (filter `lowStock=true`) |
| Xem báo cáo tồn kho | ✅ | ✅ | ❌ | `inventory.read` (filter `summary=true`) |

> Cảnh báo "sắp hết" dùng field `minStockLevel` trên từng `InventoryItem` (do admin cấu hình qua `inventory.update`). API trả về `lowStock: true` cho UI badge (BR-INV-006).
> Xem lịch sử xuất nhập kho (movements) cũng dùng `inventory.read`.

> Sử dụng vật tư (auto stock-out) chạy trong use case khi encounter.close, không qua UI riêng.

### 3.6 User & Role (Auth module)

| Action | Admin | Receptionist | Dentist | Permission code |
| ------ | :---: | :----------: | :-----: | --------------- |
| Tạo user | ✅ | ❌ | ❌ | `user.create` |
| Xem user | ✅ | ❌ | ❌ | `user.read` |
| Cập nhật user (info, role) | ✅ | ❌ | ❌ | `user.update` |
| Vô hiệu hóa user | ✅ | ❌ | ❌ | `user.deactivate` |
| Tạo / sửa role | ✅ | ❌ | ❌ | `role.upsert` |
| Đổi mật khẩu của mình | ✅ | ✅ | ✅ | `user.change_own_password` |
| Đổi mật khẩu của user khác | ✅ | ❌ | ❌ | `user.reset_password` |

### 3.7 Clinic Settings

| Action | Admin | Receptionist | Dentist | Permission code |
| ------ | :---: | :----------: | :-----: | --------------- |
| Đọc settings | ✅ | ✅ | ✅ | `settings.read` |
| Cập nhật settings | ✅ | ❌ | ❌ | `settings.update` |
| Quản lý Working Schedule của dentist | ✅ | ❌ | 🔒 (chỉ schedule của mình) | `schedule.update` |

### 3.8 Shift Management (Phase 9 — BD-0010)

|| Action | Admin | Receptionist | Dentist | Permission code |
|| ------ | :---: | :----------: | :-----: | --------------- |
|| Đăng ký ca tự do (ShiftRegistration) | 🔒 (own) | ❌ | 🔒 (own) | `shift.register` |
|| Xem ca đăng ký (của phòng khám) | ✅ | ✅ | ❌ | `shift.read.any` |
|| Xem ca đăng ký của mình | ✅ | ❌ | ✅ | `shift.read.own` |
|| Duyệt / từ chối ShiftRegistration | ✅ | ✅ | ❌ | `shift.approve` |
|| Hủy ca đã duyệt | ✅ | ❌ | 🔒 (own, ≥24h trước) | `shift.cancel` |

> `schedule.update` (giờ làm cố định) tách khỏi `shift.register` (ca tự đăng ký) theo BD-0010.
> BS tạo ShiftRegistration → Receptionist/Admin duyệt → trở thành ca có hiệu lực + tính lương.

### 3.9 Payroll Module (Phase 9 — BD-0009)

|| Action | Admin | Receptionist | Dentist | Permission code |
|| ------ | :---: | :----------: | :-----: | --------------- |
|| Xem bảng lương (tất cả BS) | ✅ | ❌ | ❌ | `payroll.read.any` |
|| Xem bảng lương của mình | ✅ | ❌ | ✅ | `payroll.read.own` |
|| Cấu hình payroll toàn hệ thống (tax, BHXH, cycle) | ✅ | ❌ | ❌ | `payroll.config.read` / `payroll.config.update` |
|| Xem chính sách lương của BS | ✅ | ❌ | 🔒 (own) | `payroll.compensation.read` |
|| Cập nhật chính sách lương của BS | ✅ | ❌ | ❌ | `payroll.compensation.update` |
|| Tạo kỳ lương mới | ✅ | ❌ | ❌ | `payroll.period.create` |
|| (Re)compute kỳ lương | ✅ | ❌ | ❌ | `payroll.period.compute` |
|| Manual adjustment (bonus/penalty/deduction) | ✅ | ❌ | ❌ | `payroll.period.adjust` |
|| Khóa kỳ lương (DRAFT → REVIEWING) | ✅ | ❌ | ❌ | `payroll.period.lock` |
|| Duyệt kỳ lương (REVIEWING → APPROVED) | ✅ | ❌ | ❌ | `payroll.period.approve` |
|| Xác nhận đã trả (APPROVED → PAID) | ✅ | ❌ | ❌ | `payroll.period.mark_paid` |
|| Xem payslip của mình | ✅ | ❌ | ✅ | `payslip.read.own` |
|| Xem payslip của BS khác | ✅ | ❌ | ❌ | `payslip.read.any` |

> Lương là dữ liệu nhạy cảm (PII theo luật lao động VN). Mọi truy cập phải audit log (BR-PAY-016).
> `payroll.read.own` của BS chỉ trả về line item của chính mình + payslip PDF. Không thấy của BS khác.
> Sau khi PAID → immutable. Re-open cần admin override + audit (BR-PAY-019).

### 3.10 Dashboard / Reports

| Action | Admin | Receptionist | Dentist | Permission code |
| ------ | :---: | :----------: | :-----: | --------------- |
| Dashboard tổng (doanh thu + appointment) | ✅ | ❌ | ❌ | `report.dashboard_overall.read` |
| Dashboard lịch hẹn hôm nay | ✅ | ✅ | ✅ | `report.today_appointments.read` |
| Dashboard cá nhân (dentist) | ✅ | ❌ | ✅ | `report.own_performance.read` |

### 3.11 AI Module (Phase 8.0)

| Action | Admin | Receptionist | Dentist | Assistant | Permission code |
| ------ | :---: | :----------: | :-----: | :-------: | --------------- |
| Xem AI tóm tắt hồ sơ bệnh nhân | ✅ | ✅ | ✅ | ❌ | `ai.summary.read` |

> AI summary chỉ gửi PII-light tới LLM (BR-AI-002): allergies, chronicDiseases, currentMedications, top N encounter gần nhất (chief complaint, diagnosis, treatmentPlanText, treatment procedure), số encounter `IN_PROGRESS`, số hóa đơn chưa thanh toán. Không bao giờ gửi tên, ngày sinh, SĐT, CCCD, địa chỉ.
> LLM fail → fallback rule-based (BR-AI-003). Cache Redis 1h (BR-AI-004).
> UI phải hiện disclaimer "AI có thể sai, xác nhận lại trước khi dùng" (BR-AI-001).

---

## 4. Row-level filter (chi tiết cho MVP)

Các permission đánh dấu 🔒 có row-level filter:

| Permission | Filter rule |
| ---------- | ----------- |
| `appointment.read.own` | `WHERE dentist_id = currentUserId` |
| `clinical_note.create/update/read` | `WHERE encounter.dentist_id = currentUserId` (hoặc là encounter do mình tạo) |
| `treatment.create/update/read` | như clinical_note |
| `prescription.create/read` | như clinical_note |
| `dental_chart.update/read` | như clinical_note |
| `invoice.read` (cho dentist) | `WHERE invoice_items.treatment.encounter.dentist_id = currentUserId` |
| `encounter.create` | chỉ dentist được tạo encounter của chính appointment mình sắp khám |
| `shift.register` (Dentist) | `WHERE dentist_id = currentUserId` |
| `shift.read.own` | `WHERE dentist_id = currentUserId` |
| `payroll.read.own` (Dentist) | `WHERE dentist_id = currentUserId` |
| `payroll.compensation.read` (Dentist) | `WHERE dentist_id = currentUserId` |
| `payslip.read.own` | `WHERE payroll_line_item.dentist_id = currentUserId` |

> Backend **phải** thực thi row-level. Frontend chỉ là UX, không phải security.

---

## 5. Permission đặc biệt (system level)

| Permission code | Ý nghĩa | Ai giữ |
| --------------- | ------- | ------ |
| `system.audit.read` | Đọc audit log | Admin |
| `system.backup.read` | Tạo / tải backup | Admin |
| `system.integration.manage` | Quản lý tích hợp bên ngoài | Admin |

---

## 6. Mặc định khi ship MVP

Trong DB sẽ có:

- 3 roles cố định (`clinic_admin`, `receptionist`, `dentist`).
- ~30 permission theo bảng trên.
- Admin có TẤT CẢ permission (qua flag `is_super_admin` trên role hoặc gán từng permission — quyết định khi viết spec Auth).

---

## 7. Khi cần thêm permission mới

### Quy trình

1. **Xác định resource + action** (vd: `payment.refund`).
2. **Sửa ma trận này trước** (thêm row cho mỗi actor).
3. **Cập nhật spec module liên quan** ở `03_Specification/`.
4. **Migration DB**: thêm row vào bảng `permissions`, gán vào role tương ứng.
5. **Code**: cập nhật guard NestJS.

### Nguyên tắc

- Một permission = một hành động + một resource. Không gộp chung.
- Tránh tạo permission trùng tên nhưng khác ý nghĩa giữa các module.
- Nếu một actor vừa cần X vừa cần Y → tách thành 2 permission riêng. Role được phép gán cả 2.

---

## 8. Liên kết

- [`business-context.md`](business-context.md) — tổng quan vai trò.
- [`business-flow-overview.md`](business-flow-overview.md) — flow chi tiết.
- [`../02_Glossary/GLOSSARY.md`](../02_Glossary/GLOSSARY.md) — định nghĩa `Permission`, `Role`.
- [`../ADR/0004-permission-based-rbac.md`](../ADR/0004-permission-based-rbac.md) — ADR gốc.
- Spec `Auth/` (chưa viết) — sẽ ánh xạ ma trận này vào model.

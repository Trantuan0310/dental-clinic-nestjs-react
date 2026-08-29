# Hướng dẫn sử dụng cho Quản trị viên phòng khám (Clinic Admin)

> **Đối tượng:** Quản trị viên phòng khám (`clinic_admin`)  
> **Quyền hạn:** Toàn quyền trên hệ thống  
> **Ngày cập nhật:** 02/08/2026

---

## 1. Đăng nhập

1. Mở trình duyệt và truy cập `http://localhost:5173` (môi trường dev) hoặc URL do IT cung cấp.
2. Nhập email và mật khẩu đã được cấp.
3. Nhấn **Đăng nhập**.

> **Mẹo:** Tick **Ghi nhớ đăng nhập** để giữ phiên 7 ngày. Hệ thống hỗ trợ 2FA qua email (nếu được bật).

### Đăng xuất
- Click avatar góc phải header → **Đăng xuất**.

### Quên mật khẩu
- Tại màn hình đăng nhập, click **Quên mật khẩu** → nhập email → kiểm tra hộp thư → click link đặt lại.

---

## 2. Tổng quan Dashboard

Sau khi đăng nhập, bạn sẽ thấy Dashboard với:

- **KPI cards** (4 ô): Tổng doanh thu, tổng bệnh nhân, lịch hẹn hôm nay, công nợ.
- **Biểu đồ doanh thu theo ngày/tháng**.
- **Xếp hạng bác sĩ** theo doanh thu.
- **Top thủ thuật** mang lại doanh thu cao nhất.
- **Tóm tắt AI**: gợi ý tổng quan từ LLM về hồ sơ bệnh nhân (panel bên phải).

### Chọn khoảng thời gian
- Dropdown phía trên-cùng: **Hôm nay / 7 ngày / 30 ngày / Tùy chỉnh**.

---

## 3. Quản lý người dùng

### Truy cập
**Menu → Quản trị → Người dùng** (`/admin/users`)

### Thêm người dùng mới
1. Nhấn **+ Tạo người dùng**.
2. Điền:
   - **Họ tên** (bắt buộc)
   - **Email** (bắt buộc, duy nhất)
   - **Mật khẩu tạm** (≥ 8 ký tự, có chữ hoa, thường, số, ký tự đặc biệt)
   - **Vai trò** (1 hoặc nhiều role)
   - **Trạng thái**: Active / Inactive
3. Nhấn **Tạo** → hệ thống gửi email xác nhận.

### Chỉnh sửa / Reset mật khẩu / Vô hiệu hóa
- Click biểu tượng **⋮** ở hàng người dùng → chọn thao tác.

> **Lưu ý:** Không thể xóa cứng người dùng đã phát sinh dữ liệu. Chỉ có thể **Vô hiệu hóa** (BR-USR-005).

---

## 4. Quản lý Vai trò & Phân quyền

### Truy cập
**Menu → Quản trị → Vai trò** (`/admin/roles`)

### Cấu trúc phân quyền
- **Vai trò** = tập hợp **Quyền** (permission codes).
- Ví dụ: `clinic_admin` có tất cả 60+ permission codes (xem `backend/prisma/seed.ts`).
- `receptionist` có ~30 permission codes (xem bệnh nhân, lịch hẹn, hóa đơn).
- `dentist` có ~25 permission codes (xem bệnh nhân được phân công, phiên khám, điều trị).

### Thay đổi phân quyền
1. Click vào tên vai trò.
2. Tick/bỏ tick các permission ở table bên phải.
3. Nhấn **Lưu**.

> **Cảnh báo:** Thay đổi phân quyền có hiệu lực ngay. Người dùng đang mở trang sẽ thấy menu thay đổi sau khi refresh.

---

## 5. Cài đặt hệ thống

### Truy cập
**Menu → Quản trị → Cài đặt** (`/admin/settings`)

Bao gồm:
- **Thông tin phòng khám**: tên, địa chỉ, SĐT, email, giờ làm việc.
- **Cấu hình hóa đơn**: tiền tố mã hóa đơn, thuế VAT, điều khoản thanh toán.
- **Cấu hình payroll**: hệ số OT, các khoản khấu trừ mặc định.
- **Theme**: Light / Dark / System.

---

## 6. Audit Log

### Truy cập
**Menu → Quản trị → Nhật ký** (`/admin/audit-logs`)

Xem tất cả thao tác:
- Bộ lọc: actor, action, target type, khoảng thời gian.
- Pagination cursor-based (20 logs / trang).
- Click **Xuất CSV** để tải về.

---

## 7. Báo cáo

### Doanh thu
**Menu → Báo cáo → Doanh thu** (`/reports`)

Biểu đồ:
- Doanh thu theo ngày (14 ngày gần nhất).
- Doanh thu theo tháng (12 tháng gần nhất).
- Theo nguồn: trực tiếp / từ lịch hẹn / từ bệnh nhân cũ.
- Theo bác sĩ.
- Theo thủ thuật.

### Công nợ
**Menu → Báo cáo → Công nợ** (`/reports/outstanding`)

Danh sách hóa đơn chưa thanh toán, phân loại theo độ tuổi nợ.

---

## 8. Quản lý lịch làm việc (Payroll)

### Cấu hình lương
**Menu → Payroll → Cấu hình** (`/payroll/config`)

Cấu hình chung:
- Hệ số OT (mặc định: 1.5x).
- Hệ số ngày lễ (2x).
- BHXH, BHYT, BHTN (mặc định: 10.5% / 1.5% / 1%).
- Số ngày công chuẩn / tháng (mặc định: 26).

### Hệ số lương bác sĩ
**Menu → Payroll → Quản lý lương bác sĩ** (`/payroll/compensations`)

- Click **+ Tạo** → chọn bác sĩ + loại hình (`monthly` / `percentage` / `hybrid`).
- Lưu lịch sử thay đổi.

### Kỳ lương
**Menu → Payroll → Kỳ lương** (`/payroll/periods`)

Workflow:
1. **Tạo kỳ** (ví dụ: 2026-08).
2. **Tính toán** (compute) → snapshot giờ làm, doanh thu, điều chỉnh.
3. **Khóa** (lock) → không thể sửa sau khi khóa.
4. **Phê duyệt** (approve) → admin ký duyệt.
5. **Đánh dấu đã trả** (mark paid) → chốt.

### Đăng ký ca (Shift Registration)
**Menu → Payroll → Duyệt ca** (`/admin/shifts/pending`)

- Bác sĩ đăng ký ca làm thêm → admin duyệt/từ chối.

---

## 9. Quản lý tồn kho

### Truy cập
**Menu → Kho vật tư** (`/inventory`)

### Nhập kho
1. **+ Nhập kho** → chọn vật tư + số lượng + giá nhập.
2. Hệ thống tự cập nhật `currentStock` + ghi log.

### Xuất kho
- Khi bác sĩ lưu điều trị có sử dụng vật tư, hệ thống tự xuất kho (BR-INV-003).

### Điều chỉnh tồn
- **+ Điều chỉnh** → nhập số chênh lệch + lý do → hệ thống ghi audit log.

---

## 10. Xử lý sự cố thường gặp

| Triệu chứng | Nguyên nhân | Cách xử lý |
|---|---|---|
| Lỗi 500 khi load dashboard | Backend chưa chạy | Verify `npm run start:dev` đang chạy ở cổng 3000 |
| Login thất bại | Sai email/pass | Click **Quên mật khẩu** |
| Permission denied | Role chưa được gán | Vào `/admin/users` → Role → Assign |
| Sidebar trống | Cache trình duyệt | Ctrl+Shift+R (hard reload) |
| Theme tối OK nhưng card sáng | Token chưa cập nhật | `/admin/settings` → chọn Dark |

---

## 11. Liên hệ hỗ trợ

- **Developer:** Trần Tuấn Anh (MSSV: 22010130)
- **Email:** admin@gensmile.vn
- **GitHub:** [DATN repository]

> Cập nhật tài liệu này mỗi khi có thay đổi workflow.

# Hướng dẫn sử dụng cho Lễ tân (Receptionist)

> **Đối tượng:** Lễ tân (`receptionist`)  
> **Quyền hạn:** Bệnh nhân, lịch hẹn, hóa đơn, thanh toán  
> **Ngày cập nhật:** 02/08/2026

---

## 1. Đăng nhập & Chọn ca

1. Truy cập `http://localhost:5173` → nhập email + mật khẩu.
2. Sau khi vào Dashboard, kiểm tra **Bệnh nhân hôm nay** + **Lịch hẹn hôm nay** ở panel.

---

## 2. Quản lý bệnh nhân

### Tạo bệnh nhân mới
**Menu → Bệnh nhân → + Tạo bệnh nhân** (`/patients/new`)

Bước 1: Nhập thông tin cơ bản
- **Họ tên** (bắt buộc).
- **Ngày sinh** (bắt buộc, dùng date picker).
- **Giới tính**: Nam / Nữ / Khác.
- **SĐT chính** (bắt buộc, hệ thống check trùng → cảnh báo).

Bước 2: (tùy chọn) Điền thêm
- Email, địa chỉ, nghề nghiệp.
- **Dị ứng** (quan trọng — sẽ cảnh báo bác sĩ mỗi lần khám).
- **Bệnh nền**, **thuốc đang dùng**.
- **Người liên hệ khẩn cấp**.

Bước 3: Nhấn **Tạo** → hệ thống sinh mã bệnh nhân tự động (BR-PT-001).

### Tìm bệnh nhân
- Header (top-right): **Search** → gõ tên / mã BN / SĐT → Enter.
- Hoặc vào `/patients?q=...`.

### Xem / Sửa bệnh nhân
- Click vào tên bệnh nhân → trang chi tiết.
- Tab **Hồ sơ**: thông tin cá nhân.
- Tab **Lịch sử khám**: các encounter trước.
- Tab **Hóa đơn**: danh sách invoice liên quan.

### Trùng bệnh nhân (BR-PT-007)
- Khi tạo mới, hệ thống tự check `primaryPhone` + `fullName` + `dob`.
- Nếu trùng → hiển thị danh sách ứng viên → chọn **Sử dụng bệnh nhân có sẵn** hoặc **Tạo mới**.

### Gộp bệnh nhân (BR-PT-019)
- **Menu → Bệnh nhân → Chọn 2 bệnh nhân → Gộp**.
- Bệnh nhân **mục tiêu** (giữ lại) + **bệnh nhân nguồn** (xóa mềm).
- Lịch sử khám + invoices sẽ chuyển sang mục tiêu.

---

## 3. Quản lý lịch hẹn

### Đặt lịch hẹn
**Menu → Lịch hẹn → + Tạo lịch** (`/appointments`)

1. Chọn **Bệnh nhân** (search box).
2. Chọn **Bác sĩ**.
3. Chọn **Ngày** + **Giờ bắt đầu** (hệ thống check slot trống).
4. Chọn **Thời lượng** (mặc định 30 phút).
5. **Lý do khám** (tùy chọn).
6. Nhấn **Tạo**.

> **Lưu ý:** Không thể đặt lịch trong quá khứ (BD-0010). Lịch hẹp trùng slot → báo lỗi (BR-APPT-014).

### Check-in bệnh nhân
- Tại Calendar page, click vào lịch hẹn → **Check-in**.
- Hoặc trong ngày: **Menu → Bệnh nhân → Hàng chờ hôm nay** → check-in.

### Cancel / Reschedule
- Click vào lịch → menu **⋮** → **Hủy** (nhập lý do) hoặc **Đổi lịch** (chọn slot mới).

### No-show
- Bệnh nhân không đến sau 15 phút → click **Đánh dấu vắng**.
- Hệ thống ghi nhật ký (BR-APPT-008).

---

## 4. Hóa đơn & Thanh toán

### Tạo hóa đơn
**Menu → Hóa đơn → + Tạo hóa đơn** (`/billing/invoices/new`)

1. Chọn **Bệnh nhân**.
2. Chọn **Encounter** (phiên khám) đã close.
3. Điều chỉnh **danh sách thủ thuật** + **số lượng** + **giá**.
4. Thêm **giảm giá** (nếu có).
5. Nhấn **Tạo** (status: DRAFT).

### Xuất hóa đơn (Issue)
- Chọn hóa đơn DRAFT → **Xuất hóa đơn** → status chuyển ISSUED.
- Hệ thống sinh số hóa đơn + ghi audit log.

### Thanh toán
1. Chọn hóa đơn ISSUED → **+ Thanh toán**.
2. Nhập **số tiền** + **phương thức** (Tiền mặt / Chuyển khoản / Thẻ / Ví điện tử).
3. Có thể thanh toán **nhiều lần** (partial payment).
4. Hóa đơn chuyển **PAID** khi tổng tiền thanh toán = tổng tiền hóa đơn.

### Hủy hóa đơn (Void)
- Chỉ hóa đơn **DRAFT** hoặc **ISSUED** chưa thanh toán mới hủy được.
- Click **Hủy** → nhập lý do → status VOIDED.

### In hóa đơn
- Click **In** → file PDF sẽ tải về (theo mẫu nhà nước quy định).

---

## 5. Hàng chờ (Queue)

**Menu → Hôm nay** (`/today`)

Hiển thị:
- Lịch hẹn hôm nay (theo giờ).
- Bệnh nhân đang chờ (status: checked_in).
- Bệnh nhân đang khám (status: in_progress).
- Bệnh nhân đã xong (status: completed).

---

## 6. Tìm kiếm nhanh

- Header search box: tìm bệnh nhân.
- **`Ctrl+K`** (Command Palette): mở tìm kiếm toàn cục.

---

## 7. Lưu ý quan trọng

1. **Không xóa cứng dữ liệu** — tất cả là soft delete (BR-PT-010).
2. **Check-in trước 15 phút** so với giờ hẹn (BR-APPT-007).
3. **Hóa đơn sau khi ISSUED không sửa dòng** — chỉ có thể void + tạo lại.
4. **Thanh toán không thể xóa** — chỉ **reverse** (ghi lý do).

---

## 8. Liên hệ

Khi cần hỗ trợ kỹ thuật → liên hệ admin phòng khám.

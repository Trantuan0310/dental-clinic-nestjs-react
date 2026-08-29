# Hướng dẫn sử dụng cho Bác sĩ (Dentist)

> **Đối tượng:** Bác sĩ nha khoa (`dentist`)  
> **Quyền hạn:** Bệnh nhân được phân công, phiên khám, điều trị, dental chart  
> **Ngày cập nhật:** 02/08/2026

---

## 1. Đăng nhập

1. Truy cập `http://localhost:5173` → đăng nhập bằng email + mật khẩu.
2. Sau khi vào, bạn sẽ thấy **Hàng chờ hôm nay** với các bệnh nhân được phân công.

---

## 2. Hàng chờ cá nhân (My Queue)

**Menu → Hôm nay** (`/today`) hoặc click tab **Hàng chờ của tôi**

Hiển thị tất cả bệnh nhân của bạn trong ngày:
- **Sắp tới** (scheduled, confirmed).
- **Đang chờ** (checked_in).
- **Đang khám** (in_progress).
- **Đã xong** (completed).

### Bắt đầu khám
1. Click vào bệnh nhân **đang chờ**.
2. Nhấn **Bắt đầu khám** → hệ thống tạo **Encounter** mới + chuyển status → `in_progress`.
3. Sau khi bắt đầu, vào trang chi tiết encounter.

---

## 3. Phiên khám (Encounter)

### Trang Encounter có 4 tab:

#### Tab 1: Tóm tắt (Summary)
- **Lý do khám** (chief complaint).
- **Chẩn đoán** (sơ bộ).
- **Tiền sử bệnh** (lấy từ hồ sơ bệnh nhân).
- **Dị ứng** (highlight đỏ nếu có).
- **Thuốc đang dùng**.

#### Tab 2: Ghi chú lâm sàng (Clinical Notes)
- Theo cấu trúc **SOAP**:
  - **S**ubjective (cảm nhận chủ quan)
  - **O**bjective (khám thực thể)
  - **A**ssessment (đánh giá)
  - **P**lan (kế hoạch điều trị)
- Hoặc ghi chú tự do (raw notes).
- Nhấn **Lưu** → cập nhật encounter.

#### Tab 3: Điều trị (Treatments)
- **+ Thêm thủ thuật**:
  - Chọn răng (tooth number).
  - Chọn mã thủ thuật (treatment code).
  - Số lượng.
  - Giá (tự động lấy từ bảng giá).
  - Mô tả.
- **Sử dụng vật tư** (nếu có): tự động trừ tồn kho.
- Mỗi dòng có nút **Sửa** / **Xóa**.

#### Tab 4: Đơn thuốc (Prescriptions)
- Tạo đơn thuốc:
  - **Bệnh nhân**.
  - **Danh sách thuốc** (tên + liều + số lượng + cách dùng).
  - **Ghi chú** (ví dụ: "Uống sau ăn").
- In đơn thuốc → đưa bệnh nhân.

#### Tab 5: Dental Chart
- Bảng răng 32 chiếc (hệ FDI):
  - Click vào răng → chọn **tình trạng** (sâu, đã nhổ, đã trám, đã điều trị tủy…).
  - Click **+ Ghi chú** cho răng.
- Mỗi lần khám → snapshot dental chart.

### Hoàn tất encounter
1. Sau khi đủ thông tin → nhấn **Đóng phiên khám** (top-right).
2. Confirm summary + chọn ngày tái khám (nếu có).
3. Hệ thống tự động:
   - Status encounter → `closed`.
   - **Tạo hóa đơn nháp** (DRAFT) cho lễ tân xử lý.
   - Ghi audit log.

---

## 4. Bệnh nhân của tôi

**Menu → Bệnh nhân của tôi** (`/my-patients`)

Danh sách bệnh nhân đã từng khám với bạn:
- Tên, mã BN, ngày khám gần nhất.
- Click vào → xem chi tiết + lịch sử khám.

### Lịch sử khám
- Mỗi encounter: ngày khám, chẩn đoán, điều trị.
- Tab **Dental Chart History** → xem tiến trình điều trị từng răng qua các lần khám.

---

## 5. Lịch hẹn cá nhân

**Menu → Lịch hẹn** (`/appointments`)

- Xem lịch theo **Ngày / Tuần / Tháng**.
- Click vào lịch → xem chi tiết + bệnh nhân.
- **Tạo lịch mới** cho bệnh nhân của bạn.
- **Check-in** bệnh nhân khi đến.

### Đăng ký ca làm (Shift Registration)
**Menu → Ca làm của tôi** (`/my-shifts`)

- Đăng ký ca làm thêm (ngoài giờ hành chính).
- Admin sẽ duyệt trong vòng 24h.
- Ca đã duyệt → tính vào bảng lương.

---

## 6. Bảng lương cá nhân

**Menu → Bảng lương → Của tôi** (`/payroll/me`)

### Xem payslip
- Chọn **kỳ lương** (tháng).
- Hệ thống hiển thị:
  - **Lương cứng** (theo hệ số).
  - **Hoa hồng** (theo % doanh thu).
  - **OT** (nếu có).
  - **Khấu trừ** (BHXH, thuế TNCN).
  - **Thực nhận**.

### Tải PDF
- Click **Tải phiếu lương** → file PDF.

---

## 7. AI Summary

**Dashboard → AI Tóm tắt**

Panel bên phải hiển thị:
- LLM-generated summary về bệnh nhân (triệu chứng, tiền sử, dị ứng).
- Giúp bạn nắm nhanh trước khi khám.
- **Lưu ý:** Luôn đọc kỹ + tự verify — AI có thể sai.

### Sử dụng
1. Chọn bệnh nhân từ dropdown.
2. Hệ thống tự động tạo summary (cache 30 phút).
3. Click **Refresh** nếu muốn cập nhật.

---

## 8. Lưu ý quan trọng

1. **Mỗi bệnh nhân chỉ có 1 encounter OPEN** tại 1 thời điểm (BR-MR-001).
2. **Encounter phải đóng trong 24h** sau khi bắt đầu (BR-MR-005).
3. **Dị ứng** = cảnh báo bắt buộc — luôn check trước khi kê đơn.
4. **Dental chart** là duy nhất theo thời gian — không thể sửa sau khi encounter closed (chỉ thêm addendum).
5. **Tồn kho** tự động trừ khi lưu treatment — kiểm tra trước khi dùng vật tư đắt tiền.

---

## 9. Xử lý sự cố

| Triệu chứng | Cách xử lý |
|---|---|
| Không thấy bệnh nhân trong queue | Kiểm tra lịch hẹn có dentistId = mình |
| Encounter không lưu | Kiểm tra kết nối mạng + refresh |
| Dental chart không cập nhật | Đóng tab + mở lại |
| AI summary không hiển thị | Backend Redis có thể đang restart |

---

## 10. Liên hệ

- Sự cố kỹ thuật → liên hệ admin.
- Thắc mắc nghiệp vụ → liên hệ quản lý phòng khám.

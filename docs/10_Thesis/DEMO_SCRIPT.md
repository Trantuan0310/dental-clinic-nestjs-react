# Kịch bản Demo Sản phẩm

> **Phiên bản:** 1.0  
> **Ngày:** 02/08/2026  
> **Thời lượng demo:** 15-20 phút  
> **Tài khoản demo:** `admin@gensmile.vn` / `Admin@123`

---

## CHUẨN BỊ TRƯỚC DEMO

### 1. Khởi động hệ thống
```bash
# Terminal 1: Backend
cd "C:\Users\tuans\OneDrive\Desktop\ĐATN\backend"
npm run db:up
npm run start:dev

# Terminal 2: Frontend
cd "C:\Users\tuans\OneDrive\Desktop\ĐATN\frontend"
npm run dev
```

### 2. Mở trình duyệt
- Truy cập `http://localhost:5173`
- Đăng nhập: `admin@gensmile.vn` / `Admin@123`

### 3. Chuẩn bị data
- Database đã có seed data (3 users, 3 roles, 60+ permissions, 20 patients, 50 appointments, 30 encounters, 25 invoices).

---

## PHẦN 1: GIỚI THIỆU TỔNG QUAN (2 phút)

> **Nói:** "Hệ thống quản lý phòng khám nha khoa GenSmile là một Modular Monolith xây dựng theo triết lý AI-first và Specification-driven. Hôm nay tôi sẽ demo 7 luồng chính."

### 1.1. Dashboard
- Chỉ vào **Dashboard** (default page).
- Giải thích: 4 KPI cards, biểu đồ doanh thu, xếp hạng bác sĩ, AI summary panel.

### 1.2. Thanh điều hướng
- Click vào **Bệnh nhân** → **Lịch hẹn** → **Hóa đơn** → **Báo cáo** → **Cài đặt**.
- Nói: "Sidebar thay đổi theo role + permissions."

---

## PHẦN 2: QUẢN LÝ BỆNH NHÂN (3 phút)

### 2.1. Danh sách bệnh nhân
- Vào **Bệnh nhân** (`/patients`).
- Chỉ vào: tìm kiếm, filter trạng thái, nút thêm mới.

### 2.2. Tạo bệnh nhân mới
- Click **+ Tạo bệnh nhân**.
- Điền:
  - Họ tên: "Nguyễn Văn Demo"
  - Ngày sinh: chọn 1990-01-15
  - Giới tính: Nam
  - SĐT: 0901234567
  - Dị ứng: "Penicillin"
- Submit → hệ thống:
  - Check trùng (BR-PT-007) → cảnh báo nếu có SĐT trùng.
  - Sinh mã BN tự động (BR-PT-001).
  - Navigate qua trang chi tiết.

### 2.3. Trang chi tiết bệnh nhân
- Show 3 tab: **Hồ sơ / Lịch sử khám / Hóa đơn**.
- Highlight **Dị ứng** (màu đỏ).

### 2.4. Gộp bệnh nhân trùng
- Click **⋮** → **Gộp** (nếu có 2 bệnh nhân trùng).
- Chọn bệnh nhân mục tiêu + nguồn → Confirm.

---

## PHẦN 3: QUẢN LÝ LỊCH HẸN (3 phút)

### 3.1. Calendar view
- Vào **Lịch hẹn** (`/appointments`).
- Switch giữa **Ngày / Tuần / Tháng**.
- Chỉ vào các màu sắc theo status.

### 3.2. Đặt lịch hẹn mới
- Click **+ Tạo lịch**.
- Chọn bệnh nhân (vừa tạo ở trên) → bác sĩ → ngày mai 9:00 → 30 phút → "Khám tổng quát".
- Submit → xuất hiện trên calendar.

### 3.3. Check-in bệnh nhân
- Click vào lịch hẹn → **Check-in**.
- Bệnh nhân chuyển sang hàng chờ.

---

## PHẦN 4: PHIÊN KHÁM (4 phút)

### 4.1. Bắt đầu encounter
- Vào **Hôm nay** (`/today`).
- Click vào bệnh nhân "đã check-in" → **Bắt đầu khám**.
- Hệ thống tạo encounter mới.

### 4.2. Trang Encounter
- Show 5 tab: **Summary / Clinical Notes / Treatments / Prescriptions / Dental Chart**.

#### Tab Summary
- Lý do khám: "Đau răng hàm dưới trái".
- Chẩn đoán: "Viêm tủy răng 36".

#### Tab Clinical Notes
- Ghi SOAP:
  - S: "Bệnh nhân đau tự phát 3 ngày, tăng về đêm".
  - O: "Răng 36 sâu lớn, gõ +".
  - A: "Viêm tủy không hồi phục răng 36".
  - P: "Điều trị tủy + bọc sứ".

#### Tab Treatments
- **+ Thêm thủ thuật**:
  - Răng: 36
  - Mã: "ENDO-001" (điều trị tủy)
  - SL: 1
  - Giá: 1,500,000 VNĐ

#### Tab Dental Chart
- Click răng 36 → chọn tình trạng "Đã điều trị tủy".

### 4.3. Đóng encounter
- Click **Đóng phiên khám** → summary → confirm.
- Hệ thống:
  - Encounter status → closed.
  - Tự động tạo invoice DRAFT.

---

## PHẦN 5: HÓA ĐƠN & THANH TOÁN (3 phút)

### 5.1. Xem hóa đơn tự động
- Vào **Hóa đơn** (`/billing/invoices`).
- Click vào invoice vừa tạo (status: DRAFT).

### 5.2. Xuất hóa đơn
- Click **Xuất hóa đơn** → status: ISSUED.
- Số hóa đơn: `INV-2026-08-00001`.

### 5.3. Thanh toán
- Click **+ Thanh toán** → số tiền 1,500,000 → phương thức "Tiền mặt" → Submit.
- Status: PAID.

### 5.4. In hóa đơn
- Click **In** → file PDF tải về.

---

## PHẦN 6: BÁO CÁO & DASHBOARD (2 phút)

### 6.1. Dashboard cập nhật
- Quay lại Dashboard.
- KPI "Doanh thu hôm nay" tăng.

### 6.2. Báo cáo doanh thu
- Vào **Báo cáo** (`/reports`).
- Show các biểu đồ:
  - Doanh thu 14 ngày.
  - Top 5 bác sĩ.
  - Top 5 thủ thuật.

---

## PHẦN 7: ADMIN (2 phút)

### 7.1. Quản lý user
- Vào **Quản trị → Người dùng** (`/admin/users`).
- Show permissions matrix.

### 7.2. Audit log
- Vào **Quản trị → Nhật ký** (`/admin/audit-logs`).
- Filter theo actor "admin" → show 10+ logs vừa thực hiện.

---

## PHẦN 8: KẾT THÚC (1 phút)

### 8.1. Tóm tắt
> "Hệ thống đã hoàn thành MVP với 10 modules, 90+ API endpoints, 60+ permission codes. Tất cả đều production-ready với 225 tests pass."

### 8.2. Hỏi đáp
- Mời câu hỏi từ hội đồng.

---

## CHECKLIST TRƯỚC DEMO

- [ ] Backend đang chạy (cổng 3000).
- [ ] Frontend đang chạy (cổng 5173).
- [ ] Database đã có seed data.
- [ ] Admin login OK.
- [ ] Bệnh nhân demo đã tạo sẵn.
- [ ] Test microphone + projector.
- [ ] Có backup video demo (nếu mạng chập chờn).

## TIPS KHI DEMO

1. **Nói chậm, rõ ràng** — hội đồng có thể không quen công nghệ.
2. **Highlight business rules** (BR-PT-007, BR-APPT-014, BR-MR-001) — chứng minh đã phân tích kỹ.
3. **Show audit log** — chứng minh hệ thống production-ready.
4. **Nếu lỗi** — đừng panic, có backup video.
5. **Đừng đọc slide** — chỉ highlight keyword, chi tiết nói tự nhiên.
6. **Trả lời câu hỏi "Tại sao?"** — luôn có lý do (BD-001, ADR-0001, etc.).

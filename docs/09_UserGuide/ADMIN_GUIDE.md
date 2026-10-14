# Hướng dẫn sử dụng cho Quản trị viên phòng khám (Clinic Admin)

> **Đối tượng:** Quản trị viên phòng khám (`clinic_admin`)  
> **Quyền hạn:** Quản lý toàn bộ phòng khám; phiên khám chỉ xem (trừ khi tài khoản có thêm vai trò Bác sĩ). Chi tiết: [PHAN_QUYEN.md](PHAN_QUYEN.md)  
> **Ngày cập nhật:** 14/10/2026

---

## 1. Đăng nhập

1. Mở trình duyệt và truy cập `http://localhost:5173` (môi trường dev) hoặc URL do IT cung cấp.
2. Nhập email và mật khẩu đã được cấp. Email không phân biệt chữ hoa, chữ thường.
3. Nhấn **Đăng nhập**.

> Tài khoản admin tạo bởi seed bắt buộc đổi mật khẩu ở lần đăng nhập đầu. Phiên đăng nhập được giữ tối đa 7 ngày.
>
> Nhập sai mật khẩu 6 lần liên tiếp thì tài khoản bị khóa 15 phút (xem [TROUBLESHOOTING.md](TROUBLESHOOTING.md)).

### Đăng xuất
- Bấm menu tài khoản ở góc phải header → **Đăng xuất**.

### Quên mật khẩu
- Tại màn hình đăng nhập, bấm **Quên mật khẩu** → nhập email → mở link trong hộp thư để đặt lại.
- Máy chủ chưa cấu hình gửi email thì nhờ một quản trị viên khác **Cấp mật khẩu tạm** (mục 3).

---

## 2. Dashboard

Chọn khoảng thời gian ở góc trên: **Hôm nay / 7 ngày / 15 ngày / 30 ngày / 6 tháng**.

Quản trị viên thấy:

- **Hàng KPI**: doanh thu, bệnh nhân (khách mới / khách cũ), lịch hẹn (không tính lịch hủy)…
- **Thống kê lịch khám**: đến, vắng, hủy, về sớm, vãng lai, online.
- **AI tóm tắt hồ sơ**: chọn một bệnh nhân có lịch hôm nay để xem tóm tắt (xem [DENTIST_GUIDE.md](DENTIST_GUIDE.md#8-ai-tóm-tắt-hồ-sơ)).
- Doanh thu theo nhóm khách, theo nguồn, theo thủ thuật, xếp hạng bác sĩ.
- Biểu đồ doanh thu theo ngày và theo tháng, lịch hẹn theo ngày.
- Tóm tắt tài chính và công nợ.

Cách tính các số liệu: xem mục "Số liệu báo cáo" trong [PHAN_QUYEN.md](PHAN_QUYEN.md#số-liệu-báo-cáo).

---

## 3. Quản lý người dùng

### Truy cập
**Menu → Quản trị → Người dùng** (`/admin/users`)

### Thêm người dùng mới
1. Nhấn **Tạo người dùng**.
2. Điền **Email**, **Họ tên** và chọn **một Vai trò**.
3. Nhấn **Tạo**. Tài khoản ở trạng thái **Chờ thiết lập**, hệ thống gửi link đặt mật khẩu tới email đó.
4. Nếu báo "Chưa gửi được email", dùng **Cấp mật khẩu tạm** ở hàng người dùng đó. Mật khẩu tạm chỉ hiện một lần.

Người dùng đặt mật khẩu qua link (hoặc đổi mật khẩu tạm ở **Tài khoản của tôi**) thì chuyển sang **Hoạt động**.

> Muốn tạo bác sĩ: nên tạo từ **Nhân sự** (mục 9) để có cả hồ sơ nhân viên, tài khoản và hồ sơ bác sĩ.

### Sửa, gửi lại link, vô hiệu hóa
Ở mỗi hàng người dùng có các thao tác:
- **Sửa**: đổi họ tên, email đăng nhập, vai trò. Đổi vai trò sẽ đăng xuất người đó khỏi mọi phiên (kể cả khi tự đổi của mình).
- **Gửi lại link thiết lập** / **Gửi link đặt lại mật khẩu**.
- **Cấp mật khẩu tạm** (không cần email). Thao tác này cũng mở khóa tài khoản đang bị khóa do nhập sai.
- **Vô hiệu hóa** (lý do không bắt buộc) / **Kích hoạt lại**.

> **Lưu ý:**
> - Không xóa cứng người dùng, chỉ **Vô hiệu hóa**.
> - Không tự gỡ được vai trò Quản trị của chính mình, và không gỡ được vai trò đó của quản trị viên cuối cùng.
> - Gỡ vai trò Bác sĩ bị chặn khi bác sĩ còn lịch hẹn sắp tới hoặc phiên khám đang mở.

---

## 4. Vai trò và phân quyền

### Truy cập
**Menu → Quản trị → Vai trò & quyền** (`/admin/roles`)

- Ba vai trò có sẵn (Quản trị viên, Bác sĩ, Lễ tân) **không sửa được quyền** trên màn hình.
- Muốn cấu hình khác: **Tạo vai trò** mới, tick các quyền cần cấp, rồi gán vai trò đó cho người dùng ở trang Người dùng.
- Khi tạo vai trò, nhớ cấp quyền xem tương ứng (`*.read.any` hoặc `*.read.own`) cho mọi quyền sửa.

Bảng quyền của ba vai trò có sẵn và các lưu ý khi tự tạo vai trò: [PHAN_QUYEN.md](PHAN_QUYEN.md).

---

## 5. Cài đặt

### Truy cập
**Menu → Quản trị → Cài đặt** (`/admin/settings`)

Trang này **chỉ để xem**:
- **Thông tin phòng khám**: tên, khẩu hiệu, địa chỉ, hotline, Zalo, email liên hệ, bản đồ, Facebook. Thông tin này hiện trên trang chủ, hóa đơn và đơn thuốc in ra.
- **Giờ mở cửa hiển thị** trên trang chủ. Lịch hẹn không dựa vào giờ này mà dựa vào lịch làm việc của từng bác sĩ.
- **Email thông báo**: chỉ gửi được khi máy chủ cấu hình SMTP.

Các giá trị lấy từ biến `CLINIC_*` trong `.env.production` khi build. Muốn đổi thì sửa file đó rồi build lại ứng dụng web; xem [CLINIC_SETUP.md](../08_Deployment/CLINIC_SETUP.md).

Giao diện sáng/tối đổi bằng nút trên header.

---

## 6. Nhật ký kiểm toán

### Truy cập
**Menu → Quản trị → Nhật ký kiểm toán** (`/admin/audit`)

- Bộ lọc: người thực hiện, hành động, đối tượng, khoảng thời gian.
- Bấm **Tải thêm** để xem trang tiếp theo.
- Bấm **Xuất CSV** để tải về (có giới hạn số dòng mỗi lần xuất).

---

## 7. Báo cáo

### Truy cập
**Menu → Báo cáo** (`/reports`)

1. Chọn **Từ ngày** và **Đến ngày** (tối đa 366 ngày).
2. Trang hiển thị:
   - Doanh thu theo trạng thái hóa đơn, kèm ô "Không tính vào doanh thu" (hóa đơn nháp, đã hủy).
   - **Đã thu** theo phương thức (tiền mặt, chuyển khoản), đã trừ hoàn tiền.
   - **Công nợ** theo tuổi nợ, từng hóa đơn còn nợ.
3. Bấm **Xuất CSV** để tải doanh thu hoặc công nợ.

Biểu đồ theo ngày, theo tháng, theo bác sĩ và theo thủ thuật nằm ở **Dashboard**.

---

## 8. Lương

### Truy cập
**Menu → Bảng lương** (`/payroll`), gồm các tab **Kỳ lương**, **Đãi ngộ**, **Duyệt ca**.

### Cấu hình lương
Mở `/payroll/config`. Giá trị mặc định:
- Hệ số làm thêm giờ: 1,5.
- Bảo hiểm phần người lao động: BHXH 8%, BHYT 1,5%, BHTN 1%; mức lương tối thiểu đóng BHXH.
- Thuế TNCN theo bậc; lương thử việc 85%.
- Chu kỳ trả lương (mặc định hàng tháng).

### Đãi ngộ bác sĩ
Tab **Đãi ngộ** (`/payroll/compensations`). Mỗi bản ghi gồm:
- **Lương cơ bản**, **% hoa hồng** theo doanh thu, **đơn giá giờ làm thêm**;
- **ngày hiệu lực**. Bản ghi cũ được giữ làm lịch sử.

### Kỳ lương
Tab **Kỳ lương**:
1. **Tạo kỳ lương** (chọn ngày bắt đầu, ngày kết thúc).
2. **Tính lương**: lấy giờ làm, doanh thu, điều chỉnh. Có thể thêm khoản điều chỉnh (thưởng, khấu trừ).
3. **Khóa**: kỳ chuyển sang **Đang xem xét**.
4. **Duyệt**.
5. **Đánh dấu đã trả**. Sau 7 ngày, kỳ tự chuyển sang **Đã khóa**.

Cần sửa kỳ đã trả hoặc đã khóa thì mở **kỳ điều chỉnh** từ kỳ đó, không sửa trực tiếp.

### Duyệt ca
Tab **Duyệt ca**: bác sĩ tự đăng ký ca ngoài lịch cố định, quản trị **Duyệt** hoặc **Từ chối** (có lý do).

---

## 9. Nhân sự, bác sĩ, dịch vụ, lịch làm việc

| Menu | Việc chính |
|---|---|
| **Nhân sự** (`/staff`) | Hồ sơ nhân viên; tạo tài khoản mới hoặc gắn tài khoản có sẵn; cho nghỉ việc (có thể đặt ngày trong tương lai), khôi phục |
| **Bác sĩ** (`/dentists`) | Hồ sơ hành nghề, dịch vụ được phân công, "Nhận bệnh nhân mới", "Nhận đặt lịch online", tạm đình chỉ |
| **Dịch vụ** (`/services`) | Nhóm dịch vụ, thời lượng, thời gian chuẩn bị/dọn dẹp, giá niêm yết, cho đặt online, hiện trên bảng giá trang chủ |
| **Lịch làm việc** (`/schedule`) | Các tab: Lịch làm việc cố định, Nghỉ phép (duyệt), Ngoại lệ theo ngày, Ngày nghỉ phòng khám, Lịch hẹn bị ảnh hưởng |

Để một bác sĩ nhận được lịch hẹn cần đủ: tài khoản vai trò Bác sĩ → hồ sơ bác sĩ → phân công dịch vụ → lịch làm việc. Xem [CLINIC_SETUP.md](../08_Deployment/CLINIC_SETUP.md).

Bác sĩ vắng, phòng khám nghỉ, chuyển bác sĩ thay: xem [PHAN_QUYEN.md](PHAN_QUYEN.md#bác-sĩ-vắng-phòng-khám-nghỉ-vòng-4-migration-043).

---

## 10. Hóa đơn và chi phí

- **Hóa đơn** (`/billing`): hóa đơn nháp tự tạo khi bác sĩ đóng phiên khám. Quản trị làm được mọi việc của lễ tân (xem [RECEPTIONIST_GUIDE.md](RECEPTIONIST_GUIDE.md#4-hóa-đơn-và-thanh-toán)), thêm: sửa/bỏ dòng hóa đơn nháp, hủy hóa đơn, hủy phiếu thu ghi nhầm, hoàn tiền, lập lại hóa đơn. Các thao tác này bắt buộc ghi lý do.
- **Chi phí** (`/expenses`): nhập và duyệt chi phí phòng khám.

---

## 11. Kho vật tư

### Truy cập
**Menu → Kho vật tư** (`/inventory`)

- **Thêm, sửa vật tư**: chỉ quản trị.
- **Nhập kho** / **Xuất kho**: chọn vật tư, số lượng, lý do. Hệ thống cập nhật tồn và ghi lịch sử.
- **Điều chỉnh tồn**: nhập số chênh lệch và lý do, có ghi nhật ký.
- Vật tư bác sĩ ghi trong điều trị được **trừ kho khi đóng phiên khám**.

---

## 12. Khác

- **Ảnh trang chủ** (`/admin/site-media`): đổi ảnh hiển thị trên trang chủ công khai.
- **Điều phối** (`/dispatch`) và **Yêu cầu đặt lịch** (`/booking-requests`): giống lễ tân, xem [RECEPTIONIST_GUIDE.md](RECEPTIONIST_GUIDE.md).
- **Gộp hồ sơ bệnh nhân** trùng: chỉ quản trị có quyền, nhưng hiện **chưa có nút trên giao diện** (chỉ có API `POST /api/v1/patients/merge`).

---

## 13. Xử lý sự cố thường gặp

| Triệu chứng | Nguyên nhân | Cách xử lý |
|---|---|---|
| Dashboard báo lỗi tải dữ liệu | Backend chưa chạy | Kiểm tra `npm run start:dev` đang chạy ở cổng 3000 |
| Đăng nhập thất bại | Sai mật khẩu hoặc tài khoản bị khóa 15 phút | **Quên mật khẩu**, hoặc nhờ quản trị khác **Cấp mật khẩu tạm** |
| Báo không có quyền (403) | Vai trò thiếu quyền | Trang Người dùng → **Sửa** → chọn vai trò phù hợp |
| Menu thiếu mục sau khi đổi vai trò | Phiên cũ | Đăng nhập lại |

---

## 14. Liên hệ hỗ trợ

- **Developer:** Trần Tuấn Anh (MSSV: 22010130)
- **Email:** admin@gensmile.vn
- **GitHub:** [DATN repository]

> Cập nhật tài liệu này mỗi khi có thay đổi workflow.

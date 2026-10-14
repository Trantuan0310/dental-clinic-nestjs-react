# Hướng dẫn sử dụng cho Bác sĩ (Dentist)

> **Đối tượng:** Bác sĩ nha khoa (`dentist`)  
> **Quyền hạn:** Lịch hẹn và phiên khám của mình, bệnh án, điều trị, đơn thuốc, sơ đồ răng, lịch làm việc, lương của mình. Chi tiết: [PHAN_QUYEN.md](PHAN_QUYEN.md)  
> **Ngày cập nhật:** 14/10/2026

---

## 1. Đăng nhập

1. Truy cập `http://localhost:5173` (hoặc URL do IT cung cấp) → đăng nhập bằng email + mật khẩu.
2. Bệnh nhân của bạn trong ngày nằm ở **Hàng chờ của tôi**.

Menu của bác sĩ: Dashboard, Hôm nay, Hàng chờ của tôi, Lịch của tôi, Bệnh nhân của tôi, Hóa đơn, Kho vật tư, Bác sĩ, Dịch vụ, Lương của tôi, Ca của tôi, Lịch làm việc.

---

## 2. Hàng chờ của tôi

**Menu → Hàng chờ của tôi** (`/my-queue`)

Hiện bệnh nhân của bạn trong ngày: sắp tới, đã check-in (đang chờ), đang khám, đã xong.

**Hôm nay** (`/today`) là lịch của cả phòng khám trong ngày.

### Bắt đầu khám
1. Bệnh nhân phải **đã được lễ tân check-in**. Bác sĩ không tự check-in.
2. Bấm **Bắt đầu khám** ở bệnh nhân đó, xác nhận đúng người.
3. Hệ thống tạo phiên khám và mở trang phiên khám.

### Hủy phiên khám tạo nhầm
Bấm **Hủy phiên khám (mở nhầm)** khi phiên chưa có điều trị hoặc đơn thuốc. Bệnh nhân quay lại hàng chờ.

---

## 3. Phiên khám

Ngay dưới tên bệnh nhân là thẻ **Tiền sử và dị ứng**. Bấm **Sửa** để ghi thêm dị ứng hoặc bệnh nền mới phát hiện.

Trang phiên khám có 5 tab:

### Tab 1: Tổng quan
Thông tin chính của lần khám và tiền sử bệnh nhân.

### Tab 2: Ghi chú
- **Lý do khám**, **Chẩn đoán**, **Kế hoạch điều trị**, ghi chú khác.
- Nhấn **Lưu**.
- Sau khi đóng phiên, ghi chú bị khóa. Muốn sửa thì **Thêm addendum** (ghi chú bổ sung), trong vòng 30 ngày sau khi đóng.

### Tab 3: Điều trị
- **Thêm điều trị**: chọn dịch vụ trong danh mục (hoặc nhập tay tên thủ thuật), số răng, số lượng.
- **Đơn giá** lấy theo giá đã chốt khi đặt lịch hoặc giá niêm yết. Đổi giá phải ghi lý do (có ghi nhật ký).
- **Vật tư đã dùng** (nếu có): chọn vật tư và số lượng. Kho được trừ **khi đóng phiên khám**.
- Mỗi dòng có nút **Sửa** / **Xóa**.

### Tab 4: Đơn thuốc
- Mỗi phiên khám có một đơn thuốc.
- Ghi **chẩn đoán**, từng **thuốc** (tên, liều, tần suất, số ngày, số lượng, đơn vị, hướng dẫn), ngày và ghi chú tái khám.
- Thuốc trùng với dị ứng đã ghi: hệ thống cảnh báo. Muốn vẫn kê thì phải ghi lý do.
- Bấm **In đơn thuốc** để in.

### Tab 5: Sơ đồ răng
- Hệ FDI; bệnh nhân trẻ em dùng sơ đồ **Trẻ em (răng hỗn hợp)**.
- Chạm vào răng để đặt tình trạng; có thao tác hàng loạt và **Hoàn tác / Làm lại**.
- Tự lưu sau khoảng 1,5 giây. Mỗi phiên khám có một bản chụp sơ đồ.
- Sau khi đóng phiên, sơ đồ của phiên đó không sửa được nữa.

### Đặt lịch tái khám
Nút **Đặt lịch tái khám** mở form đặt lịch với bệnh nhân điền sẵn, bác sĩ là chính bạn, loại lịch "Tái khám".

### Đóng phiên khám
1. Nhấn **Đóng Encounter**. Hệ thống cảnh báo nếu còn thiếu thông tin; có thể **Vẫn đóng phiên**.
2. Hệ thống tự động:
   - chuyển phiên khám và lịch hẹn sang **Hoàn tất**;
   - khóa ghi chú;
   - trừ kho vật tư đã ghi;
   - **tạo hóa đơn nháp** để lễ tân xử lý (khi phiên có điều trị);
   - ghi nhật ký.

---

## 4. Bệnh nhân của tôi

**Menu → Bệnh nhân của tôi** (`/my-patients`)

Danh sách bệnh nhân bạn đã khám: tên, mã BN, lần khám gần nhất. Bấm vào để xem hồ sơ và các phiên khám.

Bạn xem được (chỉ đọc) toàn bộ bệnh án của bệnh nhân mình đã khám hoặc sắp khám, kể cả phiên của bác sĩ khác. Phạm vi chính xác: [PHAN_QUYEN.md](PHAN_QUYEN.md).

---

## 5. Lịch của tôi

**Menu → Lịch của tôi** (`/my-appointments`)

- Xem lịch hẹn của bạn theo ngày, tuần, tháng.
- Đặt lịch tái khám cho bệnh nhân mình đã khám.
- Xác nhận, sửa lịch, **Đánh dấu vắng mặt**.
- Dời (trong lịch của mình) và hủy chỉ khi còn ít nhất 24 giờ trước giờ hẹn. Gấp hơn thì nhờ lễ tân.
- **Không** check-in: việc của lễ tân.

---

## 6. Lịch làm việc và ca

### Lịch làm việc
**Menu → Lịch làm việc** (`/schedule`)

- Sửa lịch làm việc của mình: không sửa lùi ngày, và không rút bớt giờ đang có lịch hẹn.
- Xin nghỉ ở tab **Nghỉ phép**; quản trị duyệt.

### Ca của tôi
**Menu → Ca của tôi** (`/my-shifts`)

- **Đăng ký ca mới** ngoài lịch cố định. Quản trị duyệt hoặc từ chối.
- Có thể hủy ca đã đăng ký.
- Ca đã duyệt được tính vào lương.

---

## 7. Lương của tôi

**Menu → Lương của tôi** (`/my-payroll`)

- Xem tạm tính kỳ hiện tại, lịch sử các kỳ, và chính sách đãi ngộ của mình.
- Mở một kỳ để xem phiếu lương: lương cơ bản, hoa hồng, làm thêm giờ, thưởng; khấu trừ (bảo hiểm, thuế TNCN, khoản khác); **thực nhận**; danh sách điều trị tính hoa hồng.
- Phiếu lương xem trên màn hình, chưa có nút tải PDF.

---

## 8. AI tóm tắt hồ sơ

**Dashboard → thẻ AI tóm tắt hồ sơ**

1. Chọn một bệnh nhân có lịch hẹn hôm nay.
2. Hệ thống tạo bản tóm tắt (triệu chứng, tiền sử, dị ứng) và lưu tạm 1 giờ.
3. Bấm nút làm mới (**Gọi lại AI, bỏ qua cache**) nếu muốn tạo lại.

> **Lưu ý:** Luôn tự kiểm tra lại, AI có thể sai. Khi máy chủ chưa cấu hình khóa AI, hệ thống dùng tóm tắt theo quy tắc.

---

## 9. Lưu ý quan trọng

1. **Chỉ khám khi bệnh nhân đã check-in.**
2. **Dị ứng** là cảnh báo bắt buộc: luôn xem trước khi kê đơn.
3. **Ghi chú và sơ đồ răng bị khóa khi đóng phiên.** Sửa ghi chú bằng addendum trong 30 ngày.
4. **Kho được trừ khi đóng phiên**: kiểm tra vật tư trước khi đóng.

---

## 10. Xử lý sự cố

| Triệu chứng | Cách xử lý |
|---|---|
| Không thấy bệnh nhân trong Hàng chờ của tôi | Kiểm tra lịch hẹn đúng bác sĩ là mình và bệnh nhân đã được check-in |
| Không có nút Bắt đầu khám | Bệnh nhân chưa check-in; nhờ lễ tân |
| Không lưu được ghi chú, sơ đồ răng | Phiên đã đóng; dùng addendum cho ghi chú |
| Thẻ AI không hiện tóm tắt | Bấm nút làm mới; nếu vẫn lỗi, báo quản trị |

---

## 11. Liên hệ

- Sự cố kỹ thuật → liên hệ quản trị.
- Thắc mắc nghiệp vụ → liên hệ quản lý phòng khám.

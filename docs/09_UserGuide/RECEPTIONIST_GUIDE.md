# Hướng dẫn sử dụng cho Lễ tân (Receptionist)

> **Đối tượng:** Lễ tân (`receptionist`)  
> **Quyền hạn:** Bệnh nhân, lịch hẹn, điều phối, yêu cầu đặt lịch online, hóa đơn, thu tiền, kho. Chi tiết: [PHAN_QUYEN.md](PHAN_QUYEN.md)  
> **Ngày cập nhật:** 14/10/2026

---

## 1. Đăng nhập

1. Truy cập `http://localhost:5173` (hoặc URL do IT cung cấp) → nhập email + mật khẩu.
2. Dashboard hiện thống kê lịch khám (đến, vắng, hủy, vãng lai, online) và công nợ.
3. Lịch trong ngày xem ở **Hôm nay** (`/today`).

---

## 2. Quản lý bệnh nhân

### Tạo bệnh nhân mới
**Menu → Bệnh nhân → Tạo bệnh nhân** (`/patients/new`)

Thông tin bắt buộc:
- **Họ tên**.
- **Ngày sinh**.
- **Giới tính**: Nam / Nữ / Khác.
- **SĐT bệnh nhân**, hoặc **SĐT người liên hệ** kèm **tên người liên hệ** khi bệnh nhân không có số riêng.
- Bệnh nhân dưới 12 tuổi bắt buộc có tên người giám hộ.

Không bắt buộc: email, địa chỉ, nghề nghiệp, ghi chú, **dị ứng**, **bệnh nền**, **thuốc đang dùng**. Dị ứng hiện thành cảnh báo cho bác sĩ mỗi lần khám.

Nhấn **Tạo**, hệ thống tự sinh mã bệnh nhân.

### Cảnh báo trùng hồ sơ
- Khi gõ SĐT (từ 3 số), form hiện các hồ sơ đã có cùng số.
- Nếu đúng là người đó, mở hồ sơ có sẵn thay vì tạo mới.

### Tìm bệnh nhân
- Ô tìm trên header: gõ tên / mã BN / SĐT → Enter.
- Hoặc **Ctrl+K** (⌘K trên Mac) để mở tìm kiếm nhanh.

### Xem / sửa bệnh nhân
Bấm vào tên bệnh nhân. Trang chi tiết có các tab: **Tổng quan**, **Lịch hẹn**, **Lịch sử khám**, **Hóa đơn**.

### Hồ sơ trùng
Lễ tân **không gộp** được hồ sơ (chỉ quản trị có quyền, và hiện chưa có nút trên giao diện). Thấy hồ sơ trùng thì báo quản trị.

---

## 3. Quản lý lịch hẹn

### Đặt lịch hẹn
**Menu → Lịch hẹn** (`/appointments`) → tạo lịch mới.

1. Tìm **bệnh nhân** (hoặc nhập nhanh họ tên, ngày sinh, SĐT cho khách mới).
2. Chọn **Bác sĩ** và **dịch vụ**. Thời lượng = tổng thời lượng các dịch vụ đã chọn.
3. Chọn **Ngày** + **Giờ bắt đầu**; hệ thống chỉ cho giờ còn trống.
4. Chọn **Loại lịch**, **Nguồn**; ghi **Lý do khám**, **Triệu chứng** nếu có.
5. Nhấn **Tạo**.

> Không đặt được lịch trong quá khứ hoặc trùng giờ bác sĩ đã có lịch.

### Khách vãng lai
Khách đến quầy không hẹn trước: dùng **Khách vãng lai** để tạo lịch khám ngay.

### Check-in bệnh nhân
- Check-in ở **Hôm nay**, **Điều phối**, hoặc bấm vào lịch hẹn trên trang Lịch hẹn → **Check-in**.
- Check-in mở từ **15 phút trước** giờ hẹn. Sớm hơn trong cùng ngày vẫn được nhưng phải ghi lý do; bệnh nhân vẫn xếp theo giờ hẹn.
- Đến trễ hơn 30 phút: hệ thống hỏi xác nhận trước khi check-in.
- Không check-in được vào bác sĩ đang nghỉ hoặc ngày phòng khám nghỉ: đổi lịch sang bác sĩ khác (chọn "Phòng khám dời") rồi check-in.

### Hủy / dời lịch
- Bấm vào lịch hẹn → **Hủy lịch hẹn** (nhập lý do) hoặc **Đổi lịch** (chọn giờ mới).
- Bệnh nhân chỉ được tự dời tối đa 3 lần.
- Nếu **phòng khám** là bên phải hủy hoặc dời (bác sĩ vắng, đổi giờ làm, phòng khám nghỉ), tích ô **"Phòng khám hủy"** / **"Phòng khám dời"**. Khi đó:
  - lần đổi không tính vào giới hạn 3 lần đổi lịch của bệnh nhân;
  - email gửi khách (nếu hồ sơ có email) nói rõ phòng khám phải hủy/dời và xin lỗi.
- Không tích khi bệnh nhân tự xin hủy hoặc đổi: email sẽ chỉ báo lịch đã hủy hoặc đã dời sang giờ mới.
- Lý do bạn nhập là ghi chú nội bộ, **không** được gửi cho khách.

### Email hệ thống tự gửi cho bệnh nhân
Chỉ gửi khi hồ sơ bệnh nhân có email:
- **Đặt lịch** qua điện thoại hoặc cho bệnh nhân tái khám: email xác nhận giờ, bác sĩ, dịch vụ, địa chỉ. Khách vãng lai đang ở quầy thì không gửi.
- **Hủy / dời lịch / đổi bác sĩ**: email báo thay đổi.
- **Nhắc lịch** trước khoảng 24 giờ (không gửi từ 21h đến 7h).
- Lịch không gửi được email nhắc (bác sĩ nghỉ, phòng khám đóng cửa, ngoài giờ làm, gửi lỗi) hiện ở trang **Yêu cầu đặt lịch**, mục **"… lời nhắc chưa gửi được"**, để lễ tân gọi điện.

### Vắng mặt
- Bệnh nhân trễ quá 15 phút: bấm **Đánh dấu vắng mặt** (cần lý do).
- Không đến sau 60 phút: hệ thống tự đánh vắng.
- Bệnh nhân quay lại: **Hoàn tác trạng thái vắng mặt** rồi check-in.
- Đã check-in nhưng về trước khi khám: **Bệnh nhân đã về**.

### AI soạn tin nhắn
Trong ngăn chi tiết lịch hẹn (hoặc ở dòng bệnh nhân trên trang **Nhắc tái khám**), bấm **AI soạn tin**:
- tab **Nhắc lịch hẹn** / **Mời tái khám**: AI soạn tin theo giờ hẹn, bác sĩ, dịch vụ;
- tab **Trả lời tin nhắn khách**: dán tin khách gửi, AI soạn câu trả lời (không tự hứa giá hay giờ trống).

Sửa nội dung nếu cần rồi bấm **Sao chép** / **Mở Zalo** / **Gọi**. Hệ thống không tự gửi tin. AI không nhận tên và số điện thoại khách; tên được điền vào sau.

---

## 4. Hóa đơn và thanh toán

**Menu → Hóa đơn** (`/billing`)

### Hóa đơn nháp
- Hóa đơn nháp **tự tạo khi bác sĩ đóng phiên khám**, gồm các thủ thuật đã làm. Lễ tân không tạo hóa đơn từ đầu.
- Phiên đã đóng mà chưa có hóa đơn hiện trong danh sách cảnh báo ở trang Hóa đơn: bấm để **tạo bù**.
- Trên hóa đơn nháp, lễ tân được **Giảm giá** (theo % hoặc số tiền, có lý do) và ghi chú.
- Sửa hoặc bỏ dòng thủ thuật: chỉ **quản trị** (bắt buộc lý do).

### Phát hành
- Mở hóa đơn nháp → **Phát hành hóa đơn**. Trạng thái chuyển **Đã phát hành**.

### Thu tiền
1. Mở hóa đơn đã phát hành → **Thu tiền**.
2. Nhập **số tiền đã nhận** và **phương thức**: Tiền mặt hoặc Chuyển khoản.
3. Thu nhiều lần được; trạng thái là **Một phần** cho tới khi đủ thì **Đã thanh toán**.
4. Số tiền không được lớn hơn số còn nợ.

### Hủy hóa đơn, phiếu thu, hoàn tiền
Lễ tân **không** làm được các việc sau; nhờ quản trị:
- Hủy hóa đơn (chỉ hủy được khi chưa có phiếu thu còn hiệu lực).
- Hủy phiếu thu ghi nhầm.
- Hoàn tiền cho bệnh nhân.
- Lập lại hóa đơn cho phiên có hóa đơn đã hủy.

### In hóa đơn
- Bấm **In** để mở hộp in của trình duyệt (in giấy hoặc lưu PDF).

---

## 5. Hôm nay và Điều phối

- **Hôm nay** (`/today`): lịch hẹn trong ngày của cả phòng khám, theo giờ và trạng thái (sắp tới, đã check-in, đang khám, đã xong). Dùng mũi tên để xem ngày khác.
- **Điều phối** (`/dispatch`): hàng chờ trước khi khám của từng bác sĩ, ca cấp cứu lên trước rồi đến giờ hẹn. Dùng để check-in, chuyển bệnh nhân sang bác sĩ khác khi bác sĩ vắng.

---

## 6. Yêu cầu đặt lịch online

**Menu → Yêu cầu đặt lịch** (`/booking-requests`). Số trên menu là số yêu cầu đang chờ.

Với mỗi yêu cầu: xác nhận, đề xuất giờ khác, yêu cầu bổ sung, từ chối, ghi nhận khách hủy qua điện thoại, gắn vào lượt khám hôm nay khi khách đến quầy. Chi tiết và lưu ý về khớp hồ sơ: [PHAN_QUYEN.md](PHAN_QUYEN.md#yêu-cầu-đặt-lịch-online).

Nhãn **"BN mới, BS không nhận"**: bác sĩ khách chọn đang tắt "Nhận bệnh nhân mới" và số điện thoại này chưa từng khám xong với bác sĩ đó. Gọi khách để chuyển sang bác sĩ khác, hoặc xác nhận nếu bác sĩ đồng ý nhận.

---

## 7. Bác sĩ vắng đột xuất

Ở **Lịch làm việc** (`/schedule`), lễ tân ghi được bác sĩ vắng đột xuất, có hiệu lực ngay (bắt đầu trong hôm nay, kết thúc chậm nhất cuối ngày mai). Lịch hẹn bị ảnh hưởng xử lý ở tab **Lịch hẹn bị ảnh hưởng**: chuyển bác sĩ thay, dời hàng loạt, đánh dấu đã gọi báo bệnh nhân.

---

## 8. Lưu ý quan trọng

1. **Không xóa cứng dữ liệu**: xóa bệnh nhân, hủy hóa đơn, hủy phiếu thu đều để lại dấu vết và cần quyền quản trị.
2. **Check-in mở từ 15 phút trước** giờ hẹn.
3. **Hóa đơn đã phát hành không sửa dòng**: quản trị hủy rồi lập lại.
4. **Phiếu thu không xóa**: quản trị hủy phiếu thu ghi nhầm (có lý do).

---

## 9. Liên hệ

Khi cần hỗ trợ kỹ thuật → liên hệ quản trị phòng khám.

# Phân quyền theo vai trò

Hệ thống có 3 vai trò có sẵn. Một tài khoản có thể giữ nhiều vai trò cùng lúc: ví dụ chủ phòng khám vừa quản lý vừa khám bệnh thì gán cả **Quản trị viên** và **Bác sĩ**. Bảng dưới đây là cấu hình từ migration `027_role_permission_tuning` (và `030_patient_dob_override_permission`) (`backend/prisma/seed.ts` giữ cùng danh sách).

| Việc | Quản trị viên | Bác sĩ | Lễ tân |
|---|:---:|:---:|:---:|
| **Bệnh nhân**: tạo, sửa thông tin, giấy tờ | ✔ | — | ✔ |
| Xem hồ sơ bệnh nhân | ✔ tất cả | ✔ bệnh nhân mình đã khám, hoặc có lịch với mình đã check-in/đang khám/đã xong, hoặc lịch sắp tới trong 7 ngày (không tính lịch hủy/vắng) — xem (chỉ đọc) toàn bộ bệnh án, sơ đồ răng, các phiên khám của mọi bác sĩ | ✔ tất cả |
| Sửa dị ứng, bệnh nền, thuốc đang dùng | ✔ | ✔ bệnh nhân mình đã khám, hoặc đã check-in/đang khám với mình hôm nay (lịch sắp tới chỉ được xem) | ✔ |
| Gộp, xóa, khôi phục hồ sơ | ✔ | — | — |
| Sửa ngày sinh khi bệnh nhân đã có phiên khám (bắt buộc lý do) | ✔ | — | — |
| **Lịch hẹn**: đặt, dời, hủy, check-in | ✔ | Chỉ lịch hẹn của mình: đặt lịch tái khám cho bệnh nhân mình đã khám; sửa, xác nhận, đánh vắng mặt; dời (trong lịch của mình) và hủy chỉ khi còn ít nhất 24 giờ trước giờ hẹn, kể cả lịch tái khám mình vừa đặt (gấp hơn thì nhờ lễ tân). Không check-in | ✔ |
| Xem lịch hẹn | ✔ tất cả | Chỉ lịch của mình (menu "Lịch của tôi") | ✔ tất cả |
| Điều phối hàng chờ, yêu cầu đặt lịch online | ✔ | — | ✔ |
| **Khám bệnh**: bắt đầu, ghi bệnh án, điều trị, kê đơn, sơ đồ răng, đóng phiên khám | — (chỉ xem) | ✔ | — |
| Hủy phiên khám tạo nhầm (bệnh nhân quay lại hàng chờ) | ✔ | ✔ phiên của mình, khi chưa có điều trị hoặc đơn thuốc | — |
| **Hóa đơn**: tạo, phát hành, thu tiền | ✔ | Xem hóa đơn phiên khám của mình | ✔ |
| Hủy hóa đơn | ✔ | — | — |
| **Báo cáo**: công nợ | ✔ | — | ✔ |
| Doanh thu, chi phí, lợi nhuận, doanh thu theo bác sĩ | ✔ | — | — |
| Chi phí phòng khám (nhập, duyệt) | ✔ | — | — |
| **Kho**: xem | ✔ | ✔ | ✔ |
| Nhập, xuất kho | ✔ | — | ✔ |
| Thêm, sửa vật tư | ✔ | — | — |
| **Nhân sự**: hồ sơ nhân viên, tài khoản (tạo mới hoặc gắn tài khoản có sẵn), khôi phục nhân viên đã nghỉ việc | ✔ | — | — |
| Hồ sơ bác sĩ | ✔ | Sửa hồ sơ của mình | Xem |
| Lịch làm việc, ngày nghỉ bác sĩ | ✔ sửa, duyệt | Sửa lịch của mình (không lùi ngày; không rút giờ còn lịch hẹn) | Xem (không xem lý do nghỉ) |
| Ghi bác sĩ vắng đột xuất hôm nay, có hiệu lực ngay (`time_off.record_urgent`, migration 043) | ✔ | — | ✔ (bắt đầu trong hôm nay, kết thúc chậm nhất cuối ngày mai) |
| Lịch hẹn bị ảnh hưởng: chuyển bác sĩ thay, dời hàng loạt, đánh dấu đã gọi báo bệnh nhân | ✔ | — | ✔ |
| "Phòng khám hủy/dời" (không tính giới hạn 3 lần dời, không là vắng mặt) | ✔ | — | ✔ |
| Ngày nghỉ toàn phòng khám (Tết, lễ) | ✔ (`clinic_closure.manage`, migration 035) | Xem | Xem |
| Ca làm việc (đăng ký, duyệt) | Duyệt | Đăng ký ca của mình | — |
| Lương: cấu hình, tính, duyệt, trả | ✔ | Xem lương của mình | — |
| Danh mục dịch vụ, giá | ✔ | Xem | Xem |
| Ảnh trang chủ, người dùng (sửa email đăng nhập, vai trò, cấp mật khẩu tạm), vai trò, nhật ký | ✔ | — | — |

## Menu theo vai trò

- **Lễ tân:** Dashboard (lịch hẹn, công nợ), Bệnh nhân, Lịch hẹn, Điều phối, Yêu cầu đặt lịch, Hôm nay, Hóa đơn, Kho vật tư, Bác sĩ, Dịch vụ, Lịch làm việc, Báo cáo (chỉ công nợ).
- **Bác sĩ:** Dashboard, Hôm nay, Hàng chờ của tôi, Lịch của tôi (trang lịch hẹn lọc sẵn theo bác sĩ đang đăng nhập), Bệnh nhân của tôi, Hóa đơn, Kho vật tư, Bác sĩ, Dịch vụ, Lương của tôi, Ca của tôi, Lịch làm việc.
- **Quản trị viên:** toàn bộ menu quản lý. Không có "Hàng chờ của tôi" và "Bệnh nhân của tôi", trừ khi tài khoản có thêm vai trò Bác sĩ.

## Tài khoản và bác sĩ

- Email đăng nhập không phân biệt chữ hoa, chữ thường (lưu dạng chữ thường, migration `037_user_email_lowercase`).
- Tài khoản **Chờ thiết lập** vẫn được đặt lịch và xếp lịch làm việc; chỉ tài khoản **đã vô hiệu hóa** bị loại. Đặt mật khẩu qua link hoặc đổi mật khẩu tạm ở "Tài khoản của tôi" sẽ chuyển tài khoản sang **Hoạt động**.
- Khi máy chủ chưa gửi được email mời, trang Người dùng / Nhân sự báo "Chưa gửi được email" và cho **Cấp mật khẩu tạm** (quyền `user.reset_password`, chỉ Quản trị viên). Mật khẩu tạm hiện một lần.
- Quản trị viên không tự gỡ được vai trò Quản trị của chính mình, và không gỡ được vai trò đó của quản trị viên cuối cùng. Gỡ vai trò Bác sĩ bị chặn khi bác sĩ còn lịch hẹn sắp tới hoặc phiên khám đang mở.
- Bác sĩ **Tạm nghỉ** (Nhân sự) hoặc **Tạm đình chỉ** (trang bác sĩ) không nhận lịch hẹn mới, nhưng lịch làm việc và ngày nghỉ vẫn sửa được. Bác sĩ tắt "Nhận bệnh nhân mới" hoặc "Nhận đặt lịch online" bị ẩn khỏi trang đặt lịch online.
- Các thao tác mới dùng quyền có sẵn: gắn tài khoản có sẵn / danh sách tài khoản chưa gắn (`employee.update`; tài khoản quản trị hoặc có quyền quản lý người dùng/vai trò chỉ hiện và gắn được khi có thêm `user.update`), khôi phục nhân viên (`employee.deactivate`; kích hoạt lại tài khoản đăng nhập kèm theo cần thêm `user.deactivate`), sửa email và vai trò (`user.update`). Đổi vai trò luôn đăng xuất tài khoản đó, kể cả khi tự đổi. Không thêm mã quyền mới.
- Email trùng nhau chỉ khác hoa thường (còn sót sau migration 037) vẫn đăng nhập được nếu chỉ có đúng một tài khoản khớp; câu SQL kiểm tra và tạo lại index nằm ở đầu file migration.

## Bác sĩ vắng, phòng khám nghỉ (vòng 4, migration 043)

- Lý do nghỉ phép chỉ quản trị (`time_off.approve`) và chính bác sĩ xem được; lễ tân chỉ thấy khoảng thời gian.
- Lễ tân hủy được vắng đột xuất do chính mình ghi; quản trị kết thúc sớm, gia hạn hoặc hủy mọi kỳ nghỉ (cần lý do).
- Check-in vào bác sĩ đang nghỉ phép / lịch đóng / phòng khám nghỉ bị chặn: đổi lịch sang bác sĩ khác (chọn "Phòng khám dời") rồi check-in.
- Lịch rơi vào ngày nghỉ hoặc bác sĩ vắng mà chưa xử lý thì hệ thống tự ghi "Phòng khám hủy", không đánh vắng mặt.
- "Thay bác sĩ cả ngày" (`queue.manage`) mặc định đóng lịch của bác sĩ vắng ngày đó và có nút hoàn tác.
- Cho nghỉ việc với ngày trong tương lai là lên lịch: tài khoản vẫn hoạt động tới ngày đó rồi tự khóa.

## Yêu cầu đặt lịch online

- `booking_request.read`: xem hộp yêu cầu, hồ sơ có thể khớp (cùng SĐT, cùng họ tên + ngày sinh, SĐT cũ), các yêu cầu và lịch hẹn khác cùng SĐT hoặc cùng người, danh sách lịch hẹn chưa được nhắc qua email (`reminder-issues`). Các màn này hiện tên, SĐT và email bệnh nhân toàn phòng khám, nên chỉ cấp cho vai trò lễ tân hoặc quản lý.
- `booking_request.manage`: xác nhận, đề xuất giờ, yêu cầu bổ sung, từ chối (có ô "yêu cầu rác", không gửi email), ghi nhận khách hủy qua điện thoại, sửa thông tin liên hệ của yêu cầu (bắt buộc ghi lý do, có audit), gửi lại đường link, ghi chú nội bộ, đánh dấu "đã gọi báo khách", và **gắn yêu cầu vào lượt khám hôm nay** khi khách đến quầy. Chỉ gắn được lượt khám của chính người gửi yêu cầu: hồ sơ cùng SĐT, hoặc cùng họ tên + ngày sinh.
- Khi xác nhận, chọn hồ sơ dùng SĐT khác phải đánh dấu "Đã xác minh danh tính" và ghi cách xác minh. Muốn **đổi SĐT hoặc email trong hồ sơ bệnh nhân** thì lễ tân phải tick tùy chọn (mặc định không tick) **và** tài khoản phải có thêm `patient.update`. Không có quyền này thì lịch vẫn được tạo, hồ sơ giữ nguyên và màn hình báo cần nhờ người có quyền sửa. Email khách tự gõ trên trang công khai không bao giờ tự vào hồ sơ.
- Không thêm mã quyền mới. Khách tự hủy lịch đã xác nhận qua đường link trong email (không cần đăng nhập), chỉ áp dụng với lịch sinh ra từ chính yêu cầu đó và phải hủy trước giờ hẹn `BOOKING_PATIENT_CANCEL_MIN_HOURS` giờ.

## Trong màn khám bệnh

- Thẻ **Tiền sử & dị ứng** hiện ngay dưới tên bệnh nhân. Bác sĩ bấm **Sửa** để ghi thêm dị ứng hoặc bệnh nền mới phát hiện.
- Nút **Đặt lịch tái khám** mở form đặt lịch với bệnh nhân điền sẵn, bác sĩ khóa vào chính mình, loại lịch là "Tái khám".
- Quản trị viên mở phiên khám chỉ xem, không có nút ghi hoặc sửa.

## Tùy chỉnh

Quản trị viên chỉnh quyền của từng vai trò trong **Quản trị → Vai trò**. Lưu ý: mỗi migration phân quyền về sau (như 027) có thể đặt lại các quyền mà nó liên quan.

# Phân quyền theo vai trò

Hệ thống có 3 vai trò có sẵn. Một tài khoản có thể giữ nhiều vai trò cùng lúc: ví dụ chủ phòng khám vừa quản lý vừa khám bệnh thì gán cả **Quản trị viên** và **Bác sĩ**. Bảng dưới đây là cấu hình từ migration `027_role_permission_tuning` (và `030_patient_dob_override_permission`) (`backend/prisma/seed.ts` giữ cùng danh sách).

| Việc | Quản trị viên | Bác sĩ | Lễ tân |
|---|:---:|:---:|:---:|
| **Bệnh nhân**: tạo, sửa thông tin, giấy tờ | ✔ | — | ✔ |
| Xem hồ sơ bệnh nhân | ✔ tất cả | ✔ bệnh nhân mình đã khám, hoặc có lịch với mình đã check-in/đang khám/đã xong, hoặc lịch sắp tới trong 7 ngày (không tính lịch hủy/vắng) — xem (chỉ đọc) toàn bộ bệnh án, sơ đồ răng, các phiên khám của mọi bác sĩ | ✔ tất cả |
| Sửa dị ứng, bệnh nền, thuốc đang dùng | ✔ | ✔ bệnh nhân mình đã khám, hoặc đã check-in/đang khám với mình hôm nay (lịch sắp tới chỉ được xem) | ✔ |
| Gộp, xóa, khôi phục hồ sơ | ✔ | — | — |
| Sửa ngày sinh khi bệnh nhân đã có phiên khám (bắt buộc lý do) | ✔ | — | — |
| **Lịch hẹn**: đặt, dời, hủy, check-in | ✔ | Chỉ lịch hẹn của mình: đặt lịch tái khám cho bệnh nhân mình đã khám; sửa, dời (trong lịch của mình), xác nhận, đánh vắng mặt; hủy khi còn ít nhất 24 giờ trước giờ hẹn (muộn hơn thì nhờ lễ tân). Không check-in | ✔ |
| Xem lịch hẹn | ✔ tất cả | Chỉ lịch của mình (menu "Lịch của tôi") | ✔ tất cả |
| Điều phối hàng chờ, yêu cầu đặt lịch online | ✔ | — | ✔ |
| **Khám bệnh**: bắt đầu, ghi bệnh án, điều trị, kê đơn, sơ đồ răng, đóng phiên khám | — (chỉ xem) | ✔ | — |
| Hủy phiên khám tạo nhầm | ✔ | — | — |
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
| Lịch làm việc, ngày nghỉ bác sĩ | ✔ sửa, duyệt | Sửa lịch của mình | Xem |
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

## Trong màn khám bệnh

- Thẻ **Tiền sử & dị ứng** hiện ngay dưới tên bệnh nhân. Bác sĩ bấm **Sửa** để ghi thêm dị ứng hoặc bệnh nền mới phát hiện.
- Nút **Đặt lịch tái khám** mở form đặt lịch với bệnh nhân điền sẵn, bác sĩ khóa vào chính mình, loại lịch là "Tái khám".
- Quản trị viên mở phiên khám chỉ xem, không có nút ghi hoặc sửa.

## Tùy chỉnh

Quản trị viên chỉnh quyền của từng vai trò trong **Quản trị → Vai trò**. Lưu ý: mỗi migration phân quyền về sau (như 027) có thể đặt lại các quyền mà nó liên quan.

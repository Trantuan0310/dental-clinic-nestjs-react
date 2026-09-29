# Phân quyền theo vai trò

Hệ thống có 3 vai trò có sẵn. Một tài khoản có thể giữ nhiều vai trò cùng lúc: ví dụ chủ phòng khám vừa quản lý vừa khám bệnh thì gán cả **Quản trị viên** và **Bác sĩ**. Bảng dưới đây là cấu hình từ migration `027_role_permission_tuning` (và `030_patient_dob_override_permission`) (`backend/prisma/seed.ts` giữ cùng danh sách).

| Việc | Quản trị viên | Bác sĩ | Lễ tân |
|---|:---:|:---:|:---:|
| **Bệnh nhân**: tạo, sửa thông tin, giấy tờ | ✔ | — | ✔ |
| Xem hồ sơ bệnh nhân | ✔ tất cả | ✔ bệnh nhân mình đã khám hoặc đang có lịch hẹn (chưa hủy/vắng) với mình — xem (chỉ đọc) toàn bộ bệnh án, sơ đồ răng, các phiên khám của mọi bác sĩ | ✔ tất cả |
| Sửa dị ứng, bệnh nền, thuốc đang dùng | ✔ | ✔ bệnh nhân mình đã khám hoặc đang có lịch hẹn với mình | ✔ |
| Gộp, xóa, khôi phục hồ sơ | ✔ | — | — |
| Sửa ngày sinh khi bệnh nhân đã có phiên khám (bắt buộc lý do) | ✔ | — | — |
| **Lịch hẹn**: đặt, dời, hủy, check-in | ✔ | Đặt lịch tái khám vào lịch của mình, cho bệnh nhân mình đã khám | ✔ |
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
| **Nhân sự**: hồ sơ nhân viên, tài khoản | ✔ | — | — |
| Hồ sơ bác sĩ | ✔ | Sửa hồ sơ của mình | Xem |
| Lịch làm việc, ngày nghỉ bác sĩ | ✔ sửa, duyệt | Sửa lịch của mình | Xem |
| Ca làm việc (đăng ký, duyệt) | Duyệt | Đăng ký ca của mình | — |
| Lương: cấu hình, tính, duyệt, trả | ✔ | Xem lương của mình | — |
| Danh mục dịch vụ, giá | ✔ | Xem | Xem |
| Ảnh trang chủ, người dùng, vai trò, nhật ký | ✔ | — | — |

## Menu theo vai trò

- **Lễ tân:** Dashboard (lịch hẹn, công nợ), Bệnh nhân, Lịch hẹn, Điều phối, Yêu cầu đặt lịch, Hôm nay, Hóa đơn, Kho vật tư, Bác sĩ, Dịch vụ, Lịch làm việc, Báo cáo (chỉ công nợ).
- **Bác sĩ:** Dashboard, Hôm nay, Hàng chờ của tôi, Bệnh nhân của tôi, Hóa đơn, Kho vật tư, Bác sĩ, Dịch vụ, Lương của tôi, Ca của tôi, Lịch làm việc.
- **Quản trị viên:** toàn bộ menu quản lý. Không có "Hàng chờ của tôi" và "Bệnh nhân của tôi", trừ khi tài khoản có thêm vai trò Bác sĩ.

## Trong màn khám bệnh

- Thẻ **Tiền sử & dị ứng** hiện ngay dưới tên bệnh nhân. Bác sĩ bấm **Sửa** để ghi thêm dị ứng hoặc bệnh nền mới phát hiện.
- Nút **Đặt lịch tái khám** mở form đặt lịch với bệnh nhân điền sẵn, bác sĩ khóa vào chính mình, loại lịch là "Tái khám".
- Quản trị viên mở phiên khám chỉ xem, không có nút ghi hoặc sửa.

## Tùy chỉnh

Quản trị viên chỉnh quyền của từng vai trò trong **Quản trị → Vai trò**. Lưu ý: mỗi migration phân quyền về sau (như 027) có thể đặt lại các quyền mà nó liên quan.

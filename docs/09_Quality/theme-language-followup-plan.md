# Kế hoạch kiểm tra tiếp theo: dark mode và English UI

Trạng thái xuất phát: bản sửa đã qua build, lint, kiểm tra bản dịch và ma trận
232 trường hợp với API giả lập. [Kết quả hiện tại](theme-language-completion.md)
và [dữ liệu audit](theme-language-audit-final.json) là mốc so sánh.

## 1. Chuẩn bị môi trường kiểm thử tích hợp

- Dùng môi trường staging và dữ liệu mẫu có thể đặt lại; không chạy các thao tác
  ghi/xóa trên dữ liệu thật. Chuẩn bị tài khoản quản trị, lễ tân và bác sĩ với
  quyền tương ứng, cùng bệnh nhân, lịch hẹn, yêu cầu đặt lịch, hồ sơ khám,
  hóa đơn, ca làm việc và kỳ lương ở nhiều trạng thái.
- Kiểm tra cấu hình phòng khám theo hai trường hợp: dùng giá trị mặc định và
  dùng `VITE_CLINIC_*` do phòng khám cung cấp. Ghi rõ giá trị cấu hình là nội
  dung nghiệp vụ được giữ nguyên khi đổi ngôn ngữ.
- Ghi lại commit, trình duyệt, kích thước màn hình, timezone `Asia/Ho_Chi_Minh`
  và dữ liệu mẫu trước khi kiểm thử để có thể tái hiện lỗi.

## 2. Kiểm tra với backend thật

Ưu tiên P0: hoàn thành các luồng dưới đây ở VI/EN và sáng/tối; đổi ngôn ngữ
hoặc theme ngay khi đang mở form/hộp thoại, sau đó tải lại trang để kiểm tra
lựa chọn được lưu và dữ liệu nhập không bị thay đổi.

1. Đặt lịch công khai: chọn dịch vụ/bác sĩ/giờ, gửi yêu cầu, tra cứu mã,
   xác nhận hoặc từ chối ở quầy. Thử cả lỗi API, giờ đã hết, trùng lịch và
   người đặt hộ; kiểm tra thông báo và validation trong cả hai ngôn ngữ.
2. Lịch hẹn nội bộ: tạo/sửa/đổi giờ, check-in, vắng mặt, rời phòng khám,
   hoàn tác và mở hồ sơ khám. Kiểm tra lịch ngày/tuần/tháng, trạng thái quá
   giờ, lý do mẫu và nhật ký hoạt động.
3. Lịch làm việc: tạo/sửa/kết thúc ca thường; nghỉ phép, đổi ngày, đóng cửa
   và xử lý lịch hẹn bị ảnh hưởng. Kiểm tra các bảng, cảnh báo, xác nhận và
   quyền của từng vai trò.
4. Lâm sàng: tạo/sửa bệnh nhân, lịch sử và dị ứng, mở/đóng hồ sơ khám,
   cảnh báo dị ứng thuốc. Đổi ngôn ngữ khi form đang có lỗi validation.
5. Nhân sự và tài chính: hồ sơ bác sĩ, điều kiện nhận lịch, cấp mật khẩu tạm,
   duyệt ca, cấu hình/kỳ lương/phiếu lương, phân quyền, nhật ký và cấu hình
   phòng khám. Kiểm tra trạng thái trống, lỗi, thành công và thông báo toast.

## 3. Kiểm tra giao diện và khả năng sử dụng

- Chụp và đối chiếu tối thiểu tại 320, 375, 768 và 1440 px; rà các hộp thoại,
  bảng, tab cuộn, nội dung dài và tên bệnh nhân/dịch vụ dài. Không chấp nhận
  tràn ngang toàn trang, chữ bị che hoặc nút thao tác nằm ngoài màn hình.
- Kiểm tra độ tương phản chữ thường ít nhất 4.5:1 và chữ lớn ít nhất 3:1;
  thử thao tác bằng bàn phím, thứ tự focus, Escape, nhãn đọc màn hình và các
  trạng thái disabled. Kiểm tra màu tối trên cả nội dung đã có dữ liệu, không
  chỉ trang trống của ma trận hiện tại.
- Đối chiếu ngày/giờ, số và tiền tệ theo ngôn ngữ; giữ timezone phòng khám,
  đơn vị VND, mã trạng thái API và nội dung do người dùng/server nhập.

## 4. Tự động hóa và tiêu chí chốt

- Giữ bộ kiểm tra 232 trường hợp với fixtures trong CI như smoke test. Bổ sung
  Playwright E2E không chặn `**/api/**` cho các luồng P0 ở mục 2; dùng dữ liệu
  staging đặt lại được và lưu ảnh/trace khi thất bại.
- Chạy lại `npm run build`, `npm run lint`, `node scripts/check-ui-locales.mjs`
  và các script UI hồi quy sau mỗi đợt sửa. Một lỗi mới phải có bước tái hiện,
  ảnh/trace, trang, vai trò, locale, theme và kích thước màn hình.
- Chỉ chốt kiểm thử tích hợp khi các luồng P0 đạt ở cả hai ngôn ngữ và theme,
  không có lỗi runtime/tràn ngang/khóa dịch lộ ra, và các lỗi P1 về nội dung
  hoặc tương phản đã được sửa hoặc ghi nhận rõ người phụ trách và thời hạn.

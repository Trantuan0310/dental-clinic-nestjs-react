# KẾT LUẬN

## 1. Kết quả đạt được

Đồ án đã xây dựng GenSmile, ứng dụng web quản lý phòng khám nha khoa nhiều bác sĩ, đáp ứng các mục tiêu chính của phiếu giao đề tài. Hệ thống bao phủ vòng hoạt động của phòng khám, từ đặt lịch trực tuyến, tiếp nhận, hàng chờ, khám và điều trị theo sơ đồ răng, kế hoạch điều trị, hóa đơn và thanh toán, đến nhắc lịch, nhân sự, lương, kho và báo cáo.

Về phân tích và thiết kế, đồ án đã khảo sát quy trình vận hành tại Nha khoa An Việt, xác định bốn nhóm người dùng cùng 35 yêu cầu chức năng và các yêu cầu phi chức năng. Hệ thống được thiết kế theo kiến trúc ba lớp với 24 module nghiệp vụ, cơ sở dữ liệu 71 bảng và các biểu đồ UML mô tả những hành vi quan trọng.

Về kỹ thuật, hệ thống chống đặt trùng lịch bằng khóa tư vấn của cơ sở dữ liệu, ghi nhận thanh toán và webhook ngân hàng không ghi trùng, phân quyền hai lớp (theo vai trò với 133 mã quyền và theo dòng dữ liệu) kèm nhật ký kiểm toán. Thanh toán VietQR được đối soát tự động; trợ lý AI không nhận thông tin định danh bệnh nhân và vẫn hoạt động ở chế độ dự phòng khi dịch vụ AI lỗi.

Về chất lượng, hệ thống có khoảng 2.000 kiểm thử tự động ở ba tầng (1.808 kiểm thử đơn vị, 113 kiểm thử API trên cơ sở dữ liệu thật, 122 kịch bản giao diện), chạy trong 10 bước kiểm tra trước mỗi lần cập nhật. Cả 35 yêu cầu chức năng đều có cách kiểm thử tương ứng (Phụ lục B), và hệ thống đã được đóng gói bằng Docker, triển khai trên máy chủ ảo.

Điểm nổi bật nhất là các đặc thù của nha khoa và của thị trường Việt Nam được đưa vào phần mềm: lịch sử điều trị theo từng răng ngay trên sơ đồ hai cung răng, thanh toán VietQR tự đối soát, nhắc lịch tự động qua email và SMS, bệnh nhân tự tra cứu lịch sử khám không cần tài khoản. Đồng thời, hệ thống bảo đảm tính đúng đắn khi nhiều người thao tác cùng lúc và bảo vệ dữ liệu sức khỏe theo quy định hiện hành.

Qua đồ án, em hiểu sâu hơn quy trình phát triển một phần mềm hoàn chỉnh: từ phân tích nghiệp vụ chuyên môn, thiết kế dữ liệu, xử lý đồng thời và bảo mật đến kiểm thử tự động và vận hành hệ thống thật.

## 2. Hạn chế

Hệ thống chưa lưu trữ và xem được phim X-quang, một phần quan trọng của hồ sơ nha khoa. Kênh SMS mới được kiểm thử với bộ giả lập, chưa chạy với nhà cung cấp thật; hệ thống cũng chưa được kiểm thử tải với nhiều người dùng đồng thời.

Độ bao phủ kiểm thử đơn vị chưa đều giữa các module; một số phần mới được kiểm tra gián tiếp qua kiểm thử API. Hệ thống chưa được vận hành và đánh giá tại một phòng khám thực tế, chất lượng trợ lý AI còn phụ thuộc dịch vụ AI bên ngoài. Ngoài ra, hệ thống mới hỗ trợ một phòng khám và chưa có ứng dụng di động riêng.

## 3. Hướng phát triển

Trước hết, em dự định bổ sung hồ sơ hình ảnh: lưu phim X-quang, ảnh trong miệng theo chuẩn DICOM và gắn với từng răng trên sơ đồ, để bác sĩ xem cùng lịch sử điều trị. Song song, hệ thống cần được thử nghiệm tại một phòng khám thật, kiểm thử tải, bổ sung giám sát và sao lưu tự động theo lịch.

Về mở rộng quy mô, hệ thống có thể thêm chiều chi nhánh vào lịch hẹn, kho, nhân sự và báo cáo, cho phép bệnh nhân dùng chung một hồ sơ giữa các chi nhánh. Hệ thống cũng cần liên thông đơn thuốc điện tử và hồ sơ sức khỏe điện tử theo quy định của Bộ Y tế, hỗ trợ thanh toán bảo hiểm.

Về phía bệnh nhân, một ứng dụng di động riêng giúp nhận nhắc lịch qua thông báo đẩy, xem kế hoạch điều trị và thanh toán ngay trong ứng dụng. Về AI, hệ thống có thể gợi ý kế hoạch điều trị từ sơ đồ răng và lịch sử, dự báo khách có nguy cơ bỏ hẹn để nhắc sớm, với nguyên tắc AI chỉ đề xuất và bác sĩ quyết định.

[[HET_THAN]]

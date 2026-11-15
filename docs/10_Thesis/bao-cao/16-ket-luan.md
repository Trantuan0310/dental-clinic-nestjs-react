# KẾT LUẬN

## 1. Kết quả đạt được

Đồ án đã xây dựng GenSmile, ứng dụng web quản lý phòng khám nha khoa nhiều bác sĩ, đáp ứng các mục tiêu chính của phiếu giao đề tài. Các kết quả cụ thể:

- **Về phân tích và thiết kế:** khảo sát quy trình vận hành của phòng khám, xác định bốn nhóm người dùng và yêu cầu chức năng, phi chức năng; thiết kế kiến trúc ba lớp với 23 module nghiệp vụ, cơ sở dữ liệu 70 bảng và các biểu đồ UML mô tả hành vi chính.
- **Về sản phẩm:** hệ thống bao phủ toàn bộ vòng hoạt động của phòng khám, từ đặt lịch trực tuyến, tiếp nhận, hàng chờ, khám và điều trị theo sơ đồ răng, kế hoạch điều trị, hóa đơn và thanh toán, đến nhắc lịch, nhân sự, lương, kho và báo cáo. Bệnh nhân tự đặt, xác nhận, dời lịch và tra cứu lịch sử khám qua đường dẫn bảo mật.
- **Về kỹ thuật:** chống đặt trùng lịch bằng khóa tư vấn của cơ sở dữ liệu; thanh toán và webhook ngân hàng không ghi trùng; phân quyền hai lớp (theo vai trò với 133 mã quyền và theo dòng dữ liệu); nhật ký kiểm toán; đối soát chuyển khoản VietQR tự động; trợ lý AI có kiểm soát, không gửi thông tin định danh bệnh nhân cho mô hình và vẫn hoạt động khi dịch vụ AI lỗi.
- **Về chất lượng:** khoảng 2.000 kiểm thử tự động ở ba tầng (1.788 kiểm thử đơn vị, khoảng 100 kiểm thử API trên cơ sở dữ liệu thật, 122 kịch bản giao diện), chạy trong 10 bước kiểm tra trước mỗi lần cập nhật; cả 34 yêu cầu chức năng đều có giao diện và ca kiểm thử tương ứng (ma trận truy vết ở Phụ lục D); hệ thống đã được đóng gói bằng Docker và triển khai trên máy chủ ảo.

Điểm nổi bật nhất của hệ thống là đưa được các đặc thù của nha khoa và của thị trường Việt Nam vào phần mềm: lịch sử điều trị theo từng răng ngay trên sơ đồ hai cung răng, thanh toán VietQR tự đối soát, nhắc lịch qua Zalo, bệnh nhân tự tra cứu lịch sử khám không cần tài khoản; đồng thời bảo đảm tính đúng đắn khi nhiều người thao tác cùng lúc và bảo vệ dữ liệu sức khỏe theo quy định hiện hành.

Qua đồ án, em hiểu sâu hơn quy trình phát triển phần mềm hoàn chỉnh, từ phân tích nghiệp vụ chuyên môn, thiết kế dữ liệu, xử lý đồng thời và bảo mật đến kiểm thử tự động và vận hành hệ thống thật.

## 2. Hạn chế

Các hạn chế chính (phân tích chi tiết ở Mục 5.6):

- Chưa lưu trữ và xem phim X-quang.
- Kênh SMS và Zalo mới được kiểm thử với bộ giả lập, chưa chạy với nhà cung cấp thật; chưa kiểm thử tải với nhiều người dùng đồng thời.
- Độ bao phủ kiểm thử đơn vị chưa đều giữa các module; một số phần mới được kiểm tra gián tiếp qua kiểm thử API.
- Chưa được vận hành và đánh giá tại một phòng khám thực tế; chất lượng trợ lý AI phụ thuộc dịch vụ AI bên ngoài.
- Chỉ hỗ trợ một phòng khám; chưa có ứng dụng di động riêng.

## 3. Hướng phát triển

- **Hồ sơ hình ảnh:** lưu phim X-quang, ảnh trong miệng theo chuẩn DICOM, gắn với từng răng trên sơ đồ để bác sĩ xem cùng lịch sử điều trị.
- **Nhiều chi nhánh:** thêm chiều chi nhánh vào lịch hẹn, kho, nhân sự và báo cáo; bệnh nhân dùng chung một hồ sơ giữa các chi nhánh.
- **Kết nối hệ thống y tế:** liên thông đơn thuốc điện tử và hồ sơ sức khỏe điện tử theo quy định của Bộ Y tế; hỗ trợ thanh toán bảo hiểm.
- **Ứng dụng di động cho bệnh nhân:** nhận nhắc lịch qua thông báo đẩy, xem kế hoạch điều trị và thanh toán ngay trong ứng dụng.
- **Mở rộng AI:** gợi ý kế hoạch điều trị từ sơ đồ răng và lịch sử, dự báo khách có nguy cơ bỏ hẹn để nhắc sớm, với nguyên tắc AI chỉ đề xuất và bác sĩ quyết định.
- **Vận hành thực tế:** thử nghiệm tại một phòng khám, kiểm thử tải, bổ sung giám sát và sao lưu tự động theo lịch.

[[HET_THAN]]

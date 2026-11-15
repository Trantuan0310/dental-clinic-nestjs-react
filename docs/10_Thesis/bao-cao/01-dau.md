::: {custom-style="Tiêu đề phụ"}
NHẬN XÉT BÁO CÁO ĐỒ ÁN TỐT NGHIỆP
:::

::: {custom-style="Thông tin"}
Họ và tên sinh viên: Trần Tuấn Anh

Mã số sinh viên: 22010130

Lớp: K16-CNTT_2

Ngành: Công nghệ thông tin

Giảng viên hướng dẫn: TS. Mai Thúy Nga
:::

::: {custom-style="Mục nhận xét"}
1\. Nhận xét của giảng viên hướng dẫn
:::

::: {custom-style="Dòng chấm"}
[[CHAM]]
:::

::: {custom-style="Dòng chấm"}
[[CHAM]]
:::

::: {custom-style="Dòng chấm"}
[[CHAM]]
:::

::: {custom-style="Dòng chấm"}
[[CHAM]]
:::

::: {custom-style="Dòng chấm"}
[[CHAM]]
:::

::: {custom-style="Dòng chấm"}
[[CHAM]]
:::

::: {custom-style="Dòng chấm"}
[[CHAM]]
:::

::: {custom-style="Dòng chấm"}
[[CHAM]]
:::

::: {custom-style="Dòng chấm"}
[[CHAM]]
:::

::: {custom-style="Mục nhận xét"}
2\. Nhận xét của giảng viên phản biện
:::

::: {custom-style="Dòng chấm"}
[[CHAM]]
:::

::: {custom-style="Dòng chấm"}
[[CHAM]]
:::

::: {custom-style="Dòng chấm"}
[[CHAM]]
:::

::: {custom-style="Dòng chấm"}
[[CHAM]]
:::

::: {custom-style="Dòng chấm"}
[[CHAM]]
:::

::: {custom-style="Dòng chấm"}
[[CHAM]]
:::

::: {custom-style="Dòng chấm"}
[[CHAM]]
:::

::: {custom-style="Dòng chấm"}
[[CHAM]]
:::

::: {custom-style="Dòng chấm"}
[[CHAM]]
:::

::: {custom-style="Mục nhận xét"}
3\. Điểm đánh giá
:::

::: {custom-style="Thông tin"}
Điểm số (theo thang điểm 10): ……………………

Điểm chữ: ……………………………………………
:::

[[NGAT]]

::: {custom-style="Tiêu đề phụ"}
TÓM TẮT ĐỒ ÁN
:::

Đồ án xây dựng GenSmile, một ứng dụng web quản lý toàn bộ hoạt động của một phòng khám nha khoa nhiều bác sĩ: hồ sơ bệnh nhân, lịch hẹn và đặt lịch trực tuyến, tiếp nhận và hàng chờ, phiên khám với sơ đồ răng và lịch sử điều trị theo từng răng, kế hoạch điều trị và báo giá, hóa đơn và thanh toán (kể cả chuyển khoản VietQR được đối soát tự động), nhân sự, ca làm việc và tính lương, kho vật tư, nhắc lịch qua email/SMS/Zalo, bảng điều khiển và báo cáo cho quản lý. Bệnh nhân có thể tự đặt lịch, xác nhận hoặc dời lịch và tra cứu lịch sử khám qua đường dẫn bảo mật mà không cần tài khoản. Điểm nổi bật của hệ thống là lịch sử điều trị theo từng răng, chống đặt trùng lịch ở mức cơ sở dữ liệu và đối soát chuyển khoản tự động.

Hệ thống dùng kiến trúc ứng dụng một trang (React) gọi REST API (NestJS) trên cơ sở dữ liệu PostgreSQL, gồm 23 module nghiệp vụ, khoảng 340 điểm cuối API và 70 bảng dữ liệu. Phân quyền theo vai trò với 133 mã quyền, kết hợp giới hạn theo từng dòng dữ liệu (bác sĩ chỉ thấy bệnh nhân của mình) và nhật ký kiểm toán cho mọi thao tác nhạy cảm. Đồ án tích hợp mô hình ngôn ngữ lớn ở dạng có kiểm soát: AI chỉ soạn nháp và đề xuất, người dùng duyệt mới thực hiện, mô hình không nhìn thấy tên hay số điện thoại bệnh nhân.

Chất lượng được bảo đảm bằng 1.788 kiểm thử đơn vị (bao phủ 76,6% số dòng mã service và controller), khoảng 100 kiểm thử API trên PostgreSQL thật và 122 kịch bản kiểm thử giao diện tự động, chạy trong 10 bước kiểm tra liên tục trước mỗi lần cập nhật. Hệ thống đã được triển khai bằng Docker trên máy chủ ảo và đáp ứng các mục tiêu trong phiếu giao đề tài, trừ phần lưu trữ phim X-quang được để lại làm hướng phát triển.

**Từ khóa:** quản lý phòng khám nha khoa, sơ đồ răng FDI, đặt lịch trực tuyến, VietQR, phân quyền theo vai trò, mô hình ngôn ngữ lớn, NestJS, React, PostgreSQL.

[[NGAT]]

::: {custom-style="Tiêu đề phụ"}
LỜI CAM ĐOAN
:::

::: {custom-style="Thông tin"}
Họ và tên: Trần Tuấn Anh

Mã sinh viên: 22010130    Lớp: K16-CNTT_2

Ngành: Công nghệ thông tin
:::

Tôi đã thực hiện đồ án tốt nghiệp với đề tài: "Phát triển phần mềm quản lý phòng khám nha khoa".

Tôi xin cam đoan đây là đề tài nghiên cứu của riêng tôi và được sự hướng dẫn của: TS. Mai Thúy Nga.

Các nội dung nghiên cứu, kết quả trong đề tài này là trung thực và chưa được các tác giả khác công bố dưới bất kỳ hình thức nào. Mọi tài liệu tham khảo đều được trích dẫn đầy đủ. Nếu phát hiện có bất kỳ hình thức gian lận nào tôi xin hoàn toàn chịu trách nhiệm trước pháp luật.

::: {custom-style="Ngày ký"}
Hà Nội, ngày …… tháng …… năm 2026
:::

| GIẢNG VIÊN HƯỚNG DẪN | SINH VIÊN |
|---|---|
| (Ký, ghi rõ họ tên) | (Ký, ghi rõ họ tên) |
|   |   |
|   |   |
|   | Trần Tuấn Anh |

[[NGAT]]

::: {custom-style="Tiêu đề phụ"}
LỜI CẢM ƠN
:::

Trước hết, em xin gửi lời cảm ơn chân thành và sâu sắc đến TS. Mai Thúy Nga, giảng viên hướng dẫn, người đã định hướng đề tài, góp ý tận tình và theo sát em trong suốt quá trình thực hiện đồ án.

Em xin cảm ơn các thầy cô Khoa Hệ thống thông tin, Trường Đại học Công nghệ Thông tin, Đại học Phenikaa đã truyền đạt kiến thức nền tảng trong những năm học vừa qua, giúp em có đủ hành trang để hoàn thành đề tài.

Em xin gửi lời cảm ơn đến Nha khoa An Việt, đặc biệt là bác sĩ Nguyễn Văn Việt, đã dành thời gian chia sẻ quy trình làm việc thực tế của phòng khám và góp ý cho các chức năng của hệ thống. Những trao đổi này giúp đồ án bám sát nhu cầu của một phòng khám nha khoa thật.

Em cũng xin cảm ơn gia đình và bạn bè đã luôn động viên, hỗ trợ em trong thời gian học tập và thực hiện đồ án.

Do thời gian và kinh nghiệm còn hạn chế, đồ án khó tránh khỏi thiếu sót. Em rất mong nhận được ý kiến đóng góp của thầy cô để hoàn thiện hơn.

Em xin chân thành cảm ơn!

::: {custom-style="Bìa trái"}
Sinh viên

Trần Tuấn Anh
:::

[[NGAT]]

::: {custom-style="Tiêu đề phụ"}
MỤC LỤC
:::

[[TOC]]

[[NGAT]]

::: {custom-style="Tiêu đề phụ"}
DANH MỤC HÌNH ẢNH
:::

[[HINH]]

[[NGAT]]

::: {custom-style="Tiêu đề phụ"}
DANH MỤC BẢNG BIỂU
:::

[[BANG]]

[[NGAT]]

::: {custom-style="Tiêu đề phụ"}
DANH MỤC TỪ VIẾT TẮT
:::

| Từ viết tắt | Tiếng Anh | Nghĩa tiếng Việt |
|---|---|---|
| ACID | Atomicity, Consistency, Isolation, Durability | Bốn tính chất của giao dịch cơ sở dữ liệu |
| AI | Artificial Intelligence | Trí tuệ nhân tạo |
| API | Application Programming Interface | Giao diện lập trình ứng dụng |
| CI | Continuous Integration | Tích hợp liên tục |
| CSS | Cascading Style Sheets | Ngôn ngữ định kiểu trang web |
| DICOM | Digital Imaging and Communications in Medicine | Chuẩn lưu trữ, truyền ảnh y tế |
| DTO | Data Transfer Object | Đối tượng truyền dữ liệu |
| E2E | End-to-End | Kiểm thử đầu cuối |
| FDI | Fédération Dentaire Internationale | Liên đoàn Nha khoa Thế giới (hệ đánh số răng) |
| HTML | HyperText Markup Language | Ngôn ngữ đánh dấu siêu văn bản |
| HTTP | Hypertext Transfer Protocol | Giao thức truyền siêu văn bản |
| HTTPS | HTTP Secure | HTTP có mã hóa |
| ISO/IEC | International Organization for Standardization / International Electrotechnical Commission | Tổ chức Tiêu chuẩn hóa Quốc tế / Ủy ban Kỹ thuật Điện Quốc tế |
| JSON | JavaScript Object Notation | Định dạng dữ liệu dạng văn bản |
| JSONB | JSON Binary | Kiểu dữ liệu JSON lưu dạng nhị phân của PostgreSQL |
| JWT | JSON Web Token | Mã thông báo JSON |
| KPI | Key Performance Indicator | Chỉ số hiệu suất chính |
| KT | – | Mã ca kiểm thử (Chương 5); mã yêu cầu chức năng (BN, LH, KB, TT…) giải thích ở Mục 2.3 |
| LLM | Large Language Model | Mô hình ngôn ngữ lớn |
| OA | Official Account | Tài khoản chính thức (của doanh nghiệp trên Zalo) |
| ORM | Object-Relational Mapping | Ánh xạ đối tượng – quan hệ |
| OWASP | Open Worldwide Application Security Project | Dự án mở về bảo mật ứng dụng |
| QR | Quick Response (code) | Mã vạch hai chiều |
| RBAC | Role-Based Access Control | Kiểm soát truy cập theo vai trò |
| REST | Representational State Transfer | Kiểu kiến trúc API dựa trên tài nguyên |
| SĐT | – | Số điện thoại |
| SHA | Secure Hash Algorithm | Thuật toán băm an toàn |
| SMS | Short Message Service | Tin nhắn ngắn |
| SMTP | Simple Mail Transfer Protocol | Giao thức gửi thư điện tử |
| SPA | Single-Page Application | Ứng dụng web một trang |
| SVG | Scalable Vector Graphics | Định dạng ảnh véc-tơ |
| UML | Unified Modeling Language | Ngôn ngữ mô hình hóa thống nhất |
| UTC | Coordinated Universal Time | Giờ phối hợp quốc tế |
| UUID | Universally Unique Identifier | Định danh duy nhất toàn cục |
| ZNS | Zalo Notification Service | Dịch vụ tin nhắn thông báo của Zalo |

[[NGAT]]

::: {custom-style="Tiêu đề phụ"}
DANH MỤC THUẬT NGỮ
:::

| Thuật ngữ | Giải thích |
|---|---|
| Phiên khám (encounter) | Một lần bệnh nhân được bác sĩ khám, gắn với một lịch hẹn; ghi lý do khám, chẩn đoán, điều trị, đơn thuốc và sơ đồ răng của lần đó. |
| Kế hoạch điều trị (treatment plan) | Danh sách thủ thuật dự kiến kèm báo giá; bệnh nhân đồng ý thì từng dòng được thực hiện dần qua các phiên khám. |
| Sơ đồ răng (dental chart) | Tình trạng từng răng (bình thường, sâu, đã hàn, bọc mão, đã nhổ, implant, cần nhổ) được lưu thành một bản chụp cho mỗi phiên khám. |
| Hàng chờ (queue) | Danh sách bệnh nhân đã check-in trong ngày, chờ bác sĩ gọi vào khám. |
| Nhắc tái khám (recall) | Lời nhắc định kỳ gửi cho bệnh nhân đến hạn kiểm tra lại (ví dụ 6 tháng cạo vôi). |
| Đối soát (reconciliation) | Khớp một giao dịch chuyển khoản ngân hàng với hóa đơn tương ứng. |
| Webhook | Lời gọi HTTP mà một hệ thống ngoài (ví dụ ngân hàng) gửi tới hệ thống khi có sự kiện. |
| Nhật ký kiểm toán (audit log) | Bản ghi về việc ai đã làm gì, lúc nào, trên dữ liệu nào; ứng dụng chỉ ghi thêm, không có chức năng sửa hay xóa. |
| Phạm vi theo dòng (row-level scope) | Giới hạn dữ liệu một người được thấy trong cùng một loại bản ghi, ví dụ bác sĩ chỉ thấy bệnh nhân mình điều trị. |
| Migration | Một bước thay đổi cấu trúc cơ sở dữ liệu có đánh số, chạy tuần tự khi cập nhật hệ thống. |
| Check-in | Ghi nhận bệnh nhân đã đến phòng khám, đưa vào hàng chờ. |
| Khóa tư vấn (advisory lock) | Khóa do ứng dụng tự đặt tên trong PostgreSQL; dùng để hai giao dịch đặt lịch cho cùng bác sĩ không chạy chồng lên nhau. |
| Sự kiện miền (domain event) | Thông báo trong ứng dụng khi một việc nghiệp vụ xảy ra (ví dụ đóng phiên khám), để các module khác tự xử lý phần của mình. |
| Xóa mềm (soft delete) | Đánh dấu bản ghi đã xóa thay vì xóa hẳn, để giữ lịch sử và khôi phục được. |
| Gọi công cụ (tool calling) | Cách mô hình ngôn ngữ lớn yêu cầu ứng dụng chạy một hàm tra cứu có sẵn rồi dùng kết quả để trả lời. |
| Chế độ dự phòng (fallback) | Cách hệ thống tiếp tục hoạt động bằng mẫu soạn sẵn hoặc tra cứu theo từ khóa khi dịch vụ AI không dùng được. |
| Mã làm mới (refresh token) | Mã dài hạn trong cookie, dùng để xin mã truy cập mới mà không phải đăng nhập lại. |
| Container | Gói phần mềm chạy độc lập kèm toàn bộ môi trường cần thiết, khởi chạy bằng Docker. |

[[HET_DAU]]

::: {custom-style="Tiêu đề phụ"}
NHẬN XÉT CỦA GIẢNG VIÊN HƯỚNG DẪN
:::

…………………………………………………………………………………………………………

…………………………………………………………………………………………………………

…………………………………………………………………………………………………………

…………………………………………………………………………………………………………

…………………………………………………………………………………………………………

…………………………………………………………………………………………………………

…………………………………………………………………………………………………………

…………………………………………………………………………………………………………

::: {custom-style="Bìa trái"}
Điểm: …………… (Bằng chữ: ……………………)

Hà Nội, ngày …… tháng …… năm 2026

Giảng viên hướng dẫn (Ký, ghi rõ họ tên)
:::

[[NGAT]]

::: {custom-style="Tiêu đề phụ"}
NHẬN XÉT CỦA GIẢNG VIÊN PHẢN BIỆN
:::

…………………………………………………………………………………………………………

…………………………………………………………………………………………………………

…………………………………………………………………………………………………………

…………………………………………………………………………………………………………

…………………………………………………………………………………………………………

…………………………………………………………………………………………………………

…………………………………………………………………………………………………………

…………………………………………………………………………………………………………

::: {custom-style="Bìa trái"}
Điểm: …………… (Bằng chữ: ……………………)

Hà Nội, ngày …… tháng …… năm 2026

Giảng viên phản biện (Ký, ghi rõ họ tên)
:::

[[NGAT]]

::: {custom-style="Tiêu đề phụ"}
TÓM TẮT ĐỒ ÁN
:::

Đồ án xây dựng GenSmile, một ứng dụng web quản lý toàn bộ hoạt động của một phòng khám nha khoa nhiều bác sĩ: hồ sơ bệnh nhân, lịch hẹn và đặt lịch trực tuyến, tiếp nhận và hàng chờ, phiên khám với sơ đồ răng và lịch sử điều trị theo từng răng, kế hoạch điều trị và báo giá, hóa đơn và thanh toán (kể cả chuyển khoản VietQR được đối soát tự động), nhân sự, ca làm việc và tính lương, kho vật tư, nhắc lịch qua email/SMS/Zalo, bảng điều khiển và báo cáo cho quản lý. Bệnh nhân có thể tự đặt lịch, xác nhận hoặc dời lịch và tra cứu lịch sử khám qua đường dẫn bảo mật mà không cần tài khoản.

Hệ thống dùng kiến trúc ứng dụng một trang (React) gọi REST API (NestJS) trên cơ sở dữ liệu PostgreSQL, gồm 23 module nghiệp vụ, khoảng 340 điểm cuối API và 70 bảng dữ liệu. Phân quyền theo vai trò với 133 mã quyền, kết hợp giới hạn theo từng dòng dữ liệu (bác sĩ chỉ thấy bệnh nhân của mình) và nhật ký kiểm toán cho mọi thao tác nhạy cảm. Đồ án tích hợp mô hình ngôn ngữ lớn ở dạng có kiểm soát: AI chỉ soạn nháp và đề xuất, người dùng duyệt mới thực hiện, mô hình không nhìn thấy tên hay số điện thoại bệnh nhân.

Chất lượng được bảo đảm bằng khoảng 1.790 kiểm thử đơn vị, khoảng 100 kiểm thử API trên PostgreSQL thật và 122 kịch bản kiểm thử giao diện tự động, chạy trong 10 bước kiểm tra liên tục trước mỗi lần cập nhật. Hệ thống đã được triển khai bằng Docker trên máy chủ ảo và đáp ứng các mục tiêu trong phiếu giao đề tài, trừ phần lưu trữ phim X-quang được để lại làm hướng phát triển.

[[NGAT]]

::: {custom-style="Tiêu đề phụ"}
LỜI CAM ĐOAN
:::

Tôi xin cam đoan đồ án tốt nghiệp "Phát triển phần mềm quản lý phòng khám nha khoa" là kết quả thực hiện của bản thân dưới sự hướng dẫn của giảng viên hướng dẫn. Các nội dung, số liệu và kết quả trình bày trong đồ án là trung thực, được thu thập từ quá trình phân tích, thiết kế, cài đặt và kiểm thử hệ thống do tôi thực hiện. Mọi tài liệu tham khảo đều được trích dẫn đầy đủ theo quy định.

Tôi xin chịu hoàn toàn trách nhiệm về lời cam đoan này.

::: {custom-style="Bìa trái"}
Hà Nội, ngày …… tháng …… năm 2026

Sinh viên thực hiện

Trần Tuấn Anh
:::

[[NGAT]]

::: {custom-style="Tiêu đề phụ"}
LỜI CẢM ƠN
:::

Trước hết, em xin gửi lời cảm ơn chân thành đến giảng viên hướng dẫn ……………………, người đã định hướng, góp ý và theo sát em trong suốt quá trình thực hiện đồ án.

Em xin cảm ơn các thầy cô Khoa ……………………, Trường Đại học Phenikaa đã truyền đạt kiến thức nền tảng trong những năm học vừa qua, giúp em có đủ hành trang để hoàn thành đề tài.

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
| AI | Artificial Intelligence | Trí tuệ nhân tạo |
| API | Application Programming Interface | Giao diện lập trình ứng dụng |
| CI/CD | Continuous Integration / Continuous Delivery | Tích hợp và chuyển giao liên tục |
| CSDL | – | Cơ sở dữ liệu |
| CRUD | Create, Read, Update, Delete | Tạo, đọc, sửa, xóa |
| DTO | Data Transfer Object | Đối tượng truyền dữ liệu |
| E2E | End-to-End | Kiểm thử đầu cuối |
| ERD | Entity Relationship Diagram | Sơ đồ thực thể liên kết |
| FDI | Fédération Dentaire Internationale | Liên đoàn Nha khoa Thế giới (hệ đánh số răng) |
| HTTP | Hypertext Transfer Protocol | Giao thức truyền siêu văn bản |
| JWT | JSON Web Token | Mã thông báo JSON |
| KPI | Key Performance Indicator | Chỉ số hiệu suất chính |
| LLM | Large Language Model | Mô hình ngôn ngữ lớn |
| ORM | Object-Relational Mapping | Ánh xạ đối tượng – quan hệ |
| RBAC | Role-Based Access Control | Kiểm soát truy cập theo vai trò |
| REST | Representational State Transfer | Kiểu kiến trúc API dựa trên tài nguyên |
| SMS | Short Message Service | Tin nhắn ngắn |
| SPA | Single-Page Application | Ứng dụng web một trang |
| SĐT | – | Số điện thoại |
| UML | Unified Modeling Language | Ngôn ngữ mô hình hóa thống nhất |
| UUID | Universally Unique Identifier | Định danh duy nhất toàn cục |
| VPS | Virtual Private Server | Máy chủ ảo riêng |
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
| Nhật ký kiểm toán (audit log) | Bản ghi không sửa được về việc ai đã làm gì, lúc nào, trên dữ liệu nào. |
| Phạm vi theo dòng (row-level scope) | Giới hạn dữ liệu một người được thấy trong cùng một loại bản ghi, ví dụ bác sĩ chỉ thấy bệnh nhân mình điều trị. |
| Migration | Một bước thay đổi cấu trúc cơ sở dữ liệu có đánh số, chạy tuần tự khi cập nhật hệ thống. |

[[HET_DAU]]

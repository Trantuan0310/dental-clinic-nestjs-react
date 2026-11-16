# CHƯƠNG 5. KIỂM THỬ VÀ ĐÁNH GIÁ

Chương này trình bày chiến lược kiểm thử, kết quả kiểm thử chức năng và phi chức năng, các số liệu hiệu năng đo được, sau đó đối chiếu kết quả với mục tiêu trong phiếu giao đề tài và nêu những hạn chế còn tồn tại.

## 5.1. Chiến lược kiểm thử

Kiểm thử được tổ chức theo mô hình kim tự tháp [@sommerville]: nhiều kiểm thử đơn vị chạy nhanh ở đáy, ít hơn ở tầng API trên cơ sở dữ liệu thật, và một số kịch bản đầu cuối trên trình duyệt ở đỉnh (Bảng 5.1). Mọi tầng đều chạy tự động trong quy trình tích hợp liên tục (Bảng 4.3) trước khi một thay đổi được gộp vào nhánh chính.

::: {custom-style="bảng"}
Bảng 5.1. Các tầng kiểm thử của hệ thống
:::

| Tầng | Công cụ | Số lượng | Phạm vi kiểm tra |
|---|---|---|---|
| Đơn vị (máy chủ) | Jest [@jest] | 1.788 ca, 89 tệp | Quy tắc nghiệp vụ trong service và hàm miền: trạng thái, tính tiền, lương, KPI, phân quyền, khớp chuyển khoản; cơ sở dữ liệu được giả lập |
| API trên PostgreSQL thật | Jest + Supertest | 111 ca | Gọi HTTP thật qua toàn bộ guard, validation, giao dịch và ràng buộc của PostgreSQL 16: đồng thời, khóa, số thập phân, múi giờ |
| Đầu cuối (E2E) | Playwright [@playwright] | 122 kịch bản, 54 tệp | Thao tác người dùng trên trình duyệt thật với máy chủ và cơ sở dữ liệu thật |
| Tĩnh | TypeScript, ESLint | toàn bộ mã | Lỗi kiểu, quy chuẩn mã; đủ khóa ngôn ngữ Việt – Anh |

::: {custom-style="nguồn"}
Nguồn: Tác giả
:::

Môi trường kiểm thử: máy chủ Linux trên GitHub Actions (Ubuntu, Node.js 22, PostgreSQL 16 dạng dịch vụ), trình duyệt Chromium của Playwright. Mỗi lần chạy, cơ sở dữ liệu được tạo mới hoàn toàn từ các migration, nên kết quả không phụ thuộc dữ liệu cũ.

Tầng API trên PostgreSQL thật được đưa vào vì nhiều lỗi nghiêm trọng nhất của hệ thống quản lý chỉ xuất hiện với cơ sở dữ liệu thật: hai yêu cầu đồng thời, làm tròn số thập phân, ranh giới ngày theo múi giờ, ràng buộc khóa ngoại. Kiểm thử đơn vị với cơ sở dữ liệu giả lập không phát hiện được các lỗi này.

## 5.2. Kiểm thử chức năng

### 5.2.1. Các ca kiểm thử nghiệp vụ tiêu biểu

Bảng 5.2 đến Bảng 5.5 trích các ca kiểm thử tiêu biểu theo nhóm chức năng. Mã ca kiểm thử có dạng KT-nhóm-số, trong đó nhóm trùng với nhóm yêu cầu chức năng ở Mục 2.3 (LH: lịch hẹn, KB: khám bệnh, TT: thanh toán) hoặc BM cho bảo mật. Cột "Tầng" cho biết ca được tự động hóa ở tầng nào: API là kiểm thử trên PostgreSQL thật, E2E là kiểm thử trên trình duyệt. Tất cả các ca dưới đây đều đạt ở lần chạy cuối cùng.

::: {custom-style="bảng"}
Bảng 5.2. Ca kiểm thử nhóm lịch hẹn và tiếp nhận
:::

| Mã | Tình huống | Kết quả mong đợi | Tầng | Kết quả |
|---|---|---|---|---|
| KT-LH-01 | Hai yêu cầu đặt lịch cùng bác sĩ, cùng giờ gửi đồng thời | Đúng một lịch được tạo, yêu cầu còn lại nhận lỗi trùng lịch (409) | API | Đạt |
| KT-LH-02 | Hủy lịch rồi đặt lại đúng khung giờ đó | Đặt được | API | Đạt |
| KT-LH-03 | Đặt lịch vào ngày bác sĩ nghỉ phép | Bị từ chối | API | Đạt |
| KT-LH-04 | Đặt lịch vắt qua giờ nghỉ trưa giữa hai ca | Bị từ chối; lịch nằm trọn trong một ca thì được | API | Đạt |
| KT-LH-05 | Check-in ngoài khung giờ cho phép | Bị từ chối, trừ khi có lý do ghi đè | API | Đạt |
| KT-LH-06 | Lọc lịch theo ngày ở thời điểm 0h–7h giờ Việt Nam | Lịch thuộc đúng ngày Việt Nam, không lệch sang ngày UTC | API | Đạt |
| KT-LH-07 | Khách đặt lịch trực tuyến, lễ tân duyệt yêu cầu | Lịch hẹn và hồ sơ bệnh nhân được tạo | E2E | Đạt |
| KT-LH-08 | Khách mở đường dẫn trong tin nhắc để xác nhận hoặc dời lịch | Trạng thái lịch cập nhật; đường dẫn đã dùng hoặc hết hạn bị từ chối | E2E | Đạt |
| KT-LH-09 | Lễ tân chuyển khách sang bác sĩ khác trên màn hình điều phối | Khách xuất hiện ở hàng chờ bác sĩ mới | E2E | Đạt |

::: {custom-style="nguồn"}
Nguồn: Tác giả
:::

::: {custom-style="bảng"}
Bảng 5.3. Ca kiểm thử nhóm khám, điều trị và kho
:::

| Mã | Tình huống | Kết quả mong đợi | Tầng | Kết quả |
|---|---|---|---|---|
| KT-KB-01 | Hai yêu cầu "bắt đầu khám" cho cùng một lịch gửi đồng thời | Chỉ một phiên khám được tạo, cả hai nhận cùng phiên | API | Đạt |
| KT-KB-02 | Đóng phiên khám | Ghi chú bị khóa, đúng một hóa đơn nháp được tạo | API | Đạt |
| KT-KB-03 | Đóng một phiên khám hai lần | Lần thứ hai bị từ chối | API | Đạt |
| KT-KB-04 | Sửa ghi chú sau khi đã đóng phiên | Bị từ chối; chỉ được thêm phụ lục trong 30 ngày | API | Đạt |
| KT-KB-05 | Đóng phiên khi vật tư trong kho không đủ | Toàn bộ thay đổi tồn kho được hoàn tác, phiên vẫn mở, trả danh sách vật tư thiếu | API | Đạt |
| KT-KB-06 | Hai lần trừ kho đồng thời cho cùng một vật tư | Tồn kho không bao giờ âm | API | Đạt |
| KT-KB-07 | Bác sĩ khác mở phiên khám không phải của mình | Bị từ chối | API | Đạt |
| KT-KB-08 | Bác sĩ có lịch với bệnh nhân nhưng không phải người khám | Được xem, không được sửa | API | Đạt |
| KT-KB-09 | Áp dụng mẫu khám nhanh hai lần đồng thời | Các dòng điều trị chỉ được thêm một lần | API | Đạt |

::: {custom-style="nguồn"}
Nguồn: Tác giả
:::

::: {custom-style="bảng"}
Bảng 5.4. Ca kiểm thử nhóm hóa đơn và thanh toán
:::

| Mã | Tình huống | Kết quả mong đợi | Tầng | Kết quả |
|---|---|---|---|---|
| KT-TT-01 | Thu tiền khi hóa đơn còn ở trạng thái nháp | Bị từ chối | API | Đạt |
| KT-TT-02 | Thu số tiền lớn hơn số còn nợ | Bị từ chối, không có dòng thanh toán nào được ghi | API | Đạt |
| KT-TT-03 | Thu một phần rồi thu nốt | Trạng thái lần lượt là "một phần" và "đã thanh toán"; số dư khớp sổ thanh toán | API | Đạt |
| KT-TT-04 | Hai lễ tân cùng thu tiền một hóa đơn đồng thời | Không thu trùng, không có lỗi máy chủ | API | Đạt |
| KT-TT-05 | Sửa hóa đơn với số phiên bản cũ | Bị từ chối (kiểm soát đồng thời lạc quan) | API | Đạt |
| KT-TT-06 | Giảm giá có phần thập phân | Tổng tiền đúng đến đồng, lưu dạng số thập phân | API | Đạt |
| KT-TT-07 | Ngân hàng gửi cùng một giao dịch chuyển khoản nhiều lần | Khoản thanh toán chỉ được ghi một lần | API | Đạt |
| KT-TT-08 | Chuyển khoản có nội dung không chứa mã hóa đơn | Giao dịch vào danh sách cần xử lý, không tự ghi | Đơn vị | Đạt |
| KT-TT-09 | Bác sĩ xem hóa đơn của bệnh nhân không phải của mình | Bị từ chối | API | Đạt |

::: {custom-style="nguồn"}
Nguồn: Tác giả
:::

::: {custom-style="bảng"}
Bảng 5.5. Ca kiểm thử nhóm xác thực, phân quyền và bảo mật
:::

| Mã | Tình huống | Kết quả mong đợi | Tầng | Kết quả |
|---|---|---|---|---|
| KT-BM-01 | Gọi API không có mã truy cập, mã sai chữ ký hoặc đã hết hạn | 401 | API | Đạt |
| KT-BM-02 | Đăng nhập sai mật khẩu quá 5 lần trong một phút | Bị chặn tạm thời (429) | API | Đạt |
| KT-BM-03 | Dùng lại mã làm mới đã được xoay vòng | Bị từ chối | API | Đạt |
| KT-BM-04 | Đăng xuất | Cookie làm mới bị thu hồi | API | Đạt |
| KT-BM-05 | Tài khoản đã bị xóa dùng mã truy cập còn hạn | Bị từ chối | API | Đạt |
| KT-BM-06 | Lễ tân gọi API bảng lương, tạo ghi chú lâm sàng | 403 | API | Đạt |
| KT-BM-07 | Bác sĩ đổi tham số `dentistId` để xem lịch của bác sĩ khác | Không mở rộng được phạm vi | API | Đạt |
| KT-BM-08 | Truyền mã không phải UUID, ngày sinh trong tương lai, số điện thoại sai định dạng | 400 với thông báo rõ ràng | API | Đạt |
| KT-BM-09 | Mở đường dẫn tra cứu lịch sử đã hết hạn hoặc bị thu hồi | Từ chối giống hệt đường dẫn sai, không lộ dữ liệu | Đơn vị | Đạt |
| KT-BM-10 | Xin đường dẫn tra cứu bằng số điện thoại không có trong hệ thống | Phản hồi giống hệt trường hợp có, để không dò được số điện thoại | Đơn vị | Đạt |
| KT-BM-11 | Lễ tân gửi đường dẫn tra cứu, bệnh nhân mở trên trình duyệt khác | Bệnh nhân xem được lịch sử của chính mình | E2E | Đạt |

::: {custom-style="nguồn"}
Nguồn: Tác giả
:::

### 5.2.2. Kiểm thử đầu cuối các luồng chính

Ngoài các ca riêng lẻ, một số kịch bản E2E đi trọn một luồng nghiệp vụ qua nhiều màn hình và nhiều vai trò, như một người dùng thật:

- **Từ bệnh nhân đến thanh toán:** tạo bệnh nhân, đặt lịch, check-in, bác sĩ khám, thêm điều trị, đóng phiên, lễ tân phát hành hóa đơn và thu tiền.
- **Kế hoạch điều trị:** lập kế hoạch, bệnh nhân đồng ý, thực hiện từng dòng qua các phiên khám, tiến độ cập nhật.
- **Kỳ lương:** tạo kỳ, tính lương theo ca và hoa hồng, duyệt, chi trả.
- **Đăng ký ca và chi phí:** nhân viên đăng ký ca, quản lý duyệt; tạo, duyệt và hoàn ứng chi phí.
- **Xuất kho:** nhập vật tư, dùng trong điều trị, kiểm tra tồn kho giảm đúng.

Bộ E2E cũng kiểm tra chuyển đổi ngôn ngữ Việt – Anh và các yêu cầu tiếp cận cơ bản: có liên kết "chuyển tới nội dung chính" dùng được bằng bàn phím, các vùng trang có nhãn, hộp thoại giữ tiêu điểm bàn phím.

### 5.2.3. Số ca kiểm thử và độ bao phủ mã

Toàn bộ kiểm thử đơn vị của máy chủ được chạy lại với công cụ đo độ bao phủ của Jest: 1.788 ca trong 89 tệp, tất cả đều đạt, thời gian chạy khoảng 42 giây. Độ bao phủ được đo trên toàn bộ tệp service và controller (không chỉ các tệp có kiểm thử) và đạt 76,6% số dòng, 75,0% số câu lệnh, 70,0% số nhánh. Các hàm thuần trong thư mục `domain/` (xếp hàng chờ, khóa tư vấn, tính lương, tính chỉ số) không được tính vào con số này dù có kiểm thử riêng dạng bảng quyết định; kiểm thử API trên PostgreSQL và kiểm thử đầu cuối cũng không được tính. Bảng 5.6 thống kê theo module.

::: {custom-style="bảng"}
Bảng 5.6. Số ca kiểm thử đơn vị và độ bao phủ mã theo module
:::

| Module | Nội dung chính | Số ca | Dòng (%) | Nhánh (%) |
|---|---|---|---|---|
| appointments | Lịch hẹn, giờ trống, hàng chờ | 344 | 82,0 | 71,4 |
| booking | Đặt lịch trực tuyến, liên kết cho bệnh nhân | 245 | 84,0 | 77,8 |
| medical-records | Phiên khám, điều trị, sơ đồ răng | 197 | 73,6 | 72,2 |
| payroll | Kỳ lương, đăng ký ca | 197 | 71,5 | 60,9 |
| billing | Hóa đơn, thanh toán, webhook ngân hàng | 118 | 86,9 | 74,7 |
| patients | Hồ sơ bệnh nhân, gộp hồ sơ | 84 | 70,5 | 67,7 |
| ai | Trợ lý AI, soạn nháp | 80 | 88,3 | 76,9 |
| reports | Báo cáo, chỉ số vận hành | 58 | 85,2 | 73,6 |
| staff | Nhân viên, hồ sơ bác sĩ | 47 | 74,8 | 62,3 |
| auth, users, roles | Xác thực, người dùng, phân quyền | 93 | 70,7 | 60,8 |
| Các module còn lại | Danh mục, kho, kế hoạch, chi phí, đồng ý, nhắc tái khám, thông báo, tin nhắn, kiểm toán, ảnh… | 325 | 63,8 | 62,8 |
| **Tổng** | | **1.788** | **76,6** | **70,0** |

::: {custom-style="nguồn"}
Nguồn: Tác giả, chạy `npx jest --coverage` trên mã nguồn ngày 15/11/2026
:::

Số ca kiểm thử tập trung ở những module có nhiều quy tắc và rủi ro nhất: lịch hẹn và đặt lịch (gần một phần ba tổng số ca), khám bệnh, lương và thanh toán. Một số module có độ bao phủ thấp hơn, như chi phí vận hành (36,7% số dòng) và các guard dùng chung trong `common/` (29,3%); phần lớn đường đi của các guard này được kiểm tra gián tiếp qua kiểm thử API trên PostgreSQL thật (Bảng 5.5), nhưng đây vẫn là điểm cần bổ sung kiểm thử đơn vị.

## 5.3. Kiểm thử phi chức năng

### 5.3.1. Hiệu năng

Thời gian phản hồi của một số API thường dùng được đo trên máy chạy thử với bộ dữ liệu mẫu 6 tháng (500 bệnh nhân, khoảng 2.400 hóa đơn), mỗi API gọi liên tiếp 50 lần (Bảng 5.7). Kết quả cho thấy các thao tác hằng ngày phản hồi dưới 20 ms ở phía máy chủ; API tổng hợp chỉ số cho bảng điều khiển, vốn tính trên toàn bộ dữ liệu 30 ngày, phản hồi dưới 60 ms.

::: {custom-style="bảng"}
Bảng 5.7. Thời gian phản hồi của một số API (50 lần gọi)
:::

| API | Trung vị (ms) | Phân vị 95 (ms) |
|---|---|---|
| Lịch sử điều trị một răng | 15 | 19 |
| Tìm bệnh nhân theo tên (20 kết quả) | 14 | 15 |
| Lịch hẹn trong ngày | 13 | 15 |
| Doanh thu theo ngày (30 ngày) | 12 | 13 |
| Chỉ số bảng điều khiển (30 ngày) | 46 | 56 |

::: {custom-style="nguồn"}
Nguồn: Tác giả, đo trên máy chạy thử
:::

Hai tối ưu đáng kể được thực hiện trong quá trình phát triển, có đo trước và sau (Bảng 5.8).

::: {custom-style="bảng"}
Bảng 5.8. Kết quả tối ưu hiệu năng
:::

| Hạng mục | Trước | Sau |
|---|---|---|
| Số yêu cầu để hiện lịch sử một răng (bệnh nhân có 50 phiên khám) | tối đa 50 | 1 |
| Gói mã giao diện chính (chưa nén) | 540 KB | 384 KB |
| Gói mã giao diện chính (nén gzip) | 156 KB | 109 KB |

::: {custom-style="nguồn"}
Nguồn: Tác giả
:::

Gói mã giảm nhờ tách bản tiếng Anh thành gói riêng và tải lười các trang. Với người dùng, trang đăng nhập và trang chủ mở nhanh hơn rõ rệt trên kết nối di động.

### 5.3.2. Bảo mật

Các biện pháp bảo mật được đối chiếu với danh sách rủi ro OWASP Top 10 [@owasp] ở Bảng 3.7 và được kiểm thử tự động ở Bảng 5.5. Ngoài ra:

- **Mật khẩu** được băm bằng Argon2 [@argon2]; mã làm mới được lưu dạng băm, xoay vòng mỗi lần dùng, phát hiện dùng lại.
- **Khóa bí mật** không có trong mã nguồn; tệp cấu hình mẫu chỉ chứa tên biến.
- **Dữ liệu gửi cho AI** được kiểm thử đơn vị để bảo đảm không chứa họ tên, số điện thoại, email của bệnh nhân; các công cụ của trợ lý AI chỉ trả về dữ liệu trong phạm vi quyền của người hỏi.
- **Nhật ký kiểm toán** ghi lại các thao tác đọc hồ sơ lâm sàng và mọi thao tác ghi quan trọng.

### 5.3.3. Khả năng sử dụng

Giao diện được kiểm tra trên hai cỡ màn hình: máy tính (1440 px) cho nhân viên và điện thoại (390 px) cho các trang công khai của bệnh nhân (Hình 4.12). Các nguyên tắc khả dụng của Nielsen [@nielsen] được áp dụng: trạng thái hệ thống luôn hiển thị (huy hiệu trạng thái, thông báo sau mỗi thao tác), ngăn lỗi trước khi xảy ra (xác nhận trước khi đóng phiên khám, cảnh báo dị ứng), cho phép hoàn tác (sơ đồ răng). Toàn bộ chữ giao diện có hai ngôn ngữ.

Hệ thống đã được trình diễn trên bộ dữ liệu mẫu với kịch bản một ngày làm việc của phòng khám. Việc đánh giá với người dùng thật tại phòng khám chưa được thực hiện và được nêu trong phần hạn chế.

## 5.4. Những điểm nổi bật của hệ thống

Phần này tổng hợp những điểm làm GenSmile khác với một phần mềm quản lý thông thường. Mỗi điểm đều gắn với một vấn đề cụ thể của phòng khám và có minh chứng kiểm chứng được trong báo cáo (Bảng 5.9).

::: {custom-style="bảng"}
Bảng 5.9. Các điểm nổi bật của hệ thống và minh chứng
:::

| Điểm nổi bật | Cách hệ thống giải quyết | Minh chứng |
|---|---|---|
| Lịch sử điều trị theo từng răng | Bấm vào răng trên sơ đồ hai cung răng là thấy tình trạng và mọi lần điều trị trước của răng đó, trong một yêu cầu | Hình 4.7, Bảng 5.8 |
| Không bao giờ đặt trùng lịch | Khóa tư vấn của PostgreSQL theo bác sĩ và bệnh nhân, kiểm tra trùng ngay trong giao dịch | Mục 4.3.1, ca KT-LH-01 |
| Chuyển khoản tự ghi vào hóa đơn | Mã VietQR mang sẵn mã hóa đơn; ngân hàng báo về thì hóa đơn tự cập nhật trong vài giây; khoản không khớp được đưa vào danh sách cần xử lý | Hình 4.10, 4.11, ca KT-TT-07 |
| Một lần đóng phiên khám, nhiều việc tự chạy | Đóng phiên khám trừ vật tư trong cùng giao dịch, rồi tự tạo hóa đơn nháp, ghi ca tính lương và cập nhật tóm tắt hồ sơ | Mục 4.3.2, ca KT-KB-02, KT-KB-05 |
| Bệnh nhân tự phục vụ, không cần tài khoản | Đặt lịch trực tuyến; đường dẫn bảo mật có thời hạn để xác nhận, dời lịch và xem lịch sử khám trên điện thoại | Hình 4.2, 4.12 |
| Dữ liệu sức khỏe được bảo vệ nhiều lớp | Phân quyền theo vai trò với 133 mã quyền, bác sĩ chỉ thấy bệnh nhân của mình, nhật ký kiểm toán cả thao tác đọc | Bảng 2.9, Bảng 5.5, Mục 3.4 |
| AI hữu ích nhưng có kiểm soát | AI chỉ đọc qua công cụ trong phạm vi quyền, không nhận tên hay số điện thoại bệnh nhân, mọi thay đổi phải được người dùng bấm xác nhận, vẫn chạy ở chế độ dự phòng khi dịch vụ AI lỗi | Mục 3.3.11, Hình 4.16 |
| Chỉ số vận hành cho chủ phòng khám | Sáu chỉ số vận hành so với mục tiêu, công suất ghế theo giờ, hành trình bệnh nhân, tuổi công nợ | Hình 4.14, 4.15 |
| Chất lượng được kiểm chứng liên tục | Khoảng 2.000 kiểm thử tự động ở ba tầng, chạy trong 10 bước trước mỗi lần cập nhật | Bảng 4.3, Bảng 5.1 |

::: {custom-style="nguồn"}
Nguồn: Tác giả
:::

## 5.5. Đối chiếu kết quả với mục tiêu đề tài

Bảng 5.10 đối chiếu từng mục tiêu trong phiếu giao đề tài với kết quả đạt được và minh chứng tương ứng trong báo cáo.

::: {custom-style="bảng"}
Bảng 5.10. Đối chiếu kết quả với mục tiêu trong phiếu giao đề tài
:::

| Mục tiêu | Kết quả đạt được | Minh chứng | Mức độ |
|---|---|---|---|
| Quản lý toàn diện: hồ sơ bệnh nhân, lịch hẹn, điều trị, kho, thanh toán | 23 module nghiệp vụ, 339 API, 70 bảng dữ liệu | Bảng 3.1, Mục 4.5 | Đạt |
| Số hóa đặt lịch và tiếp nhận, giảm sai sót | Đặt lịch trực tuyến; chống trùng lịch ở mức cơ sở dữ liệu; hàng chờ và điều phối theo bác sĩ | Hình 4.2–4.5, KT-LH-01 | Đạt |
| Bác sĩ theo dõi lịch sử, kế hoạch điều trị, sơ đồ răng tập trung | Sơ đồ răng gắn với điều trị, lịch sử theo từng răng, kế hoạch điều trị có tiến độ | Hình 4.7, 4.8 | Đạt |
| Báo cáo, thống kê: doanh thu, lượt khám, hiệu suất bác sĩ, tồn kho | Bảng điều khiển, sáu chỉ số vận hành có mục tiêu, báo cáo doanh thu theo bác sĩ và dịch vụ, cảnh báo tồn kho | Hình 4.14, 4.15 | Đạt |
| Nhắc lịch tự động qua email, SMS, Zalo | Nhắc lịch theo kênh ưu tiên, thử lại tối đa 3 lần; email gửi qua SMTP; SMS và Zalo đã cài đặt nhưng chưa thử với nhà cung cấp thật | Mục 3.3.6 | Đạt một phần |
| Bệnh nhân tra cứu lịch sử khám dễ dàng | Đường dẫn bảo mật, có thời hạn, không cần tài khoản | Hình 4.12 | Đạt |
| Hồ sơ X-quang | Chưa thực hiện | – | Chưa đạt |

::: {custom-style="nguồn"}
Nguồn: Tác giả
:::

Ở mức chi tiết hơn, Phụ lục B truy vết từng yêu cầu trong 34 yêu cầu chức năng của Mục 2.3 tới thiết kế, giao diện và ca kiểm thử tương ứng; mọi yêu cầu đều có ít nhất một hình thiết kế hoặc giao diện và ít nhất một cách kiểm thử. Ngoài các mục tiêu trên, đồ án thực hiện thêm đối soát chuyển khoản VietQR tự động và trợ lý AI có kiểm soát.

## 5.6. Hạn chế

- **Chưa có hồ sơ X-quang:** chưa lưu và xem được phim chụp, một phần quan trọng của hồ sơ nha khoa.
- **Kênh SMS và Zalo chưa được thử với nhà cung cấp thật:** phần gửi tin đã cài đặt theo tài liệu của nhà cung cấp và được kiểm thử với bộ giả lập, nhưng cần tài khoản doanh nghiệp để chạy thật.
- **Độ bao phủ kiểm thử chưa đều:** một số module như chi phí vận hành và các guard dùng chung có độ bao phủ kiểm thử đơn vị thấp (Bảng 5.6), mới được kiểm tra gián tiếp qua kiểm thử API.
- **Chưa kiểm thử tải:** các số đo ở Bảng 5.7 là thời gian phản hồi với một người dùng; khả năng chịu tải khi nhiều người dùng cùng lúc mới được suy ra từ thiết kế, chưa đo.
- **Chưa đánh giá với người dùng thật:** hệ thống mới được trình diễn trên dữ liệu mẫu, chưa vận hành tại một phòng khám.
- **Phụ thuộc dịch vụ AI bên ngoài:** chất lượng trả lời của trợ lý phụ thuộc mô hình được cấu hình; khi dịch vụ AI lỗi, hệ thống chuyển sang chế độ dự phòng có khả năng hạn chế hơn.
- **Một phòng khám, không có ứng dụng di động riêng:** chưa hỗ trợ nhiều chi nhánh; bệnh nhân dùng trình duyệt trên điện thoại.

## 5.7. Kết luận chương

Hệ thống được kiểm thử ở ba tầng với khoảng 2.000 ca tự động, chạy lại trước mỗi lần cập nhật. Các tình huống khó nhất của phần mềm quản lý (yêu cầu đồng thời, thanh toán trùng, phân quyền theo dòng dữ liệu, múi giờ) đều được kiểm thử trên PostgreSQL thật và đạt. Thời gian phản hồi các API thường dùng dưới 20 ms. Hệ thống có các điểm nổi bật rõ ràng: lịch sử điều trị theo từng răng, chống đặt trùng lịch ở mức cơ sở dữ liệu, đối soát chuyển khoản tự động, bệnh nhân tự phục vụ không cần tài khoản và AI có kiểm soát. Đối chiếu với phiếu giao đề tài, hệ thống đạt các mục tiêu chính, trừ phần X-quang và việc chạy thật kênh SMS, Zalo.

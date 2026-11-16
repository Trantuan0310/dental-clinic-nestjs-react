# MỞ ĐẦU

## 1. Lý do chọn đề tài

Nha khoa là lĩnh vực khám chữa bệnh có tần suất quay lại cao: một bệnh nhân thường đến nhiều lần cho một liệu trình (điều trị tủy, bọc sứ, chỉnh nha, cấy ghép implant), và được nhắc tái khám định kỳ sau khi kết thúc. Mỗi lần đến tạo ra nhiều loại thông tin liên quan chặt chẽ với nhau: lịch hẹn, tình trạng từng chiếc răng, thủ thuật đã làm, vật tư đã dùng, đơn thuốc, hóa đơn và số tiền còn nợ. Ở các phòng khám tư nhân quy mô nhỏ và vừa, những thông tin này thường được ghi trên sổ giấy, bảng tính và tin nhắn điện thoại, mỗi người nắm một phần.

Cách làm thủ công này gây ra những khó khăn quen thuộc. Lễ tân khó biết giờ nào bác sĩ nào còn trống nên lịch hẹn dễ chồng chéo hoặc để trống ghế. Khách quên lịch mà không được nhắc. Bác sĩ muốn xem chiếc răng số 36 đã được điều trị gì từ trước phải lật lại nhiều trang hồ sơ. Công nợ của khách điều trị nhiều đợt khó theo dõi, vật tư hết lúc nào không hay. Chủ phòng khám thiếu số liệu đáng tin cậy để biết tỷ lệ khách bỏ hẹn, công suất ghế hay doanh thu thực thu. Về phía bệnh nhân, muốn biết mình đã khám những gì, còn nợ bao nhiêu thì phải gọi điện hỏi phòng khám.

Trong khi đó, khung pháp lý về hồ sơ y tế điện tử và bảo vệ dữ liệu cá nhân ở Việt Nam ngày càng rõ ràng [@tt46; @nd13], đòi hỏi phần mềm quản lý không chỉ tiện lợi mà còn phải kiểm soát được ai được xem dữ liệu sức khỏe nào và lưu vết mọi thao tác. Các phần mềm quản lý nha khoa nước ngoài có đầy đủ chức năng [@opendental; @dentrix] nhưng chưa phù hợp với quy trình, ngôn ngữ, cách thanh toán (chuyển khoản qua mã QR) và kênh liên lạc (Zalo) phổ biến ở Việt Nam.

Xuất phát từ thực tế đó, em chọn đề tài **"Phát triển phần mềm quản lý phòng khám nha khoa"**, với sản phẩm là ứng dụng web GenSmile, nhằm số hóa trọn vẹn vòng hoạt động của một phòng khám, từ lúc khách đặt lịch đến lúc thanh toán và được nhắc tái khám.

## 2. Mục đích nghiên cứu

**Mục đích tổng quát:** xây dựng một hệ thống phần mềm hỗ trợ quản lý toàn diện hoạt động của một phòng khám nha khoa, an toàn về dữ liệu, dễ sử dụng với nhân viên và bệnh nhân, và đủ ổn định để vận hành thực tế.

**Các mục tiêu cụ thể** (theo phiếu giao đề tài):

- Xây dựng hệ thống hỗ trợ quản lý toàn diện hoạt động của phòng khám: hồ sơ bệnh nhân, lịch hẹn khám, quy trình điều trị, kho vật tư và thanh toán.
- Số hóa quy trình đặt lịch và tiếp nhận bệnh nhân, giảm thời gian chờ và sai sót do thao tác thủ công.
- Hỗ trợ bác sĩ theo dõi lịch sử điều trị, kế hoạch điều trị và hồ sơ nha khoa (sơ đồ răng) của từng bệnh nhân một cách tập trung.
- Cung cấp công cụ báo cáo, thống kê cho quản lý: doanh thu, số lượt khám, hiệu suất bác sĩ, tồn kho vật tư.
- Cải thiện trải nghiệm bệnh nhân qua nhắc lịch hẹn tự động (email, SMS, Zalo) và tra cứu lịch sử khám dễ dàng.

## 3. Đối tượng nghiên cứu

- Quy trình nghiệp vụ của phòng khám nha khoa: đặt lịch, tiếp nhận, khám và điều trị, lập kế hoạch điều trị, thanh toán, nhắc tái khám, quản lý nhân sự và vật tư.
- Mô hình dữ liệu hồ sơ nha khoa, trong đó có hệ đánh số răng FDI [@iso3950] và lịch sử tình trạng của từng răng qua các lần khám.
- Kiến trúc ứng dụng web nhiều lớp gồm giao diện một trang, REST API và cơ sở dữ liệu quan hệ.
- Cơ chế phân quyền theo vai trò kết hợp giới hạn theo dòng dữ liệu, nhật ký kiểm toán và bảo vệ dữ liệu sức khỏe.
- Tích hợp dịch vụ ngoài: thanh toán chuyển khoản qua VietQR, gửi email, SMS, Zalo.
- Ứng dụng mô hình ngôn ngữ lớn (LLM) trong phần mềm nghiệp vụ theo hướng có kiểm soát.

## 4. Phạm vi nghiên cứu

**Về nội dung**, hệ thống bao gồm các phân hệ được nêu trong phiếu giao đề tài:

- quản lý bệnh nhân (hồ sơ, lịch sử khám, sơ đồ răng);
- quản lý lịch hẹn (đặt lịch, nhắc lịch, xác nhận), kể cả đặt lịch trực tuyến của bệnh nhân;
- quản lý điều trị (kế hoạch điều trị, tiến độ, dịch vụ đã dùng);
- quản lý thanh toán và hóa đơn;
- quản lý nhân sự (bác sĩ, lễ tân, ca làm việc, bảng lương);
- quản lý kho vật tư nha khoa;
- báo cáo và thống kê cho quản lý.

Ngoài ra, đồ án bổ sung một số chức năng làm tăng giá trị thực tế: tra cứu lịch sử khám cho bệnh nhân qua đường dẫn bảo mật, đối soát chuyển khoản tự động và trợ lý AI cho nhân viên.

Đồ án **không** bao gồm: lưu trữ và xem phim X-quang, quản lý nhiều chi nhánh, thanh toán bảo hiểm y tế và ứng dụng di động riêng; các nội dung này được nêu ở phần hướng phát triển.

**Về không gian**, hệ thống được thiết kế cho một phòng khám nha khoa tư nhân có nhiều bác sĩ, nhiều ghế nha và một quầy lễ tân, truy cập qua trình duyệt trên máy tính và điện thoại.

**Về thời gian**, đề tài được thực hiện trong thời gian làm đồ án tốt nghiệp năm học 2025–2026.

## 5. Phương pháp nghiên cứu

- **Phương pháp khảo sát và phân tích tài liệu:** tìm hiểu quy trình vận hành thực tế tại Nha khoa An Việt qua trao đổi với bác sĩ Nguyễn Văn Việt, các văn bản pháp lý liên quan [@tt46; @nd13] và các phần mềm quản lý nha khoa hiện có [@opendental; @dentrix] để xác định yêu cầu và khoảng trống cần giải quyết.
- **Phương pháp phân tích, thiết kế hướng đối tượng:** mô hình hóa yêu cầu bằng biểu đồ use case, mô hình hóa dữ liệu bằng sơ đồ thực thể liên kết, mô tả hành vi bằng biểu đồ tuần tự và biểu đồ trạng thái theo chuẩn UML [@uml].
- **Phương pháp phát triển lặp:** chia hệ thống thành các module nghiệp vụ, phát triển và phát hành từng phần nhỏ; mỗi thay đổi đi qua kiểm thử tự động và quy trình tích hợp liên tục trước khi đưa vào nhánh chính [@fowler_ci].
- **Phương pháp thực nghiệm và đánh giá:** kiểm thử đơn vị, kiểm thử API trên cơ sở dữ liệu thật, kiểm thử giao diện đầu cuối; đo các chỉ số hiệu năng trước và sau tối ưu; đối chiếu kết quả với từng mục tiêu trong phiếu giao đề tài.

## 6. Những điểm nổi bật của đề tài

So với một phần mềm quản lý phòng khám thông thường, GenSmile lưu hồ sơ nha khoa theo từng răng trên sơ đồ hai cung răng FDI, bảo đảm lịch hẹn không trùng ngay ở mức cơ sở dữ liệu, và tự đối soát thanh toán VietQR khi tiền về tài khoản.

Bệnh nhân tự đặt, xác nhận, dời lịch và xem lịch sử khám qua đường dẫn bảo mật mà không cần tài khoản. Trợ lý AI hỗ trợ nhân viên tra cứu, soạn nháp nhưng không nhận thông tin định danh bệnh nhân và không tự thay đổi dữ liệu khi người dùng chưa xác nhận. Khoảng 2.000 kiểm thử tự động chạy trước mỗi lần cập nhật, và hệ thống đã được triển khai thật trên máy chủ.

## 7. Ý nghĩa khoa học và thực tiễn

**Về khoa học**, đồ án trình bày một cách tiếp cận có hệ thống để xây dựng phần mềm quản lý y tế quy mô nhỏ: hồ sơ được thiết kế để lưu lịch sử theo từng răng; phân quyền theo vai trò kết hợp giới hạn theo dòng dữ liệu; mô hình ngôn ngữ lớn được đưa vào phần mềm nghiệp vụ theo nguyên tắc "AI đề xuất, con người quyết định", có phương án dự phòng khi AI không hoạt động.

**Về thực tiễn**, hệ thống có thể dùng ngay cho một phòng khám nha khoa: giảm ghi chép trùng lặp, tránh đặt trùng lịch, tự nhắc khách, giúp bác sĩ xem nhanh lịch sử từng răng, giúp lễ tân thu tiền và theo dõi công nợ chính xác, và cung cấp cho chủ phòng khám các chỉ số vận hành để ra quyết định.

## 8. Bố cục đồ án

Ngoài phần Mở đầu, Kết luận, Tài liệu tham khảo và Phụ lục, đồ án gồm năm chương:

- **Chương 1. Cơ sở lý thuyết và công nghệ:** nghiệp vụ phòng khám nha khoa, tổng quan các phần mềm hiện có, kiến trúc và công nghệ sử dụng, các vấn đề bảo mật, thanh toán và ứng dụng AI.
- **Chương 2. Khảo sát hiện trạng và phân tích yêu cầu:** quy trình tại phòng khám, các tác nhân, yêu cầu chức năng và phi chức năng, biểu đồ use case.
- **Chương 3. Phân tích và thiết kế hệ thống:** kiến trúc tổng thể và 23 module nghiệp vụ, thiết kế cơ sở dữ liệu, đặc tả các chức năng chính kèm biểu đồ tuần tự, hoạt động và trạng thái, thiết kế bảo mật và giao diện.
- **Chương 4. Xây dựng và triển khai hệ thống:** môi trường phát triển, tổ chức mã nguồn, các điểm cài đặt quan trọng kèm đoạn mã, giao diện các chức năng tiêu biểu chụp từ hệ thống chạy thật, quy trình tích hợp liên tục và triển khai.
- **Chương 5. Kiểm thử và đánh giá:** chiến lược kiểm thử ba tầng, các ca kiểm thử tiêu biểu, số ca và độ bao phủ mã, hiệu năng, những điểm nổi bật, đối chiếu với mục tiêu đề tài và các hạn chế.

Phần Phụ lục gồm hướng dẫn cài đặt và triển khai (A) và ma trận truy vết từ yêu cầu tới thiết kế, giao diện và kiểm thử (B).

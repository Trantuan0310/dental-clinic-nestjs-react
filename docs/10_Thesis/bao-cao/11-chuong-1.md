# CHƯƠNG 1. CƠ SỞ LÝ THUYẾT VÀ CÔNG NGHỆ

Chương này trình bày các kiến thức làm nền tảng cho đồ án: đặc thù nghiệp vụ của phòng khám nha khoa, tổng quan các phần mềm quản lý hiện có, kiến trúc và công nghệ được lựa chọn, các vấn đề bảo mật và quyền riêng tư dữ liệu y tế, thanh toán điện tử, ứng dụng mô hình ngôn ngữ lớn và phương pháp kiểm thử, triển khai. Mỗi nội dung được trình bày ở mức cần thiết để giải thích các quyết định thiết kế ở Chương 3 và Chương 4.

## 1.1. Nghiệp vụ phòng khám nha khoa

### 1.1.1. Đặc điểm hoạt động

Khác với khám bệnh thông thường, điều trị nha khoa thường kéo dài qua nhiều lần hẹn và gắn với từng chiếc răng cụ thể. Một bệnh nhân có thể vừa trám răng hàm dưới bên trái, vừa đang trong liệu trình bọc sứ răng cửa hàm trên, vừa được nhắc cạo vôi định kỳ sáu tháng một lần. Vì vậy, dữ liệu của phòng khám nha khoa có ba đặc điểm cần được phần mềm phản ánh:

- **Theo thời gian:** mỗi lần khám (phiên khám) ghi lại lý do khám, chẩn đoán, các thủ thuật đã làm, đơn thuốc và tình trạng răng tại thời điểm đó. Lịch sử phải được giữ nguyên, không ghi đè.
- **Theo vị trí:** thủ thuật và tình trạng được gắn với số răng. Câu hỏi thường gặp của bác sĩ là "răng này đã làm gì, khi nào, ai làm".
- **Theo kế hoạch:** các ca phức tạp được lập kế hoạch điều trị gồm nhiều bước, có báo giá, bệnh nhân đồng ý rồi thực hiện dần qua nhiều phiên khám.

Vòng hoạt động cơ bản của một phòng khám gồm: đặt lịch → tiếp nhận (check-in) → chờ khám → khám và điều trị → lập hóa đơn và thu tiền → hẹn tái khám. Song song là các hoạt động hỗ trợ: quản lý ca làm việc và tính lương bác sĩ, quản lý kho vật tư (thuốc tê, vật liệu trám, mũi khoan…), chi phí vận hành và báo cáo.

### 1.1.2. Hệ thống ký hiệu răng FDI

Để ghi nhận chính xác vị trí điều trị, ngành nha khoa sử dụng các hệ thống ký hiệu răng chuẩn. Hệ thống phổ biến nhất trên thế giới và ở Việt Nam là hệ hai chữ số của Liên đoàn Nha khoa Thế giới (FDI), được chuẩn hóa trong ISO 3950 [@iso3950]. Trong hệ này, chữ số thứ nhất chỉ một phần tư hàm (cung phần tư), chữ số thứ hai chỉ vị trí răng tính từ đường giữa ra phía sau:

- Răng vĩnh viễn: cung phần tư 1 (hàm trên bên phải bệnh nhân), 2 (hàm trên bên trái), 3 (hàm dưới bên trái), 4 (hàm dưới bên phải); vị trí từ 1 (răng cửa giữa) đến 8 (răng khôn). Ví dụ răng 36 là răng hàm lớn thứ nhất hàm dưới bên trái.
- Răng sữa: cung phần tư 5 đến 8, vị trí từ 1 đến 5 (ví dụ răng 85).

Hệ thống trong đồ án dùng ký hiệu FDI cho mọi dữ liệu gắn với răng (thủ thuật, kế hoạch điều trị, sơ đồ răng) và kiểm tra tính hợp lệ của số răng ở cả giao diện lẫn máy chủ. Sơ đồ răng được vẽ theo dạng cung như nhìn từ mặt nhai, sắp xếp như bác sĩ nhìn vào miệng bệnh nhân (bên phải bệnh nhân nằm bên trái hình), như Hình 1.1.

::: {custom-style="Ảnh"}
![](hinh/1-1-so-do-rang-fdi.png){width=11cm}
:::

::: {custom-style="hình"}
Hình 1.1. Sơ đồ 32 răng vĩnh viễn đánh số theo hệ FDI
:::

::: {custom-style="nguồn"}
Nguồn: Tác giả, chụp từ hệ thống GenSmile
:::

### 1.1.3. Yêu cầu pháp lý về hồ sơ và dữ liệu cá nhân

Thông tư 46/2018/TT-BYT của Bộ Y tế quy định về hồ sơ bệnh án điện tử, trong đó nhấn mạnh việc bảo đảm tính toàn vẹn, khả năng truy vết người tạo và người sửa hồ sơ, cũng như phân quyền truy cập [@tt46]. Nghị định 13/2023/NĐ-CP về bảo vệ dữ liệu cá nhân xếp dữ liệu về tình trạng sức khỏe vào nhóm dữ liệu cá nhân nhạy cảm, yêu cầu bên xử lý dữ liệu phải có biện pháp bảo vệ phù hợp và chỉ xử lý trong phạm vi cần thiết [@nd13]. Hai văn bản này định hướng nhiều quyết định của đồ án: hồ sơ khám sau khi đóng chỉ được bổ sung chứ không được sửa đè, mọi thao tác nhạy cảm đều ghi nhật ký kiểm toán, nhân viên chỉ thấy dữ liệu cần cho công việc của mình, và dữ liệu nhận diện bệnh nhân không được gửi cho dịch vụ AI bên ngoài.

## 1.2. Tổng quan các phần mềm quản lý phòng khám nha khoa

Thị trường có hai nhóm giải pháp chính. Nhóm thứ nhất là các phần mềm nước ngoài lâu năm như Open Dental [@opendental] (mã nguồn mở) và Dentrix [@dentrix] (thương mại): đầy đủ chức năng từ lịch hẹn, sơ đồ răng đến bảo hiểm và báo cáo, nhưng được thiết kế theo quy trình, thanh toán và bảo hiểm của Bắc Mỹ, giao diện tiếng Anh, chủ yếu cài trên máy tính để bàn.

Nhóm thứ hai là các phần mềm trong nước chạy trên nền tảng đám mây, tiêu biểu là SimlyDent [@simlydent]. Theo nhà cung cấp công bố, SimlyDent có lịch hẹn, sơ đồ răng tương tác, hồ sơ bệnh án điện tử, thu chi, kho vật tư, nhắc lịch qua SMS, email và hỗ trợ nhiều chi nhánh; đặt lịch trực tuyến là tính năng mua thêm ở một số gói. Các trang giới thiệu không đề cập tới việc tự đối soát chuyển khoản theo hóa đơn, giới hạn dữ liệu theo từng bác sĩ hay trợ lý AI. Ngoài ra, nhiều phòng khám nhỏ vẫn quản lý bằng sổ sách, bảng tính và ứng dụng nhắn tin.

Bảng 1.1 so sánh các tiêu chí quan trọng giữa cách quản lý thủ công, phần mềm nước ngoài, phần mềm trong nước và hệ thống GenSmile của đồ án. Với SimlyDent, bảng chỉ ghi những gì nhà cung cấp công bố trên trang giới thiệu; "không thấy công bố" nghĩa là trang giới thiệu không nhắc tới, không khẳng định phần mềm không có.

::: {custom-style="bảng"}
Bảng 1.1. So sánh các cách quản lý phòng khám nha khoa
:::

| Tiêu chí | Sổ sách, bảng tính, tin nhắn | Phần mềm nước ngoài (Open Dental, Dentrix) | Phần mềm trong nước (SimlyDent) | GenSmile (đồ án) |
|---|---|---|---|---|
| Lịch hẹn nhiều bác sĩ, chống trùng giờ | Thủ công | Có | Có | Có, khóa ở cơ sở dữ liệu |
| Bệnh nhân tự đặt lịch trực tuyến | Không | Tùy gói, thêm phí | Mua thêm ở một số gói | Có |
| Sơ đồ răng, lịch sử theo từng răng | Không | Có | Có sơ đồ răng | Có, xem lịch sử ngay trên răng |
| Kế hoạch điều trị, báo giá | Thủ công | Có | Có | Có |
| Thanh toán chuyển khoản QR, tự đối soát | Không | Không phù hợp Việt Nam | Không thấy công bố | Có (VietQR, webhook) |
| Nhắc lịch qua SMS, email tiếng Việt | Thủ công | Không | Có | Có |
| Phân quyền theo vai trò và theo dòng dữ liệu | Không | Theo vai trò | Phân quyền nhân sự | Có cả hai |
| Nhật ký kiểm toán | Không | Có | Không thấy công bố | Có |
| Bệnh nhân tự tra cứu lịch sử khám | Không | Qua cổng bệnh nhân | Không thấy công bố | Có, đường dẫn bảo mật |
| Nhiều chi nhánh | Không | Có | Có | Chưa hỗ trợ |
| Truy cập qua trình duyệt, điện thoại | Một phần | Chủ yếu máy bàn | Có (đám mây) | Có |
| Trợ lý AI có kiểm soát | Không | Không | Không thấy công bố | Có |

::: {custom-style="nguồn"}
Nguồn: Tác giả tổng hợp từ [@opendental; @dentrix; @simlydent] và khảo sát thực tế
:::

Từ so sánh trên, phần mềm trong nước như SimlyDent đã đáp ứng tốt nhu cầu vận hành cơ bản và có lợi thế về chuỗi nhiều chi nhánh. Khoảng trống mà đồ án hướng tới nằm ở các điểm chưa thấy được công bố: tự đối soát chuyển khoản VietQR theo từng hóa đơn, giới hạn dữ liệu theo từng bác sĩ cùng nhật ký kiểm toán phục vụ yêu cầu bảo vệ dữ liệu sức khỏe, bệnh nhân tự tra cứu lịch sử khám không cần tài khoản, và trợ lý AI có kiểm soát.

## 1.3. Kiến trúc ứng dụng web

### 1.3.1. Ứng dụng một trang và REST API

Hệ thống được xây dựng theo mô hình tách biệt giao diện và máy chủ. Phía người dùng là một ứng dụng web một trang (Single-Page Application, SPA): trình duyệt tải ứng dụng một lần, sau đó chỉ trao đổi dữ liệu dạng JSON với máy chủ và tự vẽ lại phần giao diện thay đổi. Cách làm này cho trải nghiệm mượt như ứng dụng cài đặt, phù hợp với nhân viên làm việc liên tục cả ngày trên cùng một màn hình.

Phía máy chủ cung cấp giao diện lập trình theo phong cách REST: mỗi loại dữ liệu là một tài nguyên có địa chỉ riêng (ví dụ `/patients/:id`, `/appointments`), thao tác qua các phương thức HTTP chuẩn GET, POST, PATCH, DELETE với ngữ nghĩa và mã trạng thái thống nhất. Toàn bộ API được mô tả theo đặc tả OpenAPI và sinh tài liệu tự động, giúp kiểm thử và tích hợp dễ dàng.

### 1.3.2. Kiến trúc phân lớp và chia module theo nghiệp vụ

Bên trong máy chủ, mã nguồn được tổ chức theo kiến trúc phân lớp [@sommerville]: lớp điều khiển (controller) nhận yêu cầu HTTP và kiểm tra dữ liệu đầu vào; lớp dịch vụ (service) chứa quy tắc nghiệp vụ; lớp truy cập dữ liệu làm việc với cơ sở dữ liệu. Theo chiều ngang, hệ thống được chia thành các module theo miền nghiệp vụ (bệnh nhân, lịch hẹn, hồ sơ khám, thanh toán, kho…), mỗi module sở hữu dữ liệu và quy tắc của mình, giao tiếp với module khác qua dịch vụ được công bố. Cách chia theo miền nghiệp vụ này kế thừa tư tưởng của thiết kế hướng miền, giúp mỗi phần có thể được hiểu, kiểm thử và thay đổi độc lập. Toàn bộ các module chạy chung trong một tiến trình và một cơ sở dữ liệu (kiến trúc nguyên khối có module hóa), phù hợp với quy mô một phòng khám: đơn giản khi triển khai, giao dịch dữ liệu nhất quán, nhưng vẫn có ranh giới rõ ràng để tách ra sau này nếu cần.

### 1.3.3. Mô hình hóa hệ thống bằng UML

Đồ án dùng ngôn ngữ mô hình hóa thống nhất UML [@uml] để mô tả hệ thống trước và trong khi cài đặt, theo cách tiếp cận phân tích, thiết kế hướng đối tượng [@sommerville]. Mỗi loại biểu đồ trả lời một câu hỏi khác nhau, nên được chọn theo đặc điểm của từng chức năng:

- **Biểu đồ use case:** ai dùng hệ thống để làm gì; dùng ở Chương 2 để xác định phạm vi chức năng theo từng tác nhân.
- **Biểu đồ hoạt động:** luồng xử lý có nhiều nhánh quyết định hoặc nhiều bên tham gia (chia làn); dùng cho quy trình tổng thể, tiếp nhận và hàng chờ, nhắc lịch tự động.
- **Biểu đồ tuần tự:** các thành phần trao đổi thông điệp theo thứ tự thời gian; dùng khi cần thấy rõ giao diện, controller, service, cơ sở dữ liệu và dịch vụ ngoài phối hợp ra sao, ví dụ đặt lịch khi hai người cùng thao tác hay xác thực và làm mới token.
- **Biểu đồ trạng thái:** vòng đời của một đối tượng và điều kiện của từng bước chuyển; dùng cho lịch hẹn và hóa đơn.
- **Sơ đồ thực thể liên kết:** các bảng dữ liệu và quan hệ giữa chúng.

Các biểu đồ trong báo cáo được viết dưới dạng văn bản (PlantUML) và lưu cùng mã nguồn; sơ đồ thực thể liên kết được sinh tự động từ lược đồ cơ sở dữ liệu, nên luôn khớp với hệ thống thật.

## 1.4. Công nghệ phía máy chủ

### 1.4.1. Node.js và NestJS

NestJS là framework xây dựng ứng dụng máy chủ trên Node.js, viết bằng TypeScript [@nestjs]. NestJS cung cấp sẵn cấu trúc module, cơ chế tiêm phụ thuộc (dependency injection) và các thành phần xử lý yêu cầu theo chuỗi:

- **Guard** quyết định yêu cầu có được phép đi tiếp hay không; đồ án dùng guard để xác thực JWT và kiểm tra quyền.
- **Pipe** chuyển đổi và kiểm tra dữ liệu đầu vào; đồ án dùng các lớp DTO kèm ràng buộc (độ dài, định dạng, kiểu UUID…) để từ chối dữ liệu sai ngay từ cửa vào.
- **Interceptor** và **filter** xử lý chung trước, sau yêu cầu và khi có lỗi, giúp định dạng phản hồi và thông báo lỗi thống nhất.

Lựa chọn NestJS giúp toàn bộ hệ thống dùng một ngôn ngữ TypeScript ở cả hai phía, kiểu dữ liệu được kiểm tra khi biên dịch, và mã nguồn có cấu trúc nhất quán khi số module tăng lên.

### 1.4.2. PostgreSQL và Prisma ORM

PostgreSQL là hệ quản trị cơ sở dữ liệu quan hệ mã nguồn mở, hỗ trợ đầy đủ giao dịch ACID, ràng buộc toàn vẹn, chỉ mục nhiều loại và kiểu dữ liệu JSONB cho dữ liệu bán cấu trúc [@postgres]. Đồ án tận dụng các đặc điểm này. Ràng buộc khóa ngoại và ràng buộc kiểm tra bảo đảm dữ liệu hợp lệ ngay ở tầng cơ sở dữ liệu. Khóa tư vấn (advisory lock) theo bác sĩ và theo bệnh nhân bên trong giao dịch chống đặt trùng lịch khi hai lễ tân thao tác cùng lúc. Kiểu JSONB lưu bản chụp sơ đồ răng của mỗi phiên khám và danh sách số răng của mỗi thủ thuật.

Prisma là bộ công cụ ánh xạ đối tượng – quan hệ (ORM) cho TypeScript [@prisma]. Lược đồ dữ liệu được khai báo trong một tệp duy nhất, từ đó Prisma sinh ra lớp truy vấn có kiểu chặt chẽ: lỗi sai tên cột hay sai kiểu dữ liệu bị phát hiện ngay khi biên dịch. Thay đổi cấu trúc cơ sở dữ liệu được quản lý bằng các tệp migration đánh số tuần tự, chạy tự động khi phát hành phiên bản mới. Khóa chính dùng UUID phiên bản 7, vừa khó đoán vừa tăng dần theo thời gian nên thân thiện với chỉ mục.

### 1.4.3. Giao dịch và xử lý đồng thời

Phần mềm quản lý phòng khám có nhiều người cùng thao tác trên cùng dữ liệu: hai lễ tân cùng đặt lịch cho một bác sĩ, hai người cùng thu tiền một hóa đơn, ngân hàng gửi lại cùng một thông báo chuyển khoản. Giao dịch ACID bảo đảm một nhóm thao tác hoặc thành công trọn vẹn hoặc không có tác dụng gì, nhưng tự nó không ngăn được lỗi kiểu "kiểm tra rồi mới ghi": hai giao dịch cùng đọc thấy giờ còn trống, rồi cùng ghi [@kleppmann]. Mức cô lập mặc định của PostgreSQL (Read Committed) cho phép tình huống này [@postgres]. Bảng 1.2 tóm tắt các kỹ thuật được dùng để xử lý từng loại xung đột.

::: {custom-style="bảng"}
Bảng 1.2. Các kỹ thuật xử lý đồng thời và nơi áp dụng trong hệ thống
:::

| Kỹ thuật | Nguyên lý | Áp dụng trong hệ thống |
|---|---|---|
| Khóa tư vấn theo giao dịch | Ứng dụng tự đặt khóa theo một khóa số (ví dụ mã bác sĩ); giao dịch khác xin cùng khóa phải chờ đến khi giao dịch đầu kết thúc | Đặt, dời lịch hẹn (khóa theo bác sĩ và bệnh nhân), lịch nghỉ toàn phòng khám, tính lương |
| Cập nhật có điều kiện | Câu lệnh UPDATE kèm điều kiện về giá trị hiện tại; số dòng bị ảnh hưởng cho biết thao tác có hợp lệ không | Trừ tồn kho (chỉ khi đủ hàng), chuyển trạng thái kỳ lương, đăng ký ca, lịch hẹn |
| Kiểm soát đồng thời lạc quan | Mỗi bản ghi có số phiên bản; lần ghi mang số phiên bản cũ bị từ chối thay vì ghi đè | Sửa hóa đơn, đơn thuốc |
| Khóa chống ghi lặp (idempotency key) | Mỗi yêu cầu mang một khóa duy nhất; yêu cầu lặp lại với cùng khóa không tạo bản ghi mới | Ghi nhận thanh toán, giao dịch ngân hàng, tin nhắn, bản ghi đồng ý |
| Ràng buộc duy nhất | Cơ sở dữ liệu từ chối bản ghi thứ hai cùng giá trị khóa | Mỗi lịch hẹn một phiên khám, mỗi giao dịch ngân hàng một bản ghi |

::: {custom-style="nguồn"}
Nguồn: Tác giả tổng hợp từ [@kleppmann; @postgres]
:::

Điểm chung của các kỹ thuật trên là đặt quy tắc ở tầng cơ sở dữ liệu, nơi mọi yêu cầu đều phải đi qua, thay vì chỉ kiểm tra ở giao diện. Các tình huống đồng thời này được kiểm thử trên PostgreSQL thật ở Chương 5.

## 1.5. Công nghệ phía giao diện

- **React** là thư viện xây dựng giao diện theo thành phần (component): mỗi phần giao diện là một hàm nhận dữ liệu và trả về cấu trúc hiển thị; khi dữ liệu thay đổi, React tự cập nhật phần tương ứng [@react].
- **Vite** là công cụ phát triển và đóng gói, khởi động nhanh trong lúc lập trình và tạo bản phát hành được chia nhỏ theo trang để tải nhanh.
- **TanStack Query** quản lý dữ liệu lấy từ máy chủ: lưu đệm, tự làm mới, đồng bộ giữa các màn hình và xử lý trạng thái đang tải, lỗi. Nhờ đó giao diện luôn hiển thị dữ liệu mới mà không cần tự viết nhiều mã đồng bộ.
- **Tailwind CSS** là bộ lớp tiện ích để định kiểu giao diện nhất quán, hỗ trợ giao diện co giãn theo màn hình và chế độ tối.
- **Recharts** vẽ biểu đồ cho bảng điều khiển và báo cáo; **i18next** quản lý chữ giao diện hai ngôn ngữ Việt – Anh.

Giao diện tuân theo các nguyên tắc khả dụng phổ biến (trạng thái hệ thống luôn hiển thị, ngăn lỗi trước khi xảy ra, cho phép hoàn tác) và các khuyến nghị về khả năng tiếp cận (nhãn cho trình đọc màn hình, điều khiển bằng bàn phím, độ tương phản màu).

## 1.6. Xác thực, phân quyền và kiểm toán

### 1.6.1. Xác thực bằng JWT

Hệ thống dùng JSON Web Token (JWT) [@jwt] để xác thực. Sau khi đăng nhập thành công, máy chủ cấp một **mã truy cập** ngắn hạn (15 phút) chứa định danh và danh sách quyền của người dùng, có chữ ký số để không thể giả mạo, và một **mã làm mới** dài hạn (7 ngày) được lưu trong cookie chỉ máy chủ đọc được (HttpOnly, SameSite=Strict). Khi mã truy cập hết hạn, giao diện dùng mã làm mới để xin mã mới; mã làm mới được thay mới sau mỗi lần dùng và chỉ giá trị băm của nó được lưu trong cơ sở dữ liệu, nên có thể thu hồi khi đăng xuất hoặc khi phát hiện bất thường. Mật khẩu được băm bằng Argon2, thuật toán được thiết kế để chống tấn công dò mật khẩu bằng phần cứng chuyên dụng.

### 1.6.2. Phân quyền theo vai trò và theo dòng dữ liệu

Mô hình kiểm soát truy cập theo vai trò (RBAC) [@rbac] gán quyền cho vai trò và gán vai trò cho người dùng, thay vì gán quyền trực tiếp cho từng người. Đồ án định nghĩa 133 mã quyền chi tiết theo dạng `module.hành_động` (ví dụ `patient.read`, `invoice.refund`, `dental_chart.write`) và ba vai trò hệ thống: quản trị viên, lễ tân, bác sĩ; quản trị viên có thể tạo vai trò tùy chỉnh.

RBAC trả lời câu hỏi "người này có được làm loại việc này không", nhưng chưa trả lời "với bản ghi nào". Trong phòng khám, cùng là quyền xem hồ sơ khám, bác sĩ chỉ nên thấy bệnh nhân mình đã hoặc sắp điều trị. Vì vậy đồ án bổ sung **giới hạn theo dòng dữ liệu** (row-level scope): mỗi truy vấn của bác sĩ được lọc thêm theo quan hệ giữa bác sĩ và bệnh nhân; khi một bác sĩ hỏi về bệnh nhân không liên quan, hệ thống trả lời như thể bệnh nhân không tồn tại để không tiết lộ thông tin.

### 1.6.3. Nhật ký kiểm toán và các rủi ro bảo mật phổ biến

Mọi thao tác nhạy cảm (đăng nhập, xem hồ sơ qua kênh đặc biệt, sửa giá, hủy hóa đơn, thay đổi quyền, AI thực hiện hành động…) được ghi vào bảng nhật ký kiểm toán: ai làm, lúc nào, trên bản ghi nào, chi tiết thay đổi. Ứng dụng chỉ ghi thêm vào bảng này, không có chức năng sửa hay xóa nhật ký. Thiết kế bảo mật của hệ thống được đối chiếu với danh sách mười rủi ro phổ biến nhất của ứng dụng web OWASP Top 10 [@owasp], đặc biệt là kiểm soát truy cập sai, lỗi xác thực, chèn mã và cấu hình không an toàn; Chương 3 trình bày cách từng rủi ro được xử lý.

## 1.7. Thanh toán qua VietQR và tích hợp nhắn tin

VietQR là chuẩn mã QR thanh toán liên ngân hàng tại Việt Nam, xây dựng trên tiêu chuẩn kỹ thuật của Ngân hàng Nhà nước [@vietqr]. Một mã VietQR chứa mã ngân hàng, số tài khoản nhận, số tiền và nội dung chuyển khoản; khách mở ứng dụng ngân hàng bất kỳ, quét mã là các thông tin được điền sẵn. Đồ án sinh mã VietQR trên mỗi hóa đơn với nội dung là mã hóa đơn. Khi tiền về tài khoản, dịch vụ trung gian theo dõi tài khoản ngân hàng gửi một lời gọi webhook tới hệ thống; hệ thống kiểm tra khóa xác thực đi kèm lời gọi, tìm hóa đơn theo nội dung và số tiền, rồi tự ghi nhận thanh toán. Mỗi giao dịch chỉ được ghi một lần dù lời gọi bị gửi lặp lại. Giao dịch không khớp được đưa vào danh sách chờ lễ tân xử lý tay.

Về liên lạc, hệ thống gửi email qua SMTP và gửi SMS qua nhà cung cấp tin nhắn thương hiệu (SMS brandname). Tin nhắn có chống gửi trùng và ghi nhật ký kết quả.

## 1.8. Mô hình ngôn ngữ lớn trong phần mềm nghiệp vụ

Mô hình ngôn ngữ lớn (LLM) có khả năng hiểu và sinh văn bản tự nhiên, nhờ đó có thể soạn nháp ghi chú khám từ ghi nhanh của bác sĩ, soạn tin nhắn chăm sóc khách hàng hay trả lời câu hỏi tra cứu bằng tiếng Việt. Để LLM thao tác với dữ liệu thật, các nghiên cứu gần đây đề xuất cho mô hình **gọi công cụ**: mô hình không tự trả lời từ trí nhớ mà quyết định gọi một hàm (công cụ) với tham số phù hợp, nhận kết quả rồi suy luận tiếp [@react_agent].

Tuy nhiên, đưa LLM vào phần mềm y tế đặt ra ba rủi ro: mô hình có thể "bịa" thông tin; nội dung độc hại trong dữ liệu có thể điều khiển mô hình (tấn công chèn lệnh – prompt injection); và dữ liệu cá nhân có thể bị gửi ra dịch vụ bên ngoài [@owaspllm]. Đồ án xử lý các rủi ro này bằng ba nguyên tắc:

1. **AI chỉ đề xuất, con người quyết định:** mọi hành động làm thay đổi dữ liệu (đặt, hủy, dời lịch) chỉ được AI soạn thành thẻ xác nhận; người dùng bấm xác nhận thì hệ thống mới thực hiện, qua đúng các quy tắc và quyền như thao tác bằng tay.
2. **Tối thiểu hóa dữ liệu:** mô hình chỉ thấy mã tham chiếu như `[P1]` thay cho bệnh nhân; tên và số điện thoại được trình duyệt điền vào sau khi nhận câu trả lời.
3. **Luôn có phương án dự phòng:** khi dịch vụ AI lỗi hoặc không được cấu hình, các chức năng soạn nháp rơi về mẫu soạn sẵn và trợ lý chuyển sang chế độ tra cứu theo từ khóa, không chức năng nghiệp vụ nào phụ thuộc vào AI.

## 1.9. Kiểm thử phần mềm, tích hợp liên tục và triển khai

### 1.9.1. Chiến lược kiểm thử

Đồ án áp dụng mô hình kim tự tháp kiểm thử [@cohn]: nhiều kiểm thử đơn vị nhanh ở đáy, ít hơn kiểm thử tích hợp ở giữa và một số kịch bản đầu cuối ở đỉnh. Cụ thể:

- **Kiểm thử đơn vị** bằng Jest cho từng dịch vụ và quy tắc nghiệp vụ, cơ sở dữ liệu được giả lập.
- **Kiểm thử API trên PostgreSQL thật:** chạy toàn bộ migration trên một cơ sở dữ liệu sạch rồi gọi API thật, phát hiện lỗi mà kiểm thử giả lập bỏ sót (ràng buộc, giao dịch, truy vấn sai).
- **Kiểm thử đầu cuối** bằng Playwright: trình duyệt tự động đóng vai lễ tân, bác sĩ, quản trị viên thực hiện các luồng nghiệp vụ hoàn chỉnh trên giao diện.

Chất lượng phần mềm được đánh giá theo các đặc tính của mô hình ISO/IEC 25010, tập trung vào tính phù hợp chức năng, bảo mật, độ tin cậy, hiệu năng và tính khả dụng.

### 1.9.2. Tích hợp liên tục và triển khai bằng Docker

Tích hợp liên tục (CI) là thực hành mỗi thay đổi mã nguồn được tự động biên dịch và kiểm thử trước khi gộp vào nhánh chính [@fowler_ci]. Đồ án dùng GitHub Actions với 10 bước kiểm tra bắt buộc (biên dịch, kiểm tra kiểu, kiểm tra quy chuẩn mã, kiểm thử đơn vị, kiểm thử trên PostgreSQL, kiểm thử đầu cuối và đóng gói container); chỉ khi tất cả đạt thì thay đổi mới được gộp.

Hệ thống được đóng gói thành các container Docker gồm cơ sở dữ liệu, bước chạy migration, máy chủ ứng dụng và máy chủ web Nginx phục vụ giao diện, khởi chạy cùng nhau bằng Docker Compose. Cách đóng gói này bảo đảm môi trường chạy thật giống hệt môi trường kiểm thử, việc triển khai lên máy chủ ảo chỉ cần một lệnh.

## 1.10. Kết luận chương

Chương 1 đã trình bày đặc thù nghiệp vụ nha khoa (dữ liệu theo thời gian, theo vị trí răng và theo kế hoạch), hệ ký hiệu FDI, các yêu cầu pháp lý và khoảng trống của các giải pháp hiện có. Chương cũng giới thiệu kiến trúc SPA – REST, UML, bộ công nghệ NestJS, PostgreSQL, Prisma, React, xử lý đồng thời, xác thực và phân quyền, nhật ký kiểm toán, VietQR, nhắn tin, cách dùng có kiểm soát mô hình ngôn ngữ lớn, kiểm thử và triển khai. Đây là cơ sở để Chương 2 khảo sát và phân tích yêu cầu.

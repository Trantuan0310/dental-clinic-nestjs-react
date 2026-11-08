# Kế hoạch 15 ngày trước buổi bảo vệ (08/11 đến 22/11/2026)

> Lập ngày 08/11/2026, dựa trên báo cáo mức hoạt động các chức năng và `KE_HOACH_CAI_TIEN.md`.
> Quy tắc chung cho mọi việc: một việc một PR; kiểm tra cục bộ (tsc, lint, test, build) rồi mới push; đủ 10 check CI mới merge; deploy; chạy `scripts/smoke-vps.sh` trên VPS. Mỗi việc có test đơn vị, việc có giao diện có thêm E2E. Ba ngày cuối không thêm tính năng.
> Ký hiệu: **BE** backend, **FE** frontend, **DB** migration, **Đạt khi** là tiêu chí nghiệm thu.

## Tổng quan

| Đợt | Ngày | Việc | Số PR dự kiến |
|---|---|---|---|
| 1 | 08-09/11 | Độ tin cậy: AI chịu lỗi, bot chạy khi AI hỏng, phiên bản, kiểm tra sau deploy, dữ liệu demo | 3 |
| 2 | 10-13/11 | A1 khách tự xác nhận/dời lịch, A3 phiếu khai trước, C3 sổ đồng ý | 4 |
| 3 | 14-16/11 | A2 danh sách chờ, A4 bảng trạng thái ghế, A5 mẫu khám nhanh, hẹn tiếp có gợi ý ngày | 4 |
| 4 | 17-18/11 | Mục tiêu chỉnh được, biểu đồ tài chính, B4 nhập kho, B5 phủ ca, bot hủy/dời lịch | 4 |
| 5 | 19-22/11 | Hồi quy, luận văn, demo; 20-22/11 đóng băng tính năng | 1-2 |

---

## Đợt 1 — Độ tin cậy (08-09/11)

### 1.1. AI chịu lỗi (phần lớn đã làm, commit `a701dbe` trên nhánh, chưa PR)
- **BE:** `extractJsonObject` lấy khối JSON cân bằng đầu tiên (chịu được chữ kèm theo, hai khối JSON, dấu `{` trong câu). `AiModel.jsonOrText`: mô hình trả chữ thường thì dùng làm câu trả lời của bot.
- **FE:** mọi chỗ dùng AI hiện rõ khi đang dùng bản mẫu (đã có cho ghi chú, tin nhắn, nhận xét báo cáo; thêm cho bot: nhãn "Trả lời theo mẫu").
- **Đạt khi:** test đơn vị cho cả 3 kiểu trả lời lệch; trên VPS hỏi bot 5 câu không câu nào báo lỗi.

### 1.2. Bot chạy khi AI hỏng (đã làm, chưa PR)
- **BE:** `fallback-intents.ts` nhận 6 nhóm câu hỏi theo từ khóa (gõ không dấu vẫn hiểu): chưa đặt lịch, hóa đơn nợ, lịch hẹn (ngày, buổi), ca làm, hàng chờ, doanh thu. Chạy đúng công cụ tra cứu, viết câu trả lời theo mẫu, bệnh nhân vẫn là mã ref. Câu khác: gợi ý những câu hỏi được.
- **Đạt khi:** tắt AI (bỏ `AI_MODEL`) mà 6 câu trên vẫn ra kết quả đúng; câu ngoài danh sách nhận được gợi ý.

### 1.3. Biết phiên bản đang chạy và kiểm tra sau deploy (đã làm một phần)
- **BE:** `GET /health` trả `commit`. `deploy-vps.sh` đặt `GIT_SHA`, `docker-compose.prod.yml` chuyển vào container.
- **Script:** `scripts/smoke-vps.sh <địa chỉ>`: health, database, trang chủ, API cần đăng nhập; có `SMOKE_EMAIL/SMOKE_PASSWORD` thì thêm 6 API chính và bot có dùng AI thật không.
- **Còn phải làm:** sửa đường dẫn health (backend để `/health` ở gốc; xem nginx có chuyển `/health` ra ngoài không, nếu không thì gọi qua `/api/...` tương ứng hoặc thêm `location` cho nginx).
- **Đạt khi:** chạy trên VPS in ra đúng commit vừa deploy và "Tất cả đạt".

### 1.4. Script dữ liệu demo
- **Script:** `backend/prisma/seed-demo-showcase.ts` (chạy sau `seed-demo-clinic.ts`, chạy lại không nhân đôi):
  - 3 kế hoạch điều trị đã đồng ý chưa có lịch, 1 kế hoạch đã có lịch;
  - lịch hẹn 2 tuần tới rải các giờ và các bác sĩ (để heatmap có màu);
  - lịch đã qua có đủ trạng thái (đã đến, vắng, hủy sát giờ) để 6 chỉ số có số;
  - 2 hóa đơn còn nợ (một nhỏ để thử QR);
  - 2 bệnh nhân đang chờ check-in hôm nay khi chạy vào giờ làm.
- **Đạt khi:** Dashboard "6 tháng qua" có heatmap có màu, 6 chỉ số đều có số, phễu đủ 5 bước, trang Điều trị chờ đặt lịch không trống.
- **Cần bạn:** chạy script trên VPS (lệnh sẽ ghi trong PR).

### 1.5. Việc người dùng làm trong đợt 1
- Đổi `AI_MODEL=anthropic/claude-sonnet-4.5`, đổi key xkiro (đã lộ).
- Thử SePay bằng một khoản nhỏ; thử gửi nhắc lịch thật (email, SMS/Zalo nếu có).

---

## Đợt 2 — Luồng bệnh nhân (10-13/11)

### 2.1. A1 Khách tự xác nhận hoặc xin dời lịch từ liên kết
- **Hiện có:** nhắc lịch trước một ngày (email; SMS/Zalo khi bật); đặt lịch online đã dùng mã truy cập lưu dạng băm (`accessTokenHash`) — dùng lại cách này.
- **DB:** bảng `appointment_links` (lịch hẹn, mã băm SHA-256, hạn dùng = giờ hẹn, lần dùng cuối) hoặc thêm cột vào `appointments`; thêm trạng thái yêu cầu dời lịch (`reschedule_requested_at`, giờ khách muốn).
- **BE:**
  - Tạo liên kết khi gửi nhắc; nội dung tin có `https://<miền>/lich-hen/<mã>`.
  - API công khai (không đăng nhập, giới hạn tần suất): xem lịch (giờ, bác sĩ, dịch vụ; không lộ dữ liệu khác), **Xác nhận** (SCHEDULED thành CONFIRMED, ghi `confirmedAt`, người xác nhận là "khách"), **Xin dời** (chọn trong các giờ trống thật của bác sĩ hoặc ghi chú), **Hủy** (theo quy định hủy hiện có).
  - Xin dời không tự đổi lịch: tạo yêu cầu cho lễ tân, giữ chỗ giờ mới trong thời gian giữ như đặt online.
  - Nhật ký: `APPOINTMENT_CONFIRMED_BY_PATIENT`, `RESCHEDULE_REQUESTED`.
- **FE:** trang công khai `/lich-hen/:ma` (điện thoại là chính); trên lịch và ngăn chi tiết lịch hẹn: nhãn "Khách đã xác nhận", "Khách xin dời"; danh sách "Yêu cầu dời lịch" cho lễ tân (dùng lại trang Yêu cầu đặt lịch nếu hợp).
- **Đạt khi:** E2E: mở liên kết, xác nhận, lễ tân thấy nhãn; xin dời, lễ tân duyệt, lịch đổi giờ. Liên kết sai hoặc hết hạn trả trang báo lỗi, không lộ gì.
- **Rủi ro:** bảo mật liên kết (mã 32 byte ngẫu nhiên, chỉ lưu băm, hết hạn, giới hạn tần suất).

### 2.2. A3 Phiếu khai trước khi đến
- **DB:** bảng `intake_forms` (lịch hẹn, trạng thái chờ duyệt/đã duyệt/bỏ, dữ liệu khai dạng JSON: tiền sử bệnh, thuốc đang dùng, dị ứng, lý do khám, liên hệ khẩn cấp; thời điểm gửi).
- **BE:** liên kết phiếu đi kèm tin nhắc (dùng chung cơ chế mã của A1); API công khai gửi phiếu (kiểm tra dữ liệu, giới hạn kích thước); API cho lễ tân/bác sĩ xem và **duyệt**: duyệt thì ghi vào hồ sơ bệnh nhân qua chức năng cập nhật tiền sử hiện có (giữ quy tắc dị ứng hiện có), không ghi đè tự động.
- **FE:** trang công khai điền phiếu (từng bước, điện thoại); trong ngăn lịch hẹn và lúc check-in: nhãn "Có phiếu khai", xem so sánh với hồ sơ hiện tại, nút Duyệt.
- **Đạt khi:** E2E điền phiếu rồi duyệt, dị ứng mới hiện đỏ ở phiên khám; phiếu không duyệt thì hồ sơ không đổi.

### 2.3. C3 Sổ đồng ý xử lý dữ liệu (Nghị định 356/2025)
- **Hiện có:** đặt lịch online có `consentedAt` trên yêu cầu, chưa có sổ chung.
- **DB:** bảng `consent_records` (bệnh nhân hoặc yêu cầu đặt lịch, mục đích, phiên bản văn bản đồng ý, kênh: online/phiếu khai/tại quầy, thời điểm, địa chỉ IP rút gọn, rút lại lúc nào).
- **BE:** ghi bản ghi khi đặt online, khi gửi phiếu khai, khi lễ tân xác nhận tại quầy; rút lại đồng ý; xuất CSV cho quản trị; văn bản đồng ý có phiên bản.
- **FE:** tab "Đồng ý xử lý dữ liệu" trong hồ sơ bệnh nhân (lịch sử, nút ghi nhận tại quầy, rút lại); trang quản trị tra cứu và xuất.
- **Đạt khi:** mỗi đường vào (online, phiếu khai, tại quầy) sinh đúng một bản ghi; rút lại có lưu vết; test quyền (chỉ quản trị xuất được).

---

## Đợt 3 — Lễ tân và bác sĩ (14-16/11)

### 3.1. A2 Danh sách chờ lấp giờ trống
- **DB:** bảng `waitlist_entries` (bệnh nhân, dịch vụ, bác sĩ mong muốn hoặc bất kỳ, khoảng ngày và buổi mong muốn, ghi chú, trạng thái).
- **BE:** khi một lịch bị hủy hoặc vắng, tìm người trong danh sách khớp (dịch vụ, bác sĩ, buổi) và tạo thông báo cho lễ tân; API gợi ý theo khung giờ trống bất kỳ.
- **FE:** trang "Danh sách chờ" (thêm, sửa, xóa); khi có giờ trống: thông báo trên chuông kèm danh sách người phù hợp, nút **Soạn tin mời** (dùng AI soạn tin sẵn có) và **Đặt lịch** (form điền sẵn).
- **Đạt khi:** hủy một lịch thì lễ tân thấy gợi ý đúng người; đặt lịch từ gợi ý xong thì người đó rời danh sách.

### 3.2. A4 Bảng trạng thái theo ghế, bác sĩ
- **Hiện có:** trang Điều phối có hàng chờ và thời gian chờ (đỏ khi quá 30 phút).
- **BE:** API gộp theo bác sĩ (hoặc ghế nếu có cấu hình ghế): đang khám ai, bắt đầu lúc nào, người kế tiếp, số người chờ; cập nhật định kỳ.
- **FE:** chế độ xem "Bảng ghế" trên Điều phối: mỗi bác sĩ một cột, màu theo thời gian chờ (dưới 15 phút, 15-30, trên 30), chạm để gọi khám; tự làm mới.
- **Đạt khi:** check-in và bắt đầu khám thì bảng đổi trong vòng một chu kỳ làm mới; E2E hiển thị.

### 3.3. A5 Mẫu khám nhanh theo dịch vụ
- **DB:** bảng `visit_templates` (tên, dịch vụ, nội dung ghi chú SOAP mẫu, danh sách điều trị mặc định, vật tư mặc định và số lượng).
- **BE:** quản lý mẫu (quản trị và bác sĩ); áp dụng mẫu vào phiên khám đang mở: thêm ghi chú, điều trị, vật tư qua đúng các API hiện có (giữ quy tắc giá, kho, dị ứng).
- **FE:** trang quản lý mẫu trong Dịch vụ; trong phiên khám nút "Dùng mẫu", xem trước rồi mới áp dụng.
- **Đạt khi:** áp dụng một mẫu tạo đúng ghi chú, điều trị, vật tư; đóng phiên trừ kho đúng.

### 3.4. Nhỏ
- **Hẹn tiếp có gợi ý ngày:** thẻ "Hẹn lần khám tiếp" gợi ý ngày theo `recallIntervalMonths` của dịch vụ vừa làm (hoặc theo kế hoạch điều trị còn dở).
- **Điều trị chờ đặt lịch:** ghi lần liên hệ (ngày, kênh, kết quả), lọc "chưa liên hệ", nút soạn tin AI.

---

## Đợt 4 — Quản lý và báo cáo (17-18/11)

### 4.1. Mục tiêu chỉ số chỉnh được
- **DB:** bảng cài đặt phòng khám (khóa, giá trị) hoặc dùng bảng cài đặt sẵn có nếu có.
- **BE/FE:** trang Cài đặt cho quản trị: mục tiêu và ngưỡng "chấp nhận được" của 6 chỉ số; Dashboard đọc từ cài đặt, mặc định như hiện nay.

### 4.2. Biểu đồ tài chính
- **Thác nước:** doanh thu điều trị, giảm giá, hoàn tiền, đã thu, chi phí, lương, còn lại.
- **Biểu đồ nhỏ theo bác sĩ:** mỗi bác sĩ một khung cùng trục (doanh thu, lượt khám, tỉ lệ chấp nhận kế hoạch).
- **Thanh chồng tuổi nợ** theo tháng (0-30, 31-60, 61-90, trên 90 ngày).
- **Đạt khi:** số liệu khớp các báo cáo hiện có (test so sánh tổng).

### 4.3. B4 Gợi ý nhập kho
- **BE:** từ lịch sử xuất kho 30 và 90 ngày tính lượng dùng bình quân, số ngày còn dùng, số lượng nên nhập = dùng bình quân × số ngày đặt hàng − tồn.
- **FE:** danh sách "Nên nhập" trên trang Kho, xuất CSV.

### 4.4. B5 Phủ ca so với nhu cầu
- **FE/BE:** đặt heatmap giờ làm của bác sĩ cạnh heatmap đặt lịch (dùng lại B2), đánh dấu khung thiếu người hoặc thừa giờ trống.

### 4.5. Bot: hủy và dời lịch có xác nhận
- Thêm công cụ `propose_cancel` và `propose_reschedule`: chỉ soạn thẻ; bấm xác nhận mới gọi đúng API hủy/dời hiện có (giữ quy tắc).

---

## Đợt 5 — Hoàn thiện (19-22/11)

| Ngày | Việc |
|---|---|
| 19/11 | Hồi quy toàn bộ: CI, `smoke-vps.sh` trên VPS, chạy tay cốt truyện demo; sửa lỗi |
| 20/11 | **Đóng băng tính năng.** Cập nhật luận văn: báo cáo mức hoạt động mới, số liệu (test, API, quyền), hướng phát triển (C1, C2) |
| 21/11 | Cập nhật `DEMO_SCRIPT.md` cho các tính năng mới; tập demo có bấm giờ; quay video dự phòng từng phần |
| 22/11 | Deploy bản cuối, chạy smoke, sao lưu cơ sở dữ liệu; chỉ sửa lỗi chặn |

## Không làm trong 15 ngày

- **C1 Đơn thuốc điện tử liên thông Đơn thuốc quốc gia:** cần đăng ký và tài khoản với hệ thống quốc gia.
- **C2 Bệnh án điện tử có ký số (Thông tư 13/2025):** cần chứng thư số và quy trình pháp lý.
- Hai việc này ghi vào "hướng phát triển"; nền đã có: khóa ghi chú khi đóng phiên, bổ sung trong 30 ngày, nhật ký kiểm toán.

## Rủi ro và cách giữ an toàn

| Rủi ro | Cách giữ |
|---|---|
| Trang công khai mới (A1, A3) lộ dữ liệu | Mã ngẫu nhiên 32 byte chỉ lưu băm, có hạn, giới hạn tần suất, chỉ trả đúng dữ liệu của lịch đó; test riêng cho mã sai và hết hạn |
| Nhiều migration | Migration chỉ thêm bảng/cột, không sửa dữ liệu cũ; deploy đã tự sao lưu cơ sở dữ liệu |
| Trễ tiến độ | Thứ tự ưu tiên khi thiếu thời gian: 1.x, A1, A3, C3, A4, A2, A5, phần còn lại của đợt 4 |
| AI không ổn định | Mọi chức năng AI có đường dự phòng (1.1, 1.2) |
| Test phụ thuộc ngày giờ | Dùng ngày làm việc cách xa hoặc đồng hồ giả (bài học 08/11) |

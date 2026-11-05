# Kịch bản Demo Sản phẩm

> **Phiên bản:** 2.0  
> **Cập nhật:** 05/11/2026 (thêm AI soạn nháp, heatmap công suất, chỉ số vận hành, QR chuyển khoản, tự ghi chuyển khoản, điều trị chờ đặt lịch, hẹn tiếp khi thu tiền)  
> **Thời lượng:** 22-25 phút đủ bộ, **15 phút nếu bỏ các phần đánh dấu ⏱ (có thể bỏ)**  
> **Cốt truyện:** một bệnh nhân đi hết một vòng: đặt lịch → khám → thanh toán → hẹn tiếp. Mỗi nhân vật (lễ tân, bác sĩ, quản lý) thấy phần việc của mình.

---

## CHUẨN BỊ TRƯỚC DEMO (làm trước 1-2 ngày, rồi kiểm lại sáng hôm bảo vệ)

### 1. Tài khoản

| Vai trò | Dùng cho | Tài khoản |
|---|---|---|
| Quản trị / quản lý | Dashboard, Báo cáo, nhật ký | `<điền>` |
| Lễ tân | Đặt lịch, thu tiền, điều trị chờ đặt lịch | `<điền>` |
| Bác sĩ | Phiên khám, AI soạn ghi chú | `<điền>` |

Máy dựng cục bộ theo `clinic-setup.ts` rồi `seed-demo-clinic.ts`: quản trị `admin@clinic.local`, lễ tân `hanh.le@clinic.local`, bác sĩ `an.nguyen@clinic.local` (mật khẩu theo tài liệu cài đặt). Mở **3 cửa sổ trình duyệt ẩn danh** (hoặc 3 profile), mỗi cái đăng nhập một vai trò sẵn, để khỏi mất thời gian đăng nhập lại.

### 2. Dữ liệu cần dựng sẵn (nếu không, vài màn hình sẽ trống)

| Cần có | Để demo | Cách làm |
|---|---|---|
| Dữ liệu 6 tháng | Dashboard, heatmap | `seed-demo-clinic.ts` (site đã nạp bản cũ: `DEMO_REPAIR=1` một lần) |
| Vài lịch hẹn trong tuần demo, rải nhiều giờ và nhiều bác sĩ | Heatmap công suất có màu | Đặt tay 8-10 lịch hẹn |
| 2-3 kế hoạch điều trị **đã đồng ý**, chưa có lịch; 1 kế hoạch đã có lịch hẹn | Trang Điều trị chờ đặt lịch | Hồ sơ bệnh nhân → Kế hoạch điều trị → Lập kế hoạch → Báo giá → Khách đồng ý |
| 1 hóa đơn **Đã phát hành** còn nợ nhỏ (ví dụ 100.000 ₫) | Mã QR chuyển khoản | Đóng một phiên khám, phát hành hóa đơn |
| Bệnh nhân demo "Nguyễn Văn Demo" (tạo sẵn để khỏi gõ lâu) | Cốt truyện chính | Tạo ở phần 2 |

### 3. Cấu hình phải bật (kiểm một lần)

- **AI thật** (nên có, xem mục 4 nếu không): `AI_BASE_URL`, `AI_API_KEY`, `AI_MODEL`. Trang Dashboard có thẻ AI tóm tắt; thử bấm một lần xem dòng cuối có "Bản nháp do AI soạn" hay "Chưa dùng được AI".
- **Mã QR:** `VIETQR_BANK_BIN`, `VIETQR_ACCOUNT_NO`, `VIETQR_ACCOUNT_NAME` (xem `docs/08_Deployment/VIETQR.md`). Mở hóa đơn còn nợ: thấy thẻ "Thu bằng chuyển khoản".
- **Tự ghi chuyển khoản** (không bắt buộc): `BANK_WEBHOOK_API_KEY`, `BANK_WEBHOOK_ACTOR_EMAIL` (xem `docs/08_Deployment/BANK_WEBHOOK.md`). Nếu chưa nối SePay thật, demo bằng lệnh mô phỏng ở **phần 4.3**.

### 4. Kế hoạch dự phòng (nói trước với mình, không để đến lúc mới nghĩ)

| Sự cố | Cách xử lý |
|---|---|
| Mạng hoặc API AI chậm / lỗi | **Đây cũng là điểm để nói:** hệ thống tự chuyển sang bản soạn theo mẫu, nút vẫn dùng được, có dòng "Chưa dùng được AI". Không cần xin lỗi, giải thích luôn. |
| Không có SePay thật | Dùng lệnh mô phỏng ở 4.3 (cùng đường vào với SePay thật) và nói rõ là mô phỏng. |
| Chưa cấu hình VietQR | Bỏ qua thẻ QR, thu tiền thủ công như cũ. |
| Mất mạng hoàn toàn | Chạy local từ máy mình, hoặc mở video quay sẵn. **Quay video dự phòng từng phần** (mỗi phần 2-3 phút) để mở đúng đoạn cần. |

### 5. Khởi động (nếu chạy trên máy)
```bash
# Terminal 1: Backend
cd backend
npm run db:up
npm run start:dev

# Terminal 2: Frontend
cd frontend
npm run dev
```
Mở `http://localhost:5173` (hoặc địa chỉ site demo).

---

## PHẦN 1: GIỚI THIỆU TỔNG QUAN (2 phút)

> **Nói:** "GenSmile là hệ thống quản lý phòng khám nha khoa. Hôm nay tôi đi theo một bệnh nhân từ lúc đặt lịch đến lúc thanh toán và hẹn lần sau, qua tay ba người: lễ tân, bác sĩ và quản lý. Điểm khác so với phần mềm quản lý thông thường là hệ thống chủ động giúp từng người bớt việc tay."

### 1.1. Dashboard (cửa sổ quản trị)
- Chỉ vào các ô KPI, biểu đồ doanh thu, xếp hạng bác sĩ.
- Chọn **6 tháng qua** để có nhiều dữ liệu.
- Nói: "Menu bên trái thay đổi theo vai trò và quyền của người đăng nhập."

---

## PHẦN 2: LỄ TÂN, BỆNH NHÂN VÀ LỊCH HẸN (3 phút)

### 2.1. Tạo bệnh nhân (30 giây, bỏ qua nếu đã tạo sẵn)
- **Bệnh nhân → + Tạo bệnh nhân**: tên "Nguyễn Văn Demo", sinh 1990-01-15, nam, SĐT 0901234567, dị ứng "Penicillin".
- Nói: hệ thống kiểm tra trùng số điện thoại, tự sinh mã bệnh nhân, **dị ứng hiện màu đỏ** ở mọi màn hình sau này.

### 2.2. ⏱ Danh sách điều trị chờ đặt lịch (điểm mới, 1 phút)
- Cửa sổ lễ tân → menu **Điều trị chờ đặt lịch**.
- Chỉ vào ba ô trên cùng: số bệnh nhân chưa đặt lịch, **tổng giá trị điều trị còn dở**.
- Nói: "Bệnh nhân đã đồng ý kế hoạch nhưng chưa quay lại là tiền phòng khám đang bỏ lỡ. Danh sách này cho lễ tân biết gọi ai trước: người chờ lâu nhất đứng trên, quá 14 ngày chữ đỏ."
- Bấm **Đặt lịch** ở một dòng: form mở sẵn đúng **bệnh nhân, bác sĩ lập kế hoạch, loại Điều trị**. Chọn giờ rồi tạo (hoặc đóng lại nếu thiếu thời gian).
- Chuyển sang tab **Đã có lịch** để thấy người đã đặt, kèm ngày giờ.

### 2.3. Đặt lịch và check-in
- **Lịch hẹn → + Tạo lịch**: chọn "Nguyễn Văn Demo" → bác sĩ → khung giờ gần nhất → "Khám tổng quát".
- Mở lịch vừa tạo → **Check-in** (bệnh nhân vào hàng chờ của bác sĩ).
- Nói: hệ thống chỉ cho đặt trong giờ làm việc của bác sĩ và không cho trùng giờ (BR-APPT).

### 2.4. ⏱ AI soạn tin nhắn cho khách (điểm mới, 1 phút)
- Mở một lịch hẹn → bấm **AI soạn tin**.
- Tab "Nhắc lịch hẹn" → **Soạn tin**: tin nhắn có tên khách ("Chào chị Dung…"), giờ hẹn, bác sĩ.
- Sang tab **Trả lời tin nhắn khách**, dán: "Cho em hỏi niềng răng giá bao nhiêu ạ?" → **Soạn tin**. Chỉ ra bản nháp **không tự hứa giá**, mời khách gọi hotline.
- Chỉ vào các nút **Sao chép / Mở Zalo / Gọi** và dòng "Hệ thống không tự gửi tin".
- Nói (quan trọng): "AI chỉ soạn nháp, lễ tân sửa rồi tự gửi. **AI không được thấy tên và số điện thoại khách**: nó viết sẵn chỗ xưng hô, máy chủ mới điền tên vào. Cách làm này theo yêu cầu bảo vệ dữ liệu cá nhân (Nghị định 356/2025)."

---

## PHẦN 3: BÁC SĨ, PHIÊN KHÁM (4 phút)

### 3.1. Bắt đầu khám
- Cửa sổ bác sĩ → **Hàng chờ của tôi** → bệnh nhân vừa check-in → **Bắt đầu khám**.
- Nói: thẻ **Tiền sử và dị ứng** hiện ngay trên đầu phiên khám.

### 3.2. Ghi chú: AI soạn từ ghi nhanh (điểm mới, 1,5 phút)
- Tab **Ghi chú** → **AI soạn từ ghi nhanh**.
- Gõ **vắn tắt như lúc khám thật**: `dau R36 3 ngay, ve dem, go dau, sau lon, viem tuy, dieu tri tuy + boc su, TD 1 tuan`.
- Bấm **Soạn ghi chú**: AI tách thành 4 ô **Lý do khám / Chẩn đoán / Kế hoạch điều trị / Ghi chú tiến triển**, viết lại đầy đủ.
- Sửa một chỗ (cho thấy bác sĩ kiểm soát) → **Thêm vào ghi chú**.
- Nói: "AI không tự lưu gì. Bác sĩ đọc, sửa, rồi mới thêm. AI cũng chỉ được dùng đúng những gì bác sĩ gõ, **không thêm triệu chứng hay thuốc**."

### 3.3. Điều trị, đơn thuốc, sơ đồ răng
- Tab **Điều trị** → **+ Thêm điều trị**: răng 36, điều trị tủy, SL 1, giá 1.500.000.
- Tab **Sơ đồ răng**: chạm răng 36 → "Đã điều trị tủy".
- (Nếu còn thời gian) tab **Đơn thuốc**: kê một thuốc; chọn thuốc trùng dị ứng Penicillin để cho thấy **cảnh báo bắt buộc**.
- Nói: "Cảnh báo dị ứng chạy theo quy tắc cố định, **không giao cho AI**. Một lần AI sót là nguy hiểm cho bệnh nhân."

### 3.4. Đóng phiên khám
- **Đóng phiên khám** → xác nhận. Hệ thống: khóa ghi chú (sửa tiếp bằng addendum trong 30 ngày), trừ kho vật tư, **tự tạo hóa đơn nháp**.

---

## PHẦN 4: HÓA ĐƠN, THU TIỀN, HẸN TIẾP (4 phút)

### 4.1. Phát hành
- Cửa sổ lễ tân → **Hóa đơn** → hóa đơn nháp vừa tạo → **Phát hành hóa đơn** (số `INV-2026-…`).

### 4.2. Mã QR chuyển khoản (điểm mới, 1 phút)
- Trang hóa đơn có thẻ **Thu bằng chuyển khoản**: mã QR, số tiền còn nợ, nội dung là mã hóa đơn.
- Nói: "Lễ tân không phải đọc số tài khoản và gõ số tiền. Khách quét bằng app ngân hàng, mọi thứ điền sẵn. Mã theo chuẩn VietQR của NAPAS, **tạo ngay trên máy chủ**, không gọi dịch vụ ngoài." Nếu có điện thoại, **quét thử** để hội đồng thấy app hiện đúng tên tài khoản và số tiền (không cần chuyển).

### 4.3 Tiền về, hệ thống tự ghi (điểm mới, 1,5 phút)
Giữ trang hóa đơn đang mở, **đừng bấm Thu tiền**. Từ một cửa sổ dòng lệnh khác, mô phỏng thông báo của ngân hàng (SePay) với đúng số tiền còn nợ. PowerShell:

```powershell
$body = @{ id = [int](Get-Random -Maximum 900000); transactionDate = (Get-Date -Format 'yyyy-MM-dd HH:mm:ss')
  accountNumber = '<VIETQR_ACCOUNT_NO>'; transferType = 'in'; transferAmount = 1500000
  content = 'INV2026000123'; referenceCode = 'DEMO' } | ConvertTo-Json
Invoke-RestMethod -Method Post -Uri 'https://<tên-miền>/api/v1/webhooks/bank/sepay' `
  -Headers @{ Authorization = 'Apikey <BANK_WEBHOOK_API_KEY>' } -ContentType 'application/json' -Body $body
```
(Đổi `transferAmount` đúng số còn nợ, `content` đúng mã hóa đơn bỏ dấu gạch. Chuẩn bị sẵn lệnh này trong một file, thay giá trị trước.)

- Sau vài giây, trang hóa đơn **tự chuyển sang Đã thanh toán** và hiện thông báo.
- Mở **Quản trị → Nhật ký**: có dòng `BANK_TRANSFER_RECORDED`.
- Nói: "Hệ thống chỉ tự ghi khi chắc chắn: nội dung có mã hóa đơn, hóa đơn còn nợ, số tiền không vượt số nợ. Gửi lặp cùng một giao dịch không ghi hai lần. Mọi trường hợp còn lại, hệ thống **không đoán**, mà để lễ tân xử lý."
- Chạy lại **đúng lệnh đó** để cho thấy phản hồi `duplicate` (không có phiếu thu thứ hai).
- ⏱ Gửi một khoản không khớp (đổi `content` thành `chuyen tien kham`) → vào menu **Chuyển khoản cần xử lý**: thấy dòng đó kèm lý do "Nội dung không có mã hóa đơn", có nút **Đã xử lý** (bắt buộc ghi chú). Chỉ vào số đếm trên **chuông thông báo**.
- Nếu không có SePay hoặc mô phỏng không chạy được: bấm **+ Thu tiền** → Chuyển khoản → xác nhận, rồi nói đây là bước hệ thống tự làm khi nối ngân hàng.

### 4.4. Hẹn tiếp ngay khi thu đủ (điểm mới, 30 giây)
- Hóa đơn **Đã thanh toán** có thẻ **Hẹn lần khám tiếp**.
- Bấm **Đặt hẹn tiếp**: form đặt lịch mở sẵn **bệnh nhân, bác sĩ vừa khám, loại Tái khám**. Chọn ngày giờ → tạo.
- Nói: "Bệnh nhân còn đang đứng ở quầy, đây là lúc dễ đặt hẹn nhất. Hệ thống đưa việc đó lên ngay lúc thu tiền, thay vì lễ tân phải nhớ hoặc gọi lại sau."

### 4.5. In hóa đơn
- **In** → tải file PDF.

---

## PHẦN 5: QUẢN LÝ, SỐ LIỆU DẪN ĐẾN QUYẾT ĐỊNH (4 phút)

### 5.1. Chỉ số vận hành so với mục tiêu (điểm mới, 1,5 phút)
- Cửa sổ quản trị → Dashboard, chọn **6 tháng qua**, kéo xuống thẻ **Chỉ số vận hành**.
- Giải thích cách đọc: mỗi chỉ số một thanh ngang, **vạch đen là mục tiêu**, thanh xanh là kết quả; bên phải ghi bằng chữ **Đạt mục tiêu / Chấp nhận được / Cần cải thiện**.
- Sáu chỉ số: **tỷ lệ vắng mặt** (mục tiêu ≤ 5%), **hủy sát giờ** (≤ 5%), **có lịch hẹn tiếp** (≥ 85%), **chấp nhận kế hoạch điều trị** (≥ 75%), **thời gian chờ khám** (≤ 15 phút), **tỷ lệ thu tiền** (≥ 95%).
- Rê chuột vào dấu (i) để cho thấy **công thức tính**, và chỉ vào dòng "17/96 lượt" (tử số/mẫu số) để chứng minh số liệu kiểm chứng được.
- Nói: "Mục tiêu lấy từ hướng dẫn của Hiệp hội Nha khoa Hoa Kỳ và báo cáo ngành (có ghi nguồn ở chân thẻ). Chỉ số chưa có dữ liệu hiện dấu gạch, **không hiện 0%** để khỏi gây hiểu lầm."

### 5.2. Công suất theo giờ (điểm mới, 1 phút)
- Thẻ **Công suất theo giờ** bên cạnh: bảng thứ × giờ, ô càng đậm là giờ làm việc càng kín lịch, ô viền đứt là giờ không làm việc.
- Chọn một bác sĩ để lọc.
- Nói: "Con số trung bình che mất chuyện giờ nào kín, giờ nào trống. Chủ phòng khám nhìn bảng này biết nên mời khách vào khung nào và nên xếp ca ra sao. Giờ làm việc ở đây **tính từ chính lịch của hệ thống đặt lịch**, đã trừ nghỉ phép và ngày đóng cửa nên khớp với thực tế."

### 5.2b. Hành trình bệnh nhân (điểm mới, 45 giây)
- Dưới hai thẻ trên là thẻ **Hành trình bệnh nhân** (chọn 6 tháng): các thanh ngang đi từ **Đặt lịch → Đã đến → Đã khám → Đã thanh toán đủ → Có lịch hẹn tiếp**, mỗi thanh ghi số lượt và phần trăm còn lại so với bước trước.
- Nói: "Chỗ thanh ngắn lại nhiều nhất là chỗ phòng khám đang mất khách. Ví dụ ở đây phần lớn đã khám nhưng ít người có lịch hẹn tiếp: đó là lý do ta làm thẻ Hẹn lần khám tiếp ở bước thu tiền." Nếu có nhiều nguồn đặt lịch, chọn lọc theo nguồn (online, điện thoại, vãng lai) để so sánh.

### 5.3. Báo cáo và AI nhận xét (điểm mới, 1 phút)
- Menu **Báo cáo** → chọn khoảng ngày → thẻ **AI nhận xét kỳ báo cáo** → **Nhận xét**.
- Đọc 1-2 nhận xét. Nói: "AI chỉ đọc **số tổng** của báo cáo, không có thông tin bệnh nhân nào. Mọi con số do hệ thống tính; AI chỉ diễn giải thành lời, và chân thẻ ghi rõ điều đó."
- Cuộn xuống: doanh thu theo trạng thái, công nợ theo tuổi nợ, nút xuất CSV.

### 5.4. Trợ lý AI dạng chat (điểm mới, 1,5 phút)
- Ở bất kỳ màn hình nào, bấm nút **Trợ lý AI** góc dưới phải (cửa sổ lễ tân).
- Hỏi: **"Ai chưa đặt lịch điều trị?"** → bot trả danh sách bệnh nhân chờ lâu nhất (lấy từ trang Điều trị chờ đặt lịch).
- Gõ: **"Đặt lịch cho chị <tên bệnh nhân demo> vào ngày mai"** → bot tìm bệnh nhân, xem giờ trống của các bác sĩ, rồi hiện **thẻ đề xuất đặt lịch**. Chỉ vào thẻ: chưa có lịch nào được tạo; bấm **Xác nhận đặt lịch** thì lịch mới có (thấy ở trang Lịch hẹn).
- Nói: "Bot không tự ghi gì: nó chỉ chuẩn bị, người dùng bấm xác nhận. Bot chạy với quyền của chính người đang đăng nhập nên không thấy hay làm được gì hơn họ. Tên bệnh nhân không gửi cho AI: AI chỉ thấy mã P1, P2, trình duyệt điền tên khi hiển thị."
- Dự phòng: nếu AI không dùng được, khung chat báo "chưa cấu hình / không phản hồi", các chức năng khác vẫn bình thường; chuẩn bị video quay sẵn đoạn này.

### 5.5. ⏱ Nhật ký kiểm toán
- **Quản trị → Nhật ký**: lọc theo hôm nay → thấy các dòng vừa làm, trong đó có `AI_NOTE_DRAFTED`, `AI_MESSAGE_DRAFTED`, `AI_ASSISTANT_CHAT`, `BANK_TRANSFER_RECORDED`.
- Nói: "Mọi lần dùng AI và mọi khoản tiền tự ghi đều để lại dấu vết: ai, lúc nào, nguồn nào. Nhật ký không lưu nội dung ghi chú hay tin nhắn."

---

## PHẦN 6: KẾT THÚC (2 phút)

### 6.1. Tóm tắt giá trị
> "Hôm nay ta đi một vòng: bệnh nhân đặt lịch, bác sĩ khám với ghi chú do AI soạn nháp, hóa đơn thu bằng mã QR và tự ghi khi tiền về, rồi hẹn lần sau ngay tại quầy. Với quản lý, hệ thống cho biết giờ nào đang trống và phòng khám đang ở đâu so với mục tiêu. AI luôn chỉ là **người soạn nháp**: không tự lưu, không tự gửi, và những việc cần chắc chắn như cảnh báo dị ứng, tính giờ trống, tính tiền vẫn chạy theo quy tắc cố định."

### 6.2. Số liệu hệ thống
> "Hệ thống có khoảng 300 API endpoint và 124 mã quyền, đã có 1.639 kiểm thử tự động ở backend, cùng bộ kiểm thử chạy trên PostgreSQL thật (108 kiểm thử) và 38 kịch bản kiểm thử giao diện chạy trong CI trước mỗi lần cập nhật."

(Số liệu chốt ngày 05/11/2026. **Chạy lại `npm test` trước buổi bảo vệ** và sửa nếu khác.)

### 6.3. Hỏi đáp
Mời câu hỏi từ hội đồng. Xem phần dưới để chuẩn bị.

---

## CÂU HỎI HỘI ĐỒNG CÓ THỂ HỎI VÀ CÁCH TRẢ LỜI

| Câu hỏi | Gợi ý trả lời |
|---|---|
| **AI có đọc dữ liệu bệnh nhân không? Có lộ thông tin không?** | Không gửi tên, số điện thoại, ngày sinh, địa chỉ. Ghi chú: chỉ gửi đúng dòng bác sĩ gõ. Tin nhắn: tên được điền ở máy chủ sau khi AI trả lời. Báo cáo: chỉ số tổng. Mỗi lần dùng đều ghi nhật ký. Phù hợp yêu cầu bảo vệ dữ liệu cá nhân (Nghị định 356/2025). |
| **AI sai thì sao?** | AI chỉ soạn nháp, người dùng đọc và sửa trước khi lưu hoặc gửi; trên giao diện luôn có dòng nhắc "có thể sai". Việc rủi ro cao (dị ứng, giờ trống, tiền) **không giao cho AI**. |
| **Bot chat có tự đặt lịch hay sửa dữ liệu được không?** | Không. Việc duy nhất bot làm được là soạn thẻ đặt lịch; người dùng bấm Xác nhận thì hệ thống mới tạo, qua đúng quy tắc đặt lịch như khi tự làm. Không kê đơn, không sửa, không xóa, không thu tiền. Bot chạy với quyền của người dùng nên không vượt quyền. |
| **Nếu AI hỏng hoặc hết hạn mức?** | Mỗi tính năng có bản soạn theo mẫu; nút vẫn chạy và hiện rõ là bản mẫu. Hệ thống không phụ thuộc AI để hoạt động. |
| **Chuyển khoản tự ghi có thể ghi sai tiền không?** | Chỉ ghi khi nội dung có mã hóa đơn, hóa đơn còn nợ và số tiền không vượt số nợ. Gửi lặp không ghi hai lần (kiểm bằng cả bảng giao dịch lẫn khóa của phiếu thu, đã thử 3 yêu cầu đồng thời trên PostgreSQL thật). Còn lại vào danh sách để người xử lý. |
| **Ai chắc rằng thông báo đến từ ngân hàng?** | Địa chỉ webhook yêu cầu khóa bí mật chung với SePay; sai khóa trả 401; chưa cấu hình khóa thì địa chỉ không tồn tại. |
| **Mục tiêu 5% vắng mặt, 85% hẹn lại lấy ở đâu?** | Hướng dẫn của ADA và báo cáo ngành (Curve Dental, Henry Schein One), ghi nguồn ở chân thẻ và trong `docs/11_Improvement/KE_HOACH_CAI_TIEN.md`. Riêng mục tiêu thời gian chờ ≤ 15 phút là đề xuất, chỉnh theo từng phòng khám. |
| **Đã thử với SePay thật chưa?** | Trả lời thật: logic và định dạng làm theo tài liệu SePay và đã kiểm thử đầy đủ bằng thông báo mô phỏng; kết nối thật phụ thuộc cấu hình tài khoản của phòng khám. |
| **Còn thiếu gì?** | Xem mục "Hạn chế và hướng phát triển" trong luận văn: tích hợp đơn thuốc điện tử và bệnh án điện tử theo Thông tư 26/2025 và 13/2025, nhà cung cấp ngân hàng khác (Casso, payOS), gợi ý ngày hẹn tiếp từ khoảng tái khám của dịch vụ. |

---

## CHECKLIST TRƯỚC DEMO

- [ ] Backend và frontend đang chạy (hoặc site demo mở được).
- [ ] 3 cửa sổ ẩn danh đã đăng nhập: quản trị, lễ tân, bác sĩ.
- [ ] Dữ liệu 6 tháng đã nạp; Dashboard chọn "6 tháng" thấy heatmap có màu.
- [ ] Có 2-3 kế hoạch điều trị đã đồng ý chưa đặt lịch, 1 cái đã có lịch (trang **Điều trị chờ đặt lịch** không trống).
- [ ] Bệnh nhân "Nguyễn Văn Demo" đã tạo; có dị ứng Penicillin.
- [ ] Bấm thử **AI soạn từ ghi nhanh** một lần: biết nó trả bản AI hay bản mẫu.
- [ ] Hóa đơn thử còn nợ có thẻ QR; **quét thử bằng điện thoại** (không cần chuyển).
- [ ] Lệnh mô phỏng ngân hàng đã chép sẵn vào file, đã thay địa chỉ, khóa, số tài khoản, mã hóa đơn.
- [ ] Đã chạy thử trọn cốt truyện một lần, đo thời gian.
- [ ] Test micro, máy chiếu, sạc laptop.
- [ ] Có video quay sẵn từng phần để mở khi mạng chập chờn.

## TIPS KHI DEMO

1. **Nói chậm, rõ ràng**, hội đồng có thể không quen công nghệ. Mỗi tính năng mới nói theo khuôn: *việc tay trước đây* → *hệ thống giúp thế nào* → *vì sao an toàn*.
2. **Đừng chờ AI**: bấm xong thì nói tiếp (giải thích AI không thấy tên khách) trong lúc đợi vài giây.
3. **Nhấn mạnh ranh giới của AI** (chỉ soạn nháp; việc rủi ro cao theo quy tắc cố định). Đây là điểm hội đồng thường đánh giá cao.
4. **Highlight business rule** (BR-PT-007, BR-APPT-014, BR-MR-001, BR-TP-012…) để chứng minh đã phân tích kỹ.
5. **Show nhật ký kiểm toán** để chứng minh hệ thống sẵn sàng vận hành thật.
6. **Nếu lỗi**: đừng hoảng. Mỗi tính năng có phương án dự phòng ở trên; nói thẳng "đây là bản dự phòng theo thiết kế".
7. **Đừng đọc slide**, chỉ highlight từ khóa; chi tiết nói tự nhiên.
8. **Trả lời "Tại sao?"** bằng lý do đã ghi (BD-001, ADR-0001…) và nguồn tham khảo trong `docs/11_Improvement/KE_HOACH_CAI_TIEN.md`.

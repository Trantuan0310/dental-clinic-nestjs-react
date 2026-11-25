# Kịch bản demo bảo vệ đồ án GenSmile (10–15 phút)

> Cập nhật 25/11/2026. Kịch bản này đã được **chạy thử từ đầu đến cuối** trên bản chạy cục bộ với dữ liệu mẫu 6 tháng (500 bệnh nhân): mọi nút, tên menu, thông báo ghi dưới đây là chữ thật trên giao diện. Thay cho `DEMO_SCRIPT.md` (bản 22–25 phút, dùng khi có thời gian dài).
>
> **Thời lượng mục tiêu: 13 phút**, chừa 2 phút cho sự cố. Phần đánh dấu ✂ có thể bỏ khi bị nhắc giờ.

---

## 1. Cốt truyện (nói trong 1 câu)

> "Anh Sơn, bệnh nhân cũ có **dị ứng Penicillin**, tự đặt lịch trên mạng; lễ tân duyệt, bác sĩ khám và kê đơn, lễ tân thu tiền bằng QR, anh Sơn tự xem lại lịch sử khám trên điện thoại; cuối cùng chủ phòng khám xem số liệu."

Một bệnh nhân đi hết vòng nghiệp vụ, qua 4 vai: **bệnh nhân → lễ tân → bác sĩ → quản lý**. Mỗi màn hình có một điểm nhấn kỹ thuật để hội đồng thấy phần "khó" của đồ án.

## 2. Bảng thời gian

| Phút | Phần | Vai | Điểm nhấn kỹ thuật |
|---|---|---|---|
| 0:00–1:00 | Mở đầu | — | Bài toán, 4 nhóm người dùng, kiến trúc 1 câu |
| 1:00–2:30 | ① Bệnh nhân đặt lịch online | Bệnh nhân | Nhận ra khách cũ bằng SĐT + ngày sinh; chống đặt trùng |
| 2:30–3:30 | ② Lễ tân duyệt, check-in sớm | Lễ tân | Gợi ý hồ sơ khớp; quy tắc giờ check-in |
| 3:30–7:30 | ③ Bác sĩ khám | Bác sĩ | Dị ứng hiện đầu trang; lịch sử theo từng răng; **cảnh báo dị ứng theo nhóm thuốc**; đóng phiên khóa hồ sơ, tự sinh hóa đơn |
| 7:30–10:00 | ④ Thu tiền QR, tiền về tự ghi | Lễ tân | VietQR; webhook ngân hàng **không ghi trùng**; hẹn tiếp ngay tại quầy |
| 10:00–11:00 | ⑤ Bệnh nhân xem lịch sử trên điện thoại | Bệnh nhân | Đường dẫn bảo mật, không cần tài khoản |
| 11:00–12:30 | ⑥ Quản lý: chỉ số và phân quyền | Quản lý | 6 chỉ số so với mục tiêu; menu theo vai trò |
| 12:30–13:00 | Kết | — | Số liệu kiểm thử, hạn chế, hướng phát triển |

---

## 3. Chuẩn bị

### 3.1. Hai ngày trước (bắt buộc)

1. **Đưa các bản sửa lên production.** Nhánh `claude/trusting-gauss-8544yk` có các sửa lỗi tìm ra khi tập dượt (mục 7) mà nhánh chính chưa có. Gộp vào `main` qua PR (đủ 10 check xanh), rồi deploy trên VPS:
   ```bash
   cd /opt/dental-clinic/production; git fetch origin; git show origin/main:scripts/deploy-vps.sh > /tmp/deploy-vps.sh; bash /tmp/deploy-vps.sh
   ```
2. **Sửa dữ liệu demo đã nạp** (người lớn không còn "điều trị tủy răng sữa", lý do khám khớp điều trị, người dị ứng Penicillin không có đơn Amoxicillin):
   ```bash
   cd /opt/dental-clinic/production; bash scripts/demo-teeth-vps.sh
   ```
3. Kiểm tra bản đang chạy: `curl -s https://gensmile.online/health` → trường `commit` phải trùng `git rev-parse origin/main`.

### 3.2. Một ngày trước: dựng nhân vật và tài khoản

| Việc | Cách làm | Ghi lại |
|---|---|---|
| Chọn **bệnh nhân demo** | Một bệnh nhân mẫu người lớn có ≥ 3 lần khám và có điều trị trên một răng hàm (vào hồ sơ → Điều trị & sơ đồ răng, bấm răng có màu xem "Các lần điều trị trước"). Bản tập dượt dùng *Dương Văn Sơn*, răng 37. | Họ tên, **SĐT, ngày sinh**, số răng |
| Thêm dị ứng | Hồ sơ bệnh nhân → Tiền sử và dị ứng → **Sửa** → Dị ứng: `Penicillin` | |
| Bác sĩ demo phải làm được dịch vụ trám | Nhân sự & lương → Bác sĩ → dịch vụ được làm có "Trám răng composite" | Tên bác sĩ |
| 3 tài khoản | Quản trị, lễ tân, **đúng bác sĩ ở trên** | Email (mật khẩu giữ riêng, không ghi vào tài liệu) |
| AI | Bấm thử "AI soạn từ ghi nhanh" ở một phiên khám nháp. Nếu thấy dòng "Chưa dùng được AI…" thì AI chưa chạy: kiểm tra `AI_BASE_URL`, `AI_API_KEY`, `AI_MODEL` trên VPS | AI chạy / không |
| VietQR, webhook | Mở một hóa đơn còn nợ thấy thẻ "Thu bằng chuyển khoản". Chuẩn bị lệnh mô phỏng ngân hàng (mục 3.4) | |
| Video dự phòng | Quay màn hình từng phần ①–⑥ (mỗi phần 1–2 phút) | Tệp video trên máy và USB |

### 3.3. Sáng hôm bảo vệ (30 phút trước)

- [ ] Mở `https://gensmile.online/health` thấy `"status":"ok"`.
- [ ] **4 cửa sổ trình duyệt**, mỗi cửa sổ một profile (hoặc ẩn danh khác nhau), **đã đăng nhập sẵn**:
  1. *Bệnh nhân* — trang `/booking` (không đăng nhập);
  2. *Lễ tân* — trang **Yêu cầu đặt lịch**;
  3. *Bác sĩ* — trang **Hàng chờ của tôi**;
  4. *Quản trị* — **Dashboard**, chọn **6 tháng**.
- [ ] Phóng to trình duyệt 125% (máy chiếu), tắt thông báo hệ điều hành, tắt các tab khác, sạc đầy pin.
- [ ] Điện thoại có app ngân hàng (để quét QR, **không chuyển tiền**); hoặc dùng chế độ điện thoại của DevTools (F12 → biểu tượng điện thoại) cho phần ⑤.
- [ ] Mở sẵn terminal có lệnh mô phỏng ngân hàng (mục 3.4), đã điền khóa, chỉ còn sửa mã hóa đơn.
- [ ] **Giờ hẹn online phải sau giờ hiện tại ít nhất 2 giờ** (quy tắc đặt online) và trong giờ làm việc của bác sĩ. Nếu buổi bảo vệ sau khoảng 16:30, xem phương án B ở bước ①.

### 3.4. Lệnh mô phỏng ngân hàng báo tiền về

SePay gọi webhook này khi tài khoản phòng khám nhận tiền. Khóa là `BANK_WEBHOOK_API_KEY` trong `.env.production` trên VPS — **chỉ dán vào terminal lúc chuẩn bị, không lưu vào tài liệu hay chụp màn hình**.

Bash (Linux, macOS, Git Bash):
```bash
KEY='<BANK_WEBHOOK_API_KEY>'; INV='INV2026002375'; AMOUNT=500000   # mã hóa đơn bỏ dấu gạch
curl -s -X POST https://gensmile.online/api/v1/webhooks/bank/sepay \
  -H "Authorization: Apikey $KEY" -H 'Content-Type: application/json' \
  -d "{\"id\":$RANDOM$RANDOM,\"transactionDate\":\"$(date '+%F %T')\",\"accountNumber\":\"<VIETQR_ACCOUNT_NO>\",\"transferType\":\"in\",\"transferAmount\":$AMOUNT,\"content\":\"$INV thanh toan\",\"referenceCode\":\"DEMO\"}"
```
PowerShell:
```powershell
$KEY='<BANK_WEBHOOK_API_KEY>'; $INV='INV2026002375'; $AMOUNT=500000
$body = @{ id = Get-Random -Maximum 99999999; transactionDate = (Get-Date -Format 'yyyy-MM-dd HH:mm:ss')
  accountNumber = '<VIETQR_ACCOUNT_NO>'; transferType = 'in'; transferAmount = $AMOUNT
  content = "$INV thanh toan"; referenceCode = 'DEMO' } | ConvertTo-Json
Invoke-RestMethod -Method Post -Uri 'https://gensmile.online/api/v1/webhooks/bank/sepay' `
  -Headers @{ Authorization = "Apikey $KEY" } -ContentType 'application/json' -Body $body
```
Kết quả đúng: lần đầu `{"success":true,"outcome":"recorded"}`; chạy lại **đúng lệnh đó** (cùng `id`): `"outcome":"duplicate"`. Với Bash, `$RANDOM$RANDOM` đổi mỗi lần chạy — để gửi lặp, chép nguyên phần JSON đã chạy hoặc đặt `ID=12345678` cố định trước.

---

## 4. Kịch bản chi tiết

Quy ước: **Làm** là thao tác, **Nói** là lời gợi ý (nói tự nhiên, không đọc), **Nếu lỗi** là phương án dự phòng.

### Mở đầu (0:00–1:00)

**Nói:** "Em xin trình bày phần mềm GenSmile, quản lý phòng khám nha khoa nhiều bác sĩ. Phòng khám có bốn nhóm người dùng: bệnh nhân, lễ tân, bác sĩ và quản lý. Hệ thống gồm giao diện React, máy chủ NestJS với 23 module, cơ sở dữ liệu PostgreSQL 70 bảng, đang chạy thật tại gensmile.online. Em sẽ đi theo một bệnh nhân, anh Sơn, có dị ứng Penicillin, từ lúc tự đặt lịch đến lúc trả tiền và xem lại lịch sử khám."

### ① Bệnh nhân đặt lịch online (1:00–2:30) — cửa sổ *Bệnh nhân*

**Làm:**
1. Trang **Đặt lịch khám**. Ở mục 2, gõ **Số điện thoại** và **Ngày sinh** của bệnh nhân demo → bấm **Tìm hồ sơ cũ**: họ tên tự điền.
2. Mục 1: **Dịch vụ** = "Khám tổng quát & tư vấn"; **Bác sĩ** = bác sĩ demo; **Ngày** = hôm nay; **Giờ còn trống** = giờ sớm nhất.
3. Tích "Tôi đồng ý…" → **Gửi yêu cầu đặt lịch** → màn hình "Đã gửi yêu cầu đặt lịch".

**Nói:** "Danh sách giờ trống tính từ lịch làm việc của bác sĩ, trừ giờ đã có người, ngày nghỉ và thời gian đệm giữa hai ca. Đặt online phải trước ít nhất 2 giờ. Yêu cầu chưa thành lịch hẹn cho đến khi lễ tân duyệt; lúc tạo lịch hẹn, máy chủ lấy **khóa tư vấn** của PostgreSQL theo bác sĩ và bệnh nhân rồi kiểm tra trùng ngay trong giao dịch, nên hai lịch trùng giờ không bao giờ cùng được tạo — ca kiểm thử KT-LH-01 gửi hai yêu cầu đồng thời để chứng minh."

**Nếu lỗi / phương án B:** sau 16:30 không còn giờ cách 2 tiếng → chọn **ngày mai**, nói "lịch hẹn sẽ vào ngày mai"; đến bước ② lễ tân duyệt xong thì dùng **Lịch hẹn → Khách vãng lai** để tiếp nhận anh Sơn hôm nay (vẫn đúng nghiệp vụ: khách đến không hẹn).

### ② Lễ tân duyệt và check-in (2:30–3:30) — cửa sổ *Lễ tân*

**Làm:**
1. Menu **Yêu cầu đặt lịch** (có số đỏ trên menu) → dòng của anh Sơn → **Xử lý yêu cầu**.
2. Chỉ vào ô **Hồ sơ bệnh nhân của yêu cầu này**: hệ thống gợi ý đúng hồ sơ cũ ("hồ sơ này trùng ngày sinh và họ tên…").
3. Bấm **Xác nhận lịch hẹn** → thông báo "Đã xác nhận lịch hẹn" (khách không có email thì có dòng nhắc gọi điện).
4. Menu **Lịch hẹn** → ô tìm kiếm gõ SĐT → bấm dòng của anh Sơn → nút **Có thể check-in sớm từ …** → chọn lý do nhanh **Bệnh nhân đến sớm** → **Check-in sớm**.

**Nói:** "Hệ thống không tự tạo hồ sơ mới mà gợi ý hồ sơ trùng, vì tạo trùng sẽ tách lịch sử khám và dị ứng của khách. Check-in chỉ mở 15 phút trước giờ hẹn; check-in sớm hơn phải có lý do và được ghi nhật ký."

### ③ Bác sĩ khám (3:30–7:30) — cửa sổ *Bác sĩ*

**Làm và nói theo thứ tự:**

1. **Hàng chờ của tôi** → thẻ anh Sơn → **Bắt đầu khám** → xác nhận **Bắt đầu khám**.
   **Nói:** "Thẻ **Tiền sử và dị ứng** nằm ngay đầu phiên khám, Penicillin màu đỏ."
2. ✂ Tab **Ghi chú** → **AI soạn từ ghi nhanh** → gõ vắn tắt: `dau R37 3 ngay, an nhai dau, sau ngà mat nhai, tram composite, TD 1 tuan` → **Soạn ghi chú** → sửa một chữ → **Thêm vào ghi chú**.
   **Nói:** "AI chỉ soạn nháp từ đúng dòng bác sĩ gõ, không nhận tên hay số điện thoại bệnh nhân, không tự lưu."
   **Nếu thấy dòng "Chưa dùng được AI…":** "Khi dịch vụ AI lỗi, hệ thống chuyển sang bản soạn theo mẫu, chức năng khác không bị ảnh hưởng." Bản mẫu chỉ điền ô *Ghi chú tiến triển*, nên **bắt buộc** thêm lý do khám: chọn loại "Lý do khám" → **Thêm ghi chú** → gõ "Đau răng 37 ba ngày" → **Thêm**. (Không có lý do khám hoặc chẩn đoán thì không đóng được phiên — quy tắc BR-MR-013; có thể biến thành điểm nhấn.)
   **Nếu bỏ phần AI (✂):** thêm lý do khám như trên, mất 20 giây.
3. Tab **Điều trị & sơ đồ răng**: chỉ hai cung răng tô màu theo tình trạng. Bấm **răng 37** (răng đã chọn khi chuẩn bị).
   **Nói:** "Bấm một răng là thấy tình trạng và **các lần điều trị trước** của đúng răng đó, ngày nào, bác sĩ nào, mở lại được phiên khám cũ. Dữ liệu này lấy trong một lần gọi API."
4. **Thêm điều trị cho răng này** → **Dịch vụ từ danh mục** = "Trám răng composite" (giá tự điền theo bảng giá) → **Thêm**.
   **Nói:** "Danh sách chỉ có dịch vụ bác sĩ này được phân công; sửa giá phải có quyền và lý do."
5. Tab **Đơn thuốc** → **Tạo đơn thuốc** → **Thêm thuốc**: Tên thuốc `Amoxicillin`, Liều `500mg`, Tần suất `3 lần/ngày`, Số lượng `15`, Đơn vị `viên`, Số ngày `5` → **Tạo đơn thuốc**.
   → Hộp **Cảnh báo dị ứng thuốc**: "Amoxicillin — dị ứng: Penicillin (nhóm Penicillin (beta-lactam))".
   **Nói (điểm nhấn lớn nhất):** "Tên thuốc khác hoàn toàn chữ Penicillin nhưng hệ thống vẫn bắt được vì đối chiếu **theo nhóm thuốc**. Phần này chạy bằng quy tắc cố định, không giao cho AI, vì sót một lần là nguy hiểm cho bệnh nhân. Muốn vẫn kê phải ghi lý do, lý do vào nhật ký kiểm toán."
   Bấm **Quay lại sửa đơn** → đổi Tên thuốc thành `Clindamycin`, Liều `300mg` → **Tạo đơn thuốc**. ("Clindamycin là kháng sinh thay thế thường dùng khi dị ứng Penicillin.")
   *Gõ liều ở ô Liều, không gõ vào tên thuốc, để đơn không lặp "300mg 300mg".*
6. Tab **Tổng quan** → **Tóm tắt cuối cùng**: "Trám composite răng 37. Kê Clindamycin do dị ứng Penicillin. Tái khám sau 1 tuần." → tích 3 ô kiểm → **Đóng phiên khám**.
   **Nói:** "Đóng phiên là một giao dịch: khóa ghi chú (sau đó chỉ được ghi bổ sung trong 30 ngày), trừ vật tư trong kho, cập nhật lịch hẹn và **tự lập hóa đơn nháp**. Lỗi ở bước nào thì cả giao dịch hủy."

### ④ Thu tiền bằng QR, tiền về tự ghi (7:30–10:00) — cửa sổ *Lễ tân*

**Làm:**
1. **Hóa đơn** → tìm tên anh Sơn → hóa đơn nháp vừa sinh (`INV-2026-…`) → **Phát hành hóa đơn**.
2. Chỉ thẻ **Thu bằng chuyển khoản**: mã QR, số tiền, nội dung `INV2026…`. ✂ Quét bằng app ngân hàng cho hội đồng thấy tên tài khoản và số tiền tự điền (**không chuyển**).
   **Nói:** "Mã theo chuẩn VietQR của NAPAS, sinh ngay trên máy chủ, không gọi dịch vụ ngoài."
3. **Giữ nguyên trang**, sang terminal, sửa `INV` và `AMOUNT` rồi chạy lệnh mục 3.4 → kết quả `recorded`. Vài giây sau trang hóa đơn tự chuyển **Đã thanh toán**, có dòng "Đã nhận 500.000 ₫ chuyển khoản cho hóa đơn …".
   **Nói:** "Đây là đúng thông báo ngân hàng gửi tới (em mô phỏng bằng lệnh vì không chuyển tiền thật trong phòng bảo vệ). Hệ thống chỉ tự ghi khi nội dung có mã hóa đơn, hóa đơn còn nợ và số tiền không vượt số nợ."
4. Chạy lại **đúng lệnh đó** → `duplicate`. Chỉ phần **Lịch sử thanh toán**: vẫn một phiếu thu.
   **Nói:** "Ngân hàng có thể gửi lại cùng một thông báo nhiều lần; mỗi giao dịch ngân hàng được lưu với ràng buộc duy nhất (nhà cung cấp, mã giao dịch) nên không bao giờ thu hai lần."
5. Thẻ **Hẹn lần khám tiếp** → **Đặt hẹn tiếp**: bệnh nhân và bác sĩ đã điền sẵn. **Đổi Ngày hẹn sang tuần sau** (mặc định là hôm nay 09:00 — sẽ báo "Giờ bắt đầu đã qua") → chọn giờ → **Tạo lịch hẹn**.
   **Nói:** "Lúc khách còn ở quầy là lúc dễ đặt hẹn nhất; chỉ số 'có lịch hẹn tiếp' trên dashboard đo đúng việc này."

**Nếu lệnh mô phỏng lỗi:** bấm **Thu tiền** → Chuyển khoản → xác nhận, nói "bước này hệ thống tự làm khi nối ngân hàng" và mở video dự phòng đoạn ④ nếu cần.

### ⑤ Bệnh nhân xem lịch sử trên điện thoại (10:00–11:00)

**Làm:** cửa sổ *Lễ tân* → **Bệnh nhân** → hồ sơ anh Sơn → **Gửi link tra cứu lịch sử** → **Sao chép**. Dán vào cửa sổ *Bệnh nhân* đang ở chế độ điện thoại.
Trang hiện: lịch hẹn sắp tới (vừa đặt ở bước ④), các lần khám, điều trị theo răng, đơn thuốc "Clindamycin 300mg — 3 lần/ngày, 5 ngày", tóm tắt.

**Nói:** "Bệnh nhân không cần tài khoản. Đường dẫn có hiệu lực 7 ngày, chỉ gửi tới số điện thoại hoặc email trong hồ sơ; máy chủ chỉ lưu mã băm SHA-256 của đường dẫn nên lộ cơ sở dữ liệu cũng không dùng lại được."

### ⑥ Quản lý: số liệu và phân quyền (11:00–12:30) — cửa sổ *Quản trị*

**Làm:**
1. **Dashboard**, khoảng **6 tháng**. Thẻ **Chỉ số vận hành**: 6 thanh, vạch đen là mục tiêu, chữ **Đạt mục tiêu / Chấp nhận được / Cần cải thiện**. Chỉ dòng tử số/mẫu số (vd "2/15 lượt").
   **Nói:** "Mục tiêu tham khảo hướng dẫn của Hiệp hội Nha khoa Hoa Kỳ và báo cáo ngành; mỗi số đều kiểm chứng được bằng tử số, mẫu số. Chỉ số chưa đủ dữ liệu hiện dấu gạch chứ không hiện 0%."
2. ✂ Thẻ **Công suất theo giờ**: ô càng đậm giờ càng kín lịch.
3. **Phân quyền** — để hai cửa sổ *Quản trị* và *Bác sĩ* cạnh nhau: menu quản trị có **Nhân sự, Bảng lương, Vai trò & quyền, Nhật ký kiểm toán**; menu bác sĩ chỉ có **Hàng chờ của tôi, Bệnh nhân của tôi, Lương của tôi…**
   **Nói:** "Phân quyền hai lớp: 133 mã quyền theo vai trò, và giới hạn theo dòng dữ liệu — bác sĩ chỉ xem được bệnh nhân mình khám hoặc có lịch với mình, kể cả khi tự gõ địa chỉ API."
4. ✂ **Nhật ký kiểm toán**: lọc hôm nay → thấy check-in sớm, đóng phiên khám, `BANK_TRANSFER_RECORDED` vừa làm.

### Kết (12:30–13:00)

**Nói:** "Vừa rồi là một vòng nghiệp vụ trọn vẹn trên hệ thống thật. Về chất lượng, hệ thống có khoảng 2.000 kiểm thử tự động ở ba tầng — gần 1.800 kiểm thử đơn vị, 113 kiểm thử API trên PostgreSQL thật, 122 kịch bản trình duyệt — chạy trong 10 bước kiểm tra trước mỗi lần cập nhật. Hạn chế lớn nhất là chưa lưu phim X-quang và chưa thử nghiệm tại phòng khám thật; đó cũng là hướng phát triển tiếp theo. Em xin cảm ơn, mời thầy cô đặt câu hỏi."

**Không mở** menu *Tin nhắn SMS / Zalo* (báo cáo đã bỏ phần Zalo; nếu được hỏi: "phần kết nối Zalo có trong mã nhưng ngoài phạm vi báo cáo").

---

## 5. Nếu bị nhắc giờ

Cắt theo thứ tự: ✂ AI soạn ghi chú (−45 s) → ✂ quét QR bằng điện thoại (−20 s) → ✂ heatmap (−20 s) → ✂ nhật ký kiểm toán (−20 s) → bỏ bước gửi lặp webhook, chỉ **nói** câu về không ghi trùng (−20 s). **Không cắt** cảnh báo dị ứng và tiền về tự ghi: đó là hai điểm mạnh nhất.

## 6. Câu hỏi hội đồng có thể hỏi

| Câu hỏi | Gợi ý trả lời (ngắn, có số liệu) |
|---|---|
| Hai lễ tân đặt cùng một giờ thì sao? | Mỗi lần đặt lấy khóa tư vấn của PostgreSQL theo bác sĩ và bệnh nhân trong giao dịch, kiểm tra trùng rồi mới ghi; yêu cầu thứ hai chờ khóa, thấy trùng và nhận lỗi 409. Ca KT-LH-01 (Bảng 5.2) gửi hai yêu cầu đồng thời trên PostgreSQL thật. |
| Sao không chỉ dùng ràng buộc duy nhất? | Trùng lịch là trùng **khoảng thời gian** (có thời gian đệm), không phải trùng một giá trị, nên ràng buộc duy nhất không diễn đạt được. |
| Webhook bị giả mạo thì sao? | Phải có khóa bí mật chung với SePay (sai khóa → 401, chưa cấu hình → địa chỉ không tồn tại); chỉ ghi khi khớp mã hóa đơn và số tiền không vượt nợ; mã giao dịch duy nhất chống ghi trùng. |
| AI có làm lộ dữ liệu bệnh nhân? | Không gửi tên, SĐT, ngày sinh. Ghi chú: chỉ dòng bác sĩ gõ. Trợ lý chat: bệnh nhân được thay bằng mã P1, P2. Mỗi lần dùng ghi nhật ký. Theo Nghị định 13/2023 về bảo vệ dữ liệu cá nhân. |
| AI sai thì sao? | AI chỉ soạn nháp, người dùng sửa và tự lưu; việc rủi ro cao (dị ứng, giờ trống, tiền) chạy bằng quy tắc cố định. |
| Bác sĩ A xem được bệnh nhân của bác sĩ B không? | Không: giới hạn theo dòng dữ liệu kiểm ở máy chủ cho mọi truy vấn; bác sĩ có lịch với bệnh nhân chỉ được đọc, không được sửa phiên khám của người khác (có kiểm thử API). |
| Sửa hồ sơ sau khi đóng phiên? | Không sửa được; chỉ ghi bổ sung (addendum) trong 30 ngày, giữ nguyên bản gốc — đúng yêu cầu hồ sơ bệnh án. |
| Vì sao NestJS + Prisma + PostgreSQL? | TypeScript cả hai đầu, NestJS có module, guard, DI hợp với 23 module nghiệp vụ; PostgreSQL có giao dịch, khóa tư vấn, kiểu số thập phân cho tiền. |
| Kiểm thử đến đâu? | ≈ 2.000 ca, đạt 100% ở lần chạy cuối (Bảng 5.6); bao phủ 76,6% số dòng; tầng API chạy trên PostgreSQL thật để bắt lỗi đồng thời, múi giờ, làm tròn. |
| Hiệu năng? | Thao tác hằng ngày dưới 20 ms ở máy chủ, dashboard 30 ngày dưới 60 ms (Bảng 5.8); chưa kiểm thử tải nhiều người dùng — đã nêu ở hạn chế. |
| Dữ liệu demo là thật? | Không, là dữ liệu mẫu 6 tháng do script sinh ra (500 bệnh nhân), đánh dấu "Dữ liệu mẫu (demo)", có quy tắc cho hợp chuyên môn (dịch vụ trẻ em chỉ cho trẻ, răng khớp dịch vụ…). |
| Còn thiếu gì? | Phim X-quang/DICOM, kiểm thử tải, thử nghiệm tại phòng khám thật, nhiều chi nhánh, liên thông đơn thuốc điện tử. |

Trả lời theo khuôn: **một câu kết luận → một chi tiết kỹ thuật → chỗ trong báo cáo** (Bảng/Hình). Không biết thì nói thật: "em chưa thử trường hợp đó, theo thiết kế thì…".

## 7. Lỗi tìm ra khi tập dượt (25/11/2026) và đã sửa

| Phát hiện | Mức độ khi demo | Đã sửa |
|---|---|---|
| Duyệt yêu cầu đặt lịch: thông báo hiện mã thô `uiScheduling.bookingActionConfirmed` | Rất dễ thấy | Thêm 6 câu vi/en |
| Bệnh nhân người lớn có "Điều trị tủy răng sữa" trên răng 36; trẻ em có implant | Hội đồng nha khoa bắt lỗi ngay | Quy tắc tuổi/dịch vụ/răng trong `demo-teeth.ts`; sửa dữ liệu đã nạp bằng `scripts/demo-teeth-vps.sh` |
| Lý do khám, chẩn đoán, điều trị không khớp nhau ("Mất răng → Mòn cổ răng → Cắt lợi trùm") | Dễ thấy ở trang lịch sử | Lý do khám và chẩn đoán theo dịch vụ chính |
| Dữ liệu mẫu kê Amoxicillin cho người dị ứng Penicillin | Mâu thuẫn với chính điểm nhấn của demo | Không kê nhóm Penicillin cho người dị ứng; script sửa đổi sang Clindamycin |
| Trang tra cứu lịch sử: "3 lần/ngày, 5" | Nhỏ | Hiện "5 ngày" |
| AI dự phòng không điền "Lý do khám" → không đóng được phiên | Làm kẹt demo | Không sửa (đúng quy tắc); kịch bản ghi rõ thao tác thêm lý do khám |
| Form hẹn tiếp mặc định hôm nay 09:00 | Báo "Giờ bắt đầu đã qua" | Không sửa; kịch bản ghi rõ đổi ngày |

## 8. Lịch tập dượt

| Lượt | Khi nào | Cách | Đạt khi |
|---|---|---|---|
| 1 | Sau khi deploy | Làm từng bước theo tài liệu, không bấm giờ | Không bước nào kẹt |
| 2 | Hôm trước | Bấm giờ, nói thành tiếng, có người nghe đặt câu hỏi ở mục 6 | ≤ 14 phút |
| 3 | Sáng hôm bảo vệ | Chạy nhanh ①–④ với một bệnh nhân khác để kiểm tra hệ thống, rồi **không** làm gì thêm trên dữ liệu của anh Sơn | Mọi thứ chạy |

Sau mỗi lượt dùng bệnh nhân demo: lượt sau cần **giờ hẹn mới** và hóa đơn mới; lịch sử của anh Sơn có thêm một lần khám (không sao, còn làm phần ⑤ đẹp hơn).

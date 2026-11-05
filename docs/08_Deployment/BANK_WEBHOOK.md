# Tự ghi nhận chuyển khoản (SePay webhook)

Khách quét mã VietQR trên hóa đơn (xem [VIETQR.md](VIETQR.md)) và chuyển tiền. Ngân hàng báo cho dịch vụ **SePay**, SePay gọi vào hệ thống, và hóa đơn tự chuyển sang **Đã thanh toán**: lễ tân không phải bấm Thu tiền. Trang hóa đơn đang mở cập nhật sau vài giây.

Hệ thống chỉ tự ghi khi chắc chắn. Mọi trường hợp còn lại vào danh sách **Chuyển khoản cần xử lý** để lễ tân xử lý bằng tay.

## Cách hệ thống quyết định

| Tình huống | Kết quả |
|---|---|
| Nội dung có mã hóa đơn (`INV2026000003`, bỏ qua dấu cách và gạch), hóa đơn còn nợ, số tiền không lớn hơn số nợ | **Tự ghi** phiếu thu Chuyển khoản (thanh toán một phần cũng được) |
| Nội dung không có mã hóa đơn | Chờ xử lý: *Nội dung không có mã hóa đơn* |
| Có mã nhưng không có hóa đơn đó | Chờ xử lý: *Không có hóa đơn mang mã này* |
| Hóa đơn đã thanh toán, nháp hoặc đã hủy | Chờ xử lý: *Hóa đơn không còn nợ* |
| Số tiền lớn hơn số còn nợ | Chờ xử lý: *Số tiền lớn hơn số còn nợ* (không ghi một phần, để người xử lý quyết định hoàn tiền) |
| Gửi lặp cùng một giao dịch | Bỏ qua, không ghi lần hai (theo mã giao dịch của SePay) |
| Tiền chuyển ra, hoặc vào tài khoản khác | Bỏ qua |

Quá trình có nhật ký: `BANK_TRANSFER_RECORDED`, `BANK_TRANSFER_FLAGGED`, `BANK_TRANSFER_RESOLVED`. Số giao dịch chờ xử lý hiện trên chuông thông báo.

## Cài đặt

### 1. Tài khoản ghi nhận
Phiếu thu cần ghi dưới một người dùng. Tạo (hoặc chọn) một tài khoản riêng, ví dụ tên **Ngân hàng**, vai trò lễ tân, rồi dùng email của nó. Phiếu thu sẽ hiện "Nhận bởi Ngân hàng" và ghi chú "Tự ghi từ ngân hàng".

### 2. Khóa bí mật
Tạo một chuỗi ngẫu nhiên dài (không dùng lại mật khẩu khác):
```sh
openssl rand -hex 32
```

### 3. Biến môi trường
Thêm vào `/opt/dental-clinic/production/.env.production` (cùng với `VIETQR_*` đã khai):
```sh
BANK_WEBHOOK_API_KEY=<chuỗi vừa tạo>
BANK_WEBHOOK_ACTOR_EMAIL=<email tài khoản Ngân hàng>
```
Rồi deploy lại (lệnh deploy thông thường). Không đặt `BANK_WEBHOOK_API_KEY` thì địa chỉ webhook không tồn tại (trả 404).

### 4. Khai báo trên SePay
Trên https://my.sepay.vn: liên kết tài khoản ngân hàng nhận tiền, rồi tạo webhook:

| Mục | Giá trị |
|---|---|
| Gọi đến URL | `https://gensmile.online/api/v1/webhooks/bank/sepay` (đổi tên miền theo phòng khám) |
| Kiểu chứng thực | API Key |
| API Key | đúng chuỗi `BANK_WEBHOOK_API_KEY` |
| Sự kiện | Có tiền vào |

Hướng dẫn tạo webhook của SePay: https://developer.sepay.vn/vi/sepay-webhooks/tich-hop-webhook

### 5. Thử
1. Mở một hóa đơn **Đã phát hành** còn nợ nhỏ, quét mã bằng app ngân hàng và chuyển thật số tiền nhỏ đó (hoặc dùng nút thử webhook của SePay).
2. Vài giây sau trang hóa đơn đang mở báo "Hóa đơn đã được thanh toán".
3. Nếu không thấy: xem **Chuyển khoản cần xử lý** (có thể bị giữ vì lý do ở bảng trên), rồi log backend:
   `docker compose --env-file .env.production -f docker-compose.prod.yml logs backend | grep -i "bank"`

Thử bằng `curl` từ máy chủ (không cần tiền thật; số tiền nhỏ hơn số nợ sẽ ghi thật một phiếu thu, nên chỉ thử trên hóa đơn thử):
```sh
curl -s -X POST https://gensmile.online/api/v1/webhooks/bank/sepay \
  -H "Authorization: Apikey $BANK_WEBHOOK_API_KEY" -H 'content-type: application/json' \
  -d '{"id":1,"transactionDate":"2026-11-05 09:30:00","accountNumber":"<VIETQR_ACCOUNT_NO>","transferType":"in","transferAmount":1000,"content":"NOIDUNG KHONG CO MA","referenceCode":"TEST1"}'
```
Kết quả đúng: `{"success":true,"outcome":"needs_review"}` (nội dung không có mã nên chỉ vào danh sách chờ, không ghi tiền). Sai khóa: 401.

## Ghi chú kỹ thuật
- Mã: `backend/src/billing/bank-webhook.*`, `bank-transfer.ts`. Bảng `bank_transactions` (migration 058), khóa duy nhất `(provider, external_id)`.
- Idempotency hai lớp: bảng giao dịch, và `requestKey = bank:sepay:<id giao dịch>` của phiếu thu (hai bản gửi đồng thời vẫn chỉ một phiếu).
- SePay thử lại cho tới khi nhận HTTP 2xx kèm `{"success": true}`; mọi thông báo đọc được đều nhận như vậy, dù được ghi hay chờ xử lý. Thông báo sai định dạng nhận 400.
- Muốn dùng nhà cung cấp khác (Casso, payOS…): thêm hàm đọc payload trả về `BankTransfer` và một route mới; phần quyết định giữ nguyên.

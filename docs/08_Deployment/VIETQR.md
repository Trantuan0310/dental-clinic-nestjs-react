# Mã QR chuyển khoản (VietQR) trên hóa đơn

Trang hóa đơn có thẻ **Thu bằng chuyển khoản** với mã VietQR (chuẩn NAPAS): khách quét bằng app ngân hàng, số tiền còn nợ và nội dung (mã hóa đơn) đã điền sẵn. Mã được tạo ngay trên máy chủ, không gọi dịch vụ bên ngoài và không cần khóa API.

Hệ thống **chưa tự biết khách đã chuyển**: lễ tân vẫn bấm **Thu tiền** sau khi ngân hàng báo đã nhận.

## Bật mã QR

Thêm vào `/opt/dental-clinic/production/.env.production`:

```sh
VIETQR_BANK_BIN=970436            # mã BIN 6 số của ngân hàng nhận tiền
VIETQR_ACCOUNT_NO=0011004123456   # số tài khoản
VIETQR_ACCOUNT_NAME=NHA KHOA GENSMILE   # tên chủ tài khoản (chỉ để hiện cạnh mã)
```

Tra mã BIN ở danh sách công khai https://api.vietqr.io/v2/banks (trường `bin`) hoặc hỏi ngân hàng. Số tài khoản lấy đúng tài khoản dùng để nhận tiền của phòng khám.

Sau đó deploy lại (lệnh deploy thông thường). Để trống ba biến này thì thẻ QR không hiện, hóa đơn vẫn dùng bình thường.

## Kiểm tra

1. Mở một hóa đơn **Đã phát hành** còn nợ: thấy thẻ **Thu bằng chuyển khoản**.
2. Quét thử bằng app ngân hàng: app phải hiện đúng tên chủ tài khoản, số tiền còn nợ và nội dung dạng `INV2026000003`. Chỉ cần quét, không cần chuyển.
3. Nếu app báo mã không hợp lệ: kiểm tra lại BIN và số tài khoản.

## Ghi chú kỹ thuật

- Chuỗi mã theo EMV QR + dịch vụ NAPAS 247 chuyển đến tài khoản (`A000000727`, `QRIBFTTA`), kèm CRC-16/CCITT. Xem `backend/src/billing/vietqr.ts`.
- Nội dung chuyển khoản là mã hóa đơn bỏ ký tự đặc biệt (tối đa 19 ký tự), để sao kê ngân hàng đối chiếu được với hóa đơn.
- API: `GET /billing/invoices/:id/payment-qr` (quyền đọc hóa đơn, bác sĩ chỉ thấy hóa đơn của mình). Hóa đơn nháp, đã thanh toán hoặc đã hủy không có mã.
- Hướng phát triển: nhận thông báo giao dịch từ ngân hàng để tự đánh dấu đã thu.

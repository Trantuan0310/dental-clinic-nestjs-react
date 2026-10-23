# Bật nhắn tin SMS / Zalo

Phần 4.4 của `docs/progress/plan-2026-10-22.md`. Hệ thống gửi tin nhắc lịch khám (mỗi giờ, cho lịch trong 24 giờ tới) và nhắc tái khám (mỗi sáng 09:15) qua điện thoại. Mỗi tin chỉ gửi một lần. Zalo được thử trước, lỗi thì chuyển sang SMS. Nhật ký mọi tin xem ở **Quản trị → Tin nhắn SMS / Zalo** (quyền `message_log.read`, chỉ admin).

Mặc định cả hai kênh **tắt**: chưa có nhà cung cấp thì không có gì thay đổi.

## 1. Thử trước bằng chế độ giả lập

Trong `/opt/dental-clinic/production/.env.production`:

```
SMS_PROVIDER=mock
```

Khởi động lại backend:

```
docker compose --env-file .env.production -f docker-compose.prod.yml up -d backend
```

Tin chỉ được ghi vào nhật ký (trạng thái "Giả lập"), không gửi đi. Dùng nút **Gửi tin thử** trên trang Tin nhắn để xem.

## 2. SMS qua eSMS.vn

1. Đăng ký tài khoản eSMS.vn, đăng ký **brandname** (tên hiển thị, ví dụ `NHAKHOA`) và các mẫu nội dung chăm sóc khách hàng. Nhà mạng duyệt mẫu; nội dung gửi đi là tiếng Việt không dấu.
2. Lấy **ApiKey** và **SecretKey** trong trang quản lý eSMS.
3. Điền:

```
SMS_PROVIDER=esms
ESMS_API_KEY=...
ESMS_SECRET_KEY=...
ESMS_BRANDNAME=NHAKHOA
```

Mẫu tin hệ thống gửi (cần đăng ký với eSMS cho khớp):
- Nhắc lịch: `<Tên phòng khám> nhac lich kham luc <giờ ngày> voi <bác sĩ>. Can doi lich xin goi <SĐT phòng khám>.`
- Nhắc tái khám: `<Tên phòng khám>: da den lich tai kham dinh ky (<dịch vụ>). Dat lich xin goi <SĐT phòng khám>.`

## 3. Zalo ZNS

1. Có **Zalo Official Account** (OA) đã xác thực, liên kết ứng dụng trên developers.zalo.me, bật ZNS và nạp tiền.
2. Tạo 2 mẫu ZNS, chờ Zalo duyệt. Tham số mẫu:
   - Nhắc lịch: `customer_name`, `appointment_time`, `dentist_name`, `clinic_phone`.
   - Nhắc tái khám: `customer_name`, `service_name`, `clinic_phone`.
3. Lấy **access token** của OA và mã 2 mẫu, điền:

```
ZALO_PROVIDER=zns
ZALO_OA_ACCESS_TOKEN=...
ZALO_ZNS_TEMPLATE_VISIT_REMINDER=<mã mẫu nhắc lịch>
ZALO_ZNS_TEMPLATE_RECALL_REMINDER=<mã mẫu nhắc tái khám>
```

Access token của Zalo hết hạn: khi tin Zalo báo lỗi token trong nhật ký, lấy token mới và cập nhật biến này. Trong lúc đó tin tự chuyển sang SMS nếu SMS đang bật.

## 4. Tắt từng loại nhắc

```
MESSAGING_VISIT_REMINDERS=false   # không nhắn nhắc lịch khám
MESSAGING_RECALL_REMINDERS=false  # không nhắn nhắc tái khám
```

Không gửi tin từ 21:00 đến 07:00; lần chạy sau sẽ gửi bù. Bệnh nhân đã từ chối nhận nhắc tái khám (link trong email hoặc lễ tân ghi) thì không nhận tin nhắc tái khám.

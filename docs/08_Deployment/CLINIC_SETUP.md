# Cấu hình ban đầu phòng khám (trước khi mở cửa)

Script `backend/prisma/clinic-setup.ts` nạp sẵn dữ liệu cấu hình để phòng khám dùng được ngay, không phải nhập tay từng mục. Script **chỉ thêm những gì còn thiếu**:

- Dịch vụ, vật tư, loại chi phí đã có (theo mã hoặc tên) được giữ nguyên, kể cả giá bạn đã sửa.
- Bác sĩ đã có lịch làm hoặc đã có phân công dịch vụ không bị đụng tới.
- Chạy lại nhiều lần không tạo trùng.
- Không tạo bệnh nhân, lịch hẹn hay hóa đơn giả.

## Những gì được nạp

| Nhóm | Nội dung |
|---|---|
| Dịch vụ | 10 nhóm, 55 dịch vụ: khám, X-quang, dự phòng, trám, nội nha, tiểu phẫu, phục hình, Implant, chỉnh nha, thẩm mỹ, nha khoa trẻ em. Mỗi dịch vụ có thời lượng, thời gian chuẩn bị/dọn dẹp và giá tham khảo mức trung bình thành phố lớn. Dịch vụ chuyên sâu (nội nha, Implant, chỉnh nha…) gắn với chuyên môn tương ứng. |
| Phân công | Mỗi bác sĩ **chưa có phân công** được gán mọi dịch vụ thông thường, cộng các dịch vụ thuộc chuyên môn của mình. |
| Lịch làm việc | Thứ Hai–Thứ Bảy, 08:00–12:00 và 13:30–19:00, khe 15 phút. Chủ nhật nghỉ. Chỉ áp cho bác sĩ **chưa có lịch**; `RESET_SCHEDULES=1` thay lịch cũ bằng lịch này. |
| Kho | 9 nhóm, 50 vật tư/thuốc thường dùng, có đơn vị, mức tồn tối thiểu và giá nhập tham khảo. **Tồn kho ban đầu = 0**; nhập kho lần đầu trên màn Kho. |
| Chi phí | 18 loại: mặt bằng, điện nước, lương, BHXH, vật tư, labo, marketing, bảo trì thiết bị… |
| Tài khoản | Theo file danh sách nhân viên (xem bên dưới). Với bác sĩ, script tạo luôn hồ sơ nhân viên, hồ sơ bác sĩ, chuyên môn, màu lịch và bật "Nhận đặt lịch online". |

Sửa danh sách dịch vụ hoặc giá cho lần chạy sau: sửa `backend/prisma/clinic-setup/catalog.ts` và `supplies.ts`. Giá của dịch vụ **đã có** thì sửa trên giao diện (Dịch vụ, Kho).

## Chạy trên VPS

1. Tạo file danh sách nhân viên từ file mẫu, rồi sửa tên, email và số điện thoại cho đúng người thật:

   ```sh
   cd /opt/dental-clinic/production
   cp backend/prisma/clinic-setup/staff.example.json /opt/dental-clinic/staff.json
   nano /opt/dental-clinic/staff.json
   ```

   - `role`: `dentist`, `receptionist` hoặc `clinic_admin`.
   - `specialties` (chỉ bác sĩ): `TONG_QUAT`, `NHA_CHU`, `NOI_NHA`, `CHINH_NHA`, `NHO_RANG`, `PHUC_HINH`, `IMPLANT`, `NHA_TRE_EM`, `THAM_MY`.
   - Dòng nào còn email `@example.com` sẽ bị **bỏ qua**. Xóa dòng thừa, thêm dòng nếu có thêm người.
   - Email đã có tài khoản thì script giữ nguyên, không tạo lại.

2. Chạy:

   ```sh
   bash scripts/clinic-setup-vps.sh /opt/dental-clinic/staff.json
   # thay lịch làm cũ của các bác sĩ bằng lịch chuẩn:
   # RESET_SCHEDULES=1 bash scripts/clinic-setup-vps.sh /opt/dental-clinic/staff.json
   ```

   Không có file nhân viên thì bỏ tham số; khi đó script chỉ nạp danh mục và cấu hình cho các bác sĩ đang có.

3. Cuối output là bảng **mật khẩu tạm** của các tài khoản mới. Bảng này **chỉ hiện một lần**: gửi riêng cho từng người và yêu cầu họ đổi mật khẩu ngay sau lần đăng nhập đầu. Nếu ai làm mất mật khẩu tạm, cấp lại bằng `RESET_PASSWORDS=email1,email2 bash scripts/clinic-setup-vps.sh`. Lệnh này in mật khẩu tạm mới và đăng xuất các phiên đang mở của những tài khoản đó.

4. Xóa file `staff.json` sau khi chạy xong nếu không cần giữ, vì file chứa thông tin cá nhân.

## Kiểm tra sau khi chạy

- **Dịch vụ:** đủ nhóm và giá; chỉnh giá cho đúng bảng giá phòng khám.
- **Bác sĩ:** mỗi người có chuyên môn, màu lịch, "Nhận đặt lịch online" và danh sách dịch vụ.
- **Lịch làm việc:** T2–T7 có hai ca, Chủ nhật nghỉ.
- **Trang `/booking`:** hiện dịch vụ và bác sĩ nhận đặt online.
- **Kho:** nhập kho lần đầu cho các vật tư đang có.

Script không đặt lương hay hoa hồng bác sĩ (Lương → Cấu hình thù lao), vì đó là thỏa thuận riêng với từng người.

## Trang chủ cho khách (landing page)

`https://<domain>/` hiện trang giới thiệu phòng khám cho khách chưa đăng nhập. Nhân viên đã đăng nhập vẫn vào thẳng Dashboard; nếu phiên hết hạn khi đang mở app thì về màn đăng nhập như trước. Link "Nhân viên đăng nhập" nằm ở chân trang.

**Dữ liệu tự động từ hệ thống:**

- **Dịch vụ & bảng giá:** chỉ hiện dịch vụ đang bật và có ít nhất một bác sĩ **nhận đặt lịch online** được phân công, với đúng giá trên màn Dịch vụ. Nút "Đặt" mở `/booking` với dịch vụ đã chọn sẵn.
- **Đội ngũ bác sĩ:** các bác sĩ đó, kèm chuyên môn.

Sửa giá, dịch vụ hay phân công trên giao diện thì trang chủ cập nhật ngay, không cần build lại.

**Thông tin liên hệ:** đặt trong `.env.production`. Để trống dòng nào thì mục đó bị ẩn.

```sh
CLINIC_NAME="Nha khoa GENSMILE"
CLINIC_TAGLINE="Nha khoa thẩm mỹ"
CLINIC_PHONE="0901 234 567"                       # nút Gọi, nút gọi nổi trên điện thoại
CLINIC_ZALO="0901234567"                           # số Zalo hoặc link https://zalo.me/...
CLINIC_EMAIL="lienhe@gensmile.online"
CLINIC_ADDRESS="12 Nguyễn Trãi, Quận 1, TP.HCM"    # có địa chỉ thì hiện bản đồ Google
CLINIC_MAP_URL="https://maps.app.goo.gl/..."       # tùy chọn: link Google Maps chính xác
CLINIC_FACEBOOK_URL="https://facebook.com/..."
CLINIC_HOURS="08:00 – 12:00 · 13:30 – 19:00"       # giờ Thứ Hai – Thứ Bảy
CLINIC_SUNDAY_HOURS="Nghỉ"
```

Các giá trị này được đóng vào bản build web. Sửa xong phải build lại web:

```sh
docker compose --env-file .env.production -f docker-compose.prod.yml up -d --build web
```

`scripts/deploy-vps.sh` cũng build lại web mỗi lần deploy.

## Báo lễ tân khi có yêu cầu đặt lịch online

- **Trong app:** mục **Yêu cầu đặt lịch** trên menu hiện số yêu cầu đang chờ lễ tân xử lý: yêu cầu mới, hoặc khách đã đồng ý giờ phòng khám đề xuất. Số này tự cập nhật mỗi phút.
  - Khi có yêu cầu mới, app hiện thông báo nổi và tiêu đề tab trình duyệt có dạng `(2) …`.
  - Danh sách yêu cầu cũng tự làm mới mỗi phút.
- **Qua email:** mỗi khi khách đặt lịch, đồng ý giờ mới hoặc bổ sung thông tin, hệ thống gửi email tới các địa chỉ trong `BOOKING_NOTIFY_EMAILS`. Email ghi tên khách, số điện thoại, dịch vụ, bác sĩ, giờ và lý do khám.

```sh
# .env.production (cần SMTP đã cấu hình); nhiều địa chỉ thì ngăn cách bằng dấu phẩy
BOOKING_NOTIFY_EMAILS=letan@example.com,quanly@example.com
```

Để trống thì không gửi email; số đếm trên menu vẫn hoạt động. Sửa xong chạy lại backend:

```sh
docker compose --env-file .env.production -f docker-compose.prod.yml up -d backend
```

# PHỤ LỤC

## Phụ lục A. Hướng dẫn cài đặt và triển khai

### A.1. Chạy trên máy phát triển

Yêu cầu: Node.js 22 trở lên, npm, Docker (để chạy PostgreSQL). Các bước:

```bash
git clone https://github.com/Trantuan0310/dental-clinic-nestjs-react.git
cd dental-clinic-nestjs-react/backend
cp .env.example .env          # đặt JWT_SECRET; khóa AI có thể để trống
npm install
npm run db:up                 # PostgreSQL 16 trong Docker
npx prisma migrate deploy     # tạo toàn bộ bảng
npm run prisma:seed           # tài khoản quản trị và dữ liệu nền
npm run start:dev             # máy chủ API tại cổng 3000

cd ../frontend                # ở một cửa sổ dòng lệnh khác
npm install
npm run dev                   # giao diện tại http://localhost:5173
```

Khi chưa cấu hình dịch vụ AI, trợ lý AI chạy ở chế độ dự phòng; khi chưa cấu hình SMS, Zalo, tin nhắn được ghi ra nhật ký thay vì gửi thật.

### A.2. Triển khai lên máy chủ ảo

Môi trường thật dùng tệp `docker-compose.prod.yml`, gồm PostgreSQL, container chạy migration, máy chủ API và Nginx phục vụ giao diện. Lần đầu:

```bash
cp .env.production.example .env.production   # điền tên miền, khóa bí mật, thông tin phòng khám
docker compose --env-file .env.production -f docker-compose.prod.yml build
docker compose --env-file .env.production -f docker-compose.prod.yml run --rm migrate
docker compose --env-file .env.production -f docker-compose.prod.yml \
  --profile bootstrap run --rm bootstrap      # tạo tài khoản quản trị đầu tiên
docker compose --env-file .env.production -f docker-compose.prod.yml up -d backend web
```

Các lần cập nhật sau chỉ cần chạy `bash scripts/deploy-vps.sh`: script sao lưu cơ sở dữ liệu, đóng gói lại, chạy migration, khởi động lại và kiểm tra phiên bản đang chạy.

### A.3. Các nhóm biến môi trường

Bảng A.1 liệt kê các nhóm biến môi trường cần khai báo khi triển khai.

::: {custom-style="bảng"}
Bảng A.1. Các nhóm biến môi trường của bản triển khai
:::

| Nhóm | Biến | Ý nghĩa |
|---|---|---|
| Hệ thống | `DOMAIN`, `TLS_CERT_DIR` | Tên miền và chứng chỉ HTTPS |
| Cơ sở dữ liệu | `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD` | Kết nối PostgreSQL |
| Xác thực | `JWT_SECRET` | Khóa ký mã truy cập |
| Email | `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `EMAIL_FROM` | Máy chủ gửi thư |
| Đặt lịch | `BOOKING_MIN_LEAD_MIN`, `BOOKING_MAX_DAYS_AHEAD`, `SLOT_STEP_MIN` | Quy tắc đặt lịch trực tuyến |
| Nhắn tin | `SMS_PROVIDER`, `ZALO_PROVIDER` và khóa tương ứng | Kênh SMS, Zalo ZNS |
| AI | `AI_BASE_URL`, `AI_API_KEY`, `AI_MODEL` | Dịch vụ mô hình ngôn ngữ; để trống để dùng chế độ dự phòng |
| Thanh toán | `VIETQR_BANK_BIN`, `VIETQR_ACCOUNT_NO`, `BANK_WEBHOOK_API_KEY` | Mã VietQR và webhook ngân hàng |
| Phòng khám | `CLINIC_NAME`, `CLINIC_PHONE`, `CLINIC_ADDRESS`, `CLINIC_HOURS`… | Thông tin hiển thị trên trang công khai |

::: {custom-style="nguồn"}
Nguồn: Tác giả
:::

Giá trị các khóa bí mật chỉ nằm trong tệp `.env.production` trên máy chủ, không đưa vào kho mã nguồn.

## Phụ lục B. Danh sách API tiêu biểu

Toàn bộ 339 API được mô tả tự động bằng OpenAPI tại đường dẫn `/api/docs` của máy chủ. Bảng B.1 liệt kê các API tiêu biểu của các luồng nghiệp vụ chính; mọi đường dẫn có tiền tố `/api/v1`.

::: {custom-style="bảng"}
Bảng B.1. Các API tiêu biểu
:::

| Phương thức | Đường dẫn | Chức năng |
|---|---|---|
| POST | `/auth/login` | Đăng nhập, trả mã truy cập và đặt cookie làm mới |
| POST | `/auth/refresh` | Cấp mã truy cập mới, xoay vòng mã làm mới |
| GET | `/public/booking/slots` | Khung giờ còn trống cho khách đặt lịch |
| POST | `/public/booking/requests` | Khách gửi yêu cầu đặt lịch |
| POST | `/booking-requests/:id/confirm` | Lễ tân duyệt yêu cầu đặt lịch |
| POST | `/public/appointment-links/:token/confirm` | Khách xác nhận lịch từ đường dẫn trong tin nhắc |
| GET | `/appointments/availability` | Giờ trống của bác sĩ |
| POST | `/appointments` | Tạo lịch hẹn (có khóa chống trùng) |
| POST | `/appointments/:id/check-in` | Ghi nhận khách đến |
| GET | `/appointments/waiting-queue` | Hàng chờ |
| POST | `/encounters/start` | Bắt đầu phiên khám |
| PUT | `/encounters/:id/clinical-note` | Lưu ghi chú lâm sàng |
| POST | `/encounters/:id/treatments` | Thêm điều trị |
| POST | `/encounters/:id/dental-chart/snapshot` | Lưu sơ đồ răng |
| GET | `/patients/:id/teeth/:fdi/history` | Lịch sử điều trị một răng |
| POST | `/encounters/:id/close` | Đóng phiên khám |
| POST | `/invoices/:id/issue` | Phát hành hóa đơn |
| GET | `/invoices/:id/payment-qr` | Dữ liệu mã VietQR của hóa đơn |
| POST | `/invoices/:id/payments` | Ghi nhận thanh toán |
| POST | `/webhooks/bank/sepay` | Ngân hàng báo giao dịch chuyển khoản |
| POST | `/patients/:id/history-link` | Gửi đường dẫn tra cứu lịch sử cho bệnh nhân |
| POST | `/public/patient-history/request` | Bệnh nhân xin đường dẫn bằng số điện thoại |
| GET | `/public/patient-history/:token` | Xem lịch sử khám qua đường dẫn |
| GET | `/billing/reports/dashboard-kpis` | Chỉ số bảng điều khiển |
| POST | `/ai/assistant/chat` | Hỏi trợ lý AI |

::: {custom-style="nguồn"}
Nguồn: Tác giả
:::

## Phụ lục C. Danh sách kịch bản kiểm thử đầu cuối

Các kịch bản kiểm thử đầu cuối được nhóm theo chức năng ở Bảng C.1.

::: {custom-style="bảng"}
Bảng C.1. Các nhóm kịch bản kiểm thử đầu cuối
:::

| Nhóm | Tệp kịch bản | Nội dung chính |
|---|---|---|
| Đăng nhập, tài khoản | `login`, `my-account`, `i18n`, `a11y`, `shell`, `permissions`, `role-permissions` | Đăng nhập, đổi mật khẩu, đổi ngôn ngữ, điều hướng bằng bàn phím, menu và quyền theo vai trò |
| Trang công khai | `landing`, `site-media`, `public-booking`, `patient-appointment-links`, `patient-history` | Trang chủ, ảnh trang giới thiệu, đặt lịch trực tuyến, xác nhận và dời lịch qua đường dẫn, tra cứu lịch sử |
| Lịch hẹn, tiếp nhận | `appointment-booking`, `appointment-booking-roles`, `appointment-services`, `booking-clinic-time`, `dispatch`, `chair-board`, `follow-up-dates`, `waitlist`, `transfer-confirmation`, `schedule-exceptions` | Đặt lịch theo vai trò, dịch vụ, giờ phòng khám, điều phối, bảng ghế, danh sách chờ, lịch ngoại lệ |
| Bệnh nhân | `patient-create`, `patient-funnel`, `patient-intake`, `previsit-roles` | Tạo hồ sơ, hành trình bệnh nhân, phiếu khai trước khi khám |
| Khám, điều trị | `dentist-view`, `flow-treatment-plan`, `pending-treatments`, `plan-contacts`, `ai-assist` | Màn hình bác sĩ, kế hoạch điều trị, điều trị chờ đặt lịch, AI soạn nháp |
| Thanh toán | `invoice-payment`, `billing-reconciliation`, `bank-transactions`, `flow-patient-to-payment` | Hóa đơn, thanh toán, đối soát, chuyển khoản cần xử lý, luồng trọn vẹn |
| Nhân sự, kho, chi phí | `flow-payroll-period-cycle`, `flow-shift-registration`, `flow-inventory-stock-out`, `flow-expense-approval`, `inventory-movements`, `reorder`, `staff`, `staff-dentist-self`, `shift-coverage`, `schedule-time-off-request`, `services` | Kỳ lương, đăng ký ca, nghỉ phép, phủ ca, nhân viên, xuất kho, gợi ý nhập, chi phí, danh mục dịch vụ |
| Quản lý | `dashboard`, `dashboard-finance`, `ai-assistant`, `assistant-changes` | Bảng điều khiển, trợ lý AI và thẻ xác nhận thay đổi |
| Ổn định | `critical-paths`, `full-workflow`, `error-states`, `ui-demo-regressions` | Các đường đi quan trọng, trạng thái lỗi, hồi quy giao diện |

::: {custom-style="nguồn"}
Nguồn: Tác giả
:::

# PHỤ LỤC

## Phụ lục A. Hướng dẫn cài đặt và triển khai

### A.1. Chạy trên máy phát triển

Yêu cầu: Node.js 20 trở lên (khuyến nghị 22), npm, Docker (để chạy PostgreSQL). Các bước:

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

Các lần cập nhật sau chỉ cần chạy `bash scripts/deploy-vps.sh`: script kiểm tra điều kiện, sao lưu cơ sở dữ liệu (pg_dump), lấy mã mới, đóng gói lại, chạy migration, khởi động lại máy chủ API và giao diện, rồi chờ máy chủ báo hoạt động bình thường; script dừng ngay ở bước đầu tiên bị lỗi.

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
| Thanh toán | `VIETQR_BANK_BIN`, `VIETQR_ACCOUNT_NO`, `BANK_WEBHOOK_API_KEY`, `BANK_WEBHOOK_ACTOR_EMAIL` | Mã VietQR, webhook ngân hàng và tài khoản đứng tên các khoản tự ghi |
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
| POST | `/medical-records/encounters/start` | Bắt đầu phiên khám |
| PUT | `/medical-records/encounters/:id/clinical-note` | Lưu ghi chú lâm sàng |
| POST | `/medical-records/encounters/:id/treatments` | Thêm điều trị |
| POST | `/medical-records/encounters/:id/dental-chart/snapshot` | Lưu sơ đồ răng |
| GET | `/patients/:id/teeth/:fdi/history` | Lịch sử điều trị một răng |
| POST | `/medical-records/encounters/:id/close` | Đóng phiên khám |
| POST | `/billing/invoices/:id/issue` | Phát hành hóa đơn |
| GET | `/billing/invoices/:id/payment-qr` | Dữ liệu mã VietQR của hóa đơn |
| POST | `/billing/invoices/:id/payments` | Ghi nhận thanh toán |
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

## Phụ lục D. Ma trận truy vết yêu cầu

Bảng D.1 nối mỗi yêu cầu chức năng ở Mục 2.3 với phần thiết kế (Chương 3), giao diện đã hiện thực (Chương 4) và cách kiểm thử (Chương 5). Mã KT-… là các ca kiểm thử ở Bảng 5.2 đến Bảng 5.5; "E2E: tên" là tệp kịch bản kiểm thử đầu cuối ở Bảng C.1; "Đơn vị" là kiểm thử đơn vị của module tương ứng (Bảng 5.6).

::: {custom-style="bảng"}
Bảng D.1. Ma trận truy vết yêu cầu – thiết kế – giao diện – kiểm thử
:::

| Yêu cầu | Thiết kế | Giao diện | Kiểm thử |
|---|---|---|---|
| BN-01 Tạo, sửa hồ sơ | Hình 3.29 | Hình 4.10 | KT-BM-08; E2E: patient-create |
| BN-02 Tìm kiếm, gợi ý trùng | Hình 3.29 | Hình 4.10 | Đơn vị (patients) |
| BN-03 Gộp hồ sơ, xóa mềm | Hình 3.29 | Hình 4.11 | Đơn vị (patients) |
| BN-04 Xem hồ sơ trên một màn hình | – | Hình 4.10 | E2E: patient-funnel |
| BN-05 Đường dẫn tra cứu lịch sử | Hình 3.23 | Hình 4.25, Hình 4.26 | KT-BM-09, KT-BM-10, KT-BM-11 |
| LH-01 Đặt lịch không trùng | Bảng 3.2, Hình 3.9 | Hình 4.6 | KT-LH-01 đến KT-LH-04 |
| LH-02 Xem lịch theo ngày, tuần | – | Hình 4.6 | KT-LH-06 |
| LH-03 Dời, hủy, vắng mặt | Hình 3.8 | Hình 4.6 | KT-LH-02 |
| LH-04 Đặt lịch trực tuyến | Hình 3.12 | Hình 4.2, Hình 4.7 | KT-LH-07 |
| LH-05 Nhắc lịch, xác nhận qua liên kết | Hình 3.21 | Hình 4.3 | KT-LH-08 |
| LH-06 Check-in, hàng chờ | Hình 3.10 | Hình 4.4, Hình 4.5, Hình 4.12 | KT-LH-05, KT-LH-09 |
| LH-07 Danh sách chờ | Hình 3.11 | Hình 4.9 | E2E: waitlist |
| LH-08 Nhắc tái khám | Hình 3.22 | Hình 4.8 | Đơn vị (recalls) |
| KB-01 Mở phiên khám | Hình 3.13, Hình 3.14 | Hình 4.12 | KT-KB-01 |
| KB-02 Ghi chú lâm sàng | Hình 3.13 | Hình 4.13 | KT-KB-04, KT-KB-09 |
| KB-03 Sơ đồ răng | Hình 3.13 | Hình 4.14, Hình 4.16 | E2E: dentist-view |
| KB-04 Lịch sử theo răng | Hình 3.15 | Hình 4.14, Hình 4.15 | KT-KB-07, KT-KB-08; Đơn vị |
| KB-05 Ghi điều trị | Bảng 3.3, Hình 3.15 | Hình 4.15 | Đơn vị (medical-records) |
| KB-06 Kê đơn, cảnh báo dị ứng | Hình 3.13 | Hình 4.17 | Đơn vị (medical-records) |
| KB-07 Đóng phiên khám | Hình 3.16 | Hình 4.18 | KT-KB-02, KT-KB-03, KT-KB-05, KT-KB-06 |
| KB-08 Kế hoạch điều trị | Hình 3.17 | Hình 4.19, Hình 4.20 | E2E: flow-treatment-plan |
| TT-01 Lập, phát hành hóa đơn | Hình 3.18 | Hình 4.21 | KT-TT-01, KT-TT-05, KT-TT-06 |
| TT-02 Thanh toán nhiều lần | Hình 3.18 | Hình 4.22 | KT-TT-02, KT-TT-03, KT-TT-04 |
| TT-03 VietQR, tự đối soát | Bảng 3.4, Hình 3.19, Hình 3.20 | Hình 4.21 đến Hình 4.23 | KT-TT-07, KT-TT-08 |
| TT-04 Hoàn tiền, hủy hóa đơn | Hình 3.18, Hình 3.37 | Hình 4.24 | Đơn vị (billing) |
| NS-01 Nhân viên, bác sĩ, dịch vụ | Hình 3.31 | Hình 4.29, Hình 4.32 | E2E: staff, services |
| NS-02 Lịch làm việc, đăng ký ca | Hình 3.25 | Hình 4.28, Hình 4.30 | E2E: flow-shift-registration |
| NS-03 Tính lương theo kỳ | Hình 3.24 | Hình 4.31 | E2E: flow-payroll-period-cycle |
| KH-01 Nhập, xuất, kiểm kê kho | Hình 3.26 | Hình 4.27 | KT-KB-05, KT-KB-06 |
| KH-02 Cảnh báo, gợi ý nhập | Hình 3.26 | Hình 4.27 | E2E: reorder |
| BC-01 Bảng điều khiển, chỉ số | Bảng 3.5, Hình 3.27 | Hình 4.34, Hình 4.35 | E2E: dashboard |
| BC-02 Báo cáo doanh thu, công suất | Hình 3.27 | Hình 4.36, Hình 4.37 | E2E: dashboard-finance |
| AI-01 Trợ lý AI có kiểm soát | Bảng 3.6, Hình 3.28 | Hình 4.43 | E2E: ai-assist, ai-assistant |
| QT-01 Vai trò, quyền, nhật ký, cấu hình | Hình 3.36, Hình 3.37, Hình 3.34 | Hình 4.38 đến Hình 4.41 | KT-BM-06, KT-BM-07 |

::: {custom-style="nguồn"}
Nguồn: Tác giả
:::

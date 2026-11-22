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

Khi chưa cấu hình dịch vụ AI, trợ lý AI chạy ở chế độ dự phòng; khi chưa cấu hình SMS, tin nhắn được ghi ra nhật ký thay vì gửi thật.

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

Các khóa bí mật (khóa ký JWT, mật khẩu cơ sở dữ liệu, khóa dịch vụ AI, khóa webhook ngân hàng) chỉ nằm trong tệp `.env.production` trên máy chủ, không đưa vào kho mã nguồn. Danh sách đầy đủ các biến môi trường có trong tệp mẫu `.env.production.example`; tài liệu API được sinh tự động bằng OpenAPI tại đường dẫn `/api/docs` của máy chủ.

## Phụ lục B. Ma trận truy vết yêu cầu

Bảng B.1 nối mỗi yêu cầu chức năng ở Mục 2.3 với phần thiết kế (Chương 3), giao diện đã hiện thực (Chương 4) và cách kiểm thử (Chương 5). Mã KT-… là các ca kiểm thử ở Bảng 5.2 đến Bảng 5.5; "E2E: tên" là tệp kịch bản kiểm thử đầu cuối tương ứng trong thư mục `frontend/e2e/`; "Đơn vị" là kiểm thử đơn vị của module tương ứng (Bảng 5.6).

::: {custom-style="bảng"}
Bảng B.1. Ma trận truy vết yêu cầu – thiết kế – giao diện – kiểm thử
:::

| Yêu cầu | Thiết kế | Giao diện | Kiểm thử |
|---|---|---|---|
| BN-01 Tạo, sửa hồ sơ | Mục 3.3.12 | Hình 4.5 | KT-BM-08; E2E: patient-create |
| BN-02 Tìm kiếm, gợi ý trùng | Mục 3.3.12 | Hình 4.5 | Đơn vị (patients) |
| BN-03 Gộp hồ sơ, xóa mềm | Mục 3.3.12 | – | Đơn vị (patients) |
| BN-04 Xem hồ sơ trên một màn hình | Mục 3.3.12 | Hình 4.5 | E2E: patient-funnel |
| BN-05 Đường dẫn tra cứu lịch sử | Hình 3.15 | Hình 4.10 | KT-BM-09, KT-BM-10, KT-BM-11 |
| LH-01 Đặt lịch không trùng | Bảng 3.2, Hình 3.7 | Hình 4.4 | KT-LH-01 đến KT-LH-04 |
| LH-02 Xem lịch theo ngày, tuần | Mục 3.3.1 | Hình 4.4 | KT-LH-06 |
| LH-03 Dời, hủy, vắng mặt | Hình 3.6 | Hình 4.4 | KT-LH-02 |
| LH-04 Đặt lịch trực tuyến | Hình 3.9 | Hình 4.2 | KT-LH-07 |
| LH-05 Nhắc lịch, xác nhận qua liên kết | Hình 3.14 | – | KT-LH-08 |
| LH-06 Check-in, hàng chờ | Hình 3.8 | Hình 4.3 | KT-LH-05, KT-LH-09 |
| LH-07 Danh sách chờ | Mục 3.3.1 | – | E2E: waitlist |
| LH-08 Nhắc tái khám | Mục 3.3.6 | – | Đơn vị (recalls) |
| KB-01 Mở phiên khám | Hình 3.10 | – | KT-KB-01 |
| KB-02 Ghi chú lâm sàng | Hình 3.10 | – | KT-KB-04, KT-KB-09 |
| KB-03 Sơ đồ răng | Hình 3.10 | Hình 4.6, Hình 4.7 | E2E: dentist-view |
| KB-04 Lịch sử theo răng | Hình 3.11 | Hình 4.6 | KT-KB-07, KT-KB-08; Đơn vị |
| KB-05 Ghi điều trị | Bảng 3.3, Hình 3.11 | – | Đơn vị (medical-records) |
| KB-06 Kê đơn, cảnh báo dị ứng | Hình 3.10 | – | Đơn vị (medical-records) |
| KB-07 Đóng phiên khám | Hình 3.10 | – | KT-KB-02, KT-KB-03, KT-KB-05, KT-KB-06 |
| KB-08 Kế hoạch điều trị | Mục 3.3.4 | – | E2E: flow-treatment-plan |
| TT-01 Lập, phát hành hóa đơn | Hình 3.12 | Hình 4.8 | KT-TT-01, KT-TT-05, KT-TT-06 |
| TT-02 Thanh toán nhiều lần | Hình 3.12 | Hình 4.9 | KT-TT-02, KT-TT-03, KT-TT-04 |
| TT-03 VietQR, tự đối soát | Bảng 3.4, Hình 3.13 | Hình 4.8, Hình 4.9 | KT-TT-07, KT-TT-08 |
| TT-04 Hoàn tiền, hủy hóa đơn | Hình 3.12 | – | Đơn vị (billing) |
| NS-01 Nhân viên, bác sĩ, dịch vụ | Mục 3.3.12 | – | E2E: staff, services |
| NS-02 Lịch làm việc, đăng ký ca | Mục 3.3.8 | – | E2E: flow-shift-registration |
| NS-03 Tính lương theo kỳ | Mục 3.3.8 | – | E2E: flow-payroll-period-cycle |
| KH-01 Nhập, xuất, kiểm kê kho | Mục 3.3.9 | – | KT-KB-05, KT-KB-06 |
| KH-02 Cảnh báo, gợi ý nhập | Mục 3.3.9 | – | E2E: reorder |
| BC-01 Bảng điều khiển, chỉ số | Bảng 3.5 | Hình 4.11 | E2E: dashboard |
| BC-02 Báo cáo doanh thu, công suất | Mục 3.3.10 | – | E2E: dashboard-finance |
| AI-01 Trợ lý AI có kiểm soát | Bảng 3.6, Hình 3.16 | Hình 4.12 | E2E: ai-assist, ai-assistant |
| QT-01 Vai trò, quyền, nhật ký, cấu hình | Hình 3.18 | – | KT-BM-06, KT-BM-07 |


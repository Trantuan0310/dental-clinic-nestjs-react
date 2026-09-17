# Đánh giá sẵn sàng production — 2026-09-17

**Kết luận: chưa đủ điều kiện triển khai production.** Build/test nghiệp vụ đã có bằng chứng; cấu hình đóng gói, kết nối dịch vụ và vận hành còn các điểm chặn. Đây là kiểm tra repository và bằng chứng local, chưa triển khai lên server.

## Cập nhật sau sửa cấu hình

Các mục bên dưới giữ làm bằng chứng audit ban đầu. Đã sửa trong repository: Compose web/API cùng HTTPS origin và PostgreSQL TLS ngoài; release job chạy script 01/02/03 và migrations; Nodemailer chuyển runtime và nâng bản vá; Docker bật native install scripts; seed admin dùng secret production và không log mật khẩu; readiness truy vấn DB; trust proxy một hop theo mạng Compose; CI bổ sung build container và API/PostgreSQL 16.

Hướng dẫn đang dùng: [PRODUCTION_RUNBOOK.md](./PRODUCTION_RUNBOOK.md). Chưa nghiệm thu image Linux vì Docker engine local không sẵn sàng; CI mới chưa chạy remote. Audit runtime sau bản vá còn 15 cảnh báo (4 high, 10 moderate, 1 low). UI, môi trường thực tế, SMTP, backup/restore và các giới hạn nghiệp vụ chưa được đóng bởi việc sửa cấu hình này.

## Thành phần phải triển khai

| Thành phần | Artifact/cấu hình | Trạng thái |
|---|---|---|
| Frontend React/Vite | `frontend/dist`, static hosting, SPA fallback, URL API tại build | Build/lint mới nhất đạt; chưa có frontend service trong Compose production |
| Backend NestJS | Docker image, `dist/main`, dependencies production, secrets | Build local đạt; image Linux chưa build/chạy kiểm chứng |
| PostgreSQL | Database riêng production, TLS, extensions, UUID v7, sequence, 9 migrations | 67 test tích hợp đạt trên PostgreSQL 18.1 local; Compose chọn PostgreSQL 16, chưa test môi trường này |
| Reverse proxy/HTTPS | DNS, certificate, proxy `/api` đến backend, header/IP client | Có tài liệu mẫu Nginx, chưa có cấu hình triển khai đã chốt |
| SMTP | Gửi reset mật khẩu thật, địa chỉ gửi, link frontend production | Runtime dependency đang bị loại khỏi image; thiếu cấu hình SMTP trong Compose |
| Redis/AI | Redis nếu dùng cache; khóa/model AI nếu dùng tính năng AI thật | Optional theo code; thiếu biến môi trường trong Compose; chưa test dịch vụ thật |
| Lưu file | Volume hoặc object storage và cơ chế đọc file có phân quyền nếu dùng upload | Service ghi file local; chưa thấy volume/router phục vụ upload trong cấu hình triển khai |
| Vận hành | Backup ngoài máy, restore, readiness, log/alert, rollback release | Có tài liệu mẫu, chưa có bằng chứng diễn tập |

## Điểm chặn cần xử lý trước release

1. **Đường truy cập production chưa hoàn chỉnh.** `docker-compose.prod.yml` chỉ có postgres/backend, backend không publish port, không có proxy trên cùng network. Nginx mẫu lại gọi `127.0.0.1:3000`. Cần chọn một cấu hình hoàn chỉnh: proxy trong network Docker hoặc backend bind cổng loopback cho Nginx host; kèm frontend static và HTTPS.
2. **PostgreSQL mặc định không khởi động được backend production theo thiết kế.** Compose đi kèm postgres không TLS, trong khi `PrismaService` bắt buộc DATABASE_URL có chế độ SSL và kết nối mã hóa. Nếu dùng DB ngoài, backend vẫn phụ thuộc postgres local trong Compose. Phải chọn DB TLS thực tế và chỉnh dependency tương ứng; bỏ mật khẩu fallback `postgres`.
3. **Thiếu sequence bệnh nhân khi khởi tạo bằng Compose.** Compose mount 01/02 nhưng không mount `03-sequences.sql`; migration 015 chỉ xử lý sequence hóa đơn. Database mới có thể migrate thành công nhưng tạo bệnh nhân thất bại vì thiếu `patient_code_seq`. Runner isolated đã cài script 03 nên kết quả 67 ca không chứng minh Compose hiện tại đúng.
4. **Runtime email thiếu thư viện.** `nodemailer` nằm trong devDependencies; Docker dùng `npm prune --omit=dev`, nhưng EmailService import thư viện khi gửi thật. Chuyển dependency về runtime, cập nhật lockfile và kiểm chứng email reset trong image production.
5. **Native dependency Argon2 chưa được cài đúng cách chứng minh được trong image.** Docker chạy `npm ci --ignore-scripts`; argon2 có install script để cung cấp native binding, chưa thấy bước rebuild riêng. Cần build Linux image sạch và thử `require('argon2')`, hash/verify, login thực tế; build TypeScript không chứng minh native binding chạy được.
6. **Chưa có migration job production đầy đủ.** Image runner loại Prisma CLI/ts-node trong nhóm dev. Cần release job/image có CLI đã khóa phiên bản, script UUID/sequence, migration status; không dùng npx tự tải bản mới ngoài lockfile. Chạy migrate deploy trước khi nhận traffic. Migration 016/017 vẫn chưa áp dụng trên DB demo; DB production chưa được cung cấp để kiểm tra.
7. **Bootstrap admin chưa phù hợp public production.** Seed tạo tài khoản và mật khẩu cố định, còn in mật khẩu ra log. Cần bootstrap bằng secret riêng, không ghi secret ra log và xác nhận bắt buộc đổi mật khẩu trước sử dụng. Không đưa dữ liệu demo/bệnh nhân test vào production.
8. **IP/rate limit sau reverse proxy chưa chốt.** Nginx chuyển tiếp X-Forwarded-For nhưng main.ts chưa cấu hình trust proxy. Cần tin cậy đúng proxy/hop theo topology, kiểm tra hai client có IP/rate limit độc lập. Không bật tin cậy mọi proxy khi backend có thể bị truy cập trực tiếp. Nếu scale nhiều instance cần kiểm chứng throttle dùng storage chung.
9. **Readiness và phục hồi chưa được chứng minh.** `/health` hiện trả ok mà không kiểm tra DB; không dùng kết quả này để kết luận backend phục vụ nghiệp vụ được khi DB mất kết nối. Cần readiness phụ thuộc DB, backup trước migration, restore vào DB khác và kiểm tra dữ liệu, giữ image/config phiên bản trước để rollback.
10. **Nghiệm thu trình duyệt còn mở.** Playwright gần nhất còn 3 ca lỗi: luồng patient-to-payment, queue reload và mobile overflow. Hai ca đã có sửa code nhưng chưa có lượt UI sau sửa xác nhận toàn bộ đạt. Phải chạy staging qua HTTPS/proxy thật, đúng ba vai trò.

## Biến môi trường phải chốt

| Nhóm | Biến và điều kiện |
|---|---|
| Ứng dụng | `NODE_ENV=production`, `PORT`, `CORS_ORIGIN` là origin HTTPS chính xác, `FRONTEND_URL` cho link reset |
| Database | `DATABASE_URL` production có TLS; tách tài khoản migration và tài khoản ứng dụng theo quyền cần thiết |
| Auth | `JWT_SECRET` ngẫu nhiên từ secret manager, tối thiểu 32 ký tự theo validator; kiểm chứng TTL thực tế, không chỉ đặt biến chưa được code dùng |
| Email | `EMAIL_MOCK=false`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `EMAIL_FROM` |
| Frontend | `VITE_API_BASE_URL=/api/v1` khi đi qua cùng origin, hoặc URL API đã kiểm chứng cookie/CORS; VITE_* là cấu hình public ở thời điểm build |
| Optional | `REDIS_URL`, `GEMINI_API_KEY`, `GEMINI_MODEL`, `UPLOAD_DIR`, `API_URL` tùy module sử dụng |

Cookie refresh hiện Secure khi production, HttpOnly, SameSite Strict, path `/api/v1/auth`. Khi chọn frontend/API khác site cần kiểm chứng chính sách cookie bằng trình duyệt; không giả định cấu hình localhost sẽ hoạt động trên hai domain độc lập.

## Thứ tự triển khai sau khi đóng các điểm chặn

1. Chốt host/domain/topology, phiên bản Node/PostgreSQL và nơi lưu secrets; ghi nhận commit release, bao gồm các migration/test hiện còn untracked.
2. Tạo staging tương đương production: TLS, proxy, DB, SMTP, storage; build image sạch bằng lockfile, thử native modules và dependency production.
3. Khởi tạo extensions/UUID/sequence trên database trống; chạy 9 migrations qua release job; bootstrap tài khoản quản trị riêng.
4. Deploy backend rồi frontend; kiểm tra readiness, login/refresh/logout/reset password qua HTTPS, deep links SPA và ba vai trò.
5. Chạy test nghiệp vụ/Playwright trên staging; kiểm tra đặt lại slot hủy, thanh toán cạnh tranh và báo cáo. Chạy thêm kỳ lương có dữ liệu thật dạng fixture nếu module lương thuộc phạm vi release.
6. Backup/restore rehearsal; ghi rõ rollback app và cách xử lý DB khi migration thất bại. Không đảo migration hay xóa volume tự động khi rollback.
7. Deploy production vào cửa sổ bảo trì phù hợp, migrate rồi chuyển traffic, smoke test và theo dõi lỗi/độ trễ.

## Bằng chứng và giới hạn lượt kiểm tra

- Frontend build/lint vừa được chạy ở lượt rà soát trước và đạt; build có cảnh báo chunk lớn, chưa phải điểm chặn.
- Bộ backend isolated gần nhất 67/67 đạt; 373 unit đạt, payroll sau chỉnh sửa 22/22 đạt. Chúng không chạy trong Linux image production.
- `.github/workflows/ci.yml` có lint/typecheck/unit/build; chưa có job build/smoke Docker, PostgreSQL isolated, Playwright hoặc deploy/rollback.
- Docker CLI hiện báo không kết nối được Docker Desktop Linux engine; chưa xác nhận base image digest, package Alpine, native dependencies hay container startup. Không kết luận image chạy được.
- Có tài liệu backup/Nginx/deploy nhưng tài liệu migration còn liệt kê tới 013; cần đồng bộ hướng dẫn với 014–017 và init scripts.
- Chưa kiểm tra lỗ hổng dependency bằng kết quả audit mới, thử tải, SMTP/AI/Redis thật, storage upload và idempotency khi gửi lại cùng khoản thanh toán từng phần. Cần đóng các mục tương ứng trước khi nhận dữ liệu hoặc tiền thật.
- Chưa có host/domain/credentials production; chưa thay đổi môi trường bên ngoài hoặc áp dụng migration vào DB demo.

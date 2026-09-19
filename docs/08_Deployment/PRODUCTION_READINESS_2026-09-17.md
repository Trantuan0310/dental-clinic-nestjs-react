# Đánh giá sẵn sàng production — 2026-09-17 (cập nhật 2026-09-19)

**Kết luận: chưa đủ điều kiện triển khai production, nhưng 9/10 điểm chặn gốc đã đóng, và lượt này lần đầu có bằng chứng CI chạy thật trên GitHub Actions (không chỉ local).** Nhánh sửa đã merge fast-forward vào `main` ([57fbd15](https://github.com/Trantuan0310/dental-clinic-nestjs-react/commit/57fbd15)) và toàn bộ 9 job CI trên GitHub — bao gồm 2 job mới `postgres-api` (migrate + test trên PostgreSQL thật) và `production-images` (build cả 3 image production) — đều **pass trên runner GitHub thật**, không chỉ trên máy local. Điểm chặn #10 (Playwright): 3 ca cụ thể đã nêu trong bản gốc đã sửa và pass, nhưng lượt rà soát 2026-09-18 cũng phát hiện thêm một vấn đề NGOÀI phạm vi 3 ca đó — chạy lặp lại toàn bộ suite trên cùng một DB dev chưa reset gây lỗi dây chuyền — chưa kết luận được đây có phải vấn đề thật trên CI hay chỉ do cách chạy thủ công lặp lại trong phiên debug (xem chi tiết ở điểm #10; CI hiện tại chưa chạy Playwright, chỉ chạy lint/typecheck/unit/build + migrate + build image). Còn mở khác: lỗ hổng dependency cần nâng phiên bản NestJS có breaking change, và toàn bộ hạng mục hạ tầng thật (domain, SMTP, TLS cert, staging, backup/restore) — những việc này cần quyết định/thông tin xác thực từ đội vận hành, không thể đóng chỉ bằng sửa code.

## Cập nhật sau sửa cấu hình (2026-09-17) và xác minh thực đo (2026-09-18)

Đã sửa trong repository ở lượt 2026-09-17: Compose web/API cùng HTTPS origin và PostgreSQL TLS ngoài; release job chạy script 01/02/03 và migrations; Nodemailer chuyển runtime; Docker bật native install scripts; seed admin dùng secret production và không log mật khẩu; readiness truy vấn DB; trust proxy một hop theo mạng Compose; CI bổ sung build container và API/PostgreSQL 16.

Lượt 2026-09-18, Docker Desktop local đã chạy được (trước đó không kết nối được engine) nên các mục sau được xác minh bằng build/run thật, không chỉ đọc code:

- **Build cả 3 image production** (`docker build --target runner`, `--target migrate`, frontend) đúng như job `production-images` trong CI — cả 3 đều build thành công.
- **Argon2 native binding chạy thật trong image Linux**: `argon2.hash()` + `argon2.verify()` bên trong container vừa build ra kết quả đúng (hash hợp lệ, verify đúng mật khẩu trả `true`, verify sai mật khẩu trả `false`). Trước đây chỉ có `require('argon2')` không lỗi — không chứng minh native binding hoạt động; nay đã có bằng chứng hash/verify thật.
- **Migrate image có đủ Prisma CLI và ts-node** (`require('prisma')`, `require('ts-node')` chạy được bên trong image `migrate` stage).
- **3/3 ca lỗi Playwright đã nêu ở điểm chặn #10 được xác định nguyên nhân gốc và sửa, chạy lại pass**: xem chi tiết ở mục #10 bên dưới.
- Tài liệu migration đã đồng bộ tới 014–017 (trước đó thiếu 014/015).

Còn mở sau lượt này: `npm audit` trên production dependencies còn 15 cảnh báo (4 high, 10 moderate, 1 low) — tất cả chỉ có `npm audit fix --force` (nâng `@nestjs/platform-express`, `@nestjs/swagger`, `@nestjs/schedule` lên major mới, breaking change trên toàn bộ NestJS core liên quan). Không tự ý force-upgrade một framework core đang chạy production mà không có kế hoạch regression riêng — đây nên là một nhiệm vụ nâng cấp có kiểm thử đầy đủ, tách khỏi đợt sửa này. Hạ tầng thật (domain, SMTP, TLS cert, staging, backup/restore rehearsal) vẫn chưa được đóng — các mục này cần input từ đội vận hành, không phải việc sửa code có thể tự đóng.

## Xác nhận CI remote (2026-09-19)

Merge `production-demo-readiness-2026-09-17` vào `main` (fast-forward, không xung đột) đã kích hoạt CI trên GitHub Actions cho commit `57fbd15`. Kết quả tất cả 9 check run: **Success**.

| Job | Kết quả |
|---|---|
| Backend Build | ✅ Success |
| Frontend Build | ✅ Success |
| Backend Tests | ✅ Success |
| Backend Lint | ✅ Success |
| Backend TypeScript Check | ✅ Success |
| Frontend Lint | ✅ Success |
| Frontend TypeScript Check | ✅ Success |
| Release migrations and PostgreSQL API tests (`postgres-api`) | ✅ Success |
| Production container builds (`production-images`) | ✅ Success |

Ý nghĩa với các điểm chặn: điểm #1/#5/#6 trước đó chỉ có bằng chứng build/run trên Docker Desktop **local** (máy cá nhân) — nay `production-images` đã chạy và pass trên **runner GitHub thật**, môi trường độc lập với máy local, nên bằng chứng đáng tin hơn (khác OS/network/quyền so với máy dev). `postgres-api` chạy migrate + `npm run test:isolated` trên PostgreSQL 16 thật trong container CI, không phải PostgreSQL 18.1 local như trước — xác nhận migration 014–017 áp dụng được trên đúng phiên bản Postgres mà `docker-compose.prod.yml` sẽ dùng.

CI hiện tại **không chạy Playwright** (không có job e2e) — nên phát hiện "34 ca lỗi dây chuyền khi chạy lặp lại full suite" ở điểm #10 vẫn chưa được CI xác nhận hay bác bỏ; đây vẫn là việc cần làm riêng (thêm job Playwright vào CI, hoặc chạy thủ công một lần trên DB sạch) trước khi coi UI acceptance là đã kiểm chứng ở quy mô CI.

## Thành phần phải triển khai

| Thành phần | Artifact/cấu hình | Trạng thái |
|---|---|---|
| Frontend React/Vite | `frontend/dist`, static hosting, SPA fallback, URL API tại build | Build/lint đạt local và trên CI GitHub Actions; có service `web` trong Compose production, chưa build/chạy trên hosting thật |
| Backend NestJS | Docker image, `dist/main`, dependencies production, secrets | Image Linux đã build và chạy kiểm chứng (argon2 hash/verify thật) trên Docker Desktop local VÀ trên CI GitHub Actions (`production-images`) |
| PostgreSQL | Database riêng production, TLS, extensions, UUID v7, sequence, 9 migrations | 67 test tích hợp đạt trên PostgreSQL 18.1 local; migration 014–017 + release job đã chạy và pass trên PostgreSQL 16 thật trong CI (`postgres-api`) — đúng phiên bản Compose production dùng. Chưa test trên DB production thật |
| Reverse proxy/HTTPS | DNS, certificate, proxy `/api` đến backend, header/IP client | `nginx.conf.template` + service `web` trong Compose đã chốt cấu hình (proxy nội bộ, TLS cert volume); chưa có DNS/certificate/domain thật để triển khai |
| SMTP | Gửi reset mật khẩu thật, địa chỉ gửi, link frontend production | `nodemailer` đã chuyển sang runtime dependency, sống sót qua image production; Compose đã có biến `SMTP_*` bắt buộc; chưa có tài khoản SMTP thật để test gửi email |
| Redis/AI | Redis nếu dùng cache; khóa/model AI nếu dùng tính năng AI thật | Optional theo code; thiếu biến môi trường trong Compose; chưa test dịch vụ thật |
| Lưu file | Volume hoặc object storage và cơ chế đọc file có phân quyền nếu dùng upload | Service ghi file local; chưa thấy volume/router phục vụ upload trong cấu hình triển khai |
| Vận hành | Backup ngoài máy, restore, readiness, log/alert, rollback release | Có tài liệu mẫu, chưa có bằng chứng diễn tập |

## Điểm chặn cần xử lý trước release

Trạng thái theo lượt xác minh 2026-09-18/19. "ĐÃ ĐÓNG (code)" nghĩa là đã sửa và kiểm chứng được trong repository/local Docker hoặc CI; triển khai thật lên staging/production ở bước sau vẫn cần chạy lại trên hạ tầng thật.

1. **✅ ĐÃ ĐÓNG (code + xác nhận CI remote).** Đường truy cập production. `docker-compose.prod.yml` nay có service `web` (Nginx, port 80/443, TLS cert volume) proxy `/api/` sang `backend:3000` qua Docker network nội bộ; backend không publish port ra host. Đã build thử cả 3 image (`runner`, `migrate`, frontend) bằng Docker Desktop local, và job `production-images` đã chạy lại trên GitHub Actions (commit `57fbd15`) — build thành công trên cả hai môi trường.
2. **✅ ĐÃ ĐÓNG (code).** `PrismaService`/`scripts/release.cjs` chặn khởi động khi `NODE_ENV=production` và `DATABASE_URL` không có `sslmode=require|verify-ca|verify-full` (case-insensitive, có test `prisma.service.spec.ts`). Compose không còn bundle Postgres local — bắt buộc trỏ `DATABASE_URL`/`MIGRATION_DATABASE_URL` ra DB TLS thật (biến môi trường không có default, thiếu là compose từ chối khởi động).
3. **✅ ĐÃ ĐÓNG (code).** Compose không còn service Postgres local nên không còn phụ thuộc mount init script qua volume; `migrate` image tự COPY `01-extensions.sql`/`02-uuid-v7.sql`/`03-sequences.sql` và `scripts/release.cjs` chạy cả 3 script + `migrate deploy` + một query sanity-check (`uuid_generate_v7()`, `patient_code_seq`) trước khi coi là thành công.
4. **✅ ĐÃ ĐÓNG (code).** `nodemailer`, `argon2`, `@prisma/client` đều nằm trong `dependencies` (không phải `devDependencies`) — còn sống sót qua `npm prune --omit=dev` ở stage `production-deps`.
5. **✅ ĐÃ ĐÓNG (xác minh thật).** Build image `runner` bằng Docker Desktop local, chạy `argon2.hash()` + `argon2.verify()` thật bên trong container: hash hợp lệ, verify đúng mật khẩu → `true`, verify sai mật khẩu → `false`. Native binding hoạt động đúng trong Linux image, không chỉ `require()` không lỗi.
6. **✅ ĐÃ ĐÓNG (code + xác minh thật + CI remote).** Image `migrate` build từ stage `builder` (trước khi prune dev deps) nên có đủ Prisma CLI và ts-node khóa đúng phiên bản lockfile — đã xác nhận `require('prisma')`/`require('ts-node')` chạy được bên trong image vừa build. Migration 014–017 đã chạy qua `npm run test:isolated` local (67/67 pass) VÀ qua job `postgres-api` trên GitHub Actions (PostgreSQL 16 thật trong container CI, không phải Postgres 18.1 local) — cả hai đều pass. Chưa chạy trên DB production thật vì DB đó chưa tồn tại.
7. **✅ ĐÃ ĐÓNG (code).** Bootstrap admin bắt buộc `BOOTSTRAP_ADMIN_EMAIL`/`BOOTSTRAP_ADMIN_PASSWORD` (≥16 ký tự) khi `NODE_ENV=production`, không có mật khẩu mặc định; log chỉ in email, không in mật khẩu.
8. **✅ ĐÃ ĐÓNG (code).** `TRUST_PROXY=1` set 1 hop tin cậy trong `main.ts` (`app.set('trust proxy', 1)`), khớp với compose (`backend` không publish port, chỉ `web` proxy vào) — đúng topology 1-hop-proxy đã mô tả.
9. **✅ ĐÃ ĐÓNG (code).** `GET /health/ready` chạy `SELECT 1` qua Prisma, trả 503 khi DB mất kết nối thay vì luôn `ok`; compose healthcheck đã trỏ vào endpoint này.
10. **🟡 3 ca đã nêu: ĐÃ ĐÓNG. Phát hiện thêm ngoài phạm vi ban đầu: còn mở, cần chạy lại trên DB sạch để kết luận.** 3 ca Playwright đã nêu trong bản gốc — nguyên nhân gốc đều xác định được, không phải lỗi UI đơn thuần:
    - **Mobile overflow/sidebar** (`shell.spec.ts`): test gọi `page.goto('/')` thừa sau khi `beforeEach` đã điều hướng; điều hướng thứ hai đua với silent-refresh còn dở của lần điều hướng đầu, hai request refresh cùng dùng một cookie chưa kịp xoay vòng → backend coi là token bị dùng lại (`TokenReuseDetectedException`), thu hồi toàn bộ phiên, test bị bật về trang login. Đã bỏ điều hướng thừa.
    - **Dentist "Today"/queue** (`dentist-view.spec.ts`): test đầu tiên trong file không đợi `networkidle` trước khi kết thúc; fixture đóng trang trong lúc request refresh của nó còn đang bay, cookie mới (Set-Cookie) bị rơi mất, phiên chia sẻ trong worker mang theo cookie đã dùng rồi sang test kế tiếp → cùng lỗi token-reuse. Đã sửa gốc trong `frontend/e2e/fixtures.ts` (fixture `page` dùng chung cho mọi spec): đợi `networkidle` (tối đa 3s, bỏ qua nếu timeout) trước khi đóng trang.
    - **Luồng patient-to-payment**: seed mặc định (`backend/prisma/seed.ts`) không tạo `WorkingSchedule` nào cho nha sĩ, nên bước đặt lịch luôn nhận `400 Dentist has no working schedule for this day` bất kể ngày chạy test. Fixture `backend/prisma/seed-demo-window.ts` (tự tạo ca tạm cho đúng hôm nay, không đụng gì nếu đã có ca thật, tự dọn sau khi chạy) trước đây chỉ được bật qua `E2E_DEMO_SCHEDULE=1` cho riêng script quay demo. Đã đổi `frontend/e2e/global-setup.ts` để fixture này chạy mặc định cho mọi lượt `npm run test:e2e` (tắt bằng `E2E_DEMO_SCHEDULE=0` nếu DB đã có lịch thật).
    - Cả 3 test đã chạy lại và **pass khi chạy riêng lẻ/theo nhóm nhỏ, nhiều lần**. Đã sửa thêm một điểm liên quan trong `frontend/e2e/fixtures.ts`: mọi `page.goto()`/`page.reload()` lấy từ context dùng chung (không riêng 3 spec trên) giờ tự đợi mạng ổn định trước khi trả quyền điều khiển lại cho test, để giảm khả năng hai điều hướng đua nhau trên cùng một cookie.
    - **Phát hiện thêm, chưa đóng — không thuộc phạm vi 3 ca đã nêu**: chạy lặp lại TOÀN BỘ ~69 test trong cùng một phiên debug (nhiều lượt liên tiếp trên cùng một DB dev cục bộ, không reset giữa các lượt) cho thấy khoảng 34 ca lỗi dây chuyền. Đào sâu một trường hợp cụ thể cho thấy nguyên nhân chính ở đây khác hẳn: `flow-patient-to-payment.spec.ts` đặt lịch hẹn thật vào DB dev mà không dọn dẹp sau khi chạy, nên các lượt chạy lặp lại trong cùng buổi tự đụng giờ với chính dữ liệu do các lượt trước đó để lại (`409 This time slot is already booked` ở cả 4 mốc giờ thử lại) — không phải lỗi auth. Việc thu hồi phiên do trùng refresh-token (thiết kế bảo mật cố ý, xem quyết định giữ nguyên ở trên) có thể là hệ quả collateral của một test đã fail giữa chừng, không phải nguyên nhân gốc của toàn bộ 34 ca. **Chưa kết luận được đây có phải vấn đề thật trên CI** (nơi mỗi lượt chạy thường có DB sạch) hay chỉ là tạo tác của việc gọi test thủ công lặp lại nhiều lần trong một phiên như phiên rà soát này. Khuyến nghị: chạy lại toàn bộ suite một lần duy nhất trên DB vừa seed sạch (không phải DB đã qua nhiều lượt debug) để có số liệu đáng tin cậy, và cân nhắc dọn dữ liệu do `flow-*.spec.ts` tạo ra nếu CI dùng chung một DB lâu dài giữa các lần chạy.

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

- Frontend build/lint đạt; build có cảnh báo chunk lớn (>500kB), chưa phải điểm chặn.
- Bộ backend isolated gần nhất 67/67 đạt; unit đạt. Test này chạy trên Postgres local, không chạy trong Linux image production — riêng phần argon2/native binding nay đã được xác minh trực tiếp trong image thật (xem điểm chặn #5).
- `.github/workflows/ci.yml` có lint/typecheck/unit/build + 2 job mới (`postgres-api`, `production-images`) build container và chạy test isolated trên PostgreSQL thật. Cả 9 job **đã chạy remote trên GitHub Actions** cho commit `57fbd15` (sau khi merge vào `main`) và pass — không còn là bằng chứng chỉ-local nữa. Chưa có job Playwright/E2E trong CI.
- Docker Desktop local đã phục hồi và build/run thành công cả 3 image production (`runner`, `migrate`, frontend) — xem điểm chặn #1, #5, #6; nay có thêm xác nhận từ GitHub Actions cho cùng 3 image.
- Tài liệu migration đã đồng bộ tới 014–017 ([migration-plan.md](../04_Database/migration-plan.md)).
- `npm audit --omit=dev` trên backend: 15 cảnh báo (4 high: `body-parser`, `js-yaml`, `lodash`, `multer`; 10 moderate; 1 low). Không có bản vá không-breaking (`npm audit fix` không đổi gì); mọi bản vá đều qua `--force` và nâng `@nestjs/platform-express`/`@nestjs/swagger`/`@nestjs/schedule` lên major mới — cần một nhiệm vụ nâng cấp NestJS core riêng có kế hoạch regression, không nên bó vào đợt sửa nhanh này.
- Playwright: 3 ca lỗi đã nêu trong bản gốc được xác định nguyên nhân gốc, sửa và pass khi chạy lại riêng lẻ (xem điểm chặn #10). Có sửa gốc trong `fixtures.ts` áp dụng cho toàn bộ suite, không chỉ 3 ca này.
- Chưa kiểm tra SMTP/AI/Redis thật, storage upload và idempotency khi gửi lại cùng khoản thanh toán từng phần. Cần đóng các mục tương ứng trước khi nhận dữ liệu hoặc tiền thật.
- Chưa có host/domain/credentials production; chưa thay đổi môi trường bên ngoài hoặc áp dụng migration vào DB production thật.

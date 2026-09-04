# 🔒 Audit Bảo mật & Cấu hình Database

> **Phạm vi kiểm tra:** Bí mật/secret trong git history, pipeline CI/CD, cấu hình
> Prisma/PostgreSQL (`backend/prisma/**`), biến môi trường production
> (`docker-compose.prod.yml`, `docs/08_Deployment/**`).
> **Mục tiêu:** Xác định rủi ro bảo mật và lỗi cấu hình database trước khi
> triển khai production thật.
> **Ngày audit:** 2026-09-04.
> **Commit chứa các fix:** [`4d92b43`](https://github.com/Trantuan0310/dental-clinic-nestjs-react/commit/4d92b43) trên branch `claude/doc-du-an-e2605f`.

---

## Phần 1 — Audit bảo mật tổng thể

**Kết luận: không có bí mật nào bị lộ, và không có gì có thể "vô tình" chạm tới production vì chưa hề có pipeline auto-deploy nào tồn tại.**

| Hạng mục | Kết quả |
|---|---|
| Secret/credential trong git history (tất cả branch, tất cả commit) | Không có — quét theo pattern AWS key, OpenAI/Gemini key, Slack/GitHub token, PEM private key, connection string có mật khẩu → 0 kết quả |
| File `.env` thật bị commit | Không — chỉ có `backend/.env.example` (toàn placeholder), `.gitignore` chặn đúng `.env*` |
| Pipeline tự động deploy lên production | **Không tồn tại** — `.github/workflows/ci.yml` chỉ chạy lint/typecheck/test/build, không có bước deploy nào |
| `JWT_SECRET` có fallback yếu không | Không — app refuse to start nếu thiếu hoặc < 32 ký tự (`jwt.strategy.ts`, `auth.module.ts`) |
| Cookie refresh token | Đúng chuẩn: `httpOnly: true`, `secure` khi production, `sameSite: 'lax'` |
| Tài khoản admin mặc định (`admin@clinic.local` / `Admin123!`, seed.ts) | Public trên GitHub vì repo public — cần đổi mật khẩu/vô hiệu hóa ngay sau khi deploy thật lần đầu (status `PENDING_SETUP` buộc đổi mật khẩu khi đăng nhập lần đầu) |

---

## Phần 2 — Cấu hình Database: 4 vấn đề đã sửa

### 1. Unique constraint không loại trừ bản ghi đã vô hiệu hóa/xóa mềm

`users.email` (`@@unique([email])`) và `patient_identifiers` (`@@unique([type, value])`)
là unique index **toàn bảng**, không loại trừ user đã deactivate hoặc identifier đã
soft-delete. Với `patient_identifiers` đây là bug **tái hiện được thật**: app-layer
đã check trùng chỉ trong bản ghi active (`deletedAt: null`) trước khi insert, nhưng
ràng buộc DB lại toàn bảng → thêm lại CCCD/SĐT từng bị xóa mềm sẽ ăn lỗi Prisma
P2002 thô.

**Fix:** migration [`013_soft_delete_partial_unique`](backend/prisma/migrations/013_soft_delete_partial_unique/migration.sql)
— thay bằng partial unique index chỉ tính bản ghi active:
- `users_email_active_key` — `WHERE deactivated_at IS NULL AND deleted_at IS NULL`
- `patient_identifiers_type_value_active_key` — `WHERE deleted_at IS NULL`

Đồng bộ lại `users.service.ts` (check trùng khi tạo user) và `auth.service.ts`
(`findUnique` → `findFirst` vì email không còn là unique field theo TypeScript).

### 2. Migration `010_perf_indexes` có thể tự fail khi deploy

Dùng `CREATE INDEX CONCURRENTLY`, không chạy được trong transaction — mà
`prisma migrate deploy` luôn bọc migration trong 1 transaction ngầm. Migration
này gần như chắc chắn chưa từng được apply ở đâu (không environment nào trong
dự án từng chạy `migrate deploy` chạm DB thật), nên sửa trực tiếp là an toàn.

**Fix:** bỏ `CONCURRENTLY` khỏi cả 9 câu `CREATE INDEX` — đánh đổi là khoá bảng
ngắn lúc tạo index, chấp nhận được vì chưa có traffic production thật.

### 3. Tài liệu CI/CD mô tả sai thực tế

`docs/08_Deployment/CI_CD.md` mô tả một job `deploy: Deploy to Railway` tự động
(dùng `railway-deploy-action@v1`, secret `RAILWAY_TOKEN`) — job này **chưa từng
tồn tại** trong `.github/workflows/ci.yml` thật.

**Fix:** viết lại tài liệu cho khớp 100% với 6 job thật (lint/typecheck/test/build,
không chạm DB). Nhân tiện phát hiện và dọn thêm biến `JWT_REFRESH_SECRET` — được
nhắc trong `DEPLOY_RAILWAY.md`/`DEPLOY_RENDER.md` như bắt buộc nhưng **không có
dòng code nào đọc biến này** (refresh token là random hash lưu DB, không phải JWT).

### 4. Không enforce SSL cho `DATABASE_URL` khi production

**Fix:** thêm `PrismaService.assertProductionDatabaseSsl()` — refuse to start nếu
`NODE_ENV=production` mà `DATABASE_URL` thiếu `sslmode=require`/`verify-ca`/
`verify-full` (kể cả `sslmode=prefer` mặc định của libpq cũng bị chặn, vì nó vẫn
âm thầm rớt về không mã hoá). Đồng thời cập nhật `docker-compose.prod.yml` vì
Postgres nội bộ trong đó không có TLS — nếu để nguyên sẽ crash-loop ngay khi có
check mới.

---

## Kiểm chứng

- `npx prisma validate` + `npx prisma generate` — pass
- `npx tsc --noEmit` (backend) — pass
- `npx jest` — 256/256 test pass (bao gồm 8 test mới cho SSL check, test đảo
  ngược cho hành vi email-trùng-với-user-deactivated)
- Chưa test migration 013 trên Postgres thật (môi trường này không có
  Docker/DB) — cần chạy `prisma migrate deploy` trên môi trường có DB thật
  trước khi merge để verify SQL.

## Không đụng tới

- `backend_audit_report.md` (báo cáo audit đóng khung theo ngày 19/07/2026)
  và `docs/10_Thesis/APPENDIX.md` cũng có `JWT_REFRESH_SECRET` sai nhưng là
  tài liệu snapshot/học thuật — sửa lại sẽ làm sai lệch hồ sơ đã có.

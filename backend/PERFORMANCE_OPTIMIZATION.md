# Performance & Optimization — Mid-term Audit

Các thay đổi được triển khai theo kế hoạch tối ưu 1-2 tuần (cân bằng FE + BE + DB).

## Tổng quan thay đổi

| Khu vực | File chính | Mục đích |
|---|---|---|
| DB | `prisma/migrations/010_perf_indexes/migration.sql` | Index mới cho users, patients (GIN JSONB), appointments, invoices, payroll_line_items |
| Cache | `src/common/cache.{module,util}.ts`, `src/common/redis-cache.service.ts` | Cache layer dùng chung, áp dụng cho roles/permissions |
| Pagination | `src/common/dto/page-query.dto.ts` | Chuẩn hóa `{ data, meta }` envelope |
| TX isolation | `src/billing/billing.service.ts`, `src/payroll/payroll.service.ts` | Serializable transaction cho finance flows |
| Security | `src/main.ts` | `helmet()` + `enableShutdownHooks()` |
| API client | `frontend/src/lib/api.ts` | Retry-with-backoff cho 5xx, chống refresh loop |
| Bundle | `frontend/src/routes/AppRoutes.tsx` | Route lazy (đã có sẵn) |
| Table | `frontend/src/components/ui/DataTable.tsx` | Virtual rows qua `@tanstack/react-virtual` |
| A11y | `frontend/src/components/ui/{Drawer,FormStatus}.tsx` | Focus trap, aria-live region |

## Hướng dẫn deploy

### 1. Cài dependencies mới

```bash
# Backend (thêm helmet)
cd backend && pnpm install

# Frontend (thêm @tanstack/react-virtual)
cd ../frontend && pnpm install
```

### 2. Chạy migration index

`010_perf_indexes` từng dùng `CREATE INDEX CONCURRENTLY`, không chạy được qua
`prisma migrate deploy` (statement này không được phép trong transaction, mà
Prisma luôn bọc cả file migration trong 1 transaction ngầm). Đã sửa: bỏ
`CONCURRENTLY`, dùng `CREATE INDEX` thường (khoá bảng ngắn khi tạo — chấp
nhận được ở quy mô hiện tại). Giờ chạy bình thường cùng các migration khác:

```bash
npx prisma migrate deploy
```

Không cần chạy `psql` thủ công hay tự chèn `_prisma_migrations` nữa. Nếu sau
này bảng đủ lớn để việc khoá khi tạo index trở thành vấn đề, tạo lại đúng
index đó bằng `CREATE INDEX CONCURRENTLY` qua `psql` rồi `DROP` bản không
concurrent tương ứng.

### 3. Khởi động & kiểm tra

```bash
# Backend
cd backend && pnpm run start:dev

# Frontend
cd ../frontend && pnpm run dev
```

## Đo baseline & sau tối ưu

```bash
# Cần jq: apt-get install jq / brew install jq
cd backend
API_BASE_URL=http://localhost:3000 \
EMAIL=admin@dental.local \
PASSWORD=admin123 \
N=20 \
./scripts/perf-benchmark.sh
```

Output dạng:

```
endpoint                                             |    p50ms |    p95ms |    maxms
--------------------------------------------------- + -------- + -------- + --------
/patients?page=1&pageSize=20                         |      95 |     180 |     245
/appointments?from=...&to=...                        |     120 |     220 |     310
/invoices?status=ISSUED                              |      80 |     150 |     200
/admin/roles                                         |      12 |      28 |      55  ← cache hit
/admin/users?page=1&pageSize=20                      |      75 |     140 |     195
```

## Tests & verify

```bash
# Backend unit tests (32 tests pass sau khi áp Serializable)
cd backend && pnpm exec jest --runInBand

# TypeScript check cả 2 phía
cd backend  && pnpm exec tsc --noEmit
cd ../frontend && pnpm exec tsc --noEmit
```

## Rollback

- Migration 010 chỉ thêm index — an toàn để `DROP INDEX` (thêm `CONCURRENTLY` nếu muốn tránh khoá bảng lúc drop).
- Code thay đổi: revert qua git, không có schema thay đổi.

## KPI mong đợi

| Chỉ số | Trước (ước lượng) | Sau (mục tiêu) |
|---|---|---|
| Dashboard API p95 | ~400ms | ≤ 200ms |
| Appointments list p95 | ~350ms | ≤ 180ms |
| Payroll list p95 | ~500ms | ≤ 250ms |
| JS bundle dashboard | ~350KB | ≤ 220KB |
| Lighthouse Perf | ~70 | ≥ 85 |
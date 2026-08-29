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

Prisma không hỗ trợ `CREATE INDEX CONCURRENTLY` trong transaction wrapper.
Chạy file SQL **bên ngoài** Prisma migrate, ví dụ:

```bash
# Cách 1: qua psql trực tiếp (khuyến nghị)
psql "$DATABASE_URL" -f backend/prisma/migrations/010_perf_indexes/migration.sql

# Cách 2: nếu dùng docker-compose
docker compose exec -T postgres \
  psql -U postgres -d dental_clinic \
  -f /docker-entrypoint-initdb.d/010_perf_indexes.sql
```

Sau khi áp dụng thành công, đánh dấu migration đã chạy để Prisma không cố tạo lại:

```bash
psql "$DATABASE_URL" -c "INSERT INTO _prisma_migrations (id, checksum, migration_name, finished_at, applied_steps_count) VALUES (gen_random_uuid()::text, 'manual', '010_perf_indexes', NOW(), 1);"
```

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

- Migration 010 chỉ thêm index — an toàn để `DROP INDEX CONCURRENTLY`.
- Code thay đổi: revert qua git, không có schema thay đổi.

## KPI mong đợi

| Chỉ số | Trước (ước lượng) | Sau (mục tiêu) |
|---|---|---|
| Dashboard API p95 | ~400ms | ≤ 200ms |
| Appointments list p95 | ~350ms | ≤ 180ms |
| Payroll list p95 | ~500ms | ≤ 250ms |
| JS bundle dashboard | ~350KB | ≤ 220KB |
| Lighthouse Perf | ~70 | ≥ 85 |
# [DEMO-001] Verify seed scripts end-to-end trên máy có Docker/Postgres

## Priority
🔴 P0 — chặn việc chạy Playwright e2e (`frontend/e2e/*.spec.ts`) vì tài khoản demo chưa chắc tồn tại

## Status
Open — code đã sửa, **chưa verify được với DB thật**

## Owner
Backend

## Estimated Effort
10–15 phút nếu 3 lệnh chạy sạch; thêm thời gian nếu phát hiện lỗi tương tự ở seed script khác

## Created
2026-09-24

---

## Context

`backend/prisma/seed-clinical.ts` fail trên database mới migrate với lỗi:

```
Argument `where` of type UserWhereUniqueInput needs at least one of `id` arguments
```

Nguyên nhân: `User.email` trong `backend/prisma/schema.prisma` **không** khai báo `@unique`
(tính duy nhất chỉ được enforce bằng một partial unique index tạo qua raw SQL migration),
nên `prisma.user.findUnique`/`prisma.user.upsert` theo `email` là query không hợp lệ với
Prisma Client.

Đã sửa trong commit [`b475c32`](https://github.com/Trantuan0310/dental-clinic-nestjs-react/commit/b475c32)
trên nhánh `claude/jolly-allen-40e93e` (branch riêng, **chưa merge vào `main`**):

- 3 chỗ trong `seed-clinical.ts` (check admin, vòng lặp tạo dentist, vòng lặp tạo receptionist)
  đổi từ `findUnique`/`upsert` theo `email` sang `findFirst({ email, deletedAt: null })` rồi
  `update`-theo-`id` hoặc `create`.
- Đã rà lại toàn bộ `backend/prisma/seed-*.ts` khác (`seed.ts`, `seed-today.ts`,
  `seed-demo-window.ts`, `seed-helpers.ts`) — không còn `findUnique`/`upsert` nào key theo
  `email`; các `findUnique`/`upsert` còn lại (`Role.code`, `Permission.code`,
  `ExpenseCategory.name`, `InventoryItem.id`) đều key theo cột có `@unique` thật trong schema
  nên không cần sửa.

**Giới hạn của lượt sửa này:** sandbox không có Docker, không có PostgreSQL cục bộ, và một
giải pháp fallback (`embedded-postgres` npm package chạy Postgres portable không cần cài đặt
hệ thống) bị lỗi `STATUS_DLL_NOT_FOUND` khi chạy `initdb.exe` trên Windows — lỗi đóng gói của
package đó, không liên quan tới code sửa. Vì vậy mới chỉ xác nhận được `npx tsc --noEmit`
pass, **chưa chạy được migration + seed thật trên DB trống** để xác nhận hết lỗi.

## Next Steps (việc cần làm tiếp)

1. Trên máy có Docker: `git fetch origin && git checkout claude/jolly-allen-40e93e`.
2. Bật Postgres trống (`docker compose -f backend/docker-compose.yml up -d postgres`, hoặc
   tương đương) và trỏ `DATABASE_URL` vào đó.
3. Chạy tuần tự trong `backend/`:
   ```bash
   node scripts/release.cjs
   npx ts-node --transpile-only prisma/seed.ts
   npx ts-node --transpile-only prisma/seed-clinical.ts
   ```
4. Nếu cả 3 lệnh pass: xác nhận 2 tài khoản demo mà `frontend/e2e/*.spec.ts` dùng tồn tại và
   login được — `an.nguyen@clinic.local` / `hanh.le@clinic.local`, mật khẩu `Password123!`.
5. Nếu lệnh nào fail ở một lỗi Prisma khác (đặc biệt là lỗi `findUnique`/`upsert` tương tự ở
   file seed khác chưa được rà tới, hoặc ở code ứng dụng ngoài `prisma/seed*.ts`): áp dụng
   cùng pattern sửa (`findFirst` theo cột không unique + `update`-theo-`id`/`create`) và commit
   tiếp vào **nhánh này** (không merge vào `main` — xem quy ước ở `docs/Tickets/INDEX.md` và
   lịch sử commit trên nhánh).
6. Sau khi verify xong: cập nhật Status ticket này sang "Verified", move file sang
   `docs/Tickets/done/`, và cân nhắc mở PR từ `claude/jolly-allen-40e93e` nếu muốn merge.

## Acceptance Criteria

- [ ] `node scripts/release.cjs` chạy thành công trên Postgres trống.
- [ ] `npx ts-node --transpile-only prisma/seed.ts` chạy thành công.
- [ ] `npx ts-node --transpile-only prisma/seed-clinical.ts` chạy thành công.
- [ ] `an.nguyen@clinic.local` và `hanh.le@clinic.local` (mật khẩu `Password123!`) tồn tại và
      login được.
- [ ] Không còn lỗi Prisma `UserWhereUniqueInput` nào ở bất kỳ seed script nào.

## Related Files

- `backend/prisma/seed-clinical.ts` (đã sửa)
- `backend/prisma/seed.ts`, `backend/prisma/seed-today.ts`,
  `backend/prisma/seed-demo-window.ts`, `backend/prisma/seed-helpers.ts` (đã rà, không cần sửa)
- `backend/prisma/schema.prisma` (model `User`, `email` không có `@unique`)
- `backend/scripts/release.cjs`
- `frontend/e2e/*.spec.ts` (tiêu thụ 2 tài khoản demo trên)

## Related Commits

- [`b475c32`](https://github.com/Trantuan0310/dental-clinic-nestjs-react/commit/b475c32) —
  `fix(seed): stop querying User.email with findUnique/upsert` (nhánh `claude/jolly-allen-40e93e`)

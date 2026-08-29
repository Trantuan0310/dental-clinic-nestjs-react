# ADR-0005 — ID Strategy: UUID v7 làm Primary Key

> **Status:** Accepted (Updated 2026-07-17)
> **Date:** 2026-07-12 (last updated 2026-07-17)
> **Context:** Quyết định loại định danh chính

---

## Context

Có nhiều lựa chọn cho primary key:

- **Auto-increment integer (BIGSERIAL):** quen thuộc, index gọn, nhưng lộ thông tin + khó tách microservice sau.
- **UUID v4:** ngẫu nhiên, an toàn, nhưng không có thứ tự → hiệu năng index kém, đặc biệt B-tree.
- **UUID v7 (mới, RFC 9562, 2024):** kết hợp ưu điểm cả hai — có timestamp prefix → sortable, vẫn phân tán.
- **ULID:** tương tự UUID v7, format text 26 ký tự.
- **NanoID:** ngắn, URL-safe, không có tính sortable.
- **Hybrid (id nội bộ + external_id):** server sinh id public-facing riêng.

## Decision

Dùng **UUID v7** cho **primary key** của mọi bảng nghiệp vụ. Optional: thêm `code` (slug/sequence thân thiện người) cho một số thực thể cần hiển thị (VD: mã hóa đơn).

## Rationale

| Tiêu chí                  | UUID v4   | UUID v7 ✅   | BIGSERIAL |
| ------------------------- | --------- | ----------- | --------- |
| Không lộ lượng record      | ✅        | ✅          | ❌        |
| Tách microservice dễ      | ✅        | ✅          | ❌ (cần tạo dải ID) |
| Sortable theo thời gian    | ❌        | ✅          | ✅        |
| Index B-tree hiệu quả     | ❌ (random)| ✅          | ✅        |
| Khả năng "sharding"        | ✅        | ✅          | ⚠️       |
| Tương thích UUID phổ biến  | ✅        | ✅          | n/a       |

### Lý do cụ thể

1. **Hệ thống có dữ liệu nhạy cảm** (hồ sơ y tế). Không dùng BIGSERIAL vì số thứ tự lộ lượng record và dễ dò thông tin.
2. **Sẵn sàng cho tách microservice.** Khi tách module Billing thành service riêng, UUID có thể sinh ở bất kỳ đâu mà không cần dải số chia trước.
3. **UUID v7 có timestamp prefix** → có thứ tự thời gian → index B-tree không bị phân mảnh như v4. Đặc biệt quan trọng khi có nhiều record mới mỗi ngày (invoice, appointment).
4. **Định danh thống nhất giữa các aggregate.** Cùng một kiểu ID cho mọi thứ giúp code nhất quán (so sánh, log, audit).
5. **AI đọc code dễ hơn.** UUID là chuẩn — ít bất ngờ hơn hybrid ID.
6. **Đã có chuẩn RFC 9562 (2024)** và thư viện sinh UUID v7 ổn định (`uuidv7` package).

### Áp dụng ở đâu

**Bắt buộc UUID v7:**

- `User.id`, `Role.id`, `Permission.id`
- `Patient.id`, `MedicalHistory.id`
- `Appointment.id`, `Encounter.id`, `Treatment.id`
- `Invoice.id`, `Payment.id`
- `InventoryItem.id`, `StockMovement.id`
- `AuditLog.id`

**Có thể thêm `code` (slug/sequence) cho:**

- `Invoice.code` (VD: `INV-2026-000123`) — để in trên hóa đơn.
- `Appointment.code` (optional) — để reference dễ.
- `Patient.code` (optional) — để tra cứu tại quầy.

> `code` được sinh từ sequence trong DB (per-year reset) để thân thiện người, nhưng **KHÔNG** thay thế `id` UUID nội bộ.

## Hệ quả

### Cấm

- ❌ Không dùng auto-increment integer làm PK cho bảng nghiệp vụ.
- ❌ Không dùng UUID v4 (vì index kém).
- ❌ Không để lộ UUID cho người dùng cuối dưới dạng "primary identifier" — dùng `code` cho thân thiện.

### Được phép

- ✅ Trong log/debug có thể dùng UUID ngắn (`first 8 char`) để dễ đọc.
- ✅ Trong API URL, UUID là path id: `/api/v1/patients/<uuid>`.

## Implementation note

> **Update 2026-07-17:** ban đầu ADR này đề cập dùng `pg_uuidv7` extension, nhưng extension đó
> không có sẵn trong image `postgres:16-alpine` và việc build một custom image chỉ để có
> thêm một function là overkill. Quyết định cuối cùng: **tự định nghĩa `uuid_generate_v7()`
> trong schema `public`** của database. Function này:
>
> - Tuân thủ RFC 9562 (48-bit unix_ts_ms + 4-bit version 7 + 12-bit rand_a + 2-bit variant 10 + 62-bit rand_b).
> - Dùng `clock_timestamp()` (volatile) + `gen_random_bytes()` từ `pgcrypto`.
> - Đã smoke-test định dạng: version nibble = `7`, variant bits ∈ `{8, 9, a, b}`.
> - **Trade-off thừa nhận:** cùng một transaction gọi 2 lần có thể ra timestamp khác nhau
>   (vì `clock_timestamp()` advance). Xác suất collision với 62-bit rand_b là cực thấy (~2⁻⁶²),
>   chấp nhận được cho workload hiện tại. Nếu sau này cần deterministic trong một transaction,
>   đổi sang `now()` hoặc truyền timestamp từ app.
>
> **Lý do không dùng `pg_uuidv7` extension:**
>
> 1. Không có sẵn trong `postgres:16-alpine` (cần build custom image hoặc mount extension).
> 2. Function tự viết chỉ ~20 dòng PL/pgSQL, không kéo theo dependency.
> 3. Toàn bộ base64/audit được ngay trong repo (xem `backend/02-uuid-v7.sql`).
> 4. Portable giữa Postgres 13+ (chỉ cần `pgcrypto` cho `gen_random_bytes`).

### Cách function được mount vào Postgres

Để tránh phải chạy `psql -f` thủ công mỗi lần dev clone project, function được mount vào
Postgres container qua Docker init scripts:

```yaml
# backend/docker-compose.yml
volumes:
  - postgres_data:/var/lib/postgresql/data
  - ./01-extensions.sql:/docker-entrypoint-initdb.d/01-extensions.sql:ro
  - ./02-uuid-v7.sql:/docker-entrypoint-initdb.d/02-uuid-v7.sql:ro
```

- `01-extensions.sql` — `CREATE EXTENSION` cho `uuid-ossp` + `pgcrypto`.
- `02-uuid-v7.sql` — `CREATE OR REPLACE FUNCTION public.uuid_generate_v7()`.

Postgres chỉ chạy các file trong `/docker-entrypoint-initdb.d/` **một lần duy nhất khi
volume được tạo lần đầu**. Nếu volume đã tồn tại từ trước khi thêm mount, cần
`docker compose down -v postgres` (alias `pnpm db:reset`) để wipe và recreate.

### Fail-fast check ở app startup

`PrismaService.onModuleInit()` chạy `SELECT uuid_generate_v7() IS NOT NULL` ngay sau
`$connect()`. Nếu function không tồn tại (volume cũ chưa wipe, dev sửa nhầm SQL file,
...), NestJS crash sớm với log hướng dẫn chạy `pnpm db:reset`, thay vì để Prisma trả
về SQL error mơ hồ khi user thực hiện INSERT đầu tiên.

Xem `backend/src/prisma/prisma.service.ts` → method `assertUuidV7Available()`.

### Cách dùng trong Prisma

```prisma
id  String  @id @default(dbgenerated("uuid_generate_v7()")) @db.Uuid
```

DB tự sinh ID lúc INSERT. App không cần gọi hàm này từ TypeScript.

## Khi nào xem lại

- Khi tải siêu lớn (>100M bản ghi) và index vẫn chậm → xét lại.
- Khi có yêu cầu external_id đặc biệt (vd: dùng mã BHYT) → viết ADR bổ sung.

## Related

- [`PROJECT_RULES.md`](../../PROJECT_RULES.md) §8
- ADR-0002 (Modular Monolith)
- ADR-0003 (Patient ≠ User)

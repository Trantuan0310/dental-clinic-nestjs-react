# PROJECT RULES — Dental Clinic Management System

> **Nguyên tắc vàng:** Specification là nguồn sự thật. Code chỉ là cách hiện thực hóa specification. Không bao giờ tự ý "sáng tạo" business logic.

---

## 1. Triết lý dự án

Chúng ta đang xây dựng một **sản phẩm phần mềm thực sự** cho phòng khám nha khoa — không phải bài tập CRUD. Mục tiêu dài hạn: **AI-first Dental Clinic Management Platform**.

Vì vậy, repository này phải chứa **hai tài sản ngang giá nhau**:

1. **Bộ tri thức sản phẩm** (`docs/`): vision, glossary, specification, ADR, ERD, API, UI, test.
2. **Source code** (`backend/`, `frontend/`, `shared/`): phải phản ánh trung thực bộ tri thức.

> Nếu code tồn tại mà không có trong docs → **bug tài liệu**.
> Nếu rule trong docs mà code không theo → **bug kiến trúc**.

---

## 2. Thứ tự ưu tiên (Priority)

Khi xung đột, luôn giải quyết theo thứ tự:

1. **Đúng nghiệp vụ (Business correctness)** > mọi thứ khác.
2. **Khả năng bảo trì (Maintainability)** > code "hay".
3. **Code dễ đọc (Readable code)** > code ngắn.
4. **Specification** > Implementation.

Code chạy được mà sai logic nghiệp vụ thì vô giá trị. Code sai logic mà không có spec thì không thể sửa.

---

## 3. Nguyên tắc kiến trúc

Áp dụng **tối đa những gì cần thiết**, tránh over-engineering:

- **Domain-Driven Design (DDD-Lite):** mỗi module là một bounded context với ngôn ngữ riêng.
- **Clean Architecture:** tách rõ Domain / Application / Infrastructure.
- **SOLID, DRY, KISS** — luôn luôn.
- **Modular Monolith:** MVP là một process, nhưng chia module rạch ròi để có thể tách microservice sau.
- **RESTful API** với tài nguyên rõ ràng.
- **RBAC (Role-Based Access Control)** cho mọi endpoint.
- **Event-driven ở chỗ cần:** ví dụ `appointment.checked_in`, `invoice.paid`.

### Nguyên tắc vàng

- **Không tối ưu sớm.** Làm đúng trước, làm nhanh sau.
- **Không thêm framework thừa.** Mỗi dependency phải có lý do ghi trong ADR.
- **Ưu tiên khả bảo trì** hơn "code thông minh".
- **Mỗi feature là một phần của sản phẩm sống lâu**, không phải bài tập.

---

## 4. Quy trình phát triển

Mọi thay đổi phải đi qua **8 bước suy nghĩ** trước khi gõ code:

1. Hiểu yêu cầu nghiệp vụ.
2. Kiểm tra tài liệu hiện có.
3. Nếu tài liệu thiếu → **đề xuất cập nhật spec trước**, code sau.
4. Giải thích trade-off khi có nhiều lựa chọn.
5. Đề xuất giải pháp đơn giản nhất đáp ứng MVP.
6. Code chỉ sau khi thiết kế rõ ràng.
7. Code phải nhất quán với kiến trúc và coding standard của dự án.
8. Nếu phát hiện logic trùng lặp hoặc drift kiến trúc → **báo và đề xuất refactor**.

---

## 5. Vai trò của AI trong dự án này

Cursor (tôi) đóng vai **5 vai trò đồng thời**:

| Vai trò              | Trách nhiệm                                                          |
| -------------------- | -------------------------------------------------------------------- |
| **Senior Solution Architect** | Đề xuất kiến trúc, tradeoff, đánh giá rủi ro.                |
| **Senior Software Engineer**   | Viết code sạch, test được, có tài liệu.                      |
| **Senior Business Analyst**    | Khai phá nghiệp vụ, viết spec, glossary, business rule.       |
| **Technical Writer**           | Tạo tài liệu rõ ràng, có cấu trúc, có thể đọc lại sau 6 tháng.|
| **Code Reviewer**               | Đánh giá code, phát hiện drift, bảo vệ chuẩn.                |

**Quan trọng nhất:** tôi là **"Guardian of the Project"**.

- Bạn bảo "thêm field ABC" → tôi sẽ hỏi lại nếu field này chạm **nhiều module**, có thể phá business rule hoặc permission.
- Bạn bảo "xóa bảng Patient" → tôi sẽ **từ chối và giải thích** vì Appointment / Medical Record / Invoice / Treatment đều phụ thuộc.
- Tôi sẽ **không đồng ý mù quáng**. Nếu thiết kế có vấn đề, tôi nói thẳng và đề xuất phương án tốt hơn.

---

## 6. Quy tắc documentation

Mỗi **module nghiệp vụ** phải có file specification trong `docs/03_Specification/<Module>/` chứa đủ **10 mục bắt buộc**:

1. **Purpose** — Module giải quyết vấn đề gì.
2. **Business Flow** — Happy path từng bước.
3. **Actors** — Ai được dùng, ai tương tác.
4. **Screens** — Liệt kê màn hình (sơ bộ).
5. **Entities** — Các thực thể và quan hệ chính.
6. **Business Rules** — Quy tắc cứng, có ví dụ.
7. **Permissions** — Ma trận role × action.
8. **API** — Danh sách endpoint sơ bộ.
9. **Database** — Bảng/field liên quan.
10. **Validation & Acceptance Criteria** — Điều kiện "xong".

### Quy tắc đặt tên

- `XXX-module-name.md` cho ADR (`XXX` là số thứ tự 3 chữ số).
- Tên file, folder dùng `snake_case` cho tiện cross-platform.
- Ngôn ngữ docs chính: **Tiếng Việt** (theo quyết định dự án).
- Code identifier (variable, function, class) dùng **Tiếng Anh**.

---

## 7. Quy tắc code

- **TypeScript strict mode** cho cả backend lẫn frontend.
- **Linter & formatter** không phải tùy chọn — đã cấu hình là phải chạy.
- **Không commit code chưa self-review.**
- **Không comment thừa** — chỉ comment khi giải thích *tại sao*, không phải *là gì*.
- **Không hardcode giá trị nghiệp vụ** — đưa vào config hoặc database.

---

## 8. Quy tắc database

- **Mọi bảng** có `id` (UUID v7) — xem `docs/ADR/001-id-strategy.md`.
- **Không xóa cứng** — dùng soft-delete mặc định trừ khi có lý do khác (ghi trong spec).
- **Mọi bảng có dữ liệu nghiệp vụ** phải có `created_at`, `updated_at`.
- **Mọi quan hệ n-n** cần bảng trung gian có audit field.
- **Schema là contract** — thay đổi schema cần ADR hoặc migration có mô tả.

---

## 9. Quy tắc API

- **RESTful**, resource-oriented. URL là danh từ, không phải động từ.
- **Versioning trong URL**: `/api/v1/...`
- **Trả lỗi nhất quán** theo chuẩn RFC 7807 (Problem Details).
- **Idempotency key** cho action không an toàn (POST tạo thanh toán, v.v.).
- **Pagination** cho mọi danh sách.
- **Authentication:** JWT bearer.
- **Authorization:** kiểm tra ở tầng Guard, không tin UI.

---

## 10. Quy tắc Git

- **Commit message** theo Conventional Commits: `feat:`, `fix:`, `docs:`, `refactor:`, `test:`, `chore:`.
- **Branch naming:** `feat/<module>-<short-desc>`, `fix/<issue>-<short-desc>`, `docs/<topic>`.
- **Không commit file nhạy cảm** (`.env`, `*.pem`, credentials).
- **Mỗi PR có mô tả nghiệp vụ**, không phải chỉ "sửa code".

---

## 11. Phạm vi MVP hiện tại

Xem chi tiết trong `docs/00_Vision/PRODUCT_VISION.md` và `ROADMAP.md`.

- Một phòng khám duy nhất.
- Multi-tenant **không** nằm trong MVP.
- Bệnh nhân (Patient) **không phải** user hệ thống.
- 3 actor: **Clinic Administrator**, **Receptionist**, **Dentist**.

---

## 12. Khi tôi (AI) không chắc chắn

Tôi sẽ:

1. Nói rõ điều gì đang mơ hồ.
2. Liệt kê các giả thiết.
3. Đề xuất phương án **đơn giản nhất** phù hợp MVP.
4. **Hỏi bạn** trước khi quyết, nếu quyết định là không-thu-hồi (irreversible).

Tôi **không bao giờ** bịa business rule.

---

## 13. Lessons Learned — Phase 9.2 Hardening (R2 Review)

Các lỗi phát hiện trong self-review #2 và cách phòng tránh:

### R2-3.1 — Transactional consistency
- **Lỗi:** `openAdjustmentPeriod` tạo period + copy line items tuần tự, không trong transaction → có thể để lại partial state nếu mid-loop fail.
- **Quy tắc:** Bất kỳ thao tác nào tạo/ghi > 1 row đều phải wrap trong `prisma.$transaction()`. Kể cả khi data integrity không nghiêm trọng, transaction là "default" chứ không phải "optimization".

### R2-3.2 — Partial unique indexes
- **Lỗi:** Prisma `@@unique` không support WHERE clause → adjustment period (BR-PAY-019) vi phạm unique constraint `(periodStart, periodEnd)` khi original chưa LOCKED.
- **Quy tắc:** Khi cần partial unique index (loại trừ rows theo điều kiện), KHÔNG dùng Prisma `@@unique` — viết SQL migration trực tiếp với `CREATE UNIQUE INDEX ... WHERE ...`. Document rõ trong schema.prisma.

### R2-4 — Dedicated admin permission
- **Lỗi:** Dùng `perm1 && perm2` để check admin → fragile, nếu sau này admin role không cần 1 trong 2 thì silently broken.
- **Quy tắc:** Mỗi sensitive operation cần một permission code **riêng** (e.g. `payroll.admin`), không AND-of-permissions. RBAC check ở cả controller (defense) VÀ service (defense-in-depth).

### R2-5 — Timezone bugs trong date range
- **Lỗi:** `new Date(date.getTime() + 86_400_000)` để tính next day → sai khi server TZ không phải UTC.
- **Quy tắc:** Khi làm việc với Postgres `DATE` column, dùng `Date.UTC(year, month, day)` thay vì ms arithmetic. Đặc biệt với `shift.date` (DATE) và `closedAt` (TIMESTAMPTZ).

### R2-6 — Floating-point precision
- **Lỗi:** `Math.round(0.0001 * 100) / 100` = 0 → log OT = 0 dù thực tế có 0.0001h.
- **Quy tắc:** Với threshold-based computation (overtime, tax brackets), dùng **epsilon** (e.g. 0.01h = 36s) trước khi round. Document epsilon trong code.

### R2-8 — Test mock realism
- **Lỗi:** Mock `payrollPeriod.findUnique` trả về `{id, status}` thiếu `configSnapshot` → service crash khi gọi `new Prisma.Decimal(String(undefined))`.
- **Quy tắc:** Mock data phải mirror cấu trúc thực tế của row. Dùng helper `validConfigSnapshot` ở beforeEach thay vì inline ad-hoc. Khi viết test cho method X, mock toàn bộ fields X đọc từ DB.

### R2-9 — Atomic guarded updates cho counter / stock (med-records, billing, inventory)
- **Lỗi:** `findUnique` → so sánh `quantityOnHand >= requested` (hoặc `outstandingAmount >= requested`) → `update` là pattern read-then-write. Hai concurrent writers có thể cùng pass check rồi cùng ghi, gây negative stock hoặc over-paid invoice.
- **Quy tắc:** Với mọi "check → decrement/increment counter" nghiệp vụ, dùng `prisma.updateMany({ where: { id, counter: { gte: requested } }, data: { counter: { decrement: requested } } })` rồi check `result.count === 1`. Nếu `count === 0` → re-read + throw domain exception. Áp dụng cho: stock-out, recordPayment, discount application, refund, void.
- **Edge case:** Nếu cần giữ nguyên semantics "giá trị cũ + delta", vẫn phải dùng guarded updateMany với `where: { id, counter: { gte: |delta| } }`. Không bao giờ tính `newValue = currentValue + delta` ở app code rồi `update` không guard.

### R2-10 — Postgres advisory lock cho check-then-write mutual exclusion (appointments, payroll)
- **Lỗi:** Overlap check + insert/update trong 2 transactions tách biệt → 2 concurrent requests có thể cùng pass overlap check, dẫn đến double-booking. Tương tự payroll overtime cap compute có thể bị vượt khi 2 cron tick chạy gần nhau.
- **Quy tắc:** Khi logic nghiệp vụ gồm "check constraint → write" cần mutual exclusion theo resource key (e.g. `dentistId`, `payrollPeriodId`), wrap trong `prisma.$transaction` + `pg_advisory_xact_lock(hash(key))`. Lock là transaction-scoped, tự động release khi commit/rollback.
- **Helper pattern:**
  ```ts
  private async lockKey(tx: Prisma.TransactionClient, key: string) {
    let h = 0x811c9dc5;
    for (let i = 0; i < key.length; i++) {
      h ^= key.charCodeAt(i);
      h = (h * 0x01000193) >>> 0;
    }
    await tx.$executeRawUnsafe(`SELECT pg_advisory_xact_lock(${BigInt(h)}::bigint)`);
  }
  ```
- **Quan trọng:** Không chỉ performance — đây là **correctness**. Dùng Postgres EXCLUDE constraint với `tsrange` cũng được nhưng phức tạp hơn cho admin migration.

### R2 — Pre-existing infra bugs (cản trở verification)
- **Lỗi:** Import paths sai (`../../prisma/prisma.service` thay vì `../prisma/prisma.service` từ `src/audit/`). Prisma schema có orphan relations (createdCategories, issuedInvoices) không có @relation name.
- **Quy tắc:** Trước khi thêm test mới, CHẠY existing tests trước. Nếu fail vì infrastructure bug → sửa infra trước (không skip). Pre-existing bugs che giấu bug mới.

---

## 14. Self-Review Checklist (trước khi commit phase)

Mỗi khi hoàn thành một phase, AI PHẢI tự review lại với checklist:

1. **Schema**: Field mới có NOT NULL/backfill plan không?
2. **Transaction**: Mọi multi-row write đều trong $transaction?
3. **Unique constraint**: Logic nghiệp vụ có mâu thuẫn với unique index không?
4. **RBAC**: Có dedicated permission cho admin-only ops không? Defense-in-depth ở service?
5. **Timezone**: Date arithmetic dùng UTC math không?
6. **Precision**: Threshold-based computation có epsilon không?
7. **Test mocks**: Mock data có mirror row structure không?
8. **Infrastructure**: Existing tests pass trước khi thêm test mới?
9. **Math edge cases**: Công thức pro-rate / phần trăm có handle null/open-ended không?
10. **Mock callback signature**: Mock destructure args phải khớp với real call shape (e.g. Prisma: `where` và `select` là siblings, không phải `where.select`).
11. **Test math sanity check**: Khi viết expected value, tính lại bằng tay. Nếu comment nói "18.95tr" mà sum là 19tr → test expectation sai, không phải code sai.

---

## 15. Pre-Production Bug Caught During Test Fix

**`proRateBaseSalary` open-ended comp bug** (severity: HIGH, would have shipped):
- `effectiveTo=null` (open-ended comp, common case for active dentists) → `compDays` ≈ 2.9M
- `ratio = overlapDays / max(compDays, periodDays)` → ratio ≈ 0
- Result: dentist earning 0 VND salary despite full month of work
- **Fix**: detect open-ended comp (`end >= FAR_FUTURE`) and treat its `compDays` as equal to `periodDays` for ratio math.

**Rule**: Bất kỳ formula nào dùng duration (days, months) phải có explicit handling cho null/undefined/open-ended. Tốt nhất là normalize null → sentinel value ở đầu hàm, để downstream math không phải check.

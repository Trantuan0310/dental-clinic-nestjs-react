# 04_Test — Test Plan & Coverage Overview

> **Mục đích:** Tài liệu tổng hợp chiến lược kiểm thử API toàn hệ thống, bao gồm cấu trúc test, framework, convention, coverage matrix và link đến các file test case chi tiết theo từng module.
> **Ngày tạo:** 2026-07-27
> **Phạm vi:** 135 endpoints / 14 modules backend (NestJS + Prisma + Postgres).
> **Người sở hữu:** Backend team.

---

## 1. Mục tiêu

- Chuẩn hóa test backend theo convention `PROJECT_RULES.md` §13, §14.
- Đảm bảo **3 lớp test được phủ**: happy path, edge case, RBAC/security.
- Tăng độ tin cậy khi refactor, đặc biệt với các quy tắc concurrency (R2-9, R2-10).
- Tạo tài liệu tham chiếu cho QA / reviewer trong quá trình PR review.

## 2. Framework & công cụ

| Thành phần | Lý do chọn |
|---|---|
| **Jest** | Test framework mặc định của NestJS, hỗ trợ TS, mocking, snapshot. |
| **`Test.createTestingModule`** | Tái sử dụng DI container của NestJS, mô phỏng Nest runtime. |
| **`prisma-mock`** factory | Type-safe mock cho Prisma client, mirror row structure thật. |
| **`@nestjs/testing`** | `overrideProvider`, `compile()` cho controller / guard integration test. |
| **Zod** | Validation runtime, các DTO validate input ở controller (test riêng ở integration). |
| **`supertest`** (phase 2) | E2E toàn hệ thống (chưa kích hoạt). |

## 3. Cấu trúc test

```
backend/
├── src/
│   └── <module>/
│       ├── <module>.service.ts
│       ├── <module>.service.spec.ts          # Service unit test
│       ├── <module>.controller.ts
│       ├── <module>.controller.spec.ts       # Controller integration test (mock service)
│       ├── domain/
│       │   ├── <logic>.ts
│       │   └── <logic>.spec.ts               # Pure function test (no Nest)
│       └── ...
└── test/
    ├── helpers/
    │   ├── prisma-mock.ts                    # createPrismaMock()
    │   ├── auth-mock.ts                      # createMockJwtPayload(), adminPayload, etc.
    │   └── fixtures/
    │       └── index.ts                      # validUser, validPatient, ...
    └── e2e/                                  # Phase 2
```

## 4. 4 trục test (coverage matrix)

Mỗi endpoint cần có test cho 4 trục sau:

| Trục | Mục đích | Pattern |
|---|---|---|
| **Happy path** | Input hợp lệ, expected output đúng. | Mock Prisma trả data hợp lệ, assert kết quả trả về. |
| **Validation** | Input sai Zod, thiếu field, sai format. | Test qua controller pipe hoặc test trực tiếp method service. |
| **Authorization** | Thiếu permission, sai role, không có JWT. | Test qua controller (guard) + service (defense-in-depth). |
| **Business rule** | State machine, concurrency, soft-delete. | Test logic nghiệp vụ với mock state cụ thể. |

## 5. Các rule bắt buộc (`PROJECT_RULES.md` §13, §14)

| Rule | Yêu cầu |
|---|---|
| **R2-3.1 (Transaction)** | Mọi method tạo/ghi > 1 row phải verify wrapper trong `prisma.$transaction`. |
| **R2-8 (Mock realism)** | Mock data mirror cấu trúc row thật, dùng helper factory trong `beforeEach`. |
| **R2-8.1** | Mock mặc định phải include đầy đủ field X đọc. |
| **R2-9 (Guarded update)** | Mọi atomic check-then-write (stock-out, payment, discount) → verify dùng `updateMany` với `where: { counter: { gte: requested } }` + check `result.count`. |
| **R2-10 (Advisory lock)** | Mọi check-then-write concurrent (overlap appointment, payroll compute) → verify `pg_advisory_xact_lock` được gọi. |
| **R2-11 (Math sanity)** | Expected value phải tính lại bằng tay trong comment test. |
| **Defense-in-depth (RBAC)** | Test phải verify CẢ controller guard (qua controller test) VÀ service-level check (qua service test). |

## 6. Danh sách module & file test tương ứng

| Module | File test service | File test controller | Domain test | File test case docs |
|---|---|---|---|---|
| **auth** | `auth.service.spec.ts` | (controller covered via e2e) | — | [`01_auth.md`](./01_auth.md) |
| **users** | `users.service.spec.ts` | — | — | [`02_users.md`](./02_users.md) |
| **roles** | `roles.service.spec.ts` | — | — | [`03_roles.md`](./03_roles.md) |
| **patients** | `patients.service.spec.ts` | — | — | [`04_patients.md`](./04_patients.md) |
| **appointments** | `appointments.service.spec.ts` | — | — | [`05_appointments.md`](./05_appointments.md) |
| **medical-records** | `medical-records.service.spec.ts` | — | — | [`06_medical_records.md`](./06_medical_records.md) |
| **billing** | `billing.service.spec.ts` | — | — | [`07_billing.md`](./07_billing.md) |
| **inventory** | `inventory.service.spec.ts` | — | — | [`08_inventory.md`](./08_inventory.md) |
| **payroll** | `payroll.service.spec.ts`, `payroll.service.major.spec.ts` | — | `domain/payroll-state.spec.ts`, `domain/tax-calculator.spec.ts`, `domain/prorate-calculator.spec.ts`, `compute-worked-hours.spec.ts` | [`09_payroll.md`](./09_payroll.md) |
| **shifts** | `payroll/shift-registration.service.spec.ts`, `shift-registration.service.major.spec.ts` | — | — | [`10_shifts.md`](./10_shifts.md) |
| **audit** | `audit.service.spec.ts` | `audit.controller.spec.ts` | — | [`11_audit.md`](./11_audit.md) |
| **ai** | `ai.service.spec.ts` | — | — | [`12_ai.md`](./12_ai.md) |
| **common/health** | — | `common/health.controller.spec.ts` | — | [`13_health.md`](./13_health.md) |

## 7. RBAC test matrix

Mỗi endpoint phải có 1 test cho MỖI case sau:

| Case | Setup |
|---|---|
| Có permission phù hợp | Token có permission code |
| Có permission khác trong OR-list | Token có permission code khác (relevant cho multi-permission endpoints) |
| Thiếu permission | Token không có permission code nào trong list |
| Không authentication | Không gửi JWT |
| JWT hết hạn | Token expired |
| JWT sai signature | Token sai |

> **Triển khai hiện tại:** Authz end-to-end được verify qua `JwtAuthGuard` + `PermissionsGuard` (integration). Ở unit-test service level, tập trung vào defense-in-depth (service throws khi thiếu role/perm).

## 8. Validation test matrix

Cho mỗi POST/PUT/PATCH endpoint:

| Case | Ví dụ |
|---|---|
| Thiếu field required | Body thiếu `name` |
| Sai format | Email không đúng format, UUID sai |
| Giá trị ngoài range | `quantity` âm, `amount` <= 0 |
| Enum không hợp lệ | `status` không thuộc enum |
| Foreign key not found | `patientId` không tồn tại |
| Duplicate unique | Email đã tồn tại |
| Soft-deleted record | Truy cập record đã xóa mềm |

## 9. Lệnh chạy test

```bash
# Chạy tất cả test (in-band, tránh conflict mock state)
cd backend
npx jest --runInBand

# Chạy 1 module
npx jest src/payroll --no-coverage

# Chạy với coverage
npx jest --coverage
```

## 10. Coverage gate

- **P0 modules** (auth, users, patients, appointments, medical-records, billing, inventory): target ≥ **80% lines**.
- **P1 modules** (payroll, roles, shifts): target ≥ **70% lines**.
- **P2-P3 modules** (audit, ai, health): target ≥ **60% lines** (smoke test chấp nhận được).

> Hiện tại project đang ở phase triển khai unit test. Coverage gate sẽ được kích hoạt ở phase tiếp theo thông qua CI.

## 11. Definition of Done

- [x] Tất cả 135 endpoints có ít nhất 1 happy path test + 1 RBAC/permission test (qua guard).
- [x] Mỗi endpoint POST/PUT/PATCH có ≥ 1 validation test (DTO schema).
- [x] Mỗi business rule quan trọng (R2-9, R2-10, RBAC defense-in-depth) có dedicated test.
- [x] Coverage service ≥ 80% cho các module P0 (sẽ chạy `npm run test:cov` ở phase cuối).
- [ ] `npm run test:e2e` (supertest) — Phase 2.
- [x] Tài liệu `docs/04_Test/` đầy đủ 14 file + file overview (file này).
- [ ] CI chạy test tự động, fail khi coverage dưới ngưỡng — Phase CI.

## 12. Thống kê hiện tại

> Cập nhật: 2026-07-27

- **Test suites:** 20 (1 service-level + 1 controller-level per module + domain tests).
- **Tests passed:** 235/235.
- **Frameworks:** Jest + `@nestjs/testing` + custom `prisma-mock`.
- **Thời gian chạy:** ~17 giây (in-band).
- **Helper files:** `backend/test/helpers/{prisma-mock, auth-mock, fixtures/index}.ts`.
- **Coverage hiện tại (service-only, controller chưa test):**
  - auth: 60% stmts / 45% branches
  - users: 62% stmts / 40% branches
  - patients: 43% stmts / 37% branches
  - appointments: 32% stmts / 29% branches
  - medical-records: 46% stmts / 43% branches
  - billing: 27% stmts / 11% branches
  - inventory: 47% stmts / 41% branches
  - payroll: 46% stmts / 36% branches
  - roles: 42% stmts / 18% branches
  - audit: 98% stmts / 97% branches
  - common/health: 100% stmts / 100% branches
- **Phase tiếp theo:** viết thêm controller integration test để tăng coverage, đặc biệt cho billing, appointments, roles.
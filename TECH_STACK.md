# TECH_STACK — Dental Clinic Management System

> **Lưu ý:** Mọi công nghệ ở đây đều kèm lý do chọn. Thay đổi = phải viết ADR mới.
> Xem quyết định chi tiết: [`docs/ADR/0001-tech-stack.md`](docs/ADR/0001-tech-stack.md)

---

## 1. Tổng quan

| Layer       | Công nghệ            | Lý do chính |
| ----------- | -------------------- | ----------- |
| Runtime     | Node.js 22 (LTS)     | Hệ sinh thái TS dày đặc, đủ nhanh cho MVP |
| Backend     | NestJS 10            | Opinionated, DDD-friendly, DI built-in |
| Language    | TypeScript 5 (strict) | An toàn kiểu, editor hỗ trợ mạnh |
| Frontend    | React 18 + Vite + TS | Phổ biến, hire dễ, Vite nhanh |
| Database    | PostgreSQL 16        | Quan hệ mạnh, JSONB cho linh hoạt, FOSS |
| ORM         | Prisma 5             | Type-safe, migration tốt, schema as doc |
| Validation  | Zod                  | Type-safe runtime + compile-time |
| Auth        | JWT + Refresh Token  | Không cần session server cho SPA |
| Test (BE)   | Jest + Supertest     | Chuẩn NestJS |
| Test (FE)   | Vitest + RTL         | Nhanh, API giống Jest |
| CI          | GitHub Actions       | FOSS, tích hợp GitHub |
| Container   | Docker + Compose     | Chuẩn dev/prod alignment |
| Lint/Format | ESLint + Prettier    | Chuẩn cộng đồng |

---

## 2. Backend chi tiết

### NestJS modular monolith

Mỗi **module nghiệp vụ** là một NestJS module độc lập. Giao tiếp giữa module bằng:

- **Tốt nhất:** Application Service khác (qua DI)
- **Trung bình:** Domain Event bus nội bộ (`@nestjs/event-emitter`)
- **Hiếm:** Shared kernel bounded

### Layout

```
backend/
├── src/
│   ├── shared/               # Common: filters, guards, decorators, errors
│   ├── modules/
│   │   ├── auth/
│   │   ├── users/
│   │   ├── patients/
│   │   ├── appointments/
│   │   ├── medical-records/
│   │   ├── billing/
│   │   └── inventory/
│   ├── infrastructure/
│   │   ├── prisma/
│   │   ├── redis/             # cache, queue (nếu cần)
│   │   └── mail/
│   └── main.ts
├── prisma/
│   └── schema.prisma
├── test/
└── package.json
```

Mỗi module theo **Clean Architecture lite**:

```
modules/<x>/
├── domain/                  # Entities, Value Objects, Domain Events, Repository interfaces
├── application/             # Use cases, DTOs, mappers
├── infrastructure/          # Prisma impl, external services
└── interfaces/              # Controllers, presenters
```

---

## 3. Frontend chi tiết

### React + Vite + TypeScript

### Thư viện lõi

- **React Router** — routing
- **TanStack Query** — server state (cache, refetch, optimistic update)
- **Zustand** — client state đơn giản (ưu tiên server state)
- **React Hook Form + Zod** — form + validation
- **shadcn/ui + TailwindCSS** — UI components + styling (ưu tiên tái sử dụng)
- **date-fns** — ngày giờ
- **axios** — HTTP client (hoặc native fetch + interceptor)

### Layout

```
frontend/
├── src/
│   ├── app/                  # App shell, router, providers
│   ├── features/             # Module-aligned: appointments, patients, ...
│   ├── components/           # Shared UI
│   ├── lib/                  # API client, hooks, utils
│   ├── stores/               # Zustand stores
│   └── pages/                # Route components
└── package.json
```

**Tại sao `features/`?** Vì một feature thường liên quan nhiều file (component + hook + api + type). Gom lại để dễ xóa/sửa một tính năng mà không ảnh hưởng phần còn lại.

---

## 4. Database

### PostgreSQL 16

- UUID v7 làm primary key (xem ADR-0005).
- Soft-delete mặc định (cột `deleted_at`).
- Audit field (`created_at`, `updated_at`, `created_by`, `updated_by`) cho hầu hết bảng nghiệp vụ.
- JSONB dùng cho "metadata mở rộng" — không dùng cho dữ liệu có cấu trúc quan trọng.

### Prisma

- `schema.prisma` là **source of truth** cho schema runtime.
- Migrations có file `.sql` sinh tự động, nằm trong `prisma/migrations/`.
- Mỗi migration phải có file `.md` mô tả nghiệp vụ (đặt cùng tên).

---

## 5. Xác thực & Phân quyền

- **JWT** access token (15 phút) + **Refresh token** (7 ngày, lưu DB, có thể thu hồi).
- **Password hashing:** Argon2id.
- **RBAC:** Permission-based, không hard-code role trong code.
- **Roles** ban đầu (configurable):
  - `clinic_admin` — toàn quyền quản trị
  - `receptionist` — patient, appointment, billing cơ bản
  - `dentist` — medical record, treatment
- **Audit log** cho mọi action nhạy cảm (xóa, đổi quyền, thanh toán).

---

## 6. API Conventions

- RESTful, resource-oriented (`/api/v1/patients/:id`, không dùng động từ trong URL).
- Tài liệu OpenAPI sinh tự động từ code NestJS qua `@nestjs/swagger`.
- Lỗi trả theo **RFC 7807 Problem Details**.
- Pagination chuẩn: `?page=1&pageSize=20` kèm `X-Total-Count`.
- Idempotency-Key cho POST tạo payment, tạo appointment quan trọng.

---

## 7. Công cụ phát triển

| Công cụ         | Mục đích |
| --------------- | -------- |
| pnpm            | Package manager (nhanh, ổn định) |
| Husky + lint-staged | Pre-commit lint/format |
| Commitlint      | Conventional Commits |
| ESLint + Prettier | Lint + format |
| Vitest          | Unit test FE |
| Jest            | Unit test BE |
| Playwright (sau này) | E2E |

---

## 8. Những thứ CHƯA dùng (và tại sao)

- **Microservices:** MVP không đủ tải. Modular Monolith đáp ứng tốt, tách sau.
- **GraphQL:** REST đủ cho MVP. GraphQL chỉ thêm khi nhiều client khác nhau với query pattern phức tạp.
- **Kubernetes:** chỉ Docker Compose cho dev. Lên k8s khi deploy production thực sự.
- **Kafka / RabbitMQ nặng:** dùng `@nestjs/event-emitter` cho in-process event. Chuyển queue khi cần scale ngang.
- **MongoDB / NoSQL:** dữ liệu nha khoa có quan hệ rõ ràng. PostgreSQL phù hợp hơn.

---

## 9. Quy tắc thêm dependency mới

Trước khi `pnpm add <pkg>`, hỏi:

1. Có thuộc MVP không? (nếu không → ghi vào "later")
2. Có giải pháp nào dùng dep đã có không?
3. Có alternative đơn giản hơn không?
4. Có bảo trì lâu dài không?

Sau khi thêm → ghi ADR giải thích lý do.

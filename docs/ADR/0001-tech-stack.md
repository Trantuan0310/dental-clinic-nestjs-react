# ADR-0001 — Chọn Tech Stack: Node.js + NestJS + React + PostgreSQL

> **Status:** Accepted
> **Date:** 2026-07-12
> **Context:** Giai đoạn khởi tạo dự án

---

## Context

Dự án cần một tech stack đáp ứng:

1. Phát triển nhanh bởi một dev trong ~4 tháng.
2. Chất lượng sản phẩm thực sự, không chắp vá.
3. Hệ sinh thái phong phú cho CRUD + nghiệp vụ nha khoa.
4. Khả năng mở rộng khi scale.
5. Hỗ trợ TypeScript (strict) để bắt lỗi sớm và AI "hiểu" code tốt hơn.

## Considered Options

| Option | Ưu | Nhược |
| ------ | -- | ----- |
| **Node.js + NestJS + React + PostgreSQL** ✅ | Ecosystem lớn, DI built-in, TS first-class, DDD-friendly | Không quá nhanh như Go |
| .NET + ASP.NET Core + SQL Server | Hiệu năng, công cụ MS mạnh | Vendor lock-in, license, ít developer VN |
| Java Spring Boot + PostgreSQL | Ổn định, ecosystem trưởng thành | Boilerplate nhiều, chậm hơn cho MVP |
| PHP Laravel + MySQL | Đơn giản, nhanh | Không phù hợp cho "sản phẩm AI-ready" |

## Decision

Chọn **Node.js 22 + NestJS 10 + React 18 + PostgreSQL 16 + Prisma**.

## Rationale

- **NestJS** có DI, module, guard, pipe — sẵn cấu trúc DDD-lite mà không cần thêm framework. Phù hợp "modular monolith".
- **TypeScript strict** giúp cả người và AI review code tốt hơn.
- **PostgreSQL** làm primary DB: quan hệ mạnh, JSONB linh hoạt cho metadata mở rộng, hỗ trợ full-text search cho tương lai.
- **React** là chuẩn de-facto; kết hợp TanStack Query cho server state, Zod cho validation runtime.
- **Prisma** thay raw SQL: type-safe, schema làm source of truth, migration tốt.

## Consequences

- ✅ Khởi đầu nhanh. Boilerplate tối thiểu với NestJS CLI.
- ✅ AI (Cursor) làm việc hiệu quả vì code TS có type rõ ràng.
- ⚠️ Node.js không có multi-thread như JVM/Go. Có thể cần cluster mode hoặc tách service khi tải cao (chấp nhận được cho MVP).
- ⚠️ Cần quản lý dependency cẩn thận — quy tắc thêm dep sẽ ở TECH_STACK.md.

## Related

- [`TECH_STACK.md`](../../TECH_STACK.md)
- [`ARCHITECTURE.md`](../../ARCHITECTURE.md)
- ADR-0002 (Modular Monolith)

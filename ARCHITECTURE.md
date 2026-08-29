# ARCHITECTURE — Dental Clinic Management System

> **Đây là bức tranh tổng thể, không phải chi tiết.** Chi tiết của mỗi module nằm trong `docs/03_Specification/`.

---

## 1. Mục tiêu kiến trúc

- **Tách biệt nghiệp vụ khỏi framework.** Domain layer không biết đến NestJS, Prisma, React.
- **Mỗi module là một bounded context** — thay đổi một module không ảnh hưởng module khác.
- **Code chạy được, đọc được, sửa được sau 6 tháng.** Ưu tiên readability hơn cleverness.
- **Sẵn sàng cho AI features** — domain model rõ ràng giúp AI hiểu đúng nghiệp vụ.

---

## 2. Kiểu kiến trúc: Modular Monolith

### Vì sao không microservices ngay?

| Tiêu chí                | Microservices | Modular Monolith |
| ----------------------- | ------------- | ---------------- |
| Độ phức tạp vận hành    | Cao           | Thấp             |
| Phù hợp MVP 4 tháng     | ❌            | ✅               |
| Performance             | Cao           | Đủ dùng          |
| Khả năng tách sau       | Sẵn sàng      | ✅ Tách được     |
| Over-engineering risk    | Cao           | Thấp             |

**Modular Monolith** = một process, một database (ban đầu), nhưng code chia module RẤCH RÒI theo bounded context. Khi cần scale, từng module có thể được tách thành service riêng mà không phải viết lại.

Xem chi tiết: [`docs/ADR/0002-modular-monolith.md`](docs/ADR/0002-modular-monolith.md)

---

## 3. Clean Architecture (Lite) — cho mỗi module

```
┌──────────────────────────────────────────┐
│  Interfaces (HTTP controllers, DTOs)     │   ← dependency chỉ vào trong
├──────────────────────────────────────────┤
│  Application (use cases, orchestration)  │
├──────────────────────────────────────────┤
│  Domain (entities, value objects, events)│   ← thuần TypeScript, không phụ thuộc
├──────────────────────────────────────────┤
│  Infrastructure (Prisma, email, queue)   │
└──────────────────────────────────────────┘
```

**Quy tắc phụ thuộc:** chỉ tầng ngoài được biết tầng trong. Domain không được `import` Prisma, không được `import` NestJS.

Tại sao? Vì:
- Test domain thuần, không cần DB giả.
- Đổi ORM không phải sửa domain.
- Thay đổi web framework không ảnh hưởng nghiệp vụ.

---

## 4. Các module MVP (Bounded Contexts)

```
[Auth & Identity] ───> [Users]
       │
       ▼
[Patients] ◄─────┐
       │         │
       ▼         │
[Appointments]───┤
       │         │
       ▼         │
[Medical Records]┤
       │         │
       ▼         │
[Billing]────────┘
       │
       ▼
[Inventory]
       │
       ▼
[Dashboard / Reports]
```

Mỗi hộp là một NestJS module độc lập.

- **Auth** sở hữu: User, Role, Permission, RefreshToken.
- **Patients** sở hữu: Patient, PatientContact, MedicalHistory.
- **Appointments** sở hữu: Appointment, CheckIn, WaitingQueue.
- **Medical Records** sở hữu: Encounter, Treatment, Prescription, DentalChart (sơ khởi).
- **Billing** sở hữu: Invoice, InvoiceItem, Payment, PaymentMethod.
- **Inventory** sở hữu: Item, StockMovement (sơ khởi, có thể mở rộng).

**Shared kernel** (chỉ những gì cần dùng chung thật sự):
- `Money`, `DateRange`, `Address`, `PhoneNumber`, `Email` (Value Objects).
- `AuditableEntity` (base class có audit field).
- Domain event base.

---

## 5. Phân lớp dữ liệu

### Database đơn lẻ (ban đầu)

Một PostgreSQL database. **Một schema phẳng**, không phân schema per module (để tránh phức tạp dev setup).

> Tuy nhiên: **không được phép query bảng của module khác trực tiếp**. Muốn dữ liệu bệnh nhân từ module Appointment? → Gọi qua Patient module (qua application service hoặc domain event).

Lý do: giữ bounded context không bị xói mòn.

### Sau này mới tách

Khi scale, có thể tách thành:
- `clinic_auth_db`
- `clinic_patient_db`
- `clinic_billing_db`

Vì đã modular, dịch chuyển không phải viết lại nghiệp vụ.

---

## 6. Event-driven (in-process, đơn giản)

Một số flow tự nhiên là event-driven:

- `AppointmentCheckedIn` → update waiting queue → notify relevant.
- `InvoicePaid` → đóng hóa đơn → cập nhật treatment → audit log.
- `EncounterClosed` → snapshot lịch sử điều trị.

Triển khai bằng `@nestjs/event-emitter` (in-process). Khi cần scale ngang → chuyển sang Redis/RabbitMQ mà không phải sửa nghiệp vụ.

---

## 7. Frontend architecture

### Feature-first, route-based

```
frontend/src/features/
├── auth/
├── patients/
├── appointments/
├── medical-records/
├── billing/
├── dashboard/
└── shared/
```

Mỗi feature:
- `components/` — UI thuộc feature đó.
- `api/` — HTTP client cho feature.
- `hooks/` — custom hooks.
- `types.ts` — TypeScript types, có thể sinh từ backend Zod schema.

### State management

- **Server state:** TanStack Query (cache, refetch, mutation).
- **Client state nhỏ:** Zustand.
- **Form state:** React Hook Form + Zod.
- **Tránh Redux** trừ khi thực sự cần — thường là không.

### Authentication ở client

- Access token lưu memory (qua interceptor) → refresh token ở httpOnly cookie.
- Auto-refresh 60s trước khi access token hết hạn.
- 401 → refresh → nếu fail → redirect login.

---

## 8. RBAC (Role-Based Access Control)

Mô hình:

```
User ──< UserRole >── Role ──< RolePermission >── Permission
```

- **Role:** nhóm quyền (vd: `receptionist`).
- **Permission:** hành động cụ thể trên tài nguyên (vd: `appointment.create`, `patient.read`).
- **User** có thể có nhiều Role (sau này), MVP một role chính.

### Nguyên tắc

1. **Code không hard-code role.** Chỉ kiểm tra permission.
2. **Permission check ở 3 lớp:**
   - Backend guard (bắt buộc, là tầng bảo vệ thật).
   - Frontend hide/show (chỉ để UX, không phải bảo mật).
   - Database row-level filter (khi cần — VD: dentist chỉ thấy bệnh nhân của mình).
3. **Permission matrix** lưu trong DB, không hard-code trong code → admin có thể tùy chỉnh sau.

---

## 9. Audit, Logging, Observability

- **Audit log** cho mọi hành động nhạy cảm (xóa, đổi role, thanh toán).
- **Logging** có cấu trúc (JSON), có `correlationId` request → truy vết.
- **Error tracking:** (sau MVP) Sentry hoặc tương đương.
- **Metrics:** (sau MVP) Prometheus.
- **Health check:** `/health` (liveness), `/ready` (readiness).

---

## 10. Tổng kết triết lý

| Quyết định                  | Vì sao                                |
| --------------------------- | ------------------------------------- |
| Modular Monolith            | MVP đủ dùng, không over-engineer      |
| Clean Architecture (lite)   | Domain tách khỏi framework            |
| TypeScript strict           | Bắt lỗi sớm                          |
| Permission-based RBAC        | Khóa API ở backend                    |
| In-process event bus        | Đủ cho MVP                            |
| PostgreSQL                  | Quan hệ mạnh, JSONB linh hoạt         |
| Prisma                      | Type-safe, migration dễ               |
| Zod (validate input/output)  | An toàn ở cả 2 phía                  |
| Feature-first FE            | Một feature = một "khu vực" trong app |
| Hexagonal naming convention | Chuẩn cho modular |

---

## 11. Sơ đồ context (C4 level 1 — đơn giản)

```mermaid
flowchart LR
  U[Receptionist / Admin / Dentist] -->|HTTPS| FE[Frontend (React)]
  FE -->|REST / JSON| BE[Backend (NestJS)]
  BE -->|SQL| DB[(PostgreSQL)]
  BE -.->|in-process events| BE
  BE -.->|after MVP| AI[AI Service]
  AI --> BE
```

(Sơ đồ chi tiết hơn sẽ vẽ khi các module spec đã chốt.)

---

## 12. Bước tiếp theo

- Viết **ADR nền** (đã liệt kê trong `ROADMAP.md`).
- Triển khai **Glossary** để AI và dev nói cùng "ngôn ngữ".
- Bắt đầu **spec từng module** — module đầu tiên: **Authentication**.

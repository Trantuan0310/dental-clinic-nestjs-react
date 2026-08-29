# Docs Index — Bản đồ tài liệu dự án

> **Đây là "trang chủ" của tất cả tài liệu.** Khi không biết đọc gì tiếp theo, hãy bắt đầu từ đây.

---

## 🗂 Cấu trúc tổng thể

```
docs/
├── 00_Vision/          → Tầm nhìn, phạm vi, mục tiêu sản phẩm
├── 01_Architecture/    → Kiến trúc tổng thể (placeholder, dùng ARCHITECTURE.md ở root)
├── 02_Glossary/        → Định nghĩa thuật ngữ
├── 03_Specification/   → Spec từng module
├── 04_Database/        → ERD, schema (sẽ viết)
├── 05_API/             → API contract (sẽ viết)
├── 06_UI/              → UI wireframe (sẽ viết)
├── 07_Test/            → Test plan (sẽ viết)
├── 08_Deployment/      → DevOps (sẽ viết)
├── ADR/                → Architecture Decision Records
├── Templates/          → Templates cho spec / blueprint / ADR
├── Meeting/            → Ghi chú họp
└── Research/           → Khảo sát, POC (nếu có)
```

---

## 🚦 Đường đi đọc tài liệu

### Nếu bạn là **người mới (onboarding)**

Đọc theo thứ tự số:

1. [`00_Vision/PRODUCT_VISION.md`](00_Vision/PRODUCT_VISION.md) — vì sao dự án tồn tại.
2. [`../PROJECT_RULES.md`](../PROJECT_RULES.md) — quy tắc vàng.
3. [`../README.md`](../README.md) — overview + status.
4. [`../ROADMAP.md`](../ROADMAP.md) — đang ở giai đoạn nào.
5. [`../ARCHITECTURE.md`](../ARCHITECTURE.md) — bức tranh tổng thể.
6. [`../TECH_STACK.md`](../TECH_STACK.md) — lý do chọn công nghệ.
7. [`ADR/`](ADR/) — các quyết định kiến trúc đã chốt.
8. [`02_Glossary/GLOSSARY.md`](02_Glossary/GLOSSARY.md) — ngôn ngữ chung.
9. `03_Specification/` — spec từng module.

### Nếu bạn muốn **implement một module**

1. Đọc spec của module đó (`03_Specification/<Module>/SPEC.md`).
2. Xem API của nó (`05_API/<module>.md`).
3. Xem schema DB (`04_Database/<module>.md`).
4. Đọc ADR có `Related` link đến module.
5. Sau khi implement → cập nhật lại spec nếu phát hiện sai/không đủ.

### Nếu bạn muốn **đề xuất thay đổi kiến trúc**

1. Tìm ADR liên quan trong `ADR/`.
2. Viết ADR mới supersede (không sửa ADR cũ).
3. Liệt kê module và code ảnh hưởng.

---

## 📑 Mục lục chi tiết

### Tài liệu gốc (root)

| File | Mô tả |
| ---- | ----- |
| [`../README.md`](../README.md) | Overview dự án, tech stack, cách đọc |
| [`../PROJECT_RULES.md`](../PROJECT_RULES.md) | 12 nhóm quy tắc vàng |
| [`../ROADMAP.md`](../ROADMAP.md) | 8 giai đoạn + checklist |
| [`../ARCHITECTURE.md`](../ARCHITECTURE.md) | Kiến trúc tổng thể |
| [`../TECH_STACK.md`](../TECH_STACK.md) | Tech stack + lý do |

### Vision (00)

- [`00_Vision/PRODUCT_VISION.md`](00_Vision/PRODUCT_VISION.md) — tầm nhìn, personas, KPI.

### Architecture (01)

- [`01_Architecture/business-context.md`](01_Architecture/business-context.md) — tổng quan nghiệp vụ, compliance, hotspots.
- [`01_Architecture/business-decisions.md`](01_Architecture/business-decisions.md) — log 8 quyết định nghiệp vụ đã chốt (BD-0001 → BD-0008).
- [`01_Architecture/actor-permissions-matrix.md`](01_Architecture/actor-permissions-matrix.md) — ma trận Role × Action × Permission code.
- [`01_Architecture/business-flow-overview.md`](01_Architecture/business-flow-overview.md) — 5 flow chính + luồng phụ + edge cases.

### Glossary (02)

- [`02_Glossary/GLOSSARY.md`](02_Glossary/GLOSSARY.md) — định nghĩa thuật ngữ (Actors, Concepts, Status, Workflow, Addendum).

### Specification (03)

| Module | Tình trạng | Spec |
| ------ | ---------- | ---- |
| Authentication (`Auth/`) | ✅ Đã có SPEC | [`03_Specification/Auth/SPEC.md`](03_Specification/Auth/SPEC.md) |
| Patients (`Patients/`)   | ✅ Đã có SPEC | [`03_Specification/Patients/SPEC.md`](03_Specification/Patients/SPEC.md) |
| Appointments (`Appointments/`) | ✅ Đã có SPEC | [`03_Specification/Appointments/SPEC.md`](03_Specification/Appointments/SPEC.md) |
| Medical Records (`MedicalRecords/`) | ✅ Đã có SPEC | [`03_Specification/MedicalRecords/SPEC.md`](03_Specification/MedicalRecords/SPEC.md) |
| Billing (`Billing/`)     | ✅ Đã có SPEC | [`03_Specification/Billing/SPEC.md`](03_Specification/Billing/SPEC.md) |
| Inventory (`Inventory/`) | ✅ Đã có SPEC | [`03_Specification/Inventory/SPEC.md`](03_Specification/Inventory/SPEC.md) |

> **Giai đoạn 4 (Module Specification) hoàn thành 6/6 module (100%).**
> Mỗi module có Blueprint + SPEC.md đầy đủ 10 mục theo template.

### Database (04)

- [`erd-overview.md`](04_Database/erd-overview.md) — bức tranh tổng quan (32 bảng, 43 quan hệ, high-traffic indexes).
- [`schema-per-module/auth.md`](04_Database/schema-per-module/auth.md) — 8 bảng Auth.
- [`schema-per-module/patients.md`](04_Database/schema-per-module/patients.md) — 4 bảng Patients.
- [`schema-per-module/appointments.md`](04_Database/schema-per-module/appointments.md) — 4 bảng Appointments.
- [`schema-per-module/medical-records.md`](04_Database/schema-per-module/medical-records.md) — 9 bảng Medical Records.
- [`schema-per-module/billing.md`](04_Database/schema-per-module/billing.md) — 4 bảng Billing.
- [`schema-per-module/inventory.md`](04_Database/schema-per-module/inventory.md) — 3 bảng Inventory.
- [`migration-plan.md`](04_Database/migration-plan.md) — thứ tự migration + seed.
- [`../backend/prisma/schema.prisma`](../backend/prisma/schema.prisma) — source of truth runtime.

### API (05)

| Module | Tình trạng | API |
| ------ | ---------- | --- |
| Conventions | ✅ Đã có | [`05_API/api-conventions.md`](05_API/api-conventions.md) |
| Auth | ✅ Đã có | [`05_API/auth.md`](05_API/auth.md) |
| Patients | ✅ Đã có | [`05_API/patients.md`](05_API/patients.md) |
| Appointments | ✅ Đã có | [`05_API/appointments.md`](05_API/appointments.md) |
| Medical Records | ✅ Đã có | [`05_API/medical-records.md`](05_API/medical-records.md) |
| Billing | ✅ Đã có | [`05_API/billing.md`](05_API/billing.md) |
| Inventory | ✅ Đã có | [`05_API/inventory.md`](05_API/inventory.md) |
| AI (Phase 8.0) | ✅ Đã có | [`05_API/ai.md`](05_API/ai.md) |

> **Giai đoạn 6 (API Design) hoàn thành 7/7 file (100%).**
> Mỗi module có: conventions chung (base URL, RFC 7807, pagination, idempotency) + file API per module (endpoint, request/response, validation Zod, error codes, BR mapping).

### UI (06)

| Tài liệu | Mô tả |
| -------- | ----- |
| [`design-system.md`](06_UI/design-system.md) | Color, typography, spacing, layout, components inventory, a11y |
| [`screens/admin.md`](06_UI/screens/admin.md) | 8 screens: Login, Dashboard, Users, Roles, Settings, Audit |
| [`screens/receptionist.md`](06_UI/screens/receptionist.md) | 11 screens: Dashboard, Patients, Calendar, Check-in, Queue, Invoice, Payment |
| [`screens/dentist.md`](06_UI/screens/dentist.md) | 9 screens: Today, My Queue, Patients, Encounter (5 tabs), Chart, Addendum |
| [`screens/billing-inventory.md`](06_UI/screens/billing-inventory.md) | 10 screens: Reports, Ad-hoc Invoice, Payments + Inventory List, Item, Adjustment, Alerts, Movements |
| [`screens/payroll.md`](06_UI/screens/payroll.md) | Admin payroll screens + Dentist payslip screens |
| [`navigation-map.md`](06_UI/navigation-map.md) | ~40 routes mapped by role, global search, notifications, component library |
| [`CRITICAL_ISSUES_REPORT.md`](06_UI/CRITICAL_ISSUES_REPORT.md) | Phase 7 audit — 22 critical issues + 18 major/minor fixes (đã đóng trong Phase 10) |
| [`components/`](06_UI/components/) | 28 file component spec (button, input, modal, data-table, dental-chart, calendar, kpi-card, permission-guard, …) |

> **Giai đoạn 7 (UI Specification) hoàn thành.**
> Wireframe + flow cho 3 actor chính (Admin, Receptionist, Dentist), navigation map đầy đủ theo role, component library với ~28 components (đã bổ sung Phase 10).

### Test (07)

- ⏳ Sẽ viết ở Giai đoạn 8.

### Deployment (08)

- ⏳ Docker compose + CI ở Giai đoạn 8.

### ADR (Architecture Decision Records)

| ADR | Tiêu đề | Status |
| --- | ------- | ------ |
| [0001](ADR/0001-tech-stack.md) | Tech Stack: Node + NestJS + React + PostgreSQL | ✅ Accepted |
| [0002](ADR/0002-modular-monolith.md) | Dùng Modular Monolith | ✅ Accepted |
| [0003](ADR/0003-patient-is-not-user.md) | Patient (bệnh nhân) KHÔNG phải User | ✅ Accepted |
| [0004](ADR/0004-permission-based-rbac.md) | Permission-Based RBAC | ✅ Accepted |
| [0005](ADR/0005-id-strategy.md) | ID Strategy: UUID v7 | ✅ Accepted |
| [0006](ADR/0006-soft-delete.md) | Soft Delete mặc định | ✅ Accepted |
| [0007](ADR/0007-cross-module-event-bus.md) | Cross-Module: In-Process Event Bus + Shared Transaction | ✅ Accepted |
| [0008](ADR/0008-transactional-encounter-close.md) | Transactional Event cho EncounterClose (Stock-out atomic) | ✅ Accepted |

### Templates

- [`Templates/MODULE_SPEC_TEMPLATE.md`](Templates/MODULE_SPEC_TEMPLATE.md) — 10 mục bắt buộc cho spec.
- [`Templates/BLUEPRINT_TEMPLATE.md`](Templates/BLUEPRINT_TEMPLATE.md) — explore trước khi viết spec.
- [`Templates/ADR_TEMPLATE.md`](Templates/ADR_TEMPLATE.md) — format ADR chuẩn.

---

## ✅ Trạng thái hiện tại (snapshot)

| Phần | Hoàn thành |
| ---- | ---------- |
| Repository skeleton | ✅ |
| Project docs (root) | ✅ (5 file) |
| Vision doc | ✅ |
| ADR nền | ✅ (8 ADR, bao gồm 0007 + 0008 cho cross-module + transactional event) |
| Templates | ✅ (3 template) |
| Business docs (context + decisions + permissions + flows) | ✅ |
| Glossary (mở rộng addendum) | ✅ (~170 thuật ngữ) |
| Spec Authentication | ✅ (10 mục đầy đủ) |
| Spec Patients | ✅ (10 mục đầy đủ) |
| Spec Appointments | ✅ (10 mục đầy đủ) |
| Spec Medical Records | ✅ (10 mục đầy đủ) |
| Spec Billing | ✅ (10 mục đầy đủ) |
| Spec Inventory | ✅ (10 mục đầy đủ) |
| **Giai đoạn 4 — Module Specification** | **✅ HOÀN THÀNH 100% (6/6 module)** |
| **Giai đoạn 5 — Database Design** | **✅ HOÀN THÀNH 100% (7 schema per-module + ERD + migration plan + schema.prisma)** |
| **Giai đoạn 6 — API Design** | **✅ HOÀN THÀNH 100% (1 api-conventions.md + 6 API per-module)** |
| **Giai đoạn 7 — UI Specification** | **✅ HOÀN THÀNH (design-system + 4 screens + navigation map, ~40 routes)** |
| **Giai đoạn 8 — Backend Implementation** | **✅ HOÀN THÀNH (Auth + Patients + Appointments + MedicalRecords + Billing + Inventory + Payroll + Shift)** |
| **Giai đoạn 9 — Payroll + Shift** | **✅ HOÀN THÀNH (BR-PAY-001→024 + BR-APPT-026→031, 24 endpoints)** |
| **Giai đoạn 10 — Code Quality & Docs Cleanup** | **✅ HOÀN THÀNH 22/07/2026 (75 broken links fixed + 50 FE TS errors fixed + 17 log files cleaned)** |
| Frontend integration với backend | ⏳ Giai đoạn tiếp theo |
| Integration/E2E tests | ⏳ Giai đoạn tiếp theo |

---

## 🤖 Quy ước khi AI (Cursor) sinh tài liệu

- Luôn dùng template ứng với loại tài liệu.
- Đặt tên file theo quy tắc của từng folder.
- Mỗi file mới cần có **liên kết ngược** (Related section, link tới các file liên quan).
- Nếu phát hiện logic trùng lặp giữa tài liệu → báo và sửa.
- Không tạo tài liệu mà không có nhu cầu rõ ràng.

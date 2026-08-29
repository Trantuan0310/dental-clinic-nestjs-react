# Dental Clinic Management System

> Hệ thống quản lý phòng khám nha khoa hiện đại, hướng AI-first, xây dựng theo kiến trúc Modular Monolith với chất lượng sản phẩm thực sự.

[![Status](https://img.shields.io/badge/status-MVP%20Complete-brightgreen)]()
[![License](https://img.shields.io/badge/license-TBD-lightgrey)]()
[![Stack](https://img.shields.io/badge/stack-NestJS%20%7C%20React%20%7C%20PostgreSQL-green)]()
[![Tests](https://img.shields.io/badge/tests-225%20passed-brightgreen)]()
[![TypeScript](https://img.shields.io/badge/TypeScript-0%20errors-brightgreen)]()

---

## Build Health (2026-08-03)

| Target | Status |
| --- | --- |
| Backend `tsc --noEmit` | ✅ 0 errors |
| Backend `jest` | ✅ 225/225 tests pass (20 suites) |
| Frontend `tsc --noEmit` | ✅ 0 errors |
| Frontend `eslint` | ✅ 0 issues |
| Frontend `vite build` | ✅ 12.37s |
| ReportsPage data mismatch | ✅ Fixed |
| Expense Module (BR-EXP-001) | ✅ Implemented |
| Deployment Docs | ✅ 10 files |
| E2E Tests | ✅ 15 files (Playwright + Supertest) |

---

## 🎯 Tầm nhìn (Vision)

Xem chi tiết: [`docs/00_Vision/PRODUCT_VISION.md`](docs/00_Vision/PRODUCT_VISION.md)

Tóm tắt một dòng: **Trở thành nền tảng quản lý phòng khám nha khoa AI-first đầu tiên tại Việt Nam, bắt đầu từ MVP một phòng khám duy nhất.**

---

## 📂 Cấu trúc repository

```
ĐATN/
│
├── docs/                          # 📘 Bộ tri thức sản phẩm
│   ├── 00_Vision/                 # Tầm nhìn, phạm vi, mục tiêu
│   ├── 01_Architecture/           # Kiến trúc tổng thể
│   ├── 02_Glossary/               # Định nghĩa thuật ngữ nghiệp vụ
│   ├── 03_Specification/          # Spec từng module (10 mục bắt buộc)
│   ├── 04_Database/               # ERD, schema, migration
│   ├── 05_API/                    # REST contract, Swagger
│   ├── 06_UI/                    # Wireframe, flow
│   ├── 07_Test/                  # Test plan, test case
│   ├── 08_Deployment/            # DevOps, CI/CD
│   ├── ADR/                       # Architecture Decision Records
│   ├── Templates/                 # Template spec, blueprint, ADR
│   ├── Meeting/                   # Ghi chú họp
│   └── Research/                  # Khảo sát, POC
│
├── backend/                        # 🚀 NestJS API (Backend Phase 8)
│   ├── src/
│   │   ├── auth/                  # Authentication module
│   │   ├── users/                 # User management module
│   │   ├── roles/                 # Role management module
│   │   ├── audit/                 # Audit logging module
│   │   ├── common/                # Shared: guards, decorators, filters
│   │   ├── prisma/                # Prisma service
│   │   ├── app.module.ts
│   │   └── main.ts
│   ├── prisma/
│   │   ├── schema.prisma           # Database schema
│   │   └── seed.ts                 # Seed data
│   ├── Dockerfile
│   ├── docker-compose.yml
│   ├── package.json
│   └── .env.example
│
├── frontend/                       # React SPA (chưa implement)
├── shared/                        # Shared types, contracts (chưa implement)
├── scripts/                       # Tooling nội bộ
│
├── PROJECT_RULES.md               # 📜 Nguyên tắc vàng của dự án
├── ROADMAP.md                     # Lộ trình theo giai đoạn
├── TECH_STACK.md                  # Quyết định công nghệ
├── ARCHITECTURE.md                # Tổng quan kiến trúc
└── README.md                      # File này
```

---

## 🧠 Triết lý cốt lõi

1. **Specification là nguồn sự thật.** Code phản ánh spec, không tự sinh logic.
2. **AI đóng vai 5 vai trò**: Solution Architect, Software Engineer, Business Analyst, Technical Writer, Code Reviewer.
3. **AI là "Guardian of the Project"** — bảo vệ kiến trúc, coding standard, business rule.
4. **Module độc lập, có thể tách microservice sau** (Modular Monolith).
5. **MVP trước, scale sau.**

Xem đầy đủ: [`PROJECT_RULES.md`](PROJECT_RULES.md)

---

## Trạng thái dự án

| Giai đoạn | Trạng thái |
| --------- | ---------- |
| Backend API (10 modules) | ✅ Hoàn thành |
| Frontend SPA (11 features) | ✅ Hoàn thành |
| Expense Module (BR-EXP-001) | ✅ Hoàn thành |
| Reports & Dashboard | ✅ Hoàn thành |
| E2E Tests | ✅ Hoàn thành |
| Deployment Docs | ✅ Hoàn thành |
| User Guides | ✅ Hoàn thành |
| Thesis Documentation | ✅ Hoàn thành |
| Production-ready | ✅ Sẵn sàng bảo vệ |

Xem chi tiết: [`ROADMAP.md`](ROADMAP.md)

---

## 🎯 Build Health (snapshot 22/07/2026)

| Target | Status |
| --- | --- |
| Backend `tsc --noEmit` | ✅ 0 errors |
| Backend `jest` | ✅ 98/98 tests pass (8 suites) |
| Frontend `tsc --noEmit` | ✅ 0 errors |
| Frontend `eslint` | ✅ 0 issues |
| Frontend `vite build` | ✅ 12.36s |
| Markdown docs (75 broken links) | ✅ 75/75 đã sửa |
| Stale log/debug files | ✅ 17/17 đã dọn |

Chi tiết: [`ROADMAP.md` § Giai đoạn 10](ROADMAP.md), [`md_errors_report.md`](md_errors_report.md), [`backend_audit_report.md`](backend_audit_report.md).

---

## 🧩 MVP Modules

- **Core System:** Authentication, Authorization, Role, Permission, Clinic Settings
- **Patient:** Hồ sơ bệnh nhân, lịch sử điều trị
- **Appointment & Calendar:** Đặt lịch, check-in, waiting queue
- **Medical Record:** Phiên khám, dental chart, điều trị
- **Billing:** Hóa đơn, thanh toán, công nợ
- **Inventory:** Vật tư nha khoa
- **Dashboard:** Báo cáo tổng quan
- **AI features (cơ bản):** Gợi ý lịch hẹn, nhận diện nội dung ghi chú

---

## 🎭 Actors

| Actor                 | Mô tả |
| --------------------- | ----- |
| **Clinic Administrator** | Quản trị viên, quản lý role, settings, báo cáo tài chính |
| **Receptionist**         | Lễ tân, đặt lịch, check-in, thu tiền |
| **Dentist**              | Bác sĩ, khám bệnh, ghi chú, điều trị |

> **Patient không phải user hệ thống.** Patient là entity được quản lý.
> Xem ADR: [`docs/ADR/0003-patient-is-not-user.md`](docs/ADR/0003-patient-is-not-user.md)

---

## 🛠 Tech Stack (tổng quan)

| Layer       | Công nghệ            |
| ----------- | -------------------- |
| Backend     | Node.js 22 + NestJS 10 + TypeScript (strict) |
| Frontend    | React 18 + Vite + TypeScript |
| Database    | PostgreSQL 16        |
| ORM         | Prisma               |
| Auth        | JWT + Refresh Token  |
| Validation  | Zod (API), React Hook Form (UI) |
| Testing     | Jest + Supertest (BE), Vitest + Testing Library (FE) |
| DevOps      | Docker, GitHub Actions |
| Docs        | Markdown + Mermaid (diagram) |

Chi tiết + lý do chọn: [`TECH_STACK.md`](TECH_STACK.md), [`docs/ADR/0001-tech-stack.md`](docs/ADR/0001-tech-stack.md)

---

## 🚀 Bắt đầu từ đâu?

### Backend Development

```bash
cd backend
cp .env.example .env
npm install

# --- Lần đầu setup (Docker volume mới / máy mới) ---
# 1. Khởi động PostgreSQL container (đã có init script uuid_generate_v7)
npm run db:up

# 2. Chờ DB healthy, sau đó apply migration + seed
#    (db:setup gộp hai bước này)
npm run db:setup

# 3. Khởi động server ở chế độ watch
npm run start:dev
```

> **⚠️ Nếu DB đã có schema nhưng Prisma chưa track (lỗi P3005 "schema is not empty"):**
> ```bash
> npm run db:baseline
> ```
> Lệnh này mark migration `001_init` là đã apply và chạy seed.

### Prerequisites
- Node.js 22+
- pnpm
- Docker (cho PostgreSQL)

---

## 📜 Giấy phép

TBD.

---

## 📞 Liên lạc

Tác giả: [Tên của bạn] — Đồ án tốt nghiệp (ĐATN)
Ngày khởi tạo: 2026

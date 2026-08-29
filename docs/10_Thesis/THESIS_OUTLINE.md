# Outline Báo cáo Đồ án Tốt nghiệp

> **Sinh viên:** Trần Tuấn Anh  
> **MSSV:** 22010130  
> **Đề tài:** Hệ thống quản lý phòng khám nha khoa AI-first (GenSmile)  
> **Niên khóa:** 2026  
> **CBHD:** [Giảng viên hướng dẫn]

---

## Cấu trúc báo cáo (60-80 trang)

### PHẦN MỞ ĐẦU (5 trang)

#### Chương 1: Giới thiệu (5 trang)
1.1. Lý do chọn đề tài
- Thực trạng quản lý phòng khám nha khoa tại Việt Nam (85% dùng Excel/giấy).
- Nhu cầu chuyển đổi số trong y tế.
- Xu hướng AI-first trong healthcare.

1.2. Mục tiêu đề tài
- Xây dựng hệ thống quản lý phòng khám toàn diện.
- Tích hợp AI hỗ trợ bác sĩ.
- Đạt chuẩn production-ready (60+ permission codes, 90+ API endpoints).

1.3. Phạm vi đề tài
- MVP: 1 phòng khám, 10 modules, 3 vai trò.
- Tích hợp mở rộng: AI features, payroll, inventory.

1.4. Đối tượng & phương pháp nghiên cứu
- Phương pháp: Agile + Specification-driven development.
- Công cụ: AI (Cursor) đóng 5 vai trò: Architect, Engineer, BA, Writer, Reviewer.

1.5. Kết cấu báo cáo
- Tổ chức chương.

---

### PHẦN NỘI DUNG (50-60 trang)

#### Chương 2: Cơ sở lý thuyết & Công nghệ (12 trang)

2.1. Tổng quan về hệ thống quản lý phòng khám
- Khái niệm, chức năng, vai trò.
- So sánh với các sản phẩm hiện có (Dental4Web, HIS, EMR).

2.2. Kiến trúc Modular Monolith
- So sánh Monolith vs Microservices vs Modular Monolith.
- Lý do chọn Modular Monolith (BD-001).

2.3. Công nghệ Backend
- **NestJS 10** + TypeScript (strict mode).
- **Prisma ORM** + PostgreSQL 16.
- **JWT** + Refresh Token (HttpOnly cookie).
- **class-validator** + Zod.
- **Swagger** API documentation.

2.4. Công nghệ Frontend
- **React 18** + Vite + TypeScript.
- **React Query** (TanStack Query) + Axios interceptor.
- **Zustand** (auth/theme store) + React Hook Form + Zod.
- **Tailwind CSS** + Design system 28 components.
- **Recharts** cho dashboard.

2.5. Công nghệ AI
- LLM integration (GPT/Claude).
- **Redis cache** (30 phút TTL).
- Use case: AI tóm tắt hồ sơ bệnh nhân.

2.6. Công cụ DevOps
- Docker + PostgreSQL + UUID v7.
- ESLint + Prettier + Jest + Supertest.
- Playwright (E2E).

#### Chương 3: Phân tích yêu cầu (10 trang)

3.1. Yêu cầu nghiệp vụ
- Khảo sát 3 phòng khám tại [địa điểm].
- Phỏng vấn 6 stakeholders (2 admin, 2 lễ tân, 2 bác sĩ).

3.2. Yêu cầu chức năng (10 modules)
- Auth, Users, Roles, Patients, Appointments, Medical Records, Billing, Inventory, Payroll, Audit.
- 60+ permission codes (RBAC).
- 90+ API endpoints.

3.3. Yêu cầu phi chức năng
- Performance: p95 < 200ms.
- Security: bcrypt, JWT, HttpOnly, CORS, Throttler.
- Audit: mọi mutation có log.
- UX: < 3 cú click cho happy path.

3.4. Use case tổng quan
- Sơ đồ Use case (10 actors).
- Sơ đồ luồng nghiệp vụ (BPMN).

3.5. Đặc tả chi tiết
- 10 module spec (link `docs/03_Specification/`).

#### Chương 4: Thiết kế hệ thống (15 trang)

4.1. Kiến trúc tổng quan
- Sơ đồ khối (3-tier: FE → BE → DB).
- Sơ đồ module + dependencies.

4.2. Thiết kế cơ sở dữ liệu
- ERD tổng quan (30 models, 17 enums).
- Schema theo module (Auth, Patient, Appointment, Encounter, Billing, Inventory, Payroll, Audit).
- UUID v7 cho khóa chính.
- Soft delete strategy.

4.3. Thiết kế API
- REST conventions (`/api/v1/...`).
- Pagination shape (`{ data, pagination }`).
- Error response shape (`HttpExceptionFilter`).
- 90+ endpoints documented.

4.4. Thiết kế giao diện
- Design system (brand palette, spacing, typography).
- App shell (Header + Sidebar + Main).
- 28 UI components + 10 feature pages.
- Responsive (mobile/tablet/desktop).
- Dark mode.

4.5. Bảo mật
- Authentication (JWT + refresh).
- Authorization (RBAC + permission codes).
- Rate limiting (Throttler 100 req/min).
- Audit logging.

4.6. KHÔNG triển khai (Non-goals)
- Microservices (giữ Modular Monolith).
- Real-time (WebSocket).
- Multi-tenant.
- Mobile app native.

#### Chương 5: Triển khai & Kết quả (10 trang)

5.1. Quy trình phát triển
- 8 sprints (theo ROADMAP).
- AI đóng 5 vai trò (Architect, Engineer, BA, Writer, Reviewer).

5.2. Code Quality
- Backend: 0 TS errors, 225/225 tests pass, 20 suites.
- Frontend: 0 TS errors, 0 ESLint issues, build 10.57s.
- 75/75 broken links fixed.

5.3. Kết quả thực nghiệm
- Happy path: Login → Patient → Appointment → Encounter → Invoice → Payment.
- 90+ API endpoints test qua Swagger.
- 5 E2E test files (Playwright).

5.4. So sánh với mục tiêu
| Mục tiêu | Đạt được |
|---|---|
| 10 modules | OK |
| 90+ endpoints | OK |
| 60+ permissions | OK (alias added) |
| 0 TS errors | OK |
| 0 ESLint issues | OK |
| 225 tests pass | OK |
| > 75% coverage | OK |

#### Chương 6: Kết luận & Hướng phát triển (5 trang)

6.1. Kết quả đạt được
- Hệ thống production-ready.
- Code chất lượng cao.
- Documentation đầy đủ.

6.2. Hạn chế
- Chưa triển khai tích hợp EHR (Bộ Y tế).
- AI features còn hạn chế (chỉ summary).
- Performance chưa benchmark với 10K+ records.

6.3. Hướng phát triển
- Tích hợp EHR (HL7 FHIR).
- Mobile app (React Native).
- Microservices decomposition (nếu cần scale).
- AI nâng cao: gợi ý điều trị, phát hiện bất thường từ X-quang.

---

### PHỤ LỤC (10 trang)

- Phụ lục A: Source code (link GitHub).
- Phụ lục B: API documentation (link Swagger).
- Phụ lục C: User guides (link `docs/09_UserGuide/`).
- Phụ lục D: Test reports.

---

## Tài liệu tham khảo

1. NestJS Documentation. https://docs.nestjs.com.
2. React Documentation. https://react.dev.
3. Prisma Documentation. https://www.prisma.io/docs.
4. OWASP Top 10. https://owasp.org.
5. HL7 FHIR Specification. https://www.hl7.org/fhir.
6. PCI DSS. https://www.pcisecuritystandards.org.
7. [Các bài báo khoa học về AI in Healthcare].

---

## Phân bổ thời gian viết báo cáo

| Chương | Số trang | Thời gian (ngày) |
|---|---|---|
| Chương 1 | 5 | 2 |
| Chương 2 | 12 | 5 |
| Chương 3 | 10 | 4 |
| Chương 4 | 15 | 7 |
| Chương 5 | 10 | 5 |
| Chương 6 | 5 | 2 |
| Phụ lục | 10 | 3 |
| Review + format | - | 3 |
| **Tổng** | **67** | **31** |

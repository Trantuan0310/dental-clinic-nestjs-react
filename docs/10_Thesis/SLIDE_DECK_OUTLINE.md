# Outline Slide Báo cáo Đồ án Tốt nghiệp

> **Tổng số slide:** 25-30  
> **Thời gian trình bày:** 20-25 phút  
> **Phần mềm:** PowerPoint / Google Slides / Figma

---

## Slide 1: Trang bìa
- Logo trường + khoa
- Đề tài: "Hệ thống quản lý phòng khám nha khoa AI-first"
- SV: Trần Tuấn Anh - MSSV: 22010130
- CBHD: [Tên GVHD]
- Năm 2026

## Slide 2: Mục lục
1. Giới thiệu
2. Cơ sở lý thuyết
3. Phân tích yêu cầu
4. Thiết kế hệ thống
5. Triển khai & Kết quả
6. Kết luận & Hướng phát triển

## Slide 3: Lý do chọn đề tài
- 85% phòng khám nha khoa VN dùng Excel/giấy
- Thất thoát dữ liệu, khó truy xuất
- Xu hướng chuyển đổi số y tế
- AI hỗ trợ bác sĩ (đặc biệt nha khoa - dental chart phức tạp)

## Slide 4: Mục tiêu
- Xây dựng hệ thống quản lý toàn diện (10 modules)
- 90+ API endpoints
- 60+ permission codes (RBAC)
- Tích hợp AI summary
- Production-ready

## Slide 5: Phạm vi
- **MVP:** 1 phòng khám, 3 vai trò (`clinic_admin`, `receptionist`, `dentist`)
- **Modules:** Auth, Users, Roles, Patients, Appointments, Medical Records, Billing, Inventory, Payroll, Audit
- **KHÔNG:** Multi-tenant, real-time, mobile native

## Slide 6: Công nghệ Backend
- NestJS 10 + TypeScript strict
- Prisma ORM + PostgreSQL 16
- JWT + Refresh Token
- class-validator + Swagger
- **Diagram:** Backend 3-tier architecture

## Slide 7: Công nghệ Frontend
- React 18 + Vite + TypeScript
- React Query + Zustand
- Tailwind CSS + 28 components
- Recharts cho dashboard
- **Screenshot:** App shell

## Slide 8: Modular Monolith
- So sánh Monolith vs Microservices vs Modular Monolith
- **Bảng:**
  | Kiểu | Pros | Cons |
  |---|---|---|
  | Monolith | Đơn giản | Khó scale |
  | Microservices | Scale độc lập | Phức tạp |
  | Modular Monolith | Cả hai | Cần kỷ luật |

## Slide 9: Phân tích yêu cầu - Actors
- **3 actors:**
  - Clinic Admin (quản trị)
  - Receptionist (lễ tân)
  - Dentist (bác sĩ)
- Patient = entity (KHÔNG phải user)

## Slide 10: Permission Matrix
- Bảng 60+ permission codes × 3 roles
- Highlight: 5 nhóm (USER, PATIENT, APPOINTMENT, ENCOUNTER, BILLING, PAYROLL, INVENTORY)

## Slide 11: Use Case tổng quan
- Sơ đồ Use case (10 actors)
- Brace notation chuẩn UML

## Slide 12: Kiến trúc tổng quan
- Sơ đồ 3-tier: FE → API → DB
- Modules + dependencies
- **Color-coded:** mỗi module 1 màu

## Slide 13: Database Schema (ERD)
- ERD tổng quan (30 models, 17 enums)
- Highlight: Patient, Appointment, Encounter, Invoice

## Slide 14: API Design
- REST conventions
- 90+ endpoints
- Pagination: `{ data, pagination }`
- Error shape: `{ statusCode, code, message, details, timestamp, path }`

## Slide 15: Authentication Flow
- Login → JWT access + refresh cookie
- Auto refresh trên 401
- Permission check qua JWT payload

## Slide 16: App Shell
- Screenshot: Header + Sidebar + Main
- Chỉ: brand palette, design system

## Slide 17: Dashboard
- Screenshot: 4 KPIs + charts
- AI summary panel

## Slide 18: Patient Module
- Screenshot: Patient list
- Screenshot: Patient detail (3 tabs)

## Slide 19: Appointment Module
- Screenshot: Calendar (day/week/month)
- Screenshot: Appointment form modal

## Slide 20: Encounter (Medical Record)
- Screenshot: 5 tabs
- Highlight: Dental Chart

## Slide 21: Billing
- Screenshot: Invoice list
- Screenshot: Invoice detail + payment

## Slide 22: Phát triển theo AI-first
- 5 vai trò của AI:
  - Solution Architect
  - Software Engineer
  - Business Analyst
  - Technical Writer
  - Code Reviewer
- **Diagram:** workflow AI + human

## Slide 23: Code Quality
- Backend: 0 TS errors, 225/225 tests pass, 20 suites
- Frontend: 0 TS errors, 0 ESLint issues, build 10.57s
- 75/75 broken links fixed
- E2E: 5 test files

## Slide 24: Kết quả đạt được
| Mục tiêu | Kết quả |
|---|---|
| 10 modules | OK |
| 90+ endpoints | OK |
| 60+ permissions | OK |
| 0 TS errors | OK |
| 225 tests pass | OK |
| E2E tests | OK |

## Slide 25: Hạn chế
- Chưa tích hợp EHR (HL7 FHIR)
- AI chỉ 1 use case (summary)
- Chưa benchmark với 10K+ records

## Slide 26: Hướng phát triển
- Tích hợp HL7 FHIR
- Mobile app (React Native)
- AI nâng cao: gợi ý điều trị, X-quang
- Microservices (nếu scale)

## Slide 27: Tài liệu tham khảo
- NestJS, React, Prisma docs
- OWASP, HIPAA, PCI DSS
- Bài báo khoa học

## Slide 28: Câu hỏi
- "Cảm ơn thầy/cô đã lắng nghe. Em xin sẵn sàng trả lời câu hỏi."

## Slide 29 (Backup): Q&A thường gặp
- Tại sao chọn Modular Monolith?
- Tại sao không dùng Microservices?
- Tại sao JWT + refresh token?
- Performance như thế nào?
- Bảo mật thế nào?
- Có thể scale được không?

## Slide 30 (Backup): Liên hệ
- Email: tuananh.tran@example.com
- GitHub: github.com/tuananh
- LinkedIn: linkedin.com/in/tuananh

---

## TIPS TRÌNH BÀY

1. **Slide mỗi slide 1 ý chính** — không nhồi nhét.
2. **Mỗi slide 30-60 giây** — tổng 20-25 phút cho 30 slides.
3. **Dùng sơ đồ > text** — hội đồng thích visualize.
4. **Screenshot thật** — chứng minh sản phẩm chạy được.
5. **Backup video demo** — nếu wifi chập chờn.
6. **Practice 3 lần** — để timing chuẩn.
7. **Tone tự tin** — đây là sản phẩm bạn xây 8 tháng.

## COLOR PALETTE (gợi ý)

- Primary: `#2BA3A0` (teal)
- Secondary: `#F4B860` (accent gold)
- Dark: `#082E2E` (deep teal)
- Light: `#F9FAFB`
- Error: `#EF4444`
- Success: `#10B981`

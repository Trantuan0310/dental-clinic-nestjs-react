# Appendix — Technical Reference

Tóm tắt kỹ thuật và supplemental materials cho báo cáo ĐATN.

---

## A. Database Schema Summary

### A.1 Entity-Relationship Overview

Hệ thống gồm **30 Prisma models** trong **7 modules**:

```
┌─────────────────────────────────────────────────────────────────┐
│                         USERS (auth)                             │
│  User ─── UserRole ─── Role ─── RolePermission ─── Permission │
│    │                                                          │
│    └── RefreshToken, PasswordResetToken                       │
└─────────────────────────────────────────────────────────────────┘
                              │
┌─────────────────────────────────────────────────────────────────┐
│                         PATIENTS                                │
│  Patient ─── PatientPhoneHistory, PatientIdentifier,          │
│              PatientMergeLog, Appointment, Encounter, Invoice    │
└─────────────────────────────────────────────────────────────────┘
                              │
┌─────────────────────────────────────────────────────────────────┐
│                    MEDICAL RECORDS                               │
│  Encounter ─── ClinicalNote ─── ClinicalNoteAddendum,         │
│                Treatment ─── TreatmentInventoryUsage,           │
│                Prescription ─── PrescriptionLine,                │
│                DentalChartSnapshot                              │
└─────────────────────────────────────────────────────────────────┘
                              │
┌─────────────────────────────────────────────────────────────────┐
│                     APPOINTMENTS                                │
│  Appointment ─── WorkingSchedule, TimeOff,                     │
│                 AppointmentRescheduleLog                        │
└─────────────────────────────────────────────────────────────────┘
                              │
┌─────────────────────────────────────────────────────────────────┐
│                        BILLING                                   │
│  Invoice ─── InvoiceItem, Payment, InvoiceAudit               │
└─────────────────────────────────────────────────────────────────┘
                              │
┌─────────────────────────────────────────────────────────────────┐
│                      INVENTORY                                  │
│  InventoryCategory, InventoryItem ─── StockMovement            │
└─────────────────────────────────────────────────────────────────┘
                              │
┌─────────────────────────────────────────────────────────────────┐
│                       PAYROLL                                   │
│  PayrollConfig, DentistCompensation,                          │
│  PayrollPeriod ─── PayrollLineItem ─── PayrollAdjustment,       │
│                   PayrollEncounterDetail,                       │
│  ShiftRegistration                                            │
└─────────────────────────────────────────────────────────────────┘
                              │
┌─────────────────────────────────────────────────────────────────┐
│                        EXPENSE (BR-EXP-001)                     │
│  ExpenseCategory, Expense ─── ExpenseAudit                    │
└─────────────────────────────────────────────────────────────────┘
                              │
┌─────────────────────────────────────────────────────────────────┐
│                         AUDIT                                    │
│  AuditLog                                                     │
└─────────────────────────────────────────────────────────────────┘
```

### A.2 Enums Summary

| Enum | Values | Module |
|------|--------|--------|
| `UserStatus` | ACTIVE, PENDING_SETUP, DEACTIVATED | Auth |
| `Gender` | MALE, FEMALE, OTHER, UNDISCLOSED | Patients |
| `IdentifierType` | CCCD, CMND, PASSPORT | Patients |
| `AppointmentStatus` | SCHEDULED, CONFIRMED, CHECKED_IN, COMPLETED, CANCELLED, NO_SHOW | Appointments |
| `EncounterStatus` | SCHEDULED, IN_PROGRESS, CLOSED, CANCELLED | Medical Records |
| `InvoiceStatus` | DRAFT, ISSUED, PARTIAL, PAID, VOIDED | Billing |
| `PaymentStatus` | PENDING, COMPLETED, FAILED, REVERSED | Billing |
| `MovementType` | STOCK_IN, STOCK_OUT, ADJUSTMENT | Inventory |
| `PayrollPeriodStatus` | OPEN, COMPUTED, LOCKED, APPROVED, PAID | Payroll |
| `ExpenseStatus` | DRAFT, APPROVED, REJECTED, REIMBURSED | Expense |
| `ExpenseType` | OPERATING, INVESTMENT, OTHER | Expense |

---

## B. API Endpoints Summary

### B.1 Authentication (`/api/v1/auth`)

| Method | Endpoint | Permission | Mô tả |
|--------|----------|------------|--------|
| POST | `/login` | — | Đăng nhập |
| POST | `/logout` | — | Đăng xuất |
| POST | `/refresh` | — | Refresh token |
| POST | `/logout-all` | — | Đăng xuất tất cả |
| GET | `/me` | — | Thông tin user hiện tại |
| GET | `/login-history` | `audit.read` | Lịch sử đăng nhập |

### B.2 Users (`/api/v1/users`)

| Method | Endpoint | Permission |
|--------|----------|------------|
| GET | `/` | `user.read` |
| GET | `/:id` | `user.read` |
| POST | `/` | `user.create` |
| PUT | `/:id` | `user.update` |
| PUT | `/:id/deactivate` | `user.deactivate` |
| PUT | `/:id/reset-password` | `user.reset_password` |

### B.3 Billing (`/api/v1/billing`)

| Method | Endpoint | Permission |
|--------|----------|------------|
| GET | `/invoices` | `invoice.read` |
| GET | `/invoices/:id` | `invoice.read` |
| POST | `/invoices/:id/issue` | `invoice.issue` |
| POST | `/invoices/:id/void` | `invoice.void` |
| POST | `/invoices/:id/payments` | `invoice.payment.create` |
| GET | `/reports/revenue` | `report.revenue.read` |
| GET | `/reports/finance-summary` | `report.revenue.read` |
| GET | `/reports/outstanding` | `report.outstanding.read` |

### B.4 Expenses (`/api/v1/expenses`)

| Method | Endpoint | Permission |
|--------|----------|------------|
| GET | `/` | `expense.read` |
| GET | `/:id` | `expense.read` |
| POST | `/` | `expense.create` |
| PUT | `/:id` | `expense.update` |
| DELETE | `/:id` | `expense.delete` |
| POST | `/:id/approve` | `expense.approve` |
| POST | `/:id/reject` | `expense.approve` |
| POST | `/:id/reimburse` | `expense.approve` |
| GET | `/categories` | `expense.read` |

**Total endpoints: 90+ across all modules**

---

## C. Permission Codes Matrix

| Permission Code | Resource | Action | Clinic Admin | Receptionist | Dentist |
|----------------|----------|--------|-------------|--------------|---------|
| `patient.create` | patient | create | ✓ | ✓ | — |
| `patient.read` | patient | read | ✓ | ✓ | ✓ |
| `appointment.create` | appointment | create | ✓ | ✓ | — |
| `appointment.read` | appointment | read | ✓ | ✓ | ✓ |
| `encounter.create` | encounter | create | ✓ | — | ✓ |
| `encounter.read` | encounter | read | ✓ | ✓ | ✓ |
| `invoice.read` | invoice | read | ✓ | ✓ | ✓ |
| `invoice.issue` | invoice | issue | ✓ | ✓ | — |
| `expense.read` | expense | read | ✓ | — | — |
| `expense.create` | expense | create | ✓ | — | — |
| `expense.approve` | expense | approve | ✓ | — | — |
| `report.revenue.read` | report | revenue.read | ✓ | ✓ | — |
| `payroll.read.any` | payroll | read.any | ✓ | — | — |
| `payroll.read.own` | payroll | read.own | ✓ | — | ✓ |
| `user.read` | user | read | ✓ | — | — |

**Total permission codes: 60+ (includes aliases)**

---

## D. Error Codes

### D.1 HTTP Status Codes Used

| Code | Mô tả | Khi nào |
|------|--------|----------|
| 200 | OK | GET/PUT thành công |
| 201 | Created | POST thành công |
| 400 | Bad Request | Validation failed |
| 401 | Unauthorized | Chưa đăng nhập |
| 403 | Forbidden | Không có quyền |
| 404 | Not Found | Resource không tồn tại |
| 409 | Conflict | Duplicate hoặc state conflict |
| 429 | Too Many Requests | Rate limit exceeded |
| 500 | Internal Server Error | Lỗi server |

### D.2 Business Error Codes

| Code | Class | Mô tả |
|------|--------|--------|
| `AUTH_INVALID_CREDENTIALS` | AuthException | Email/password không đúng |
| `AUTH_ACCOUNT_LOCKED` | AuthException | Tài khoản bị khóa |
| `AUTH_TOKEN_EXPIRED` | AuthException | Token hết hạn |
| `PATIENT_DOB_LOCKED` | BusinessRuleException | DOB không được sửa sau 24h |
| `INVOICE_NOT_EDITABLE` | BusinessRuleException | Invoice không ở DRAFT |
| `INVENTORY_NEGATIVE_STOCK` | BusinessRuleException | Tồn kho âm |
| `PAYROLL_PERIOD_LOCKED` | BusinessRuleException | Period đã LOCKED |

---

## E. Test Coverage Summary

### E.1 Backend Unit Tests

| Module | Coverage (Statements) |
|--------|---------------------|
| auth | 60% |
| users | 62% |
| patients | 43% |
| appointments | 32% |
| medical-records | 46% |
| billing | 27% |
| inventory | 47% |
| payroll | 46% |
| roles | 42% |
| audit | **98%** |
| ai | **90%** |

### E.2 Frontend E2E Tests (Playwright)

Chạy thủ công qua `npm run test:e2e` (frontend) — **chưa được gắn vào
GitHub Actions CI**, nên không tự chạy lại mỗi lần push. Bộ test này từng
không chạy được: `fixtures.ts` dùng sai email/mật khẩu mặc định
(`admin@gensmile.vn`, tài khoản không tồn tại) và mỗi test tự đăng nhập lại
từ đầu, nhanh chóng vượt giới hạn throttle của `/auth/login` (5 lần/60s) —
gộp lại khiến gần như toàn bộ 55 test timeout ở bước đăng nhập. Đã sửa: dùng
đúng tài khoản seed, và chuyển sang đăng nhập một lần trong `global-setup.ts`
rồi tái sử dụng session đã lưu cho các test còn lại (`playwright.config.ts`).
Kết quả sau khi sửa: **38/55 pass**. 17 test còn fail là các vấn đề riêng lẻ
(selector/thời gian chờ không khớp UI hiện tại, một route test cũ trỏ sai) —
chưa rà hết từng cái.

| File | Coverage |
|------|----------|
| `login.spec.ts` | Login page, redirect |
| `shell.spec.ts` | Dashboard, command palette, theme toggle |
| `dashboard.spec.ts` | KPI cards, time range |
| `critical-paths.spec.ts` | Patients list, appointments calendar |
| `permissions.spec.ts` | Role-based access |
| `i18n.spec.ts` | Language switching |
| `a11y.spec.ts` | Accessibility |
| `full-workflow.spec.ts` | Navigation flows |
| `patient-create.spec.ts` | Patient creation |
| `appointment-booking.spec.ts` | Calendar views |
| `invoice-payment.spec.ts` | Billing flow |
| `dentist-view.spec.ts` | Role-specific views |
| `error-states.spec.ts` | Error/empty states |

### E.3 Backend E2E Tests (Supertest)

Chạy thủ công qua `npm run test:e2e` (backend, cần DB thật) — cũng chưa nằm
trong CI. Bộ này trước đó **không chạy được** (`test/jest-e2e.json` khai báo
cả `testMatch` và `testRegex` — Jest từ chối chạy khi có cả hai, và pattern
còn sai đuôi file: tìm `.e2e-spec.ts` trong khi file thật là `.e2e.spec.ts`).
Sau khi sửa config và cập nhật 3 test trỏ nhầm route
(`/appointments/calendar`, `/medical-records/today`, `/medical-records/queue`
— không route nào trong số này tồn tại; route thật là `GET /appointments` có
tham số ngày, `/appointments/today`, `/appointments/waiting-queue`):
**14/14 pass**.

| File | Coverage |
|------|----------|
| `billing.e2e.spec.ts` | Invoice CRUD, reports |
| `appointments.e2e.spec.ts` | Calendar, check-in |
| `medical-records.e2e.spec.ts` | Today, queue |
| `expense.e2e.spec.ts` | Expense CRUD, categories |

---

## F. Environment Variables Reference

### Backend

| Variable | Required | Default | Mô tả |
|----------|----------|---------|--------|
| `DATABASE_URL` | ✓ | — | PostgreSQL connection string. Production yêu cầu `sslmode=require`/`verify-ca`/`verify-full` — app từ chối khởi động nếu thiếu |
| `JWT_SECRET` | ✓ | — | JWT signing secret (32+ chars) |
| `JWT_ACCESS_EXPIRY` | — | `15m` | Access token TTL |
| `JWT_REFRESH_EXPIRY` | — | `7d` | Refresh token TTL |
| `REDIS_URL` | — | `redis://localhost:6379` | Redis connection |
| `GEMINI_API_KEY` | — | — | AI service API key |
| `PORT` | — | `3000` | Server port |
| `NODE_ENV` | — | `development` | Environment |

### Frontend

| Variable | Required | Default | Mô tả |
|----------|----------|---------|--------|
| `VITE_API_BASE_URL` | ✓ | `/api/v1` | Backend API base URL |

---

## G. Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+K` / `Cmd+K` | Open command palette |
| `Ctrl+/` | Toggle dark mode |
| `Escape` | Close modal/drawer |
| `Enter` | Submit form / select |
| `Tab` | Navigate between fields |

---

## H. Deployment Platforms

| Platform | Backend | Frontend | Database | Redis | Status |
|----------|---------|----------|---------|-------|--------|
| Docker (local) | ✓ | ✓ | ✓ | ✓ | ✅ Tested |
| Railway | ✓ | ✓ | ✓ (plugin) | ✓ (plugin) | ✅ Config ready |
| Render | ✓ | ✓ | ✓ (managed) | ✓ (managed) | ✅ Config ready |
| VPS (Nginx) | ✓ | ✓ | ✓ | ✓ | ✅ Config ready |
| Vercel | — | ✓ | — | — | ✅ Config ready |

**GitHub Actions CI** (`.github/workflows/ci.yml`) chạy lint, typecheck, unit
test và build cho cả backend/frontend trên mỗi push/PR — **không có bước
deploy tự động** lên bất kỳ platform nào ở trên. Việc đưa code lên các
platform trong bảng vẫn cần thao tác thủ công theo hướng dẫn tương ứng trong
`docs/08_Deployment/`.

# GENSMILE — Frontend (Phase 10: Payroll Screens)

Dental Clinic Management System — React SPA frontend. Phase 10 tập trung vào
các màn hình **Payroll & Shift Management** (quản lý lương + ca làm việc của bác sĩ).

**Brand:** GENSMILE — Nha khoa thẩm mỹ. Logo và color palette xem `docs/00_Vision/branding/usage-guidelines.md`.

## Stack

- **Framework:** React 18 + Vite + TypeScript
- **UI:** Tailwind CSS + shadcn-style components (custom implementation, không vendor lock-in)
- **Routing:** React Router 6
- **Server state:** TanStack Query (React Query)
- **Client state:** Zustand
- **Forms:** React Hook Form + Zod
- **Tables:** TanStack Table
- **Date:** date-fns (Vietnamese locale)
- **Icons:** lucide-react
- **HTTP:** Axios (với JWT interceptor + refresh-queue pattern)

## Cấu trúc thư mục

```
frontend/
├── src/
│   ├── api/                     # (reserved — auto-generated client future)
│   ├── components/
│   │   ├── ui/                  # Button, Input, Select, DatePicker, TimePicker,
│   │   │                        # Textarea, DataTable, Modal, Drawer, ConfirmDialog,
│   │   │                        # StatusBadge, EmptyState, Loading, Alert,
│   │   │                        # KpiCard, Tabs, Toast, Card, PageHeader
│   │   ├── brand/               # Logo, BrandBadge (single entry point cho GENSMILE mark)
│   │   └── PermissionGuard.tsx
│   ├── features/
│   │   ├── auth/                # LoginPage, ProtectedRoute, SessionBoot, ErrorPages
│   │   ├── payroll/             # PayrollConfigPage, CompensationListPage,
│   │   │                        # CompensationEditorPage, PeriodListPage,
│   │   │                        # PeriodDetailPage, MyPayrollHistoryPage,
│   │   │                        # MyPayslipPage, MyPayrollPreviewPage,
│   │   │                        # MyCompensationPage,
│   │   │                        # AdjustmentModal, MarkPaidModal,
│   │   │                        # LineItemBreakdownDrawer, payrollApi.ts
│   │   ├── shift/               # RegisterShiftPage, MyShiftsPage,
│   │   │                        # ShiftApprovalInbox
│   │   ├── DashboardPage.tsx
│   │   └── PlaceholderPage.tsx
│   ├── layouts/                 # AppShell, Header, Sidebar (role-based)
│   ├── lib/                     # api (axios client), cn, format, errors, nav
│   ├── routes/                  # AppRoutes.tsx (route table)
│   ├── stores/                  # authStore (Zustand)
│   ├── types/                   # auth.ts, payroll.ts (TS types from OpenAPI)
│   ├── index.css                # Tailwind base + design tokens
│   └── main.tsx                 # Entry: QueryClient + AppRoutes
├── public/
│   ├── favicon.svg                # GENSMILE favicon (light bg)
│   ├── logo-full.svg              # Default logo (nền sáng)
│   ├── logo-full-light.svg        # Logo chữ trắng (nền tối)
│   ├── logo-icon.svg              # Icon-only (màu)
│   ├── logo-icon-mono.svg         # Icon-only currentColor
│   └── manifest.webmanifest       # PWA
├── index.html
├── vite.config.ts               # Dev proxy: /api → http://localhost:3000
└── tailwind.config.js           # Brand color tokens (GENSMILE teal: brand-* scale)
```

## Màn hình đã implement (Phase 10)

### Admin (`clinic_admin`)
- `/admin/payroll/config` — Cấu hình payroll (cycle, OT, BHXH, tax brackets)
- `/admin/payroll/compensations` — Danh sách chính sách lương BS
- `/admin/payroll/compensations/:dentistId` — Lịch sử version + editor
- `/admin/payroll/periods` — Danh sách kỳ lương
- `/admin/payroll/periods/:id` — Chi tiết kỳ: line items, compute, lock, approve, mark-paid, adjustment, breakdown drawer, open-adjustment period
- `/admin/shifts/pending` — Inbox duyệt ca đăng ký (cùng chức năng với receptionist)

### Dentist
- `/my-shifts` — Lịch sử ca đăng ký (tabs Sắp tới / Đã qua / Đã hủy)
- `/my-shifts/new` — Đăng ký ca tự do (form + conflict feedback)
- `/my-payroll` — Lịch sử phiếu lương
- `/my-payroll/:periodId` — Phiếu lương chi tiết (earnings/deductions/encounters/adjustments/computation log)
- `/my-payroll/preview` — Ước tính tháng hiện tại (DRAFT)
- `/my-compensation` — Chính sách lương cá nhân

### Receptionist
- `/shifts/pending` — Inbox duyệt ca đăng ký (không có quyền payroll → sidebar không có Payroll section)

## Routes đã wire (placeholder)

Các module khác (Patients, Appointments, Inventory, Billing, Reports, Users, Roles, Settings, Audit) hiện có placeholder — sẽ được build ở các phase sau. Route guard dựa trên permission đã hoạt động.

## Permission-based RBAC

Sidebar và route guards đều dựa trên `user.permissions` (lấy từ JWT login response).
Mọi endpoint đều có `<ProtectedRoute anyPermission={[...]}>`. Khi truy cập trái phép → redirect `/403`.

Backend là nguồn chốt cuối cùng (BR-AUTH). Client chỉ là UX, không phải security.

## Running

```bash
cd frontend
npm install
npm run dev          # http://localhost:5173
```

Dev server proxy `/api/v1/*` → `http://localhost:3000` (NestJS backend).
Đổi base URL production qua `VITE_API_BASE_URL` env var.

## Build

```bash
npm run build        # tsc -b && vite build → dist/
npm run typecheck    # chỉ type-check
npm run lint
npm run preview      # serve dist/
```

## Tài khoản dev (từ seed.ts backend)

- `admin@clinic.local` / `Admin123!` — `clinic_admin` role (full access)

Tạo thêm user `receptionist` và `dentist` qua `/admin/users` (sẽ được xây ở phase sau) hoặc seed thêm trong `backend/prisma/seed.ts`.

## Conventions

- **File naming:** PascalCase cho components, camelCase cho hooks/utils/types
- **API client:** Hooks TanStack Query trong `features/<module>/<module>Api.ts`
- **Forms:** RHF + Zod (schema cùng backend validate rule)
- **Money:** Luôn dùng `formatVnd()` (Intl vi-VN, hậu tố " ₫")
- **Date:** `formatDate()` mặc định `dd/MM/yyyy`
- **Toast:** Dùng `notify.success/error/warning/info()` từ `components/ui/Toast.tsx`
- **Icons:** Luôn `lucide-react`, default 20px, stroke 2
- **Status colors:** Theo `docs/06_UI/design-system.md`
- **Logo:** Luôn dùng `<Logo variant size theme />` từ `components/brand/`. KHÔNG hardcode SVG inline ngoài component này.

## Known gaps (Phase sau)

- Phần lớn module Patients / Appointments / Inventory / Billing đang placeholder
- Audit log viewer chưa có UI (route guard đã có)
- Reports chưa build (Recharts đã install sẵn)
- Multi-clinic / multi-tenant chưa nằm trong MVP
- PDF payslip chưa (chỉ JSON view theo SPEC)

## Liên kết

- Backend API: `../backend/openapi.yaml`
- Spec: `../docs/03_Specification/Payroll/SPEC.md`
- UI Spec: `../docs/06_UI/screens/payroll.md`
- Permission matrix: `../docs/01_Architecture/actor-permissions-matrix.md`
- Roadmap: `../ROADMAP.md`
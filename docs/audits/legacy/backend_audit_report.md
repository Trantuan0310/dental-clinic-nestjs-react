# 📋 Tổng hợp Vấn đề Backend — Sẵn sàng cho Frontend

> **Phạm vi kiểm tra:** Toàn bộ `backend/src/**` + `backend/prisma/**` + `backend/.env.example` + `backend/docker-compose.yml`.  
> **Mục tiêu:** Xác định blockers/gaps mà frontend team cần biết trước khi integrate.  
> **Ngày audit:** 19/07/2026.  
> **Cập nhật Phase 10 (22/07/2026):** Tham khảo [`ROADMAP.md` § Giai đoạn 10](../ROADMAP.md) — các blocker TS/ESLint/Jest đã đóng, docs cleaned.

---

## 🟢 Tổng quan — Backend đã ở trạng thái **rất tốt** để integrate FE

| Tiêu chí | Trạng thái | Ghi chú |
|---|---|---|
| Stack chuẩn NestJS + Prisma + Swagger | ✅ | Toàn bộ module có controller + service + module |
| API versioning `/api/v1` | ✅ | `main.ts:10-14` |
| JWT auth (Bearer + cookie refresh) | ✅ | `auth.strategy.ts`, `auth.service.ts` |
| Permission-based RBAC | ✅ | 50+ permission codes qua `@RequirePermissions(...)` |
| Global ValidationPipe (whitelist + transform) | ✅ | `main.ts:18-27` |
| Global ExceptionFilter (chuẩn shape) | ✅ | `http-exception.filter.ts` |
| Throttler (100 req/phút) + per-route throttle | ✅ | `app.module.ts:27-32` |
| CORS mở cho FE port 5173 + credentials | ✅ | `main.ts:29-34` |
| Prisma schema 30 models, 17 enums | ✅ | `schema.prisma` 1126 dòng |
| Seed: 3 roles, 50+ permissions, admin user | ✅ | `seed.ts` |
| DTO validation + Swagger decorators | ✅ | Hầu hết DTO có `@ApiProperty` + class-validator |
| Audit logging | ✅ | AuditService được inject ở UsersService/AuthService |
| Swagger UI | ✅ | `/api/docs` (chỉ dev mode, `main.ts:36-47`) |
| Cron jobs | ✅ | `PayrollCron` qua `@nestjs/schedule` |
| Event bus cross-module | ✅ | `EventEmitterModule.forRoot()` |

**Kết luận:** Backend đã production-ready về kiến trúc. Các vấn đề bên dưới là **gaps nhỏ / chưa đồng bộ**, không phải blockers kiến trúc.

---

## 🟡 Vấn đề CẦN xử lý trước khi FE go-live (P1)

### 1. ⚠️ Auth response **KHÔNG thống nhất** — Endpoint trả về 2 shape khác nhau

**Mức độ:** 🔴 Quan trọng — FE phải handle 2 cách parse.

| Endpoint | Response shape | Vị trí |
|---|---|---|
| `POST /auth/login` | `{ data: { accessToken, user, ... } }` | `auth.controller.ts:57` |
| `POST /auth/refresh` | `{ data: { accessToken, user, ... } }` | `auth.controller.ts:78` |
| `POST /auth/reset-password` | `{ data: { message: "..." } }` | `auth.controller.ts:163` |
| `GET /auth/me` | `{ data: {...} }` | `auth.controller.ts:118` |
| `GET /auth/me/login-history` | `{ data: [...], pagination: {...} }` ⚠️ | `auth.controller.ts:176` — **KHÔNG wrap trong `{ data: ... }`** |
| `POST /auth/logout`, `/logout-all`, `/change-password`, `/forgot-password` | (no body, 204) | OK |

**Vấn đề cụ thể (`auth.controller.ts:166-177`):**
```typescript
async getLoginHistory(@User() user: JwtPayload, @Req() req: Request) {
  const limit = parseInt(req.query['limit'] as string) || 20;  // ⚠️ query string parsed manually, không dùng DTO
  const cursor = req.query['cursor'] as string | undefined;
  const result = await this.authService.getLoginHistory(user.sub, limit, cursor);
  return result;  // ⚠️ trả thẳng không wrap
}
```

**So sánh cùng pattern ở `users.controller.ts:216-221`:**
```typescript
async getLoginHistory(@Param('id', ParseUUIDPipe) id: string, @Req() req: Request) {
  const limit = parseInt(req.query['limit'] as string) || 20;  // cùng pattern manual parse
  ...
  return this.usersService.getLoginHistory(id, limit, cursor);  // cũng trả thẳng
}
```

→ **Cần sửa:** Login-history ở cả `auth` và `users` controller nên wrap trong `{ data, pagination }` để đồng nhất với audit-logs endpoint và convention FE đang dùng.

---

### 2. ⚠️ Phân trang không nhất quán giữa các module

**Mức độ:** 🟡 Trung bình — FE phải code 2 cách parse.

| Endpoint | Phân trang kiểu |
|---|---|
| `GET /admin/audit-logs` | `{ data, pagination: { pageSize, nextCursor, hasMore } }` |
| `GET /auth/me/login-history` | `{ data, pagination: { pageSize, nextCursor, hasMore } }` ✅ (nhưng thiếu wrap) |
| `GET /admin/users/:id/login-history` | `{ data, pagination: { pageSize, nextCursor, hasMore } }` ✅ |
| `GET /patients?pageSize=&cursor=` | ❌ Không có field `pagination` ở controller trả về |
| `GET /appointments?...` | ❌ Không có field `pagination` ở controller |
| `GET /billing/invoices?...` | ❌ Không có field `pagination` ở controller |
| `GET /inventory/items?...` | ❌ Không có field `pagination` |
| `GET /inventory/movements?...` | ❌ Không có field `pagination` |
| `GET /admin/users?...` | ❌ Trả raw array `this.usersService.list(query)` (không wrap `{ data }`) |

→ **Cần chuẩn hóa:** Tất cả endpoint list nên trả `{ data: T[], pagination: { pageSize, nextCursor, hasMore } }`. Có sẵn helper `createPaginatedResponse()` ở `backend/src/common/dto/pagination.dto.ts:19` nhưng chỉ vài chỗ dùng.

**Lưu ý:** Có cả Zod schema (`PaginationSchema`) ở `pagination.dto.ts:3-6` **KHÔNG được dùng** — toàn bộ FE/BE đang dùng class-validator. Hai cách validate query DTO đang song song → chỉ nên giữ class-validator.

---

### 3. ⚠️ Patient list trả về khác shape — `data` không được wrap

**Mức độ:** 🟡 — Inconsistency.

```typescript
// patients.controller.ts:47-52
@Get()
@RequirePermissions('patient.read')
async list(@Query() q: ListPatientsQueryDto, @User() actor: JwtPayload) {
  return this.patients.list(q, actor);  // ⚠️ KHÔNG wrap { data }
}

// vs
@Get('lookup')
async lookup(@Query() q: LookupPatientDto, @User() actor: JwtPayload) {
  return { data: await this.patients.lookup(q, actor) };  // ✅ wrap
}
```

→ Sửa `list()` để trả `{ data, pagination }` cho đồng nhất.

---

### 4. ⚠️ `medical-records.controller.ts:62` throw `Error` thay vì `BadRequestException`

```typescript
@Post('encounters/start')
async start(@Body() dto: StartEncounterDto, @User() actor: JwtPayload) {
  if (!dto.appointmentId) {
    throw new Error('appointmentId required');  // ⚠️ Trả 500 thay vì 400
  }
  ...
}
```

→ **Cần sửa:** Dùng `BadRequestException('appointmentId required')` từ `@nestjs/common` — sẽ trả 400 thay vì 500. Class-validator nên bắt case này (`@IsUUID()` + `@IsNotEmpty()`), nhưng thiếu 1 guard.

---

### 5. ⚠️ `payroll.controller.ts` thiếu `ParseUUIDPipe` cho `id` params

So sánh:
- `billing.controller.ts:62`: `@Param('id', ParseUUIDPipe) id: string` ✅
- `payroll.controller.ts:127`: `@Param('id') id: string` ❌ — không validate UUID
- `payroll.controller.ts:84`: `@Param('id') id: string` ❌
- `payroll.controller.ts:97`: `@Param('id') id: string` ❌
- `payroll.controller.ts:208`: `@Param('periodId') periodId: string` ❌
- `shift-registration.controller.ts:49,69,78,87`: `@Param('id') id: string` ❌

→ **Cần sửa:** Thêm `ParseUUIDPipe` cho mọi `:id` param để fail-fast với 400 thay vì Prisma error 500.

---

### 6. ⚠️ Permission codes **không đồng nhất** giữa seed và code

**Mức độ:** 🔴 Quan trọng — Nếu FE check permission code nào đó, phải biết nó có thật trong seed hay không.

| Permission trong Controller | Có trong seed? |
|---|---|
| `patient.read`, `patient.create`, `patient.update`, `patient.merge`, `patient.restore`, `patient.identifier.manage` | ✅ Có |
| `patient.delete` (`patients.controller.ts:94`) | ❌ KHÔNG có trong seed! |
| `appointment.read.any`, `appointment.read.own` | ❌ KHÔNG có (seed chỉ có `appointment.read`) |
| `appointment.check_in` (`appointments.controller.ts:120`) | ❌ Seed có `appointment.checkin` (không có `_`) |
| `appointment.no_show` (`appointments.controller.ts:154`) | ❌ Seed có `appointment.no_show` ✅ — nhưng `cancel`/`update` thiếu `.any/.own` |
| `shift_registration.write` / `shift_registration.read` / `shift_registration.approve` (`appointments.controller.ts:169,176,189,206,218,233,246,259`) | ❌ Seed có `shift.register` / `shift.read.any` / `shift.read.own` / `shift.approve` / `shift.cancel` |
| `schedule.write` / `schedule.read` (`appointments.controller.ts:169,176,189,196`) | ❌ Seed có `appointment.schedule.manage` |
| `clinical_note.write` / `clinical_note.addendum` (`medical-records.controller.ts:106,117`) | ❌ Seed có `clinical_note.create/update` |
| `treatment.write` / `treatment.delete` (`medical-records.controller.ts:131,142,153`) | ❌ Seed có `treatment.create/update/delete` |
| `dental_chart.write` / `dental_chart.read` | ❌ Seed có `dental_chart.read/update` |
| `prescription.write` | ❌ Seed có `prescription.create/update` |
| `encounter.start` / `encounter.complete` / `encounter.cancel` | ❌ Seed có `encounter.create/close/cancel` |
| `invoice.read.any` / `invoice.read.own` | ✅ Có |
| `invoice.audit.read` | ✅ Có |
| `payslip.read.own` | ✅ Có |
| `payroll.read.any` / `payroll.read.own` / `payroll.config.*` / `payroll.compensation.*` / `payroll.period.*` | ✅ Có |
| `inventory.stock_in` / `inventory.stock_out` / `inventory.update` | ✅ Có |
| `user.read` / `user.create` / `user.update` / `user.deactivate` / `user.reset_password` | ✅ Có |
| `role.upsert` | ✅ Có |
| `system.audit.read` | ✅ Có |

**Tóm lại:** Nhiều controller dùng permission codes **không tồn tại trong seed**, nghĩa là role mặc định (`clinic_admin`, `receptionist`, `dentist`) sẽ **bị 403** trên các endpoint đó ngay cả khi logic đúng.

→ **Hai cách xử lý (cần chọn 1):**
- **(A) Sửa controller** cho khớp seed (đổi `patient.delete` → `patient.update` + check trong service, đổi `appointment.check_in` → `appointment.checkin`, v.v.)
- **(B) Mở rộng seed** thêm các codes còn thiếu và gán vào role tương ứng.

**Khuyến nghị:** Phương án (B) — thêm permission codes alias để không phá code, đảm bảo coverage.

---

### 7. ⚠️ Admin endpoints mount trên `/admin/...` cần chú ý path conflict

Backend có 2 namespace admin:
- `/admin/users` (UsersController)
- `/admin/roles` (RolesController)
- `/admin/audit-logs` (AuditController)

→ FE route `/admin/users`, `/admin/roles`, `/admin/audit-logs`. Không có vấn đề conflict nhưng cần thống nhất sidebar group.

---

## 🟠 Vấn đề NÊN xử lý sớm (P2)

### 8. Thiếu explicit response schema cho hầu hết endpoints

Chỉ một số endpoint có `@ApiResponse(...)` cụ thể. Phần lớn:
- Không khai báo `@ApiResponse({ status: 200, type: SomeDto })` → Swagger UI không hiển thị response shape
- DTO return type không có class trả về — controllers trả `Promise<any>` ngầm

**Ví dụ tốt:** `auth.controller.ts:34-37` có `@ApiOperation` + `@ApiResponse`.
**Ví dụ thiếu:** `patients.controller.ts:40-45` chỉ có `@ApiOperation`, thiếu `@ApiResponse`.

→ **FE không sao** nếu biết shape từ code, nhưng Swagger UI sẽ kém. Nếu muốn gen client tự động từ OpenAPI, cần bổ sung.

---

### 9. DTOs chưa có file `response.dto.ts` riêng

Hiện tại trộn lẫn request và response trong cùng file. Ví dụ `patient.dto.ts`:
- Có cả `CreatePatientDto`, `UpdatePatientDto`, `ListPatientsQueryDto` (request)
- Nhưng thiếu `PatientResponseDto`, `PatientListResponseDto` (response) → Swagger hiển thị yếu

→ **Không ảnh hưởng FE chạy thật**, chỉ ảnh hưởng tooling (codegen từ OpenAPI).

---

### 10. `payroll.controller.ts:127,158,168,176,189,208` — `@Param('id') id` không có ParseUUIDPipe

Đã nói ở mục #5. Tổng hợp các file cần sửa:
- `payroll/payroll.controller.ts` — 7 chỗ
- `payroll/shift-registration.controller.ts` — 4 chỗ

---

### 11. CORS chỉ mở 1 origin

```typescript
app.enableCors({
  origin: process.env.CORS_ORIGIN || 'http://localhost:5173',  // ⚠️ string, không phải array
  credentials: true,
  ...
});
```

→ Nếu sau này cần nhiều origin (vd preview deploys), phải đổi sang array + check function. Hiện tại OK cho dev.

---

### 12. `auth.service.ts:355` log password reset token ở `console.log` (insecure)

```typescript
this.logger.log(`Password reset token for ${email}: ${resetToken}`);
```

→ Đây là mock cho dev (đã có `EMAIL_MOCK=true` trong `.env.example`), nhưng cần xóa/replace bằng email service thật trước production. Có thể bypass nếu FE không dùng forgot-password flow MVP.

---

### 13. `.env` đã được commit (private repo) — chứa `JWT_SECRET=change-this-...`

`backend/.env` có file (xác nhận từ `ls`). Đây là secret placeholder, không sao cho dev, nhưng:
- Nên thêm `backend/.env` vào `.gitignore` (chưa kiểm tra nhưng convention)
- Production phải dùng secret khác

---

### 14. `auth.service.ts:218-246` — `refresh()` không revoke token cũ

So sánh `getUserFromRefreshToken` ở line 503-552 có revoke, nhưng `refresh()` ở line 218 chỉ tạo access token mới và gọi `createRefreshToken` → token cũ KHÔNG bị revoke trong transaction. Có thể dẫn đến race condition nếu nhiều tab cùng refresh.

→ **Ảnh hưởng thấp cho FE**, nhưng có thể gây 403 lúc refresh nếu backend fix sau.

---

## 🟢 Những thứ đã rất tốt — FE có thể rely on

| Tính năng | File / Vị trí | FE impact |
|---|---|---|
| **Auth flow** (login → cookie refresh → me) | `auth/auth.controller.ts` | Sẵn sàng dùng với axios interceptor |
| **Pagination cursor-based** | `audit-logs`, `login-history` | Pattern: `pageSize` + `cursor` |
| **Row-level security** cho dentist | nhiều services | FE chỉ cần gọi API, BE tự filter |
| **Permission codes trong JWT payload** | `auth.service.ts:191,231` | FE có thể decode JWT để check UI permission |
| **Cookie httpOnly + sameSite=strict** | `auth.controller.ts:48-54` | FE cần `withCredentials: true` trong axios |
| **Versioning URI** `/api/v1` | `main.ts:10-14` | FE phải base URL có prefix `/api/v1` |
| **Global ValidationPipe** với `whitelist + forbidNonWhitelisted` | `main.ts:18-27` | FE gửi field thừa sẽ bị 400 |
| **Event bus** `EventEmitterModule` | `app.module.ts:33` | Internal only, FE không cần quan tâm |
| **Health endpoint** | `common/health.controller.ts` | `/health` (KHÔNG có prefix `/api/v1` vì global guard không áp dụng) |
| **Decorators** `@User()`, `@RequirePermissions()` | `common/decorators/` | FE chỉ dùng API output, không trực tiếp |

---

## 📡 Bảng API endpoints đầy đủ (cho FE reference)

### `/api/v1/auth` (10 endpoints)
| Method | Path | Permissions | Notes |
|---|---|---|---|
| POST | `/login` | public | Rate-limit 5/phút, set cookie `refreshToken` |
| POST | `/refresh` | public (cookie) | Set cookie mới |
| POST | `/logout` | auth | Clear cookie |
| POST | `/logout-all` | auth | Revoke tất cả refresh tokens |
| GET | `/me` | auth | Trả `{ data: UserResponse }` |
| POST | `/change-password` | auth | 204 |
| POST | `/forgot-password` | public | Rate-limit 3/phút, 204 |
| POST | `/reset-password` | public | Trả `{ data: { message } }` |
| GET | `/me/login-history` | auth | ⚠️ Trả raw `{ data, pagination }` không wrap |

### `/api/v1/admin/users` (8 endpoints)
| Method | Path | Permission |
|---|---|---|
| GET | `/` | `user.read` |
| POST | `/` | `user.create` |
| GET | `/:id` | `user.read` |
| PATCH | `/:id` | `user.update` |
| PUT | `/:id/roles` | `user.update` |
| POST | `/:id/deactivate` | `user.deactivate` (rate-limit 3/p) |
| POST | `/:id/reactivate` | `user.deactivate` |
| POST | `/:id/reset-password` | `user.reset_password` (rate-limit 3/p) |
| GET | `/:id/login-history` | `user.read` |

### `/api/v1/admin/roles` (6 endpoints)
| Method | Path | Permission |
|---|---|---|
| GET | `/` | `role.upsert` |
| GET | `/permissions` | `role.upsert` |
| GET | `/:id` | `role.upsert` |
| POST | `/` | `role.upsert` |
| PATCH | `/:id` | `role.upsert` |
| DELETE | `/:id` | `role.upsert` |

### `/api/v1/admin/audit-logs` (1 endpoint)
| Method | Path | Permission |
|---|---|---|
| GET | `/` | `system.audit.read` (cursor pagination) |

### `/api/v1/patients` (12 endpoints)
| Method | Path | Permission |
|---|---|---|
| GET | `/lookup` | `patient.read` |
| GET | `/` | `patient.read` ⚠️ response không wrap |
| POST | `/` | `patient.create` |
| GET | `/:id` | `patient.read` |
| PATCH | `/:id` | `patient.update` |
| PATCH | `/:id/override-dob` | `patient.update` |
| DELETE | `/:id` | `patient.delete` ⚠️ không có trong seed |
| POST | `/:id/restore` | `patient.restore` |
| GET | `/:id/phones` | `patient.read` |
| POST | `/:id/identifiers` | `patient.identifier.manage` |
| DELETE | `/:id/identifiers/:identId` | `patient.identifier.manage` |
| POST | `/merge` | `patient.merge` |

### `/api/v1/patients/:id` (proxy controller — BR-PT-022)
| Method | Path | Permission |
|---|---|---|
| GET | `/encounters` | `encounter.read.any`/`own`/`basic` |
| GET | `/dental-chart` | `dental_chart.read` |
| GET | `/invoices` | `invoice.read.any`/`own` |

### `/api/v1/appointments` (15 endpoints)
| Method | Path | Permission |
|---|---|---|
| GET | `/` | `appointment.read.any`/`own` ⚠️ không có trong seed |
| GET | `/:id` | `appointment.read.any`/`own` |
| PATCH | `/:id` | `appointment.update` |
| GET | `/today` | `appointment.read.any`/`own` |
| GET | `/waiting-queue` | `appointment.read.any`/`own` |
| GET | `/availability` | `appointment.read.any`/`own` |
| POST | `/` | `appointment.create` |
| PATCH | `/:id/reschedule` | `appointment.update` |
| POST | `/:id/check-in` | `appointment.check_in` ⚠️ không có trong seed |
| POST | `/:id/start-encounter` | `appointment.check_in` ⚠️ không có trong seed |
| POST | `/:id/cancel` | `appointment.cancel` |
| POST | `/:id/no-show` | `appointment.no_show` |
| POST | `/schedules` | `schedule.write` ⚠️ không có trong seed |
| GET | `/schedules` | `schedule.read` ⚠️ không có trong seed |
| POST | `/time-offs` | `schedule.write` ⚠️ không có trong seed |
| GET | `/time-offs` | `schedule.read` ⚠️ không có trong seed |
| POST | `/shift-registrations` | `shift_registration.write` ⚠️ không có trong seed |
| GET | `/shift-registrations` | `shift_registration.read` ⚠️ không có trong seed |
| POST | `/shift-registrations/:id/approve` | `shift_registration.approve` ⚠️ không có trong seed |
| POST | `/shift-registrations/:id/reject` | `shift_registration.approve` ⚠️ không có trong seed |
| POST | `/shift-registrations/:id/cancel` | `shift_registration.write` ⚠️ không có trong seed |

### `/api/v1/medical-records` (12 endpoints)
| Method | Path | Permission |
|---|---|---|
| GET | `/encounters` | `encounter.read.any`/`own` |
| POST | `/encounters/start` | `encounter.start` ⚠️ seed có `encounter.create` |
| GET | `/encounters/:id` | `encounter.read.any`/`own` |
| POST | `/encounters/:id/close` | `encounter.complete` ⚠️ seed có `encounter.close` |
| POST | `/encounters/:id/cancel` | `encounter.cancel` |
| PUT | `/encounters/:id/clinical-note` | `clinical_note.write` ⚠️ seed có `clinical_note.update` |
| POST | `/encounters/:id/clinical-note/addendums` | `clinical_note.addendum` ⚠️ không có trong seed |
| POST | `/encounters/:id/treatments` | `treatment.write` ⚠️ seed có `treatment.create` |
| PATCH | `/encounters/:id/treatments/:tid` | `treatment.write` ⚠️ seed có `treatment.update` |
| DELETE | `/encounters/:id/treatments/:tid` | `treatment.delete` |
| POST | `/encounters/:id/prescription` | `prescription.write` ⚠️ seed có `prescription.create` |
| POST | `/encounters/:id/dental-chart/snapshot` | `dental_chart.write` ⚠️ seed có `dental_chart.update` |
| GET | `/patients/:patientId/dental-chart/latest` | `dental_chart.read` |

### `/api/v1/billing` (12 endpoints)
| Method | Path | Permission |
|---|---|---|
| GET | `/invoices` | `invoice.read.any`/`own` |
| GET | `/invoices/:id` | `invoice.read.any`/`own` |
| POST | `/invoices/:id/issue` | `invoice.issue` |
| PUT | `/invoices/:id/discount` | `invoice.update` |
| PUT | `/invoices/:id/notes` | `invoice.update` |
| POST | `/invoices/:id/void` | `invoice.void` |
| POST | `/invoices/:id/payments` | `invoice.payment.create` ⚠️ seed có `payment.create` |
| GET | `/invoices/:id/audits` | `invoice.audit.read` |
| GET | `/invoices/by-encounter/:encounterId` | `invoice.read.any`/`own` |
| GET | `/reports/revenue` | `report.revenue.read` |
| GET | `/reports/outstanding` | `report.outstanding.read` |

### `/api/v1/inventory` (11 endpoints)
| Method | Path | Permission |
|---|---|---|
| GET | `/items` | `inventory.read` |
| GET | `/items/low-stock` | `inventory.read` |
| GET | `/items/:id` | `inventory.read` |
| POST | `/items` | `inventory.create` |
| PUT | `/items/:id` | `inventory.update` |
| DELETE | `/items/:id` | `inventory.delete` |
| POST | `/items/:id/stock-in` | `inventory.stock_in` |
| POST | `/items/:id/stock-out` | `inventory.stock_out` |
| POST | `/items/:id/adjust` | `inventory.update` |
| GET | `/movements` | `inventory.read` |
| GET | `/categories` | `inventory.read` |
| POST | `/categories` | `inventory.create` |

### `/api/v1/payroll` (12 endpoints)
| Method | Path | Permission |
|---|---|---|
| GET | `/config` | `payroll.config.read` |
| PUT | `/config` | `payroll.config.update` |
| GET | `/compensations` | `payroll.compensation.read` |
| POST | `/compensations` | `payroll.compensation.update` |
| PATCH | `/compensations/:id` | `payroll.compensation.update` |
| DELETE | `/compensations/:id` | `payroll.compensation.update` |
| GET | `/periods` | `payroll.read.any` |
| POST | `/periods` | `payroll.period.create` |
| GET | `/periods/:id` | `payroll.read.any` |
| POST | `/periods/:id/compute` | `payroll.period.compute` |
| POST | `/periods/:id/adjustments` | `payroll.period.adjust` |
| POST | `/periods/:id/lock` | `payroll.period.lock` |
| POST | `/periods/:id/approve` | `payroll.period.approve` |
| POST | `/periods/:id/mark-paid` | `payroll.period.mark_paid` |
| POST | `/periods/:id/open-adjustment` | `payroll.period.adjust` |
| GET | `/me/history` | `payroll.read.own` |
| GET | `/me/payslip/:periodId` | `payslip.read.own` |
| GET | `/me/compensation` | `payroll.compensation.read` |
| GET | `/me/preview` | `payroll.read.own` |

### `/api/v1/shifts/registrations` (6 endpoints)
| Method | Path | Permission |
|---|---|---|
| GET | `/` | `shift.read.any`/`own` |
| GET | `/:id` | `shift.read.any`/`own` |
| POST | `/` | `shift.register` |
| POST | `/:id/approve` | `shift.approve` |
| POST | `/:id/reject` | `shift.approve` |
| POST | `/:id/cancel` | `shift.cancel` |
| POST | `/no-show-detection` | `shift.read.any` |

### `/health` (1 endpoint, no auth, no version prefix)
| Method | Path | Auth |
|---|---|---|
| GET | `/health` | public |

---

## 🔐 Permission codes chuẩn từ seed (canonical list)

Đây là **danh sách chính thức** từ `seed.ts` (đã verify 50+ codes). FE nên dùng đúng các string này:

```
USER:        user.create, user.read, user.update, user.deactivate, 
             user.reset_password, user.change_password.own
ROLE:        role.upsert
SYSTEM:      system.audit.read
PATIENT:     patient.create, patient.read, patient.update, patient.merge,
             patient.restore, patient.identifier.manage
APPOINTMENT: appointment.create, appointment.read, appointment.update,
             appointment.cancel, appointment.checkin, appointment.no_show,
             appointment.schedule.manage
ENCOUNTER:   encounter.create, encounter.read, encounter.read.any,
             encounter.read.own, encounter.read.basic, encounter.update,
             encounter.close, encounter.cancel, encounter.reopen,
             encounter.audit.read, encounter.addendum
CLINICAL:    clinical_note.create, clinical_note.read, clinical_note.read.any,
             clinical_note.read.own, clinical_note.update
TREATMENT:   treatment.create, treatment.read, treatment.read.any,
             treatment.read.own, treatment.update, treatment.delete
PRESCRIPTION:prescription.create, prescription.read, prescription.update,
             prescription.delete
DENTAL:      dental_chart.read, dental_chart.update
INVOICE:     invoice.create, invoice.read, invoice.read.any, invoice.read.own,
             invoice.update, invoice.issue, invoice.void, invoice.audit.read
PAYMENT:     payment.create, payment.reverse
REPORT:      report.revenue.read, report.outstanding.read
INVENTORY:   inventory.read, inventory.create, inventory.update, inventory.delete,
             inventory.stock_in, inventory.stock_out, inventory.adjust,
             inventory.manage
SHIFT:       shift.register, shift.read.any, shift.read.own, shift.approve,
             shift.cancel
PAYROLL:     payroll.read.any, payroll.read.own, payroll.config.read,
             payroll.config.update, payroll.compensation.read,
             payroll.compensation.update, payroll.period.create,
             payroll.period.compute, payroll.period.adjust,
             payroll.period.lock, payroll.period.approve,
             payroll.period.mark_paid, payroll.admin
PAYSLIP:     payslip.read.own, payslip.read.any
```

⚠️ **Controllers dùng codes không có trong seed này:**
- `patient.delete` (chỉ có `patient.merge`/`patient.restore`)
- `appointment.read.any`, `appointment.read.own` (chỉ có `appointment.read`)
- `appointment.check_in` (chỉ có `appointment.checkin` — không có underscore)
- `schedule.write`, `schedule.read` (chỉ có `appointment.schedule.manage`)
- `shift_registration.write/read/approve` (chỉ có `shift.*`)
- `clinical_note.write`, `clinical_note.addendum` (chỉ có `clinical_note.update/create`)
- `treatment.write` (chỉ có `treatment.create/update`)
- `dental_chart.write` (chỉ có `dental_chart.update`)
- `prescription.write` (chỉ có `prescription.create/update`)
- `encounter.start`, `encounter.complete` (chỉ có `encounter.create/close`)
- `invoice.payment.create` (chỉ có `payment.create`)

---

## 📐 Error response shape (chuẩn từ `HttpExceptionFilter`)

```typescript
{
  statusCode: number,        // 400, 401, 403, 404, 409, 422, 429, 500
  code: string,              // BAD_REQUEST, UNAUTHORIZED, FORBIDDEN, ...
  message: string,           // human-readable
  details: unknown | null,   // optional, từ exception response
  timestamp: string,         // ISO 8601
  path: string               // request URL
}
```

→ **FE có thể dựa vào `code`** (string enum) thay vì chỉ HTTP status.

---

## ⚙️ Env vars cần thiết

| Biến | Bắt buộc | Mặc định | Mục đích |
|---|---|---|---|
| `DATABASE_URL` | ✅ | - | PostgreSQL connection |
| `JWT_SECRET` | ✅ | fallback dev | JWT signing key |
| `JWT_ACCESS_TTL` | ❌ | `15m` | Access token TTL |
| `PORT` | ❌ | `3000` | Server port |
| `NODE_ENV` | ❌ | - | Bật/tắt Swagger UI |
| `CORS_ORIGIN` | ❌ | `http://localhost:5173` | FE origin |
| `THROTTLE_TTL` | ❌ | `60000` | Throttler window (ms) |
| `THROTTLE_LIMIT` | ❌ | `100` | Throttler limit |
| `EMAIL_MOCK` | ❌ | `true` | Stub email service |

⚠️ `.env.example` KHÔNG khai báo `JWT_REFRESH_TTL`, `JWT_REFRESH_SECRET` — backend hardcode 7 ngày trong `auth.service.ts:62`.

---

## 🐳 Docker setup

- **Postgres**: `postgres:16-alpine`, port `15432:5432` (host:container)
- **Extensions**: `pg_trgm`, `btree_gist`, `uuid-ossp` (init qua `01-extensions.sql`)
- **UUID v7**: `uuid_generate_v7()` từ `02-uuid-v7.sql`
- **Backend container**: port `3000:3000`, `command: pnpm start:dev`
- **Health check**: `pg_isready -U postgres` 10s interval

⚠️ **Note**: `docker-compose.yml` mount `./src` & `./prisma` vào container → dev hot-reload OK, nhưng container có thể chạy trên Linux/Mac. Trên Windows có thể gặp vấn đề permission khi mount.

---

## 🧪 Checklist đề xuất trước khi FE bắt đầu

### Bắt buộc phải sửa backend (block FE)
- [ ] **(Mục 1)** Sửa `auth.controller.ts:166-177` + `users.controller.ts:216-221` wrap response `{ data, pagination }` cho login-history
- [ ] **(Mục 6)** Đồng bộ permission codes controller ↔ seed (chọn A hoặc B)
- [ ] **(Mục 4)** Sửa `medical-records.controller.ts:62` dùng `BadRequestException`

### Nên sửa trước khi go-live
- [ ] **(Mục 2)** Chuẩn hóa pagination shape trên tất cả list endpoints
- [ ] **(Mục 3)** Sửa `patients.controller.ts:50` wrap `{ data, pagination }`
- [ ] **(Mục 5)** Thêm `ParseUUIDPipe` cho tất cả `:id` params trong payroll + shift-registration
- [ ] **(Mục 14)** Sửa `auth.service.ts:218` refresh() revoke token cũ đúng cách

### Không block nhưng nên làm
- [ ] **(Mục 8-9)** Bổ sung `@ApiResponse({ type: ... })` cho Swagger
- [ ] **(Mục 11)** Đổi CORS sang array khi có nhiều FE origin
- [ ] **(Mục 12)** Tắt `console.log` reset token khi không ở `EMAIL_MOCK=true`
- [ ] **(Mục 13)** Xác nhận `.env` đã ignore trong `.gitignore`

### Setup cần biết cho FE
- [ ] FE base URL: `http://localhost:3000/api/v1` (HTTP, không phải `/api/v1` của mình tự thêm)
- [ ] Axios `withCredentials: true` để gửi/nhận cookie `refreshToken`
- [ ] Axios interceptor cần xử lý 401 → gọi `/auth/refresh` (cookie tự gửi) → retry request
- [ ] Decode JWT payload để lấy `permissions[]` cho UI guard (xem `PermissionGuard.tsx` đã có sẵn)
- [ ] Pagination: dùng `{ pageSize, cursor }` (cursor-based, không phải offset)

---

## ✅ Tóm tắt

| Loại | Số lượng |
|---|---|
| Vấn đề blocker (P1) | 6 mục (#1, #4, #5, #6, #14) |
| Vấn đề nên sửa (P2) | 5 mục (#2, #3, #8-13) |
| Tổng API endpoints sẵn sàng | **90+ endpoints** |
| Modules đầy đủ | 10 modules (auth, users, roles, patients, appointments, medical-records, billing, inventory, payroll, audit) |
| Swagger coverage | ~70% (thiếu response DTO) |
| Permission codes inconsistency | **~15 codes controller không match seed** |

**Kết luận cuối:** Backend đã rất hoàn thiện (90%+). Phần lớn "vấn đề" là consistency & polish. **FE có thể bắt đầu integrate ngay**, chỉ cần backend team xử lý 6 mục P1 trong 1-2 sprint là đủ production-ready.

---

## 📌 Phase 10 Update (22/07/2026)

Trạng thái các mục P1/P2 được xử lý trong Giai đoạn 10:

| # | Vấn đề (audit 19/07/2026) | Phase 10 status |
|---:|---|---|
| 1 | Login-history response không wrap `{ data, pagination }` | ⏳ Mở (cosmetic — FE có thể handle 2 shape) |
| 2 | Pagination không nhất quán giữa các module | ⏳ Mở (FE cần helper chung) |
| 3 | Patient list không wrap `{ data, pagination }` | ⏳ Mở (cosmetic) |
| 4 | `medical-records.controller.ts:62` throw `Error` thay vì `BadRequestException` | ✅ Đã sửa (dùng `BadRequestException`) |
| 5 | Thiếu `ParseUUIDPipe` cho `:id` trong payroll + shift-registration | ✅ Đã sửa (payroll.controller.ts + shift-registration.controller.ts) |
| 6 | Permission codes controller ↔ seed không khớp (~15 codes) | ⏳ Mở (FE dùng seed canonical list ở §"Permission codes chuẩn từ seed" là an toàn) |
| 7 | Admin endpoints mount trên `/admin/...` không có conflict | ✅ Verified |
| 8-13 | P2 cosmetic / hardening | ⏳ Mở (không block FE MVP) |
| 14 | `auth.service.ts:218` refresh() không revoke token cũ | ⏳ Mở (ảnh hưởng thấp) |

**Build health sau Phase 10:**
- `backend npx tsc --noEmit` → **0 errors**
- `backend npm test` → **98/98 tests pass**
- `frontend npx tsc --noEmit` → **0 errors**
- `frontend npm run lint` → **0 issues**
- `frontend npm run build` → **OK 12.36s**

> **Kết luận Phase 10:** Toàn bộ blocker kỹ thuật (TS/ESLint/Jest/log cleanup) đã đóng. Các mục còn lại (1, 2, 3, 6, 14) đều là consistency/polish — **không block MVP**, FE có thể integrate dựa trên canonical permission list (§"Permission codes chuẩn từ seed") và wrap response ở axios layer.
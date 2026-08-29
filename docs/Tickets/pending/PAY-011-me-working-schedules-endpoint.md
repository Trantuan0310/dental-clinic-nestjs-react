# [PAY-011] RegisterShiftPage thiếu working schedule preview cho user hiện tại

## Priority
🟡 P2 — UX enhancement

## Status
Open

## Owner
Backend

## Estimated Effort
10 phút (nếu endpoint đã tồn tại) hoặc 30 phút (nếu tạo mới)

## Created
2026-07-18

---

## Context

- **Frontend file:** `frontend/src/features/shift/RegisterShiftPage.tsx` (dòng **141–160**)
- **SPEC UI §7** yêu cầu sidebar của trang đăng ký ca phải hiển thị card **"Ca cố định của bạn: T2–T6 8h–17h"** để bác sĩ (dentist) nhận thức được các khoảng thời gian đã có lịch làm việc cố định, tránh đăng ký ca trùng gây conflict trước khi submit.
- Hiện chỉ có **static placeholder text** (ghi chú cứng), không có fetch data.

Permission matrix đã có sẵn `shift.read.own` (hoặc fallback `appointment.read.own`). Backend không cần thay đổi permission scheme — chỉ cần endpoint query theo `req.user.id` (JWT subject).

## Proposed Solution

### Bước 1 — Verify endpoint đã tồn tại chưa

Tìm trong `backend/src/appointments/` (hoặc `backend/src/shift/`, `backend/src/users/`):

- `GET /api/v1/me/working-schedules?from=YYYY-MM-DD&to=YYYY-MM-DD`
- `GET /api/v1/working-schedules?dentistId={me}&from=&to=`
- `GET /api/v1/users/me/working-schedules`
- Hoặc bất kỳ endpoint nào trả `WorkingSchedule[]` của user hiện tại.

Dùng Grep với pattern `@Get(.*working-schedule` trong toàn `backend/src/`.

### Bước 2A — Nếu endpoint đã tồn tại

- Document URL đầy đủ + query params + response shape vào `docs/05_API/endpoints.md` (hoặc module tương ứng).
- Ping frontend team: dùng endpoint này với date range = tuần/2 tuần hiện tại đang mở đăng ký.
- Update ticket sang "Verified — ready for frontend".

### Bước 2B — Nếu endpoint chưa có

Tạo mới trong `backend/src/appointments/` (WorkingSchedule thường thuộc module appointments):

```typescript
@Controller('api/v1/me')
@UseGuards(JwtAuthGuard)
export class MeController {
  @Get('working-schedules')
  @Permissions('shift.read.own')
  async getMyWorkingSchedules(
    @Req() req: AuthedRequest,
    @Query('from') from: string,   // YYYY-MM-DD
    @Query('to') to: string,        // YYYY-MM-DD
  ) {
    return this.workingScheduleService.findForUser(req.user.id, from, to);
  }
}
```

**Response:**
```typescript
WorkingSchedule[]   // schema đã có trong Prisma, có thể tận dụng DTO hiện hữu
```

### Tests

- **Unit:** `working-schedule.service.spec.ts` — 1 test filter theo `userId` + date range.
- **E2E:** 1 test với 2 user (dentist A, dentist B) → A chỉ thấy schedule của A.

## Acceptance Criteria

- [ ] Verify endpoint đã tồn tại chưa (search `WorkingSchedule` controller).
- [ ] Nếu **chưa có**: tạo mới trong `backend/src/appointments/` với route `GET /api/v1/me/working-schedules?from=&to=`.
- [ ] Nếu **đã có**: document endpoint + ping frontend team.
- [ ] Response trả về `WorkingSchedule[]` của user hiện tại (filter từ JWT `sub`).
- [ ] Permission: `@Permissions('shift.read.own')` hoặc `appointment.read.own`.
- [ ] 1 unit test cho service.
- [ ] 1 e2e test kiểm tra user chỉ thấy schedule của chính mình.

## Dependencies

- Không có blocking dependency. Frontend có thể bắt đầu dùng ngay khi backend ready.

## Related Files

- `frontend/src/features/shift/RegisterShiftPage.tsx:141-160`
- `backend/src/appointments/` (WorkingSchedule controller/service)
- `backend/prisma/schema.prisma` (model `WorkingSchedule`)
- `docs/05_API/permissions.md`

## Related Specs

- `docs/03_Specification/UI/SPEC.md` (§7 — Register Shift page)
- `docs/03_Specification/Appointments/SPEC.md` (WorkingSchedule domain)

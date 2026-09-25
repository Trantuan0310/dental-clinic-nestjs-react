# SMTP thật + luồng kích hoạt tài khoản bác sĩ mới — 24/09/2026

## Vấn đề gốc

Tạo tài khoản bác sĩ mới ở Admin → Người dùng xong, dropdown "Bác sĩ" khi
đặt lịch hẹn (`/appointments/dentists`) không hiện tài khoản đó.

## Nguyên nhân

1. User mới luôn tạo với `status: PENDING_SETUP`
   (`backend/src/users/users.service.ts`).
2. `GET /appointments/dentists` chỉ lấy user `status: ACTIVE`
   (`backend/src/appointments/appointments.service.ts:773`).
3. Không có kênh nào để tài khoản chuyển sang `ACTIVE`:
   - Cờ `sendInvite` khi tạo user trước đây chỉ `logger.log('[MOCK EMAIL]...')`
     — không gọi SMTP, không phụ thuộc `EMAIL_MOCK`, và frontend
     (`CreateUserModal`) còn không có ô nào để bật nó.
   - Đường còn lại là "quên mật khẩu" (`resetPassword()` set `ACTIVE`), nhưng
     `EMAIL_MOCK=true` nên email chỉ log ra console.
   - **Phát hiện thêm**: frontend chưa hề có trang `/auth/reset-password`
     hay `/forgot-password` — kể cả nếu SMTP gửi được, link trong email dẫn
     tới 404. Route duy nhất tồn tại trước đó là `/login`.

Kết luận: không chỉ thiếu cấu hình SMTP, mà toàn bộ luồng đặt/khôi phục mật
khẩu chưa được implement ở frontend.

## Đã sửa trong nhánh `claude/clinic-smtp-config-c9cb6a`

**Backend**
- `backend/src/common/services/email.service.ts` — thêm
  `sendAccountSetupEmail()`.
- `backend/src/users/users.service.ts` — khi tạo user, sinh
  `PasswordResetToken` (dùng chung cơ chế với quên mật khẩu) và gửi email
  mời thật qua `EmailService`. Mặc định luôn gửi trừ khi gọi API với
  `sendInvite: false`.
- `backend/src/users/users.service.spec.ts` — thêm test cho 2 nhánh gửi/
  không gửi email mời; cập nhật mock `EmailService`.

**Frontend**
- `frontend/src/features/auth/ForgotPasswordPage.tsx`,
  `ResetPasswordPage.tsx` — trang mới, trước đây không tồn tại.
- `frontend/src/routes/AppRoutes.tsx` — thêm route `/forgot-password` và
  `/auth/reset-password` (public, ngoài `ProtectedRoute`).
- `frontend/src/features/auth/authApi.ts` — thêm `forgotPassword()`,
  `resetPassword()`.
- `frontend/src/features/auth/LoginPage.tsx` — nối link "Quên mật khẩu?"
  (key i18n đã có sẵn từ trước nhưng chưa từng được dùng).
- `frontend/src/locales/{vi,en}.json` — thêm khoá cho 2 trang mới.
- `docs/08_Deployment/ENVIRONMENT_VARIABLES.md` — ghi rõ `SMTP_*` và
  `FRONTEND_URL` giờ ảnh hưởng cả email mời tài khoản, không chỉ quên mật
  khẩu.

## Kiểm chứng

- Backend: `npx jest users.service.spec.ts` → 23/23 pass. Full suite:
  341 test pass; 3 suite fail vì môi trường Windows sẵn có (module
  `validator/lib/blacklist` thiếu, lỗi stat file tạm thời khi chạy song
  song) — không liên quan thay đổi, đã xác nhận lại từng file riêng lẻ pass.
- Frontend: `npm run typecheck` sạch.
- Đã chạy dev server thật, điều hướng trình duyệt:
  - `/login` → click "Quên mật khẩu?" → sang `/forgot-password` đúng.
  - `/auth/reset-password` (không token) → hiện lỗi "Liên kết không hợp lệ".
  - `/auth/reset-password?token=...` → form hiện đúng, validate mật khẩu
    xác nhận không khớp hoạt động phía client (không gọi API khi invalid).

## Còn thiếu — CHƯA xong

- **Chưa có test round-trip thật với DB**: worktree này không có Postgres/
  `.env` nên không dựng được backend thật để test full chuỗi tạo bác sĩ →
  nhận email → đặt mật khẩu → xuất hiện trong dropdown. Cần làm trên môi
  trường có DB trước khi coi là xong hẳn.
- **SMTP thật chưa cấu hình**: người dùng chọn dùng Gmail App Password,
  sẽ cung cấp `SMTP_USER`/`SMTP_PASS` sau. Đến lúc đó `backend/.env` vẫn
  chưa có `SMTP_HOST/PORT/USER/PASS`, `EMAIL_FROM`, và `EMAIL_MOCK` vẫn
  đang `true` (email chỉ log ra console, chưa gửi thật).
- Chưa commit/push nhánh này lên GitHub tại thời điểm ghi chú.

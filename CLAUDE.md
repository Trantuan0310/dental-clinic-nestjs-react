# Hướng dẫn cho Claude

## Quy tắc phiên làm việc (bắt buộc)

### 1. Hạn mức sử dụng 5 giờ đạt 90%

Khi hạn mức sử dụng 5 giờ đạt **90%**:

1. Dừng mọi việc đang làm. Không bắt đầu việc mới.
2. Cập nhật nhật ký tiến độ `docs/progress/session-log.md`:
   - đã làm gì, kết quả ra sao (test, CI);
   - việc nào đang dở, đang ở bước nào;
   - bước tiếp theo để phiên sau làm tiếp.
3. Commit toàn bộ thay đổi (kể cả việc dở, ghi rõ trong commit là dở) cùng nhật ký, rồi push lên GitHub.

Claude không tự đọc được phần trăm hạn mức. Quy tắc áp dụng khi người dùng báo, hoặc khi hệ thống hiện cảnh báo hạn mức.

### 2. Nhật ký để kiểm soát ngữ cảnh

- Sau mỗi việc hoàn thành, ghi thêm một mục vào `docs/progress/session-log.md` rồi commit và push cùng thay đổi đó.
- Khi ngữ cảnh hội thoại sắp đầy hoặc vừa được tóm tắt, cập nhật nhật ký trước khi làm tiếp.
- Đầu mỗi phiên, đọc nhật ký để biết đang ở đâu.

## Ghi chú dự án

- Package manager: **npm** (`package-lock.json`). Không dùng pnpm.
- Kiểm tra trước khi push:
  - backend: `npx tsc --noEmit`, `npm run lint`, `npm test`;
  - frontend: `npm run typecheck`, `npm run lint`, `npm run build`.
- Test E2E (Playwright) cần PostgreSQL và backend đang chạy. Chữ trên giao diện nằm trong `frontend/src/locales/*.ts`: đổi chữ thì sửa test E2E tương ứng.

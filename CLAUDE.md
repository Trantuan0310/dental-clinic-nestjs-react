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

- Sau mỗi việc hoàn thành, ghi thêm một mục vào **cuối** `docs/progress/session-log.md` rồi commit và push cùng thay đổi đó.
- Khi ngữ cảnh hội thoại sắp đầy hoặc vừa được tóm tắt, cập nhật nhật ký trước khi làm tiếp.
- Đầu mỗi phiên: `tail -60 docs/progress/session-log.md` để biết đang ở đâu (không đọc cả file; phần cũ ở `docs/progress/archive/`). Nếu phiên có làm code, đọc thêm `docs/progress/lessons.md` một lần.
- Khi nhật ký quá 300 dòng, chuyển các mục cũ sang `archive/`.

## Ghi chú dự án

- Package manager: **npm** (`package-lock.json`). Không dùng pnpm.
- Kiểm tra trước khi push:
  - backend: `npx tsc --noEmit`, `npm run lint`, `npm test`;
  - frontend: `npm run typecheck`, `npm run lint`, `npm run build`.
- Test E2E (Playwright) cần PostgreSQL và backend đang chạy. Chữ trên giao diện nằm trong `frontend/src/locales/*.ts`: đổi chữ thì sửa test E2E tương ứng.

## Rút kinh nghiệm (chi tiết ở `docs/progress/lessons.md`)

- Mỗi phiên có làm việc đáng kể: cuối phiên thêm bài học mới (một dòng, kèm lý do) vào `lessons.md`, commit cùng nhật ký.
- Tiết kiệm token: chỉ đọc đúng đoạn code cần (`grep -n` + `sed -n`); chờ CI bằng `subscribe_pr_activity` + `send_later` rồi kết thúc lượt, không gọi kiểm tra lặp; log CI chỉ lấy 60-80 dòng cuối.
- Quy trình PR: nhánh từ `origin/main`, đủ 10 check xanh mới merge (squash kèm sha), không hủy run đang chạy; PR chỉ có tài liệu thì không cần deploy.
- Lệnh deploy VPS (chạy trên VPS): `cd /opt/dental-clinic/production; git fetch origin; git show origin/main:scripts/deploy-vps.sh > /tmp/deploy-vps.sh; bash /tmp/deploy-vps.sh`
- Chạy thử trên trình duyệt: `scripts/dev-local.sh start|stop` (cần `cd backend && npm run build` trước). Dashboard ở route `/`.
- Không thêm phần tử `fixed` góc phải dưới (che nút Lưu); không ghi khóa API vào code/tài liệu.

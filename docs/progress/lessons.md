# Bài học làm việc (rút từ các phiên)

Mục đích: làm nhanh hơn, đỡ tốn token, không lặp lại lỗi cũ. **Đọc file này một lần ở đầu phiên có làm code** (khoảng 100 dòng). Gặp bài học mới thì thêm vào đúng nhóm, mỗi ý một dòng, ghi cả *vì sao*.

Cập nhật lần cuối: 08/11/2026 (sau các PR #87 đến #95).

## 1. Tiết kiệm token

| Việc | Cách làm | Vì sao |
|---|---|---|
| Đầu phiên | `tail -60 docs/progress/session-log.md`, không đọc cả file. Phần cũ ở `archive/`, tra bằng `grep -n "^## "` | Nhật ký từng dài 105 KB (~30 nghìn token) mà đọc hết mỗi phiên |
| Đọc code | `grep -n` rồi `sed -n 'a,bp'` đúng đoạn; không đọc cả file lớn | `reports.service.ts`, `appointments.service.ts` dài hàng nghìn dòng |
| Chờ CI | Sau khi mở PR: `subscribe_pr_activity` + một `send_later` 12-14 phút, rồi **kết thúc lượt**. Sự kiện `check_suite.completed` sẽ gọi dậy | Mỗi lần gọi `get_check_runs` trả khoảng 3-4 nghìn token; mỗi thông báo PR kèm khối hướng dẫn dài |
| Người dùng nhắn "chờ CI" khi CI chưa xong | Một lần `get_check_runs`, trả lời 2 câu, không gọi lại | Gọi lặp chỉ tốn token, CI không chạy nhanh hơn |
| Thông báo chỉ là xác nhận (đã đăng ký, đã merge) | Trả lời một câu, không làm gì thêm | Không có việc phải làm |
| Log CI lỗi | `get_job_logs` với `run_id` + `failed_only: true` + `tail_lines: 60-80`; tìm dòng `##[error]` và tên test. Không kéo 300+ dòng | Log Playwright lặp lại mỗi lần retry, 330 dòng tốn khoảng 15 nghìn token |
| Kiểm tra trước khi push | Chạy **một lần ở cuối**: `prettier --write` (thư mục đã sửa), `tsc`, `lint`, `jest` đầy đủ (15 giây) | `lint --fix` sửa file sau khi test chạy, phải chạy lại nếu làm sai thứ tự |
| Ảnh chụp màn hình | Chỉ đọc khi cần đánh giá bố cục; kết quả chữ in ra bằng `console.log` thay cho ảnh | Mỗi ảnh khoảng 1,5 nghìn token |
| Nhắc `TaskCreate` lặp lại | Bỏ qua nếu việc nhỏ; chỉ tạo task cho việc nhiều bước | Mỗi lần nhắc kèm cả danh sách task cũ |
| Việc song song | Gộp các lệnh độc lập vào một lượt (khảo sát nhiều file, chạy test + typecheck) | Ít vòng gọi hơn |

## 2. Quy trình PR và CI

1. `git fetch -q origin main && git checkout -q -B claude/trusting-gauss-8544yk origin/main` (đổi tên nhánh nếu phiên giao nhánh khác).
2. Làm, kiểm (mục 4), commit, `git push -q -u origin <nhánh> --force-with-lease`, mở PR bằng `mcp__github__create_pull_request`, subscribe, `send_later`.
3. Đủ **10 check xanh** (Backend Build, Frontend Build, Backend Lint, Backend TypeScript, Frontend Lint, Frontend TypeScript, Backend Tests, Production container builds, Release migrations and PostgreSQL API tests, Playwright E2E) thì merge squash kèm `sha` của head. Playwright E2E luôn xong cuối, mất 7-10 phút (lâu hơn quanh nửa đêm giờ phòng khám, khoảng 17:00-17:30 UTC).
4. **Không bao giờ hủy run đang chạy** (từng hủy nhầm PR #90 vì tưởng treo; các bước chỉ đang xếp hàng).
5. Có việc mới khi PR trước còn chờ CI: làm trên nhánh cục bộ `local/<tên>` (không push). Khi PR trước merge thì reset nhánh chính thức về `origin/main` và `git cherry-pick`. Tận dụng 10 phút chờ CI cho việc tiếp theo.
6. Chỉ sửa tài liệu: vẫn chờ đủ 10 check (CI chạy cho mọi PR), merge xong **không cần deploy**.
7. Lệnh deploy VPS (chạy trên VPS, mình không truy cập được VPS và gensmile.online):
   ```bash
   cd /opt/dental-clinic/production; git fetch origin; git show origin/main:scripts/deploy-vps.sh > /tmp/deploy-vps.sh; bash /tmp/deploy-vps.sh
   ```
   Nhiều PR liên tiếp thì gộp thành một lệnh; nói rõ PR nào cần cấu hình thêm (biến môi trường, migration).
8. CI đỏ: đọc đúng dòng lỗi, tái hiện, sửa, push một lần. Lỗi do chính PR gây ra (ví dụ nút nổi che nút Lưu) thì sửa ngay, đừng chạy lại hy vọng "flaky".

## 3. Chạy thử trên trình duyệt (xác minh tính năng thật)

- Dựng môi trường: `cd backend && npm run build`, rồi `scripts/dev-local.sh start` (Postgres + backend + vite 5173, DB demo `guidedemo`), xong `scripts/dev-local.sh stop`. Postgres tự dừng sau khi môi trường khởi động lại: script đã tự `pg_ctlcluster 16 main start`.
- Playwright của repo không chạy được cục bộ (khác phiên bản bản cài sẵn): viết script `.cjs` trong thư mục scratchpad, `require('playwright')`, `chromium.launch()`. E2E thật do CI chạy.
- Đăng nhập: trang `/login`, `getByLabel(/Email/i)`, `getByLabel(/Mật khẩu/i)`, nút `Đăng nhập`, rồi `waitForURL` ra khỏi `/login`. Tài khoản demo nằm ở đầu `scripts/dev-local.sh`.
- Route: Dashboard là `/` (không phải `/dashboard`, đó là trang 404 vẫn có header). Hóa đơn `/billing/invoices/:id`. Trang con khác tra `frontend/src/routes/AppRoutes.tsx`.
- Bộ chọn khoảng thời gian trên Dashboard là `<select>` gốc: dùng `locator('select:has(option[value="6m"])').selectOption('6m')`, không `click` vào chữ.
- AI giả lập: một server Node nhỏ trả JSON kiểu OpenAI (`choices[0].message.content`), trỏ `AI_BASE_URL/AI_API_KEY/AI_MODEL` vào. Với bot chat, giả lập theo **kết quả công cụ có trong lời nhắn** (ví dụ chứa "Kết quả công cụ find_patient" thì gọi `free_slots`). Kiểm lời nhắn gửi đi không chứa tên/SĐT bằng `grep` file log.
- Dữ liệu demo mỏng (heatmap gần 0%, kế hoạch chấp nhận bằng "—"): cần tạo thêm trước buổi bảo vệ.
- Kiểm ở bước chạy thử, không chờ CI: bố cục (nút cố định có che nút khác không), `console error`, mã HTTP lỗi.

## 4. Lỗi hay gặp khi code

- **Không thêm phần tử `fixed` ở góc phải dưới** (từng che nút Lưu của trang kế hoạch điều trị, E2E đỏ một vòng CI). Đặt nút vào header; khung nổi chỉ hiện khi người dùng mở.
- **Sửa file lớn bằng script Python:** xem cấu trúc bằng `grep -n "^export\|as const\|^};"` trước, chèn theo số dòng; tìm chuỗi bằng `index()` đã từng chèn nhầm vào giữa dòng định nghĩa kiểu. `replace` không giới hạn số lần từng sinh biến không dùng làm `lint` đỏ: dùng `replace(..., 1)` hoặc `Edit` có ngữ cảnh.
- **Test phụ thuộc giờ hiện tại sẽ đỏ vào một ngày nào đó** (08/11/2026, Chủ nhật: 8 test đặt lịch công khai hỏng, PR chỉ có tài liệu cũng đỏ). Test dùng "ngày mai 10:00" trùng đúng phút đầu tiên được đặt online khi chạy vào Chủ nhật. Dùng ngày làm việc cách ít nhất 3 ngày hoặc đồng hồ giả; khi CI đỏ ở PR chỉ-tài-liệu, chạy cùng test cục bộ trước (ngày cục bộ = ngày CI).
- **Đổi chữ trên giao diện:** thêm khóa vào cả `vi` và `en` của đúng file `frontend/src/locales/*.ts`, rồi `node frontend/scripts/check-ui-locales.mjs`; sửa test E2E theo chữ mới.
- **Hàm khởi tạo thêm tham số** thì test cũ gọi `new X(a, b)` hỏng: `tsc --noEmit` chỉ ra ngay, sửa `{} as any`.
- **`Card` không chuyển `data-testid`:** bọc trong `div`.
- **Hook sau `return` sớm** làm lint đỏ: đặt mọi hook ở đầu component.
- **Prisma:** `prisma format` căn lại cột (chấp nhận); migration viết tay ở `backend/prisma/migrations/NNN_ten/migration.sql` (mới nhất 058).
- **Cổng AI (xkiro):** các mô hình `anthropic/claude-*` mới (haiku 5.5, sonnet 5.5, opus…) trả 403 "chỉ nhận yêu cầu từ công cụ chính thức của Anthropic" khi ứng dụng gọi; dùng được: `anthropic/claude-sonnet-4.5`, `anthropic/claude-sonnet-4`, họ `google/gemini-*-flash`, `openai/gpt-*`. **Không vượt chốt chặn** (không giả danh công cụ chính thức). Chọn mô hình bằng cách chạy thử từ **trong container backend** bằng Node (đúng cách ứng dụng gọi), không chỉ `curl` ngoài. Dòng log "AI summary uses ... model" chỉ là cấu hình, **không** chứng tỏ AI chạy: phải thấy một lần gọi thành công (không có dòng `AI ... failed`, giao diện không hiện "Chưa dùng được AI").
- **AI:** mô hình không được thấy tên/SĐT bệnh nhân (dùng mã ref `P1…` hoặc `{ten}` điền ở máy chủ); AI chỉ soạn nháp, không tự ghi; luôn có đường dự phòng khi chưa cấu hình hoặc lỗi.
- **Dừng tiến trình:** `pkill -f "node dist/main"` từng giết cả shell (mã 144). Dùng `scripts/dev-local.sh stop`.
- **Mock test kiểu regex thô** làm mất ba vòng chạy thử (câu hỏi thường khớp nhầm nhánh đặt lịch): làm mock theo trạng thái rõ ràng, thử một câu trước khi chạy cả kịch bản.

## 5. Bảo mật và ranh giới

- Người dùng từng dán khóa API và khóa SSH vào chat: **không bao giờ** ghi vào code, commit hay tài liệu; nhắc đổi khóa một lần; khóa chỉ ở `.env.production` trên VPS.
- Không truy cập được VPS, `gensmile.online` và một số host (api.xkiro.com, luatvietnam.vn, ey.com): nói rõ, đưa lệnh cho người dùng chạy.
- Hành động ra ngoài hoặc khó đảo ngược (merge, deploy, xóa): chỉ làm theo yêu cầu của người dùng trong phiên; PR và nhánh do mình tạo thì được sửa tự do.

## 6. Giao tiếp

- Trả lời tiếng Việt, ngắn: kết quả trước, rồi việc người dùng cần làm. Không kể lại từng bước.
- Việc dài: một dòng trạng thái khi bắt đầu và khi đổi hướng.
- Báo thật các hạn chế (chưa thử với dịch vụ thật, dữ liệu demo mỏng, việc chưa làm) và việc còn lại cho người dùng.

- Trước deploy, so fingerprint ED25519 với console VPS. Windows ssh-keyscan có thể lỗi KEX dù cổng 22 hoạt động; bản đi kèm Git lấy được khóa để đối chiếu.
- Smoke phải đọc SHA từ JSON /health qua nginx. Trang SPA có thể trả HTTP 200 cho đường dẫn sai. Trên Windows kiểm tra Vite/esbuild đang giữ file trước khi chạy npm ci trong checkout.

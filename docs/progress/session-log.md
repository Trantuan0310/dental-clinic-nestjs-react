# Nhật ký tiến độ

**Mục mới ghi ở CUỐI file.** Đầu phiên chỉ đọc phần cuối: `tail -60 docs/progress/session-log.md`. Phần cũ (đến 29/10/2026) ở `archive/session-log-2026-10.md`, tra bằng `grep -n "^## "`. Quy tắc ghi: xem `CLAUDE.md`. Bài học làm việc: `lessons.md`.

---

## 30/10 — Ba chức năng AI cho ba vai trò (soạn nháp)

- Người dùng chọn 3 chức năng: bác sĩ **ghi nhanh thành ghi chú khám**, lễ tân **soạn tin nhắn nhắc lịch / mời tái khám / trả lời khách**, quản lý **nhận xét báo cáo**.
- Nguyên tắc: AI chỉ soạn nháp; lưu ghi chú hay gửi tin vẫn qua chức năng thường. Không thêm quyền, không migration.
- **Backend** (`backend/src/ai/`):
  - `AiModel` dùng chung cấu hình với tóm tắt hồ sơ (`AI_BASE_URL` hoặc Gemini);
  - `AiAssistService` có 3 hàm, mỗi hàm có câu trả lời dự phòng khi chưa cấu hình hoặc AI lỗi;
  - endpoint `POST /ai/drafts/clinical-note` (`clinical_note.write`, phiên của mình, đang mở), `POST /ai/drafts/message` (`appointment.read.any` / `recall.*`), `GET /ai/report-commentary` (`report.revenue.read`, lưu đệm 1 giờ);
  - tin nhắn: mô hình viết `{ten}`, máy chủ điền "chị Lan" / "anh Minh", nên mô hình không thấy tên và SĐT; nhận xét báo cáo chỉ gửi số tổng;
  - nhật ký `AI_NOTE_DRAFTED`, `AI_MESSAGE_DRAFTED`;
  - `ReportsModule` export `ReportsService`.
- **Frontend** (`features/ai/`, locale mới `uiAi`):
  - tab Ghi chú: nút "AI soạn từ ghi nhanh", sửa 4 phần rồi "Thêm vào ghi chú" (nối từng phần qua `appendNote`);
  - ngăn chi tiết lịch hẹn và trang Nhắc tái khám: "AI soạn tin", 2 tab (nhắc / trả lời khách), nút Sao chép, Mở Zalo, Gọi;
  - trang Báo cáo: thẻ "AI nhận xét kỳ báo cáo", chỉ gọi khi bấm.
- Tài liệu: `docs/05_API/ai.md` §8 (BR-AI-006..008), hướng dẫn bác sĩ, lễ tân, quản trị.
- **Kiểm:**
  - backend tsc, eslint, 1568 test (16 test mới `ai-assist.service.spec.ts`);
  - frontend typecheck, eslint, locales, build;
  - chạy thật với một gateway giả lập kiểu OpenAI: ghi chú lưu được và hiện trên tab, tin nhắc lịch điền đúng "chị Dung", nhận xét báo cáo hiện; kiểm prompt gửi đi không chứa tên, SĐT.
- Lỗi tìm ra khi chạy thử và đã sửa: tab "Trả lời khách" mở từ lịch hẹn chào "quý khách" vì bỏ qua lịch hẹn. Nay trả lời cũng lấy khách của lịch hẹn hoặc lượt tái khám (thêm test).
- E2E mới `ai-assist.spec.ts` (thẻ nhận xét trên trang Báo cáo, đường dự phòng vì CI không có AI). Chưa chạy được trên máy (phiên bản Playwright của repo khác bản cài sẵn), để CI chạy.
- Production: cần `AI_BASE_URL`/`AI_API_KEY`/`AI_MODEL` (hoặc `GEMINI_API_KEY`) trong env để dùng AI thật; thiếu thì cả 3 nút vẫn chạy bằng bản mẫu.

## 05/11/2026 — Viết lại kịch bản demo (DEMO_SCRIPT.md v2.0)
- `docs/10_Thesis/DEMO_SCRIPT.md` viết lại theo cốt truyện một bệnh nhân đi hết vòng, qua 3 vai (lễ tân, bác sĩ, quản lý).
- Thêm các tính năng mới: AI soạn ghi chú/tin nhắn/nhận xét báo cáo, chỉ số vận hành, heatmap công suất, QR VietQR, webhook ngân hàng (kèm lệnh PowerShell mô phỏng), Điều trị chờ đặt lịch, hẹn tiếp khi thu tiền.
- Thêm: dữ liệu cần dựng sẵn, cấu hình cần bật, phương án dự phòng, bản rút gọn 15 phút (mục ⏱), bảng câu hỏi hội đồng, số liệu mới (1.639 test backend, 108 test PostgreSQL, 38 E2E, 124 quyền).
- Chỉ sửa tài liệu, không cần chạy test hay deploy.

## 05/11/2026 — Trợ lý AI dạng chat (nhân viên)
- Người dùng chọn làm bot chat bản nhỏ: tra cứu + đặt lịch có xác nhận, 5 công cụ.
- **Backend** (`backend/src/ai/assistant/`): `AiChatService` chạy vòng lặp tối đa 4 lần gọi công cụ bằng JSON (`{"tool","args"}` / `{"reply"}`), dùng chung `AiModel` nên chạy với cả cổng OpenAI/Anthropic lẫn Gemini. Công cụ: `find_patient`, `free_slots`, `pending_treatments`, `unpaid_invoices`, `propose_appointment`; mỗi công cụ bọc service sẵn có với quyền của người dùng, công cụ thiếu quyền bị ẩn.
- Riêng tư: kết quả công cụ dùng mã ref `P1..`, mô hình không thấy tên/SĐT; trình duyệt điền tên. Bot chỉ tạo **thẻ xác nhận**; endpoint `POST /ai/assistant/actions/create-appointment` mới tạo lịch (qua `AppointmentsService.create`) khi người dùng bấm. Nhật ký `AI_ASSISTANT_CHAT`, `AI_ACTION_EXECUTED`. Giới hạn 20 lượt/phút.
- **Frontend**: `features/ai/AssistantChat.tsx` (nút nổi trong `AppShell`, ví dụ câu hỏi, thẻ xác nhận), locale `uiAi.assistant`.
- Tài liệu `docs/05_API/ai.md` §9 (BR-AI-009..012); `DEMO_SCRIPT.md` thêm mục 5.4 và câu hỏi hội đồng.
- **Kiểm:** backend tsc, eslint, 1653 test (14 test mới `ai-chat.service.spec.ts`); frontend typecheck, eslint, locales, build. Chạy thật với cổng giả lập: hỏi "ai chưa đặt lịch" ra danh sách, "đặt lịch cho chị A ngày mai" ra thẻ, bấm Xác nhận tạo được lịch; kiểm log gửi mô hình không chứa tên/SĐT. E2E mới `ai-assistant.spec.ts` (đường dự phòng, CI không có AI).
- Chưa thử với mô hình thật trên VPS: mô hình thật có thể đôi khi trả JSON lệch; khi đó bot trả "chưa trả lời được", không làm hỏng chức năng khác. Nên thử vài câu trên VPS trước buổi bảo vệ.
- CI E2E đỏ ở `flow-treatment-plan.spec.ts`: nút nổi "Trợ lý AI" (góc phải dưới) che nút "Lưu" của trang. Sửa: nút mở trợ lý chuyển lên thanh header (`AssistantButton`, trạng thái ở `stores/assistantStore.ts`), không còn nút nổi che nội dung; khung chat chỉ hiện khi bấm mở.

## 05/11/2026 — B1: thêm 2 chỉ số vận hành (hủy sát giờ, tỷ lệ thu)
- Thẻ "Chỉ số vận hành" từ 4 lên 6 chỉ số. **Hủy sát giờ:** lịch khách hủy trước giờ hẹn dưới 24 giờ ÷ tổng lịch (bỏ lịch phòng khám tự hủy), mục tiêu ≤ 5%. **Tỷ lệ thu:** đã thu ÷ doanh thu điều trị của kỳ (cùng cơ sở với báo cáo, tối đa 100%), mục tiêu ≥ 95% (đề xuất). Công suất ghế tổng đã có ở heatmap nên không thêm vào thẻ.
- `ReportsService.revenueAndCollected` (public), `isLateCancel`, 2 hàm trong `PracticeMetricsService`; test mới; locale vi/en; cập nhật DEMO_SCRIPT mục 5.1 và kế hoạch cải tiến.

## 05/11/2026 — B3: phễu bệnh nhân
- Thẻ **Hành trình bệnh nhân** trên Dashboard: đặt lịch → đã đến → đã khám → đã thanh toán đủ → có lịch hẹn tiếp; mỗi bước là tập con của bước trước (thanh không bao giờ dài hơn bước trước); lọc theo nguồn đặt lịch khi có từ 2 nguồn trở lên. Lịch do phòng khám tự hủy không tính; "có lịch hẹn tiếp" chỉ xét bệnh nhân đã thanh toán đủ.
- Backend: `patientFunnel` (hàm thuần) trong `practice-metrics.ts`, `PracticeMetricsService.patientFunnel`, `GET /billing/reports/patient-funnel` (`report.revenue.read`), 6 test mới. Frontend: `features/dashboard/funnelCard.tsx`, locale `uiEntry.dashboard.funnel`, E2E `patient-funnel.spec.ts`.
- Chạy thật trên dữ liệu demo 6 tháng: 96 → 96 → 96 → 64 → 9; không lỗi console/API. Thêm: E2E trợ lý AI trước đó mở `/dashboard` (404 nhưng vẫn có header); sửa thành `/`.
- Chưa làm trong B3: thác nước tài chính, small multiples theo bác sĩ, thanh chồng tuổi nợ.

## 08/11/2026 — Rút kinh nghiệm và tối ưu cách làm việc
- Xem lại các phiên #87 đến #95: tốn token nhiều nhất ở (1) quy tắc "đọc cả nhật ký" (105 KB), (2) gọi kiểm tra CI lặp lại, (3) kéo log Playwright 330 dòng, (4) vòng chạy thử trình duyệt phải dựng tay mỗi lần, (5) một vòng CI hỏng vì nút nổi che nút Lưu.
- Làm: chuyển nhật ký cũ (đến 29/10) sang `docs/progress/archive/session-log-2026-10.md` (nhật ký còn khoảng 8 KB, mục mới ghi ở cuối, đầu phiên chỉ `tail -60`); viết `docs/progress/lessons.md` (tiết kiệm token, quy trình PR/CI, chạy thử trình duyệt, lỗi hay gặp, bảo mật, giao tiếp); thêm `scripts/dev-local.sh start|stop` (Postgres + backend + vite, dừng theo nhóm tiến trình); cập nhật `CLAUDE.md` (đọc `tail`, mục "Rút kinh nghiệm" với lệnh deploy và quy trình PR).
- Chỉ tài liệu và script phát triển, không đổi mã ứng dụng.
- Backend Tests đỏ ở PR #96 (chỉ tài liệu) vào Chủ nhật 08/11: `futureSlot()` trong `booking.service.spec.ts` chọn "ngày mai 10:00", trùng đúng phút đầu tiên được đặt online khi chạy vào Chủ nhật (mở cửa Thứ hai 08:00 + 2 giờ chờ tối thiểu) nên 8 test đặt lịch công khai hỏng. Sửa: chọn ngày làm việc cách ít nhất 3 ngày. Không đổi mã ứng dụng.

## 08/11/2026 — Bot chat: mở rộng công cụ tra cứu; sửa cấu hình AI trên VPS
- VPS: bot báo "Trợ lý AI đang không phản hồi". Log: cổng xkiro trả 403 cho `anthropic/claude-haiku-5.5` (chỉ nhận công cụ chính thức của Anthropic). Chạy thử mọi mô hình từ trong container: `anthropic/claude-sonnet-4.5`, `anthropic/claude-sonnet-4`, họ gemini-flash, gpt đều 200. Đề xuất `AI_MODEL=anthropic/claude-sonnet-4.5`. Cải chính: trước đó ghi "AI trên VPS chạy thật" chỉ dựa vào dòng log cấu hình, không phải một lần gọi thành công; tóm tắt hồ sơ và ba chức năng soạn nháp có thể đã rơi về bản mẫu.
- Người dùng nhận xét bot "hỏi được ít vấn đề quá". Thêm 4 công cụ chỉ đọc: `appointments_on` (lịch hẹn theo ngày, buổi, bác sĩ, trạng thái, bệnh nhân), `dentist_hours` (ca làm), `waiting_now` (hàng chờ), `report_summary` (số tổng, cần `report.revenue.read`). Vẫn dùng mã ref cho bệnh nhân. Constructor `AiChatService` thêm `ReportsService`.
- Kiểm: tsc, eslint, 58 test AI (5 test mới); chạy thật trên service với cổng giả lập (4 công cụ trả đúng dữ liệu, không lỗi). Ví dụ gợi ý trong khung chat có thêm 2 câu.

## 08/11/2026 — Kế hoạch 15 ngày; Đợt 1 ĐANG DỞ (chưa mở PR, chờ người dùng duyệt kế hoạch)
- Buổi bảo vệ còn 15 ngày (trước đó ghi nhầm là 09/11). Kế hoạch 5 đợt đã gửi người dùng: Đợt 1 độ tin cậy; Đợt 2 A1, A3, C3; Đợt 3 A2, A4, A5; Đợt 4 báo cáo, B4, B5; Đợt 5 hồi quy, luận văn, đóng băng. C1, C2 để "hướng phát triển". Người dùng yêu cầu **chỉ lên kế hoạch**, chưa làm tiếp.
- Đã làm dở Đợt 1 (commit này, chưa PR): `extractJsonObject` lấy khối JSON cân bằng đầu tiên; `AiModel.jsonOrText` (mô hình trả chữ thì dùng làm câu trả lời); bot trả lời theo mẫu khi AI hỏng (`assistant/fallback-intents.ts`, 6 nhóm câu hỏi, gõ không dấu vẫn hiểu); `/health` trả `commit` (biến `GIT_SHA` do `deploy-vps.sh` đặt, khai trong `docker-compose.prod.yml`); `scripts/smoke-vps.sh`. Test AI 70 đạt, tsc sạch.
- Bước tiếp: sửa `smoke-vps.sh` gọi `/health` (backend để ở gốc, không có `/api`; cần xem nginx có chuyển `/health` không), chạy đủ kiểm tra, mở PR khi người dùng duyệt.

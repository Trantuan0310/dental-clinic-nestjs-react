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

## 15/11/2026 — Gộp Điều trị với Sơ đồ răng, hàm dạng cung
- Kéo `main` mới (`001ef6c`, PR #98–#114 do phiên khác làm: Đợt 1–4 của kế hoạch 15 ngày đã có trên `main`). Nhật ký này chưa có mục cho các PR đó.
- Yêu cầu người dùng: nghiệp vụ điều trị gộp chung với sơ đồ răng; bấm răng nào thì thấy lịch sử điều trị răng đó; hàm răng vẽ như ở landing page.
- Làm (chỉ frontend): hình học cung răng tách ra `frontend/src/lib/toothArch.ts` (landing và hồ sơ khám dùng chung; thêm cung răng sữa bên trong cho trẻ em). `DentalChart.tsx` vẽ SVG dạng cung, tô màu theo tình trạng, chấm đánh dấu răng có điều trị trong phiên. `ToothPanel.tsx` mới cạnh sơ đồ: tình trạng + ghi chú (sửa tại chỗ, vẫn tự lưu/hoàn tác), điều trị trong phiên, các lần điều trị trước (dùng `useToothHistory`), nút "Thêm điều trị cho răng này", liên kết mở hồ sơ răng đầy đủ (drawer cũ). Tab "Sơ đồ răng" bỏ; tab `treatments` đổi tên "Điều trị & sơ đồ răng", chứa sơ đồ + danh sách điều trị. Phiên đã đóng vẫn bấm răng xem lịch sử (chỉ đọc). Bỏ ô tìm răng, hai modal răng cũ; dãy lọc tình trạng kiêm chú giải và số đếm.
- Kiểm: typecheck, eslint, locales, build; chạy thật trên dữ liệu demo (chọn răng 36 thấy lần điều trị trước, đổi tình trạng tự lưu, form thêm điều trị điền sẵn số răng, phiên đã đóng chỉ đọc, trẻ em 52 răng, 390px không tràn ngang, landing vẫn 32 răng). `scripts/check-clinical-ui.mjs` không chạy được ở máy này (thiếu trình duyệt của Playwright bản repo), để CI kiểm.
- E2E `ui-demo-regressions.spec.ts`: đổi tên tab theo chữ mới.

## 15/11/2026 — Tối ưu: lịch sử theo răng một lần gọi, tải tiếng Anh khi cần
- **Lịch sử một răng:** trước đây `useToothHistory` tải danh sách phiên khám rồi gọi chi tiết từng phiên (tối đa 50 request mỗi bệnh nhân). Thêm `GET /patients/:id/teeth/:fdi/history` (`PatientsProxyController.toothHistory`, quyền `encounter.read.any|own`, cùng phạm vi bác sĩ như lịch sử phiên khám, ghi audit `proxy.medical_records.read` kind `tooth-history`): một truy vấn, chỉ lấy điều trị có số răng đó (`array_contains`) và mục sơ đồ của răng đó, bỏ phiên đã hủy, tối đa 100 phiên. Hook frontend gọi một lần; thêm/sửa/xóa điều trị làm mới khóa `['patients', id, 'tooth-history']`. 3 test mới.
- **Gói chữ giao diện:** chữ tiếng Anh tách sang `frontend/src/locales/en/*.ts` (+ `en/index.ts`), chỉ tải khi chọn English (`loadLocale` trong `locales/index.ts`, `localeStore.setLocale` chờ tải xong mới đổi). File JS chính 540 KB → 384 KB (gzip 156 → 109 KB). `scripts/check-ui-locales.mjs` ghép file `en/` vào khi kiểm. Lưu ý: `import('./en')` bị Vite hiểu là `en.json`, phải viết `./en/index`.
- **Kiểm:** backend tsc, eslint, 1781 test; frontend typecheck, eslint, locales, build. Chạy thật: bấm răng chỉ còn 1 request lịch sử; drawer hồ sơ răng vẫn đúng; đổi VI↔EN bằng menu và mở lại trang với EN đã lưu đều đúng. E2E chạy ở máy này không được (global setup cần DB E2E riêng), để CI kiểm.

## 15/11/2026 — PR #115 đã merge; sơ đồ răng mẫu cho demo, bớt hỏi server khi tab ẩn, cập nhật kịch bản demo
- PR #115 (gộp điều trị + sơ đồ răng, API lịch sử một răng, tải tiếng Anh khi cần) merge `a3eb516`; người dùng đã deploy. Lỗi E2E giữa chừng: chọn English rồi tải lại ngay thì mất lựa chọn, sửa bằng lưu ngôn ngữ ngay khi bấm.
- **Sơ đồ răng mẫu:** dữ liệu demo trước đây không có sơ đồ răng (mọi răng "bình thường"). `backend/prisma/seed-demo-charts.ts`: với mỗi bệnh nhân demo (`notes = 'Dữ liệu mẫu (demo)'`), đi qua các lần khám đã đóng theo thứ tự, đánh dấu răng đã làm theo loại dịch vụ (trám/tủy → đã hàn, bọc sứ → bọc mão, implant, nhổ → đã nhổ) và ghi sơ đồ cho từng lần khám. Chỉ ghi lần khám chưa có sơ đồ, giữ sơ đồ do bác sĩ ghi; chạy lại an toàn. `seed-demo-clinic.ts` gọi ở cuối; VPS đã có dữ liệu thì chạy `bash scripts/demo-charts-vps.sh`. 2 test mới. Thử trên DB demo mới: 2256 sơ đồ / 351 bệnh nhân, chạy lại ghi 0; giao diện hiện màu và lịch sử theo răng.
- `usePendingBookingCount`: bỏ `refetchIntervalInBackground` (tab ẩn không hỏi server mỗi phút; khi mở lại tab tự làm mới).
- `DEMO_SCRIPT.md`: mục 3.3 theo màn hình mới; số liệu: khoảng 340 endpoint, 133 mã quyền, khoảng 1.780 test backend, khoảng 100 test PostgreSQL, 121 E2E; thêm dòng chuẩn bị sơ đồ răng mẫu.

## 15/11/2026 — Bệnh nhân tra cứu lịch sử khám (mục tiêu 5 của phiếu giao đề tài)
- Người dùng gửi phiếu giao đề tài: mục tiêu có "tra cứu lịch sử khám dễ dàng" và "X-quang". Quyết định: bỏ X-quang (ghi vào hướng phát triển), làm tra cứu lịch sử cho bệnh nhân.
- Thiết kế bảo mật: không có tài khoản bệnh nhân; xem bằng **đường dẫn có token** (hiệu lực 7 ngày, CSDL chỉ lưu SHA-256). Nhân viên cấp ở hồ sơ bệnh nhân (nút "Gửi link tra cứu lịch sử", gửi email + SMS/Zalo nếu bật, hiện link để sao chép). Bệnh nhân tự xin qua `/tra-cuu-lich-su` bằng SĐT: link gửi tới email/SĐT trong hồ sơ, màn hình luôn trả một câu giống nhau (không dò được ai là bệnh nhân); SĐT phải là của chính bệnh nhân (giám hộ chỉ với trẻ không có SĐT).
- Backend: module `patient-history` (service, 2 controller), migration `066_patient_history_links`, template tin nhắn `HISTORY_LINK` (`ZALO_ZNS_TEMPLATE_HISTORY_LINK`), audit `PATIENT_HISTORY_LINK_ISSUED`, `PATIENT_HISTORY_VIEWED`; 5 test. Frontend: `features/patient-history/` (trang xin link, trang xem lịch sử: lịch hẹn sắp tới, các lần khám + điều trị/răng + đơn thuốc, kế hoạch điều trị có tiến độ, hóa đơn), nút ở `PatientDetailPage`, link ở landing; locale `uiPatientHistory`; E2E `patient-history.spec.ts`. Tài liệu API `docs/05_API/patients.md` §7 (kèm API lịch sử một răng còn thiếu).
- Kiểm: backend 1788 test, tsc; frontend typecheck, eslint, locales; chạy thật trên DB demo: cấp link (gửi email mock), mở trên điện thoại 390px (19 lần khám, không tràn ngang), token sai báo hết hạn, xin bằng SĐT lạ trả câu chung.

## 15/11/2026 — Báo cáo đồ án: viết xong Chương 4, 5, Kết luận, Phụ lục; sửa E2E đỏ của PR #117
- **Báo cáo** (`docs/10_Thesis/bao-cao/`): Chương 4 (môi trường, cấu trúc mã, đoạn mã phân quyền/khóa tư vấn/lịch sử răng, 29 hình giao diện chụp từ hệ thống chạy thật, CI 10 bước, triển khai), Chương 5 (3 tầng kiểm thử, 4 bảng ca kiểm thử lấy từ test thật, đo API trên máy chạy thử: trung vị 12–46 ms, bảng đối chiếu mục tiêu phiếu giao đề tài, hạn chế), Kết luận, Phụ lục A–C. `build.py`: khối mã căn trái, bỏ phông theme ở tiêu đề, độ rộng cột bảng theo nội dung. Bản dựng: 111 trang, thân (Mở đầu → Kết luận) khoảng 93 trang. Dựng: `python3.13 docs/10_Thesis/bao-cao/build.py`.
- **PR #117 E2E đỏ (26 test sau `patient-history`):** nguyên nhân thật: test `patient-history` mở trình duyệt khách bằng `browser.newContext()` không tham số, kế thừa phiên admin lưu sẵn; trang công khai gọi `/auth/refresh` bằng cookie cũ → backend phát hiện dùng lại token, thu hồi mọi phiên admin, các test sau mất phiên. Sửa: `newContext({ storageState: { cookies: [], origins: [] } })` như các test công khai khác. (Lần sửa đầu bằng `JWT_ACCESS_TTL` là đoán sai, đã bỏ.)
- Còn: chờ CI PR #117 rồi merge + deploy; lỗi giao diện nhỏ: phiên khám vừa đóng hiện tab trống (tab "summary" biến mất) — nên rơi về tab "notes".
- **Tinh chỉnh báo cáo:** thêm "Những điểm nổi bật của đề tài" (Mở đầu §6), mục 5.4 "Những điểm nổi bật của hệ thống" kèm Bảng 5.8 minh chứng, câu nổi bật ở Tóm tắt và Kết luận. Số trang toàn bộ bằng số Ả Rập liên tục (bìa, phụ bìa không hiện số). `build.py` tự điền Mục lục, Danh mục hình, Danh mục bảng có số trang: dựng → LibreOffice ra PDF → tìm trang từng tiêu đề/chú thích → dựng lại đến khi số trang không đổi (vẫn là trường TOC, Word cập nhật được). Dòng bảng không tách trang, chú thích hình dính với dòng nguồn. 124 trang.
- **Bìa theo mẫu trường (QT.ĐT.19.M07):** bìa là bảng có khung, dải gáy dọc (họ tên, ngành), logo, khối thông tin in đậm hai cột; phụ bìa trong khung viền đậm. Bố cục lấy từ file mẫu người dùng gửi, chỉ giữ cấu trúc và thay bằng thông tin của Tuấn Anh, lưu ở `bao-cao/bia.xml` (không commit file mẫu của sinh viên khác); `build.py` chèn vào chỗ `[[BIA]]`, không áp định dạng bảng chung lên bìa. Trang nhận xét (GVHD, GVPB, điểm) và lời cam đoan (thông tin SV, chữ ký GVHD và SV) làm theo mẫu. GVHD, Hệ để trống. 123 trang.

## 15/11/2026 — PR #117 merge `fa601c0`, người dùng đã deploy; rà soát báo cáo
- Rà soát tự động: mọi tham chiếu Hình/Bảng đều trỏ đúng; thêm câu dẫn cho 14 hình/bảng chưa được nhắc trong lời văn (Bảng 2.3–2.7, Hình 2.5, Bảng 3.2–3.4, 3.7, Hình 3.12, Bảng 4.1, 5.9, A.1, C.1); thêm dòng "Nguồn" còn thiếu cho Bảng 2.3–2.7. Số liệu đối chiếu lại với mã: 339 API, 70 bảng, 43 enum, 52 migration, 133 mã quyền, 122 E2E — khớp.
- Mã ca kiểm thử Chương 5 đổi thành KT-LH-01… để không trùng mã yêu cầu LH-01… ở Chương 2. Sửa "kế toán" → "lễ tân" (Chương 1). 125 trang.
- Số trang theo lựa chọn của người dùng: Mở đầu = trang 1 (Ả Rập), phần đầu không in số, Tài liệu tham khảo/Phụ lục đánh tiếp; mục lục lấy số in trên đầu trang. Thân 101 trang.
- So sánh thêm SimlyDent (tên đúng trên simlydent.vn) vào Bảng 1.1 và §1.2, chỉ theo thông tin nhà cung cấp công bố (ô "không thấy công bố" ghi rõ nghĩa). Trích dẫn [simlydent], [simlydent_gia].
- Ảnh trợ lý AI thật: mạng môi trường chặn gensmile.online; đã tạo môi trường riêng `dental-clinic-nestjs-react` (cho phép gensmile.online, simplydent.vn) và giao phiên phụ chụp ảnh, đẩy lên nhánh `claude/anh-tro-ly-ai`.
- Danh mục từ viết tắt lập lại theo các từ thật sự dùng trong báo cáo (thêm ACID, CSS, DICOM, HTML, HTTPS, ISO/IEC, JSON, JSONB, KT, OA, OWASP, QR, SHA, SMTP, SVG, UTC; bỏ CRUD, CSDL, ERD, VPS, CI/CD không dùng). Danh mục thuật ngữ thêm check-in, khóa tư vấn, sự kiện miền, xóa mềm, gọi công cụ, chế độ dự phòng, mã làm mới, container; sửa định nghĩa nhật ký kiểm toán cho đúng (ứng dụng chỉ ghi thêm). 128 trang.
- Phiên phụ chụp ảnh AI (session_01Lhvjxz4BQ2UiahXRXiDdgV) dừng ở bước cần duyệt, chưa đẩy ảnh; người dùng cần mở phiên đó để duyệt.
- Thông tin người dùng gửi: GVHD TS. Mai Thúy Nga; Khoa Hệ thống thông tin, Trường Đại học Công nghệ Thông tin, Đại học Phenikaa; khảo sát tại Nha khoa An Việt, người hỗ trợ bác sĩ Nguyễn Văn Việt. Đã điền vào bìa, phụ bìa (bia.xml), trang nhận xét, lời cam đoan, lời cảm ơn, §2.1.1 và nguồn Bảng 2.1, phương pháp khảo sát ở Mở đầu. Ô "Hệ" vẫn để trống.
- Bìa: điền "Hệ: Đại học chính quy". Use case lễ tân, bác sĩ, quản trị (Hình 2.3–2.5) vẽ lại kiểu tác nhân ở giữa, use case hai bên (bỏ khung hệ thống): tỷ lệ cao/rộng từ ~3 xuống ~1, hết trang gần trống ở Chương 2. 126 trang.
- Thêm 7 biểu đồ chi tiết chức năng ở Chương 3 (đối chiếu từng quy tắc với mã): tuần tự lễ tân đặt lịch khi hai yêu cầu cùng lúc (khóa tư vấn, 409 CALENDAR_BUSY), hoạt động tiếp nhận và hàng chờ (khung check-in −15/+30 phút, thứ tự hàng chờ theo queue.ts), tuần tự xem lịch sử và thêm điều trị cho một răng, hoạt động đóng phiên khám (trừ kho có điều kiện, sự kiện encounter.closed), hoạt động xử lý webhook ngân hàng (các lý do NEEDS_REVIEW), hoạt động nhắc lịch (giờ yên lặng 21–7h, Zalo rồi SMS, thử lại 3 lần), trạng thái kỳ lương (payroll-state.ts). Đánh số lại Hình 3.x theo thứ tự xuất hiện (22 hình), tham chiếu khớp. 133 trang.
- Mỗi module có biểu đồ riêng: thêm 12 hình cho 11 module còn thiếu (users-roles: tuần tự chống leo thang quyền; patients: tạo và gộp hồ sơ; consents; inventory; catalog; staff: trạng thái đăng ký ca; expense: trạng thái phiếu chi phí; reports: tuần tự tải bảng điều khiển; recalls: trạng thái nhắc tái khám; notifications; audit: tuần tự ghi trong cùng giao dịch; media: tải ảnh có kiểm tra chữ ký tệp). Quy tắc lấy từ mã (shift-registration.service, expense.service, recalls.service/recall-schedule, inbox.service + cron, inventory.reorder, catalog.serviceImpact, permission-escalation, media.service). Mục mới 3.3.12 và 3.4.4; Bảng 3.7 "Biểu đồ mô tả hành vi của từng module". Chương 3: 34 hình (29 biểu đồ hành vi), 8 bảng; Bảng OWASP thành 3.8 (sửa tham chiếu ở Chương 5). 145 trang.
- Chương 4 thêm 10 ảnh giao diện cho các module chưa có ảnh (yêu cầu đặt lịch, nhắc tái khám, nhân sự, duyệt ca, chi tiết kỳ lương, dịch vụ, chi phí, người dùng, sổ đồng thuận, thông báo); dữ liệu mẫu tạo trên DB chartdemo của máy chạy thử (kỳ lương 10/2026 compute+lock, 6 đăng ký ca, 4 yêu cầu đặt lịch qua API công khai, 8 bản ghi đồng ý + 1 rút lại, 9 nhắc tái khám chèn SQL). Đánh số lại Hình 4.x (39 hình) và tham chiếu ở Chương 5 (xử lý cả dạng liệt kê "Hình 4.2, 4.21–4.22"). 153 trang.
- Chương 5 thêm mục 5.2.3 và Bảng 5.6: chạy `npx jest --coverage` — 1.788 ca/89 tệp đạt (42 s), bao phủ service+controller 76,6% dòng, 70,0% nhánh (domain/ không tính); số ca và bao phủ theo module; nêu thẳng module bao phủ thấp (expense 36,7%, common 29,3%). Lưu ý: chạy có --coverage thì jest báo lỗi ngưỡng riêng của `src/common/` (95%), không ảnh hưởng `npm test` của CI. Đánh lại số Bảng 5.x. Tóm tắt cập nhật số ca. 154 trang.
- Chương 4 thêm 4.3.6 (hàm thuần xếp hàng chờ dueAt/compareQueue) và 4.3.7 (ẩn danh bệnh nhân P1, P2… với AI: refFor/idOf trong assistant-tools.ts). Phụ lục D: ma trận truy vết 34 yêu cầu chức năng → thiết kế (Chương 3) → giao diện (Chương 4) → kiểm thử (KT-…, E2E, đơn vị); Chương 5 nhắc tới Phụ lục D. 159 trang.
- Lấp ô trống cột Giao diện của ma trận truy vết: chụp thêm trang lịch hẹn của bệnh nhân từ đường dẫn riêng (điện thoại), danh sách chờ, hộp thoại gộp hồ sơ, hộp thoại hoàn tiền (dữ liệu mẫu: 4 mục danh sách chờ qua API, 1 appointment_link chèn SQL với token tự sinh). Chương 4 còn 43 hình; Phụ lục D chỉ còn 2 ô "–" (BN-04, LH-02 ở cột Thiết kế). Thấy lỗi nhỏ giao diện: breadcrumb trang danh sách chờ hiện "Waitlist" (chưa dịch). 162 trang.
- Soát lời văn Chương 4–5: bỏ đoạn trùng ở 4.5.7, mô tả hàng chờ ở 4.5.3 theo đúng quy tắc 4.3.6, cách nói về bản tóm tắt AI khi đóng phiên; Chương 5 nhắc Hình 4.3, thêm hạn chế "độ bao phủ chưa đều". Mở đầu §8 Bố cục viết lại cho khớp (29 biểu đồ, đoạn mã, độ bao phủ, Phụ lục A–D).
- Chương 1 thêm 1.3.3 "Mô hình hóa hệ thống bằng UML" (khi nào dùng từng loại biểu đồ; PlantUML, ERD sinh tự động) và 1.4.3 "Giao dịch và xử lý đồng thời" với Bảng 1.2 (khóa tư vấn, cập nhật có điều kiện, kiểm soát lạc quan, khóa chống ghi lặp, ràng buộc duy nhất → nơi áp dụng). Trích dẫn thêm Kleppmann, Pressman (trước đó khai báo mà chưa dùng). Kết luận chương 1 cập nhật.

## 2026-11-15 — Báo cáo: đối chiếu quy định trình bày mẫu Phenikaa
- Chú thích hình/bảng chuyển sang in nghiêng cỡ 13 (theo QT.ĐT.19.M07).
- Kiểm tra: không có nhóm tiểu mục nào chỉ có một tiểu mục; không có số thập phân dạng dấu chấm sai quy ước.
- Build lại: 164 trang, Mở đầu = trang 1, Kết luận = 132.
- Tài liệu tham khảo căn trái (hết giãn chữ ở dòng có URL); rút gọn kết luận Chương 1 để không còn trang chỉ có 2 dòng. Báo cáo 163 trang, Kết luận = 131.
- Thống nhất thuật ngữ "Sổ đồng ý"; giải thích tiền tố mã yêu cầu (BN, LH, KB, TT, NS, KH, BC, AI, QT) ở Mục 2.3 và danh mục viết tắt; kiểm tra mọi hình/bảng đều được nhắc trong văn bản.
- Kết luận: nêu số kiểm thử cụ thể, ma trận truy vết; hạn chế đồng bộ với Mục 5.6.
- Tóm tắt thêm Từ khóa; tách 3 câu dài trên 70 từ ở Mở đầu và Chương 1.
- Sơ đồ: thêm maxMessageSize/wrapWidth trong _kieu.iuml và xếp dọc 2 ERD rộng (sinh-erd.py) để chữ in ≥ ~6,5 pt (trước có hình chỉ 4–5 pt); vẽ lại toàn bộ sơ đồ, báo cáo 175 trang (Chương 3: 35–89).

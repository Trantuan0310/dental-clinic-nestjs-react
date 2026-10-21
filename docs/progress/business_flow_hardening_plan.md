# Kế hoạch sửa luồng nghiệp vụ

Ngày: 21/10/2026 (UTC+7). Điểm xuất phát: `1d0055e`.
Nhánh thực hiện: `fix/business-flow-hardening`; không merge/push trực tiếp `main`.

## Cách tổ chức

Model chính điều phối, đọc diff, phản biện thiết kế, kiểm tra bằng chứng test và yêu cầu nhân viên sửa lại. Năm nhân viên model thấp hơn (`gpt-6-sol`) chịu trách nhiệm code theo phạm vi tách biệt; một nhân viên chuẩn bị môi trường kiểm thử và tổng hợp kiểm thử tích hợp. Chung một checkout, không tự tạo worktree, không đổi nhánh và không commit khi người khác đang sửa. Model chính chỉ commit các file đã được review theo từng gói.

Usage 5 giờ: công cụ hiện tại không cung cấp quota tài khoản. Không suy ra quota từ thời gian hay token context. Khi hệ thống/người dùng báo còn <=10%, model chính phát lệnh STOP cho tất cả nhân viên; nhân viên dừng tạo thay đổi mới, báo file đang sửa, test đã chạy, lỗi còn lại và bước tiếp theo. Ghi checkpoint vào session-log và báo cáo riêng, commit cả phần dở có nhãn WIP rõ ràng, push nhánh này. Không ghi rằng quota đã được đo nếu không có dữ liệu. Checkpoint theo từng gói để giảm rủi ro mất tiến độ.

## Quy chuẩn bắt buộc

1. Đọc PROJECT_RULES.md và spec/ADR tương ứng trước khi sửa. Xác minh lại phát hiện; phát hiện không đúng phải báo bằng chứng, không cố sửa.
2. Sửa nhỏ, giữ API tương thích nếu có thể; không thêm dependency, không đổi lockfile ngoài nhu cầu đã chứng minh. Không tự mở rộng SMS, điều trị nhiều buổi, trả góp có kỳ hạn, hoặc đổi policy hoàn tiền.
3. Quy tắc dữ liệu đặt ở backend; frontend phản ánh cùng quy tắc. Không tin validation UI, không dùng any/ts-ignore để che lỗi, không bỏ assertion/skip test để tạo kết quả xanh.
4. Với check-then-write: transaction và khóa theo tài nguyên hoặc guarded update; thứ tự khóa nhất quán với đường hiện có. Không gọi email/AI bên trong transaction giữ khóa.
5. Tiền và số lượng: dùng Decimal/quy tắc làm tròn hiện có, kiểm tra biên và giá trị âm/0. Ngày nghiệp vụ theo múi giờ phòng khám.
6. Thay đổi schema: migration additive, không reset dữ liệu, không sửa migration cũ; phân công riêng để tránh xung đột. Không sửa/xóa dữ liệu cũ tự động chỉ để migration qua.
7. Test hồi quy phải có tình huống hỏng trước sửa, happy path, quyền/phạm vi, biên và concurrency khi liên quan. PostgreSQL thật trong DB cô lập cho transaction/lock; mock không đủ chứng minh race đã hết.
8. Không đụng production, không in token/.env, không commit secret/generated output, không tắt TLS/checksum. Test phải giữ exit status; ghi rõ pass/fail/skipped/unrun.
9. Tài liệu tiếng Việt; tên code tiếng Anh. Mỗi thay đổi nghiệp vụ cập nhật spec/API hoặc ghi rationale, self-review trước bàn giao.
10. Không chạy formatter/lint --fix toàn repo khi người khác đang sửa. Chỉ formatter file sở hữu; kiểm tra ESLint toàn repo ở chế độ không sửa khi tích hợp.

## Gói A — Tiếp nhận, hàng chờ, điều phối

Sở hữu: backend/src/appointments (trừ booking/availability nếu cần phối hợp), frontend/src/features/medical-records/MyQueuePage.tsx.

- A1: Đưa kiểm tra một lượt CHECKED_IN/IN_PROGRESS của bệnh nhân vào check-in cùng transaction và patient lock; đối chiếu walk-in/undo-left để các đường cùng serialize. Giữ idempotency cho cùng lượt.
- A2: Check-in muộn/undo-left xác minh bác sĩ còn được nhận khám tại thời điểm quay lại; phân biệt đến sớm đang chờ giờ hẹn với nhận ngoài ca. Không âm thầm bỏ quy tắc ngoài giờ. Thông báo hướng dẫn chuyển bác sĩ.
- A3: Hoàn tác thay bác sĩ cả ngày chỉ phục hồi lịch/closure thuộc đúng thao tác; ưu tiên marker audit/log đã có, nếu cần batch ID mới phải phối hợp schema. Không suy diễn thao tác từ cặp bác sĩ đơn thuần; dữ liệu cũ thiếu bằng chứng phải từ chối an toàn.
- A4: Hàng chờ của tôi không mất phiên hôm nay khi >50 phiên cũ: query hôm nay riêng hoặc phân trang đầy đủ; hiển thị lỗi tải.
- Test: hai lượt cùng bệnh nhân, check-in idempotent, check-in/walk-in cạnh tranh, đến sớm/muộn, bác sĩ nghỉ/đình chỉ, undo-left sau thay đổi, manual A→B không bị undo batch, >50 phiên cũ.

## Gói B — Online booking và bệnh nhân

Sở hữu: backend/src/booking, backend/src/patients, frontend/src/features/booking, frontend/src/features/patients. UI merge có thể cần routes/nav/locales: báo trước khi sửa file chung.

- B1: propose và accept dùng transaction + calendar lock và kiểm tra hold có đệm/thời lượng riêng; loại trừ hold của chính request. Xác nhận lịch thật giữ kiểm tra xung đột cuối.
- B2: hasVisitThatDay/arrived dùng định danh chính xác; chung số điện thoại không đủ. Match tên/DOB theo helper đã có; nếu staff cố chọn người khác phải bị chặn hoặc dùng luồng xác minh minh bạch, không tự gắn.
- B3: override DOB kiểm tra contact rules với DOB mới, audit và invalidation phù hợp; nếu cần contact bắt buộc phải hướng dẫn bổ sung trước, không tạo hồ sơ trẻ thiếu dữ liệu.
- B4: Hoàn tất UI gộp hồ sơ theo API sẵn có: chọn nguồn/đích, xem trước, xác nhận lý do, quyền đúng, lỗi rõ; không mở quyền rộng hơn backend. Không tự merge fuzzy.
- Test: propose trên hold của người khác/tự mình, đề xuất cạnh tranh, expiry/accept, hai trẻ cùng số, DOB khác, override thành trẻ, gộp có lịch/hồ sơ/hóa đơn và phân quyền.

## Gói C — Điều trị, hóa đơn và kho

Sở hữu: backend/src/inventory, backend/src/medical-records (trừ UI queue), backend/src/billing, test liên quan. Schema/migrations do nhân viên C quản lý sau khi nhận thông tin từ A.

- C1: Stock in/out bắt buộc >0, có giới hạn precision/scale phù hợp DB; service kiểm tra cả khi gọi nội bộ. Kiểm tra tồn không âm khi xóa/điều chỉnh. DB constraint chỉ thêm khi đã có phương án dữ liệu cũ an toàn.
- C2: Khóa đổi unit khi đã có tồn/history/usage; chưa làm quy đổi đơn vị mới. Khi thêm usage lấy/đối chiếu đơn vị chuẩn của inventory.
- C3: Đồng bộ giới hạn thành tiền giữa treatment và invoice; kiểm tra tổng trước khi đóng phiên, gồm line/tổng. Không để commit trừ kho rồi mới phát hiện overflow không thể lập hóa đơn.
- C4: Xóa vật tư dùng guarded update/row lock để không giấu vật tư vừa nhập tồn.
- Test: âm/0/quá precision, đủ/thiếu tồn, hai writer, đổi unit đã dùng/chưa dùng, tổng đúng biên/quá biên, close rollback khi lỗi, stock-in/delete cạnh tranh. Giữ policy refund không mở lại nợ, completed immutable.

## Gói D — Lương, chế độ và chi phí

Sở hữu: backend/src/payroll, backend/src/expense, frontend/src/features/payroll và frontend/src/features/expenses (nếu có).

- D1: Kỳ bổ sung trả delta với kỳ đã thanh toán, có baseline rõ và không thanh toán trùng qua nhiều lần bổ sung. Đọc kỹ recompute/adjustments/refund clawback và sửa đồng bộ UI/spec, không chỉ trừ net ở một màn hình. Không tự sửa kỳ PAID cũ.
- D2: Tải compensation lịch sử theo ngày khám để tính commission; prorate base vẫn theo kỳ lương; rate thiếu phải có chẩn đoán thay vì âm thầm mất lương.
- D3: Dùng chung tính gross/tax/BHXH/net giữa compute và adjustment, BHXH base không âm; giữ khoản thu hồi riêng biệt với bảo hiểm.
- D4: UI đổi chế độ từ ngày X: kết thúc bản cũ X−1/tạo bản mới atomically theo API hỗ trợ; không xóa compensation lịch sử. Nếu API thiếu thêm endpoint/service/test tương ứng.
- D5: Expense delete/transition kiểm tra version/status/deletedAt ngay trong write, tăng version; concurrency trả conflict, không thành APPROVED đã xóa.
- Test: đã trả 20tr +500k chỉ bổ sung 500k; bổ sung lần hai không trả lại lần một; negative delta; invoice issued tháng sau/bác sĩ nghỉ; penalty >gross; change rate không overlap; delete vs approve.

## Gói E — Phân quyền, AI và báo cáo

Sở hữu: backend/src/ai, backend/src/reports và tests.

- E1: AI dùng rowScope patient thống nhất PatientsService; own/none phải được kiểm tra trước cache, không tự coi quyền update là clinic-wide. Giữ clinical/basic cache separation.
- E2: Invoice pending chỉ ISSUED/PARTIAL; DRAFT nếu cần hiển thị là chờ phát hành. Không đổi policy cache 1 giờ nếu ngoài scope.
- E3: byService dùng cùng tập phát hành/hoàn tiền và phân bổ làm tròn như tổng/byProcedure; refund khác kỳ phải xuất hiện đúng kỳ, đối chiếu tổng.
- Test: custom dentist-like role có patient.update ngoài phạm vi bị chặn cả cache hit/miss, role none, any hợp lệ, DRAFT/ISSUED/PARTIAL/VOID, refund trong kỳ/khác kỳ/nhiều dòng, tổng breakdown khớp tổng báo cáo.

## Thứ tự tích hợp và nghiệm thu

1. Chạy baseline hiện có; phục hồi Prisma engine qua mạng đã cho phép, giữ checksum. Chuẩn bị DB test riêng, không reset DB dev.
2. Các nhân viên chạy test module trước/sau, báo file và kết quả. Review P1 trước, rồi P2 và UI.
3. Model chính đọc diff, kiểm tra ví dụ số học, khóa/giao dịch/quyền và yêu cầu nhân viên sửa lại. Không coi tự báo pass là đủ.
4. Kiểm tra backend: Prisma generate, tsc --noEmit, ESLint không --fix, build, npm test; test:isolated trên PostgreSQL thật. Migrations nếu có: fresh + repeat trên DB riêng.
5. Kiểm tra frontend: typecheck, lint, build, test Node đã có, Playwright chọn đúng luồng thay đổi (UI merge/chế độ lương/hàng chờ); ghi rõ nếu browser/runtime chưa có.
6. Smoke backend + frontend proxy: health/ready, login, phân quyền và luồng đại diện trong DB test. Không công khai localhost preview.
7. Cập nhật session-log và báo cáo nghiệm thu: task/owner/status, file, test, review/rework, giới hạn. Commit Conventional Commits theo gói sau review và push nhánh riêng; không tự merge/deploy.

## Tiến độ ban đầu

- [x] Nhánh riêng đã tạo; checkout sạch ở điểm xuất phát.
- [x] Network Prisma hiện trả 200; PostgreSQL dev healthy.
- [ ] Baseline backend/frontend.
- [ ] A / B / C / D / E triển khai và test hồi quy.
- [ ] Review độc lập, sửa lại theo nhận xét.
- [ ] Kiểm thử tích hợp, báo cáo và push.

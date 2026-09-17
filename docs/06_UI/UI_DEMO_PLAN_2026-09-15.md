# Kế hoạch chỉnh sửa giao diện phục vụ bảo vệ đồ án

Ngày rà soát: 15/09/2026. Ưu tiên đã xác nhận: **demo bảo vệ đồ án**.

Trạng thái: **đã triển khai và kiểm chứng kế hoạch UI phục vụ demo**.

## Cập nhật triển khai ngày 15/09/2026

- P0: hoàn thành UI-01 đến UI-06.
- P1: hoàn thành UI-07 đến UI-12; UI-13 đã có đủ KPI, bộ lọc, nguồn dữ liệu và fallback nên được giữ nguyên sau khi kiểm chứng.
- P2: UI-14 được chốt phạm vi bệnh nhân người lớn cho buổi demo; UI-15 đã bổ sung quản lý focus cho mobile drawer và liên kết nhãn/lỗi cho form control dùng chung.
- Cơ sở dữ liệu: đã áp dụng migration 014 cho số lượng/đơn vị thuốc và migration 015 để đồng bộ sequence mã hóa đơn.
- Kiểm chứng: backend 369/369 unit test; build backend/frontend, lint frontend và typecheck E2E đều đạt; 10/10 kiểm thử shell/accessibility và 3/3 kiểm thử tạo bệnh nhân đạt.
- Hành trình demo thật đạt 11/11 bước từ tạo bệnh nhân đến hóa đơn đã thanh toán; đơn thuốc giữ đúng số lượng/đơn vị/số ngày sau reload và vẫn in được sau khi đóng bệnh án.

## 1. Kết luận

Giữ phong cách nền trắng/xám, màu chủ đạo teal và bộ component hiện có. Giao diện đã có cấu trúc đủ tốt để hoàn thiện; ưu tiên làm luồng demo liền mạch, thông tin dễ đọc khi trình chiếu và hành vi đúng với dữ liệu được lưu.

Thứ tự đề xuất: **sửa chỗ làm gián đoạn demo → làm rõ điều hướng và trạng thái → tinh chỉnh hình thức → diễn tập với dữ liệu thật trên môi trường thử nghiệm**.

## 2. Phạm vi và bằng chứng

- Đọc code layout, header/sidebar, routes, đăng nhập/phiên, bệnh nhân, lịch hẹn, bệnh án, kê đơn, sơ đồ răng, hóa đơn, dashboard, cài đặt và các thành phần dùng chung.
- Mở bản build bằng trình duyệt headless tại 1440×900, 1366×768; kiểm tra bổ sung trang bệnh nhân ở 390×900.
- Render 7 màn hình: đăng nhập, danh sách bệnh nhân, tạo bệnh nhân, lịch hẹn, Hôm nay, hóa đơn, cài đặt. Xem thêm cài đặt ở dark mode.
- Phiên và phản hồi API trong lần xem này được giả lập, chủ yếu là danh sách rỗng; không dùng tài khoản thật, không ghi database. Kết quả này đánh giá layout và một số hành vi frontend, không xác nhận nghiệp vụ chạy đúng với backend.
- Hai probe có mục tiêu: tìm bệnh nhân từ header; trả lỗi 403 cho API lịch hẹn ở màn Hôm nay.
- Các màn chi tiết có dữ liệu, biểu đồ nhiều dữ liệu, bản in, đầy đủ 3 vai trò và luồng ghi dữ liệu cần nghiệm thu tiếp khi triển khai.

Báo cáo `ui_review_and_backend_alignment.md` từ tháng 7 không dùng nguyên trạng: bản hiện tại đã có mobile drawer, dark mode, command palette, focus trap cho Modal và nhiều trạng thái lỗi. Không đưa việc xây lại các chức năng này vào phạm vi.

## 3. Danh sách việc ưu tiên

P0 = có thể làm demo sai hoặc bị ngắt. P1 = tác động rõ đến khả năng trình bày và thao tác. P2 = hoàn thiện sau khi luồng chính ổn định. Đây là mức ưu tiên demo, không thay thế severity của audit backend.

| Mã | Ưu tiên | Hiện trạng và bằng chứng | Kế hoạch sửa | Điều kiện nghiệm thu |
| --- | --- | --- | --- | --- |
| UI-01 | P0 | Header chuyển tới `/patients?q=DEMO123`, nhưng probe chỉ ghi nhận API `/patients?pageSize=20&status=active`, không có q. PatientListPage không đọc searchParams. | Đồng bộ query trên URL, ô tìm kiếm của trang và request API; reset phân trang khi đổi từ khóa. | Tìm từ header, tìm trong trang, tải lại và Back/Forward đều giữ đúng từ khóa/kết quả. |
| UI-02 | P0 | TodayPage chỉ đọc data và mặc định `[]`; probe trả API 403 vẫn thấy 0 lịch và “Không có lịch hẹn nào hôm nay”. | Tách rõ đang tải, lỗi, rỗng và có dữ liệu; có thử lại và thông báo quyền phù hợp. | API lỗi không hiển thị như không có bệnh nhân; tải chậm không nháy các số 0 như dữ liệu đã tải xong. |
| UI-03 | P0 | `useStartEncounter` thực hiện hai POST nối tiếp. Request tạo bệnh án lỗi có thể để lịch hẹn ở IN_PROGRESS mà chưa mở được bệnh án; liên quan MR-08. | Phối hợp backend để bắt đầu khám thành một thao tác nhất quán; UI chỉ điều hướng khi có encounterId, cho phục hồi khi lỗi. | Mô phỏng lỗi giữa luồng, thử lại vẫn mở đúng một bệnh án; không cần sửa DB bằng tay. |
| UI-04 | P0 | PrescriptionsTab dùng duration trong cột số lượng; nút Printer không có handler và chỉ hiện khi chưa completed. DTO chưa nhận quantity của đơn thuốc; MR-06 còn mở. | Tách số lượng, đơn vị, thời gian dùng; thống nhất form/API/schema; hoàn thiện xem trước/in đơn sau khi lưu và sau đóng bệnh án. | Lưu rồi tải lại không mất dữ liệu; bản in khớp đơn đã lưu, không in nút/tab/sidebar. |
| UI-05 | P0 | EncounterDetailPage và ClinicalNotesTab dùng `!isCompleted` để cho sửa; encounter cancelled vẫn đi vào nhánh có thao tác, trong khi backend đã chặn ghi ngoài IN_PROGRESS. | Định nghĩa rõ khả năng sửa theo trạng thái và quyền; chỉ bật ghi ở in_progress. Tách quyền xem, in và bổ sung ghi chú sau đóng. | Completed/cancelled không còn nút ghi không hợp lệ; addendum trong thời hạn vẫn dùng được. |
| UI-06 | P0 | Interceptor refresh thất bại chỉ xóa token, chưa clear trạng thái đăng nhập Zustand; AUTH-03. | Thống nhất luồng hết phiên, thông báo rõ và đưa về đăng nhập; giữ đường quay lại phù hợp. | Hết phiên giữa demo không mắc lại ở màn toàn lỗi 401; không hiện dữ liệu người dùng trước khi đổi vai trò. |
| UI-07 | P1 | Header có hai vùng tìm kiếm, thương hiệu, version, phòng khám, ngày, ngôn ngữ, theme, chuông và tài khoản. Ở 1366px ô tìm bệnh nhân bị co rất hẹp. Có nhãn `clinic_admin`, phím tắt ⌘K trên Windows. | Gom tìm kiếm và giảm thông tin phụ; dịch nhãn vai trò, hiển thị phím tắt theo nền tảng; đưa version ra khỏi vùng thao tác chính. | 1366×768 vẫn đọc/nhập được từ khóa, các nút không bị chèn ép; tên vai trò dễ hiểu. |
| UI-08 | P1 | Header dùng “Nha Khoa An Việt”, Settings dùng “Nha khoa GENSMILE”, logo dùng GENSMILE. | Chốt GENSMILE là tên sản phẩm; chọn một tên phòng khám demo nhất quán ở header, trang cấu hình và mẫu in. | Không có tên phòng khám mâu thuẫn giữa các màn demo và bản in. |
| UI-09 | P1 | Sidebar nhiều nhóm; “Bệnh án” chuyển về danh sách bệnh nhân, gây cảm giác trùng “Bệnh nhân”; quản trị thấy cả mục cá nhân. | Rà lại tên/điểm đến theo từng vai trò; ưu tiên các mục phục vụ công việc, giữ đường vào module phụ rõ ràng. | Người demo luôn biết đang ở bước nào và đi đâu tiếp; không phải giải thích hai menu dẫn cùng một màn. |
| UI-10 | P1 | Form tạo bệnh nhân dài hơn viewport 900px, nút Lưu ở cuối; ngày sinh bắt buộc nhưng điều kiện liên hệ chưa được diễn đạt rõ ngay trên form. | Nhóm thông tin chính/phụ, chú thích điều kiện bắt buộc và lỗi cạnh field; cân nhắc thanh hành động luôn dễ tiếp cận, cảnh báo rời form có dữ liệu chưa lưu. | Bàn phím và chuột hoàn thành form thuận tiện; lỗi chỉ đúng trường; cảnh báo không làm mất dữ liệu đang nhập. |
| UI-11 | P1 | Hóa đơn lấy pageSize=100, các tổng tiền tính từ danh sách đang tải; có nguy cơ nhầm tổng trang với tổng toàn bộ. Backend BILL-03 còn mở. | Phân trang đầy đủ; ghi rõ phạm vi tổng theo bộ lọc hoặc lấy aggregate từ backend. | Với hơn 100 hóa đơn vẫn tìm/xem được phần còn lại; số tiền và nhãn phạm vi khớp. |
| UI-12 | P1 | Settings là trang preview có fieldset disabled; dark mode có tiêu đề và nhãn quá tối, đã quan sát. | Giữ nhãn chưa hoàn thiện rõ ràng, không đưa thao tác Lưu cài đặt vào kịch bản chính. Ưu tiên light mode trình chiếu; sửa màu chữ của các trang vẫn cho chuyển dark. | Không có thao tác trông như chạy được nhưng không có tác dụng; các nội dung chính đọc rõ khi đổi theme. |
| UI-13 | P1 | Dashboard có nhiều hàng biểu đồ; mới rà code, chưa kiểm tra biểu đồ bằng dữ liệu thật trong lượt này. | Đưa 3–4 chỉ số phục vụ câu chuyện demo lên đầu, thống nhất bộ lọc ngày/phạm vi và link về chi tiết; giải thích nguồn và thời điểm dữ liệu. | Số đã thu/còn nợ đối chiếu được với hóa đơn demo; AI hiển thị rõ trạng thái tạo tóm tắt hoặc fallback. |
| UI-14 | P2* | DentalChartPanel vẫn dùng ADULT_TEETH và truyền ADULT khi lưu. | Nếu demo trẻ em: hoàn thiện loại bộ răng và kiểm thử end-to-end trước. Nếu demo người lớn: ghi rõ phạm vi, đưa bộ răng trẻ em vào đợt sau. | Không trình bày khả năng xử lý răng trẻ em khi chưa có; payload và UI đúng loại bệnh nhân. |
| UI-15 | P2 | Mobile drawer đã có, nhưng chưa dùng focus trap; accessibility và bảng nhiều dữ liệu chưa được kiểm tra đầy đủ. | Kiểm tra Tab/Escape/khôi phục focus và không focus vào drawer đang đóng; xử lý cuộn bảng trong vùng riêng, modal trên màn nhỏ. | Không mắc focus hoặc mất nút chính ở 390px; không cuộn ngang cả trang. |

*UI-14 chuyển P0 nếu kịch bản bảo vệ có bệnh nhân trẻ em.*

## 4. Các đợt thực hiện

### Đợt 1 — Làm luồng demo chạy trọn vẹn

- UI-01 đến UI-06; đặt việc sửa schema/API đơn thuốc và bắt đầu khám trước phần giao diện phụ thuộc.
- Kiểm chứng lại các bản sửa sẵn có: khóa bệnh án, lưu sơ đồ răng, addendum trong 30 ngày, giới hạn truy cập hóa đơn/tóm tắt AI.
- Đầu ra: một bệnh nhân đi hết từ lịch hẹn đến hóa đơn; dữ liệu vẫn đúng sau reload và thử lại.
- Cổng nghiệm thu: không chuyển bước khi thao tác trước chưa hoàn thành; lỗi được trình bày đúng; không có thao tác giả.

### Đợt 2 — Làm rõ điều hướng và thao tác

- UI-07 đến UI-10; thống nhất tên, vai trò, header, sidebar và form.
- Dùng lại Button/Input/Modal/StatusBadge hiện có; chốt quy ước tiêu đề, khoảng cách và một nút hành động chính mỗi vùng.
- Đầu ra: màn desktop 1366×768 rõ ràng, đường đi demo ít phải quay lại menu, form dễ điền.

### Đợt 3 — Hoàn thiện kết quả trình bày

- UI-11 đến UI-13; ưu tiên bảng tiền, bản in, dashboard và trạng thái rỗng/lỗi nhất quán.
- UI-14/15 theo phạm vi demo; không mở rộng thêm module trước khi đợt 1 đạt.
- Đầu ra: ảnh trước/sau của màn chính, bản in đơn/hóa đơn và bảng đối chiếu số liệu demo.

### Đợt 4 — Diễn tập và chốt bản bảo vệ

- Tạo dữ liệu giả lập phục vụ demo trong môi trường thử nghiệm riêng: bệnh nhân, lịch hôm nay, điều trị, đơn thuốc và hóa đơn có liên kết. Đây là việc trong kế hoạch, chưa thực hiện ở lượt rà soát này.
- Chạy đúng 3 vai trò quản trị/lễ tân/bác sĩ; không dùng quyền quản trị để kết luận luồng bác sĩ đạt.
- E2E phải kiểm tra hành động và kết quả thật, không coi “không có nút nên bỏ qua” là pass.
- Kiểm tra 1366×768 và 1920×1080 ở zoom 100%/125%; kiểm tra nhanh mobile 390px. Chọn light mode cho buổi trình chiếu nếu dark chưa hoàn thiện.
- Chốt một bộ dữ liệu có thể dựng lại, tập demo hai lần liên tiếp; lưu ảnh/video dự phòng được ghi nhãn rõ.

Chưa chốt số ngày vì UI-03, UI-04 và UI-11 phụ thuộc sửa backend. Ước lượng lịch triển khai sau khi chốt endpoint và schema sẽ đáng tin hơn ấn định thời gian cho CSS rồi bỏ sót nghiệp vụ.

## 5. Kịch bản bảo vệ đề xuất — khoảng 10 phút

| Thời lượng | Vai trò/màn hình | Nội dung cần chứng minh |
| --- | --- | --- |
| 1 phút | Lễ tân: bệnh nhân | Tìm bệnh nhân, tạo hồ sơ khi cần, kiểm tra thông tin liên hệ. |
| 2 phút | Lễ tân: lịch hẹn | Đặt lịch đúng giờ địa phương và bác sĩ, tiếp nhận bệnh nhân. |
| 3 phút | Bác sĩ: bệnh án | Bắt đầu khám, ghi chẩn đoán/điều trị, sơ đồ răng, lưu và xem lại đơn thuốc. |
| 1 phút | Bác sĩ: hoàn tất | Đóng bệnh án, thể hiện khóa sửa; xem/in đơn đã lưu. |
| 2 phút | Lễ tân: hóa đơn | Xem hóa đơn liên kết, thu tiền, phân biệt đã thu/còn nợ, in. |
| 1 phút | Quản trị: báo cáo | Đối chiếu giao dịch với báo cáo và nêu phân quyền; AI có thể minh họa thêm nếu thuộc nội dung đề tài. |

Lương, ca làm, tồn kho, chi phí là luồng phụ để trình bày khi được hỏi hoặc nếu đề cương yêu cầu. Nếu các module này nằm trong mục tiêu chính của luận văn, phải bổ sung thời lượng và nghiệm thu tương ứng, không dùng thứ tự demo để cắt yêu cầu đề tài.

## 6. Điều kiện chốt giao diện

- Các P0 trong kịch bản được xử lý và có kiểm chứng; không còn trường hợp lưu thành công nhưng reload mất thông tin.
- Mọi nút xuất hiện đều hoạt động hoặc có trạng thái vô hiệu hóa và lý do rõ ràng.
- Số liệu đơn thuốc/hóa đơn/báo cáo đọc lại từ backend khớp nhau.
- Mỗi màn có trạng thái tải/rỗng/lỗi và cách tiếp tục phù hợp.
- Header, tên phòng khám, vai trò, đơn vị tiền và thuật ngữ thống nhất.
- Build/typecheck đạt; xử lý 6 lỗi lint frontend đã ghi ở FIX_PROGRESS; E2E luồng demo và kiểm tra quyền đạt.
- Đánh giá ảnh chụp bằng dữ liệu có thật trong môi trường demo trước khi xác nhận chất lượng thị giác cuối cùng.

## 7. Điểm vào mã nguồn khi triển khai

- UI-01/07/08: `frontend/src/layouts/Header.tsx`, `frontend/src/features/patients/PatientListPage.tsx`, `frontend/src/locales/vi.json`.
- UI-02/03: `frontend/src/features/medical-records/TodayPage.tsx`, `frontend/src/features/appointments/appointmentApi.ts`; services appointments/medical-records ở backend.
- UI-04: `frontend/src/features/medical-records/PrescriptionsTab.tsx`, `imperativeApi.ts`; DTO/service/schema đơn thuốc ở backend.
- UI-05: `frontend/src/features/medical-records/EncounterDetailPage.tsx`, `ClinicalNotesTab.tsx`, `DentalChartPanel.tsx`.
- UI-06: `frontend/src/lib/api.ts`, `frontend/src/stores/authStore.ts`, `frontend/src/features/auth/authApi.ts`.
- UI-09/10/15: `frontend/src/lib/nav.ts`, `frontend/src/layouts/Sidebar.tsx`, `frontend/src/features/patients/PatientForm.tsx`, `frontend/src/components/ui/`.
- UI-11/12/13: `frontend/src/features/billing/InvoiceListPage.tsx`, `frontend/src/features/admin/SettingsPage.tsx`, `frontend/src/features/DashboardPage.tsx`.

Tham chiếu bổ sung: `docs/audits/2026-09-14/REPORT.md` và `FIX_PROGRESS.md`. Các bản sửa của lượt trước được giữ nguyên; kế hoạch này không đánh dấu chúng là chưa sửa lại.

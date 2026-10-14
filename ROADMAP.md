# KẾ HOẠCH THỰC HIỆN ĐỒ ÁN TỐT NGHIỆP

## 1. Tổng quan tiến độ

| STT | Tên công việc | Khối lượng | Start | Due | Tiến độ |
|---:|---|---:|---|---|---|
| 1 | Sprint 1 — Khởi động và lập kế hoạch | 5 đầu việc | 21/07/2026 | 03/08/2026 | Hoàn thành |
| 2 | Sprint 2 — Khảo sát và xác định yêu cầu | 5 đầu việc | 04/08/2026 | 17/08/2026 | Hoàn thành |
| 3 | Sprint 3 — Phân tích và thiết kế | 5 đầu việc | 18/08/2026 | 31/08/2026 | Hoàn thành |
| 4 | Sprint 4 — Xây dựng phiên bản đầu tiên | 5 đầu việc | 01/09/2026 | 14/09/2026 | Hoàn thành |
| 5 | Sprint 5 — Hoàn thiện các chức năng | 5 đầu việc | 15/09/2026 | 28/09/2026 | Hoàn thành |
| 6 | Sprint 6 — Kiểm thử và sửa lỗi | 5 đầu việc | 29/09/2026 | 12/10/2026 | Hoàn thành |
| 7 | Sprint 7 — Hoàn thiện sản phẩm và tài liệu | 5 đầu việc | 13/10/2026 | 26/10/2026 | Đang thực hiện (2/5) |
| 8 | Sprint 8 — Chuẩn bị nghiệm thu và bảo vệ | 5 đầu việc | 27/10/2026 | 09/11/2026 | Chưa bắt đầu |

*Cập nhật ngày 14/10/2026, theo lịch sử commit (303 commit từ 30/08/2026) và tài liệu trong `docs/`. Lịch sử Git bắt đầu từ 30/08/2026, nên Sprint 1–3 được đối chiếu bằng tài liệu đã viết trong giai đoạn đó.*

---

## 2. Chi tiết công việc theo Sprint

### Sprint 1 — Khởi động và lập kế hoạch

**Thời gian:** 21/07/2026 — 03/08/2026

- [x] Xác định mục tiêu và kết quả cần đạt của đồ án.
- [x] Xác định phạm vi công việc và các nội dung cần thực hiện.
- [x] Lập danh sách các đầu việc chính của toàn bộ dự án.
- [x] Phân chia thời gian và thứ tự ưu tiên cho từng đầu việc.
- [x] Thống nhất kế hoạch thực hiện và cách theo dõi tiến độ.

**Kết quả:** mục tiêu và phạm vi trong `docs/00_Vision/PRODUCT_VISION.md`; kế hoạch trong file này.

### Sprint 2 — Khảo sát và xác định yêu cầu

**Thời gian:** 04/08/2026 — 17/08/2026

- [x] Thu thập thông tin và tài liệu liên quan đến đề tài.
- [x] Khảo sát vấn đề cần giải quyết và nhu cầu sử dụng.
- [x] Xác định các đối tượng sử dụng và mục tiêu của từng đối tượng.
- [x] Liệt kê các chức năng cần có của sản phẩm.
- [x] Phân loại chức năng theo mức độ ưu tiên và chốt phạm vi thực hiện.

**Kết quả:** bối cảnh và đối tượng sử dụng trong `docs/01_Architecture/business-context.md`, `actor-permissions-matrix.md`; thuật ngữ trong `docs/02_Glossary/`.

### Sprint 3 — Phân tích và thiết kế

**Thời gian:** 18/08/2026 — 31/08/2026

- [x] Phân tích cách vận hành của các chức năng đã xác định.
- [x] Mô tả các luồng thao tác chính của sản phẩm.
- [x] Thiết kế bố cục và cách trình bày các màn hình cần thiết.
- [x] Xác định mối liên hệ giữa các thành phần trong sản phẩm.
- [x] Rà soát và hoàn thiện bản thiết kế trước khi xây dựng.

**Kết quả:** đặc tả 7 phân hệ trong `docs/03_Specification/`, luồng nghiệp vụ `docs/01_Architecture/business-flow-overview.md`, 9 quyết định kiến trúc trong `docs/ADR/`, thiết kế CSDL `docs/04_Database/`.

### Sprint 4 — Xây dựng phiên bản đầu tiên

**Thời gian:** 01/09/2026 — 14/09/2026

- [x] Chuẩn bị môi trường và cấu trúc làm việc cho dự án.
- [x] Xây dựng phần khung và các thành phần cơ bản của sản phẩm.
- [x] Thực hiện các chức năng cốt lõi theo phạm vi đã thống nhất.
- [x] Tạo các màn hình và luồng thao tác chính.
- [x] Kiểm tra phiên bản đầu tiên và ghi nhận các vấn đề cần xử lý.

**Kết quả:** 64 commit. Backend NestJS + Prisma, frontend React; xác thực, phân quyền, bệnh nhân, lịch hẹn.

### Sprint 5 — Hoàn thiện các chức năng

**Thời gian:** 15/09/2026 — 28/09/2026

- [x] Tiếp tục xây dựng các chức năng còn lại.
- [x] Hoàn thiện các màn hình và thao tác của người dùng.
- [x] Kết nối và kiểm tra sự hoạt động giữa các phần của sản phẩm.
- [x] Bổ sung các trường hợp xử lý cần thiết.
- [x] Rà soát sản phẩm theo danh sách yêu cầu đã chốt.

**Kết quả:** 80 commit. Hồ sơ khám, thanh toán, kho, lương, đặt lịch online, lịch làm việc bác sĩ.

### Sprint 6 — Kiểm thử và sửa lỗi

**Thời gian:** 29/09/2026 — 12/10/2026

- [x] Lập danh sách các trường hợp cần kiểm thử.
- [x] Kiểm tra từng chức năng và các luồng thao tác chính.
- [x] Kiểm tra sự phối hợp giữa các phần của sản phẩm.
- [x] Ghi nhận, phân loại và ưu tiên sửa lỗi.
- [x] Kiểm tra lại sau khi sửa và xác nhận sản phẩm hoạt động ổn định.

**Kết quả:** 143 commit. Kịch bản kiểm thử theo phân hệ trong `docs/04_Test/`; 1.334 unit test backend (55 bộ) chạy qua ngày 14/10/2026; 38 file test E2E frontend trong `frontend/e2e/`.

### Sprint 7 — Hoàn thiện sản phẩm và tài liệu

**Thời gian:** 13/10/2026 — 26/10/2026

- [x] Hoàn thiện giao diện và trải nghiệm sử dụng.
- [x] Xử lý các lỗi và vấn đề còn tồn đọng.
- [ ] Rà soát nội dung, cách trình bày và tính nhất quán của sản phẩm.
- [ ] Viết và hoàn thiện tài liệu hướng dẫn sử dụng.
- [ ] Tổng hợp kết quả thực hiện và cập nhật báo cáo đồ án.

**Đã làm (13–14/10):** hoàn thiện dark mode và giao diện tiếng Anh; sửa email đặt lịch (dữ liệu demo thiếu lịch làm việc, nội dung hủy/dời lịch, xác nhận lịch đặt tại quầy, nhắc lịch buổi sáng); chuyển báo cáo cũ vào `docs/audits/legacy/`.

**Còn lại:** rà các luồng thanh toán, lương, kho; đối chiếu hướng dẫn sử dụng (`docs/09_UserGuide/`) và báo cáo đồ án (`docs/10_Thesis/`) với sản phẩm hiện tại.

### Sprint 8 — Chuẩn bị nghiệm thu và bảo vệ

**Thời gian:** 27/10/2026 — 09/11/2026

- [ ] Kiểm tra lần cuối toàn bộ sản phẩm và các chức năng chính.
- [ ] Chuẩn bị dữ liệu, nội dung và kịch bản trình diễn.
- [ ] Hoàn thiện báo cáo, phụ lục và các tài liệu cần nộp.
- [ ] Chuẩn bị slide thuyết trình và nội dung trả lời câu hỏi.
- [ ] Tập dượt, tiếp nhận góp ý và hoàn tất việc nộp đồ án.

---

## 3. Nguyên tắc theo dõi

- Cập nhật tiến độ sau mỗi buổi làm việc hoặc mỗi tuần.
- Đánh dấu hoàn thành ngay khi kết thúc từng đầu việc.
- Ghi lại các vấn đề phát sinh và kế hoạch xử lý tương ứng.
- Ưu tiên hoàn thành chức năng chính trước các phần bổ sung.
- Trước khi chuyển sang Sprint tiếp theo, cần rà soát các đầu việc còn tồn đọng.

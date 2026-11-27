# Dàn ý chi tiết báo cáo đồ án tốt nghiệp

**Đề tài:** Phát triển phần mềm quản lý phòng khám nha khoa
**Sinh viên:** Trần Tuấn Anh, MSSV 22010130, lớp K16-CNTT_2, ngành Công nghệ thông tin, khóa 2022-2026
**Giảng viên hướng dẫn, khoa, hệ, hạn nộp:** để trống, điền sau.

Căn cứ: quy định trình bày ĐAKLTN của Trường Đại học Phenikaa (QT.ĐT.18/19), báo cáo mẫu K16 (đồ án "Design System…"), phiếu giao đề tài.

## Quy định định dạng (bắt buộc)

| Mục | Quy định |
|---|---|
| Chữ | Times New Roman 13, Unicode, giãn dòng 1,5 |
| Lề | trên 2,5 cm; dưới 2,5 cm; trái 3,5 cm; phải 2,5 cm; A4 |
| Số trang | giữa, đầu trang; Mở đầu → Kết luận: số Ả Rập; phần còn lại: La Mã thường |
| Độ dài | ≥ 50 trang từ Mở đầu đến hết Kết luận (dự kiến 85–100) |
| Đánh số | mục tối đa 4 cấp (4.1.2.1); hình/bảng theo chương (Hình 3.4, Bảng 5.2), có "Nguồn: …" |
| Số | 1.025.845,26 |
| Tài liệu tham khảo | IEEE, đánh số theo thứ tự xuất hiện [1], [2, 5], [3–6] |

## Phần đầu (số La Mã)
Bìa, phụ bìa (theo mẫu bìa Phenikaa); nhận xét GVHD; nhận xét GVPB; tóm tắt (< 20 dòng); lời cam đoan; lời cảm ơn; mục lục; danh mục hình; danh mục bảng; danh mục từ viết tắt; danh mục thuật ngữ.

## MỞ ĐẦU (≈ 4 trang)
1. **Lý do chọn đề tài:** phòng khám nha khoa nhỏ và vừa còn quản lý bằng sổ sách, Excel, Zalo; lịch hẹn chồng chéo, khách bỏ hẹn; hồ sơ răng rời rạc; công nợ khó theo dõi; quản lý thiếu số liệu.
2. **Mục đích nghiên cứu:** mục tiêu tổng quát và 5 mục tiêu cụ thể, chép đúng theo phiếu giao đề tài.
3. **Đối tượng nghiên cứu:** quy trình nghiệp vụ phòng khám; kiến trúc ứng dụng web nhiều lớp; mô hình dữ liệu hồ sơ nha khoa (FDI); phân quyền theo vai trò; tích hợp thanh toán và nhắn tin; ứng dụng mô hình ngôn ngữ lớn có kiểm soát.
4. **Phạm vi:**
   - Nội dung: các module theo phiếu (bệnh nhân, lịch hẹn, điều trị, thanh toán, nhân sự, kho, báo cáo).
   - Không gian: một phòng khám, nhiều bác sĩ.
   - Thời gian: thời gian thực hiện đồ án.
   - Không làm: X-quang/ảnh phim, đa chi nhánh, bảo hiểm.
5. **Phương pháp:** khảo sát quy trình và các phần mềm hiện có; phân tích thiết kế hướng đối tượng (UML); phát triển lặp với kiểm thử tự động và CI; đánh giá bằng kiểm thử, số liệu và đối chiếu mục tiêu.
6. **Ý nghĩa khoa học và thực tiễn.**
7. **Bố cục báo cáo.**

## CHƯƠNG 1. CƠ SỞ LÝ THUYẾT VÀ CÔNG NGHỆ (≈ 14 trang)
- 1.1. Nghiệp vụ phòng khám nha khoa: quy trình tiếp nhận → khám → điều trị → thanh toán → tái khám; hệ đánh số răng FDI (răng vĩnh viễn 11–48, răng sữa 51–85); kế hoạch điều trị và báo giá; nhắc tái khám.
- 1.2. Tổng quan các phần mềm hiện có, bảng so sánh tính năng (Bảng 1.1): một số phần mềm trong nước và quốc tế. Nêu khoảng trống mà đề tài giải quyết.
- 1.3. Kiến trúc ứng dụng web: SPA + REST API, kiến trúc phân lớp, modular monolith.
- 1.4. Công nghệ backend: Node.js, NestJS 10 (module, controller, provider, guard, pipe); Prisma 5 ORM; PostgreSQL 16 (ràng buộc, chỉ mục, JSONB, giao dịch).
- 1.5. Công nghệ frontend: React 18, Vite 5, TanStack Query 5, Tailwind CSS, Recharts, i18next.
- 1.6. Xác thực và phân quyền: JWT access/refresh token, băm mật khẩu bằng Argon2; RBAC 133 mã quyền và phạm vi theo dòng dữ liệu (bác sĩ chỉ xem bệnh nhân của mình); nhật ký kiểm toán.
- 1.7. Thanh toán qua VietQR và webhook đối soát; nhắn tin email/SMS/Zalo ZNS.
- 1.8. Mô hình ngôn ngữ lớn trong phần mềm nghiệp vụ: gọi công cụ (tool calling), "con người duyệt trước khi thực hiện", bảo vệ dữ liệu cá nhân (mô hình không thấy tên/SĐT), cơ chế dự phòng khi AI lỗi.
- 1.9. Kiểm thử phần mềm và CI/CD: unit test (Jest), test API trên CSDL thật, E2E (Playwright), GitHub Actions; triển khai Docker.
- 1.10. Kết luận chương.

## CHƯƠNG 2. KHẢO SÁT HIỆN TRẠNG VÀ PHÂN TÍCH YÊU CẦU (≈ 14 trang)
- 2.1. Khảo sát quy trình tại phòng khám: một ngày làm việc điển hình; dòng tiền; khó khăn hiện tại. Hình 2.1: sơ đồ quy trình nghiệp vụ tổng thể.
- 2.2. Tác nhân: quản trị viên/chủ phòng khám, lễ tân, bác sĩ, bệnh nhân (khách đặt lịch online), hệ thống ngoài (ngân hàng, email/SMS, AI). Bảng 2.1.
- 2.3. Yêu cầu chức năng theo module (Bảng 2.2–2.9): bệnh nhân; lịch hẹn và đặt lịch online; tiếp nhận và hàng chờ; khám, điều trị và sơ đồ răng; kế hoạch điều trị; hóa đơn và thanh toán; nhân sự, ca, lương; kho vật tư; báo cáo và dashboard; nhắc lịch; tra cứu lịch sử khám của bệnh nhân; trợ lý AI.
- 2.4. Yêu cầu phi chức năng: bảo mật, quyền riêng tư dữ liệu y tế, hiệu năng, khả dụng, giao diện tiếng Việt/Anh, hoạt động trên điện thoại, khả năng kiểm toán.
- 2.5. Biểu đồ use case tổng quát (Hình 2.2) và use case phân rã theo tác nhân (Hình 2.3–2.6).
- 2.6. Ma trận tác nhân và quyền (Bảng 2.10).
- 2.7. Kết luận chương.

## CHƯƠNG 3. PHÂN TÍCH VÀ THIẾT KẾ HỆ THỐNG (≈ 24 trang)
- 3.1. Kiến trúc tổng thể (Hình 3.1): trình duyệt → Nginx → NestJS API → PostgreSQL; dịch vụ ngoài. Danh sách 25 module backend và 340 endpoint (Bảng 3.1).
- 3.2. Thiết kế cơ sở dữ liệu: 71 bảng, 44 kiểu liệt kê, 53 lần migration. ERD theo nhóm (Hình 3.2–3.6): bệnh nhân và lịch hẹn; khám và điều trị; hóa đơn và thanh toán; nhân sự, ca và lương; kho. Mô tả các bảng chính (Bảng 3.2–3.8). Quyết định thiết kế: UUIDv7, soft delete, tiền dùng Decimal, sơ đồ răng lưu JSONB theo từng lần khám.
- 3.3. Đặc tả chức năng (bảng đặc tả theo mẫu: tên, tác nhân, tiền điều kiện, luồng chính, luồng thay thế, hậu điều kiện), kèm sơ đồ tuần tự hoặc sơ đồ trạng thái:
  - 3.3.1. Đặt lịch online và xác nhận (tuần tự).
  - 3.3.2. Tiếp nhận, check-in, hàng chờ (trạng thái lịch hẹn).
  - 3.3.3. Khám, ghi điều trị và sơ đồ răng (tuần tự; trạng thái phiên khám).
  - 3.3.4. Kế hoạch điều trị và báo giá (trạng thái kế hoạch).
  - 3.3.5. Phát hành hóa đơn, thu tiền, VietQR và webhook đối soát (tuần tự; trạng thái hóa đơn).
  - 3.3.6. Nhắc lịch tự động (tuần tự).
  - 3.3.7. Bệnh nhân tra cứu lịch sử khám qua đường dẫn bảo mật (tuần tự).
  - 3.3.8. Ca làm việc và tính lương.
  - 3.3.9. Kho vật tư: nhập, xuất theo điều trị, gợi ý nhập.
  - 3.3.10. Báo cáo, chỉ số vận hành, dashboard.
  - 3.3.11. Trợ lý AI: vòng lặp gọi công cụ, thẻ xác nhận (tuần tự).
- 3.4. Thiết kế bảo mật: luồng xác thực (tuần tự JWT/refresh); guard phân quyền; phạm vi theo dòng dữ liệu; token liên kết công khai chỉ lưu SHA-256; giới hạn tần suất; nhật ký kiểm toán.
- 3.5. Thiết kế giao diện: sơ đồ màn hình theo vai trò; nguyên tắc giao diện (responsive, chế độ tối, hai ngôn ngữ); sơ đồ răng dạng cung.
- 3.6. Kết luận chương.

## CHƯƠNG 4. XÂY DỰNG VÀ TRIỂN KHAI HỆ THỐNG (≈ 22 trang)
- 4.1. Môi trường và công cụ phát triển (Bảng 4.1); cấu trúc mã nguồn backend/frontend (Bảng 4.2).
- 4.2. Cài đặt backend: module mẫu (controller, service, DTO, guard); giao dịch và chống đặt trùng lịch; quy tắc giá; đối soát thanh toán.
- 4.3. Cài đặt frontend: định tuyến, quản lý trạng thái máy chủ (TanStack Query), chữ giao diện hai ngôn ngữ, tải chữ tiếng Anh khi cần.
- 4.4. Kết quả theo chức năng (ảnh màn hình thật kèm mô tả):
  - đăng nhập và phân quyền;
  - quản lý bệnh nhân;
  - lịch hẹn, đặt lịch online, bảng ghế;
  - hàng chờ;
  - phiên khám: điều trị và sơ đồ răng, lịch sử theo răng;
  - kế hoạch điều trị;
  - hóa đơn, VietQR;
  - nhân sự, ca, lương;
  - kho;
  - dashboard và báo cáo;
  - nhắc lịch;
  - trang tra cứu lịch sử của bệnh nhân;
  - trợ lý AI.
- 4.5. Tích hợp AI: cấu hình gateway, bảo vệ dữ liệu, cơ chế dự phòng.
- 4.6. Triển khai: Docker Compose, VPS, Nginx, migration khi phát hành, script deploy và smoke test; quy trình CI (10 kiểm tra).
- 4.7. Kết luận chương.

## CHƯƠNG 5. KIỂM THỬ VÀ ĐÁNH GIÁ (≈ 14 trang)
- 5.1. Mục tiêu, phạm vi, môi trường kiểm thử (Bảng 5.1).
- 5.2. Chiến lược kiểm thử: kim tự tháp test; CI chặn merge khi đỏ (Bảng 5.2).
- 5.3. Kết quả:
  - khoảng 1.790 unit test backend;
  - khoảng 100 test API trên PostgreSQL;
  - 122 kịch bản E2E;
  - lint và typecheck (Bảng 5.3).
- 5.4. Kịch bản kiểm thử chức năng tiêu biểu (Bảng 5.4–5.6): đặt lịch trùng giờ, phân quyền bác sĩ, thanh toán qua webhook, liên kết công khai hết hạn.
- 5.5. Đánh giá hiệu năng và tối ưu: lịch sử theo răng từ tối đa 50 request xuống 1; file JS chính giảm từ 540 KB xuống 384 KB (nén: 156 xuống 109 KB). Kiểm tra trên màn hình 390 px.
- 5.6. Đánh giá theo mục tiêu đề tài: bảng đối chiếu 5 mục tiêu và các kết quả dự kiến trong phiếu giao đề tài (Bảng 5.7).
- 5.7. Hạn chế: chưa có X-quang và ảnh phim; SMS/Zalo chưa thử với nhà cung cấp thật; chưa thử tải lớn; chưa có ứng dụng di động.
- 5.8. Kết luận chương.

## KẾT LUẬN VÀ HƯỚNG PHÁT TRIỂN (≈ 3 trang)
- **Kết quả đạt được**, kèm điểm mới:
  - trợ lý AI có xác nhận;
  - VietQR tự đối soát;
  - sơ đồ răng có lịch sử theo răng;
  - chỉ số vận hành;
  - phân quyền theo dòng dữ liệu.
- **Hướng phát triển:** X-quang và ảnh phim; cổng bệnh nhân có tài khoản; đa chi nhánh; ứng dụng di động; bảo hiểm.

## TÀI LIỆU THAM KHẢO
Chuẩn IEEE, khoảng 30–40 tài liệu: tài liệu chính thức NestJS, Prisma, PostgreSQL, React, OWASP, RFC 7519 (JWT), Argon2, chuẩn FDI (ISO 3950), NAPAS VietQR, Playwright, các bài báo về phần mềm quản lý phòng khám và về AI trong y tế. Nguồn khởi đầu: `docs/10_Thesis/REFERENCES.md`.

## PHỤ LỤC
- A. Danh sách API.
- B. Hướng dẫn cài đặt và triển khai.
- C. Ma trận phân quyền đầy đủ.
- D. Danh sách kịch bản kiểm thử E2E.

## Cách làm và thứ tự
1. Viết theo thứ tự chương 3 → 4 → 5 → 2 → 1 → Mở đầu và Kết luận → phần đầu.
2. Hình:
   - sơ đồ UML và ERD dựng từ mã nguồn (PlantUML hoặc Mermaid), xuất PNG;
   - ảnh màn hình chụp từ dữ liệu demo (Playwright).
3. Xuất file `.docx`:
   - dùng style TNR 13, giãn dòng 1,5, lề đúng quy định;
   - mục lục và danh mục hình/bảng là trường tự động; mở Word và cập nhật trường (F9) là đủ.
4. Mỗi chương xong gửi để duyệt.

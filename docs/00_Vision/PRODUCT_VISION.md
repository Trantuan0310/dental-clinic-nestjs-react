# PRODUCT VISION — Dental Clinic Management System

> **Một câu mô tả:** Nền tảng quản lý phòng khám nha khoa hiện đại, AI-first, giúp phòng khám nhỏ vận hành chuyên nghiệp như chuỗi lớn.

---

## 1. Vì sao dự án này tồn tại?

### Vấn đề thực tế tại Việt Nam

- Phần lớn phòng khám nha khoa nhỏ (1–5 bác sĩ) đang dùng **Excel + sổ tay** hoặc phần mềm generic không phù hợp nghiệp vụ nha khoa (HĐHĐT tổng quát, phần mềm spa, ...).
- Khi phòng khám phát triển lên 2–3 nhân viên, **mâu thuẫn** giữa:
  - Bác sĩ muốn ghi chú nhanh, đầy đủ chuyên môn.
  - Lễ tân muốn sắp xếp lịch, thu tiền, tránh sai sót.
  - Chủ phòng khám muốn biết doanh thu, công nợ, tồn kho.
- Phần mềm hiện có trên thị trường: hoặc **quá đắt** (vài triệu/tháng), hoặc **quá sơ sài** (chỉ có POS), hoặc **khó dùng** (UX không phù hợp nhân viên y tế).

### Cơ hội

- AI giờ có thể hỗ trợ: phiên âm ghi chú bác sĩ, gợi ý lịch trống thông minh, phát hiện bất thường trong thanh toán.
- Cloud-native & ecosystem JavaScript/TypeScript giúp một dev có thể xây MVP chất lượng cao trong 4 tháng.

---

## 2. Tầm nhìn dài hạn (3–5 năm)

> **Trở thành nền tảng quản lý phòng khám nha khoa AI-first đầu tiên tại Việt Nam.**

Cụ thể:

- **MVP (hiện tại):** một phòng khám, đầy đủ nghiệp vụ cốt lõi, chất lượng sản phẩm thực sự.
- **V1.0:** mở rộng thêm 3–5 phòng khám, có AI features cơ bản (gợi ý lịch, nhận diện hành vi bất thường).
- **SaaS:** multi-tenant, nhiều phòng khám cùng lúc, self-service onboarding.
- **AI-first:** AI là first-class citizen — gợi ý điều trị cho bác sĩ (qua guideline y tế), dự đoán doanh thu, phân tích tỷ lệ tái khám.

---

## 3. Phạm vi MVP

### Có (In scope)

- 1 phòng khám duy nhất (single-tenant).
- 3 actor hệ thống: Clinic Administrator, Receptionist, Dentist.
- Module: Authentication, Patients, Appointments, Medical Records, Billing, Inventory, Dashboard.
- AI features **cơ bản** (sau khi MVP core chạy): ví dụ gợi ý khung giờ trống tối ưu cho receptionist.

### Không có (Out of scope cho MVP)

- Multi-tenant / multi-clinic.
- Cổng thông tin bệnh nhân online (patient portal).
- App mobile.
- Tích hợp thanh toán online / VNPay.
- Microservices (vẫn giữ modular monolith).
- Email/SMS reminder tự động (sẽ có mock).
- Bảo hiểm y tế / công ty bảo hiểm.

> Xem chi tiết [`ROADMAP.md`](../../ROADMAP.md).

---

## 4. Đối tượng sử dụng

### Primary personas

#### 🩺 Chủ phòng khám / Quản trị viên (Clinic Administrator)

- **Tuổi:** 35–55.
- **Mục tiêu:** vận hành phòng khám hiệu quả, tăng doanh thu, có báo cáo.
- **Nỗi đau:** giờ vẫn phải tổng hợp Excel mỗi tuần.
- **Kỳ vọng:** dashboard rõ ràng, báo cáo tài chính chính xác, không phải nhập tay.

#### 👩‍💼 Lễ tân (Receptionist)

- **Tuổi:** 22–35.
- **Mục tiêu:** đặt lịch nhanh, tránh trùng giờ, thu tiền đủ.
- **Nỗi đau:** hệ thống cũ hay trùng lịch, đôi khi thu thiếu.
- **Kỳ vọng:** calendar trực quan, cảnh báo trùng lịch, in hóa đơn 1-click.

#### 🦷 Bác sĩ (Dentist)

- **Tuổi:** 28–50.
- **Mục tiêu:** khám bệnh nhanh, ghi chép đầy đủ, điều trị hiệu quả.
- **Nỗi đau:** ghi chú giấy rơi mất; phải viết tay rồi nhập lại lên Excel.
- **Kỳ vọng:** ghi chép số/dictation, xem lịch sử điều trị nhanh, dental chart trực quan.

### Secondary persona

#### Bệnh nhân

- **KHÔNG phải người dùng hệ thống** (xem ADR-0003). Họ chỉ là entity được quản lý.
- Trong MVP: tra cứu qua lễ tân.

---

## 5. Nguyên tắc thiết kế từ Vision

1. **Domain-first, tech second.** Đặc biệt với dữ liệu y tế — domain phải dễ audit và rõ ràng.
2. **AI là công cụ hỗ trợ**, không thay thế bác sĩ. Mọi suggestion từ AI phải có confirmation cuối từ người.
3. **Dữ liệu y tế phải có chất lượng "audit-ready".** Phòng khám có thể bị kiểm tra bất kỳ lúc nào.
4. **UX tôn trọng thời gian bác sĩ.** Bác sĩ là người có ít thời gian nhất trong hệ thống → UI cho dentist phải ưu tiên "trong 3 cú click là xong".
5. **Triển khai nhanh, sửa nhanh.** Code phải có thể đổi khi nhận feedback thực tế.

---

## 6. Cách đo lường thành công MVP

### Tiêu chí "xong MVP"

- [ ] Một phòng khám thật (kể cả dev = người test đầu tiên) chạy được cả 7 ngày mà không có bug block công việc.
- [ ] 3 actor login được, dùng được mọi use case trong spec.
- [ ] Mock 1 patient đi qua full flow: đặt lịch → check-in → khám → nhận hóa đơn → thanh toán → tồn kho giảm.
- [ ] Báo cáo tài chính cơ bản: doanh thu ngày, công nợ, tồn kho.
- [ ] Test coverage: domain ≥ 90%, application ≥ 70%, infrastructure = smoke test.
- [ ] Documentation đầy đủ để 1 dev khác onboard trong 1 tuần.

### KPI theo dõi sau khi ship MVP

- Số phòng khám cam kết dùng thử (target: 1 phòng khám beta).
- Số lượng appointment/ngày mà hệ thống xử lý mà không bug (target: ≥ 20).
- Thời gian lễ tân check-in 1 bệnh nhân (target: ≤ 30 giây).
- Thời gian bác sĩ ghi chú + xem hồ sơ (target: ≤ 2 phút cho ca quen).

---

## 7. Phạm vi tương lai (xem để định hướng kiến trúc)

Đây **không phải** roadmap MVP, chỉ là tín hiệu để thiết kế đủ rộng:

- Multi-clinic SaaS → bắt buộc Phân tách schema theo tenant (DB-per-tenant hoặc row-level).
- AI clinical assistant → cần lưu lịch sử ghi chú + guideline y tế.
- Patient portal → cần `PatientAccount` (xem ADR-0003 Khi nào xem lại).
- Tích hợp thiết bị (X-ray sensor, intra-oral camera) → cần thêm module Imaging.
- Teledentistry → cần thêm module Consultation.

---

## 8. Câu hỏi đang mở (open)

Những câu hỏi dự án sẽ trả lời trong quá trình:

- [ ] Phòng khám Việt Nam bắt buộc lưu hồ sơ bao lâu? (Theo luật: 10 năm — verify lại.)
- [ ] Có cần hỗ trợ Tiếng Anh trong UI không? MVP: chỉ Tiếng Việt.
- [ ] Phòng khám có cần hỗ trợ nhiều chi nhánh khác số nhà không? MVP: 1 địa điểm.

## 9. Liên kết

- [`README.md`](../../README.md)
- [`PROJECT_RULES.md`](../../PROJECT_RULES.md)
- [`ARCHITECTURE.md`](../../ARCHITECTURE.md)
- [`docs/02_Glossary/GLOSSARY.md`](../02_Glossary/GLOSSARY.md)

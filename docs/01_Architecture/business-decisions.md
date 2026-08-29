# Business Decisions Log

> **Mục đích:** Ghi lại các quyết định nghiệp vụ đã chốt với stakeholder, **TẠI THỜI ĐIỂM** chốt. Khi đọc lại sẽ hiểu tại sao MVP vận hành theo cách này.
>
> **Khác với ADR** ở chỗ: ADR = kiến trúc/kỹ thuật; business decision = nghiệp vụ thuần.

---

## Format

Mỗi quyết định có:

- **BD-XXXX** — mã số
- **Date** — ngày chốt
- **Context** — bối cảnh
- **Decision** — quyết định
- **Why** — lý do
- **Impact** — ảnh hưởng đến module nào

---

## BD-0001 — Waiting Queue theo FIFO (đến trước khám trước)

**Date:** 2026-07-12
**Decided by:** Product Owner

### Context

Khi bệnh nhân check-in, cần quyết định thứ tự vào phòng khám. Có các cách:

1. FIFO (đến trước khám trước).
2. Theo mức ưu tiên (VIP, cấp cứu, nạu bể...).
3. Theo giờ hẹn (bệnh nhân đặt 9:00 vào 9:00).
4. Bác sĩ tự chọn bệnh nhân tiếp theo.

### Decision

Chọn **FIFO đơn giản** cho MVP: bệnh nhân check-in trước → vào đầu hàng đợi → bác sĩ lần lượt gọi.

### Why

- Đơn giản nhất để MVP chạy được.
- Phù hợp phòng khám nhỏ (1–5 bác sĩ), ít tranh cãi.
- Có thể mở rộng sau: thêm priority field, sau khi MVP ổn định.

### Impact

- Module **Appointments**: waiting queue sort theo `checked_in_at ASC`.
- Module **Patients**: không cần thêm trường priority.
- UI waiting queue: 1 danh sách duy nhất per dentist/day.

---

## BD-0002 — Quan hệ 1-1 giữa Appointment và Encounter

**Date:** 2026-07-12

### Context

Một buổi đặt lịch có thể kéo dài thành nhiều lần khám (ví dụ: khám xong tuần trước, tuần sau quay lại). Câu hỏi: 1 Appointment có thể chứa nhiều Encounter không?

### Decision

**1 Appointment ↔ 0 hoặc 1 Encounter.** Không cho phép nhiều Encounter cùng chia Appointment.

### Why

- Đơn giản hoá billing: 1 appointment → 1 lần phát sinh invoice (nếu có treatment).
- Tránh mơ hồ "Ca này thuộc appointment nào?".
- Trường hợp "nhiều buổi" thực tế là **nhiều Appointment tách biệt** cùng liên quan tới 1 kế hoạch điều trị (treatment plan — mở rộng sau MVP).

### Impact

- Module **Appointments**: không cần bảng trung gian `AppointmentEncounter`.
- Module **Medical Records**: Encounter chỉ có FK `appointmentId` (unique).
- API: tạo Encounter phải check appointment chưa có encounter; trả lỗi nếu có.

---

## BD-0003 — Thanh toán sau khi khám (không đặt cọc)

**Date:** 2026-07-12

### Context

Phòng khám có nên yêu cầu đặt cọc trước cho điều trị lớn (implant, niềng) không?

### Decision

**MVP: Không có cọc.** Thanh toán sau khi khám/điều trị xong.

### Why

- Đơn giản cho MVP.
- Phòng khám nhỏ thường không tính cọc trước.
- Có thể thêm sau khi đã có flow thanh toán cơ bản.

### Impact

- Module **Billing**: chỉ cần state `draft → issued → partial/paid → refunded`.
- API: không có endpoint `/deposits` ở MVP.
- Sau khi MVP, có thể thêm ADR mở rộng.

---

## BD-0004 — Inventory: chỉ đếm và trừ (không quản lý lô/hạn)

**Date:** 2026-07-12

### Context

Module Inventory có thể làm đơn giản (chỉ `quantity on hand`) hoặc phức tạp (lot, expiry date, FIFO).

### Decision

**MVP: chỉ số lượng đơn giản.** Mỗi item có `quantity_on_hand`, không theo dõi lô hay hạn.

### Why

- Phòng khám nhỏ ít khi cần quản lý theo lô.
- Vật tư nha khoa đa số dùng nhanh, không tồn lâu.
- Giảm complexity database + UI.

### Impact

- Module **Inventory**: bảng `InventoryItem(id, name, quantity_on_hand, unit, ...)`.
- Không có bảng `InventoryBatch`, `InventoryExpiry`.
- Cảnh báo "sắp hết" qua rule `quantity_on_hand < threshold`.

---

## BD-0005 — Medical Record MVP: đầy đủ clinical core, không có hình ảnh

**Date:** 2026-07-12

### Context

Medical Record có nhiều cấp độ:

- Tối thiểu: chỉ Clinical Note text.
- Trung bình: + Treatment (phiếu điều trị) + Prescription.
- Đầy đủ: + Dental Chart + ảnh X-ray, intra-oral.

### Decision

**MVP Medical Record bao gồm:**

- Clinical Note
- Treatment (phiếu điều trị từng răng/toàn hàm)
- Prescription (toa thuốc)
- Dental Chart (sơ đồ tình trạng từng răng theo thời gian — text/JSON, không phải ảnh X-ray)

**Không bao gồm ở MVP:** upload X-ray images, intra-oral camera, PDF scan.

### Why

- Dental Chart đủ để hỗ trợ phòng khám chuyên nghiệp.
- Ảnh X-ray đòi hỏi lưu trữ lớn, PACS, viewer — quá nhiều cho MVP.
- Treatment + Clinical Note + Dental Chart đủ cho "hồ sơ chuẩn" theo quy định Y tế.

### Impact

- Module **Medical Records**: 4 entity chính: `Encounter`, `ClinicalNote`, `Treatment`, `Prescription`.
- Module **Patients**: không có bảng `PatientImage`.
- API: không có endpoint upload ảnh.
- Database: không cần blob storage.

---

## BD-0006 — Bệnh nhân có "mã bệnh nhân" (Patient Code) để in/tra cứu

**Date:** 2026-07-12

### Context

Bệnh nhân có `id` UUID nội bộ, nhưng có thể cần một mã thân thiện để in trên phiếu khám, hóa đơn hoặc tìm nhanh tại quầy lễ tân.

### Decision

Mỗi Patient có thêm **`code`** theo format `PAT-YYYY-NNNNN`, sinh tự động khi tạo. Sequence reset theo năm.

**Ví dụ:** `PAT-2026-00001`, `PAT-2026-00002`, ...

### Why

- UUID 32 ký tự khó đọc khi in phiếu giấy hoặc tra cứu nhanh tại quầy.
- Pattern `PAT-YYYY-NNNNN` quen thuộc với phòng khám Việt Nam.
- Thân thiện khi scan QR code (nếu cần sau này).

### Impact

- Module **Patients**: thêm cột `code` trên bảng `patients`. Unique index. Format và sequence xử lý ở application service.
- Module **Appointments**: có thể hiển thị `patientCode` thay vì UUID ở UI.
- Module **Medical Records**: Clinical Note / Prescription có thể in `patientCode`.
- API: trả về cả `id` và `code` trong response.
- Migration: thêm column + index + seed sequence per-year.

---

## BD-0007 — Trùng bệnh nhân: hệ thống gợi ý, lễ tân xác nhận

**Date:** 2026-07-12

### Context

Khi lễ tân tạo bệnh nhân mới, có thể nhập nhầm bệnh nhân đã tồn tại. Cách xử lý:

1. Không gợi ý → lễ tân tự phát hiện (dễ tạo trùng).
2. Hệ thống so sánh SĐT → gợi ý các bệnh nhân có SĐT tương tự, lễ tân xác nhận.
3. Bắt buộc unique SĐT → 1 SĐT = 1 patient (gây phiền nếu gia đình dùng chung).

### Decision

**Hệ thống gợi ý khi tạo Patient mới nếu có SĐT trùng (exact match) hoặc khớp tên + ngày sinh (fuzzy).** Lễ tân chọn "tạo mới" hoặc "dùng bệnh nhân đã có".

### Why

- 1 người cần 1 record. Trùng = lỗi.
- Nhưng SĐT có thể dùng chung (gia đình, đổi SĐT), nên KHÔNG ép unique.
- Gợi ý giúp giảm 99% trường hợp trùng mà không phiền.

### Impact

- Module **Patients**: API `POST /patients` có thể nhận `confirmNew: true` để bypass gợi ý (admin dùng). Mặc định backend sẽ check và trả 200 kèm `potentialDuplicates: [...]` thay vì 409.
- FE: form tạo → sau khi nhập SĐT, debounce 300ms, gọi `GET /patients/lookup?phone=...` → hiện danh sách 3-5 candidate.
- API endpoint mới: `GET /api/v1/patients/lookup?phone=...&name=...&dob=...` (permission `patient.read`).
- Audit log khi tạo patient.

---

## Quy tắc thêm business decision mới

1. Khi phát hiện quyết định nghiệp vụ chưa ghi → thêm BD-XXXX mới.
2. Không sửa BD cũ. Nếu thay đổi → tạo BD mới supersede.
3. Mỗi BD phải trỏ đến module nào bị ảnh hưởng (Impact).

---

## BD-0008 — Cascade cancel: Appointment ↔ Encounter

**Date:** 2026-07-13
**Decided by:** Product Owner (qua Senior Architect review)

### Context

Quan hệ 1-1 giữa Appointment và Encounter (BD-0002) tạo ra câu hỏi khi Appointment bị hủy **sau khi** Encounter đã tạo (tức là BN đã check-in hoặc đã bắt đầu khám). Có 3 cách xử lý:

1. Cascade cancel: Appointment cancel → Encounter tự động cancel.
2. Block cancel: Không cho cancel Appointment nếu đã có Encounter.
3. Manual: Lễ tân/BS phải chọn thủ công (cancel Encounter riêng rồi mới cancel Appointment).

### Decision

**Chọn Cascade cancel tự động.** Khi Appointment chuyển sang status `cancelled`:
- Nếu chưa có Encounter → chỉ update Appointment.
- Nếu đã có Encounter status `in_progress` → Encounter tự động chuyển sang `cancelled`, ghi `cancelledReason = "appointment cancelled"`, `cancelledBy = currentUser`, KHÔNG trigger `EncounterClosed` event, KHÔNG stock-out, KHÔNG tạo Invoice.
- Nếu đã có Encounter status `completed` → **không cho cancel Appointment** (BR-APPT-023 mới). Admin override với lý do + audit.

### Why

- Workflow phòng khám thực tế: nếu BS ốm / lễ tân hủy lịch vì BN gọi báo hoãn → cần cả lịch và hồ sơ khám (nếu có) phản ánh đúng trạng thái.
- Tránh "dangling encounter" — Encounter trỏ đến Appointment cancelled sẽ gây nhầm lẫn khi đọc hồ sơ.
- Đơn giản hơn "manual": tránh sai sót do con người quên cancel 1 bên.
- Block cancel khi encounter đã completed là an toàn: completed = immutable (BR-MR-004 + BR-APPT-022).

### Impact

- **Module Appointments:** BR mới BR-APPT-023 — Cascade cancel rule.
- **Module Medical Records:** BR mới BR-MR-026 — Encounter tự động cancel khi Appointment cancelled; BR-MR-023 đã có sẵn (cancel encounter = soft close, không stock-out) chỉ cần áp dụng từ cả 2 trigger (manual và cascade).
- **Module Billing:** KHÔNG tạo Invoice draft khi cascade cancel (khác với EncounterClosed).
- **Module Inventory:** KHÔNG stock-out khi cascade cancel.
- **Sequence diagram Appointments §2.4** cập nhật để emit `AppointmentCancelled` event.
- **Module Medical Records** subscribe `AppointmentCancelled` để cascade cancel Encounter.
- **ADR-0007** + **ADR-0008:** Cascade cancel event chạy đồng bộ trong transaction của AppointmentService.cancel().

### Implementation note

Sử dụng pattern từ **ADR-0007** (in-process event bus, sync handler). Sequence:

```
1. AppointmentService.cancel() [transaction begin]
2. UPDATE appointment SET status = 'cancelled', cancelledAt, cancelledReason
3. eventEmitter.emit('appointment.cancelled', ...)
4. MedicalRecordsHandler.handle() [sync] → UPDATE encounter SET status = 'cancelled'
5. COMMIT
```

Nếu Encounter handler throw (vd: không tìm thấy encounter để cancel) → Appointment cancel cũng rollback, trả 422.

### Edge case

| Case | Xử lý |
| ---- | ----- |
| Appointment `scheduled` → cancel (không có encounter) | OK. |
| Appointment `checked_in` → cancel | OK. Encounter cancel theo (nếu có). |
| Appointment `in_progress` → cancel (BS hủy giữa ca) | OK. Encounter cancel theo, không stock-out (vì không EncounterClosed). Admin xem xét hồ sơ. |
| Appointment `completed` → cancel | ❌ 409. Admin override với reason + audit. |
| Appointment đã cancel rồi cancel lại | 409 "Already cancelled". |

---

## BD-0009 — Mô hình tính lương bác sĩ: Lương nền + Commission (Hybrid)

**Date:** 2026-07-15
**Decided by:** Product Owner

### Context

Phòng khám cần tính lương bác sĩ hàng tháng. Có 4 mô hình phổ biến:

1. **Cố định theo ca** — Đơn giản nhưng không khuyến khích BS khám nhiều.
2. **Commission theo doanh thu** — Khuyến khích nhưng rủi ro khi BS mới (chưa có BN = 0 thu nhập).
3. **Lương nền + Commission** (Hybrid) — Cân bằng, phổ biến ở phòng khám tư nhân VN.
4. **Theo giờ thực tế** — Công bằng nhưng phức tạp khi tracking check-in/check-out.

### Decision

Chọn mô hình **HYBRID** cho toàn bộ phòng khám. Mỗi BS có `DentistCompensation` riêng, có thể thay đổi theo thời gian (effective dating).

**Công thức tổng quát:**

```
gross_pay = base_salary_vnd
          + commission_pct × sum(treatment.revenue for completed encounters in period)
          + overtime_pay (nếu vượt working_hours_per_week × overtime_multiplier)
          + bonus_vnd (admin adjustment)
          - penalty_vnd (admin adjustment)

net_pay  = gross_pay
          - tax_tncn (thuế TNCN lũy tiến theo quy định VN)
          - bhxh_bhyt_bhtn (bảo hiểm bắt buộc)
          - other_deductions
```

**Quy tắc tính commission:**

- Chỉ tính trên `encounter.status = 'completed'` đã chốt trong kỳ.
- Revenue = tổng `treatment.unitPriceCents × quantity` của treatment do BS đó thực hiện (`treatment.performedByUserId = dentist.id`), **đã trừ discount trên invoice** (net revenue).
- Thuốc (`Prescription`) và dịch vụ phụ (ngoài treatment) **không tính commission** trừ khi admin cấu hình riêng.
- Commission pct theo `DentistCompensation.commissionPct` có hiệu lực tại `encounter.closedAt`.

### Why

- Phổ biến ở phòng khám tư nhân VN.
- Lương nền đảm bảo BS mới yên tâm.
- Commission khuyến khích BS khám chất lượng, tăng thu nhập phòng khám.
- Effective dating cho phép thay đổi chính sách (vd: thưởng cuối năm, BS lên chức).

### Impact

- Tạo module mới: `Payroll` với 7 entities chính:
  - `PayrollConfig` — cấu hình toàn hệ thống (cycle, tax rate, BHXH rate)
  - `DentistCompensation` — chính sách lương từng BS, effective dating
  - `PayrollPeriod` — kỳ lương (DRAFT → REVIEWING → APPROVED → PAID → LOCKED)
  - `PayrollLineItem` — bảng lương 1 BS trong 1 kỳ
  - `PayrollAdjustment` — manual bonus/penalty/deduction
  - `PayrollEncounterDetail` — breakdown từng encounter trong line item
  - `Payslip` (optional) — phiếu lương PDF (sau MVP)
- BR mới: BR-PAY-001 → BR-PAY-021
- Permission mới: `payroll.*` (11 permission, xem actor-permissions-matrix §3.9)
- API mới: 16 endpoints (xem Payroll SPEC §8)
- Listener: subscribe `EncounterClosed` + `InvoicePaid` events (in-process event bus theo ADR-0007) để tự động cập nhật line item nếu period đang DRAFT.
- Thuế TNCN: áp dụng bậc lũy tiến VN hiện hành (5%/10%/15%/20%/25%). BR-PAY-009 mô tả chi tiết.
- BHXH: 10.5% (BHXH 8% + BHYT 1.5% + BHTN 1%). BR-PAY-010.
- Lương cơ sở Nhà nước: hard-code trong `PayrollConfig` và update theo NĐ hàng năm (BR-PAY-011).

### Edge cases

| Case | Xử lý |
| ---- | ----- |
| Encounter completed sau khi period APPROVED | KHÔNG tính lương cho kỳ đó. Lưu sang kỳ tiếp theo hoặc admin adjust tay. |
| Encounter cancelled (BD-0008 cascade) | Không tính commission (revenue = 0). |
| Invoice refund sau khi đã trả lương | Tạo PayrollAdjustment DEDUCTION kỳ tiếp theo, kèm audit note. |
| BS nghỉ việc giữa kỳ | Pro-rate theo ngày làm việc (BR-PAY-012). |
| Encounter có 2 BS cùng khám (multi-BS) | Tính commission cho cả 2 theo `performedByUserId`. Verify sum(commission) ≤ revenue. |
| Config thay đổi giữa kỳ | Snapshot config tại `periodStart`. Re-compute trong DRAFT nếu config đổi. |
| Nhiều DentistCompensation cùng hiệu lực trong kỳ | Pro-rate theo số ngày áp dụng mỗi version (BR-PAY-013). |

---

## BD-0010 — Ca làm việc BS: Cố định + Tự đăng ký (cùng tồn tại)

**Date:** 2026-07-15
**Decided by:** Product Owner

### Context

Hiện tại `WorkingSchedule` (module Appointments) định nghĩa ca làm việc cố định do phòng khám ấn định. Tuy nhiên một số BS muốn linh hoạt hơn: tự đăng ký thêm ca mình muốn làm (kiểu freelance, tăng thu nhập), trong khi phòng khám muốn vẫn kiểm soát qua admin duyệt.

### Decision

Hỗ trợ **cả 2 mode** cùng tồn tại:

1. **WorkingSchedule (cố định)** — bảng hiện có, thêm 2 field:
   - `isPaidShift: boolean` (default `true`) — ca này có tính lương không.
   - `shiftType: enum` (`MORNING | AFTERNOON | FULL_DAY | NIGHT`) — phân loại ca.

2. **ShiftRegistration (tự đăng ký)** — bảng mới:
   - BS tạo request: `dentistId, date, startTime, endTime, maxEncounters?, notes?`.
   - Status: `PENDING → APPROVED | REJECTED | CANCELLED`.
   - Admin/Receptionist duyệt (permission `shift.approve`).
   - Sau khi APPROVED → ca có hiệu lực + tính lương (mặc định `isPaidShift = true`).

**Logic union (nguồn ca tính lương):**

```
paid_shifts_for_dentist_d =
  WorkingSchedule WHERE dentist_id = ? AND dayOfWeek = d AND validFrom <= date <= validTo AND isPaidShift = true
  UNION
  ShiftRegistration WHERE dentist_id = ? AND date = d AND status = 'APPROVED'
```

**Conflict rule:** Nếu WorkingSchedule và ShiftRegistration của cùng BS cùng ngày **trùng giờ** → REJECT (422). BS phải chọn 1 mode, không được overlap.

Lý do chọn reject thay vì gộp: tránh "double-dip" (BS đăng ký ca đã có working schedule + ca tự do cùng giờ), giữ audit trail rõ ràng.

### Why

- Phù hợp mô hình lao động linh hoạt của phòng khám tư nhân.
- 1 nguồn dữ liệu cho Appointments + Payroll (qua WorkingSchedule).
- Admin vẫn giữ quyền kiểm soát qua duyệt ShiftRegistration.
- Conflict reject → rõ ràng, dễ giải thích khi BS thắc mắc.

### Impact

**Module Appointments:**

- Thêm field `WorkingSchedule.isPaidShift` (default `true`). Migration an toàn.
- Thêm field `WorkingSchedule.shiftType` (default `FULL_DAY`).
- Bảng mới: `shift_registrations` (10 columns) — xem schema-per-module/appointments.md §6.
- Permission mới:
  - `shift.register` (Dentist) — tạo/ca nhân ca.
  - `shift.approve` (Admin, Receptionist) — duyệt.
  - `shift.read.any` / `shift.read.own` — xem.
- BR mới: BR-APPT-026, BR-APPT-027, BR-APPT-028, BR-APPT-029.

**Module Payroll:**

- Computed field `paidShiftsCount` lấy từ union WorkingSchedule + ShiftRegistration.approved.
- Ca không tính lương nếu: `isPaidShift = false`, status `PENDING/REJECTED/CANCELLED`, hoặc BS không đến (no-show) khi period đã đóng.
- BR-PAY-020: Conflict rule từ BD-0010.
- BR-PAY-021: Ca trong quá khứ mà BS không đến (BS no-show) → không tính lương, optional penalty.

**API mới:** 5 endpoints ShiftRegistration (§5.6 của Appointments SPEC).

**UI mới:**

- Trang Schedule có 2 tab: "Ca cố định" (admin only edit) + "Ca đăng ký" (BS tạo request, admin duyệt).
- Lịch calendar view hiển thị cả 2 loại ca (màu khác nhau).

### Edge cases

| Case | Xử lý |
| ---- | ----- |
| BS đăng ký ca trùng giờ working schedule | 422 "Overlaps with existing working schedule". |
| Admin edit WorkingSchedule → overlap ShiftRegistration đã APPROVED | 422 "BS đã đăng ký ca này". Admin phải cancel ShiftRegistration trước. |
| ShiftRegistration quá khứ (date < hôm nay) | 422 (chỉ cho đăng ký tương lai). |
| BS cancel ShiftRegistration < N giờ trước giờ ca | Admin có thể set penalty (BR-PAY-014). Default: cho phép cancel tự do nhưng audit log "late cancel". |
| WorkingSchedule bị xóa → ShiftRegistration cùng ngày | ShiftRegistration vẫn hợp lệ (đã APPROVED). Payroll compute chỉ dựa union cuối cùng. |
| Ca đã diễn ra nhưng ShiftRegistration vẫn PENDING | Admin không duyệt được nữa (422). Auto-cancel bởi cron job (BR-APPT-029). |

---

## BD-0020 — AI Patient Summary snapshot strategy (Phase 8.0)

### Context
`PRODUCT_VISION.md` nói "AI là first-class citizen" nhưng đến Phase 8 chưa có tính năng AI nào chạy thật. Module AI đầu tiên được chọn: **AI tóm tắt hồ sơ bệnh nhân** (3 bullet: dị ứng / đang chờ / lần tới) cho Dashboard / Reception.

### Decision

1. **Provider:** OpenAI `gpt-4o-mini` (cost thấp, latency tốt, tiếng Việt ổn). Configurable qua `OPENAI_MODEL` env. Thiếu key → service tự `console.warn` + luôn fallback rule-based.
2. **Cache:** Redis 1h. Không persist vào DB. Skip cache qua `?refresh=true` (BS bấm "Làm mới" khi cần).
3. **Snapshot PII-light:** Service chỉ đọc các trường y khoa (allergies, chronicDiseases, currentMedications, top N encounter gần nhất gồm chiefComplaint/diagnosis/treatmentPlanText + list treatment procedure, số encounter `IN_PROGRESS`, số hóa đơn outstanding). **Không bao giờ** gửi tên, ngày sinh, SĐT, CCCD, địa chỉ, notes/raw text.
4. **Prompt:** system prompt cứng tiếng Việt, yêu cầu CHỈ dựa trên dữ liệu cung cấp, mỗi bullet ≤ 25 từ. `response_format: { type: "json_object" }` + `temperature: 0.2` + `max_tokens: 350`.
5. **Fallback rule-based:** khi OpenAI fail (rate-limit, network, JSON parse error) → dựng 3 bullet từ data thô (gộp allergies/chronic, đếm open encounter + outstanding, lấy treatmentPlanText gần nhất). Response trả về với `source: "fallback"` để FE hiện badge khác.
6. **Permission:** tạo mới `ai.summary.read`. Áp cho `clinic_admin` (auto-all), `dentist`, `receptionist`. Assistant không có. Row-level filter: tái dụng pattern BR-PT-014 (dentist chỉ thấy patient của mình — Phase 8.1).
7. **Disclaimer bắt buộc:** UI phải hiện "AI có thể sai, xác nhận lại trước khi dùng" (BR-AI-001).

### Impact
- Module mới: `AiModule` (`backend/src/ai/`).
- Permission mới: `ai.summary.read`.
- BR mới: BR-AI-001 → BR-AI-005.
- API mới: `GET /ai/summary/patient/:id` (xem `docs/05_API/ai.md`).
- FE mới: `frontend/src/features/dashboard/AiSummaryCard.tsx`, chèn ngay sau `KpiRow` ở `DashboardPage`.
- Deps mới: `openai@^4.50.0`, `ioredis@^5.4.1`, `@types/ioredis@^5.0.0`.
- Env mới: `OPENAI_API_KEY`, `OPENAI_MODEL`, `REDIS_URL`.
- Không cần migration DB. Cache ở Redis, không persist.

### Edge cases
| Case | Xử lý |
| --- | --- |
| OpenAI 429 (rate-limit) | Catch error, fallback rule-based, log warning |
| OpenAI trả JSON lỗi (không đúng schema) | Parse fail → fallback rule-based |
| Redis down | Skip cache, gọi LLM thẳng, không fail request |
| Patient chưa có encounter nào | Bullets rỗng → FE hiện EmptyState "Chưa có dữ liệu" |
| Patient có hàng trăm encounter | Chỉ lấy top 5 (config được qua query `top`, max 10) |
| `OPENAI_API_KEY` rỗng lúc deploy | Service log warning 1 lần, mọi request tới trả rule-based, không throw |



# Blueprint: Medical Records Module

> **Loại tài liệu:** Blueprint (khám phá trước spec).
> **Module:** `MedicalRecords` — Hồ sơ y tế, encounter, clinical note, treatment, prescription, dental chart.

---

## Vấn đề

Phòng khám cần:

1. Lưu lại **hồ sơ y tế** đầy đủ sau mỗi lần khám (theo quy định lưu trữ 10 năm).
2. Bác sĩ **xem lịch sử** bệnh nhân trước khi khám.
3. Ghi **clinical note** (chẩn đoán, chỉ định).
4. Ghi **treatment** (phiếu điều trị từng răng).
5. Kê **prescription** (toa thuốc).
6. Cập nhật **dental chart** (sơ đồ tình trạng từng răng theo thời gian).
7. Khi đóng encounter → tự động trừ kho vật tư đã dùng.

## Phạm vi giả định (Assumptions)

- 1 Appointment ↔ 1 Encounter (BD-0002 đã chốt).
- Clinical Note immutable sau khi encounter closed → chỉ thêm **Addendum** (chốt ở Q1).
- Dental Chart mỗi encounter là 1 snapshot JSON (chốt ở Q2).
- Treatment có field `inventoryItemsUsed` → khi encounter closed emit event `EncounterClosed` → Inventory tự trừ kho (chốt ở Q3).
- Dùng Palmer notation cho ký hiệu răng (Glossary đã định nghĩa).
- BS chỉ thấy encounter mình tạo (row-level).
- Lễ tân **không thấy** clinical note/treatment/prescription.
- Patient không thể bị soft-delete nếu còn encounter.

## Câu hỏi cần trả lời (Open Questions)

Sẽ trả lời chi tiết trong SPEC.md:

1. **ICD-10:** Out of scope MVP (xem business-context.md). BS gõ text tự do.
2. **Prescription template:** Có cho lưu "toa mẫu" để reuse không?
3. **Treatment price:** Treatment lưu `unitPrice` để sinh invoice item, hay chỉ sau này mapping?
4. **Dental Chart cho trẻ em:** Auto-detect age → dùng 20 răng sữa hay 32 răng?
5. **History timeline:** UI hiển thị thế nào? Sort by date desc, có filter theo BS?
6. **Addendum visibility:** Addendum hiển thị ngay sau note gốc, hay phân biệt?
7. **Image attachment:** Out of scope MVP (BD-0005).
8. **Treatment → Invoice item:** Auto-mapping (treatment name = service name) hay manual?

## Workflow dự kiến

### Workflow 1: Mở Encounter (từ Appointment)

```mermaid
sequenceDiagram
  participant BS
  participant FE
  participant API
  participant DB

  BS->>FE: Mở waiting queue → chọn BN → click "Vào khám"
  FE->>API: POST /appointments/:id/start (gọi Appointments API)
  API->>DB: Validate appointment status = checked_in
  API->>DB: Validate patient active
  API->>DB: Tạo Encounter (status = in_progress, dentistId = currentUser)
  API->>DB: status appointment → in_progress
  API-->>BS: Encounter + redirect sang encounter screen
```

### Workflow 2: Trong encounter — ghi clinical note

```mermaid
sequenceDiagram
  participant BS
  participant FE
  participant API
  participant DB

  BS->>FE: Tab "Ghi chú lâm sàng"
  BS->>FE: Nhập chief complaint, diagnosis, treatment plan
  FE->>API: PUT /encounters/:id/clinical-note
  API->>API: Validate: status = in_progress, dentist = currentUser
  API->>API: Validate: encounter not closed
  API->>DB: Upsert ClinicalNote
  API-->>BS: 200 ClinicalNote
```

### Workflow 3: Trong encounter — ghi Treatment

```mermaid
sequenceDiagram
  participant BS
  participant FE
  participant API
  participant DB
  participant INV as Inventory

  BS->>FE: Tab "Phiếu điều trị"
  BS->>FE: Chọn răng (UI picker), nhập procedure, unitPrice
  opt Chọn vật tư đã dùng
    BS->>FE: Chọn items từ Inventory
    FE->>API: GET /inventory/items (proxy)
    API-->>FE: danh sách items
    BS->>FE: Chọn items + số lượng
  end
  FE->>API: POST /encounters/:id/treatments
  API->>DB: Tạo Treatment
  API-->>BS: 201 Treatment
```

### Workflow 4: Trong encounter — kê Prescription

```mermaid
sequenceDiagram
  participant BS
  participant FE
  participant API
  participant DB

  BS->>FE: Tab "Toa thuốc"
  BS->>FE: Thêm dòng: drugName, dosage, frequency, duration, notes
  FE->>API: POST /encounters/:id/prescription
  API->>API: Validate ≥ 1 dòng
  API->>DB: Tạo Prescription + PrescriptionLines
  API-->>BS: 201 Prescription
```

### Workflow 5: Trong encounter — cập nhật Dental Chart

```mermaid
sequenceDiagram
  participant BS
  participant FE
  participant API
  participant DB

  BS->>FE: Tab "Sơ đồ răng" → chọn răng → chọn status mới
  FE->>API: PATCH /encounters/:id/dental-chart
  API->>API: Validate: chỉ status chính (vd: healthy/caries/filled/missing/crowned/extracted)
  API->>DB: Cập nhật DentalChartSnapshot trong memory (chưa save)
  FE->>BS: Hiển thị UI với preview
  BS->>FE: Click "Lưu snapshot"
  FE->>API: POST /encounters/:id/dental-chart
  API->>DB: Tạo DentalChartSnapshot (JSON toàn bộ 32/20 răng)
  API-->>BS: 201 Snapshot
```

### Workflow 6: Đóng Encounter

```mermaid
sequenceDiagram
  participant BS
  participant FE
  participant API
  participant DB
  participant EVB as Event Bus
  participant INV as Inventory Module

  BS->>FE: Click "Đóng encounter"
  FE->>API: POST /encounters/:id/close { summary }
  API->>API: Validate: clinicalNote tồn tại, treatment ≥ 0
  API->>API: Validate: encounter đang in_progress, dentist = currentUser
  API->>DB: Update Encounter: status = completed, closedAt = now, summary
  API->>DB: Update Appointment: status = completed
  API->>DB: Audit log
  API->>EVB: Emit "EncounterClosed" { encounterId, patientId, dentistId, inventoryItemsUsed }
  EVB->>INV: Subscribe → tạo stock-out movements
  API-->>BS: 200 Encounter completed
```

### Workflow 7: Addendum (sau khi đóng)

```mermaid
sequenceDiagram
  participant BS
  participant API
  participant DB

  BS->>API: POST /encounters/:id/clinical-note/addendum
  API->>API: Validate: encounter closed
  API->>API: Validate: trong 30 ngày (configurable)
  API->>DB: Tạo ClinicalNoteAddendum (ref originalNote)
  API-->>BS: 201 Addendum
```

### Workflow 8: Xem lịch sử BN

```mermaid
sequenceDiagram
  participant Actor
  participant FE
  participant API
  participant DB

  Actor->>FE: Mở BN detail → tab "Lịch sử khám"
  FE->>API: GET /patients/:id/encounters
  API->>API: Validate permission + row-level
  API->>DB: Query encounter sorted by createdAt DESC
  API-->>FE: Danh sách encounter (id, date, dentist, summary)
  Actor->>FE: Click 1 encounter
  FE->>API: GET /encounters/:id
  API-->>FE: Encounter + ClinicalNote + Treatments + Prescription + DentalChartSnapshot
```

## Màn hình dự kiến

| Màn hình | Mục đích | Actor |
| -------- | -------- | ----- |
| Encounter workspace | Màn hình khám chính (tabs: note/treatment/Rx/chart) | BS |
| Clinical note editor | Rich text cho chief complaint / diagnosis / plan | BS |
| Treatment entry | Chọn răng + procedure + giá + vật tư | BS |
| Prescription editor | Thêm dòng thuốc | BS |
| Dental chart UI | Click răng → chọn status | BS |
| Encounter list | Lịch sử encounter của BN | Lễ tân (rút gọn), BS (full), Admin |
| Encounter detail (read-only) | Xem encounter đã đóng | BS, Lễ tân (chỉ date/dentist), Admin |
| Addendum editor | Thêm addendum cho note cũ | BS (của mình) |

## Entity dự kiến

| Entity | Field chính |
| ------ | ----------- |
| **Encounter** | id, appointmentId (unique), patientId, dentistId, status (in_progress/completed/cancelled), startedAt, closedAt, summary, chiefComplaint, diagnosis, treatmentPlanText |
| **ClinicalNote** | id, encounterId (unique), chiefComplaint, diagnosis, treatmentPlan, notes, createdAt, updatedAt |
| **ClinicalNoteAddendum** | id, clinicalNoteId, content, addedBy, addedAt |
| **Treatment** | id, encounterId, toothNumbers (string[]), procedure (text), description, unitPrice, duration (optional) |
| **TreatmentInventoryUsage** | id, treatmentId, inventoryItemId, quantity, unit (cho stock-out) |
| **Prescription** | id, encounterId (unique), notes, createdAt |
| **PrescriptionLine** | id, prescriptionId, drugName, dosage, frequency, duration, instructions, sequence |
| **DentalChartSnapshot** | id, encounterId (unique), patientType (adult/child), teeth (JSON: { "16": "caries", "17": "filled", ... }), snapshotAt |
| **EncounterAudit** | id, encounterId, action, actorId, before (JSON), after (JSON), occurredAt |

## Rule dự kiến (preview)

| Rule ID | Mô tả |
| ------- | ----- |
| BR-MR-001 | 1 Appointment ↔ 1 Encounter (unique FK) |
| BR-MR-002 | Chỉ BS (dentist) của encounter mới sửa được khi status = in_progress |
| BR-MR-003 | Encounter.status chuyển in_progress → completed là 1 chiều |
| BR-MR-004 | Clinical Note immutable sau khi encounter completed |
| BR-MR-005 | Addendum allowed trong 30 ngày sau encounter closed |
| BR-MR-006 | Dental Chart snapshot = JSON toàn bộ 32 răng (adult) hoặc 20 răng sữa (child) |
| BR-MR-007 | Tooth number format: Palmer hoặc FDI (tự nhận dạng) |
| BR-MR-008 | Tooth status ∈ { healthy, caries, filled, missing, crowned, extracted, root_canal, implant, bridge, partial_denture, watch } |
| BR-MR-009 | Treatment ≥ 0 (có thể encounter không có treatment — vd: chỉ tư vấn) |
| BR-MR-010 | Nếu có Treatment có inventoryItemsUsed → khi đóng encounter phải đủ stock |
| BR-MR-011 | Nếu stock không đủ → KHÔNG đóng encounter, trả lỗi BR-MR-010 |
| BR-MR-012 | Prescription ≥ 1 PrescriptionLine |
| BR-MR-013 | Encounter closed chỉ khi có ClinicalNote |
| BR-MR-014 | Addendum không được sửa (immutable) |
| BR-MR-015 | EncounterAudit chỉ append, không update/delete |
| BR-MR-016 | Auto stock-out khi encounter closed (qua event EncounterClosed) |
| BR-MR-017 | Stock-out atomic với encounter close (transaction) |
| BR-MR-018 | Nếu stock-out fail → encounter KHÔNG đóng (rollback) |
| BR-MR-019 | Dental chart chỉ update khi encounter đang in_progress |
| BR-MR-020 | Treatment.toothNumbers có thể rỗng (cho tư vấn toàn hàm) |
| BR-MR-021 | Treatment.unitPrice ≥ 0 |
| BR-MR-022 | Lễ tân thấy encounter nhưng KHÔNG thấy clinical_note/treatment/prescription |

## API dự kiến

| Endpoint | Method | Permission |
| -------- | ------ | ---------- |
| /encounters/:id | GET | `clinical_note.read` / `treatment.read` / `prescription.read` |
| /encounters/:id/clinical-note | GET / PUT | `clinical_note.read` / `.create` (PUT chỉ khi in_progress) |
| /encounters/:id/clinical-note/addendum | POST | `clinical_note.create` (của mình) |
| /encounters/:id/treatments | GET / POST | `treatment.read` / `.create` |
| /encounters/:id/treatments/:tid | GET / PATCH / DELETE | `treatment.read` / `.update` |
| /encounters/:id/prescription | GET / PUT / DELETE | `prescription.read` / `.create` |
| /encounters/:id/prescription/lines | POST | `prescription.create` |
| /encounters/:id/dental-chart | GET / POST | `dental_chart.read` / `.update` |
| /encounters/:id/close | POST | `encounter.close` |
| /encounters/:id/reopen | POST | admin override |
| /encounters | GET | `encounter.read.*` (any hoặc own) |
| /encounters/:id/audit | GET | admin only |

## Rủi ro & giảm thiểu

| Rủi ro | Giảm thiểu |
| ------ | ---------- |
| BS sửa note sau khi đóng → phá audit | BR-MR-004 + addendum pattern |
| Stock không đủ khi đóng encounter | BR-MR-010/011/018 + transaction |
| Dental chart ghi nhầm răng | UI picker rõ ràng + confirmation trước save |
| Encounter có treatment đè giá | Treatment.unitPrice snapshot tại thời điểm ghi (không tự cập nhật theo service catalog) |
| Cross-module coupling cao | Dùng domain event `EncounterClosed` thay vì gọi trực tiếp Inventory module |
| BS xem encounter của BS khác | Row-level filter; admin có thể xem all |
| Performance load 1 BN có 50+ encounter | Index `(patient_id, started_at DESC)`; paginate encounter list |

---

## Tiếp theo

Viết `SPEC.md` đầy đủ 10 mục.
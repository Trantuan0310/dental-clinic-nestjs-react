# API — Patients Module

> **Module:** Patients
> **Base:** Kế thừa toàn bộ quy ước từ [`api-conventions.md`](./api-conventions.md).
> **Ngày tạo:** 2026-07-13

---

## Base path

```
/api/v1/patients                — CRUD + search
/api/v1/patients/:id/phones     — Phone history
/api/v1/patients/:id/identifiers — External identifiers (CCCD/CMND/Hộ chiếu)
/api/v1/patients/:id/merge      — Merge duplicate action
```

---

## 1. CRUD Patients

### 1.1 `GET /api/v1/patients`

**Auth:** Login required
**Permission:** `patient.read` (Dentist + Receptionist + Admin)

**Query:**
| Param | Type | Default | Description |
| ----- | ---- | :-----: | ----------- |
| `q` | string | — | Search by name/phone/code (full-text + trigram) |
| `status` | enum | `active` | `active` \| `deceased` \| `merged` |
| `gender` | enum | — | `male` \| `female` \| `other` |
| `from` | date | — | Birthdate range start |
| `to` | date | — | Birthdate range end |
| `pageSize` | int | 20 | Up to 100 |
| `cursor` | string | — | Cursor pagination (xem conventions §2.3 — **đã thống nhất dùng cursor** thay vì offset/pagination của SPEC §8.3) |
| `sort` | string | `createdAt:desc` | sort field phải indexed |
| `includeDeleted` | bool | false | Admin only |

**Response 200:**
```json
{
  "data": [
    {
      "id": "uuid",
      "code": "PAT-2026-00045",
      "fullName": "Nguyen Van A",
      "dateOfBirth": "1990-05-15",
      "gender": "male",
      "primaryPhone": "0987654321",
      "lastVisitAt": "2026-07-10T10:00:00Z",
      "tags": ["VIP"],
      "status": "active",
      "createdAt": "2026-01-15T08:00:00Z"
    }
  ],
  "pagination": {
    "pageSize": 20,
    "nextCursor": "uuid",
    "hasMore": true
  }
}
```

> **BR-PT-021 (summary masking):** Nếu caller chỉ có `patient.read` mà không phải admin/receptionist, mask `primaryPhone` thành `0xx****x9` (xem SPEC §6).

---

### 1.2 `POST /api/v1/patients`

**Auth:** Login required
**Permission:** `patient.create` (Receptionist + Admin)

**Rate limit:** 30 req/phút (conventions §4.3)
**Idempotency:** Required (`Idempotency-Key`)

**Request:**
```json
{
  "fullName": "Nguyen Van A",
  "dateOfBirth": "1990-05-15",
  "gender": "male",
  "primaryPhone": "0987654321",
  "email": "patient@example.com",
  "address": {
    "line1": "123 Nguyễn Trãi",
    "line2": "P.5",
    "ward": "...",
    "district": "...",
    "city": "TP.HCM",
    "country": "VN"
  },
  "allergies": ["Penicillin"],
  "medicalHistory": "Asthma nhẹ, 2024",
  "tags": ["VIP"],
  "consentGiven": true
}
```

**Validation:**
- `fullName`: required, 1-200 chars, trim, no HTML tags
- `dateOfBirth`: required, ISO 8601 date, in the past, < 150 years ago
- `gender`: required, enum
- `primaryPhone`: required, regex `^0[0-9]{9,10}$`
- `email`: optional, RFC 5322
- `address.country`: optional, ISO 3166-1 alpha-2 (default `VN`)
- `allergies`, `medicalHistory`: optional, max 2000 chars
- `tags`: optional, max 20 tags, each 1-30 chars
- `consentGiven`: required boolean (BR-PT-018 — phải có consent để xử lý dữ liệu)

**Response 201:**
```json
{
  "data": {
    "id": "uuid",
    "code": "PAT-2026-00046",
    "fullName": "Nguyen Van A",
    "dateOfBirth": "1990-05-15",
    "gender": "male",
    "primaryPhone": "0987654321",
    "email": "patient@example.com",
    "allergies": ["Penicillin"],
    "tags": ["VIP"],
    "status": "active",
    "createdAt": "2026-07-13T10:00:00Z"
  },
  "meta": {
    "codeGenerated": "PAT-2026-00046"
  }
}
```

**Side effects:**
- Generate patient code (BD-0006): nếu fail seed → 503 để admin retry, KHÔNG tạo patient thiếu code (BR-PT-002)
- Ghi vào `patient_phone_history` (xem 2.1)
- Audit: `patient_created` (+ actor_user_id + IP)
- Nếu duplicate detect bật lên (BR-PT-007): xem 1.3

**Response 409 Conflict:**
- "Primary phone already belongs to another patient" (BR-PT-007)
- Trả kèm `duplicateCandidate` để client xác nhận (xem 1.3)

**Response 422:**
- "Consent not given" (BR-PT-018)

---

### 1.3 `POST /api/v1/patients/check-duplicate`

**Auth:** Login required
**Permission:** `patient.create`

**Request:**
```json
{
  "primaryPhone": "0987654321",
  "fullName": "Nguyen Van A"
}
```

**Response 200:**
```json
{
  "data": {
    "isExactPhoneMatch": true,
    "matches": [
      {
        "id": "uuid",
        "code": "PAT-2026-00001",
        "fullName": "Nguyen Van A",
        "dateOfBirth": "1990-05-15",
        "primaryPhone": "0987654321",
        "matchType": "exact_phone",
        "confidence": 1.0
      },
      {
        "id": "uuid",
        "code": "PAT-2025-00099",
        "fullName": "Nguyen Van Anh",
        "primaryPhone": "0987654321",
        "matchType": "phone_and_name",
        "confidence": 0.85
      }
    ]
  }
}
```

**Match types:**
- `exact_phone`: 1.0
- `phone_and_name_exact`: 0.95
- `phone_and_name_fuzzy` (trgm similarity > 0.3): 0.7

**Lưu ý:**
- BR-PT-007: Hệ thống CHỈ CẢNH BÁO, không auto-block tạo. Receptionist xác nhận.
- API này frontend gọi trước khi `POST /patients` để show toast warning.

---

### 1.4 `GET /api/v1/patients/:id`

**Auth:** Login required
**Permission:** `patient.read`

**Path:**
- `id`: UUID v7 của patient

**Response 200:**
```json
{
  "data": {
    "id": "uuid",
    "code": "PAT-2026-00046",
    "fullName": "Nguyen Van A",
    "dateOfBirth": "1990-05-15",
    "age": 36,
    "gender": "male",
    "primaryPhone": "0987654321",
    "additionalPhones": ["0912345678"],
    "email": "patient@example.com",
    "address": { ... },
    "allergies": ["Penicillin"],
    "medicalHistory": "Asthma nhẹ",
    "tags": ["VIP"],
    "status": "active",
    "createdByUserId": "uuid-receptionist",
    "lastVisitAt": "2026-07-10T10:00:00Z",
    "mergedIntoPatientId": null,
    "createdAt": "2026-07-13T10:00:00Z",
    "updatedAt": "2026-07-13T10:00:00Z"
  }
}
```

> **Receptionist vs Dentist view difference:** xem SPEC §6 + audit fix C7/C8.

**Response 404:** patient không tồn tại hoặc `status = merged` (trừ admin)

---

### 1.5 `PATCH /api/v1/patients/:id`

**Auth:** Login required
**Permission:** `patient.update` (Receptionist + Admin)

**Request (subset):**
```json
{
  "fullName": "Nguyen Van A",
  "address": { "city": "Hà Nội" },
  "tags": ["VIP", "Cao_tuổi"],
  "allergies": ["Penicillin", "Aspirin"]
}
```

> **Lưu ý:**
> - ĐỔI `primaryPhone` → phải qua endpoint riêng `PUT /patients/:id/phones/primary` (xem 2.2) — vì nó ghi vào phone history.
> - ĐỔI `dateOfBirth`, `gender` chỉ admin (audit y tế).

**Validation:** xem 1.2

**Response 200:** full patient object

**Side effect:** Audit `patient_updated`

**Response 409:** "Phone belongs to another patient"

---

### 1.6 `GET /api/v1/patients/:id/phones`

**Auth:** Login required
**Permission:** `patient.read`

**Response 200:**
```json
{
  "data": [
    {
      "phone": "0987654321",
      "isPrimary": true,
      "validFrom": "2026-01-15T08:00:00Z",
      "validTo": null,
      "recordedByUserId": "uuid",
      "note": "Initial"
    },
    {
      "phone": "0912345678",
      "isPrimary": false,
      "validFrom": "2026-03-10T10:00:00Z",
      "validTo": "2026-06-15T18:00:00Z",
      "recordedByUserId": "uuid",
      "note": "Đổi SĐT tạm thời khi đi nước ngoài"
    }
  ]
}
```

> **BR-PT-008:** Lưu vĩnh viễn phone history, KHÔNG xóa. SĐT cũ trả về khi receptionist gọi lại.

---

### 1.7 `POST /api/v1/patients/:id/phones`

**Auth:** Login required
**Permission:** `patient.update`

**Request:**
```json
{
  "phone": "0912345678",
  "isPrimary": false,
  "note": "SĐT vợ"
}
```

**Side effect:**
- Validate không trùng với patient khác đang active
- Insert vào `patient_phone_history`
- Nếu `isPrimary = true` → flip primary của patient và update `patients.primary_phone`

**Response 201:** phone object

**Response 409:** "Phone belongs to another patient"

---

### 1.8 `PUT /api/v1/patients/:id/phones/primary`

**Auth:** Login required
**Permission:** `patient.update`

**Request:**
```json
{
  "phone": "0987654321",
  "note": "Khôi phục SĐT chính"
}
```

**Side effect:**
- Validate phone đã tồn tại trong phone history của patient
- Mark old primary `validTo = now()`
- New primary `isPrimary = true`
- Update `patients.primary_phone`

**Response 200:** phone object

---

### 1.9 `GET /api/v1/patients/:id/encounters`

**Auth:** Login required
**Permission:** `patient.read` + `encounter.read` (cross-module check)

> **Lưu ý:** Encounter module có endpoint của riêng nó, đây là helper từ patient context để xem lịch sử khám nhanh.

**Response 200:**
```json
{
  "data": [
    {
      "id": "uuid-encounter",
      "occurredAt": "2026-07-10T10:00:00Z",
      "dentistName": "BS. Trần Thị B",
      "chiefComplaint": "Đau răng 26",
      "status": "closed",
      "isLocked": true
    }
  ],
  "pagination": { ... }
}
```

---

### 1.10 `GET /api/v1/patients/:id/invoices`

Tương tự 1.9 — cross-module helper. Xem API Billing §5.

---

### 1.11 `DELETE /api/v1/patients/:id`

**Auth:** Login required
**Permission:** `patient.deactivate` (Admin only — Receptionist không được xóa)

> BR-PT-016: Patient KHÔNG BAO GIỜ bị hard-delete. Status → `merged` hoặc record lý do đặc biệt vào audit.

**Request:**
```json
{ "reason": "Duplicate with PAT-2025-00099" }
```

**Side effect:**
- Set `status = merged`
- Set `merged_into_patient_id` (nếu merge) — xem 1.12
- Soft-delete patient
- Audit `patient_deactivated` / `patient_merged`
- Cascade: appointments/invoices/encounters của patient remain (FK không nullable)

**Response 204**

**Response 409:**
- "Cannot delete patient with active treatment in progress"

---

### 1.12 `POST /api/v1/patients/:id/merge`

**Auth:** Login required
**Permission:** `patient.merge` (Admin only)

**Request:**
```json
{
  "intoPatientId": "uuid-target",
  "reassignments": {
    "appointments": true,
    "invoices": true,
    "encounters": true,
    "mergePhones": true
  },
  "note": "Bệnh nhân trùng SĐT"
}
```

**Side effect:**
- Tất cả FK của patient nguồn → reassign sang patient đích
- Phone history → copy sang đích (BR-PT-007 — giữ lịch sử)
- Source patient → status = `merged`, `merged_into_patient_id = target`
- Audit `patient_merged`

**Response 200:**
```json
{
  "data": {
    "mergedPatientId": "uuid-source",
    "intoPatientId": "uuid-target",
    "reassignedCounts": {
      "appointments": 5,
      "encounters": 12,
      "invoices": 8,
      "phones": 2
    }
  }
}
```

**Atomic:** Toàn bộ trong 1 transaction (BR-PT-007 + ADR-0007/0008 pattern)

---

## 2. Validation rules (Patients-specific)

| Field | Rule |
| ----- | ---- |
| `fullName` | 1-200 chars, trim, không chứa HTML |
| `primaryPhone` | `^0[0-9]{9,10}$`, unique trong active patient |
| `additionalPhones` | cùng regex |
| `dateOfBirth` | ISO date, in past, age < 150 |
| `email` | RFC 5322, optional |
| `tags` | max 20, mỗi tag 1-30 chars |
| `medicalHistory` | max 2000 chars |
| `allergies` | array of string, mỗi string 1-100 chars |
| `address.country` | ISO 3166-1 alpha-2 |
| `consentGiven` | required true (BR-PT-018) |

---

## 3. Error responses (Patients-specific)

| Status | Title | Khi nào |
| :----: | ----- | ------- |
| 409 | Patient code conflict | Race condition 2 receptionist tạo cùng code (xử lý retry) |
| 409 | Phone belongs to another patient | BR-PT-007 |
| 409 | Cannot delete active patient | BR-PT-016 |
| 409 | Merge conflict | Source và target là patient khác nhau hoặc đã merged |
| 422 | Consent not given | BR-PT-018 |
| 422 | Phone-format invalid | Regex |
| 503 | Code generator unavailable | BR-PT-002 fallback |

---

## 4. Cross-module interactions

| Action | Cascade event |
| ------ | ------------- |
| Patient soft-deleted | Không cascade — FK keep cho lịch sử |
| Patient merge | Update FK ở appointments, encounters, invoices, phones |
| Patient primary phone đổi | `patient_phone_history` + update `patients.primary_phone` |

---

## 5. Idempotency

| Endpoint | Required? |
| -------- | :-------: |
| `POST /patients` | ✅ |
| `POST /patients/check-duplicate` | Optional |
| `POST /patients/:id/merge` | ✅ |
| `POST /patients/:id/phones` | Optional |

---

## 6. Audit log (BR-AUTH-017 mapping cho Patients)

| Action | Trigger |
| ------ | ------- |
| `patient_created` | POST /patients |
| `patient_updated` | PATCH /patients/:id |
| `patient_deactivated` | DELETE /patients/:id |
| `patient_merged` | POST /patients/:id/merge |
| `patient_phone_added` | POST /patients/:id/phones |
| `patient_primary_phone_changed` | PUT /patients/:id/phones/primary |

---

## Related

- [api-conventions.md](./api-conventions.md) — quy ước chung
- [SPEC Patients](../03_Specification/Patients/SPEC.md) — đầy đủ BR
- [BD-0006: Patient code](../01_Architecture/business-decisions.md#bd-0006)
- [BD-0007: Duplicate detection](../01_Architecture/business-decisions.md#bd-0007)
- [Schema Patients](../04_Database/schema-per-module/patients.md)
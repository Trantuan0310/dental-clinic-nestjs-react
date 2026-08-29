# AI Module API

> **Status:** Implemented (Phase 8.0 — AI Patient Summary). Updated 2026-08-03.
>
> Endpoint đầu tiên của module AI: tóm tắt hồ sơ bệnh nhân (3 bullet ngắn) cho Dashboard / Reception. Gọi Gemini Pro, cache Redis 1h, fallback rule-based.

## 1. Endpoints

### 1.1 `GET /ai/summary/patient/:id`

AI tóm tắt hồ sơ bệnh nhân: 3 bullet ngắn (dị ứng, đang chờ, lần tới).

| Mục | Giá trị |
| --- | --- |
| Auth | `Bearer <jwt>` |
| Permission | `ai.summary.read` |
| Idempotent | ✅ |
| Cache | Redis 1h, key `ai:patient:{patientId}:top{N}` |

**Query params**

| Tên | Kiểu | Mặc định | Mô tả |
| --- | --- | --- | --- |
| `top` | int 1..10 | 5 | Số encounter gần nhất dùng để tóm tắt |
| `refresh` | bool | false | `true` = bỏ qua cache, gọi lại LLM |

**Response 200**

```json
{
  "data": {
    "patientId": "018f3b8e-...",
    "generatedAt": "2026-07-25T10:30:00.000Z",
    "source": "gemini",
    "model": "gemini-3.6-flash",
    "bullets": [
      { "id": "allergy", "icon": "alert",       "label": "Dị ứng", "text": "Penicillin, latex" },
      { "id": "open",    "icon": "clock",       "label": "Đang chờ", "text": "1 phiên khám đang mở" },
      { "id": "next",    "icon": "stethoscope", "label": "Lần tới", "text": "Tái khám sau 2 tuần — lấy mão răng 26" }
    ],
    "asOf": { "encounterCount": 7, "lastVisitAt": "2026-07-15" },
    "cached": false
  }
}
```

**Trường hợp lỗi**

| Code | Khi nào |
| --- | --- |
| 401 | Thiếu / sai JWT |
| 403 | Không có permission `ai.summary.read` |
| 404 | Patient không tồn tại hoặc đã xóa mềm |
| 502 | LLM fail **và** rule-based cũng trả về rỗng (rất hiếm) |

## 2. Snapshot gửi tới LLM (PII-light)

Service chỉ đọc các field sau từ Prisma:

- `Patient.allergies`, `Patient.chronicDiseases`, `Patient.currentMedications` (mảng string).
- Top N encounter (mặc định 5): `chiefComplaint`, `diagnosis`, `treatmentPlanText`, `status`, list treatment `{ procedure, description }`.
- Số encounter đang `IN_PROGRESS`.
- Số hóa đơn có `outstandingAmount > 0`.

**Không bao giờ gửi:** tên bệnh nhân, ngày sinh, địa chỉ, SĐT, CCCD, notes/raw text. Chỉ gửi các trường y khoa liệt kê ở trên.

## 3. Prompt design

System prompt bắt buộc:

> Bạn là trợ lý y khoa nha khoa. Tóm tắt hồ sơ bệnh nhân thành tối đa 3 bullet ngắn gọn bằng tiếng Việt.
> Mỗi bullet tối đa 25 từ. CHỈ được dựa trên dữ liệu được cung cấp.
> Nếu không có thông tin, trả về chuỗi rỗng "". Trả về JSON đúng schema:
> `{"allergy": string, "open": string, "next": string}`.

| Tham số Gemini | Giá trị |
| --- | --- |
| `model` | `gemini-3.6-flash` (override qua env `GEMINI_MODEL`) |
| `temperature` | 0.2 |
| `maxOutputTokens` | 350 |
| `responseMimeType` | `application/json` |

## 4. Cache

- Key: `ai:patient:{patientId}:top{N}`.
- TTL: 3600s.
- Skip cache khi `refresh=true`.
- Redis fail → log warning, gọi thẳng LLM (không fail request).

## 5. Fallback rule-based

Khi Gemini fail hoặc thiếu `GEMINI_API_KEY`, service tự dựng bullet từ data:

| Bullet | Nguồn |
| --- | --- |
| `allergy` | Gộp `allergies` + `chronicDiseases` + `currentMedications` thành 1 câu |
| `open` | Đếm encounter `IN_PROGRESS` + outstanding invoice |
| `next` | `treatmentPlanText` của encounter gần nhất, fallback `diagnosis`/`chiefComplaint` |

Response trả về với `source: "fallback"` để FE hiện badge khác.

## 6. Business Rules (BR-AI)

| ID | Mô tả |
| --- | --- |
| BR-AI-001 | AI chỉ hỗ trợ. Mọi thông tin từ AI phải được BS xác nhận trước khi dùng. UI phải hiện disclaimer. |
| BR-AI-002 | Không gửi PII (tên, ngày sinh, SĐT, CCCD, địa chỉ) tới LLM. Chỉ gửi PII-light y khoa. |
| BR-AI-003 | Khi LLM fail, fallback rule-based là bắt buộc. Response trả về với `source: "fallback"`. |
| BR-AI-004 | Cache 1h. Khi patient thay đổi thông tin, summary có thể stale tối đa 1h. |
| BR-AI-005 | Permission `ai.summary.read` được gán cho `clinic_admin`, `dentist`, `receptionist`. `assistant` không có. |

## 7. Tests

- Unit: `AiService.getPatientSummary()` — happy path + fallback (mock Gemini fail).
- E2E: gọi endpoint với JWT, assert 200 + 3 bullet; gọi không có permission → 403; gọi với `refresh=true` → bỏ cache.
- Không cần test Gemini thật trong CI — mock qua `vi.spyOn(AiService.prototype, 'callGemini')`.

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

- Soạn nháp: `ai-assist.service.spec.ts` (16 test: phân quyền, dự phòng, prompt không chứa tên/SĐT, lưu đệm), E2E `ai-assist.spec.ts` (thẻ nhận xét trên trang Báo cáo).

- Unit: `AiService.getPatientSummary()` — happy path + fallback (mock Gemini fail).
- E2E: gọi endpoint với JWT, assert 200 + 3 bullet; gọi không có permission → 403; gọi với `refresh=true` → bỏ cache.
- Không cần test Gemini thật trong CI — mock qua `vi.spyOn(AiService.prototype, 'callGemini')`.

## 8. Soạn nháp cho ba vai trò

Ba endpoint dưới đây chỉ **soạn nháp**: không ghi vào bệnh án, không gửi tin, không đổi dữ liệu nào. Người dùng đọc, sửa, rồi lưu hoặc gửi bằng chức năng sẵn có. Cả ba dùng chung cấu hình mô hình với tóm tắt hồ sơ (`AI_BASE_URL` hoặc `GEMINI_API_KEY`, lớp `AiModel`) và đều có câu trả lời dự phòng (`source: "fallback"`) khi chưa cấu hình mô hình hoặc mô hình lỗi. Không thêm quyền mới: mỗi endpoint dùng quyền của chức năng nó phục vụ.

| Endpoint | Vai trò | Quyền | Đầu vào | Gửi cho mô hình |
| --- | --- | --- | --- | --- |
| `POST /ai/drafts/clinical-note` | Bác sĩ | `clinical_note.write` (phiên của chính mình, đang mở) | `{ encounterId, text }` | Chỉ ghi nhanh bác sĩ gõ |
| `POST /ai/drafts/message` | Lễ tân | `appointment.read.any` hoặc `recall.read` / `recall.manage` | `{ kind, appointmentId?, recallId?, customerMessage?, staffNote? }` | Giờ hẹn, bác sĩ, dịch vụ / dịch vụ tái khám, hạn; thông tin phòng khám; tin nhắn khách (khi trả lời). **Không** có tên, SĐT bệnh nhân |
| `GET /ai/report-commentary?from&to&refresh` | Quản lý | `report.revenue.read` | Khoảng ngày của trang Báo cáo | Số tổng: doanh thu, thực thu, chi, lượt khám, hủy lịch, công nợ, top dịch vụ, doanh thu theo bác sĩ, số vật tư dưới mức tối thiểu |

### 8.1 Ghi chú khám từ ghi nhanh

Trả về `{ chiefComplaint, diagnosis, treatmentPlan, notes, source, model? }`. Phiên khám đã đóng → 400 (sửa bằng addendum). Phiên của bác sĩ khác → 404. Dự phòng: giữ nguyên ghi nhanh trong `notes`. Giao diện: tab Ghi chú → "AI soạn từ ghi nhanh"; bấm "Thêm vào ghi chú" thì mỗi phần không trống được nối vào phần tương ứng qua `PUT /encounters/:id/clinical-note` (`appendNote`, `appendTo`).

### 8.2 Tin nhắn gửi khách

`kind`: `appointment_reminder` (cần `appointmentId`), `recall_reminder` (cần `recallId`), `reply` (cần `customerMessage`, có thể kèm `appointmentId`/`recallId` để biết là khách nào). Mô hình viết `{ten}` ở chỗ xưng hô; máy chủ thay bằng "chị Lan" / "anh Minh" / "quý khách" theo giới tính và tên. Trả về `{ text, phone, source, model? }`. Hệ thống **không gửi** tin: giao diện có nút Sao chép, Mở Zalo (`zalo.me/<sđt>`), Gọi. Dự phòng: câu mẫu với cùng dữ kiện. Giao diện: ngăn chi tiết lịch hẹn và trang Nhắc tái khám → "AI soạn tin".

### 8.3 Nhận xét báo cáo

Trả về `{ from, to, points[3..6], facts, generatedAt, source, model?, cached }`. Lưu đệm 1 giờ theo khoảng ngày (`ai:report:<from>:<to>`), `refresh=true` để soạn lại. Dự phòng: các câu nêu thẳng số liệu. Giao diện: trang Báo cáo → thẻ "AI nhận xét kỳ báo cáo", chỉ gọi khi bấm.

### 8.4 Quy tắc

| ID | Mô tả |
| --- | --- |
| BR-AI-006 | Bản nháp AI không bao giờ tự lưu hoặc tự gửi; người dùng phải bấm lưu/gửi bằng chức năng thường (áp dụng đủ quy tắc nghiệp vụ và nhật ký của chức năng đó). |
| BR-AI-007 | Mỗi lần soạn ghi chú / tin nhắn ghi nhật ký `AI_NOTE_DRAFTED` / `AI_MESSAGE_DRAFTED` (nguồn, loại; không lưu nội dung). |
| BR-AI-008 | Nhận xét báo cáo chỉ dùng số tổng; không gửi bệnh nhân nào cho mô hình. |

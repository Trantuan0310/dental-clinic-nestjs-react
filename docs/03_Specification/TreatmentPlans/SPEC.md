# SPEC — Treatment Plans Module (Kế hoạch điều trị nhiều buổi)

> **Module:** `TreatmentPlans`
> **Ngày tạo:** 2026-10-22
> **Trạng thái:** Đã triển khai (Phần 4.1, `docs/progress/plan-2026-10-22.md`)
> **Phiên bản:** 1.0

---

## Tổng quan nhanh

| Phần | Tóm tắt |
| ---- | ------- |
| Purpose | Lập kế hoạch điều trị nhiều buổi có báo giá, ghi nhận khách đồng ý, theo dõi đã làm / còn lại |
| Phụ thuộc | Patients, Users (bác sĩ), Catalog (dịch vụ, giá phân công) |
| Được dùng bởi | MedicalRecords: thủ thuật trong phiên khám có thể thực hiện một mục kế hoạch |
| Permission | `treatment_plan.read`, `treatment_plan.write`, `treatment_plan.accept` |
| Code | `backend/src/treatment-plans/`, `frontend/src/features/treatment-plans/` |
| Migration | `053_treatment_plans` |

---

## 1. Luồng nghiệp vụ

1. Bác sĩ (hoặc admin) lập kế hoạch cho bệnh nhân: tiêu đề, ghi chú, các mục (dịch vụ hoặc nhập tay, răng FDI, số lượng, đơn giá báo). Có thể lập từ hồ sơ bệnh nhân hoặc từ phiên khám (`sourceEncounterId`).
2. **Báo giá** cho khách: `DRAFT → PROPOSED`. In báo giá từ trang kế hoạch.
3. **Khách đồng ý** (lễ tân, bác sĩ hoặc admin ghi nhận, kèm ghi chú): `DRAFT | PROPOSED → ACCEPTED`.
4. Trong phiên khám, khi thêm thủ thuật, bác sĩ chọn một mục còn lại của kế hoạch: tên, răng, số lượng, đơn giá được điền theo kế hoạch.
5. Kết thúc phiên khám: các mục được ghi trong phiên chuyển `DONE`; kế hoạch chuyển `IN_PROGRESS`, hoặc `COMPLETED` khi không còn mục chưa làm. Mở lại phiên khám thì các mục trở về `PLANNED` và trạng thái kế hoạch tính lại.
6. Mục khách không làm nữa: **bỏ qua** (có lý do), có thể **làm lại**. Nhu cầu mới phát sinh: **thêm mục** vào kế hoạch đã đồng ý.
7. **Huỷ** kế hoạch (có lý do) khi chưa xong.
8. Từ kế hoạch đã đồng ý còn mục chưa làm: nút **Đặt lịch buổi tiếp** mở form đặt lịch với bệnh nhân và bác sĩ của kế hoạch.

## 2. Trạng thái

| Kế hoạch | Ý nghĩa |
| -------- | ------- |
| `DRAFT` | Nháp, sửa tự do |
| `PROPOSED` | Đã báo giá cho khách |
| `ACCEPTED` | Khách đồng ý, chưa mục nào làm |
| `IN_PROGRESS` | Đã làm ít nhất một mục, còn mục chưa làm |
| `COMPLETED` | Có mục đã làm và không còn mục chưa làm |
| `CANCELLED` | Đã huỷ |

| Mục | Ý nghĩa |
| --- | ------- |
| `PLANNED` | Chưa làm |
| `DONE` | Đã làm (phiên khám thực hiện đã kết thúc) |
| `SKIPPED` | Bỏ qua, có lý do |

## 3. Business Rules

| Mã | Quy tắc |
| -- | ------- |
| BR-TP-001 | Mục kế hoạch: tên thủ thuật 2–200 ký tự; đơn giá là số đồng nguyên 0 – 10 tỷ; số lượng 1–100; răng là số FDI hợp lệ (để trống = cả hàm). Tối đa 60 mục. |
| BR-TP-002 | Bác sĩ chỉ xem kế hoạch của bệnh nhân mình được xem, chỉ lập/sửa kế hoạch của chính mình; kế hoạch bác sĩ lập luôn đứng tên bác sĩ đó. Bác sĩ không chuyển kế hoạch cho bác sĩ khác. |
| BR-TP-003 | Sửa đồng thời: mỗi lần sửa gửi kèm `expectedUpdatedAt`; bản cũ bị từ chối 409 `PLAN_STALE`. |
| BR-TP-004 | Chỉ sửa các mục khi `DRAFT` hoặc `PROPOSED`. Sửa mục của kế hoạch `PROPOSED` đưa nó về `DRAFT`. Sau khi khách đồng ý, mục đã báo giá bị khoá: chỉ thêm mục mới hoặc bỏ qua. |
| BR-TP-005 | Báo giá cần kế hoạch nháp có ít nhất một mục; ghi nhận đồng ý cần kế hoạch nháp hoặc đã báo giá có ít nhất một mục. |
| BR-TP-006 | Thủ thuật chỉ thực hiện được mục `PLANNED` của kế hoạch `ACCEPTED`/`IN_PROGRESS` thuộc đúng bệnh nhân của phiên khám (`PLAN_ITEM_NOT_WORKABLE`), và mỗi mục chỉ một thủ thuật còn hiệu lực (`PLAN_ITEM_TAKEN`; thủ thuật trong phiên khám đã huỷ không tính). |
| BR-TP-007 | Giá đã báo trong kế hoạch là giá chốt của thủ thuật đó; ghi giá khác cần `treatment.price_override` và lý do, như giá đặt lịch (quyết định 3). |
| BR-TP-008 | Kết thúc phiên khám đánh dấu `DONE` các mục được thực hiện; mở lại phiên khám trả chúng về `PLANNED`. Trạng thái kế hoạch tính theo BR §2. |
| BR-TP-009 | Không bỏ qua mục đang được ghi trong một phiên khám chưa đóng (xoá thủ thuật đó trước). Bỏ qua cần lý do ≥ 5 ký tự. |
| BR-TP-010 | Huỷ cần lý do ≥ 5 ký tự; không huỷ kế hoạch đã xong hoặc đã huỷ. |
| BR-TP-011 | Mọi thao tác ghi nhật ký: `TREATMENT_PLAN_CREATED`, `_UPDATED`, `_PROPOSED`, `_ACCEPTED`, `_CANCELLED`, `_ITEMS_ADDED`, `_ITEM_SKIPPED`, `_ITEM_UNSKIPPED`. |

## 4. Quyền

| Việc | Admin | Lễ tân | Bác sĩ |
| ---- | :---: | :----: | :----: |
| Xem, in báo giá (`treatment_plan.read`) | ✅ | ✅ | 🔒 bệnh nhân mình được xem |
| Lập, sửa, báo giá, thêm/bỏ qua mục, huỷ (`treatment_plan.write`) | ✅ | ❌ | 🔒 kế hoạch của mình |
| Ghi nhận khách đồng ý (`treatment_plan.accept`) | ✅ | ✅ | 🔒 bệnh nhân mình được xem |

## 5. API (`/api/v1/treatment-plans`)

| Method | Path | Quyền | Ghi chú |
| ------ | ---- | ----- | ------- |
| GET | `/?patientId=` | read | Kế hoạch của bệnh nhân, mới nhất trước |
| GET | `/open-items?patientId=` | read | Mục còn làm được (cho phiên khám) |
| GET | `/:id` | read | Kế hoạch kèm mục và tổng tiền (`quoted`, `done`, `remaining`, `skipped`) |
| POST | `/` | write | Lập kế hoạch |
| PATCH | `/:id` | write | Sửa (cần `expectedUpdatedAt`) |
| POST | `/:id/propose` | write | Báo giá |
| POST | `/:id/accept` | accept | Khách đồng ý (`note` tuỳ chọn) |
| POST | `/:id/cancel` | write | Huỷ (`reason`) |
| POST | `/:id/items` | write | Thêm mục vào kế hoạch đã đồng ý |
| POST | `/:id/items/:itemId/skip` | write | Bỏ qua (`reason`) |
| POST | `/:id/items/:itemId/unskip` | write | Làm lại mục đã bỏ qua |

Thủ thuật trong phiên khám: `POST /medical-records/encounters/:id/treatments` nhận thêm `planItemId`.

## 6. Giao diện

- Hồ sơ bệnh nhân: tab **Kế hoạch điều trị** (danh sách, nút Lập kế hoạch).
- `/treatment-plans/new?patientId=&encounterId=`: lập kế hoạch; `/treatment-plans/:id`: xem, sửa, báo giá, đồng ý, thêm/bỏ qua mục, huỷ, in báo giá, đặt lịch buổi tiếp.
- Phiên khám, tab Điều trị: ô **Từ kế hoạch điều trị** khi thêm thủ thuật; nút **Lập kế hoạch**.

## 7. Kiểm thử

- `backend/src/treatment-plans/treatment-plans.service.spec.ts`, `medical-records.service.spec.ts` (liên kết thủ thuật ↔ mục kế hoạch).
- E2E `frontend/e2e/flow-treatment-plan.spec.ts`.

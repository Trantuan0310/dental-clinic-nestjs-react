# SPEC — Recalls Module (Nhắc tái khám định kỳ)

> **Module:** `Recalls`
> **Ngày tạo:** 2026-10-23
> **Trạng thái:** Đã triển khai (Phần 4.2, `docs/progress/plan-2026-10-22.md`)
> **Phiên bản:** 1.0

---

## Tổng quan nhanh

| Phần | Tóm tắt |
| ---- | ------- |
| Purpose | Nhắc bệnh nhân quay lại khám định kỳ (vd. cạo vôi 6 tháng): lễ tân gọi, hệ thống gửi email một lần |
| Phụ thuộc | Catalog (chu kỳ theo dịch vụ), MedicalRecords (đóng / mở lại phiên khám), Patients |
| Permission | `recall.read`, `recall.manage` |
| Code | `backend/src/recalls/`, `frontend/src/features/recalls/` |
| Migration | `054_recalls` |

## 1. Luồng nghiệp vụ

1. Admin đặt **chu kỳ tái khám (tháng)** cho dịch vụ trong Danh mục dịch vụ (để trống = không nhắc).
2. Đóng phiên khám có dịch vụ đó: lượt nhắc đang mở của bệnh nhân cho dịch vụ này chuyển `DONE` (bệnh nhân đã quay lại); tạo lượt nhắc mới đến hạn = ngày khám (giờ phòng khám) + chu kỳ. Mở lại phiên khám: xoá lượt nhắc phiên đó tạo, mở lại lượt nó đã đóng.
3. Hằng ngày 09:10 (giờ phòng khám): bệnh nhân đến hạn, có email, chưa từ chối, chưa có lịch hẹn sắp tới → **một email** (gộp nhiều dịch vụ cùng đến hạn) có link đặt lịch và link ngừng nhận.
4. Lễ tân mở **Nhắc tái khám**: danh sách cần gọi (đến hạn trong N ngày, hoặc đến ngày gọi lại), thấy lịch hẹn sắp tới nếu có, tình trạng email. Ghi kết quả gọi: *Đã đặt lịch*, *Hẹn gọi lại* (ngày), *Không liên lạc được* (giữ trong danh sách), *Bỏ nhắc* (lý do). Có thể ghi bệnh nhân không muốn nhận email.
5. Bệnh nhân bấm link ngừng nhận → trang xác nhận → bấm **Ngừng nhận** (mở link không tự huỷ, tránh máy quét thư).

## 2. Trạng thái

| Trạng thái | Ý nghĩa |
| ---------- | ------- |
| `PENDING` | Chờ gọi (kể cả đã gọi không được) |
| `POSTPONED` | Hẹn gọi lại vào `postponed_until` |
| `BOOKED` | Lễ tân ghi đã đặt lịch (ra khỏi danh sách cần gọi) |
| `DISMISSED` | Bỏ nhắc, có lý do |
| `DONE` | Bệnh nhân đã quay lại khám dịch vụ đó |

## 3. Business Rules

| Mã | Quy tắc |
| -- | ------- |
| BR-RC-001 | Chu kỳ 1–60 tháng; cộng tháng theo lịch, ngày cuối tháng thì lấy ngày cuối của tháng đích (31/08 + 6 tháng = 28/02). |
| BR-RC-002 | Mỗi bệnh nhân + dịch vụ có tối đa một lượt nhắc đang mở (`PENDING`, `POSTPONED`, `BOOKED`) — chỉ mục duy nhất một phần trong DB. |
| BR-RC-003 | Email nhắc gửi tối đa một lần mỗi lượt, giành quyền gửi bằng ghi có điều kiện; máy chủ thư không nhận thì nhả ra cho lần chạy sau. Không gửi khi `APPOINTMENT_EMAIL_NOTICES=false` hoặc email chưa cấu hình. |
| BR-RC-004 | Không gửi email cho bệnh nhân đã có lịch hẹn sắp tới (SCHEDULED, CONFIRMED, CHECKED_IN, IN_PROGRESS) hoặc đã từ chối nhận. |
| BR-RC-005 | Link ngừng nhận dùng mã ngẫu nhiên, chỉ lưu bản băm SHA-256; mã sai trả 404. |
| BR-RC-006 | Ghi kết quả chỉ trên lượt đang chờ gọi (`PENDING`, `POSTPONED`); hẹn gọi lại cần ngày sau hôm nay; bỏ nhắc cần lý do ≥ 3 ký tự. |
| BR-RC-007 | Mở lại lượt đã đặt lịch / đã bỏ về `PENDING`; không mở lại lượt đã bỏ khi đã có lượt khác đang mở cho cùng dịch vụ. |
| BR-RC-008 | Gộp hồ sơ: lượt nhắc của hồ sơ nguồn chuyển sang hồ sơ đích; trùng dịch vụ đang mở thì giữ của hồ sơ đích, đóng của nguồn. Từ chối nhận email ở một trong hai hồ sơ thì giữ. |
| BR-RC-009 | Nhật ký: `RECALL_CONTACTED`, `RECALL_REOPENED`, `RECALL_OPTED_OUT` (qua quầy hoặc link email), `RECALL_OPTED_IN`. |

## 4. Quyền

| Việc | Admin | Lễ tân | Bác sĩ |
| ---- | :---: | :----: | :----: |
| Xem danh sách nhắc (`recall.read`) | ✅ | ✅ | ❌ |
| Ghi kết quả gọi, mở lại, bật/tắt email nhắc (`recall.manage`) | ✅ | ✅ | ❌ |
| Đặt chu kỳ tái khám cho dịch vụ | quyền sửa dịch vụ hiện có | — | — |

## 5. API

| Method | Path | Quyền |
| ------ | ---- | ----- |
| GET | `/recalls?scope=due\|booked\|closed&days=&q=` | recall.read |
| POST | `/recalls/:id/contact` `{result, postponedUntil?, note?}` | recall.manage |
| POST | `/recalls/:id/reopen` | recall.manage |
| POST | `/recalls/patients/:patientId/opt-out` `{optOut}` | recall.manage |
| POST | `/public/recalls/unsubscribe` `{token}` | công khai, 10 lần/phút |

Dịch vụ: `recallIntervalMonths` trong tạo / sửa dịch vụ.

## 6. Kiểm thử

- `backend/src/recalls/recalls.service.spec.ts` (lập lịch, hoàn tác, ghi kết quả, gửi email, ngừng nhận), `patients.service.spec.ts` (gộp hồ sơ).
- Chạy thử trên DB demo bằng Playwright (xem `session-log.md`).

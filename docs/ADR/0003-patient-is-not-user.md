# ADR-0003 — Patient (bệnh nhân) KHÔNG phải User hệ thống

> **Status:** Accepted
> **Date:** 2026-07-12
> **Context:** Quyết định bản sắc của thực thể cốt lõi

---

## Context

Trong hầu hết phần mềm, "người dùng" thường được mô hình thành một bảng `Users` duy nhất. Tuy nhiên, với phòng khám nha khoa, **bệnh nhân** có bản chất rất khác với **nhân viên**.

## Decision

**Patient ≠ User.** Hai khái niệm này thuộc hai aggregate (bounded context) khác nhau:

- **User** (trong module Auth): đại diện cho người có thể **đăng nhập** vào hệ thống (admin, receptionist, dentist). Có password, refresh token, role, permission.
- **Patient** (trong module Patients): đại diện cho **người được quản lý** — bệnh nhân đến khám, có lịch sử điều trị, có hồ sơ nha khoa. **KHÔNG có tài khoản đăng nhập.**

## Rationale

### Lý do nghiệp vụ

1. **Bệnh nhân không đăng nhập.** Họ đến phòng khám, gặp lễ tân, gặp bác sĩ. Không có email/password.
2. **PII của bệnh nhân nhạy cảm hơn.** Hồ sơ y tế cần chế độ bảo vệ riêng (mã hóa, audit chi tiết hơn).
3. **Vòng đời khác nhau.** User có thể bị suspend/xóa khi nghỉ việc. Patient tồn tại mãi mãi (lưu trữ lịch sử).
4. **Tích hợp sau này.** Khi có cổng bệnh nhân (patient portal) — lúc đó có thể tạo `PatientAccount` riêng, không phải `User`.

### Lý do kỹ thuật

1. **Pha trộn làm ô nhiễm Auth.** Auth concern (token, role, lock-out) đã đủ phức tạp; thêm PII y tế vào sẽ khó audit.
2. **Permission grid rất khác.** User có 3-5 role. Patient có hàng chục/nhiều field nhạy cảm, ai được xem phải audit kỹ.
3. **Số lượng chênh lệch cực lớn.** User vài chục, Patient hàng nghìn → trộn vào một bảng sẽ nặng và khó partition khi scale.

### Lý do AI

Khi AI đọc code, nó sẽ thấy `User` là `User` (auth) và `Patient` là `Patient` (medical entity). Hai concept tách rời → AI ít "hiểu nhầm".

## Hệ quả

### Cấm

- ❌ Không có `User.patientId` hoặc quan hệ `User → Patient` một-một.
- ❌ Không dùng bảng `Users` để lưu bệnh nhân.
- ❌ Không cấp "role patient" — không tồn tại.

### Được phép (sau MVP)

- ✅ Bảng `PatientAccount` riêng cho cổng bệnh nhân online (nếu có).
- ✅ Patient có thể có `User` mapping 1-1 chỉ khi trở thành nhân viên (hiếm).

### Mapping giữa hai bảng

- `Appointment.patientId` → reference `Patient.id`, KHÔNG reference `User.id`.
- `Encounter.patientId` → reference `Patient.id`.
- `Invoice.patientId` → reference `Patient.id`.
- `User.managedPatientIds` → KHÔNG có. Nếu cần gán "bệnh nhân do mình quản" → tạo bảng riêng `PatientAssignment`.

## Khi nào xem lại

- Khi có yêu cầu cổng bệnh nhân online (patient portal) → viết ADR-0009 để quyết định tạo `PatientAccount`.

## Related

- [`docs/02_Glossary/GLOSSARY.md`](../02_Glossary/GLOSSARY.md) — định nghĩa Patient/User.
- ADR-0002 (Modular Monolith) — vì bounded context tách auth khỏi patient.
- Spec Patients (chưa viết) — sẽ chứa chi tiết.

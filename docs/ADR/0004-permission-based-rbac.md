# ADR-0004 — Permission-Based RBAC thay vì Role-Hardcoded

> **Status:** Accepted
> **Date:** 2026-07-12
> **Context:** Quyết định mô hình phân quyền

---

## Context

Có nhiều cách phân quyền:

- **Role-only (RBAC đơn giản):** User có role, code kiểm tra `if (user.role === 'admin')`.
- **Permission-based RBAC:** User có Role, Role có nhiều Permission, code kiểm tra quyền cụ thể.
- **ABAC (Attribute-Based):** quyết định dựa trên thuộc tính (giờ, IP, ...).
- **ReBAC (Relationship-Based):** quyết định dựa trên quan hệ (VD: dentist chỉ xem bệnh nhân của mình).

## Decision

Chọn **Permission-based RBAC**, có chỗ dùng bổ sung row-level filter (bước đầu tiến tới ReBAC).

## Rationale

### Vì sao KHÔNG role-only?

1. **Code phải sửa khi đổi role.** Mỗi `if (user.role === 'X')` là điểm cứng — sửa vai trò là sửa code.
2. **Role ít nhưng action nhiều.** Một role có thể có 10+ permission. Hard-code role sẽ dài và sai logic.
3. **Không tùy biến được.** Phòng khám có thể muốn thay đổi nhân viên nào có quyền gì mà không sửa code.

### Vì sao Permission-based?

1. **Code chỉ kiểm tra quyền** (`require('appointment.create')`). Role chỉ là "tập hợp quyền".
2. **Admin có thể tùy chỉnh** mapping role-permission từ giao diện — không cần deploy lại code.
3. **Audit rõ ràng.** Log "user X thực hiện action Y" rõ ràng hơn "user X có role Y".
4. **Mở rộng dễ** khi thêm role mới (VD: `assistant` sau này chỉ cần gán permission sẵn có).

### Vì sao KHÔNG ABAC / ReBAC ngay?

- ABAC rất phức tạp cho MVP.
- ReBAC cần graph database hoặc nhiều truy vấn — overkill ở MVP.
- Phần lớn check có thể giải quyết bằng "row-level filter": `WHERE dentist_id = $currentUserId`.

## Decision chi tiết

### Mô hình dữ liệu

```
User (id, email, password_hash, ...)
UserRole (user_id, role_id)
Role (id, name, description)
RolePermission (role_id, permission_id)
Permission (id, code, description)       -- vd: "appointment.create", "patient.read"
```

Permission **code** là string dạng `<resource>.<action>`:
- `appointment.create`
- `appointment.read`
- `appointment.update`
- `appointment.cancel`
- `patient.read`
- `patient.read.medical_history`
- `billing.create_invoice`
- `inventory.adjust_stock`
- v.v.

### Áp dụng ở 3 lớp

1. **Backend Guard** (NestJS `@RequirePermission('appointment.create')`) — quyết định cuối cùng. UI chỉ che, không phải bảo mật.
2. **Frontend Hide/Show** — UX, chỉ che nút không hiện. Không có permission → API vẫn trả 403.
3. **Row-level filter (chọn lọc)** — VD: Dentist chỉ thấy appointment của mình, encounter do mình tạo. Kiểm tra ở application service.

### Permission mặc định cho MVP

| Permission code | Admin | Receptionist | Dentist |
| --------------- | ----- | ------------ | ------- |
| user.* | ✅ | — | — |
| role.* | ✅ | — | — |
| patient.create | ✅ | ✅ | — |
| patient.read | ✅ | ✅ | ✅ |
| patient.update | ✅ | ✅ | — |
| patient.read.medical_history | ✅ | — | ✅ |
| appointment.create | ✅ | ✅ | — |
| appointment.read.any | ✅ | ✅ | — |
| appointment.read.own | ✅ | ✅ | ✅ |
| appointment.update | ✅ | ✅ | — |
| appointment.check_in | ✅ | ✅ | — |
| encounter.create | ✅ | — | ✅ |
| encounter.read.any | ✅ | — | ✅ |
| invoice.create | ✅ | ✅ | — |
| invoice.read | ✅ | ✅ | — |
| invoice.mark_paid | ✅ | ✅ | — |
| invoice.refund | ✅ | — | — |
| inventory.read | ✅ | ✅ | ✅ |
| inventory.adjust | ✅ | — | — |

> Bảng trên sẽ được tinh chỉnh khi viết spec cho từng module. Đây chỉ là điểm khởi đầu.

## Hệ quả

### Cấm

- ❌ Không hard-code role trong code nghiệp vụ. Chỉ check permission.
- ❌ Không gán permission trực tiếp cho User. Permission chỉ đi qua Role.

### Được phép

- ✅ Thêm role mới và config quyền từ DB (qua giao diện admin).
- ✅ "Row-level filter" tức là WHERE theo user_id trong query, không cần bảng phức tạp.

## Khi nào xem lại

- Khi có yêu cầu phức tạp hơn (VD: dentist A muốn tạm thời đọc hồ sơ của dentist B) → chuyển sang ReBAC.

## Related

- [`docs/02_Glossary/GLOSSARY.md`](../02_Glossary/GLOSSARY.md)
- ADR-0003 (Patient ≠ User)
- Spec Auth (chưa viết)

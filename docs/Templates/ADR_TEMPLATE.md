# ADR Template

> **ADR = Architecture Decision Record.** Ghi lại MỘT quyết định kiến trúc quan trọng, kèm ngữ cảnh, lý do, hệ quả. Đọc lại sau 6 tháng sẽ hiểu vì sao ngày đó mình chọn vậy.

---

## Format

```markdown
# ADR-XXXX — <Tiêu đề quyết định>

> **Status:** <Proposed | Accepted | Deprecated | Superseded by ADR-YYYY>
> **Date:** YYYY-MM-DD
> **Context:** <ngữ cảnh ngắn gọn>

---

## Context

<Tình huống cần ra quyết định. Số liệu, ràng buộc, deadline, stakeholder.>

## Considered Options

| Option | Ưu | Nhược |
| ------ | -- | ----- |

## Decision

<Quyết định cuối cùng — một dòng/câu ngắn gọn.>

## Rationale

<Tại sao chọn option này. Phân tích từ bảng trên. Số liệu nếu có.>

## Consequences

### Tích cực
- ✅ ...

### Cần chú ý
- ⚠️ ...

## Khi nào xem lại

<Khi điều kiện X xảy ra, viết ADR mới để supersede ADR này.>

## Related

- ADR khác liên quan: <link>
- Spec liên quan: <link>
- Code liên quan: <link>
```

---

## Quy tắc đặt tên

- File: `XXXX-short-name.md` (số 4 chữ số, không bắt đầu bằng 0 → `0001`, `0042`, `0100`).
- Tiêu đề: dùng **danh từ + quyết định**, VD: "Dùng UUID v7 làm Primary Key", "Permission-Based RBAC".

## Status

| Status      | Ý nghĩa |
| ----------- | ------- |
| Proposed    | Đang đề xuất, chưa chốt |
| Accepted    | Đã chốt, đang áp dụng |
| Deprecated  | Không dùng nữa — không có ADR thay thế |
| Superseded by ADR-XXXX | Bị thay thế bởi ADR mới — ghi rõ |

## Quy tắc cập nhật

- Một khi ADR đã Accepted, **KHÔNG sửa nội dung quyết định**. Nếu muốn đổi → viết ADR mới supersede.
- Mỗi quyết định công nghệ quan trọng ≥ 1 ADR. Không có "quyết định ngầm".

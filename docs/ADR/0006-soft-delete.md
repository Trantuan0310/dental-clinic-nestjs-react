# ADR-0006 — Soft Delete mặc định cho dữ liệu nghiệp vụ

> **Status:** Accepted
> **Date:** 2026-07-12
> **Context:** Quyết định chiến lược xóa dữ liệu

---

## Context

Trong y tế, **dữ liệu thường KHÔNG được phép xóa hẳn**. Lịch sử khám bệnh, hóa đơn, payment — tất cả cần truy vết được. Tuy nhiên một số thực thể (như draft appointment, draft invoice) có thể cần xóa thật.

## Decision

**Mặc định dùng soft-delete** cho mọi bảng nghiệp vụ. Xóa cứng (hard delete) chỉ cho phép khi có lý do cụ thể được ghi trong spec module.

## Rationale

1. **Y tế quy định lưu trữ.** Hồ sơ y tế tại Việt Nam: tối thiểu 10 năm (theo Luật Khám chữa bệnh). Xóa cứng nghĩa là có thể vi phạm quy định.
2. **Audit.** Cần biết record từng tồn tại. Khi xóa cứng, mất luôn lịch sử.
3. **Relationship integrity.** Hóa đơn thanh toán rồi thì không nên xóa bệnh nhân — quan hệ cần tồn tại để truy vết.
4. **Cấu hình thống nhất.** Một cơ chế, dễ giải thích cho người mới.

## Cách triển khai

Mọi bảng nghiệp vụ có:

```sql
deleted_at TIMESTAMPTZ,           -- NULL = chưa xóa
deleted_by UUID REFERENCES users  -- ai xóa
```

Repository pattern:

```ts
// Mặc định tất cả query có điều kiện deleted_at IS NULL
// Có method riêng để admin xem record đã xóa: findIncludingDeleted
```

API behavior:

- `DELETE /api/v1/patients/:id` → set `deleted_at`, trả 204.
- `GET /api/v1/patients` → mặc định không bao gồm đã xóa.
- `GET /api/v1/patients?includeDeleted=true` → trả cả đã xóa (cần permission đặc biệt).

## Ngoại lệ (xóa cứng)

| Bảng               | Lý do xóa cứng                                  |
| ------------------ | ----------------------------------------------- |
| `RefreshToken`     | Token hết hạn, không cần giữ                     |
| `AuditLog` (bản raw) | Theo chính sách retention, không có audit quan trọng|
| `TempUpload`       | File upload nháp chưa gắn với record             |
| `NotificationQueue` (sau) | Job đã xử lý xong                 |

Trường hợp khác muốn xóa cứng → phải có spec ghi rõ.

## Hệ quả

### Cấm

- ❌ Không hard delete trong code nghiệp vụ trừ khi thuộc bảng ở mục "Ngoại lệ".
- ❌ Không hiển thị "đã xóa" như nhầm với record chưa xóa (không có UI tự động nên phải rõ permission).

### Được phép

- ✅ Restore (set `deleted_at = NULL`) nếu cần.
- ✅ Purge thật qua job batch (sau MVP) để tuân thủ retention.

## Khi nào xem lại

- Khi có bảng rất lớn (>50M row) và soft-delete làm chậm → viết ADR riêng về retention/purge.

## Related

- [`PROJECT_RULES.md`](../../PROJECT_RULES.md) §8
- ADR-0005 (ID strategy)
- SPEC modules (sẽ ghi rõ khi viết)

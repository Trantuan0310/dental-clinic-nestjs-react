# API Conventions — Dental Clinic REST API

> **Mục đích:** Tập hợp tất cả quy ước chung cho API của 6 module MVP.
> **Bắt buộc cho mọi endpoint.** Khi viết API spec per module, tham chiếu file này — không tự ý thêm ngoại lệ.
> **Ngày tạo:** 2026-07-13

---

## 1. Base URL & Versioning

```
Base URL: https://api.clinic.local/v1
Hoặc dev: http://localhost:3000/api/v1
```

### 1.1 Path convention

- **Prefix:** `/api/v1/`
- **Plural resource:** dùng danh từ số nhiều → `/patients`, `/invoices`, `/appointments`
- **Nested resource:** dùng `s` → `/patients/:id/invoices`
- **ID param:** dùng `id` (UUID v7) → `/patients/:id`
- **Code param:** dùng `code` → `/invoices/:code` (human-readable)

```
GET    /api/v1/patients
POST   /api/v1/patients
GET    /api/v1/patients/:id
PATCH  /api/v1/patients/:id
DELETE /api/v1/patients/:id
GET    /api/v1/patients/:id/invoices
GET    /api/v1/patients/:id/encounters
```

### 1.2 HTTP Methods

| Method | Dùng cho | Idempotent? |
| ------ | -------- | :-----------: |
| `GET` | Lấy data (list/detail) | ✅ |
| `POST` | Tạo mới / thực hiện action | ❌ |
| `PATCH` | Cập nhật một phần field | ✅ |
| `PUT` | Thay thế toàn bộ (rare) | ✅ |
| `DELETE` | Soft-delete | ✅ |
| `HEAD` | Kiểm tra tồn tại (optional) | ✅ |

### 1.3 Action endpoint pattern

Dùng **POST** trên resource để thực hiện action nghiệp vụ (không dùng PATCH):

```
POST   /api/v1/appointments/:id/check-in
POST   /api/v1/appointments/:id/cancel
POST   /api/v1/appointments/:id/reschedule
POST   /api/v1/encounters/:id/close
POST   /api/v1/invoices/:id/issue
POST   /api/v1/invoices/:id/payments
POST   /api/v1/invoices/:id/void
POST   /api/v1/patients/:id/restore
```

---

## 2. Request

### 2.1 Content-Type

- **Request body:** `application/json`
- **File upload:** `multipart/form-data` (nếu có — không có ở MVP)
- **Response:** luôn `application/json`

### 2.2 Date/Time format

**ISO 8601 + UTC timezone:**

```
"2026-07-13T10:00:00Z"    # TIMESTAMPTZ
"2026-07-13"              # DATE
"08:00:00"                # TIME
```

- Client gửi lên: parse ISO 8601 (không parse relative: "today", "+3 days")
- Backend trả về: luôn UTC + `Z` suffix
- **Không dùng timestamp unix** (khó đọc khi debug)

### 2.3 Pagination

Dùng **cursor-based pagination** cho list endpoint.

#### Request

```
GET /api/v1/patients?pageSize=20&cursor=<lastId>&sort=createdAt:desc
```

| Param | Type | Default | Max |
| ----- | ---- | :-----: | --: |
| `pageSize` | int | 20 | 100 |
| `cursor` | string (UUID) | null | — |
| `sort` | string | `createdAt:desc` | — |

Sort format: `field:asc|desc`. Sort field phải là indexed column.

#### Response

```json
{
  "data": [ ... ],
  "pagination": {
    "pageSize": 20,
    "nextCursor": "uuid-of-last-item-or-null",
    "hasMore": true
  }
}
```

> **Tại sao cursor thay vì offset?** Offset không stable khi có INSERT/DELETE giữa các page. Cursor dựa trên indexed column (`id` hoặc `created_at`) → stable pagination.

### 2.4 Filtering & Search

| Param | Ý nghĩa |
| ----- | ------- |
| `?q=nguyen` | Full-text search (ILike) |
| `?status=active` | Enum filter |
| `?from=2026-07-01&to=2026-07-31` | Date range |
| `?dentistId=uuid` | FK filter |
| `?includeDeleted=true` | Soft-deleted (admin only) |

### 2.5 Field selection

```
GET /api/v1/patients?fields=id,code,fullName,primaryPhone
```

Chỉ trả về field được chỉ định. Dùng cho mobile optimization.

---

## 3. Response

### 3.1 Success response

#### Single resource (200 / 201)

```json
{
  "data": {
    "id": "uuid",
    "code": "PAT-2026-00045",
    "fullName": "Nguyen Van A",
    ...
  }
}
```

#### Created (201)

```json
{
  "data": { "id": "uuid", ... },
  "meta": {
    "created": true
  }
}
```

#### List (200)

```json
{
  "data": [ ... ],
  "pagination": { ... }
}
```

#### No content (204)

```json
// Body rỗng
```

### 3.2 Error response — RFC 7807 (Problem Details)

**Mọi lỗi trả theo RFC 7807:**

```json
{
  "type": "https://api.clinic.local/problems/validation-error",
  "title": "Validation Error",
  "status": 422,
  "detail": "Số điện thoại không hợp lệ. Phải là 10-11 chữ số bắt đầu bằng 0.",
  "instance": "/api/v1/patients",
  "errors": [
    {
      "field": "primaryPhone",
      "code": "INVALID_FORMAT",
      "message": "Số điện thoại không hợp lệ"
    }
  ]
}
```

#### Error types (type URL)

| type URL | status | Mô tả |
| -------- | :----: | ----- |
| `about:blank` | varies | Generic (dùng khi không có type riêng) |
| `validation-error` | 422 | Input validation fail |
| `not-found` | 404 | Resource không tồn tại hoặc đã xóa |
| `conflict` | 409 | Unique constraint violation |
| `forbidden` | 403 | Không có permission |
| `unauthorized` | 401 | Chưa login / token hết hạn |
| `business-rule-violation` | 422 | BR nghiệp vụ vi phạm |
| `service-unavailable` | 503 | Bảo trì / quá tải |

#### Validation error codes (errors[].code)

| code | Dùng cho |
| ---- | -------- |
| `REQUIRED` | Bắt buộc nhập |
| `INVALID_FORMAT` | Format sai (email, phone, date...) |
| `OUT_OF_RANGE` | Giá trị ngoài min/max |
| `TOO_SHORT` / `TOO_LONG` | String length |
| `INVALID_ENUM` | Giá trị enum không hợp lệ |
| `DUPLICATE` | Unique constraint |
| `BUSINESS_RULE` | Vi phạm BR (custom message trong `message`) |

---

## 4. Authentication & Authorization

### 4.1 Auth header

```
Authorization: Bearer <accessToken>
```

- Access token: JWT, TTL 15 phút (BR-AUTH-004)
- Refresh token: httpOnly cookie `refreshToken`, TTL 7 ngày

### 4.2 Public endpoints

```
POST   /api/v1/auth/login
POST   /api/v1/auth/forgot-password
POST   /api/v1/auth/reset-password
```

### 4.3 Rate limiting

| Endpoint | Limit |
| ------- | ----- |
| `/auth/login` | 5 requests/phút/IP |
| `/auth/forgot-password` | 3 requests/phút/IP |
| `/auth/refresh` | 10 requests/phút/user |
| Public write endpoints | 30 requests/phút/IP |
| Read endpoints | 120 requests/phút/user |

Response khi quá limit:

```json
{
  "type": "about:blank",
  "title": "Too Many Requests",
  "status": 429,
  "retryAfter": 60
}
```

---

## 5. Idempotency

### 5.1 Idempotency key

Cho **POST** endpoints (tạo mới / action):

```
Idempotency-Key: <client-generated-uuid>
```

- Client generate UUID v7 và gửi lên
- Server lưu key + response vào cache (TTL 24h)
- Nếu client gửi lại cùng key → trả response đã lưu (không tạo lại)

### 5.2 Những endpoint cần idempotency

| Endpoint | Lý do |
| -------- | ----- |
| `POST /api/v1/auth/login` | Tránh token trùng |
| `POST /api/v1/invoices/:id/payments` | Tránh trừ tiền 2 lần |
| `POST /api/v1/patients` | Tránh tạo 2 patient |
| `POST /api/v1/appointments/:id/check-in` | Tránh check-in 2 lần |

---

## 6. Versioning Strategy

### 6.1 URL versioning

- Hiện tại: `/api/v1/`
- Khi breaking change: `/api/v2/`
- V1 vẫn chạy cho đến khi V2 ổn định (grace period 6 tháng)

### 6.2 Non-breaking changes (không tăng version)

- Thêm field mới vào response
- Thêm endpoint mới
- Thêm enum value mới

### 6.3 Breaking changes (tăng version)

- Xóa field
- Đổi type field
- Đổi validation rule
- Đổi HTTP method / path

---

## 7. Cross-Origin (CORS)

```json
{
  "origin": ["https://clinic.example.com"],
  "methods": ["GET", "POST", "PATCH", "PUT", "DELETE"],
  "allowedHeaders": ["Content-Type", "Authorization", "Idempotency-Key"],
  "exposedHeaders": ["X-Request-Id", "Retry-After"],
  "credentials": true,
  "maxAge": 86400
}
```

---

## 8. Common query params

| Param | Áp dụng | Ý nghĩa |
| ----- | ------- | ------- |
| `?fields=...` | GET list/detail | Field selection |
| `?pageSize=20` | GET list | Pagination size |
| `?cursor=...` | GET list | Cursor-based pagination |
| `?sort=createdAt:desc` | GET list | Sort |
| `?includeDeleted=true` | GET list | Admin only — bao gồm soft-deleted |
| `?from=YYYY-MM-DD` | GET list | Date range start |
| `?to=YYYY-MM-DD` | GET list | Date range end |
| `?expand=...` | GET detail | Nested resource expansion |

---

## 9. Logging & Request ID

### 9.1 Request ID

Server **phải** trả header:

```
X-Request-Id: <uuid>
```

Dùng cho distributed tracing và support.

### 9.2 Structured log format

```json
{
  "level": "info",
  "timestamp": "2026-07-13T10:00:00Z",
  "requestId": "uuid",
  "userId": "uuid-or-null",
  "method": "POST",
  "path": "/api/v1/patients",
  "statusCode": 201,
  "durationMs": 45,
  "action": "patient.created"
}
```

---

## 10. Module conventions riêng

Mỗi module có thể override 1 số quy ước. Xem trong file spec chi tiết:

| Module | File |
| ------ | ----- |
| Auth | [`auth.md`](./auth.md) |
| Patients | [`patients.md`](./patients.md) |
| Appointments | [`appointments.md`](./appointments.md) |
| Medical Records | [`medical-records.md`](./medical-records.md) |
| Billing | [`billing.md`](./billing.md) |
| Inventory | [`inventory.md`](./inventory.md) |

---

## 11. Summary: Checklist cho mỗi endpoint

- [ ] Method đúng (GET/POST/PATCH/DELETE)
- [ ] Path đúng naming convention
- [ ] Auth: có `Authorization: Bearer` nếu cần
- [ ] Validation: Zod schema đã viết
- [ ] Error: RFC 7807 format
- [ ] Pagination: cursor-based
- [ ] Idempotency: có `Idempotency-Key` nếu cần
- [ ] Response: `data` wrapper
- [ ] Permission: có check trong handler
- [ ] Swagger: có `@ApiOperation`, `@ApiResponse` annotations

---

## Related

- [SPEC Auth: §8 API](../03_Specification/Auth/SPEC.md#8-api)
- [SPEC Auth: §7 Permissions](../03_Specification/Auth/SPEC.md#7-permissions)
- [Actor Permissions Matrix](../01_Architecture/actor-permissions-matrix.md)
- [RFC 7807 Problem Details](https://datatracker.ietf.org/doc/html/rfc7807)

# ADR-0002 — Dùng Modular Monolith thay vì Microservices

> **Status:** Accepted
> **Date:** 2026-07-12
> **Context:** Quyết định kiến trúc ở Giai đoạn 0

---

## Context

Với 4 tháng phát triển bởi một người, và MVP phục vụ một phòng khám duy nhất, ta phải chọn giữa:

- **Microservices** (nhiều service, nhiều DB, network overhead)
- **Monolith** (một codebase, không có modularity rõ ràng)
- **Modular Monolith** (một process, một DB, code tách module rạch ròi)

## Decision

Chọn **Modular Monolith**.

## Rationale

### Vì sao KHÔNG microservices ngay?

1. **Overhead vận hành:** API gateway, service discovery, log tập trung, network retry... Tất cả cần thời gian không tạo ra giá trị nghiệp vụ.
2. **Distributed transaction:** Lập hóa đơn và cập nhật kho là giao dịch liên module — trong microservice phải dùng saga/eventual consistency, dễ bug.
3. **Debug khó:** Bug nghiệp vụ xuyên qua nhiều service, gán log khó hơn.
4. **Chưa cần scale độc lập:** MVP cho 1 phòng khám — không đông người đến mức cần scale riêng module.

### Vì sao KHÔNG monolith "phẳng"?

1. Khó tách sau. Một khi code trộn lẫn giữa các "bounded context", việc tách microservice sau này gần như phải viết lại.
2. Khó onboard dev mới.
3. Khó test nghiệp vụ riêng từng module.
4. AI (Cursor) khó hiểu khi code phụ thuộc chằng chịt.

### Vì sao Modular Monolith vừa đúng?

1. **Triển khai đơn giản** — một process, một DB.
2. **Code phản ánh bounded context** — mỗi module NestJS là một bounded context, giao tiếp qua interface (application service) hoặc domain event.
3. **Sẵn sàng scale** — khi cần, tách `Billing` thành service riêng mà không phải sửa nghiệp vụ (chỉ thay cách giao tiếp từ in-process call → HTTP/gRPC).
4. **Test dễ** — test nghiệp vụ một module mà không cần chạm module khác.
5. **DX tốt** — IDE/AI thấy module mạch lạc.

## Quy tắc cụ thể để KHÔNG drift sang "big ball of mud"

- **Quy tắc 1:** Module A chỉ gọi Module B qua:
  - Application Service (qua interface DI), HOẶC
  - Domain Event (in-process bus).
  - **KHÔNG** query thẳng database của Module B.
- **Quy tắc 2:** Module A không được `import` entity của Module B. Chỉ dùng DTO/value object do Module B expose.
- **Quy tắc 3:** Shared code (kernel) chỉ chứa thứ thực sự dùng chung nhiều module (Value Object cơ bản, base class). Mỗi lần muốn thêm vào shared → hỏi: "Có ≥3 module cần không?".
- **Quy tắc 4:** Mỗi module có folder `domain/` riêng, không có code Prisma. Infrastructure thuộc về `infrastructure/` riêng, có thể thay đổi mà không động domain.

## Consequences

- ✅ Triển khai nhanh cho MVP.
- ✅ Code có thể đọc, hiểu, test từng phần.
- ✅ Dễ tách service sau — không phải từ đầu.
- ⚠️ Vẫn cần kỷ luật: nếu không giữ các quy tắc trên, sẽ thành monolith lộn xộn.

## Khi nào xem lại ADR này?

Khi:
- Triển khai > 3 instance cần thiết (tải vượt ~200 RPS).
- Nhiều team phát triển song song trên các module khác nhau.
- Compliance yêu cầu tách dữ liệu theo địa lý / domain.

Lúc đó mới revisit microservices, và viết ADR-0008 (chiến lược tách).

## Related

- [`ARCHITECTURE.md`](../../ARCHITECTURE.md) §2
- ADR-0001 (Tech Stack)
- ADR-0003 (Patient ≠ User)

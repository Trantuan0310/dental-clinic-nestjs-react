# ADR-0007 — Cross-Module Communication: In-Process Event Bus + Shared Transaction

> **Status:** Accepted
> **Date:** 2026-07-13
> **Context:** Quyết định cách các module trong Modular Monolith giao tiếp với nhau

---

## Context

Trong Modular Monolith (xem ADR-0002), các bounded context cần phối hợp để thực hiện luồng nghiệp vụ xuyên module:

1. **Appointments → MedicalRecords:** khi BS gọi khám (`POST /appointments/:id/start`), cần tạo Encounter.
2. **MedicalRecords → Billing:** khi Encounter đóng → auto tạo Invoice.
3. **MedicalRecords → Inventory:** khi Encounter đóng → auto stock-out nguyên vật liệu.

Có các lựa chọn:

| Pattern | Mô tả | Ưu điểm | Nhược điểm |
| ------- | ----- | ------- | ---------- |
| **HTTP REST giữa các module** | Module gọi HTTP đến module khác | Ranh giới rõ ràng, dễ tách thành microservice sau | Network overhead, cần retry, không atomic |
| **FE orchestrate** | FE gọi nhiều API liên tiếp | Backend module độc lập hoàn toàn | Tính nhất quán yếu, FE phải xử lý rollback khi lỗi giữa chừng |
| **Direct service-to-service call (in-process)** | Module import service module khác qua DI | Nhanh, atomic dễ | Coupling chặt (code-level), khó tách microservice; vi phạm bounded context |
| **In-process event bus + shared transaction** | Module A emit event trong cùng DB transaction; module B subscribe handler chạy đồng bộ trong cùng transaction | In-process (nhanh), atomic (1 transaction), loose coupling (không import trực tiếp) | Cần NestJS EventEmitter module, lock transaction cẩn thận |
| **Outbox pattern + async worker** | Module A ghi event vào outbox table, worker đọc và dispatch | Loose coupling mạnh nhất, chịu crash tốt | Phức tạp, eventual consistency, cần polling/CDC |
| **External queue (Redis/RabbitMQ)** | Module A publish, module B consume | Quen thuộc với microservice | Tốn infra cho MVP; eventual consistency |

## Decision

**Chọn: In-process event bus (NestJS EventEmitter) + shared transaction cho MVP.**

Cụ thể:

- Sử dụng `@nestjs/event-emitter` để publish domain events trong cùng process.
- Subscriber handler **đồng bộ** (synchronous) và chạy trong **cùng DB transaction** với publisher.
- Nếu handler throw → rollback cả publisher transaction (đảm bảo atomicity).
- Domain events **không** persist xuống DB ở MVP (vì chạy trong cùng transaction, rollback tự nhiên rollback event).
- Tên event theo past-tense: `EncounterClosed`, `PatientCreated`, `AppointmentCancelled`, `InvoiceIssued`, ...

### Khi nào emit

Một module emit event khi **aggregate root** chuyển trạng thái quan trọng ảnh hưởng đến module khác:

| Event | Emitter | Subscribers |
| ----- | ------- | ----------- |
| `AppointmentStarted` | Appointments | MedicalRecords (tạo Encounter) |
| `EncounterClosed` | MedicalRecords | Billing (tạo Invoice draft), Inventory (stock-out) |
| `AppointmentCancelled` | Appointments | MedicalRecords (cascade cancel Encounter theo BD-0008) |
| `InvoiceIssued` | Billing | (chưa có subscriber ở MVP) |
| `InvoicePaid` | Billing | (chưa có subscriber ở MVP) |

### Cấm

- ❌ **Không gọi HTTP** giữa các module trong cùng backend (vì coupling chặt qua network).
- ❌ **Không FE orchestrate** luồng nghiệp vụ xuyên module (FE chỉ trigger 1 endpoint ở module gốc).
- ❌ **Không import trực tiếp** service từ module khác (vẫn phải đi qua event).
- ❌ **Không dùng queue/worker ngoài** (Redis/RabbitMQ) cho MVP — quá sớm.

### Được phép

- ✅ Module A emit event → Module B subscribe đồng bộ qua EventEmitter.
- ✅ Shared transaction context (cùng Prisma transaction).
- ✅ Test handler trong integration test riêng (không qua HTTP).
- ✅ Logging structured cho mỗi event (event name, payload, actor, timestamp).

## Rationale

1. **MVP đơn giản nhưng đúng pattern.** Không cần infra ngoài (Redis, queue). Chỉ cần thư viện `@nestjs/event-emitter` đã có sẵn.

2. **Atomicity thật sự (BR-MR-018).** Encounter close + Stock-out phải atomic: nếu stock không đủ → encounter KHÔNG đóng. In-process event + shared transaction đảm bảo điều này. Outbox pattern cũng được nhưng overkill cho MVP.

3. **Loose coupling đủ tốt.** Module không import service của module khác. Chỉ phụ thuộc vào contract (event name + payload schema). Khi tách microservice sau này, chỉ cần thay `@OnEvent('EncounterClosed')` thành message broker handler — module logic không đổi.

4. **Event-driven là nguyên tắc kiến trúc đã chốt** trong PROJECT_RULES.md và ARCHITECTURE.md.

5. **NestJS EventEmitter đã mature**, có type-safe, dễ test, hỗ trợ async/sync handler.

## Hệ quả

### Trade-off chấp nhận được

- **Crash mid-handler = rollback toàn bộ transaction.** Nếu backend crash giữa lúc đang xử lý EncounterClosed → transaction chưa COMMIT → tất cả state persist thay đổi (Encounter status, Appointment status, Invoice draft, StockMovement). Vì lý do này, handler không được throw ngoài ý muốn.

- **Test coupling.** Phải test cả publisher + subscriber trong cùng integration test (vì gắn với transaction). Khó test riêng từng module.

- **Không có retry tự động.** Nếu handler fail vì lý do ngoài (network toàn cục, deadlock retry), phải xử lý thủ công trong transaction.

### Khi nào xem lại

- Khi số lượng event vượt ~20 và có nhiều cross-module coupling → xét outbox pattern.
- Khi tách microservice đầu tiên → đổi sang message broker (NATS / RabbitMQ), chuyển handler async.
- Khi phải đảm bảo retry với backoff cho handler bên ngoài transaction → xét outbox.

## Ví dụ skeleton code

```typescript
// MedicalRecords module — encounter.service.ts
async closeEncounter(encounterId: string, summary: string) {
  return this.prisma.$transaction(async (tx) => {
    await tx.encounter.update({
      where: { id: encounterId },
      data: { status: 'completed', closedAt: new Date(), summary },
    });
    await tx.appointment.update({
      where: { id: encounter.appointmentId },
      data: { status: 'completed' },
    });

    // Emit event trong cùng tx
    this.eventEmitter.emit(
      'encounter.closed',
      new EncounterClosedEvent(encounter, treatments, inventoryUsages),
    );

    // ⚠️ Handler chạy đồng bộ trước khi tx COMMIT
    // Nếu handler throw → rollback
  });
}
```

```typescript
// Inventory module — encounter-closed.handler.ts
@Injectable()
export class EncounterClosedHandler {
  @OnEvent('encounter.closed')
  async handle(event: EncounterClosedEvent) {
    // Stock-out trong transaction riêng? Không — cần SAME tx.
    // Pattern: handler nhận payload, return data cần insert.
    // Publisher sẽ INSERT data đó trong cùng tx (xem ADR-0008).
  }
}
```

## Related

- [`PROJECT_RULES.md`](../../PROJECT_RULES.md) §4 (Architectural principles) — event-driven.
- [`ARCHITECTURE.md`](../../ARCHITECTURE.md) §3 (Modular Monolith).
- ADR-0002 (Modular Monolith).
- ADR-0008 (Transactional event cho EncounterClosed stock-out).
- BD-0008 (Cascade cancel appointment → encounter).

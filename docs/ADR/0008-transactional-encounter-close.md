# ADR-0008 — Transactional Event cho EncounterClose (Stock-out atomic với Encounter)

> **Status:** Accepted
> **Date:** 2026-07-13
> **Context:** Làm sao đảm bảo BR-MR-018 — stock-out phải atomic với encounter close (fail cả 2 hoặc success cả 2)

---

## Context

Spec MedicalRecords BR-MR-018:
> Stock-out fail → rollback encounter close. Nếu stock-out fail, encounter KHÔNG đóng.

Và BR-INV-005:
> Auto stock-out chạy trong transaction encounter close.

Tức là thao tác:
```text
Close Encounter (MedicalRecords)
  + Set Appointment.status = completed
  + Stock-out (Inventory)
  + Auto-create Invoice draft (Billing)
```
phải chạy trong **1 transaction duy nhất**. Nếu bất kỳ phần nào fail → rollback tất cả.

Có 2 vấn đề kỹ thuật cần giải quyết:

1. **Event-driven** (ADR-0007) subscribe handler ở module khác → nhưng Prisma transaction chỉ có hiệu lực trong phạm vi 1 service call.
2. **Cross-module coupling** — Inventory handler cần INSERT vào DB trong cùng transaction với MedicalRecords.

## Decision

**Sử dụng pattern "Event payload + handler returns data + publisher inserts"** (còn gọi là **synchronous saga** hoặc **transactional event handler**).

Cụ thể:

1. **Publisher (MedicalRecords)** giữ transaction (`prisma.$transaction`).
2. Trong transaction:
   - INSERT/UPDATE các bảng của MedicalRecords.
   - **Emit event** `encounter.closed` qua `EventEmitter.emit()`.
3. **Subscribers (Billing, Inventory)** chạy đồng bộ trước khi publisher transaction COMMIT.
4. **Handler KHÔNG tự INSERT trực tiếp.** Thay vào đó, handler:
   - Validate logic (vd: stock check cho Inventory).
   - Throw nếu lỗi → publisher transaction rollback.
   - Hoặc: trả về "data to insert" → publisher INSERT các data đó trong cùng transaction.

### Chi tiết cho Inventory stock-out

```typescript
// MedicalRecords — encounter.service.ts
async closeEncounter(encounterId: string, summary: string, tx: PrismaTx) {
  const encounter = await tx.encounter.update({
    where: { id: encounterId },
    data: { status: 'completed', closedAt: new Date(), summary },
  });
  await tx.appointment.update({
    where: { id: encounter.appointmentId },
    data: { status: 'completed' },
  });

  // Emit event trong tx — handler CHẠY ĐỒNG BỘ
  this.eventEmitter.emit('encounter.closed', new EncounterClosedEvent(encounter));
}

// Caller
async closeEncounterEndpoint(id: string, body: CloseDto) {
  return this.prisma.$transaction(async (tx) => {
    const result = await this.encounterService.closeEncounter(id, body.summary, tx);
    return result;
  });
}
```

```typescript
// Inventory — encounter-closed.handler.ts
@Injectable()
export class EncounterClosedHandler {
  @OnEvent('encounter.closed', { async: false }) // QUAN TRỌNG: sync
  async handle(event: EncounterClosedEvent) {
    // Stock-validation. Nếu fail → throw → transaction rollback.
    for (const usage of event.inventoryUsages) {
      const item = await this.inventoryRepo.findById(usage.itemId);
      if (item.quantityOnHand < usage.quantity) {
        throw new InsufficientStockError(item.name, item.quantityOnHand, usage.quantity);
      }
    }

    // KHÔNG INSERT tại đây. Trả về data, publisher sẽ insert trong tx.
    return { stockMovements: event.inventoryUsages.map(/* build StockMovement */) };
  }
}
```

```typescript
// MedicalRecords — encounter.service.ts (mở rộng)
// Gọi handler thủ công để INSERT trong tx
async closeEncounter(encounterId, summary, tx, eventEmitter) {
  // ... update encounter ...

  const stockResult = await firstValueFrom(
    eventEmitter.emitAsync('encounter.closed', event),
  );

  if (stockResult.error) throw stockResult.error; // stock fail → rollback

  // Insert StockMovement trong CÙNG tx
  if (stockResult.stockMovements) {
    await tx.stockMovement.createMany({ data: stockResult.stockMovements });
    await tx.inventoryItem.updateMany({ /* trừ qty */ });
  }

  // Insert Invoice draft trong CÙNG tx (Billing tương tự)
}
```

> **Lưu ý:** Ví dụ trên là skeleton — implementation chi tiết sẽ chốt ở Phase 8 (Backend). Pattern chính: `emitAsync` để chờ handler return data, sau đó INSERT data đó trong tx hiện tại.

### Handler requirements

- **MUST `@OnEvent(name, { async: false })`** — chạy đồng bộ, throw nếu lỗi.
- **MUST không giữ connection DB riêng** — không gọi DB ngoài tx hiện tại.
- **MUST không gọi HTTP/network external** trong handler (có thể block transaction quá lâu).
- **MAY return data** — publisher sẽ INSERT/UPDATE dựa trên data đó.

### Error propagation

| Handler behavior | Result |
| ---------------- | ------ |
| Return data (success) | Publisher INSERTs data, COMMIT transaction |
| Throw error | Publisher ROLLBACKS transaction; HTTP trả 422 với error từ handler |
| Return `null` (no-op) | Publisher chỉ COMMIT state của module mình |

## Rationale

1. **Đảm bảo BR-MR-018 / BR-INV-005** — Stock-out và encounter close atomic.
2. **Tận dụng event-driven pattern** đã chốt ở ADR-0007 — không thêm infra mới.
3. **Handlers không cần tự quản lý transaction** — vì publisher làm hết. Handler chỉ lo business logic.
4. **Test được** — handler test qua mock EventEmitter; transaction test qua integration test.
5. **Tương thích microservice migration sau** — chỉ cần đổi `EventEmitter.emit` thành message broker publish, và handler subscriber chạy async với retry/outbox.

## Hệ quả

### Trade-off chấp nhận

- **Handler chậm = transaction lâu.** Handler phải nhanh (<100ms). Không được gọi HTTP, không được query DB nặng.
- **Coupling vẫn còn ở payload schema.** Event payload là contract giữa 2 module. Khi sửa payload → phải update cả 2 module. (Có thể giảm bằng cách version event name: `encounter.closed.v1`.)
- **Không có retry.** Nếu handler fail do deadlock transient → retry phải do publisher trigger lại (qua idempotency key).

### Cấm

- ❌ Handler KHÔNG được gọi `prisma.$transaction` riêng (sẽ tạo nested transaction hoặc deadlock).
- ❌ Handler KHÔNG được emit thêm event khác (tránh nested event chain phức tạp).
- ❌ Handler KHÔNG được gọi HTTP/network external.

### Cần monitor

- Thời gian xử lý mỗi handler (P95 latency) — alert nếu >200ms.
- Tỉ lệ rollback do handler error — phân biệt business error vs system error.

## Khi nào xem lại

- Khi tách microservice — chuyển sang outbox pattern với retry/async worker.
- Khi handler business logic trở nên nặng (>500ms) — buộc phải tách async với eventual consistency.
- Khi có ≥3 module subscribe cùng 1 event → cân nhắc public event broker.

## Ví dụ code complete (tham khảo)

Xem `backend/src/modules/medical-records/encounter.service.ts` và `backend/src/modules/inventory/handlers/encounter-closed.handler.ts` khi Phase 8 viết code.

## Related

- ADR-0002 (Modular Monolith).
- ADR-0007 (In-process Event Bus — cha của ADR này).
- BD-0005 (Medical Record MVP scope).
- BR-MR-018 (Stock-out fail → rollback encounter close).
- BR-INV-005 (Stock-out atomic với encounter close).

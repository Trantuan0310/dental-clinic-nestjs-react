# Health Checks

Endpoint health check cho monitoring và readiness probes.

---

## Endpoint

### `GET /health`

Lưu ý: endpoint này nằm ngoài global prefix `/api` (xem `backend/src/main.ts` —
`setGlobalPrefix('api', { exclude: ['health', ...] })`), nên **không** có tiền
tố `/api/v1`.

```bash
curl http://localhost:3000/health
```

Response (`backend/src/common/health.controller.ts`):

```json
{
  "status": "ok",
  "timestamp": "2026-08-03T12:00:00.000Z"
}
```

Đây là health check đơn giản (process đang chạy, HTTP server đang nhận
request) — **không** check kết nối database hay Redis. `PrismaService` tự
kiểm tra kết nối DB khi khởi động (`onModuleInit` gọi `assertUuidV7Available()`
và crash sớm nếu DB không sẵn sàng — xem `backend/src/prisma/prisma.service.ts`),
nên nếu process đang chạy và trả `200` từ `/health`, DB tại thời điểm khởi
động đã kết nối thành công.

> Muốn có health check đầy đủ hơn (check DB/Redis theo thời gian thực,
> tách riêng liveness/readiness cho Kubernetes) thì cần bổ sung thêm code —
> hiện tại chưa có, đừng cấu hình probe trỏ tới các path không tồn tại như
> `/health/live` hay `/health/ready`.

---

## Docker healthcheck

```yaml
healthcheck:
  test: ["CMD", "curl", "-f", "http://localhost:3000/health"]
  interval: 30s
  timeout: 10s
  retries: 3
  start_period: 40s
```

(Đã áp dụng trong `docker-compose.prod.yml` ở gốc repo.)

---

## Load Balancer / Platform Health Check

Cấu hình health check trên Render/Railway/load balancer:

- **Path**: `/health`
- **Interval**: 30s
- **Timeout**: 10s
- **Unhealthy threshold**: 3
- **Healthy threshold**: 2

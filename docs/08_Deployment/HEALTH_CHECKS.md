# Health Checks

Endpoint health checks cho monitoring và readiness probes.

---

## Endpoints

### `GET /api/health` — Full Health

Kiểm tra tất cả dependencies.

```bash
curl http://localhost:3000/api/health
```

Response:

```json
{
  "status": "ok",
  "timestamp": "2026-08-03T12:00:00.000Z",
  "uptime": 3600.5,
  "version": "1.0.0",
  "services": {
    "database": { "status": "ok", "latency_ms": 2 },
    "redis": { "status": "ok", "latency_ms": 1 }
  }
}
```

### `GET /api/health/live` — Liveness

Kiểm tra app đang chạy (không check DB).

```bash
curl http://localhost:3000/api/health/live
```

Response:

```json
{
  "status": "ok",
  "timestamp": "2026-03-08T12:00:00.000Z"
}
```

### `GET /api/health/ready` — Readiness

Kiểm tra app sẵn sàng nhận traffic (check DB, Redis).

```bash
curl http://localhost:3000/api/health/ready
```

Response:

```json
{
  "status": "ok",
  "timestamp": "2026-03-08T12:00:00.000Z",
  "checks": {
    "database": { "status": "ok", "latency_ms": 2 },
    "redis": { "status": "ok", "latency_ms": 1 }
  }
}
```

---

## Error Response

Khi có lỗi:

```json
{
  "status": "error",
  "timestamp": "2026-08-03T12:00:00.000Z",
  "error": "Database connection failed",
  "services": {
    "database": { "status": "error", "message": "Connection refused" },
    "redis": { "status": "ok" }
  }
}
```

HTTP Status: `503 Service Unavailable`

---

## Kubernetes Probes

```yaml
livenessProbe:
  httpGet:
    path: /api/health/live
    port: 3000
  initialDelaySeconds: 10
  periodSeconds: 10
  failureThreshold: 3

readinessProbe:
  httpGet:
    path: /api/health/ready
    port: 3000
  initialDelaySeconds: 5
  periodSeconds: 5
  failureThreshold: 3
```

---

## Load Balancer Health Check

Cấu hình health check trên load balancer:

- **Path**: `/api/health`
- **Interval**: 30s
- **Timeout**: 10s
- **Unhealthy threshold**: 3
- **Healthy threshold**: 2

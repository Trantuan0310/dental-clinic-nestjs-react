# Docker Setup

Triển khai toàn bộ stack bằng Docker Compose.

---

## Yêu cầu

- Docker >= 20.10
- Docker Compose >= 2.0
- 2GB RAM tối thiểu

---

## Cấu trúc file

```
DATN/
├── docker-compose.yml
├── .env                    # Database credentials, secrets
├── backend/
│   ├── Dockerfile          # Multi-stage build
│   └── .dockerignore
└── frontend/
    ├── Dockerfile          # Nginx serve build
    └── .dockerignore
```

---

## `docker-compose.yml`

```yaml
version: '3.9'

services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: ${POSTGRES_USER:-clinic_user}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:-change-me}
      POSTGRES_DB: ${POSTGRES_DB:-dental_clinic}
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${POSTGRES_USER:-clinic_user}"]
      interval: 10s
      timeout: 5s
      retries: 5

  redis:
    image: redis:7-alpine
    command: redis-server --requirepass ${REDIS_PASSWORD:-redis-pass}
    volumes:
      - redis_data:/data
    healthcheck:
      test: ["CMD", "redis-cli", "-a", "${REDIS_PASSWORD:-redis-pass}", "ping"]
      interval: 10s
      timeout: 5s
      retries: 5

  backend:
    build:
      context: ./backend
      dockerfile: Dockerfile
    environment:
      DATABASE_URL: postgresql://${POSTGRES_USER:-clinic_user}:${POSTGRES_PASSWORD:-change-me}@postgres:5432/${POSTGRES_DB:-dental_clinic}
      REDIS_URL: redis://:${REDIS_PASSWORD:-redis-pass}@redis:6379
      JWT_SECRET: ${JWT_SECRET}
      CORS_ORIGIN: ${CORS_ORIGIN}
      NODE_ENV: production
      PORT: 3000
    ports:
      - "3000:3000"
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/health"]
      interval: 30s
      timeout: 10s
      retries: 3

  frontend:
    build:
      context: ./frontend
      dockerfile: Dockerfile
    ports:
      - "3001:80"
    depends_on:
      - backend

volumes:
  postgres_data:
  redis_data:
```

---

## `backend/Dockerfile`

```dockerfile
# Stage 1: Build
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npx prisma generate
RUN npm run build

# Stage 2: Production
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/prisma ./prisma
EXPOSE 3000
CMD ["node", "dist/main.js"]
```

---

## `frontend/Dockerfile`

```dockerfile
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
ARG VITE_API_BASE_URL=/api/v1
RUN npm run build

FROM nginx:alpine
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
```

---

## `frontend/nginx.conf`

```nginx
server {
    listen 80;
    root /usr/share/nginx/html;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    location /api/ {
        proxy_pass http://backend:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

---

## Khởi động

```bash
# 1. Tạo file .env
cp .env.example .env
# Sửa các giá trị trong .env

# 2. Build và chạy
docker-compose up -d --build

# 3. Chạy migrations
docker-compose exec backend npx prisma migrate deploy

# 4. Seed data (lần đầu)
docker-compose exec backend npx prisma db seed

# 5. Kiểm tra
curl http://localhost:3000/health
```

---

## Dừng và xóa

```bash
# Dừng
docker-compose down

# Dừng + xóa volumes (MẤT HẾT DATA)
docker-compose down -v
```

---

## Troubleshooting

### Container không start

```bash
docker-compose logs backend
```

### Database connection failed

Kiểm tra `DATABASE_URL` trong `.env` và đảm bảo Postgres đã healthy.

### Prisma migration lỗi

```bash
# Reset database (CẨN THẬN: MẤT HẾT DATA)
docker-compose exec postgres psql -U clinic_user -d dental_clinic -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"
docker-compose exec backend npx prisma migrate deploy
```

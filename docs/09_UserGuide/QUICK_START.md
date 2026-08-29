# Quick Start Guide — Developer Onboarding

Hướng dẫn nhanh để setup môi trường development và chạy dự án.

---

## Yêu cầu hệ thống

- **Node.js** 20+
- **pnpm** (recommended) hoặc npm
- **Docker Desktop** (cho PostgreSQL + Redis)
- **Git**

---

## 1. Clone & Install

```bash
# Clone repository
git clone https://github.com/your-repo/dental-clinic.git
cd dental-clinic

# Install backend dependencies
cd backend
pnpm install

# Install frontend dependencies
cd ../frontend
pnpm install
```

---

## 2. Backend Setup

```bash
cd backend

# Copy env file
cp .env.example .env

# Start PostgreSQL + Redis via Docker
docker-compose up -d

# Chờ DB khởi động (~10s)
sleep 10

# Generate Prisma client
pnpm exec prisma generate

# Run migrations
pnpm exec prisma migrate deploy

# Seed data (tạo admin user)
pnpm exec prisma db seed

# Start dev server
pnpm run start:dev
```

Backend chạy tại: `http://localhost:3000`

### Default Credentials (sau khi seed)

| Role | Email | Password |
|------|-------|----------|
| Admin | `admin@clinic.local` | `Admin123!` |

---

## 3. Frontend Setup

```bash
cd frontend

# Copy env file
cp .env.example .env
# Sửa VITE_API_BASE_URL=http://localhost:3000/api/v1

# Start dev server
pnpm run dev
```

Frontend chạy tại: `http://localhost:5173`

---

## 4. Database Reset (nếu cần)

```bash
cd backend

# Xóa và tạo lại database
docker-compose down -v
docker-compose up -d
sleep 10
pnpm exec prisma migrate deploy
pnpm exec prisma db seed
```

---

## 5. Chạy Tests

### Backend

```bash
cd backend
pnpm test           # Tất cả tests
pnpm test --watch   # Watch mode
pnpm test --coverage # Coverage report
```

### Frontend

```bash
cd frontend
pnpm run lint       # ESLint
pnpm exec tsc       # TypeScript check
pnpm run build      # Production build
```

### E2E (Playwright)

```bash
cd frontend

# Cài Playwright browsers (lần đầu)
npx playwright install --with-deps

# Chạy E2E tests
# Backend phải đang chạy tại localhost:3000
npx playwright test
```

---

## 6. VS Code Extensions (Recommended)

```json
// .vscode/extensions.json
{
  "recommendations": [
    "dbaeumer.vscode-eslint",
    "esbenp.prettier-vscode",
    "prisma.prisma",
    "bradlc.vscode-tailwindcss",
    "ms-vscode.vscode-typescript-next",
    "eamodio.gitlens",
    "usernamehw.errorlens"
  ]
}
```

---

## 7. Scripts hữu ích

| Script | Mô tả |
|--------|--------|
| `backend:dev` | `pnpm --filter backend run start:dev` |
| `frontend:dev` | `pnpm --filter frontend run dev` |
| `backend:lint` | `pnpm --filter backend run lint` |
| `frontend:lint` | `pnpm --filter frontend run lint` |
| `backend:test` | `pnpm --filter backend run test` |
| `frontend:test` | `pnpm --filter frontend run test` |
| `backend:build` | `pnpm --filter backend run build` |
| `frontend:build` | `pnpm --filter frontend run build` |

---

## 8. Troubleshooting nhanh

| Vấn đề | Giải pháp |
|---------|-----------|
| `ECONNREFUSED` PostgreSQL | Docker chưa chạy → `docker-compose up -d` |
| Prisma error P3005 | Database có schema cũ → `pnpm exec prisma migrate reset` |
| Port 3000 đã dùng | Kill process: `npx kill-port 3000` |
| `JWT_SECRET` errors | Copy lại `.env` từ `.env.example` |
| Frontend API 401 | Kiểm tra `VITE_API_BASE_URL` đúng port 3000 |

---

## 9. Generate Migration mới

```bash
cd backend
pnpm exec prisma migrate dev --name describe_your_change
```

---

## 10. Mở Swagger Docs

Sau khi backend chạy:
- Development: `http://localhost:3000/api/docs`
- Production: `http://localhost:3000/api/docs`

---

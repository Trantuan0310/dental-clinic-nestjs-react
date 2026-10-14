# Quick Start Guide — Developer Onboarding

Hướng dẫn nhanh để setup môi trường development và chạy dự án.

---

## Yêu cầu hệ thống

- **Node.js** 20+
- **npm** (đi kèm Node.js)
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
npm install

# Install frontend dependencies
cd ../frontend
npm install
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
npx prisma generate

# Run migrations
npx prisma migrate deploy

# Seed data (tạo admin user)
npx prisma db seed

# Start dev server
npm run start:dev
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
npm run dev
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
npx prisma migrate deploy
npx prisma db seed
```

---

## 5. Chạy Tests

### Backend

```bash
cd backend
npm test           # Tất cả tests
npm test -- --watch # Watch mode
npm test -- --coverage # Coverage report
```

### Frontend

```bash
cd frontend
npm run lint       # ESLint
npx tsc       # TypeScript check
npm run build      # Production build
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
| `backend:dev` | `npm --prefix backend run start:dev` |
| `frontend:dev` | `npm --prefix frontend run dev` |
| `backend:lint` | `npm --prefix backend run lint` |
| `frontend:lint` | `npm --prefix frontend run lint` |
| `backend:test` | `npm --prefix backend run test` |
| `frontend:test` | `npm --prefix frontend run test:e2e` |
| `backend:build` | `npm --prefix backend run build` |
| `frontend:build` | `npm --prefix frontend run build` |

---

## 8. Troubleshooting nhanh

| Vấn đề | Giải pháp |
|---------|-----------|
| `ECONNREFUSED` PostgreSQL | Docker chưa chạy → `docker-compose up -d` |
| Prisma error P3005 | Database có schema cũ → `npx prisma migrate reset` |
| Port 3000 đã dùng | Kill process: `npx kill-port 3000` |
| `JWT_SECRET` errors | Copy lại `.env` từ `.env.example` |
| Frontend API 401 | Kiểm tra `VITE_API_BASE_URL` đúng port 3000 |

---

## 9. Generate Migration mới

```bash
cd backend
npx prisma migrate dev --name describe_your_change
```

---

## 10. Mở Swagger Docs

Sau khi backend chạy:
- Development: `http://localhost:3000/api/docs`
- Production: `http://localhost:3000/api/docs`

---

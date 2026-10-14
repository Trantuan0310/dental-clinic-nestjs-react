# Quick Start Guide — Developer Onboarding

Hướng dẫn nhanh để setup môi trường development và chạy dự án. Bản đầy đủ hơn: [README.md](../../README.md) và [README_DEV.md](../../README_DEV.md) (Windows).

---

## Yêu cầu hệ thống

- **Node.js** 22+ (CI chạy Node 22)
- **npm** (đi kèm Node.js; dự án dùng `package-lock.json`, không dùng pnpm)
- **Docker** + Docker Compose (cho PostgreSQL)
- **Git**

Redis không bắt buộc: không đặt `REDIS_URL` thì backend chỉ tắt cache (AI tóm tắt vẫn chạy).

---

## 1. Clone & Install

```bash
git clone https://github.com/Trantuan0310/dental-clinic-nestjs-react.git
cd dental-clinic-nestjs-react

# Backend (postinstall tự chạy prisma generate)
cd backend
npm install

# Frontend
cd ../frontend
npm install
```

---

## 2. Backend Setup

```bash
cd backend

# Copy env file, sửa JWT_SECRET; GEMINI_API_KEY có thể để trống
cp .env.example .env

# Chỉ dựng PostgreSQL. Không chạy `docker compose up -d` trần:
# file compose còn có service backend ở cổng 3000, trùng với start:dev.
docker compose up -d postgres
```

PostgreSQL trong Docker mở ở cổng **15432** trên máy. Sửa `DATABASE_URL` trong `.env` cho khớp:

```
DATABASE_URL=postgresql://postgres:postgres@localhost:15432/dental_clinic
```

```bash
# Áp dụng migration
npx prisma migrate deploy

# Seed: quyền, vai trò, tài khoản admin
npm run prisma:seed

# (tùy chọn) 3 tháng dữ liệu khám chữa bệnh mẫu, có sẵn tài khoản lễ tân, bác sĩ
npm run prisma:seed:clinical

# Start dev server
npm run start:dev
```

Backend chạy tại: `http://localhost:3000`, API ở `/api/v1`.

### Tài khoản mặc định (sau khi seed)

| Role | Email | Password |
|------|-------|----------|
| Admin | `admin@clinic.local` | `Admin123!` (bắt buộc đổi ở lần đăng nhập đầu) |

---

## 3. Frontend Setup

```bash
cd frontend
npm run dev
```

Frontend chạy tại: `http://localhost:5173`. Không cần file `.env`: frontend gọi `/api/v1`, Vite proxy chuyển sang `http://localhost:3000`. Chỉ đặt `VITE_API_BASE_URL` khi backend ở địa chỉ khác.

---

## 4. Database Reset (nếu cần)

```bash
cd backend

# Xóa volume và tạo lại database (MẤT HẾT DỮ LIỆU)
docker compose down -v
docker compose up -d postgres
npx prisma migrate deploy
npm run prisma:seed
```

---

## 5. Chạy kiểm tra

### Backend

```bash
cd backend
npx tsc --noEmit       # TypeScript check
npm run lint           # ESLint
npm test               # Tất cả tests
npm run test:watch     # Watch mode
npm run test:cov       # Coverage report
```

### Frontend

```bash
cd frontend
npm run typecheck      # TypeScript check
npm run lint           # ESLint
npm run build          # Production build
```

### E2E (Playwright)

```bash
cd frontend

# Cài trình duyệt Chromium cho Playwright (lần đầu)
npm run test:e2e:install

# Chạy E2E tests: cần PostgreSQL và backend đang chạy tại localhost:3000
npm run test:e2e
```

Chữ trên giao diện nằm trong `frontend/src/locales/*.ts`: đổi chữ thì sửa test E2E tương ứng.

---

## 6. VS Code Extensions (gợi ý)

Repo không kèm `.vscode/`. Các extension nên cài:

- `dbaeumer.vscode-eslint`
- `esbenp.prettier-vscode`
- `prisma.prisma`
- `bradlc.vscode-tailwindcss`
- `eamodio.gitlens`
- `usernamehw.errorlens`

---

## 7. Scripts hữu ích

Không có `package.json` ở thư mục gốc; chạy từ gốc repo bằng `npm --prefix`:

| Việc | Lệnh |
|--------|--------|
| Backend dev | `npm --prefix backend run start:dev` |
| Frontend dev | `npm --prefix frontend run dev` |
| Lint backend / frontend | `npm --prefix backend run lint` / `npm --prefix frontend run lint` |
| Test backend | `npm --prefix backend test` |
| E2E | `npm --prefix frontend run test:e2e` |
| Build backend / frontend | `npm --prefix backend run build` / `npm --prefix frontend run build` |

Windows: `check-env.bat` rồi `start-dev.bat` làm tất cả các bước trên.

---

## 8. Troubleshooting nhanh

| Vấn đề | Giải pháp |
|---------|-----------|
| `P1001` / `ECONNREFUSED` PostgreSQL | Docker chưa chạy → `docker compose up -d postgres`; kiểm tra cổng 15432 trong `DATABASE_URL` |
| Prisma error P3005 "schema is not empty" | `npm run db:baseline` trong `backend/` |
| Port 3000 đã dùng | Có thể container `dental-clinic-backend` đang chạy → `docker compose stop backend`; hoặc `npx kill-port 3000` |
| `JWT_SECRET` errors | Copy lại `.env` từ `.env.example` |
| Frontend gọi API lỗi | Kiểm tra backend chạy ở cổng 3000; nếu đặt `VITE_API_BASE_URL` thì phải kết thúc bằng `/api/v1` |

Thêm: [TROUBLESHOOTING.md](TROUBLESHOOTING.md).

---

## 9. Generate Migration mới

```bash
cd backend
npx prisma migrate dev --name describe_your_change
```

---

## 10. Mở Swagger Docs

Sau khi backend chạy ở môi trường development: `http://localhost:3000/api/docs`.

Production (`NODE_ENV=production`) không bật Swagger.

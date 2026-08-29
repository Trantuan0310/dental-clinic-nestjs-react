# Deploy on Render

Triển khai lên Render (render.com).

---

## Prerequisites

- Render account
- GitHub repo connected

---

## 1. Backend — Web Service

1. **New → Web Service**
2. Connect GitHub repo
3. Settings:
   - **Root Directory**: `backend`
   - **Build Command**: `npm install && npx prisma generate && npm run build`
   - **Start Command**: `node dist/main.js`
   - **Instance Type**: Starter ($7/month)
   - **Region**: Singapore

4. **Environment → Variables**:

```env
NODE_ENV=production
PORT=3000
DATABASE_URL=<PostgreSQL connection string>
REDIS_URL=redis://<host>:<port>
JWT_SECRET=<32+ char>
JWT_REFRESH_SECRET=<32+ char>
GEMINI_API_KEY=<your-key>
```

---

## 2. PostgreSQL — Managed Database

1. **New → PostgreSQL**
2. Region: Singapore
3. Copy connection string vào Backend `DATABASE_URL`

---

## 3. Redis — Managed Cache

1. **New → Redis**
2. Region: Singapore
3. Copy URL vào Backend `REDIS_URL`

---

## 4. Backend Health Check

```bash
curl https://your-backend.onrender.com/api/health
```

---

## 5. Frontend — Static Site

1. **New → Static Site**
2. Connect GitHub repo
3. Settings:
   - **Root Directory**: `frontend`
   - **Build Command**: `npm install && npm run build`
   - **Publish Directory**: `dist`

4. **Environment → Variables**:

```env
VITE_API_BASE_URL=https://your-backend.onrender.com/api/v1
```

5. **Redirects/Rewrites** (bắt buộc — tránh lỗi 404 khi chuyển tab / refresh):
   - `frontend/public/_redirects` đã có sẵn rule `/*  /index.html  200`, Render tự đọc file này khi build static site.
   - Nếu Render không nhận file `_redirects`, vào **Static Site → Settings → Redirects/Rewrites** và thêm thủ công: Source `/*` → Destination `/index.html`, Action **Rewrite**.
   - Đây là app SPA (`react-router-dom` `BrowserRouter`) — mọi route con (`/patients`, `/payroll/periods/:id`, ...) chỉ tồn tại phía client, không có file vật lý tương ứng. Thiếu rule này → F5/refresh hoặc mở link trực tiếp vào route con sẽ bị 404 từ static file server.

---

## 6. Custom Domain

Render → Static Site → Settings → Custom Domains

---

## 7. Troubleshooting

### Build Timeout

Increase timeout hoặc simplify build command.

### Database Connection Failed

Verify `DATABASE_URL` format, enable SSL:
```
postgresql://user:pass@host:5432/db?sslmode=require
```

### Cold Start

Render spin down sau 15 phút không active. Cold start mất ~30s.

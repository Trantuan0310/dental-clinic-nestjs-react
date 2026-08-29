# Deploy on Railway

Triển khai lên Railway (railway.app).

---

## Prerequisites

- Railway CLI: `npm i -g @railway/cli`
- Login: `railway login`

---

## 1. Backend Deployment

### Cách 1: GitHub Integration (Recommended)

1. Connect GitHub repo trên Railway dashboard
2. Add environment variables:
   - `DATABASE_URL` → PostgreSQL plugin
   - `REDIS_URL` → Redis plugin
   - `JWT_SECRET`
   - `JWT_REFRESH_SECRET`
   - `GEMINI_API_KEY`
   - `NODE_ENV=production`
3. Set root directory: `backend`
4. Build command: `npm install && npx prisma generate && npm run build`
5. Start command: `node dist/main.js`

### Cách 2: Railway CLI

```bash
cd backend
railway init
railway add postgres
railway add redis
railway variables set JWT_SECRET "your-secret"
railway variables set JWT_REFRESH_SECRET "your-refresh-secret"
railway variables set GEMINI_API_KEY "your-api-key"
railway variables set NODE_ENV production
railway up
```

---

## 2. Frontend Deployment

### Cách 1: Static Site

1. Build locally: `cd frontend && npm install && npm run build`
2. Deploy dist/ folder lên Railway as Static Site
3. Set `VITE_API_BASE_URL` = Railway backend URL

### Cách 2: Vercel (Recommended for Frontend)

```bash
cd frontend
npx vercel --prod
# Set VITE_API_BASE_URL=https://your-backend.railway.app/api/v1
```

---

## 3. Environment Variables

Trên Railway dashboard → Backend project → Variables:

```env
NODE_ENV=production
PORT=3000
JWT_SECRET=<32+ char random string>
JWT_REFRESH_SECRET=<32+ char random string>
GEMINI_API_KEY=<your-key>
REDIS_URL=<from Redis plugin>
# DATABASE_URL set automatically by PostgreSQL plugin
```

Frontend (Vercel):

```env
VITE_API_BASE_URL=https://<backend-domain>.railway.app/api/v1
```

---

## 4. Domain Configuration

1. Railway → Backend → Settings → Networking → Public networking → Enable
2. Backend URL format: `https://backend.<id>.railway.app`
3. Frontend → Settings → Domains → Add custom domain (optional)

---

## 5. Health Check

```bash
curl https://your-backend.railway.app/api/health
```

Expected response:

```json
{"status":"ok","timestamp":"2026-...","uptime":1234}
```

---

## 6. Database Migration

Sau khi deploy, chạy migration:

```bash
cd backend
railway run npx prisma migrate deploy
railway run npx prisma db seed
```

---

## 7. Troubleshooting

### 502 Bad Gateway

Backend chưa start. Kiểm tra logs:
```bash
railway logs
```

### CORS Error

Đảm bảo `ALLOWED_ORIGINS` trong backend env bao gồm frontend URL.

### Prisma Connection Error

Kiểm tra `DATABASE_URL` đúng format:
```
postgresql://<user>:<password>@<host>:<port>/<database>?sslmode=require
```

# Environment Variables

Danh sách biến môi trường **thực sự được code đọc** (đã verify bằng cách
grep `process.env.*` / `configService.get(...)` trong toàn bộ `backend/src`).
Đặt tên sai so với bảng này sẽ khiến biến bị bỏ qua trong im lặng — app vẫn
chạy nhưng dùng giá trị mặc định hardcode, không báo lỗi gì cả.

---

## Backend — `.env`

### Database

```env
DATABASE_URL="postgresql://user:password@host:5432/dental_clinic?schema=public"
```

### Authentication

```env
# Bắt buộc — tối thiểu 32 ký tự, nếu thiếu hoặc quá ngắn app sẽ refuse to
# start (xem backend/src/auth/auth.module.ts)
JWT_SECRET="your-super-secret-jwt-key-min-32-chars-here"

# Tùy chọn — thời hạn access token, mặc định "15m" nếu không set.
JWT_ACCESS_TTL="15m"
```

Refresh token **không phải JWT** — là random token được hash rồi lưu DB
(`refresh_tokens` table), không cần secret riêng. Thời hạn hiện hardcode 7
ngày trong `auth.service.ts` (`REFRESH_TOKEN_TTL_MS`), chưa cấu hình được
qua env var.

### Redis (cache tóm tắt AI)

```env
REDIS_URL="redis://localhost:6379"
```

Không có Redis vẫn chạy được bình thường — cache tự động tắt (log warning
"Redis connect failed ... cache disabled"), không phải lỗi fatal. Chưa có
biến TTL riêng cho cache này.

### AI Service (Gemini)

```env
GEMINI_API_KEY="your-gemini-api-key"
GEMINI_MODEL="gemini-3.6-flash"
```

Thiếu `GEMINI_API_KEY` không làm app crash — tính năng tóm tắt AI tự động
fallback sang rule-based (xem `backend/src/ai/ai.service.ts`).

### Application

```env
PORT="3000"
NODE_ENV="production"

# CORS — CHỈ 1 origin duy nhất (không phải danh sách phân tách dấu phẩy),
# xem backend/src/main.ts:50. Muốn nhiều origin phải sửa code (dùng mảng
# hoặc hàm callback cho `origin` trong app.enableCors()).
CORS_ORIGIN="https://your-frontend-domain.com"

# Rate limiting (áp dụng chung; /auth/login riêng có limit 5/phút hardcode
# trong auth.controller.ts, không đọc từ 2 biến này)
THROTTLE_TTL="60000"
THROTTLE_LIMIT="100"

# Email (mock cho MVP — chưa tích hợp SMTP thật)
EMAIL_MOCK="true"
```

> Không có `LOG_LEVEL` / `LOG_PRETTY` — app chưa dùng structured logging,
> chỉ dùng NestJS `Logger` mặc định. Đặt 2 biến này không có tác dụng gì.

---

## Frontend — `.env` (Vite)

```env
VITE_API_BASE_URL="https://api.your-domain.com/api/v1"
```

### Development

```env
VITE_API_BASE_URL="http://localhost:3000/api/v1"
```

---

## Docker (`docker-compose.prod.yml` ở gốc repo)

```env
POSTGRES_USER="postgres"
POSTGRES_PASSWORD="strong-password-here"
JWT_SECRET="your-super-secret-jwt-key-min-32-chars-here"
CORS_ORIGIN="https://your-frontend-domain.com"
THROTTLE_TTL="60000"
THROTTLE_LIMIT="100"
```

`docker-compose.prod.yml` hiện tại **không** có service Redis — biến
`REDIS_URL`/`REDIS_PASSWORD` không áp dụng trừ khi bạn tự thêm service Redis
vào file compose.

---

## Security Notes

1. **Không bao giờ commit file `.env`** — đã có trong `.gitignore`.
2. **Sử dụng secrets manager** (Railway Variables, Render Secret) trên production.
3. **`JWT_SECRET` phải dài tối thiểu 32 ký tự** — app tự kiểm tra và refuse
   to start nếu không đạt.
4. **`DATABASE_URL` bắt buộc có `?sslmode=require` (hoặc `verify-ca`/
   `verify-full`) khi `NODE_ENV=production`** — app tự kiểm tra ở
   `PrismaService.onModuleInit()` và refuse to start nếu thiếu (xem
   `backend/src/prisma/prisma.service.ts`). `sslmode=prefer` (mặc định của
   libpq) hay không set gì đều bị chặn, vì cả hai đều âm thầm cho phép rớt
   về kết nối không mã hoá nếu server không hỗ trợ TLS.
5. **Cập nhật `CORS_ORIGIN`** với đúng domain frontend thật trước khi deploy
   — nếu quên set, CORS sẽ fallback về `http://localhost:5173` và chặn mọi
   request từ domain production.

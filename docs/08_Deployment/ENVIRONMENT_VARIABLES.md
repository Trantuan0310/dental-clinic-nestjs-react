# Environment Variables

Tất cả các biến môi trường cần thiết để chạy ứng dụng.

---

## Backend — `.env`

### Database

```env
DATABASE_URL="postgresql://user:password@host:5432/dental_clinic"
```

### Authentication

```env
# JWT tokens (tối thiểu 32 ký tự ngẫu nhiên)
JWT_SECRET="your-super-secret-jwt-key-min-32-chars-here"
JWT_REFRESH_SECRET="your-refresh-secret-key-min-32-chars"

# Token expiry
JWT_ACCESS_EXPIRY="15m"
JWT_REFRESH_EXPIRY="7d"
```

### Redis (AI Cache)

```env
REDIS_URL="redis://localhost:6379"
REDIS_TTL_SECONDS="86400"
```

### AI Service (Gemini)

```env
GEMINI_API_KEY="your-gemini-api-key"
GEMINI_MODEL="gemini-2.0-flash"
```

### Application

```env
PORT="3000"
NODE_ENV="production"

# CORS (frontend URL)
ALLOWED_ORIGINS="https://your-frontend-domain.com,http://localhost:5173"

# Rate limiting
THROTTLE_TTL="60000"
THROTTLE_LIMIT="100"
```

### Logging

```env
LOG_LEVEL="warn"
LOG_PRETTY="false"
```

---

## Frontend — `.env` (Vite)

```env
VITE_API_BASE_URL="https://api.your-domain.com/api/v1"

# Debug (chỉ bật khi dev)
# VITE_DEBUG="true"
```

### Development

```env
VITE_API_BASE_URL="http://localhost:3000/api/v1"
VITE_USE_MOCK="false"
```

---

## Docker — `.env`

```env
# Database
POSTGRES_USER="clinic_user"
POSTGRES_PASSWORD="strong-password-here"
POSTGRES_DB="dental_clinic"

# Redis
REDIS_PASSWORD="redis-password-here"

# App
APP_SECRET="app-secret-for-jwt"
```

---

## Security Notes

1. **Không bao giờ commit file `.env`** — đã có trong `.gitignore`
2. **Sử dụng secrets manager** (Railway Variables, Render Secret, AWS Secrets Manager) trên production
3. **JWT_SECRET phải dài tối thiểu 32 ký tự**
4. **DATABASE_URL** phải dùng SSL connection string trên production
5. **Cập nhật `ALLOWED_ORIGINS`** với domain thực tế

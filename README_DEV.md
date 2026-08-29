# 🦷 Dental Clinic - Dev Launcher (Windows)

Tập các file `.bat` để khởi động / dừng toàn bộ stack phát triển trên Windows
(Postgres + NestJS Backend + Vite Frontend) chỉ với **1 cú click chuột**.

---

## ⚡ Quick start

```bat
:: 1. Kiểm tra môi trường (Docker, Node, npm)
check-env.bat

:: 2. Khởi động tất cả (DB + Backend + Frontend, mở browser)
start-dev.bat

:: 3. Khi muốn tắt Backend + Frontend (giữ Postgres)
stop-dev.bat
```

Sau khi `start-dev.bat` chạy xong, browser tự mở tới:
- **Frontend**: http://localhost:5173
- **Swagger UI**: http://localhost:3000/api/docs

Đăng nhập mặc định:

```
Email    : admin@clinic.local
Password : Admin123!     (bắt buộc đổi ở lần đăng nhập đầu)
```

---

## 📦 Các file trong bộ launcher

| File | Mục đích | Khi nào dùng |
|---|---|---|
| `check-env.bat` | Kiểm tra Docker/Node/npm/ports | Lần đầu, hoặc khi gặp lỗi lạ |
| `start-dev.bat` | Khởi động **mọi thứ** | Mỗi lần bắt đầu dev |
| `stop-dev.bat` | Tắt Backend + Frontend (giữ DB) | Khi muốn restart nhanh, hoặc tạm dừng |
| `db-reset.bat` | **Xoá sạch** DB → migrate lại → seed | Khi cần test từ đầu |

Tất cả log ghi vào `.runtime-logs/` (đã ignore trong `.gitignore`).

---

## 🧠 Luồng hoạt động của `start-dev.bat`

```
Step 0  Kiểm tra Docker, Node, npm có sẵn không
Step 1  docker compose up -d postgres  →  pg_isready chờ OK
Step 2  npm install (lần đầu)  →  prisma generate  →  migrate deploy
        →  restore-clinic-admin-permissions  →  prisma db seed
Step 3  Start Backend (NestJS :3000) trong 1 cmd window mới
        →  curl /health chờ 200 OK
Step 4  Start Frontend (Vite :5173) trong 1 cmd window mới
        →  curl / chờ 200 OK
Step 5  Mở browser tới login + Swagger
```

Mỗi step fail sẽ dừng lại và in log để debug.

---

## 🔐 Tài khoản mặc định (từ `backend/prisma/seed.ts`)

| Role | Email | Mật khẩu | Trạng thái |
|---|---|---|---|
| `clinic_admin` | `admin@clinic.local` | `Admin123!` | PENDING_SETUP — đổi ngay lần đầu |
| `receptionist` | (chưa seed) | — | Cần tạo qua `/admin/users` sau khi login admin |
| `dentist` | (chưa seed) | — | Cần tạo qua `/admin/users` |

> Nếu cần test row-level security của dentist, sau khi login admin
> vào **Admin → Users → Create User** để tạo thêm tài khoản `dentist` và
> `receptionist`.

Ngoài `seed.ts` còn có `seed-clinical.ts` — sinh **3 tháng dữ liệu thật**
(16/05/2026 - 16/08/2026) cho mọi module:
- 80 patients, 4 dentists, 2 receptionists (giống nhau)
- 125 appointments + encounters + clinical notes + prescriptions + dental charts
- 125 invoices (~70% PAID, ~15% PARTIAL, ~10% ISSUED, ~5% DRAFT)
- Working schedules Mon-Fri (08:00-17:00) cho cả 4 dentists
- 24 shift registrations (APPROVED / PENDING / REJECTED)
- 5 inventory categories, 30 items, ~280 stock movements (kèm low-stock)
- 4 payroll periods (May/Jun PAID, Jul APPROVED, Aug DRAFT) + payslips theo dentist
- 8 expense categories, 60 expenses (DRAFT/APPROVED/REJECTED/REIMBURSED)
- 200 audit log entries

```bash
cd backend
npm run prisma:seed:clinical      # idempotent — re-runs are safe
```

Mỗi thay đổi dữ liệu qua UI (thêm payment, tạo expense, v.v.) đều phản ánh
ngay trong các báo cáo (`/billing/reports/revenue`, `/admin/audit-logs`,
v.v.) — schema đã seed thật sự, không phải snapshot.


---

## 🛠 Xử lý lỗi thường gặp

### "Docker daemon not running"
- Mở **Docker Desktop**, đợi icon whale xanh (~30s)
- Chạy lại `start-dev.bat`

### "Port 3000 already in use"
- Có BE khác đang chạy (hoặc phiên cũ chưa tắt)
- `stop-dev.bat` sẽ tự động dọn
- Hoặc: `netstat -ano | findstr :3000` rồi `taskkill /PID <pid> /F`

### "Prisma migrate deploy failed"
- Lệnh này **chỉ áp dụng migrations chưa chạy**, không tự sửa
- Nếu DB lệch: chạy `db-reset.bat` (xoá sạch volume rồi tạo lại)

### "Backend not ready after 60s"
- Mở `.runtime-logs\backend.log` xem stack trace
- Nguyên nhân thường gặp: thiếu `.env` → copy từ `.env.example`
- Hoặc JWT secret sai → kiểm tra `JWT_SECRET` trong `.env`

### "Frontend trắng trơn"
- F12 → tab Network → xem request đầu tiên
- Thường là BE chưa sẵn sàng hoặc CORS lỗi
- Refresh sau khi BE đã ở `/health` = 200

### "Permission code 403 không như mong đợi"
- Đã biết từ `backend_audit_report.md` mục #6 — ~15 permission code
  trong controller chưa có trong seed cũ
- Script `restore-clinic-admin-permissions.ts` đã fix cho `clinic_admin`,
  nhưng role khác (receptionist/dentist) vẫn có thể thiếu
- Tạm thời: cấp quyền trực tiếp qua Admin → Roles

---

## 📁 Cấu trúc thư mục sau khi chạy

```
ĐATN/
├── check-env.bat              ← kiểm tra môi trường
├── start-dev.bat              ← KHỞI ĐỘNG TẤT CẢ
├── stop-dev.bat               ← tắt BE + FE
├── db-reset.bat               ← reset DB (xoá data!)
├── README.md                  ← file này
├── backend/
│   ├── .env                   ← cần có sẵn (đã có trong repo)
│   ├── docker-compose.yml
│   ├── prisma/
│   │   ├── seed.ts                ← roles + permissions + admin user
│   │   ├── seed-clinical.ts       ← 3 months clinical data (FULL)
│   │   ├── seed-helpers.ts        ← pure helpers used by seed-clinical
│   │   └── migrations/
│   └── ...
├── frontend/
│   └── ...
└── .runtime-logs/             ← tự sinh, gitignored
    ├── backend.log
    ├── frontend.log
    ├── docker.log
    ├── prisma-migrate.log
    ├── prisma-seed.log
    └── ...
```

---

## 🚦 Tắt máy đúng cách

```bat
:: Tắt BE + FE, giữ DB chạy (restart nhanh)
stop-dev.bat

:: Tắt hẳn cả DB (giải phóng RAM)
docker compose down

:: Reset sạch DB về trạng thái ban đầu
db-reset.bat
```

---

## 🔧 Tuỳ chỉnh

Mở `start-dev.bat` ở đầu file có block `Config`:

```bat
set "BACKEND_PORT=3000"        REM đổi nếu 3000 bị chiếm
set "FRONTEND_PORT=5173"       REM đổi nếu 5173 bị chiếm
set "WAIT_DB_SECONDS=45"       REM tăng nếu máy chậm
set "WAIT_BACKEND_SECONDS=60"  REM tăng nếu compile lâu
```

Vite config (`frontend/vite.config.ts`) đã có proxy `/api` → `:3000`,
nên FE chỉ cần `http://localhost:5173` không cần đổi base URL.

---

## 🆚 So với chạy trong Docker hoàn toàn

`docker-compose.yml` định nghĩa cả service `backend` chạy trong Docker,
nhưng `start-dev.bat` chỉ dùng `postgres` từ Docker còn **BE + FE chạy
local**. Lý do:

- ✅ Hot-reload nhanh hơn (không qua Docker bind mount trên Windows)
- ✅ Debug NestJS trực tiếp từ VS Code
- ✅ Stack trace + log rõ ràng hơn
- ❌ Không phản ánh 100% môi trường production

Nếu muốn chạy full Docker, dùng:

```bash
cd backend
docker compose up -d
```

→ Vite vẫn chạy local vì dev server cần proxy `/api` linh hoạt.

---

## 📞 Khi cần trợ giúp

1. Chạy `check-env.bat` — báo lỗi cụ thể
2. Mở `.runtime-logs\<service>.log` liên quan
3. Đọc `backend_audit_report.md` mục "Vấn đề CẦN xử lý trước khi FE go-live"

Đã có sẵn:

- ✅ **90+ API endpoints** qua Swagger `/api/docs`
- ✅ **~50 màn hình** frontend
- ✅ **3 roles** + **~50 permission codes**
- ✅ **Cron jobs** cho payroll + no-show detection

---

> Made with ❤️ for the Dental Clinic team — Windows-first dev workflow.
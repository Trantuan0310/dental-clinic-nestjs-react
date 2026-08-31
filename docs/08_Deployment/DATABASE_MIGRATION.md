# Database Migration

Hướng dẫn chạy database migrations và seed data.

---

## Commands

### Development

```bash
cd backend

# Tạo migration mới
npx prisma migrate dev --name add_new_feature

# Chạy migrations
npx prisma migrate deploy

# Reset database (xóa hết data)
npx prisma migrate reset

# Seed data
npx prisma db seed
```

### Production

```bash
cd backend

# Chạy pending migrations
npx prisma migrate deploy

# Verify migration status
npx prisma migrate status
```

---

## Migration Files

Migrations nằm trong `backend/prisma/migrations/`:

| Migration | Mô tả |
|-----------|--------|
| `001_init` | Schema ban đầu — toàn bộ module (auth, users, roles, patients, appointments, medical records, billing, inventory, payroll, shift) |
| `010_perf_indexes` | Index tối ưu hiệu năng (dùng `CREATE INDEX CONCURRENTLY` — **không** chạy được qua `prisma migrate deploy` trực tiếp trên môi trường chưa hỗ trợ, xem comment đầu file migration) |
| `011_prescription_extra_fields` | Bổ sung field cho đơn thuốc |
| `012_expense_tables` | Expense module (BR-EXP-001) |

---

## Seed Data

Seed tạo:
- 3 system roles: `clinic_admin`, `receptionist`, `dentist`
- ~60 permissions đầy đủ
- 1 super admin user: `admin@clinic.local` / `Admin123!`

### Thêm seed data tùy chỉnh

Edit `backend/prisma/seed.ts` để thêm:
- Sample patients
- Sample appointments
- Sample invoices

```typescript
// Thêm vào hàm main() trong seed.ts
const samplePatient = await prisma.patient.create({
  data: {
    code: 'P000001',
    fullName: 'Nguyễn Văn A',
    dob: new Date('1990-01-15'),
    gender: 'MALE',
    primaryPhone: '0909123456',
  },
});
```

---

## Prisma Studio (Development)

```bash
npx prisma studio
# Mở http://localhost:5555
```

---

## Database Schema Documentation

Chi tiết schema: `docs/04_Database/schema-per-module/`

---

## Khôi phục database

### Từ backup file

```bash
pg_restore -h localhost -U clinic_user -d dental_clinic -c backup_file.dump
```

### Tạo backup

```bash
pg_dump -h localhost -U clinic_user -d dental_clinic -F c -f backup.dump
```

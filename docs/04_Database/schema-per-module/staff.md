# Schema — Nhân sự & Hồ sơ bác sĩ (Giai đoạn 1)

> **Module:** Staff (mới)
> **Quyết định kiến trúc:** [ADR-0009](../../ADR/0009-staff-dentist-service-scheduling-model.md) — D1: bác sĩ vẫn định danh bằng `users.id`
> **Migration dự kiến:** `019_staff_employees_dentist_profiles`
> **Ngày tạo:** 2026-09-25 · **Trạng thái:** Bản thiết kế chờ duyệt, chưa có code

---

## 1. Tách ba khái niệm

| Khái niệm | Bảng | Chứa gì | Không chứa gì |
|---|---|---|---|
| Tài khoản | `users` (giữ nguyên) | email đăng nhập, mật khẩu, vai trò, trạng thái tài khoản | thông tin nhân sự |
| Nhân sự | `employees` (mới) | mã NV, họ tên, ngày sinh, giới tính, liên hệ, loại NV, ngày vào/nghỉ, trạng thái làm việc, `user_id` (có thể trống) | quyền, mật khẩu |
| Bác sĩ | `dentist_profiles` (mới) | chứng chỉ hành nghề, chuyên môn, màu lịch, khe mặc định, nhận đặt online / bệnh nhân mới, trạng thái hành nghề | lịch làm việc (vẫn ở `working_schedules`) |

`users.full_name` được giữ lại để hiển thị và tương thích. Khi nhân viên có tài khoản, service đồng bộ `employees.full_name` sang `users.full_name`.

```mermaid
erDiagram
  USERS ||--o| EMPLOYEES : "user_id (nullable, unique)"
  EMPLOYEES ||--o| DENTIST_PROFILES : "employee_id (unique)"
  USERS ||--o| DENTIST_PROFILES : "user_id (unique, NOT NULL) = dentist_id"

  EMPLOYEES {
    uuid id PK
    string code UK "NV-00001"
    string full_name
    date dob
    enum gender
    string phone
    string email
    string address
    enum employee_type
    date hire_date
    date termination_date
    enum employment_status
    uuid user_id FK "nullable, unique khi active"
  }
  DENTIST_PROFILES {
    uuid id PK
    uuid employee_id FK UK
    uuid user_id FK UK "khóa dùng làm dentist_id"
    string license_number UK
    date license_issued_at
    string[] specialties
    string calendar_color
    int default_slot_minutes
    bool accepts_online_booking
    bool accepts_new_patients
    enum practice_status
  }
```

---

## 2. Bảng `employees`

| Cột | Kiểu | Null | Mặc định | Ràng buộc / ghi chú |
|---|---|---|---|---|
| `id` | UUID | NO | `uuid_generate_v7()` | PK |
| `code` | VARCHAR(20) | NO | — | Duy nhất. Dạng `NV-00001`, sinh từ `employee_code_seq`; không đổi sau khi tạo |
| `full_name` | VARCHAR(200) | NO | — | |
| `dob` | DATE | YES | NULL | Nếu có thì phải ≤ hôm nay |
| `gender` | `"Gender"` | YES | NULL | Dùng lại enum `Gender` của bệnh nhân |
| `phone` | VARCHAR(20) | YES | NULL | Validate SĐT Việt Nam ở DTO (giống patient) |
| `email` | VARCHAR(255) | YES | NULL | Email liên hệ; **khác** email đăng nhập của `users` |
| `address` | TEXT | YES | NULL | |
| `employee_type` | `"EmployeeType"` | NO | — | `DENTIST`, `ASSISTANT`, `RECEPTIONIST`, `MANAGER`, `OTHER` |
| `hire_date` | DATE | NO | `CURRENT_DATE` | |
| `termination_date` | DATE | YES | NULL | Bắt buộc khi `employment_status = TERMINATED`; phải ≥ `hire_date` |
| `employment_status` | `"EmploymentStatus"` | NO | `ACTIVE` | `ACTIVE`, `ON_LEAVE`, `TERMINATED` |
| `user_id` | UUID | YES | NULL | FK → `users.id`. Mỗi tài khoản gắn với tối đa một nhân viên còn hiệu lực |
| `notes` | TEXT | YES | NULL | |
| `created_at`, `updated_at` | TIMESTAMPTZ | NO | `now()` | |
| `created_by`, `updated_by` | UUID | YES | NULL | FK → `users.id` |
| `deleted_at` | TIMESTAMPTZ | YES | NULL | Chỉ dùng khi tạo nhầm; nghỉ việc thì dùng `TERMINATED` |

**Ràng buộc và index**

```sql
CREATE UNIQUE INDEX employees_code_key ON employees (code);
CREATE UNIQUE INDEX employees_user_active_key ON employees (user_id)
  WHERE user_id IS NOT NULL AND deleted_at IS NULL;
ALTER TABLE employees ADD CONSTRAINT employees_termination_chk
  CHECK (termination_date IS NULL OR termination_date >= hire_date);
ALTER TABLE employees ADD CONSTRAINT employees_terminated_has_date_chk
  CHECK (employment_status <> 'TERMINATED' OR termination_date IS NOT NULL);
CREATE INDEX employees_type_status_idx ON employees (employee_type, employment_status)
  WHERE deleted_at IS NULL;
```

---

## 3. Bảng `dentist_profiles`

| Cột | Kiểu | Null | Mặc định | Ràng buộc / ghi chú |
|---|---|---|---|---|
| `id` | UUID | NO | `uuid_generate_v7()` | PK |
| `employee_id` | UUID | NO | — | FK → `employees.id`, duy nhất |
| `user_id` | UUID | NO | — | FK → `users.id`, duy nhất. **Là giá trị dùng làm `dentist_id` ở mọi bảng khác (D1)**; phải bằng `employees.user_id` |
| `license_number` | VARCHAR(50) | YES | NULL | Số chứng chỉ hành nghề; duy nhất trong các hồ sơ còn hiệu lực |
| `license_issued_at` | DATE | YES | NULL | |
| `specialties` | TEXT[] | NO | `'{}'` | Chuyên môn (vd: `NHA_CHU`, `CHINH_NHA`, `NHO_RANG`); danh sách mã cố định ở DTO |
| `calendar_color` | CHAR(7) | NO | — | `#RRGGBB`, dùng để tô màu trên lịch |
| `default_slot_minutes` | SMALLINT | NO | `30` | Trong khoảng 15–120; dùng khi lịch làm việc không đặt khe riêng |
| `accepts_online_booking` | BOOLEAN | NO | `false` | |
| `accepts_new_patients` | BOOLEAN | NO | `true` | |
| `practice_status` | `"PracticeStatus"` | NO | `ACTIVE` | `ACTIVE`, `SUSPENDED`, `INACTIVE` |
| `bio` | TEXT | YES | NULL | Giới thiệu ngắn (cho đặt lịch online sau này) |
| `created_at`, `updated_at`, `created_by`, `updated_by`, `deleted_at` | | | | Như `employees` |

```sql
CREATE UNIQUE INDEX dentist_profiles_employee_key ON dentist_profiles (employee_id);
CREATE UNIQUE INDEX dentist_profiles_user_key ON dentist_profiles (user_id);
CREATE UNIQUE INDEX dentist_profiles_license_active_key ON dentist_profiles (license_number)
  WHERE license_number IS NOT NULL AND deleted_at IS NULL;
ALTER TABLE dentist_profiles ADD CONSTRAINT dentist_profiles_color_chk
  CHECK (calendar_color ~ '^#[0-9A-Fa-f]{6}$');
ALTER TABLE dentist_profiles ADD CONSTRAINT dentist_profiles_slot_chk
  CHECK (default_slot_minutes BETWEEN 15 AND 120);
```

`dentist_profiles.user_id` không thể là khóa ngoại tổng hợp tới `employees (id, user_id)`, vì `employees.user_id` được phép để trống. Vì vậy tính nhất quán được kiểm tra ở service: khi tạo hồ sơ bác sĩ, nhân viên phải có `user_id` và hai giá trị phải bằng nhau.

---

## 4. Quy tắc nghiệp vụ

| Mã | Quy tắc |
|---|---|
| BR-STAFF-001 | Mã nhân viên do hệ thống sinh (`NV-` + 5 chữ số, tăng dần), duy nhất, không sửa được. |
| BR-STAFF-002 | Chuyển nhân viên thành bác sĩ: nhân viên phải `ACTIVE`, có tài khoản (liên kết sẵn hoặc tạo mới ngay trong bước này), và tài khoản đó sẽ được gán thêm role `dentist`. |
| BR-STAFF-003 | Mỗi tài khoản gắn với tối đa một nhân viên còn hiệu lực. Mỗi nhân viên có tối đa một hồ sơ bác sĩ. |
| BR-STAFF-004 | Không cho bác sĩ chuyển sang `INACTIVE`/`SUSPENDED`, và không cho nhân viên là bác sĩ chuyển sang `TERMINATED`, nếu còn lịch hẹn tương lai ở trạng thái `SCHEDULED`/`CONFIRMED`/`CHECKED_IN`. API trả 409 kèm danh sách lịch cần điều phối lại. |
| BR-STAFF-005 | Nhân viên nghỉ việc (`TERMINATED`): tài khoản liên kết bị vô hiệu hóa (`users.status = DEACTIVATED`, thu hồi refresh token) trong cùng transaction. |
| BR-STAFF-006 | Chỉ bác sĩ có `practice_status = ACTIVE` xuất hiện trong danh sách chọn bác sĩ khi đặt lịch và được `validateDentist()` chấp nhận. Trong thời gian chuyển đổi, bác sĩ chưa có hồ sơ vẫn được chấp nhận theo role như hiện nay (xem mục 7). |
| BR-STAFF-007 | Mọi thao tác tạo/sửa/ngừng nhân viên và hồ sơ bác sĩ, cùng việc liên kết tài khoản, đều ghi audit log. |

---

## 5. Migration `019_staff_employees_dentist_profiles`

Làm theo đúng quy ước của migration 016–018: `BEGIN/COMMIT`, tạo enum có điều kiện, idempotent.

```sql
BEGIN;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'EmployeeType') THEN
    CREATE TYPE "EmployeeType" AS ENUM ('DENTIST','ASSISTANT','RECEPTIONIST','MANAGER','OTHER');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'EmploymentStatus') THEN
    CREATE TYPE "EmploymentStatus" AS ENUM ('ACTIVE','ON_LEAVE','TERMINATED');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'PracticeStatus') THEN
    CREATE TYPE "PracticeStatus" AS ENUM ('ACTIVE','SUSPENDED','INACTIVE');
  END IF;
END $$;

CREATE SEQUENCE IF NOT EXISTS employee_code_seq START WITH 1 INCREMENT BY 1;

CREATE TABLE IF NOT EXISTS employees ( ... như mục 2 ... );
CREATE TABLE IF NOT EXISTS dentist_profiles ( ... như mục 3 ... );
-- index + check constraints như mục 2, 3

-- ── Chuyển dữ liệu từ users (chạy lại được, không tạo trùng) ─────────────
-- (a) Mọi user có role còn hiệu lực → employee (mỗi user một bản ghi)
INSERT INTO employees (code, full_name, employee_type, hire_date,
                       employment_status, termination_date, user_id, created_at, updated_at)
SELECT 'NV-' || lpad(nextval('employee_code_seq')::text, 5, '0'),
       u.full_name,
       CASE WHEN bool_or(r.code = 'dentist')      THEN 'DENTIST'
            WHEN bool_or(r.code = 'receptionist') THEN 'RECEPTIONIST'
            WHEN bool_or(r.code = 'clinic_admin') THEN 'MANAGER'
            ELSE 'OTHER' END::"EmployeeType",
       u.created_at::date,
       CASE WHEN u.status = 'DEACTIVATED' THEN 'TERMINATED' ELSE 'ACTIVE' END::"EmploymentStatus",
       CASE WHEN u.status = 'DEACTIVATED' THEN COALESCE(u.deactivated_at, u.updated_at)::date END,
       u.id, now(), now()
FROM users u
JOIN user_roles ur ON ur.user_id = u.id
JOIN roles r ON r.id = ur.role_id AND r.deleted_at IS NULL
WHERE u.deleted_at IS NULL
  AND NOT EXISTS (SELECT 1 FROM employees e WHERE e.user_id = u.id AND e.deleted_at IS NULL)
GROUP BY u.id
ORDER BY min(u.created_at);

-- (b) Mọi user có role dentist → dentist_profile
INSERT INTO dentist_profiles (employee_id, user_id, calendar_color, default_slot_minutes,
                              practice_status, created_at, updated_at)
SELECT e.id, e.user_id,
       (ARRAY['#2563EB','#16A34A','#DC2626','#9333EA','#EA580C','#0891B2','#DB2777','#65A30D'])
         [1 + (row_number() OVER (ORDER BY e.code) - 1) % 8],
       COALESCE((SELECT mode() WITHIN GROUP (ORDER BY ws.slot_duration_min)
                 FROM working_schedules ws
                 WHERE ws.dentist_id = e.user_id AND ws.deleted_at IS NULL), 30),
       CASE WHEN e.employment_status = 'TERMINATED' THEN 'INACTIVE' ELSE 'ACTIVE' END::"PracticeStatus",
       now(), now()
FROM employees e
WHERE e.employee_type = 'DENTIST' AND e.deleted_at IS NULL
  AND NOT EXISTS (SELECT 1 FROM dentist_profiles d WHERE d.user_id = e.user_id);
COMMIT;
```

Ghi chú:
- **Đã chạy thử** khối DDL và khối chuyển dữ liệu trên database seed (`seed.ts` + `seed-clinical.ts`), trong transaction có rollback: tạo 7 employee (1 `MANAGER`, 4 `DENTIST`, 2 `RECEPTIONIST`) và 4 dentist profile (màu lịch khác nhau, khe 30 phút); chạy lần hai thêm 0 bản ghi.
- Chuyển dữ liệu nằm **trong** migration, để database production có hồ sơ ngay khi deploy mà không cần chạy seed.
- User có cả role `dentist` lẫn `clinic_admin` được xếp loại `DENTIST`, vì hồ sơ bác sĩ là thứ nghiệp vụ lịch hẹn cần.
- `seed.ts` và `seed-clinical.ts` được cập nhật để tạo employee và dentist profile cho các tài khoản demo. Việc này cần thiết vì hai file seed tạo user **sau khi** migration đã chạy.
- Hoàn tác: `DROP TABLE dentist_profiles, employees; DROP SEQUENCE employee_code_seq; DROP TYPE ...`. Không bảng cũ nào bị sửa, nên hoàn tác không mất dữ liệu nghiệp vụ.

---

## 6. Phân quyền

| Mã quyền mới | clinic_admin | receptionist | dentist |
|---|:-:|:-:|:-:|
| `employee.read` | ✓ | ✓ | — |
| `employee.create` / `employee.update` / `employee.deactivate` | ✓ | — | — |
| `dentist.read` | ✓ | ✓ | ✓ (xem hồ sơ; chỉ sửa được của mình qua `dentist.update.own`) |
| `dentist.create` / `dentist.update` / `dentist.deactivate` | ✓ | — | — |
| `dentist.update.own` | — | — | ✓ (bio, chuyên môn, màu lịch) |
| `dentist.assign_service` | ✓ | — | — (dùng từ giai đoạn 2) |
| `dentist.manage_schedule` | ✓ | ✓ | ✓ (chỉ của mình) |

- `dentist.manage_schedule` là mã mới cho lịch làm việc; `schedule.write`/`schedule.read` vẫn được chấp nhận song song cho tới giai đoạn 3.
- Mã quyền dùng dấu `_` như các mã hiện có (`appointment.check_in`), không dùng `-` như bản kế hoạch.

---

## 7. API và tương thích

**Endpoint mới** (module `staff`, prefix `/api/v1`):

| Method | Path | Quyền |
|---|---|---|
| GET | `/employees?q=&type=&status=&page=` | `employee.read` |
| POST | `/employees` | `employee.create` |
| GET/PATCH | `/employees/:id` | `employee.read` / `employee.update` |
| POST | `/employees/:id/terminate` | `employee.deactivate` (BR-STAFF-004/005) |
| POST | `/employees/:id/account` | `employee.update` + `user.create` (liên kết user có sẵn hoặc tạo mới) |
| POST | `/employees/:id/dentist-profile` | `dentist.create` (BR-STAFF-002) |
| GET | `/dentists?q=&status=` | `dentist.read` |
| GET/PATCH | `/dentists/:userId` | `dentist.read` / `dentist.update` hoặc `.own` |
| POST | `/dentists/:userId/deactivate` | `dentist.deactivate` (BR-STAFF-004) |
| GET | `/dentists/:userId/overview` | `dentist.read` — lịch làm việc, lịch hẹn sắp tới, (giai đoạn 2) dịch vụ |

Đường dẫn bác sĩ dùng `:userId` theo D1, để khớp với `dentistId` ở mọi API khác.

**Giữ tương thích**
- `GET /appointments/dentists` giữ nguyên shape `{ id, fullName }` và thêm `calendarColor`, `practiceStatus`. `id` vẫn là `users.id`.
- `AppointmentsService.validateDentist()` chấp nhận bác sĩ nếu có hồ sơ với `practice_status = ACTIVE`. Nếu **chưa** có hồ sơ, chấp nhận theo role như cũ, kèm log cảnh báo. Nhờ vậy dữ liệu tạo trước migration hoặc do seed cũ vẫn đặt lịch được. Nhánh dự phòng này được bỏ ở PR-7.
- Tạo user qua `/users` như hiện nay vẫn hoạt động. Việc tạo employee đi kèm được thêm ở màn hình nhân sự, không bắt buộc ở API cũ.

---

## 8. Kiểm thử (PR-1)

**Unit**
- Sinh mã NV tăng dần, không trùng.
- BR-STAFF-002: không cho chuyển thành bác sĩ khi nhân viên không `ACTIVE` hoặc chưa có tài khoản; có gán role `dentist`.
- BR-STAFF-004: không cho ngừng bác sĩ khi còn lịch hẹn tương lai (409 kèm danh sách), cho phép khi đã điều phối hết.
- BR-STAFF-005: nghỉ việc thì vô hiệu hóa tài khoản và thu hồi token trong cùng transaction.
- `validateDentist()`: hồ sơ `ACTIVE` được chấp nhận; `INACTIVE` bị từ chối; chưa có hồ sơ thì dùng dự phòng theo role.
- Chỉ bác sĩ sửa được hồ sơ của chính mình với `dentist.update.own`.

**Integration (Postgres thật)**
- Migration 019 chạy trên database trống và database có dữ liệu seed; chạy hai lần không tạo bản ghi trùng.
- Chuyển dữ liệu tạo đúng số employee và dentist profile, đúng loại, đúng trạng thái, cho user bị vô hiệu hóa, và cho user có nhiều role.
- Unique một phần: tài khoản đã gắn với nhân viên bị xóa mềm thì gắn lại được.

**E2E**
- Tạo nhân viên → tạo tài khoản → chuyển thành bác sĩ → bác sĩ xuất hiện trong form đặt lịch với màu đã chọn.

---

## 9. Chưa làm ở giai đoạn này

- Chấm công, tính lương theo hồ sơ nhân sự (ngoài phạm vi, vì chỉ làm HR Core).
- Ảnh đại diện, tài liệu đính kèm của nhân viên.
- Bác sĩ không có tài khoản (xem ADR-0009, "Alternatives considered" 1).

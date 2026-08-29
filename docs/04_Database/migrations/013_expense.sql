-- =============================================================================
-- Migration 013: Expense Module (BR-EXP-001)
-- Description: Chi phí hoạt động clinic — theo dõi chi phí hàng ngày,
-- tổng hợp vào financeSummary trong billing.
-- Created: 2026-08-03
-- Author: [Author]
-- =============================================================================

-- 1. Enum types
CREATE TYPE "ExpenseStatus" AS ENUM ('DRAFT', 'APPROVED', 'REJECTED', 'REIMBURSED');
CREATE TYPE "ExpenseType" AS ENUM ('OPERATING', 'INVESTMENT', 'OTHER');

-- 2. Sequence cho expense codes
CREATE SEQUENCE expense_code_seq START 1;

-- 3. expense_categories
CREATE TABLE "expense_categories" (
    "id"              UUID         DEFAULT uuid_generate_v7() PRIMARY KEY,
    "name"            VARCHAR(100) NOT NULL,
    "description"     TEXT,
    "type"            "ExpenseType" NOT NULL DEFAULT 'OPERATING',
    "is_active"       BOOLEAN      NOT NULL DEFAULT TRUE,
    "created_at"      TIMESTAMPTZ  NOT NULL DEFAULT now(),
    "updated_at"      TIMESTAMPTZ  NOT NULL DEFAULT now(),
    CONSTRAINT "expense_categories_name_key" UNIQUE ("name")
);

-- 4. expenses
CREATE TABLE "expenses" (
    "id"              UUID         DEFAULT uuid_generate_v7() PRIMARY KEY,
    "code"            VARCHAR(20)  NOT NULL UNIQUE,
    "amount"          DECIMAL(15,0) NOT NULL,
    "description"     TEXT         NOT NULL,
    "expense_date"    DATE         NOT NULL,
    "status"          "ExpenseStatus" NOT NULL DEFAULT 'DRAFT',
    "category_id"     UUID,
    "notes"           TEXT,
    "receipt_url"     VARCHAR(500),
    "created_at"      TIMESTAMPTZ  NOT NULL DEFAULT now(),
    "updated_at"      TIMESTAMPTZ  NOT NULL DEFAULT now(),
    "created_by"      UUID,
    "updated_by"      UUID,
    "deleted_at"      TIMESTAMPTZ,
    "version"         INTEGER      NOT NULL DEFAULT 1,

    CONSTRAINT "expenses_category_id_fkey"
        FOREIGN KEY ("category_id")
        REFERENCES "expense_categories"("id")
        ON DELETE SET NULL
        ON UPDATE CASCADE,

    CONSTRAINT "expenses_created_by_fkey"
        FOREIGN KEY ("created_by")
        REFERENCES "users"("id")
        ON DELETE SET NULL
        ON UPDATE CASCADE,

    CONSTRAINT "expenses_updated_by_fkey"
        FOREIGN KEY ("updated_by")
        REFERENCES "users"("id")
        ON DELETE SET NULL
        ON UPDATE CASCADE
);

-- 5. expense_audits
CREATE TABLE "expense_audits" (
    "id"              UUID         DEFAULT uuid_generate_v7() PRIMARY KEY,
    "expense_id"      UUID         NOT NULL,
    "action"          VARCHAR(100) NOT NULL,
    "before"          JSONB,
    "after"           JSONB,
    "actor_id"        UUID,
    "actor_email"     VARCHAR(255),
    "created_at"      TIMESTAMPTZ  NOT NULL DEFAULT now(),

    CONSTRAINT "expense_audits_expense_id_fkey"
        FOREIGN KEY ("expense_id")
        REFERENCES "expenses"("id")
        ON DELETE CASCADE
        ON UPDATE CASCADE,

    CONSTRAINT "expense_audits_actor_id_fkey"
        FOREIGN KEY ("actor_id")
        REFERENCES "users"("id")
        ON DELETE SET NULL
        ON UPDATE CASCADE
);

-- 6. Indexes
CREATE INDEX "expenses_status_expense_date_idx" ON "expenses"("status", "expense_date" DESC);
CREATE INDEX "expenses_category_id_idx" ON "expenses"("category_id");
CREATE INDEX "expenses_created_by_idx" ON "expenses"("created_by");
CREATE INDEX "expense_audits_expense_id_created_at_idx" ON "expense_audits"("expense_id", "created_at" DESC);

-- 7. Seed default categories
INSERT INTO "expense_categories" ("name", "description", "type") VALUES
    ('Vật tư y tế',     'Vật tư tiêu hao, khẩu trang, găng tay, thuốc sử dụng một lần', 'OPERATING'),
    ('Điện nước',       'Chi phí điện, nước, internet hàng tháng', 'OPERATING'),
    ('Lương nhân viên', 'Lương nhân viên phục vụ, lễ tân (không tính bác sĩ)', 'OPERATING'),
    ('Marketing',        'Quảng cáo, SEO, marketing online', 'OPERATING'),
    ('Bảo trì thiết bị', 'Sửa chữa, bảo dưỡng máy móc, thiết bị nha khoa', 'OPERATING'),
    ('Thuê mặt bằng',   'Tiền thuê phòng khám hàng tháng', 'OPERATING'),
    ('Đào tạo',         'Chi phí đào tạo nhân viên, workshop, hội nghị', 'OPERATING'),
    ('Thiết bị lớn',    'Mua sắm ghế nha khoa, máy X-quang, máy siêu âm', 'INVESTMENT'),
    ('Công nghệ',       'Phần mềm quản lý, hosting, SSL, license', 'OTHER'),
    ('Khác',            'Chi phí khác không thuộc các danh mục trên', 'OTHER');

-- 8. Grant (adjust role names as needed)
-- GRANT USAGE ON SEQUENCE expense_code_seq TO app_user;
-- GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_user;
-- GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO app_user;

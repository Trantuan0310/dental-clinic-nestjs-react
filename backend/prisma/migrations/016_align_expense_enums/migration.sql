-- Migration 012 used text columns; Prisma's schema expects enum parameters.
-- Preserve existing rows and repair both fresh databases and existing installs.
BEGIN;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ExpenseStatus') THEN
    CREATE TYPE "ExpenseStatus" AS ENUM ('DRAFT', 'APPROVED', 'REJECTED', 'REIMBURSED');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ExpenseType') THEN
    CREATE TYPE "ExpenseType" AS ENUM ('OPERATING', 'INVESTMENT', 'OTHER');
  END IF;
END $$;

ALTER TABLE expenses ALTER COLUMN status DROP DEFAULT;
ALTER TABLE expenses ALTER COLUMN status TYPE "ExpenseStatus" USING status::text::"ExpenseStatus";
ALTER TABLE expenses ALTER COLUMN status SET DEFAULT 'DRAFT'::"ExpenseStatus";
ALTER TABLE expense_categories ALTER COLUMN type DROP DEFAULT;
ALTER TABLE expense_categories ALTER COLUMN type TYPE "ExpenseType" USING type::text::"ExpenseType";
ALTER TABLE expense_categories ALTER COLUMN type SET DEFAULT 'OPERATING'::"ExpenseType";
COMMIT;

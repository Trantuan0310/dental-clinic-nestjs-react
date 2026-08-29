-- Migration 012: expense tables (BR-EXP-001)
-- Adds ExpenseCategory, Expense, ExpenseAudit models + expense_code_seq

BEGIN;

-- ExpenseCategory
CREATE TABLE IF NOT EXISTS "expense_categories" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "name" varchar(100) NOT NULL,
  "description" text,
  "type" text NOT NULL DEFAULT 'OPERATING',
  "is_active" boolean NOT NULL DEFAULT true,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "expense_categories_name_unique" UNIQUE ("name")
);
CREATE INDEX IF NOT EXISTS "idx_expense_categories_type" ON "expense_categories" ("type");

-- Sequence for expense codes
CREATE SEQUENCE IF NOT EXISTS expense_code_seq START 1;

-- Expense
CREATE TABLE IF NOT EXISTS "expenses" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "code" varchar(20) NOT NULL,
  "amount" numeric(15,0) NOT NULL,
  "description" text NOT NULL,
  "expense_date" date NOT NULL,
  "status" text NOT NULL DEFAULT 'DRAFT',
  "category_id" uuid,
  "notes" text,
  "receipt_url" text,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "created_by" uuid,
  "updated_by" uuid,
  "deleted_at" timestamptz,
  "version" integer NOT NULL DEFAULT 1,
  CONSTRAINT "expenses_code_unique" UNIQUE ("code"),
  CONSTRAINT "expenses_category_fk" FOREIGN KEY ("category_id") REFERENCES "expense_categories" ("id") ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS "idx_expenses_status_date" ON "expenses" ("status", "expense_date" DESC);
CREATE INDEX IF NOT EXISTS "idx_expenses_category" ON "expenses" ("category_id");
CREATE INDEX IF NOT EXISTS "idx_expenses_created_by" ON "expenses" ("created_by");

-- ExpenseAudit
CREATE TABLE IF NOT EXISTS "expense_audits" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "expense_id" uuid NOT NULL,
  "action" varchar(50) NOT NULL,
  "before" jsonb,
  "after" jsonb,
  "actor_id" uuid,
  "actor_email" varchar(255),
  "created_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "expense_audits_expense_fk" FOREIGN KEY ("expense_id") REFERENCES "expenses" ("id") ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS "idx_expense_audits_expense_date" ON "expense_audits" ("expense_id", "created_at" DESC);

COMMIT;

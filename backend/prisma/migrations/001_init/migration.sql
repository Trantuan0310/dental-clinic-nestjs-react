-- =============================================================================
-- Migration 001_init — Initial schema for Dental Clinic Management System
-- Generated from prisma/schema.prisma on 2026-07-18.
-- Requires PostgreSQL 13+ with extensions: uuid-ossp (uuid_generate_v7), pg_trgm, btree_gist.
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";
CREATE EXTENSION IF NOT EXISTS "btree_gist";
-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'PENDING_SETUP', 'DEACTIVATED');

-- CreateEnum
CREATE TYPE "ActionAudit" AS ENUM ('LOGIN_SUCCESS', 'LOGIN_FAILED', 'REFRESH_REUSE_DETECTED', 'PASSWORD_RESET_REQUESTED', 'PASSWORD_RESET_DONE', 'PASSWORD_CHANGED', 'USER_CREATED', 'USER_ROLE_CHANGED', 'USER_DEACTIVATED', 'USER_REACTIVATED', 'USER_PASSWORD_RESET_BY_ADMIN', 'ROLE_CREATED', 'ROLE_PERMISSIONS_CHANGED', 'LOGOUT_ALL');

-- CreateEnum
CREATE TYPE "Gender" AS ENUM ('MALE', 'FEMALE', 'OTHER', 'UNDISCLOSED');

-- CreateEnum
CREATE TYPE "IdentifierType" AS ENUM ('CCCD', 'CMND', 'PASSPORT');

-- CreateEnum
CREATE TYPE "AppointmentStatus" AS ENUM ('SCHEDULED', 'CONFIRMED', 'CHECKED_IN', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'NO_SHOW');

-- CreateEnum
CREATE TYPE "AppointmentSource" AS ENUM ('WALK_IN', 'PHONE', 'ONLINE', 'RETURNING');

-- CreateEnum
CREATE TYPE "TimeOffType" AS ENUM ('VACATION', 'SICK', 'TRAINING', 'OTHER');

-- CreateEnum
CREATE TYPE "EncounterStatus" AS ENUM ('IN_PROGRESS', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PatientType" AS ENUM ('ADULT', 'CHILD');

-- CreateEnum
CREATE TYPE "InvoiceStatus" AS ENUM ('DRAFT', 'ISSUED', 'PARTIAL', 'PAID', 'VOIDED');

-- CreateEnum
CREATE TYPE "DiscountType" AS ENUM ('PERCENT', 'AMOUNT');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('CASH', 'BANK_TRANSFER');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('COMPLETED', 'VOIDED');

-- CreateEnum
CREATE TYPE "ItemStatus" AS ENUM ('ACTIVE', 'DISCONTINUED');

-- CreateEnum
CREATE TYPE "MovementType" AS ENUM ('STOCK_IN', 'STOCK_OUT', 'ADJUSTMENT');

-- CreateEnum
CREATE TYPE "MovementRefType" AS ENUM ('ENCOUNTER', 'MANUAL', 'ADJUSTMENT');

-- CreateEnum
CREATE TYPE "ShiftType" AS ENUM ('MORNING', 'AFTERNOON', 'FULL_DAY', 'NIGHT');

-- CreateEnum
CREATE TYPE "PayrollCycle" AS ENUM ('WEEKLY', 'BIWEEKLY', 'MONTHLY');

-- CreateEnum
CREATE TYPE "PayrollPeriodStatus" AS ENUM ('DRAFT', 'REVIEWING', 'APPROVED', 'PAID', 'LOCKED');

-- CreateEnum
CREATE TYPE "PayrollAdjustmentType" AS ENUM ('BONUS', 'PENALTY', 'DEDUCTION', 'MANUAL_OVERRIDE');

-- CreateEnum
CREATE TYPE "ShiftRegistrationStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v7(),
    "email" VARCHAR(255) NOT NULL,
    "password_hash" TEXT NOT NULL,
    "full_name" VARCHAR(200) NOT NULL,
    "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "failed_login_attempts" INTEGER NOT NULL DEFAULT 0,
    "locked_until" TIMESTAMPTZ,
    "last_login_at" TIMESTAMPTZ,
    "deactivated_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,
    "deleted_at" TIMESTAMPTZ,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "roles" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v7(),
    "code" VARCHAR(50) NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "description" TEXT,
    "is_system" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "created_by" UUID,
    "deleted_at" TIMESTAMPTZ,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "permissions" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v7(),
    "code" VARCHAR(100) NOT NULL,
    "resource" VARCHAR(50) NOT NULL,
    "action" VARCHAR(50) NOT NULL,
    "description" TEXT,
    "is_system" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_roles" (
    "user_id" UUID NOT NULL,
    "role_id" UUID NOT NULL,
    "assigned_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "assigned_by" UUID,

    CONSTRAINT "user_roles_pkey" PRIMARY KEY ("user_id","role_id")
);

-- CreateTable
CREATE TABLE "role_permissions" (
    "role_id" UUID NOT NULL,
    "permission_id" UUID NOT NULL,

    CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("role_id","permission_id")
);

-- CreateTable
CREATE TABLE "refresh_tokens" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v7(),
    "user_id" UUID NOT NULL,
    "token_hash" VARCHAR(64) NOT NULL,
    "expires_at" TIMESTAMPTZ NOT NULL,
    "revoked_at" TIMESTAMPTZ,
    "replaced_by_token" UUID,
    "user_agent" TEXT,
    "ip_address" VARCHAR(45),
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "password_reset_tokens" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v7(),
    "user_id" UUID NOT NULL,
    "token_hash" VARCHAR(64) NOT NULL,
    "expires_at" TIMESTAMPTZ NOT NULL,
    "used_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "password_reset_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v7(),
    "actor_user_id" UUID,
    "actor_email_at_time" VARCHAR(255),
    "action" VARCHAR(100) NOT NULL,
    "target_type" VARCHAR(50),
    "target_id" UUID,
    "metadata" JSONB,
    "ip_address" VARCHAR(45),
    "user_agent" TEXT,
    "occurred_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "patients" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v7(),
    "code" VARCHAR(20) NOT NULL,
    "full_name" VARCHAR(200) NOT NULL,
    "dob" DATE NOT NULL,
    "gender" "Gender" NOT NULL,
    "primary_phone" VARCHAR(20),
    "email" VARCHAR(255),
    "address" TEXT,
    "occupation" VARCHAR(100),
    "allergies" JSONB NOT NULL DEFAULT '[]',
    "chronic_diseases" JSONB NOT NULL DEFAULT '[]',
    "current_medications" JSONB NOT NULL DEFAULT '[]',
    "contact_person_name" VARCHAR(200),
    "contact_person_phone" VARCHAR(20),
    "notes" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,
    "deleted_at" TIMESTAMPTZ,
    "deleted_by" UUID,

    CONSTRAINT "patients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "patient_phone_history" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v7(),
    "patient_id" UUID NOT NULL,
    "old_phone" VARCHAR(20),
    "new_phone" VARCHAR(20) NOT NULL,
    "changed_by" UUID,
    "changed_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "patient_phone_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "patient_identifiers" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v7(),
    "patient_id" UUID NOT NULL,
    "type" "IdentifierType" NOT NULL,
    "value" VARCHAR(50) NOT NULL,
    "issued_at" DATE,
    "issued_by" VARCHAR(200),
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "deleted_at" TIMESTAMPTZ,

    CONSTRAINT "patient_identifiers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "patient_merge_logs" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v7(),
    "source_patient_id" UUID NOT NULL,
    "target_patient_id" UUID NOT NULL,
    "field_mapping" JSONB NOT NULL,
    "migrated_fk_count" JSONB NOT NULL,
    "merged_by" UUID NOT NULL,
    "merged_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "patient_merge_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "appointments" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v7(),
    "patient_id" UUID NOT NULL,
    "dentist_id" UUID NOT NULL,
    "start_at" TIMESTAMPTZ NOT NULL,
    "end_at" TIMESTAMPTZ NOT NULL,
    "status" "AppointmentStatus" NOT NULL DEFAULT 'SCHEDULED',
    "reason" TEXT,
    "notes" TEXT,
    "source" "AppointmentSource" NOT NULL DEFAULT 'PHONE',
    "confirmed_at" TIMESTAMPTZ,
    "confirmed_by" UUID,
    "checked_in_at" TIMESTAMPTZ,
    "checked_in_by" UUID,
    "cancelled_at" TIMESTAMPTZ,
    "cancelled_by" UUID,
    "cancelled_reason" TEXT,
    "no_show_at" TIMESTAMPTZ,
    "reschedule_count" INTEGER NOT NULL DEFAULT 0,
    "last_reschedule_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,
    "deleted_at" TIMESTAMPTZ,

    CONSTRAINT "appointments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "working_schedules" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v7(),
    "dentist_id" UUID NOT NULL,
    "day_of_week" INTEGER NOT NULL,
    "start_time" TIME(0) NOT NULL,
    "end_time" TIME(0) NOT NULL,
    "slot_duration_min" INTEGER NOT NULL DEFAULT 30,
    "valid_from" DATE NOT NULL,
    "valid_to" DATE,
    "is_paid_shift" BOOLEAN NOT NULL DEFAULT true,
    "shift_type" "ShiftType" NOT NULL DEFAULT 'FULL_DAY',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "created_by" UUID,
    "deleted_at" TIMESTAMPTZ,

    CONSTRAINT "working_schedules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "time_offs" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v7(),
    "dentist_id" UUID NOT NULL,
    "start_at" TIMESTAMPTZ NOT NULL,
    "end_at" TIMESTAMPTZ NOT NULL,
    "type" "TimeOffType" NOT NULL,
    "reason" TEXT,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ,

    CONSTRAINT "time_offs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "appointment_reschedule_logs" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v7(),
    "appointment_id" UUID NOT NULL,
    "old_dentist_id" UUID,
    "old_start_at" TIMESTAMPTZ NOT NULL,
    "old_end_at" TIMESTAMPTZ NOT NULL,
    "new_dentist_id" UUID,
    "new_start_at" TIMESTAMPTZ NOT NULL,
    "new_end_at" TIMESTAMPTZ NOT NULL,
    "reason" TEXT,
    "changed_by" UUID NOT NULL,
    "changed_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "appointment_reschedule_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "encounters" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v7(),
    "appointment_id" UUID NOT NULL,
    "patient_id" UUID NOT NULL,
    "dentist_id" UUID NOT NULL,
    "status" "EncounterStatus" NOT NULL DEFAULT 'IN_PROGRESS',
    "started_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closed_at" TIMESTAMPTZ,
    "summary" TEXT,
    "chief_complaint" TEXT,
    "diagnosis" TEXT,
    "treatment_plan_text" TEXT,
    "cancelled_at" TIMESTAMPTZ,
    "cancelled_by" UUID,
    "cancelled_reason" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "encounters_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clinical_notes" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v7(),
    "encounter_id" UUID NOT NULL,
    "chief_complaint" TEXT,
    "diagnosis" TEXT,
    "treatment_plan" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "last_edited_by" UUID,
    "is_locked" BOOLEAN NOT NULL DEFAULT false,
    "locked_at" TIMESTAMPTZ,

    CONSTRAINT "clinical_notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clinical_note_addendums" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v7(),
    "clinical_note_id" UUID NOT NULL,
    "content" TEXT NOT NULL,
    "added_by" UUID NOT NULL,
    "added_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "clinical_note_addendums_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "treatments" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v7(),
    "encounter_id" UUID NOT NULL,
    "tooth_numbers" JSONB,
    "procedure" TEXT NOT NULL,
    "description" TEXT,
    "unit_price" DECIMAL(12,2) NOT NULL,
    "duration_minutes" INTEGER,
    "sequence" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "created_by" UUID,
    "deleted_at" TIMESTAMPTZ,

    CONSTRAINT "treatments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "treatment_inventory_usages" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v7(),
    "treatment_id" UUID NOT NULL,
    "inventory_item_id" UUID NOT NULL,
    "quantity" DECIMAL(12,4) NOT NULL,
    "unit" VARCHAR(20) NOT NULL,

    CONSTRAINT "treatment_inventory_usages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "prescriptions" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v7(),
    "encounter_id" UUID NOT NULL,
    "notes" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "deleted_at" TIMESTAMPTZ,

    CONSTRAINT "prescriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "prescription_lines" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v7(),
    "prescription_id" UUID NOT NULL,
    "sequence" INTEGER NOT NULL DEFAULT 0,
    "drug_name" VARCHAR(255) NOT NULL,
    "dosage" VARCHAR(100) NOT NULL,
    "frequency" VARCHAR(100) NOT NULL,
    "duration" VARCHAR(100) NOT NULL,
    "instructions" TEXT,
    "deleted_at" TIMESTAMPTZ,

    CONSTRAINT "prescription_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dental_chart_snapshots" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v7(),
    "encounter_id" UUID NOT NULL,
    "patient_type" "PatientType" NOT NULL,
    "teeth" JSONB NOT NULL,
    "snapshot_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "snapshot_by" UUID,

    CONSTRAINT "dental_chart_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "encounter_audits" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v7(),
    "encounter_id" UUID NOT NULL,
    "action" VARCHAR(50) NOT NULL,
    "actor_id" UUID NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "occurred_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "encounter_audits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoices" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v7(),
    "code" VARCHAR(20) NOT NULL,
    "encounter_id" UUID NOT NULL,
    "patient_id" UUID NOT NULL,
    "status" "InvoiceStatus" NOT NULL DEFAULT 'DRAFT',
    "subtotal" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "discount_type" "DiscountType",
    "discount_value" DECIMAL(12,2),
    "total" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "paid_amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "outstanding_amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "notes" TEXT,
    "issued_at" TIMESTAMPTZ,
    "issued_by" UUID,
    "voided_at" TIMESTAMPTZ,
    "voided_by" UUID,
    "void_reason" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "created_by" UUID,
    "version" INTEGER NOT NULL DEFAULT 0,
    "deleted_at" TIMESTAMPTZ,

    CONSTRAINT "invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoice_items" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v7(),
    "invoice_id" UUID NOT NULL,
    "treatment_id" UUID,
    "sequence" INTEGER NOT NULL DEFAULT 0,
    "description" TEXT NOT NULL,
    "quantity" DECIMAL(8,2) NOT NULL DEFAULT 1,
    "unit_price" DECIMAL(12,2) NOT NULL,
    "line_total" DECIMAL(12,2) NOT NULL,
    "deleted_at" TIMESTAMPTZ,

    CONSTRAINT "invoice_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v7(),
    "invoice_id" UUID NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "status" "PaymentStatus" NOT NULL DEFAULT 'COMPLETED',
    "paid_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "note" TEXT,
    "received_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoice_audits" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v7(),
    "invoice_id" UUID NOT NULL,
    "action" VARCHAR(50) NOT NULL,
    "actor_id" UUID,
    "before" JSONB,
    "after" JSONB,
    "occurred_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "invoice_audits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_categories" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v7(),
    "name" VARCHAR(100) NOT NULL,
    "description" TEXT,
    "parent_id" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,
    "deleted_at" TIMESTAMPTZ,

    CONSTRAINT "inventory_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_items" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v7(),
    "sku" VARCHAR(50) NOT NULL,
    "category_id" UUID,
    "name" VARCHAR(200) NOT NULL,
    "description" TEXT,
    "quantity_on_hand" DECIMAL(12,4) NOT NULL DEFAULT 0,
    "min_stock_level" DECIMAL(12,4) NOT NULL DEFAULT 0,
    "unit" VARCHAR(20) NOT NULL,
    "cost_price" DECIMAL(12,4),
    "status" "ItemStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "created_by" UUID,
    "deleted_at" TIMESTAMPTZ,

    CONSTRAINT "inventory_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_movements" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v7(),
    "inventory_item_id" UUID NOT NULL,
    "type" "MovementType" NOT NULL,
    "ref_type" "MovementRefType",
    "ref_id" UUID,
    "quantity_before" DECIMAL(12,4) NOT NULL,
    "quantity_after" DECIMAL(12,4) NOT NULL,
    "diff" DECIMAL(12,4) NOT NULL,
    "reason" TEXT,
    "performed_by" UUID,
    "performed_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_movements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shift_registrations" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v7(),
    "dentist_id" UUID NOT NULL,
    "date" DATE NOT NULL,
    "start_time" VARCHAR(5) NOT NULL,
    "end_time" VARCHAR(5) NOT NULL,
    "max_encounters" INTEGER,
    "notes" TEXT,
    "status" "ShiftRegistrationStatus" NOT NULL DEFAULT 'PENDING',
    "approved_by_user_id" UUID,
    "approved_at" TIMESTAMPTZ,
    "rejection_reason" TEXT,
    "cancelled_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "created_by_user_id" UUID,
    "deleted_at" TIMESTAMPTZ,

    CONSTRAINT "shift_registrations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payroll_config" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v7(),
    "payroll_cycle" "PayrollCycle" NOT NULL DEFAULT 'MONTHLY',
    "overtime_multiplier" DECIMAL(4,2) NOT NULL DEFAULT 1.50,
    "default_tax_tncn_pct" DECIMAL(5,4) NOT NULL DEFAULT 0.10,
    "bhxh_pct" DECIMAL(5,4) NOT NULL DEFAULT 0.08,
    "bhyt_pct" DECIMAL(5,4) NOT NULL DEFAULT 0.015,
    "bhtn_pct" DECIMAL(5,4) NOT NULL DEFAULT 0.01,
    "min_gross_for_bhxh" DECIMAL(15,0) NOT NULL DEFAULT 4680000,
    "probation_salary_pct" DECIMAL(4,2) NOT NULL DEFAULT 0.85,
    "tax_brackets" JSONB NOT NULL,
    "updated_by_user_id" UUID,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "payroll_config_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dentist_compensations" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v7(),
    "dentist_id" UUID NOT NULL,
    "effective_from" DATE NOT NULL,
    "effective_to" DATE,
    "base_salary_vnd" DECIMAL(15,0) NOT NULL,
    "commission_pct" DECIMAL(5,4) NOT NULL DEFAULT 0,
    "overtime_hourly_vnd" DECIMAL(15,0) NOT NULL DEFAULT 0,
    "approved_by_user_id" UUID,
    "approved_at" TIMESTAMPTZ,
    "notes" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "deleted_at" TIMESTAMPTZ,

    CONSTRAINT "dentist_compensations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payroll_periods" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v7(),
    "period_start" DATE NOT NULL,
    "period_end" DATE NOT NULL,
    "payroll_cycle" "PayrollCycle" NOT NULL,
    "status" "PayrollPeriodStatus" NOT NULL DEFAULT 'DRAFT',
    "config_snapshot" JSONB NOT NULL,
    "opened_from_period_id" UUID,
    "created_by_user_id" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "locked_by_user_id" UUID,
    "locked_at" TIMESTAMPTZ,
    "approved_by_user_id" UUID,
    "approved_at" TIMESTAMPTZ,
    "marked_paid_by_user_id" UUID,
    "paid_at" TIMESTAMPTZ,
    "payment_reference" TEXT,
    "locked_immutable_at" TIMESTAMPTZ,

    CONSTRAINT "payroll_periods_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payroll_line_items" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v7(),
    "payroll_period_id" UUID NOT NULL,
    "dentist_id" UUID NOT NULL,
    "encounters_count" INTEGER NOT NULL DEFAULT 0,
    "total_revenue_vnd" DECIMAL(15,0) NOT NULL DEFAULT 0,
    "worked_shifts" INTEGER NOT NULL DEFAULT 0,
    "total_hours" DECIMAL(8,2) NOT NULL DEFAULT 0,
    "overtime_hours" DECIMAL(8,2) NOT NULL DEFAULT 0,
    "base_salary_vnd" DECIMAL(15,0) NOT NULL DEFAULT 0,
    "commission_vnd" DECIMAL(15,0) NOT NULL DEFAULT 0,
    "overtime_pay_vnd" DECIMAL(15,0) NOT NULL DEFAULT 0,
    "bonus_vnd" DECIMAL(15,0) NOT NULL DEFAULT 0,
    "penalty_vnd" DECIMAL(15,0) NOT NULL DEFAULT 0,
    "gross_pay_vnd" DECIMAL(15,0) NOT NULL DEFAULT 0,
    "tax_tncn_vnd" DECIMAL(15,0) NOT NULL DEFAULT 0,
    "bhxh_vnd" DECIMAL(15,0) NOT NULL DEFAULT 0,
    "net_pay_vnd" DECIMAL(15,0) NOT NULL DEFAULT 0,
    "computation_log" JSONB NOT NULL,
    "manually_adjusted" BOOLEAN NOT NULL DEFAULT false,
    "adjustment_note" TEXT,
    "computed_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "payroll_line_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payroll_encounter_details" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v7(),
    "payroll_line_item_id" UUID NOT NULL,
    "payroll_period_id" UUID NOT NULL,
    "encounter_id" UUID NOT NULL,
    "treatment_id" UUID NOT NULL,
    "treatment_revenue_vnd" DECIMAL(15,0) NOT NULL,
    "encounter_start_at" TIMESTAMPTZ NOT NULL,
    "encounter_end_at" TIMESTAMPTZ NOT NULL,
    "duration_minutes" INTEGER NOT NULL,
    "treatment_breakdown" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payroll_encounter_details_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payroll_adjustments" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v7(),
    "payroll_line_item_id" UUID NOT NULL,
    "type" "PayrollAdjustmentType" NOT NULL,
    "amount_vnd" DECIMAL(15,0) NOT NULL,
    "reason" TEXT NOT NULL,
    "adjusted_by_user_id" UUID NOT NULL,
    "adjusted_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payroll_adjustments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "users_status_idx" ON "users"("status");

-- CreateIndex
CREATE INDEX "users_deactivated_at_idx" ON "users"("deactivated_at");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "roles_code_key" ON "roles"("code");

-- CreateIndex
CREATE INDEX "permissions_resource_idx" ON "permissions"("resource");

-- CreateIndex
CREATE UNIQUE INDEX "permissions_code_key" ON "permissions"("code");

-- CreateIndex
CREATE INDEX "user_roles_role_id_idx" ON "user_roles"("role_id");

-- CreateIndex
CREATE UNIQUE INDEX "refresh_tokens_token_hash_key" ON "refresh_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "refresh_tokens_user_id_idx" ON "refresh_tokens"("user_id");

-- CreateIndex
CREATE INDEX "refresh_tokens_expires_at_idx" ON "refresh_tokens"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "password_reset_tokens_token_hash_key" ON "password_reset_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "password_reset_tokens_user_id_idx" ON "password_reset_tokens"("user_id");

-- CreateIndex
CREATE INDEX "audit_logs_occurred_at_idx" ON "audit_logs"("occurred_at" DESC);

-- CreateIndex
CREATE INDEX "audit_logs_actor_user_id_occurred_at_idx" ON "audit_logs"("actor_user_id", "occurred_at" DESC);

-- CreateIndex
CREATE INDEX "audit_logs_action_occurred_at_idx" ON "audit_logs"("action", "occurred_at" DESC);

-- CreateIndex
CREATE INDEX "patients_primary_phone_idx" ON "patients"("primary_phone");

-- CreateIndex
CREATE INDEX "patients_full_name_idx" ON "patients"("full_name");

-- CreateIndex
CREATE INDEX "patients_created_at_idx" ON "patients"("created_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "patients_code_key" ON "patients"("code");

-- CreateIndex
CREATE INDEX "patient_phone_history_patient_id_changed_at_idx" ON "patient_phone_history"("patient_id", "changed_at" DESC);

-- CreateIndex
CREATE INDEX "patient_identifiers_patient_id_idx" ON "patient_identifiers"("patient_id");

-- CreateIndex
CREATE UNIQUE INDEX "patient_identifiers_type_value_key" ON "patient_identifiers"("type", "value");

-- CreateIndex
CREATE INDEX "patient_merge_logs_target_patient_id_merged_at_idx" ON "patient_merge_logs"("target_patient_id", "merged_at" DESC);

-- CreateIndex
CREATE INDEX "appointments_dentist_id_start_at_idx" ON "appointments"("dentist_id", "start_at");

-- CreateIndex
CREATE INDEX "appointments_patient_id_start_at_idx" ON "appointments"("patient_id", "start_at" DESC);

-- CreateIndex
CREATE INDEX "appointments_start_at_idx" ON "appointments"("start_at");

-- CreateIndex
CREATE INDEX "appointments_status_start_at_idx" ON "appointments"("status", "start_at");

-- CreateIndex
CREATE UNIQUE INDEX "appointments_dentist_id_start_at_key" ON "appointments"("dentist_id", "start_at");

-- CreateIndex
CREATE INDEX "working_schedules_dentist_id_day_of_week_valid_from_idx" ON "working_schedules"("dentist_id", "day_of_week", "valid_from" DESC);

-- CreateIndex
CREATE INDEX "time_offs_dentist_id_start_at_end_at_idx" ON "time_offs"("dentist_id", "start_at", "end_at");

-- CreateIndex
CREATE INDEX "appointment_reschedule_logs_appointment_id_changed_at_idx" ON "appointment_reschedule_logs"("appointment_id", "changed_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "encounters_appointment_id_key" ON "encounters"("appointment_id");

-- CreateIndex
CREATE INDEX "encounters_patient_id_started_at_idx" ON "encounters"("patient_id", "started_at" DESC);

-- CreateIndex
CREATE INDEX "encounters_dentist_id_started_at_idx" ON "encounters"("dentist_id", "started_at" DESC);

-- CreateIndex
CREATE INDEX "encounters_status_started_at_idx" ON "encounters"("status", "started_at");

-- CreateIndex
CREATE UNIQUE INDEX "clinical_notes_encounter_id_key" ON "clinical_notes"("encounter_id");

-- CreateIndex
CREATE INDEX "clinical_note_addendums_clinical_note_id_added_at_idx" ON "clinical_note_addendums"("clinical_note_id", "added_at" DESC);

-- CreateIndex
CREATE INDEX "treatments_encounter_id_sequence_idx" ON "treatments"("encounter_id", "sequence");

-- CreateIndex
CREATE INDEX "treatment_inventory_usages_treatment_id_idx" ON "treatment_inventory_usages"("treatment_id");

-- CreateIndex
CREATE INDEX "treatment_inventory_usages_inventory_item_id_idx" ON "treatment_inventory_usages"("inventory_item_id");

-- CreateIndex
CREATE UNIQUE INDEX "prescriptions_encounter_id_key" ON "prescriptions"("encounter_id");

-- CreateIndex
CREATE INDEX "prescription_lines_prescription_id_sequence_idx" ON "prescription_lines"("prescription_id", "sequence");

-- CreateIndex
CREATE UNIQUE INDEX "dental_chart_snapshots_encounter_id_key" ON "dental_chart_snapshots"("encounter_id");

-- CreateIndex
CREATE INDEX "encounter_audits_encounter_id_occurred_at_idx" ON "encounter_audits"("encounter_id", "occurred_at" DESC);

-- CreateIndex
CREATE INDEX "encounter_audits_action_occurred_at_idx" ON "encounter_audits"("action", "occurred_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "invoices_encounter_id_key" ON "invoices"("encounter_id");

-- CreateIndex
CREATE INDEX "invoices_patient_id_created_at_idx" ON "invoices"("patient_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "invoices_status_idx" ON "invoices"("status");

-- CreateIndex
CREATE UNIQUE INDEX "invoices_code_key" ON "invoices"("code");

-- CreateIndex
CREATE INDEX "invoice_items_invoice_id_sequence_idx" ON "invoice_items"("invoice_id", "sequence");

-- CreateIndex
CREATE INDEX "payments_invoice_id_paid_at_idx" ON "payments"("invoice_id", "paid_at" DESC);

-- CreateIndex
CREATE INDEX "invoice_audits_invoice_id_occurred_at_idx" ON "invoice_audits"("invoice_id", "occurred_at" DESC);

-- CreateIndex
CREATE INDEX "inventory_categories_parent_id_idx" ON "inventory_categories"("parent_id");

-- CreateIndex
CREATE INDEX "inventory_categories_name_idx" ON "inventory_categories"("name");

-- CreateIndex
CREATE INDEX "inventory_items_category_id_idx" ON "inventory_items"("category_id");

-- CreateIndex
CREATE INDEX "inventory_items_status_idx" ON "inventory_items"("status");

-- CreateIndex
CREATE UNIQUE INDEX "inventory_items_sku_key" ON "inventory_items"("sku");

-- CreateIndex
CREATE INDEX "stock_movements_inventory_item_id_performed_at_idx" ON "stock_movements"("inventory_item_id", "performed_at" DESC);

-- CreateIndex
CREATE INDEX "stock_movements_type_performed_at_idx" ON "stock_movements"("type", "performed_at");

-- CreateIndex
CREATE INDEX "stock_movements_ref_type_ref_id_idx" ON "stock_movements"("ref_type", "ref_id");

-- CreateIndex
CREATE INDEX "shift_registrations_dentist_id_date_idx" ON "shift_registrations"("dentist_id", "date");

-- CreateIndex
CREATE INDEX "shift_registrations_status_date_idx" ON "shift_registrations"("status", "date");

-- CreateIndex
CREATE UNIQUE INDEX "payroll_config_updated_by_user_id_key" ON "payroll_config"("updated_by_user_id");

-- CreateIndex
CREATE INDEX "dentist_compensations_dentist_id_effective_from_idx" ON "dentist_compensations"("dentist_id", "effective_from" DESC);

-- CreateIndex
CREATE INDEX "dentist_compensations_effective_from_effective_to_idx" ON "dentist_compensations"("effective_from", "effective_to");

-- CreateIndex
CREATE INDEX "payroll_periods_status_period_start_idx" ON "payroll_periods"("status", "period_start" DESC);

-- CreateIndex
CREATE INDEX "payroll_periods_opened_from_period_id_idx" ON "payroll_periods"("opened_from_period_id");

-- CreateIndex
CREATE INDEX "payroll_line_items_dentist_id_computed_at_idx" ON "payroll_line_items"("dentist_id", "computed_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "payroll_line_items_payroll_period_id_dentist_id_key" ON "payroll_line_items"("payroll_period_id", "dentist_id");

-- CreateIndex
CREATE INDEX "payroll_encounter_details_encounter_id_idx" ON "payroll_encounter_details"("encounter_id");

-- CreateIndex
CREATE INDEX "payroll_encounter_details_payroll_period_id_encounter_id_idx" ON "payroll_encounter_details"("payroll_period_id", "encounter_id");

-- CreateIndex
CREATE UNIQUE INDEX "payroll_encounter_details_payroll_line_item_id_encounter_id_key" ON "payroll_encounter_details"("payroll_line_item_id", "encounter_id", "treatment_id");

-- CreateIndex
CREATE INDEX "payroll_adjustments_payroll_line_item_id_adjusted_at_idx" ON "payroll_adjustments"("payroll_line_item_id", "adjusted_at" DESC);

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_permission_id_fkey" FOREIGN KEY ("permission_id") REFERENCES "permissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "password_reset_tokens" ADD CONSTRAINT "password_reset_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "patients" ADD CONSTRAINT "patients_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "patients" ADD CONSTRAINT "patients_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "patient_phone_history" ADD CONSTRAINT "patient_phone_history_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "patient_identifiers" ADD CONSTRAINT "patient_identifiers_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "patient_identifiers" ADD CONSTRAINT "patient_identifiers_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "patient_merge_logs" ADD CONSTRAINT "patient_merge_logs_source_patient_id_fkey" FOREIGN KEY ("source_patient_id") REFERENCES "patients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "patient_merge_logs" ADD CONSTRAINT "patient_merge_logs_target_patient_id_fkey" FOREIGN KEY ("target_patient_id") REFERENCES "patients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_dentist_id_fkey" FOREIGN KEY ("dentist_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_confirmed_by_fkey" FOREIGN KEY ("confirmed_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_checked_in_by_fkey" FOREIGN KEY ("checked_in_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_cancelled_by_fkey" FOREIGN KEY ("cancelled_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "working_schedules" ADD CONSTRAINT "working_schedules_dentist_id_fkey" FOREIGN KEY ("dentist_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "time_offs" ADD CONSTRAINT "time_offs_dentist_id_fkey" FOREIGN KEY ("dentist_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointment_reschedule_logs" ADD CONSTRAINT "appointment_reschedule_logs_appointment_id_fkey" FOREIGN KEY ("appointment_id") REFERENCES "appointments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "encounters" ADD CONSTRAINT "encounters_appointment_id_fkey" FOREIGN KEY ("appointment_id") REFERENCES "appointments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "encounters" ADD CONSTRAINT "encounters_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "encounters" ADD CONSTRAINT "encounters_dentist_id_fkey" FOREIGN KEY ("dentist_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clinical_notes" ADD CONSTRAINT "clinical_notes_encounter_id_fkey" FOREIGN KEY ("encounter_id") REFERENCES "encounters"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clinical_notes" ADD CONSTRAINT "clinical_notes_last_edited_by_fkey" FOREIGN KEY ("last_edited_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clinical_note_addendums" ADD CONSTRAINT "clinical_note_addendums_clinical_note_id_fkey" FOREIGN KEY ("clinical_note_id") REFERENCES "clinical_notes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clinical_note_addendums" ADD CONSTRAINT "clinical_note_addendums_added_by_fkey" FOREIGN KEY ("added_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "treatments" ADD CONSTRAINT "treatments_encounter_id_fkey" FOREIGN KEY ("encounter_id") REFERENCES "encounters"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "treatments" ADD CONSTRAINT "treatments_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "treatment_inventory_usages" ADD CONSTRAINT "treatment_inventory_usages_treatment_id_fkey" FOREIGN KEY ("treatment_id") REFERENCES "treatments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "treatment_inventory_usages" ADD CONSTRAINT "treatment_inventory_usages_inventory_item_id_fkey" FOREIGN KEY ("inventory_item_id") REFERENCES "inventory_items"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "prescriptions" ADD CONSTRAINT "prescriptions_encounter_id_fkey" FOREIGN KEY ("encounter_id") REFERENCES "encounters"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prescriptions" ADD CONSTRAINT "prescriptions_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prescription_lines" ADD CONSTRAINT "prescription_lines_prescription_id_fkey" FOREIGN KEY ("prescription_id") REFERENCES "prescriptions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dental_chart_snapshots" ADD CONSTRAINT "dental_chart_snapshots_encounter_id_fkey" FOREIGN KEY ("encounter_id") REFERENCES "encounters"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dental_chart_snapshots" ADD CONSTRAINT "dental_chart_snapshots_snapshot_by_fkey" FOREIGN KEY ("snapshot_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "encounter_audits" ADD CONSTRAINT "encounter_audits_encounter_id_fkey" FOREIGN KEY ("encounter_id") REFERENCES "encounters"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "encounter_audits" ADD CONSTRAINT "encounter_audits_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_encounter_id_fkey" FOREIGN KEY ("encounter_id") REFERENCES "encounters"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_issued_by_fkey" FOREIGN KEY ("issued_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_voided_by_fkey" FOREIGN KEY ("voided_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_items" ADD CONSTRAINT "invoice_items_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_items" ADD CONSTRAINT "invoice_items_treatment_id_fkey" FOREIGN KEY ("treatment_id") REFERENCES "treatments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_received_by_fkey" FOREIGN KEY ("received_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_audits" ADD CONSTRAINT "invoice_audits_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_audits" ADD CONSTRAINT "invoice_audits_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_categories" ADD CONSTRAINT "inventory_categories_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "inventory_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_categories" ADD CONSTRAINT "inventory_categories_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_categories" ADD CONSTRAINT "inventory_categories_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_items" ADD CONSTRAINT "inventory_items_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "inventory_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_items" ADD CONSTRAINT "inventory_items_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_inventory_item_id_fkey" FOREIGN KEY ("inventory_item_id") REFERENCES "inventory_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_performed_by_fkey" FOREIGN KEY ("performed_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shift_registrations" ADD CONSTRAINT "shift_registrations_dentist_id_fkey" FOREIGN KEY ("dentist_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shift_registrations" ADD CONSTRAINT "shift_registrations_approved_by_user_id_fkey" FOREIGN KEY ("approved_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shift_registrations" ADD CONSTRAINT "shift_registrations_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_config" ADD CONSTRAINT "payroll_config_updated_by_user_id_fkey" FOREIGN KEY ("updated_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dentist_compensations" ADD CONSTRAINT "dentist_compensations_dentist_id_fkey" FOREIGN KEY ("dentist_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dentist_compensations" ADD CONSTRAINT "dentist_compensations_approved_by_user_id_fkey" FOREIGN KEY ("approved_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_periods" ADD CONSTRAINT "payroll_periods_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_periods" ADD CONSTRAINT "payroll_periods_locked_by_user_id_fkey" FOREIGN KEY ("locked_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_periods" ADD CONSTRAINT "payroll_periods_approved_by_user_id_fkey" FOREIGN KEY ("approved_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_periods" ADD CONSTRAINT "payroll_periods_marked_paid_by_user_id_fkey" FOREIGN KEY ("marked_paid_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_periods" ADD CONSTRAINT "payroll_periods_opened_from_period_id_fkey" FOREIGN KEY ("opened_from_period_id") REFERENCES "payroll_periods"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_line_items" ADD CONSTRAINT "payroll_line_items_payroll_period_id_fkey" FOREIGN KEY ("payroll_period_id") REFERENCES "payroll_periods"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_line_items" ADD CONSTRAINT "payroll_line_items_dentist_id_fkey" FOREIGN KEY ("dentist_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_encounter_details" ADD CONSTRAINT "payroll_encounter_details_payroll_line_item_id_fkey" FOREIGN KEY ("payroll_line_item_id") REFERENCES "payroll_line_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_encounter_details" ADD CONSTRAINT "payroll_encounter_details_payroll_period_id_fkey" FOREIGN KEY ("payroll_period_id") REFERENCES "payroll_periods"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_encounter_details" ADD CONSTRAINT "payroll_encounter_details_encounter_id_fkey" FOREIGN KEY ("encounter_id") REFERENCES "encounters"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_encounter_details" ADD CONSTRAINT "payroll_encounter_details_treatment_id_fkey" FOREIGN KEY ("treatment_id") REFERENCES "treatments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_adjustments" ADD CONSTRAINT "payroll_adjustments_payroll_line_item_id_fkey" FOREIGN KEY ("payroll_line_item_id") REFERENCES "payroll_line_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_adjustments" ADD CONSTRAINT "payroll_adjustments_adjusted_by_user_id_fkey" FOREIGN KEY ("adjusted_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


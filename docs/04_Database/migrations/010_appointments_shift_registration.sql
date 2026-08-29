-- Migration 010 — Appointments: ShiftRegistration + WorkingSchedule fields
-- Date: 2026-07-15
-- Reference: docs/04_Database/schema-per-module/appointments.md §6 (new)
--            docs/04_Database/schema-per-module/payroll.md §Bảng 7
--            docs/03_Specification/Appointments/SPEC.md §5 (BR-APPT-026/027/028)
--            BD-0010

BEGIN;

-- ============================================================
-- 1. ALTER working_schedules: add 2 fields (BD-0010)
-- ============================================================
ALTER TABLE working_schedules
  ADD COLUMN is_paid_shift BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN shift_type VARCHAR(16) NOT NULL DEFAULT 'FULL_DAY'
    CHECK (shift_type IN ('MORNING', 'AFTERNOON', 'FULL_DAY', 'NIGHT'));

COMMENT ON COLUMN working_schedules.is_paid_shift IS
  'BD-0010: ca này có tính lương không. Default true cho phòng khám full-time.';

COMMENT ON COLUMN working_schedules.shift_type IS
  'BD-0010: phân loại ca để payroll tính toán (morning/afternoon/full/night).';


-- ============================================================
-- 2. CREATE shift_registrations
-- ============================================================
CREATE TABLE shift_registrations (
  id UUID PRIMARY KEY DEFAULT uuidv7(),
  dentist_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  date DATE NOT NULL,
  start_time VARCHAR(5) NOT NULL CHECK (start_time ~ '^([01]\d|2[0-3]):[0-5]\d$'),
  end_time VARCHAR(5) NOT NULL CHECK (end_time ~ '^([01]\d|2[0-3]):[0-5]\d$'),
  max_encounters INTEGER CHECK (max_encounters IS NULL OR max_encounters > 0),
  notes TEXT,
  status VARCHAR(16) NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED')),
  approved_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ,
  rejection_reason TEXT,
  cancelled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ,
  CONSTRAINT chk_shift_time_range CHECK (end_time > start_time),
  CONSTRAINT chk_shift_status_lifecycle CHECK (
    (status = 'PENDING' AND approved_at IS NULL AND cancelled_at IS NULL) OR
    (status = 'APPROVED' AND approved_at IS NOT NULL AND cancelled_at IS NULL) OR
    (status = 'REJECTED' AND approved_at IS NULL AND cancelled_at IS NULL) OR
    (status = 'CANCELLED' AND cancelled_at IS NOT NULL)
  )
);

-- BR-PAY-020: conflict check performance
CREATE INDEX idx_shift_registrations_dentist_date
  ON shift_registrations (dentist_id, date)
  WHERE status = 'APPROVED' AND deleted_at IS NULL;

-- BR-APPT-029: cron auto-cancel PENDING sau khi date qua
CREATE INDEX idx_shift_registrations_pending
  ON shift_registrations (date)
  WHERE status = 'PENDING' AND deleted_at IS NULL;

-- Lookup các shift của 1 BS trong khoảng
CREATE INDEX idx_shift_registrations_dentist_range
  ON shift_registrations (dentist_id, date DESC)
  WHERE deleted_at IS NULL;


-- ============================================================
-- 3. Audit log entries (mới)
-- ============================================================
-- SHIFT_REGISTERED, SHIFT_APPROVED, SHIFT_REJECTED, SHIFT_CANCELLED
-- (handled in audit module seed)

COMMIT;
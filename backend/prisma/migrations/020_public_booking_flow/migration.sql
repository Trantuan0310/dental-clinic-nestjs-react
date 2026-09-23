BEGIN;
CREATE TYPE "BookingRequestStatus" AS ENUM (
  'PENDING_REVIEW','NEEDS_INFORMATION','PROPOSED','PATIENT_ACCEPTED',
  'CONFIRMED','DECLINED','CANCELLED'
);

ALTER TABLE "appointments" ADD COLUMN "service_id" UUID;
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_service_id_fkey"
  FOREIGN KEY ("service_id") REFERENCES "clinic_services"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "appointments_service_id_idx" ON "appointments"("service_id");

CREATE TABLE "booking_requests" (
  "id" UUID NOT NULL DEFAULT uuid_generate_v7(),
  "reference_code" VARCHAR(24) NOT NULL,
  "access_token_hash" CHAR(64) NOT NULL,
  "full_name" VARCHAR(200) NOT NULL,
  "dob" DATE NOT NULL,
  "gender" "Gender" NOT NULL,
  "phone" VARCHAR(20) NOT NULL,
  "email" VARCHAR(255),
  "contact_person_name" VARCHAR(200),
  "contact_person_phone" VARCHAR(20),
  "service_id" UUID NOT NULL,
  "preferred_dentist_id" UUID NOT NULL,
  "requested_start_at" TIMESTAMPTZ NOT NULL,
  "proposed_start_at" TIMESTAMPTZ,
  "proposed_dentist_id" UUID,
  "reason" VARCHAR(1000),
  "status" "BookingRequestStatus" NOT NULL DEFAULT 'PENDING_REVIEW',
  "response_message" VARCHAR(1000),
  "receptionist_note" VARCHAR(2000),
  "consented_at" TIMESTAMPTZ NOT NULL,
  "patient_id" UUID,
  "appointment_id" UUID,
  "handled_by" UUID,
  "notification_sent_at" TIMESTAMPTZ,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "booking_requests_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "booking_requests_reference_code_key" UNIQUE ("reference_code"),
  CONSTRAINT "booking_requests_appointment_id_key" UNIQUE ("appointment_id"),
  CONSTRAINT "booking_requests_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "clinic_services"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "booking_requests_preferred_dentist_id_fkey" FOREIGN KEY ("preferred_dentist_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "booking_requests_proposed_dentist_id_fkey" FOREIGN KEY ("proposed_dentist_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "booking_requests_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "booking_requests_appointment_id_fkey" FOREIGN KEY ("appointment_id") REFERENCES "appointments"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "booking_requests_handled_by_fkey" FOREIGN KEY ("handled_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "booking_requests_dob_check" CHECK ("dob" <= CURRENT_DATE),
  CONSTRAINT "booking_requests_phone_check" CHECK (length(trim("phone")) >= 9)
);
CREATE INDEX "booking_requests_status_created_at_idx" ON "booking_requests"("status","created_at" DESC);
CREATE INDEX "booking_requests_phone_created_at_idx" ON "booking_requests"("phone","created_at" DESC);

INSERT INTO "permissions" ("code","resource","action","description","is_system") VALUES
 ('booking_request.read','booking_request','read','Xem yêu cầu đặt lịch trực tuyến',TRUE),
 ('booking_request.manage','booking_request','manage','Xử lý yêu cầu đặt lịch trực tuyến',TRUE)
ON CONFLICT ("code") DO UPDATE SET "description"=EXCLUDED."description";
INSERT INTO "role_permissions" ("role_id","permission_id")
SELECT r."id",p."id" FROM "roles" r CROSS JOIN "permissions" p
WHERE r."code" IN ('clinic_admin','receptionist')
  AND p."code" IN ('booking_request.read','booking_request.manage')
ON CONFLICT DO NOTHING;
COMMIT;

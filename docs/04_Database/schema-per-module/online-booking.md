# Online booking requests (migration 025)

A patient asks for a visit on the public page `/booking`. The request goes into
the **Yêu cầu đặt lịch** inbox (`/booking-requests`). Front desk then:

- confirms it, which creates the appointment;
- proposes another time;
- asks the patient for more details; or
- declines it.

The patient follows the request on `/booking/status` with a reference code and
a one-time lookup code.

## Table `booking_requests`

| Column | Notes |
|---|---|
| `reference_code` | `GS-XXXXXXXXXX`, unique. Shown to the patient. |
| `access_token_hash` | SHA-256 of the lookup code. The code itself is never stored. It goes in the `x-booking-access-token` header. |
| `full_name`, `dob`, `gender`, `phone`, `email`, `contact_person_*` | Patient details as typed. A patient record is only created or matched on confirm. |
| `service_id` → `services` | The service asked for. |
| `preferred_dentist_id` → `users` | The dentist asked for. |
| `requested_start_at` | The time asked for. |
| `proposed_dentist_id`, `proposed_start_at` | Front desk's counter-offer. |
| `status` | `PENDING_REVIEW` → (`NEEDS_INFORMATION` ↔ `PENDING_REVIEW`) → (`PROPOSED` → `PATIENT_ACCEPTED`) → `CONFIRMED`. `DECLINED` and `CANCELLED` (patient withdrew) end the request. |
| `appointment_id` | Unique. Set on confirm, in the same transaction that creates the visit. |

## Rules

- **Who appears on the public page.** A service is offered only when it is
  active and a dentist:
  - performs it today (`dentist_services` effective today),
  - is an `ACTIVE` user with the `dentist` role, and
  - has `dentist_profiles.accepts_online_booking = true` with
    `practice_status = ACTIVE`.

  The "Nhận đặt lịch online" setting on the dentist profile controls this.
- **Slots.** Slots come from the same availability check the booking form
  uses, with the service's length and buffers. The dentist's own duration
  comes first (`planVisit`). The request is refused if the slot is no longer
  free.
- **Confirming.** `AppointmentsService.create` runs with `serviceIds: [service]`
  and `source: ONLINE`. That re-checks:
  - the slot,
  - the service assignment, and
  - that the patient is not already booked at that time.

  The visit is created `CONFIRMED`, and the request is linked in the same
  transaction. If someone else handled the request first, the visit rolls back.
- **Rate limits (per IP).**
  - Sending a request: 5 per minute.
  - Status lookups: 15 per minute.
  - Catalogue and slot reads: 30 per minute.
- **Permissions.** `booking_request.read` and `booking_request.manage` are
  granted to `clinic_admin` and `receptionist`.

## Upgrading the gensmile.online VPS

The VPS ran the branch `vps-local-postgres-demo-2026-09-23`. Its own migrations
018-020 built this feature on separate tables:

- `clinic_services`
- `doctor_services`
- `doctor_profiles`
- a `service_id` column on `appointments`

Its `_prisma_migrations` table lists those three migrations. They are not in
this repository. `prisma migrate deploy` ignores them and applies 018-025 on
top.

When the legacy tables exist, migration 025 carries their rows over:

| From | To | Notes |
|---|---|---|
| `clinic_services` | `services` | Ids are kept, so existing requests still resolve. Each distinct free-text category becomes a `service_categories` row (`LEGACY_…`). Durations round to the catalogue's 5-minute grid (5-480). Prices lose the decimals. |
| `doctor_services` | `dentist_services` | Open-ended from the assignment date. |
| `doctor_profiles` | `dentist_profiles` (created by migration 019) | Carries the licence number and `accepts_online_booking`. The employee's phone is carried to `employees`. |
| `appointments.service_id` | one `appointment_services` line | The column is then dropped. |
| `booking_requests.service_id` foreign key | `services` | Retargeted. |

The free-text specialty, qualifications, years of experience and biography
go into the dentist's `bio`. `specialties` is a fixed code set, so after
upgrading, an admin should pick the codes on each dentist profile.

The legacy tables are kept, with a table comment saying they are safe to drop
once the carried rows are checked.

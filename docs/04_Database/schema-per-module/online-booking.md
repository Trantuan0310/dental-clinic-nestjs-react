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
| `access_token_hash` | SHA-256 of the one-time token in the confirmation link. The token itself is never stored. It goes in the `x-booking-access-token` header. The requester can also prove access with the phone number the request was made with (`phone` or `contact_person_phone`), sent in the `x-booking-phone` header. `GET /public/booking/lookup` lists that phone's requests from the last 180 days (booking status only, no personal details); actions on one request take its reference code plus the same header. |
| `full_name`, `dob`, `gender`, `phone`, `email`, `contact_person_*` | Patient details as typed. A patient record is only created or matched on confirm. |
| `service_id` → `services` | The service asked for. |
| `preferred_dentist_id` → `users` | The dentist asked for. |
| `requested_start_at` | The time asked for. |
| `proposed_dentist_id`, `proposed_start_at` | Front desk's counter-offer. |
| `status` | `PENDING_REVIEW` → (`NEEDS_INFORMATION` ↔ `PENDING_REVIEW`) → (`PROPOSED` → `PATIENT_ACCEPTED`) → `CONFIRMED`. `DECLINED`, `CANCELLED` (patient withdrew) and `EXPIRED` (migration 028: its time passed unconfirmed) end the request. `NEEDS_INFORMATION` can only be asked from `PENDING_REVIEW`: from `PROPOSED` / `PATIENT_ACCEPTED` it would drop the offered time. |
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
  A request whose time has passed cannot be confirmed (checked before any
  patient record is matched or created); if booking the visit fails, a patient
  record created for it a moment earlier is archived (soft delete, audited).
- **Patient record on confirm.** Candidates are live patients whose
  `primary_phone` **or** `contact_person_phone` is one of the request's
  phones (`phone`, `contact_person_phone`), in `0xxx` or `+84xxx` form: a
  child is often on file only under a parent's number. The inbox lists them
  (`GET /booking-requests/:id/patient-matches`) with the phone that matched
  (`matchedBy`) and whether name and date of birth match
  (`sameNameAndDob`). The front desk picks one (`patientId`), picks
  "Tạo hồ sơ mới" (`createNewPatient: true`, no matching), or leaves it to
  the server: the one candidate with the same name (NFC, collapsed spaces,
  any case) and date of birth is used only if its own `primary_phone` is the
  request's `phone` (a match through a guardian phone, typed by whoever
  filled in the form, always needs a person); no candidate creates a record;
  anything else is a 409 asking them to choose. This works from
  `PENDING_REVIEW` as well as `PATIENT_ACCEPTED`.
- **Answers taken by phone.** `POST /booking-requests/:id/information-received`
  (`NEEDS_INFORMATION` → `PENDING_REVIEW`) and
  `POST /booking-requests/:id/accepted-by-phone` (`PROPOSED` →
  `PATIENT_ACCEPTED`), with an optional `note`; both audited, both refused
  once the effective time has passed.
- **Accepting a proposal.** The status page sends the `proposedStartAt` it
  shows; the write is conditional on it, so a proposal changed meanwhile is a
  409 ("Phòng khám vừa đổi giờ đề xuất…"). The proposal email states the
  time (clinic time, `dd/MM/yyyy HH:mm`) and dentist, then the note.
- **Details sent by the patient.** Every field of `PUT …/details` is
  optional: a field left out keeps its value (the public API never returns
  the stored details, so the form prefills nothing, not even the lookup
  phone). Only values that differ from the stored ones after normalizing
  count; none is a 400. The merged details are checked like a new request.
  `proposedStartAt` sent when accepting must carry Z or an offset.
- **Validation (public).** Name trimmed before the length check; no NUL
  characters; `dob` must be a real `YYYY-MM-DD` day; the guardian phone
  must be a valid Vietnamese number.
- **After confirming.** The public page and the inbox show the visit's
  dentist and time (`appointment.dentist`, `appointment.startAt`), which
  the clinic may have changed. The public page also reports a cancelled,
  missed (`NO_SHOW`), left (`LEFT`), completed, in-clinic
  (`CHECKED_IN` / `IN_PROGRESS`) or moved visit (`rescheduled`: a
  reschedule count or any reschedule-log row, e.g. a dentist transfer), and offers "Thêm vào Google Calendar" only while
  the visit still stands.
- **Effective time.** The proposed time for `PROPOSED` / `PATIENT_ACCEPTED`
  (when set), otherwise the requested time.
- **Expiry.** `BookingCron` runs every 5 minutes and moves open requests
  (`PENDING_REVIEW`, `NEEDS_INFORMATION`, `PROPOSED`, `PATIENT_ACCEPTED`)
  with no visit and an effective time in the past to `EXPIRED`, with a
  message telling the patient to book again or call. One conditional update,
  then one `BOOKING_REQUEST_EXPIRED` audit row per expired request. Until it
  runs (the public API also returns `overdue`, by the server clock):
  - the sidebar badge already leaves overdue requests out;
  - the patient cannot accept a passed proposed time or send details;
  - the front desk cannot confirm or ask for details, but may propose a new
    time (rescuing the request) or decline;
  - the public status page shows the request as expired.
- **Inbox order.** Open requests first, nearest effective time first (overdue
  on top, marked "Quá giờ"; under 2 hours marked "Sắp đến giờ"), then the
  others newest first.
- **Minimum notice.** Online requests (public slots and `createPublic`) must
  be at least `BOOKING_MIN_LEAD_MIN` minutes ahead (default 120). Front desk
  bookings are not limited.
- **Duplicates.** A phone with an open request for the same time cannot send
  another one for that time. The check and the insert run in one transaction
  under a per-phone advisory lock, so a double submit cannot slip through.
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

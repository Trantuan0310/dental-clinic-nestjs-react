// =============================================================================
// Working Schedule + Time-Off types
// Source: backend/src/appointments/appointments.{controller,service}.ts,
// backend/prisma/schema.prisma (WorkingSchedule, TimeOff)
//
// Both features live in the Appointments module, not Payroll — there's no
// dedicated schedule/time-off controller. Time-off has an approval flow and
// days can be overridden (ADR-0009 phase 3). Working schedules can be edited,
// ended or (before they start) deleted; the whole clinic can be closed for
// days (migration 035).
// =============================================================================

export type ShiftType = 'MORNING' | 'AFTERNOON' | 'FULL_DAY' | 'NIGHT';
export type TimeOffType = 'VACATION' | 'SICK' | 'TRAINING' | 'OTHER';
/** Only APPROVED blocks bookings (BR-SCH-001). */
export type TimeOffStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED';

// GET /appointments/schedules returns the raw WorkingSchedule row — no
// `dentist` relation included, so there's no dentistName here at all;
// SchedulePage resolves it at render time against useDentistOptions().
// startTime/endTime are Postgres TIME(0) columns; Prisma serializes them as
// full ISO datetimes anchored at 1970-01-01 ("1970-01-01T08:00:00.000Z") —
// mapped down to a plain "08:00" string here for display and re-submission.
export interface WorkingSchedule {
  id: string;
  dentistId: string;
  dayOfWeek: number; // 0=Sunday .. 6=Saturday (JS Date.getDay() convention)
  startTime: string; // "HH:mm"
  endTime: string; // "HH:mm"
  slotDurationMin: number;
  validFrom: string;
  validTo: string | null;
  isPaidShift: boolean;
  shiftType: ShiftType;
  createdAt: string;
  updatedAt?: string;
}

export interface CreateWorkingSchedulePayload {
  dentistId: string;
  dayOfWeek: number;
  startTime: string; // "HH:mm"
  endTime: string; // "HH:mm"
  slotDurationMin?: number;
  validFrom: string; // "YYYY-MM-DD"
  validTo?: string; // "YYYY-MM-DD"
  isPaidShift?: boolean;
  shiftType?: ShiftType;
}

// GET /appointments/time-offs — same "no dentist relation included" gap.
export interface TimeOff {
  id: string;
  dentistId: string;
  startAt: string;
  endAt: string;
  type: TimeOffType;
  reason: string | null;
  status: TimeOffStatus;
  createdBy: string;
  decidedBy: string | null;
  decidedAt: string | null;
  decisionNote: string | null;
  createdAt: string;
  /** The reason is private (A1-21): shown only to approvers and the dentist. */
  reasonHidden?: boolean;
}

/** One block of a working day, "HH:mm". */
export interface TimeBlock {
  startTime: string;
  endTime: string;
}

/** POST /appointments/schedules/bulk — several weekdays × blocks in one save. */
export interface BulkCreateWorkingSchedulesPayload {
  dentistId: string;
  daysOfWeek: number[];
  blocks: Array<TimeBlock & { shiftType?: ShiftType }>;
  slotDurationMin?: number;
  validFrom: string;
  validTo?: string;
  isPaidShift?: boolean;
}

/**
 * PATCH /appointments/schedules/:id. New hours of a running schedule apply
 * from `effectiveFrom` (default today); `validTo` alone ends it.
 */
export interface UpdateWorkingSchedulePayload {
  dayOfWeek?: number;
  startTime?: string;
  endTime?: string;
  validTo?: string | null;
  effectiveFrom?: string;
  /** updatedAt the form was opened with: a concurrent edit is refused (A1-25). */
  expectedUpdatedAt?: string;
}

// Appointments still SCHEDULED/CONFIRMED inside a newly created time-off —
// returned by POST /appointments/time-offs so front desk can move them.
export interface TimeOffAffectedAppointment {
  id: string;
  startAt: string;
  endAt: string;
  status: string;
  /** Present when the change spans several dentists (clinic closure). */
  dentistName?: string | null;
  patient: { id: string; code: string; fullName: string; primaryPhone: string | null };
}

/** An online booking request still open at a time the change no longer allows. */
export interface AffectedBookingRequest {
  id: string;
  referenceCode: string;
  fullName: string;
  phone: string;
  status: string;
  startAt: string;
  slotIssue?: { kind: string; message: string } | null;
}

/**
 * GET /booking-requests/pending-in-range row (only the fields the schedule
 * pages use). `slotIssue` is the same server check as the change results'.
 */
export interface PendingBookingRequest {
  id: string;
  referenceCode: string;
  fullName: string;
  phone: string;
  status: string;
  requestedStartAt: string;
  proposedStartAt?: string | null;
  preferredDentist: { id: string; fullName: string };
  proposedDentist?: { id: string; fullName: string } | null;
  slotIssue: { kind: string; message: string } | null;
}

/** What a calendar change leaves to handle by hand (never cancelled automatically). */
export interface ScheduleChangeImpact {
  affectedAppointments: TimeOffAffectedAppointment[];
  affectedBookingRequests?: AffectedBookingRequest[];
  /** Patients already checked in that the change leaves without a dentist. */
  waitingPatients?: TimeOffAffectedAppointment[];
}

export interface UpdateWorkingScheduleResult extends ScheduleChangeImpact {
  schedule: WorkingSchedule;
  /** The old row, ended the day before the new hours start (null when edited in place). */
  endedSchedule: WorkingSchedule | null;
}

/** Whole clinic closed from startDate to endDate (inclusive, clinic dates). */
export interface ClinicClosure {
  id: string;
  startDate: string;
  endDate: string;
  /** Closed from this clinic time on the first day (mid-day closure); null = all day. */
  startTime?: string | null;
  reason: string;
  createdBy: string;
  createdByName: string | null;
  createdAt: string;
}

export interface ClinicClosurePayload {
  startDate: string;
  endDate: string;
  reason: string;
  startTime?: string;
}

export interface OpenEncounterRef {
  id: string;
  startedAt: string;
  patientName: string | null;
  patientCode: string | null;
  dentistName: string | null;
}

export interface ClinicClosureResult extends ClinicClosure, ScheduleChangeImpact {
  /** Exams still open on any day (they bill late if left over the closure). */
  openEncounters?: OpenEncounterRef[];
}

export interface CreateTimeOffResult extends TimeOff, ScheduleChangeImpact {
  affectedAppointments: TimeOffAffectedAppointment[];
  /** Set when an approved time-off already running was ended now instead of erased. */
  endedEarly?: boolean;
}

/** GET /appointments/time-offs/:id/impact — preview before approving. */
export interface TimeOffImpactPreview {
  affectedAppointments: TimeOffAffectedAppointment[];
  inClinic: TimeOffAffectedAppointment[];
}

export interface CreateTimeOffPayload {
  dentistId: string;
  startAt: string; // ISO datetime
  endAt: string; // ISO datetime
  type: TimeOffType;
  reason?: string;
}

export type ScheduleOverrideKind = 'CLOSED' | 'CHANGED_HOURS';

/** One day that differs from the weekly schedule (BR-SCH-003/004). */
export interface ScheduleOverride {
  id: string;
  dentistId: string;
  date: string; // "YYYY-MM-DD"
  kind: ScheduleOverrideKind;
  startTime: string | null; // "HH:mm"; null + CLOSED = whole day
  endTime: string | null;
  reason: string;
  createdAt: string;
}

export interface CreateScheduleOverridePayload {
  dentistId: string;
  date: string;
  kind: ScheduleOverrideKind;
  startTime?: string;
  endTime?: string;
  /** CHANGED_HOURS: several blocks (e.g. keep a lunch break). */
  ranges?: TimeBlock[];
  reason: string;
}

export interface CreateScheduleOverrideResult extends ScheduleOverride, ScheduleChangeImpact {
  overrides?: ScheduleOverride[];
}

/** GET /appointments/schedule-impact row (BR-SCH-005). */
export interface ImpactedAppointment extends TimeOffAffectedAppointment {
  dentistId: string;
  dentistName: string;
  reason: 'OUTSIDE_WORKING_HOURS' | 'CLOSED' | 'TIME_OFF' | 'DENTIST_UNAVAILABLE';
  message: string;
  rescheduleCount?: number;
  /** The front desk reached the patient about the change (A1-13). */
  clinicContactedAt?: string | null;
  clinicContactNote?: string | null;
}

/** POST /appointments/bulk-reschedule result. */
export interface BulkRescheduleResult {
  moved: Array<{ appointmentId: string; startAt: string; dentistId: string }>;
  failed: Array<{ appointmentId: string; reason: string }>;
}

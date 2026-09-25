// =============================================================================
// Working Schedule + Time-Off types
// Source: backend/src/appointments/appointments.{controller,service}.ts,
// backend/prisma/schema.prisma (WorkingSchedule, TimeOff)
//
// Both features live in the Appointments module, not Payroll — there's no
// dedicated schedule/time-off controller. Time-off has an approval flow and
// days can be overridden (ADR-0009 phase 3); working schedules are still
// create + list only.
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
}

// Appointments still SCHEDULED/CONFIRMED inside a newly created time-off —
// returned by POST /appointments/time-offs so front desk can move them.
export interface TimeOffAffectedAppointment {
  id: string;
  startAt: string;
  endAt: string;
  status: string;
  patient: { id: string; code: string; fullName: string; primaryPhone: string | null };
}

export interface CreateTimeOffResult extends TimeOff {
  affectedAppointments: TimeOffAffectedAppointment[];
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
  reason: string;
}

export interface CreateScheduleOverrideResult extends ScheduleOverride {
  affectedAppointments: TimeOffAffectedAppointment[];
}

/** GET /appointments/schedule-impact row (BR-SCH-005). */
export interface ImpactedAppointment extends TimeOffAffectedAppointment {
  dentistId: string;
  dentistName: string;
  reason: 'OUTSIDE_WORKING_HOURS' | 'CLOSED' | 'TIME_OFF';
  message: string;
}

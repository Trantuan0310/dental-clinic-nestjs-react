// =============================================================================
// Working Schedule + Time-Off types
// Source: backend/src/appointments/appointments.{controller,service}.ts,
// backend/prisma/schema.prisma (WorkingSchedule, TimeOff)
//
// Both features live in the Appointments module, not Payroll — there's no
// dedicated schedule/time-off controller. Only create + list exist on the
// backend; there's no update/delete/approve for either, so this UI doesn't
// offer them.
// =============================================================================

export type ShiftType = 'MORNING' | 'AFTERNOON' | 'FULL_DAY' | 'NIGHT';
export type TimeOffType = 'VACATION' | 'SICK' | 'TRAINING' | 'OTHER';

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

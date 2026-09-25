// =============================================================================
// Appointments Module TypeScript Types
// Source: backend API (camelCase: BE returns snake_case in Prisma rows, the
//   frontend transforms them — see `transformAppointment` in appointmentApi.ts)
// Docs: docs/03_Specification/Appointments/SPEC.md
// =============================================================================

export type AppointmentStatus =
  | 'scheduled'
  | 'confirmed'
  | 'checked_in'
  | 'in_progress'
  | 'completed'
  | 'cancelled'
  | 'no_show'
  /** Checked in, then left before the exam (ADR-0009 D2). */
  | 'left';

export type AppointmentSource = 'walk_in' | 'phone' | 'online' | 'returning';

export type AppointmentType = 'consultation' | 'treatment' | 'follow_up';

export type AppointmentViewMode = 'day' | 'week' | 'month' | 'list';

export interface PatientMini {
  id: string;
  code: string;
  fullName: string;
  primaryPhone?: string | null;
  dob?: string | null;
  gender?: string | null;
}

export interface DentistMini {
  id: string;
  fullName: string;
  specialization?: string | null;
  /** From the dentist profile (#RRGGBB); null while a dentist has no profile. */
  calendarColor?: string | null;
}

export interface Appointment {
  id: string;
  patientId: string;
  patientCode: string;
  patientName: string;
  patientPhone?: string | null;
  dentistId: string;
  dentistName: string;
  startsAt: string;
  endsAt: string;
  durationMinutes: number;
  status: AppointmentStatus;
  source?: AppointmentSource;
  appointmentType?: AppointmentType;
  chiefComplaint?: string | null;
  reason?: string | null;
  notes?: string | null;
  checkInAt?: string | null;
  checkedInByUserId?: string | null;
  cancelledAt?: string | null;
  cancelledByUserId?: string | null;
  cancellationReason?: string | null;
  noShowAt?: string | null;
  rescheduleCount?: number;
  encounterId?: string | null;
  /** ADR-0009 phase 5 */
  visitKind?: 'booked' | 'walk_in';
  bufferBeforeMin?: number;
  bufferAfterMin?: number;
  calculatedDurationMin?: number | null;
  durationOverrideReason?: string | null;
  leftAt?: string | null;
  leftReason?: string | null;
  services?: AppointmentServiceSnapshot[];
  createdAt: string;
  updatedAt?: string;
}

/** A booked service as frozen at booking time (ADR-0009 D6). */
export interface AppointmentServiceSnapshot {
  id: string;
  serviceId: string;
  serviceCode: string;
  serviceName: string;
  price: number;
  durationMin: number;
  bufferBeforeMin: number;
  bufferAfterMin: number;
}

export interface PaginationInfo {
  pageSize: number;
  nextCursor: string | null;
  hasMore: boolean;
}

export interface AppointmentListResponse {
  data: Appointment[];
  pagination?: PaginationInfo;
  total?: number;
}

export interface AppointmentFilters {
  /** Free-text search (client-side filter on top of paginated list). */
  q?: string;
  /** Single status filter — converted to multi-value array for BE. */
  status?: AppointmentStatus | 'all';
  dentistId?: string;
  patientId?: string;
  from?: string;
  to?: string;
  view?: AppointmentViewMode;
  page?: number;
  pageSize?: number;
  cursor?: string;
}

/**
 * Payload for POST /appointments.
 * Field names mirror CreateAppointmentDto on the backend (startAt / endAt).
 * Optional fields (chiefComplaint, source, appointmentType) are accepted by the
 * FE portal but ignored by the backend unless it has been extended via a later
 * sprint; the API call still succeeds.
 */
export interface CreateAppointmentPayload {
  patientId: string;
  dentistId: string;
  startsAt: string;
  endsAt: string;
  appointmentType?: AppointmentType;
  chiefComplaint?: string;
  reason?: string;
  notes?: string;
  source?: AppointmentSource;
  /** Chosen services, in order (ADR-0009 phase 5, BR-APPT-030). */
  serviceIds?: string[];
  /** Required when the length differs from the services' total (BR-APPT-031). */
  durationOverrideReason?: string;
}

/** POST /appointments/walk-in — booked from now and checked in at once (BR-APPT-032). */
export interface CreateWalkInPayload {
  patientId: string;
  dentistId: string;
  serviceIds?: string[];
  /** Visit length when no service is chosen. */
  durationMin?: number;
  reason?: string;
  chiefComplaint?: string;
  appointmentType?: AppointmentType;
}

/** A service the dentist performs on a date, as offered by the booking form. */
export interface BookableService {
  serviceId: string;
  code: string;
  name: string;
  categoryName: string;
  durationMin: number;
  price: number;
  bufferBeforeMin: number;
  bufferAfterMin: number;
}

/** GET /appointments/:id/history (BR-APPT-034). */
export interface AppointmentHistory {
  events: Array<{
    action: string;
    at: string;
    actorEmail: string | null;
    metadata: Record<string, unknown> | null;
  }>;
  reschedules: Array<{
    id: string;
    oldStartAt: string;
    newStartAt: string;
    oldDentistId?: string | null;
    newDentistId?: string | null;
    reason?: string | null;
    changedAt: string;
  }>;
}

export interface UpdateAppointmentPayload {
  reason?: string;
  notes?: string;
  chiefComplaint?: string;
  appointmentType?: AppointmentType;
}

export interface CancelAppointmentPayload {
  reason: string;
}

export interface RescheduleAppointmentPayload {
  newDentistId?: string;
  newStartsAt: string;
  newEndsAt: string;
  reason: string;
}

export interface CheckInPayload {
  notes?: string;
  override?: boolean;
  overrideReason?: string;
}

/**
 * Availability slot — the BE returns `availableSlots: string[]` (HH:mm) plus
 * `slotDuration`, so the FE derives a structured slot from those primitives.
 */
export interface AvailabilitySlot {
  startTime: string;
  endTime: string;
  available: boolean;
}

/** A clinic wall-clock interval, "HH:mm" – "HH:mm" ("24:00" = end of day). */
export interface ClockInterval {
  startTime: string;
  endTime: string;
}

export interface DentistAvailability {
  dentistId: string;
  date: string;
  dayOfWeek: number;
  workingHours: { startTime: string; endTime: string } | null;
  slotDuration: number;
  availableSlots: AvailabilitySlot[];
  /** Working-schedule / approved-shift windows for the day. */
  windows: ClockInterval[];
  /** Booked appointments and time-off overlapping the day. */
  busy: ClockInterval[];
  /** 'NO_SCHEDULE' when the dentist doesn't work that day. */
  blockedReason?: string | null;
}

// =============================================================================
// Waiting queue (GET /appointments/waiting-queue)
// =============================================================================

export interface WaitingQueueEntry {
  id: string;
  patient: {
    id: string;
    code: string;
    fullName: string;
  };
  appointmentStartAt: string;
  checkedInAt: string;
  waitingMinutes: number;
}

// =============================================================================
// Calendar view (currently backed by GET /appointments with date range)
// =============================================================================

export interface CalendarFetchParams {
  from: string;
  to: string;
  dentistId?: string;
}

export type CalendarAppointment = Appointment;

// =============================================================================
// Patient lookup (GET /patients/lookup)
// =============================================================================

export interface PatientLookupQuery {
  phone?: string;
  cccd?: string;
  name?: string;
  dob?: string;
  limit?: number;
}

export interface PatientLookupCandidate {
  id: string;
  code: string;
  fullName: string;
  dob: string;
  gender: string;
  primaryPhone: string | null;
  lastVisitAt: string | null;
  lastVisitBy: string | null;
  matchType: 'phone_exact' | 'cccd_exact' | 'name_dob' | 'name_fuzzy';
}

export interface PatientLookupResult {
  candidates: PatientLookupCandidate[];
  total: number;
  matchType: PatientLookupCandidate['matchType'];
}

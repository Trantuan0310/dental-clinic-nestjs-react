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
  | 'no_show';

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
  createdAt: string;
  updatedAt?: string;
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
}

export interface UpdateAppointmentPayload {
  reason?: string;
  notes?: string;
  chiefComplaint?: string;
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

export interface DentistAvailability {
  dentistId: string;
  date: string;
  dayOfWeek: number;
  workingHours: { startTime: string; endTime: string } | null;
  slotDuration: number;
  availableSlots: AvailabilitySlot[];
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

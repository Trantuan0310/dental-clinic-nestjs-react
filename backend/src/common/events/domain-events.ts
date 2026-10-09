export const APPOINTMENT_CANCELLED_EVENT = 'appointment.cancelled';

export interface AppointmentCancelledEvent {
  appointmentId: string;
  patientId: string;
  dentistId: string;
  cancelledAt: Date;
  cancelledBy: string;
  reason?: string;
  /** Cancelled for the clinic's reasons (closed day, absent dentist). */
  byClinic?: boolean;
}

/**
 * A booked visit moved in time and/or to another dentist (reschedule, a day
 * reassigned to a substitute). Emitted after the change is committed;
 * listeners must not throw (the booking module emails the patient).
 */
export const APPOINTMENT_RESCHEDULED_EVENT = 'appointment.rescheduled';

export interface AppointmentRescheduledEvent {
  appointmentId: string;
  oldStartAt: Date;
  newStartAt: Date;
  oldDentistId: string;
  newDentistId: string;
}

export const ENCOUNTER_CLOSED_EVENT = 'encounter.closed';

export interface InventoryUsageSnapshot {
  inventoryItemId: string;
  quantity: number;
  unit: string;
}

export interface EncounterClosedEvent {
  encounterId: string;
  appointmentId: string;
  patientId: string;
  dentistId: string;
  closedAt: Date;
  treatments: Array<{
    treatmentId: string;
    procedure: string;
    description: string | null;
    unitPrice: number;
    /** Units billed at unitPrice (treatments.quantity, 1 for older rows). */
    quantity: number;
  }>;
  inventoryUsages: InventoryUsageSnapshot[];
}

/**
 * Something the AI patient summary is built from changed (medical history,
 * clinical note/treatments, encounter opened/cancelled). Encounter close is
 * covered by ENCOUNTER_CLOSED_EVENT. Listeners must not throw.
 */
export const PATIENT_CLINICAL_DATA_CHANGED_EVENT = 'patient.clinical_data.changed';

export interface PatientClinicalDataChangedEvent {
  patientId: string;
}

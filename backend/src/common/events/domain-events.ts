export const APPOINTMENT_CANCELLED_EVENT = 'appointment.cancelled';

export interface AppointmentCancelledEvent {
  appointmentId: string;
  patientId: string;
  dentistId: string;
  cancelledAt: Date;
  cancelledBy: string;
  reason?: string;
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

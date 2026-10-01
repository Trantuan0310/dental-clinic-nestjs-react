export const APPOINTMENT_CANCELLED_EVENT = 'appointment.cancelled';

export interface AppointmentCancelledEvent {
  appointmentId: string;
  patientId: string;
  dentistId: string;
  cancelledAt: Date;
  cancelledBy: string;
  reason?: string;
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

/**
 * Invoice lifecycle (billing, round 4). Payroll pays commission on issued
 * invoices (ISSUED/PARTIAL/PAID, by issuedAt) and recomputes or claws back
 * when one of these fires. Emit after the change is committed; listeners
 * reload the invoice by id and must not throw.
 */
export const INVOICE_ISSUED_EVENT = 'invoice.issued';
export const INVOICE_VOIDED_EVENT = 'invoice.voided';
export const INVOICE_PAYMENT_RECORDED_EVENT = 'invoice.payment_recorded';
export const INVOICE_REFUNDED_EVENT = 'invoice.refunded';

export interface InvoiceChangedEvent {
  invoiceId: string;
  encounterId?: string;
}

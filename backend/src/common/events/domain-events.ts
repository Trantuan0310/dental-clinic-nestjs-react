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

// -----------------------------------------------------------------------------
// Invoice lifecycle (BillingService). Emitted after the change is committed;
// listeners must not throw. Payroll (commission on ISSUED/PARTIAL/PAID
// invoices, after the discount, dated by issuedAt) listens to these.
// Money is in VND as numbers; every payload carries the invoice state AFTER
// the change, so a listener never has to re-read it to decide.
// -----------------------------------------------------------------------------
export const INVOICE_ISSUED_EVENT = 'invoice.issued';
export const INVOICE_VOIDED_EVENT = 'invoice.voided';
export const INVOICE_PAYMENT_RECORDED_EVENT = 'invoice.payment_recorded';
export const INVOICE_PAYMENT_VOIDED_EVENT = 'invoice.payment_voided';
export const INVOICE_REFUNDED_EVENT = 'invoice.refunded';

export type InvoiceEventStatus = 'DRAFT' | 'ISSUED' | 'PARTIAL' | 'PAID' | 'VOIDED';

export interface InvoiceEventBase {
  invoiceId: string;
  invoiceCode: string;
  encounterId: string;
  patientId: string;
  /** Dentist in charge of the encounter. */
  dentistId: string;
  status: InvoiceEventStatus;
  subtotal: number;
  /** subtotal − total (0 without a discount). */
  discountAmount: number;
  total: number;
  /** Net money kept: payments − refunds. */
  paidAmount: number;
  refundedAmount: number;
  outstandingAmount: number;
  /** Null for an invoice voided while still DRAFT. */
  issuedAt: Date | null;
  /** Voided invoice this one was re-made from (same encounter). */
  replacesInvoiceId: string | null;
  actorId: string;
  occurredAt: Date;
}

export interface InvoiceEventLine {
  invoiceItemId: string;
  treatmentId: string | null;
  description: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  /** lineTotal after the invoice discount, split pro rata; sums to `total`. */
  netLineTotal: number;
}

/** DRAFT → ISSUED, or straight to PAID for a 0đ invoice. */
export interface InvoiceIssuedEvent extends InvoiceEventBase {
  lines: InvoiceEventLine[];
}

/** Payroll drops (or claws back) commission of an issued invoice. */
export interface InvoiceVoidedEvent extends InvoiceEventBase {
  reason: string;
  /** Status before voiding (DRAFT means it was never issued). */
  previousStatus: InvoiceEventStatus;
  lines: InvoiceEventLine[];
}

export interface InvoicePaymentRecordedEvent extends InvoiceEventBase {
  paymentId: string;
  amount: number;
  method: 'CASH' | 'BANK_TRANSFER';
  paidAt: Date;
}

/** A payment or refund row entered by mistake was cancelled. */
export interface InvoicePaymentVoidedEvent extends InvoiceEventBase {
  paymentId: string;
  kind: 'PAYMENT' | 'REFUND';
  amount: number;
  /** paidAt of the cancelled row (the day it had counted on). */
  paidAt: Date;
  reason: string;
}

/** Money handed back; it counts on refundedAt, never on the original payment day. */
export interface InvoiceRefundedEvent extends InvoiceEventBase {
  /** id of the REFUND row in payments. */
  paymentId: string;
  amount: number;
  method: 'CASH' | 'BANK_TRANSFER';
  refundedAt: Date;
  reason: string;
}

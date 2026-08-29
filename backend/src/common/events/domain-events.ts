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
  }>;
  inventoryUsages: InventoryUsageSnapshot[];
}

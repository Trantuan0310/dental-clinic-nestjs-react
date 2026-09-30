export interface ServiceCategory {
  id: string;
  code: string;
  name: string;
  sortOrder: number;
  isActive: boolean;
}

export interface CatalogService {
  id: string;
  code: string;
  name: string;
  description: string | null;
  category: { id: string; code: string; name: string };
  defaultDurationMin: number;
  bufferBeforeMin: number;
  bufferAfterMin: number;
  basePrice: number;
  /** Explicitly free: the public price list says "Miễn phí". */
  isFree: boolean;
  /** Patients may request it on the public booking page. */
  bookableOnline: boolean;
  /** Listed on the public price list. */
  showPublicPrice: boolean;
  requiredSpecialty: string | null;
  isActive: boolean;
  assignedDentists: number;
}

/** GET /services/:id/impact: what turning a service off (or on) touches. */
export type ServiceImpact =
  | {
      isActive: true;
      upcomingAppointments: number;
      pendingBookingRequests: number;
      openAssignments: number;
    }
  | { isActive: false; restorableAssignments: number };

export interface ServicePayload {
  code?: string;
  categoryId: string;
  name: string;
  description?: string | null;
  defaultDurationMin: number;
  bufferBeforeMin: number;
  bufferAfterMin: number;
  basePrice: number;
  isFree: boolean;
  bookableOnline: boolean;
  showPublicPrice: boolean;
  requiredSpecialty: string | null;
}

export interface DentistServiceAssignment {
  id: string;
  dentistId: string;
  service: {
    id: string;
    code: string;
    name: string;
    categoryName: string;
    isActive: boolean;
    bufferBeforeMin: number;
    bufferAfterMin: number;
  };
  durationMin: number | null;
  price: number | null;
  effectiveDurationMin: number;
  effectivePrice: number;
  effectiveFrom: string;
  effectiveTo: string | null;
  current: boolean;
}

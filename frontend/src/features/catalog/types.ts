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
  requiredSpecialty: string | null;
  isActive: boolean;
  assignedDentists: number;
}

export interface ServicePayload {
  code?: string;
  categoryId: string;
  name: string;
  description?: string | null;
  defaultDurationMin: number;
  bufferBeforeMin: number;
  bufferAfterMin: number;
  basePrice: number;
  requiredSpecialty: string | null;
}

export interface DentistServiceAssignment {
  id: string;
  dentistId: string;
  service: { id: string; code: string; name: string; categoryName: string; isActive: boolean };
  durationMin: number | null;
  price: number | null;
  effectiveDurationMin: number;
  effectivePrice: number;
  effectiveFrom: string;
  effectiveTo: string | null;
  current: boolean;
}

// =============================================================================
// Patients Module TypeScript Types
// Source: backend API + docs/03_Specification/Patients/SPEC.md
// =============================================================================

export type Gender = 'male' | 'female' | 'other';
export type PatientStatus = 'active' | 'inactive' | 'deceased';

export interface Patient {
  id: string;
  code: string;
  fullName: string;
  dateOfBirth: string;
  gender: Gender;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  occupation?: string | null;
  status: PatientStatus;
  emergencyContactName?: string | null;
  emergencyContactPhone?: string | null;
  notes?: string | null;
  createdAt: string;
  updatedAt?: string;
}

export interface PatientWithRelations extends Patient {
  allergies: string[];
  chronicDiseases: string[];
  currentMedications: string[];
  documents?: PatientDocument[];
  encounters?: EncounterSummary[];
}

export interface PatientMini {
  id: string;
  code: string;
  fullName: string;
  phone?: string | null;
}

export interface PatientDocument {
  id: string;
  type: string;
  documentNumber?: string;
  issuedDate?: string;
  issuedPlace?: string;
}

export interface EncounterSummary {
  id: string;
  encounterDate: string;
  dentistName: string;
  summary?: string;
  status: string;
}

export interface PaginatedMeta {
  pageSize: number;
  nextCursor: string | null;
  hasMore: boolean;
}

export interface PatientListResponse {
  data: Patient[];
  pagination: PaginatedMeta;
}

export interface PatientFilters {
  q?: string;
  status?: PatientStatus | 'all';
  from?: string;
  to?: string;
  pageSize?: number;
  cursor?: string;
}

export interface CreatePatientPayload {
  fullName: string;
  dateOfBirth: string;
  gender: Gender;
  phone?: string;
  email?: string;
  address?: string;
  occupation?: string;
  emergencyContactName?: string;
  emergencyContactPhone?: string;
  notes?: string;
  allergies?: string[];
  chronicDiseases?: string[];
  currentMedications?: string[];
  documents?: Omit<PatientDocument, 'id'>[];
}

export interface UpdatePatientPayload extends Partial<CreatePatientPayload> {}

export interface PatientLookupResult {
  id: string;
  code: string;
  fullName: string;
  dateOfBirth: string;
  phone?: string | null;
  lastVisit?: string | null;
  status: PatientStatus;
}

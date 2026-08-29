// =============================================================================
// Patient DTO normalisation
// -----------------------------------------------------------------------------
// The backend returns patient payloads using snake_case fields (`dob`,
// `primary_phone`) and uppercase gender enum values (`MALE`, `FEMALE`,
// `OTHER`). The rest of the frontend expects camelCase fields and the
// lowercase `Gender` union declared in `@/types/patients`. Normalise every
// raw backend payload here so feature code can keep treating patient
// objects as `Patient`/`PatientWithRelations` without per-page mapper code.
// =============================================================================

import type {
  Patient,
  PatientMini,
  PatientWithRelations,
  PatientLookupResult,
  Gender,
} from '@/types/patients';

type BackendGender = 'MALE' | 'FEMALE' | 'OTHER';

const GENDER_MAP: Record<BackendGender, Gender> = {
  MALE: 'male',
  FEMALE: 'female',
  OTHER: 'other',
};

function mapGender(raw: unknown): Gender {
  if (raw === 'MALE' || raw === 'FEMALE' || raw === 'OTHER') {
    return GENDER_MAP[raw];
  }
  if (raw === 'male' || raw === 'female' || raw === 'other') {
    return raw;
  }
  return 'other';
}

/**
 * Normalised shape returned by `GET /patients` (the list endpoint). Only the
 * fields we currently read on the patient list page are captured here; new
 * fields can be added without breaking existing call-sites.
 */
export interface BackendPatientListItem {
  id: string;
  code: string;
  fullName: string;
  dob?: string | null;
  gender?: BackendGender | null;
  primaryPhone?: string | null;
  createdAt?: string;
  lastVisitAt?: string | null;
  deletedAt?: string | null;
}

/**
 * Normalised shape returned by `GET /patients/:id` (the detail endpoint).
 * Includes relations (allergies, chronic diseases, current medications) which
 * the list endpoint omits.
 */
export interface BackendPatientDetail {
  id: string;
  code: string;
  fullName: string;
  dob?: string | null;
  gender?: BackendGender | null;
  primaryPhone?: string | null;
  email?: string | null;
  address?: string | null;
  occupation?: string | null;
  status?: string;
  deletedAt?: string | null;
  emergencyContactName?: string | null;
  emergencyContactPhone?: string | null;
  notes?: string | null;
  createdAt: string;
  updatedAt?: string;
  allergies?: string[];
  chronicDiseases?: string[];
  currentMedications?: string[];
}

function normaliseBase(raw: BackendPatientDetail): Patient {
  return {
    id: raw.id,
    code: raw.code,
    fullName: raw.fullName,
    dateOfBirth: raw.dob ?? '',
    gender: mapGender(raw.gender),
    phone: raw.primaryPhone ?? null,
    email: raw.email ?? null,
    address: raw.address ?? null,
    occupation: raw.occupation ?? null,
    status:
      raw.status === 'inactive' || raw.status === 'deceased'
        ? (raw.status as Patient['status'])
        : raw.deletedAt
          ? 'inactive'
          : 'active',
    emergencyContactName: raw.emergencyContactName ?? null,
    emergencyContactPhone: raw.emergencyContactPhone ?? null,
    notes: raw.notes ?? null,
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt,
  };
}

export function fromBackendListItem(raw: BackendPatientListItem): Patient {
  return normaliseBase({
    ...raw,
    createdAt: raw.createdAt ?? new Date().toISOString(),
  });
}

export function fromBackendDetail(raw: BackendPatientDetail): PatientWithRelations {
  const base = normaliseBase(raw);
  return {
    ...base,
    allergies: raw.allergies ?? [],
    chronicDiseases: raw.chronicDiseases ?? [],
    currentMedications: raw.currentMedications ?? [],
  };
}

/**
 * `GET /patients/lookup` (`PatientsService.lookup`, backend/src/patients/patients.service.ts)
 * does NOT return a flat array — it returns `{ candidates, total, matchType }`.
 * Every `candidate` also uses backend field names (`dob`, `primaryPhone`,
 * `lastVisitAt`) and has no `status` (the query already filters `deletedAt: null`,
 * so every candidate is implicitly active).
 */
export interface BackendLookupCandidate {
  id: string;
  code: string;
  fullName: string;
  dob?: string | null;
  primaryPhone?: string | null;
  lastVisitAt?: string | null;
}

export interface BackendLookupResponse {
  candidates: BackendLookupCandidate[];
  total: number;
  matchType: string;
}

export function fromBackendLookup(raw: BackendLookupResponse): PatientLookupResult[] {
  return (raw.candidates ?? []).map((c) => ({
    id: c.id,
    code: c.code,
    fullName: c.fullName,
    dateOfBirth: c.dob ?? '',
    phone: c.primaryPhone ?? null,
    lastVisit: c.lastVisitAt ?? null,
    status: 'active',
  }));
}

export function fromBackendMini(raw: Partial<BackendPatientDetail> & {
  id: string;
  code: string;
  fullName: string;
}): PatientMini {
  return {
    id: raw.id,
    code: raw.code,
    fullName: raw.fullName,
    phone: raw.primaryPhone ?? null,
  };
}

// Imperative (non-hook) Patient API methods. The hook-based
// equivalents (usePatientList, usePatient, etc.) live in
// `patientsApi.ts`. This file exposes the bare HTTP methods so
// pages and forms that already use `patientsApi.create(...)` can
// import from `@/features/patients/imperativeApi`.

import { api, unwrap } from '@/lib/api';
import type {
  Patient,
  PatientWithRelations,
  PatientListResponse,
  PatientFilters,
  CreatePatientPayload,
  UpdatePatientPayload,
  PatientLookupResult,
  Gender,
} from '@/types/patients';
import {
  fromBackendDetail,
  fromBackendListItem,
  fromBackendLookup,
  type BackendLookupResponse,
  type BackendPatientDetail,
  type BackendPatientListItem,
} from './patientMappers';

type BackendGender = 'MALE' | 'FEMALE' | 'OTHER';
const GENDER_TO_BACKEND: Record<Gender, BackendGender> = {
  male: 'MALE',
  female: 'FEMALE',
  other: 'OTHER',
};

interface BackendPatientPayload {
  fullName: string;
  dob: string;
  gender: BackendGender;
  primaryPhone?: string;
  email?: string;
  address?: string;
  occupation?: string;
  allergies?: string[];
  chronicDiseases?: string[];
  currentMedications?: string[];
  contactPersonName?: string;
  contactPersonPhone?: string;
  notes?: string;
}

function toBackendPayload(p: CreatePatientPayload | UpdatePatientPayload): BackendPatientPayload {
  const out: BackendPatientPayload = { fullName: '', dob: '', gender: 'MALE' };
  if (p.fullName !== undefined) out.fullName = p.fullName;
  if (p.gender !== undefined) out.gender = GENDER_TO_BACKEND[p.gender];
  if (p.phone !== undefined) out.primaryPhone = p.phone;
  if (p.emergencyContactName !== undefined) out.contactPersonName = p.emergencyContactName;
  if (p.emergencyContactPhone !== undefined) out.contactPersonPhone = p.emergencyContactPhone;
  if (p.allergies !== undefined) out.allergies = p.allergies;
  if (p.chronicDiseases !== undefined) out.chronicDiseases = p.chronicDiseases;
  if (p.currentMedications !== undefined) out.currentMedications = p.currentMedications;
  if (p.dateOfBirth !== undefined) out.dob = p.dateOfBirth;
  if (p.email !== undefined) out.email = p.email;
  if (p.address !== undefined) out.address = p.address;
  if (p.occupation !== undefined) out.occupation = p.occupation;
  if (p.notes !== undefined) out.notes = p.notes;
  return out;
}

export const patientsApi = {
  async list(params?: PatientFilters): Promise<PatientListResponse> {
    const { data } = await api.get<{
      data: BackendPatientListItem[];
      pagination: PatientListResponse['pagination'];
    }>('/patients', { params });
    return {
      data: data.data.map(fromBackendListItem),
      pagination: data.pagination,
    };
  },

  async get(id: string): Promise<PatientWithRelations> {
    const { data } = await api.get<{ data: BackendPatientDetail }>(`/patients/${id}`);
    return fromBackendDetail(unwrap(data));
  },

  async create(payload: CreatePatientPayload): Promise<Patient> {
    const { data } = await api.post<{ data: BackendPatientDetail }>(
      '/patients',
      toBackendPayload(payload),
    );
    return fromBackendDetail(unwrap(data));
  },

  async update(id: string, payload: UpdatePatientPayload): Promise<Patient> {
    const { data } = await api.patch<{ data: BackendPatientDetail }>(
      `/patients/${id}`,
      toBackendPayload(payload),
    );
    return fromBackendDetail(unwrap(data));
  },

  async delete(id: string): Promise<void> {
    await api.delete(`/patients/${id}`);
  },

  async lookup(query: string): Promise<PatientLookupResult[]> {
    const { data } = await api.get<{ data: BackendLookupResponse }>('/patients/lookup', {
      params: { name: query },
    });
    return fromBackendLookup(unwrap(data));
  },

  async searchByPhone(phone: string): Promise<PatientLookupResult[]> {
    const { data } = await api.get<{ data: BackendLookupResponse }>('/patients/lookup', {
      params: { phone },
    });
    return fromBackendLookup(unwrap(data));
  },
};
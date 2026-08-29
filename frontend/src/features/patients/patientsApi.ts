// Patients API hooks used by the MedicalRecords side (MyPatients list,
// PatientEncounters history, etc). Mirrors `docs/05_API/patients.md`.

import { useInfiniteQuery, useQuery, type InfiniteData } from '@tanstack/react-query';
import { api, type AuthEnvelope, unwrap } from '@/lib/api';

export interface PatientListItem {
  id: string;
  code: string;
  fullName: string;
  dateOfBirth?: string | null;
  gender?: 'male' | 'female' | 'other' | null;
  primaryPhone?: string | null;
  lastVisitAt?: string | null;
  tags?: string[];
  status?: 'active' | 'deceased' | 'merged';
}

export interface PatientListPagination {
  pageSize: number;
  nextCursor?: string | null;
  hasMore?: boolean;
}

interface ListResponse {
  data: PatientListItem[];
  pagination?: PatientListPagination;
}

const get = async <T>(url: string, config?: Parameters<typeof api.get>[1]) => {
  const { data } = await api.get<AuthEnvelope<T>>(url, config);
  return unwrap(data);
};

export interface PatientListFilters {
  q?: string;
  status?: string;
  pageSize?: number;
  dentistId?: string;
  cursor?: string;
}

export function usePatientList(filters: PatientListFilters = {}) {
  return useQuery({
    queryKey: ['patients', 'list', filters],
    queryFn: () => get<ListResponse>('/patients', { params: filters }),
    select: (r) => r.data,
  });
}

export function usePatientListInfinite(filters: Omit<PatientListFilters, 'cursor'> = {}) {
  type Page = { items: PatientListItem[]; nextCursor: string | null; hasMore: boolean };
  return useInfiniteQuery<Page, Error, InfiniteData<Page>, ['patients', 'infinite', PatientListFilters], string | null>({
    queryKey: ['patients', 'infinite', filters],
    initialPageParam: null,
    queryFn: async ({ pageParam }) => {
      const res = await get<ListResponse>('/patients', {
        params: { ...filters, cursor: pageParam ?? undefined },
      });
      const nextCursor = res.pagination?.nextCursor ?? null;
      return {
        items: res.data,
        nextCursor,
        hasMore: Boolean(res.pagination?.hasMore) || Boolean(nextCursor),
      };
    },
    getNextPageParam: (lastPage) => (lastPage.hasMore ? lastPage.nextCursor : undefined),
  });
}

export function usePatient(id: string | undefined) {
  return useQuery({
    enabled: !!id,
    queryKey: ['patients', 'detail', id],
    queryFn: () =>
      get<PatientListItem & { allergies?: { substance: string; severity?: string }[]; chronicConditions?: string[] }>(`/patients/${id}`),
  });
}

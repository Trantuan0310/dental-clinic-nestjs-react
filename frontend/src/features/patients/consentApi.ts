import { api, unwrap } from '@/lib/api';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

export interface ConsentRecord {
  id: string; purpose: string; version: string; text: string; channel: string;
  createdAt: string; withdrawnAt: string | null; patientId: string | null; bookingRequestId: string | null;
}
export interface ConsentNotice { purpose: string; version: string; text: string }
export interface ConsentNotices { booking: ConsentNotice | null; intake: ConsentNotice | null; desk: ConsentNotice | null }

export function usePatientConsents(patientId: string) {
  return useQuery({
    queryKey: ['patient-consents', patientId],
    queryFn: async () => unwrap((await api.get<{ data: ConsentRecord[] }>(`/patients/${patientId}/consents`)).data),
  });
}

export function useConsentNotices() {
  return useQuery({
    queryKey: ['consent-notices'],
    queryFn: async () => unwrap((await api.get<{ data: ConsentNotices }>('/public/consent-notices')).data),
  });
}

export function useRecordDeskConsent(patientId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (notice: ConsentNotice) => unwrap((await api.post<{ data: ConsentRecord }>(
      `/patients/${patientId}/consents`, { purpose: notice.purpose, version: notice.version },
    )).data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['patient-consents', patientId] }),
  });
}

export function useWithdrawConsent(patientId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (recordId: string) => api.post(`/patients/${patientId}/consents/${recordId}/withdraw`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['patient-consents', patientId] }),
  });
}

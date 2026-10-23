// Recall reminders (nhắc tái khám định kỳ) — /recalls.

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, type AuthEnvelope, unwrap } from '@/lib/api';

export type RecallStatus = 'PENDING' | 'POSTPONED' | 'BOOKED' | 'DISMISSED' | 'DONE';
export type RecallScope = 'due' | 'booked' | 'closed';
export type RecallContactResult = 'BOOKED' | 'POSTPONED' | 'UNREACHABLE' | 'DISMISSED';

export interface Recall {
  id: string;
  status: RecallStatus;
  dueDate: string;
  overdue: boolean;
  postponedUntil: string | null;
  patient: {
    id: string;
    code: string;
    fullName: string;
    phone: string | null;
    hasEmail: boolean;
    optedOut: boolean;
  };
  service: { id: string; code: string; name: string };
  lastVisitAt: string | null;
  sourceEncounterId: string | null;
  emailedAt: string | null;
  contactAttempts: number;
  lastContact: {
    at: string;
    by: string | null;
    result: RecallContactResult | null;
    note: string | null;
  } | null;
  nextVisitAt: string | null;
  closedAt: string | null;
}

export interface RecallContactInput {
  result: RecallContactResult;
  postponedUntil?: string;
  note?: string;
}

export const recallKeys = {
  all: ['recalls'] as const,
  list: (scope: RecallScope, days: number, q: string) => ['recalls', scope, days, q] as const,
};

export const recallsApi = {
  async list(scope: RecallScope, days: number, q: string): Promise<Recall[]> {
    const { data } = await api.get<AuthEnvelope<Recall[]>>('/recalls', {
      params: { scope, days, ...(q.trim() && { q: q.trim() }) },
    });
    return unwrap(data);
  },
  async contact(id: string, input: RecallContactInput): Promise<Recall> {
    const { data } = await api.post<AuthEnvelope<Recall>>(`/recalls/${id}/contact`, input);
    return unwrap(data);
  },
  async reopen(id: string): Promise<Recall> {
    const { data } = await api.post<AuthEnvelope<Recall>>(`/recalls/${id}/reopen`);
    return unwrap(data);
  },
  async setOptOut(patientId: string, optOut: boolean) {
    const { data } = await api.post<AuthEnvelope<{ patientId: string; optOut: boolean }>>(
      `/recalls/patients/${patientId}/opt-out`,
      { optOut },
    );
    return unwrap(data);
  },
  /** Public: the "stop recall emails" link. */
  async unsubscribe(token: string) {
    const { data } = await api.post<AuthEnvelope<{ unsubscribed: boolean }>>(
      '/public/recalls/unsubscribe',
      { token },
    );
    return unwrap(data);
  },
};

export function useRecalls(scope: RecallScope, days: number, q: string) {
  return useQuery({
    queryKey: recallKeys.list(scope, days, q),
    queryFn: () => recallsApi.list(scope, days, q),
  });
}

export function useRecallMutation<TVars, TResult>(mutationFn: (vars: TVars) => Promise<TResult>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSettled: () => queryClient.invalidateQueries({ queryKey: recallKeys.all }),
  });
}

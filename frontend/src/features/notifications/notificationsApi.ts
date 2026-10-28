// In-app notifications (header bell + /notifications history) and the
// "waiting on you" counts. See backend/src/notifications.

import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, type AuthEnvelope, unwrap } from '@/lib/api';

export type InboxType =
  | 'bookingRequest'
  | 'shiftRegistration'
  | 'draftInvoice'
  | 'recallsDue'
  | 'lowStock'
  | 'staleEncounters';

export interface InboxNotification {
  id: string;
  type: InboxType;
  title: string;
  body: string | null;
  targetId: string | null;
  createdAt: string;
  readAt: string | null;
}

export type PendingKey =
  | 'bookingRequests'
  | 'shiftApprovals'
  | 'recallsDue'
  | 'draftInvoices'
  | 'staleEncounters'
  | 'lowStock';

export interface PendingSummary {
  items: Array<{ key: PendingKey; count: number }>;
  total: number;
}

interface InboxPage {
  data: InboxNotification[];
  pagination: { nextCursor: string | null; hasMore: boolean };
}

export const notificationKeys = {
  all: ['notifications'] as const,
  unread: ['notifications', 'unread-count'] as const,
  list: (unreadOnly: boolean) => ['notifications', 'list', unreadOnly] as const,
  summary: ['notifications', 'summary'] as const,
};

const POLL = 60_000;

export function useUnreadCount(enabled = true) {
  return useQuery({
    queryKey: notificationKeys.unread,
    queryFn: async () =>
      unwrap((await api.get<AuthEnvelope<{ count: number }>>('/notifications/unread-count')).data).count,
    enabled,
    refetchInterval: POLL,
    staleTime: 30_000,
  });
}

export function useNotificationList(unreadOnly: boolean, enabled = true) {
  return useInfiniteQuery({
    queryKey: notificationKeys.list(unreadOnly),
    initialPageParam: null as string | null,
    queryFn: async ({ pageParam }) =>
      (
        await api.get<InboxPage>('/notifications', {
          params: { ...(unreadOnly && { unread: 'true' }), ...(pageParam && { cursor: pageParam }) },
        })
      ).data,
    getNextPageParam: (last) => last.pagination.nextCursor,
    enabled,
    refetchInterval: POLL,
  });
}

export function usePendingSummary(enabled = true) {
  return useQuery({
    queryKey: notificationKeys.summary,
    queryFn: async () =>
      unwrap((await api.get<AuthEnvelope<PendingSummary>>('/notifications/summary')).data),
    enabled,
    refetchInterval: POLL,
    staleTime: 30_000,
  });
}

export function useMarkRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.post(`/notifications/${id}/read`),
    onSettled: () => queryClient.invalidateQueries({ queryKey: notificationKeys.all }),
  });
}

export function useMarkAllRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.post('/notifications/read-all'),
    onSettled: () => queryClient.invalidateQueries({ queryKey: notificationKeys.all }),
  });
}

import { useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useAuthStore } from '@/stores/authStore';
import { notify } from '@/components/ui/Toast';

// Under the ["booking-requests"] prefix, so the inbox's own invalidation after
// confirm/decline refreshes the badge too.
export const PENDING_BOOKING_COUNT_KEY = ['booking-requests', 'pending-count'] as const;

/**
 * Online booking requests waiting on the front desk (new, or the patient
 * accepted a proposed time). Polled every minute while the app is open.
 */
export function usePendingBookingCount() {
  const canRead = useAuthStore((s) => !!s.user && s.hasPermission('booking_request.read'));
  const { data } = useQuery({
    queryKey: PENDING_BOOKING_COUNT_KEY,
    queryFn: async () =>
      (await api.get<{ data: { count: number } }>('/booking-requests/pending-count')).data.data.count,
    enabled: canRead,
    refetchInterval: 60_000,
    refetchIntervalInBackground: true,
    staleTime: 30_000,
  });
  return canRead ? (data ?? 0) : 0;
}

/**
 * Mounted once in the app shell: tells the front desk when a new request
 * arrives while they are working elsewhere, and shows the count in the tab
 * title so it is visible from other browser tabs.
 */
export function PendingBookingWatcher() {
  const count = usePendingBookingCount();
  const previous = useRef<number | null>(null);

  useEffect(() => {
    if (previous.current !== null && count > previous.current) {
      notify.info(
        count - previous.current === 1
          ? 'Có yêu cầu đặt lịch online mới cần xử lý'
          : `Có ${count - previous.current} yêu cầu đặt lịch online mới cần xử lý`,
      );
    }
    previous.current = count;
  }, [count]);

  useEffect(() => {
    const strip = () => document.title.replace(/^\(\d+\)\s+/, '');
    document.title = count > 0 ? `(${count}) ${strip()}` : strip();
    return () => {
      document.title = strip();
    };
  }, [count]);

  return null;
}

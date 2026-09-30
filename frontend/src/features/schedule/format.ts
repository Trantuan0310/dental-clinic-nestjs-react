import type { ScheduleChangeImpact } from '@/types/schedule';

export function formatDateTime(value: string): string {
  return new Date(value).toLocaleString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** True when a calendar change left something for the front desk to handle. */
export function hasImpact(impact: ScheduleChangeImpact | null | undefined): impact is ScheduleChangeImpact {
  return Boolean(impact && (impact.affectedAppointments.length > 0 || (impact.affectedBookingRequests?.length ?? 0) > 0));
}

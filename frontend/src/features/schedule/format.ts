import type { ScheduleChangeImpact } from '@/types/schedule';

/** dd/mm/yyyy HH:mm in clinic time, whatever zone the workstation is set to (A1-14). */
export function formatDateTime(value: string): string {
  return new Date(value).toLocaleString('vi-VN', {
    timeZone: 'Asia/Ho_Chi_Minh',
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

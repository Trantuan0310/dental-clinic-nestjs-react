import { useAuthStore } from '@/stores/authStore';
import { useDentistOptions } from '@/features/appointments/appointmentApi';

/**
 * Dentists the current user may create schedules/time-off for. A plain
 * dentist (appointment.read.own without .any) may only manage their own —
 * the backend enforces the same rule, this just avoids offering choices that
 * would be rejected.
 */
export function useSchedulableDentists() {
  const { data: dentists = [] } = useDentistOptions();
  const userId = useAuthStore((s) => s.user?.id);
  const hasPermission = useAuthStore((s) => s.hasPermission);
  const ownOnly = hasPermission('appointment.read.own') && !hasPermission('appointment.read.any');

  return {
    dentists: ownOnly ? dentists.filter((d) => d.id === userId) : dentists,
    /** Pre-selected dentist id ('' when the user may pick anyone). */
    defaultDentistId: ownOnly ? (userId ?? '') : '',
  };
}

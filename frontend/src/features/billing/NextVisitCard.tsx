import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';
import { CalendarCheck, CalendarPlus } from 'lucide-react';
import { Button, Card } from '@/components/ui';
import { useAppointments } from '@/features/appointments/appointmentApi';
import { clinicToday } from '@/lib/clinicTime';
import { formatDateTime } from '@/lib/format';
import { useAuthStore } from '@/stores/authStore';
import type { AppointmentStatus } from '@/types/appointment';

const HOLDING: AppointmentStatus[] = ['scheduled', 'confirmed', 'checked_in', 'in_progress'];
const HORIZON_DAYS = 365;

function daysAfter(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * Shown on an invoice once it is paid in full: the desk is with the patient
 * right now, so this is the moment to book the next visit. Either the visit
 * that already exists, or a button into the booking form with the patient,
 * the dentist who treated them and "follow-up" already filled in.
 */
export function NextVisitCard({
  patientId,
  dentistId,
  encounterId,
}: {
  patientId: string;
  dentistId?: string;
  encounterId?: string;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const canBook = useAuthStore((s) => s.hasPermission('appointment.create'));
  const today = clinicToday();
  const { data, isLoading } = useAppointments({
    patientId,
    from: today,
    to: daysAfter(today, HORIZON_DAYS),
  });
  if (!canBook || isLoading) return null;

  const now = Date.now();
  const next = (data?.data ?? [])
    .filter((a) => HOLDING.includes(a.status) && new Date(a.startsAt).getTime() > now)
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt))[0];

  const book = () => {
    const params = new URLSearchParams({ patientId, type: 'follow_up' });
    if (dentistId) params.set('dentistId', dentistId);
    if (encounterId) params.set('encounterId', encounterId);
    navigate(`/appointments?${params.toString()}`);
  };

  return (
    <div data-testid="next-visit-card">
      <Card title={t('uiOperations.nextVisitTitle')}>
        {next ? (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="flex items-center gap-2 text-sm text-gray-800 dark:text-surface-100">
              <CalendarCheck className="h-4 w-4 text-emerald-600" aria-hidden />
              {t('uiOperations.nextVisitHas', { when: formatDateTime(next.startsAt) })}
            </p>
            <Link
              to={`/appointments/list?open=${next.id}`}
              className="text-sm font-medium text-brand-600 hover:underline dark:text-brand-400"
            >
              {t('uiOperations.nextVisitOpen')}
            </Link>
          </div>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-gray-700 dark:text-surface-200">{t('uiOperations.nextVisitNone')}</p>
            <Button leftIcon={<CalendarPlus className="h-4 w-4" />} onClick={book}>
              {t('uiOperations.nextVisitBook')}
            </Button>
          </div>
        )}
      </Card>
    </div>
  );
}

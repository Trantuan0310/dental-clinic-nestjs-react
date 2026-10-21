import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { addDays, format, parseISO } from 'date-fns';
import { enUS, vi } from 'date-fns/locale';
import { useTranslation } from 'react-i18next';
import { ChevronLeft, ChevronRight, Play, ArrowRight, AlertCircle } from 'lucide-react';
import { appointmentsApi } from '@/features/appointments/imperativeApi';
import { useStartEncounter } from '@/features/appointments/appointmentApi';
import {
  isOverdueNotArrived,
  liveAppointmentQuery,
  useClinicToday,
  useNow,
} from '@/features/appointments/liveStatus';
import { Button, Card, ConfirmDialog, EmptyState, FormSkeleton } from '@/components/ui';
import { PermissionGuard } from '@/components/PermissionGuard';
import { AppointmentStatusBadge } from '@/components/ui/StatusBadge';
import { notify } from '@/components/ui/Toast';
import { getApiErrorMessage } from '@/lib/errors';
import { useNavigate } from 'react-router-dom';
import { formatTimeOnly } from '@/lib/format';

export default function TodayPage() {
  const { t, i18n } = useTranslation();
  const dateLocale = i18n.language === 'vi' ? vi : enUS;
  const navigate = useNavigate();
  // null = follow the clinic's today, so a page left open overnight moves
  // to the new day; the arrows pick a fixed date.
  const clinicDay = useClinicToday();
  const [pickedDay, setPickedDay] = useState<string | null>(null);
  const today = pickedDay ?? clinicDay;
  const currentDate = parseISO(today);
  const goToDay = (delta: number) => {
    const next = format(addDays(currentDate, delta), 'yyyy-MM-dd');
    setPickedDay(next === clinicDay ? null : next);
  };
  const startEncounter = useStartEncounter();
  const now = useNow();
  // A3-03: confirm who is starting; a wrong start has no easy way back.
  const [confirmStart, setConfirmStart] = useState<{ id: string; name: string; code: string } | null>(null);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['appointments', 'all', { from: today, to: today }],
    queryFn: () => appointmentsApi.listAll({ from: today, to: today }),
    ...liveAppointmentQuery({ from: today, to: today }),
  });

  const handleStart = async (appointmentId: string) => {
    try {
      const updated = await startEncounter.mutateAsync(appointmentId);
      navigate(`/encounters/${updated.encounterId}`);
    } catch (err) {
      notify.error(getApiErrorMessage(err, t('uiClinical.startEncounterError')));
    }
  };

  const appointments = data?.data ?? [];
  const checkedIn = appointments.filter(a => a.status === 'checked_in' || a.status === 'in_progress');
  const completed = appointments.filter(a => a.status === 'completed');

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      scheduled: 'border-gray-300 bg-white dark:border-surface-600 dark:bg-surface-800',
      confirmed: 'border-blue-300 bg-blue-50 dark:border-blue-700 dark:bg-blue-950',
      checked_in: 'border-cyan-300 bg-cyan-50 dark:border-cyan-700 dark:bg-cyan-950',
      in_progress: 'border-amber-300 bg-amber-50 dark:border-amber-600 dark:bg-amber-950',
      completed: 'border-green-300 bg-green-50 dark:border-green-700 dark:bg-green-950',
      cancelled: 'border-red-300 bg-red-50 opacity-50 dark:border-red-800 dark:bg-red-950',
      no_show: 'border-red-300 bg-red-50 opacity-50 dark:border-red-800 dark:bg-red-950',
      left: 'border-orange-300 bg-orange-50 opacity-50 dark:border-orange-700 dark:bg-orange-950',
    };
    return colors[status] || 'border-gray-300 bg-white dark:border-surface-600 dark:bg-surface-800';
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-surface-100">
            {t('uiClinical.todayTitle', { date: format(currentDate, 'EEEE, dd/MM/yyyy', { locale: dateLocale }) })}
          </h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-surface-400">
            {t('uiClinical.todaySubtitle')}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" aria-label={t('uiClinical.previousDay')} onClick={() => goToDay(-1)}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={() => setPickedDay(null)}>
            {t('uiScheduling.today')}
          </Button>
          <Button variant="ghost" size="sm" aria-label={t('uiClinical.nextDay')} onClick={() => goToDay(1)}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <div className="text-center">
            <p className="text-3xl font-bold text-gray-900 dark:text-surface-100">
              {isLoading || isError ? '—' : appointments.length}
            </p>
            <p className="text-sm text-gray-500 dark:text-surface-400">{t('uiClinical.todayTotal')}</p>
          </div>
        </Card>
        <Card>
          <div className="text-center">
            <p className="text-3xl font-bold text-amber-600">
              {isLoading || isError ? '—' : checkedIn.length}
            </p>
            <p className="text-sm text-gray-500 dark:text-surface-400">{t('uiClinical.todayWaitingOrInProgress')}</p>
          </div>
        </Card>
        <Card>
          <div className="text-center">
            <p className="text-3xl font-bold text-green-600">
              {isLoading || isError ? '—' : completed.length}
            </p>
            <p className="text-sm text-gray-500 dark:text-surface-400">{t('uiClinical.todayCompleted')}</p>
          </div>
        </Card>
      </div>

      {/* Appointments List */}
      <Card title={t('uiClinical.todayAppointments')}>
        {isLoading ? (
          <FormSkeleton rows={4} columns={3} />
        ) : isError ? (
          <EmptyState
            icon={<AlertCircle className="h-10 w-10 text-red-400" />}
            title={t('uiScheduling.cannotLoadAppointments')}
            description={t('uiClinical.loadErrorCheckAccess')}
            action={{ label: t('uiClinical.retry'), onClick: () => refetch() }}
          />
        ) : appointments.length === 0 ? (
          <p className="text-center py-8 text-gray-500 dark:text-surface-400">{t('uiClinical.todayNoAppointments')}</p>
        ) : (
          <div className="space-y-3">
            {[...appointments]
              .sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime())
              .map((apt) => {
                const isCurrent = apt.status === 'in_progress';
                return (
                  <div
                    key={apt.id}
                    className={`rounded-lg border-2 p-4 ${getStatusColor(apt.status)} ${isCurrent ? 'ring-2 ring-brand-500' : ''}`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex items-start gap-4">
                        <div className="text-center">
                          <p className="text-lg font-bold text-gray-900 dark:text-surface-100">
                            {formatTimeOnly(apt.startsAt)}
                          </p>
                          <p className="text-xs text-gray-500 dark:text-surface-400">
                            {t('uiScheduling.minutesValue', { count: apt.durationMinutes })}
                          </p>
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            {isCurrent && (
                              <span className="font-medium text-brand-600 dark:text-brand-300">{t('uiClinical.inProgressCaps')}</span>
                            )}
                            <p className="font-medium text-gray-900 dark:text-surface-100">{apt.patientName}</p>
                          </div>
                          {apt.patientPhone && (
                            <p className="text-sm text-gray-500 dark:text-surface-400">{apt.patientPhone}</p>
                          )}
                          {apt.chiefComplaint && (
                            <p className="mt-1 text-sm text-gray-600 dark:text-surface-300">
                              <span className="font-medium">{t('uiScheduling.reason')}:</span> {apt.chiefComplaint}
                            </p>
                          )}
                          <p className="mt-1 text-sm text-gray-400 dark:text-surface-400">
                            Check-in: {apt.checkInAt ? formatTimeOnly(apt.checkInAt) : t('uiClinical.notCheckedIn')}
                          </p>
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-2">
                        <AppointmentStatusBadge
                          status={apt.status}
                          overdue={isOverdueNotArrived(apt, now)}
                        />
                        {apt.status === 'checked_in' && (
                          // Starting the exam is the dentist's step (encounter.start).
                          <PermissionGuard permission="encounter.start" mode="hide">
                            <Button
                              size="sm"
                              onClick={() =>
                                setConfirmStart({ id: apt.id, name: apt.patientName, code: apt.patientCode })
                              }
                              isLoading={startEncounter.isPending && startEncounter.variables === apt.id}
                            >
                              <Play className="h-4 w-4" />
                              {t('uiClinical.startExam')}
                            </Button>
                          </PermissionGuard>
                        )}
                        {apt.status === 'in_progress' && (
                          <Button
                            size="sm"
                            onClick={() => navigate(`/encounters/${apt.encounterId}`)}
                          >
                            {t('uiClinical.continueExam')}
                            <ArrowRight className="h-4 w-4" />
                          </Button>
                        )}
                        {apt.status === 'completed' && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => navigate(`/encounters/${apt.encounterId}`)}
                          >
                            {t('uiEntry.dashboard.viewDetails')}
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
          </div>
        )}
      </Card>

      <ConfirmDialog
        open={confirmStart !== null}
        onClose={() => setConfirmStart(null)}
        onConfirm={() => {
          if (confirmStart) void handleStart(confirmStart.id);
          setConfirmStart(null);
        }}
        title={t('uiClinical.startExamConfirmTitle')}
        description={
          confirmStart && (
            <>
              {t('uiClinical.startExamConfirmFor')} <strong>{confirmStart.name}</strong>{' '}
              {t('uiClinical.startExamConfirmCheck', { code: confirmStart.code })}
            </>
          )
        }
        confirmLabel={t('uiClinical.startExam')}
      />
    </div>
  );
}

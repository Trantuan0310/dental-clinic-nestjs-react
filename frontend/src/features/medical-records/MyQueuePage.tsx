import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, RefreshCw, Stethoscope } from 'lucide-react';
import { formatDate } from '@/lib/format';
import { clinicParts, clinicToday } from '@/lib/clinicTime';
import { useNavigate } from 'react-router-dom';
import { appointmentsApi } from '@/features/appointments/imperativeApi';
import { useStartEncounter } from '@/features/appointments/appointmentApi';
import { Button, Card, EmptyState, FormSkeleton } from '@/components/ui';
import { notify } from '@/components/ui/Toast';
import { getApiErrorMessage } from '@/lib/errors';
import { QueueList } from '@/features/dispatch/QueueList';
import { useQueue } from '@/features/dispatch/dispatchApi';
import { useTranslation } from 'react-i18next';

/**
 * The dentist's queue (ADR-0009 phase 6): patients waiting in dispatch
 * order — emergency first, then by the time each is due (BR-DSP-001). Call the
 * next one, start the exam, or skip someone who does not answer. Exams
 * already running are listed below to resume.
 */
export default function MyQueuePage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const startEncounter = useStartEncounter();
  const today = clinicToday();
  // The API scopes a dentist to their own queue; front desk sees every dentist.
  const { data: queue = [], isLoading, isError, refetch, isFetching } = useQueue();

  // No lower bound: an exam left open on an earlier day must surface here —
  // it is never closed automatically (it owns a medical record).
  const { data: running } = useQuery({
    queryKey: ['appointments', 'my-queue', 'in-progress', today],
    queryFn: () => appointmentsApi.list({ status: ['in_progress'], to: today, pageSize: 50 }),
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
  });
  // Clinic day, not the API's UTC range edge.
  const inProgress = (running?.data ?? []).filter(
    (apt) => clinicParts(apt.startsAt).date === today,
  );
  const unfinished = (running?.data ?? []).filter(
    (apt) => clinicParts(apt.startsAt).date < today,
  );

  const handleStart = async (appointmentId: string) => {
    try {
      const updated = await startEncounter.mutateAsync(appointmentId);
      navigate(`/encounters/${updated.encounterId}`);
    } catch (err) {
      notify.error(getApiErrorMessage(err, t('uiClinical.startEncounterError')));
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">{t('uiClinical.myQueue')}</h1>
          <p className="mt-1 text-sm text-gray-500">
            {t('uiClinical.queuePriority')}
          </p>
        </div>
        <Button variant="outline" onClick={() => void refetch()} isLoading={isFetching}>
          <RefreshCw className="h-4 w-4" />
          {t('uiEntry.dashboard.refresh')}
        </Button>
      </div>

      {unfinished.length > 0 && (
        <Card>
          <h2 className="mb-1 flex items-center gap-1.5 text-sm font-semibold text-rose-700">
            <AlertTriangle className="h-4 w-4" />
            {t('uiClinical.unfinishedEncounters')}
          </h2>
          <p className="mb-2 text-xs text-gray-500">
            {t('uiClinical.unfinishedEncountersHelp')}
          </p>
          <ul className="space-y-2">
            {unfinished.map((apt) => (
              <li key={apt.id} className="flex items-center justify-between rounded-md border border-rose-200 bg-rose-50 p-3">
                <span className="font-medium text-gray-900">
                  {apt.patientName}
                  <span className="ml-2 text-xs font-normal text-gray-500">
                    {formatDate(apt.startsAt, 'dd/MM/yyyy')} · {apt.dentistName}
                  </span>
                </span>
                <Button size="sm" variant="outline" onClick={() => navigate(`/encounters/${apt.encounterId}`)}>
                  <Stethoscope className="h-4 w-4" />
                  {t('uiClinical.openEncounter')}
                </Button>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {inProgress.length > 0 && (
        <Card>
          <h2 className="mb-2 text-sm font-semibold text-gray-700">{t('uiCommon.status.in_progress')}</h2>
          <ul className="space-y-2">
            {inProgress.map((apt) => (
              <li key={apt.id} className="flex items-center justify-between rounded-md border border-amber-200 bg-amber-50 p-3">
                <span className="font-medium text-gray-900">{apt.patientName}</span>
                <Button size="sm" onClick={() => navigate(`/encounters/${apt.encounterId}`)}>
                  <Stethoscope className="h-4 w-4" />
                  {t('uiClinical.continueExam')}
                </Button>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card>
        {isLoading ? (
          <FormSkeleton rows={3} />
        ) : isError ? (
          <EmptyState
            title={t('uiClinical.queueLoadError')}
            description={t('uiClinical.loadErrorCheckAccess')}
            action={{ label: t('uiClinical.retry'), onClick: () => void refetch() }}
          />
        ) : queue.length === 0 ? (
          <EmptyState
            icon={<div className="text-4xl">📋</div>}
            title={t('uiClinical.noWaitingPatients')}
            description={t('uiClinical.queueEmpty')}
          />
        ) : (
          <QueueList
            entries={queue}
            mode="dentist"
            onStart={(id) => void handleStart(id)}
            startingId={startEncounter.isPending ? (startEncounter.variables ?? null) : null}
          />
        )}
      </Card>

      {queue.length > 0 && (
        <p className="text-center text-sm text-gray-500">{t('uiClinical.queueRefresh')}</p>
      )}
    </div>
  );
}

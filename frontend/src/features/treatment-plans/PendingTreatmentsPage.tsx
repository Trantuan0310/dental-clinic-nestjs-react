import { useState } from 'react';
import { PlanContacts } from './PlanContacts';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { CalendarPlus, Phone } from 'lucide-react';
import { Alert, Button, Card, EmptyState, Tabs, TabsList, TabsTrigger } from '@/components/ui';
import { PageHeader } from '@/components/ui/PageHeader';
import { formatCurrency, formatDateTime, formatNumber } from '@/lib/format';
import { getApiErrorMessage } from '@/lib/errors';
import { useAuthStore } from '@/stores/authStore';
import { usePendingTreatments, type PendingTreatment } from './treatmentPlansApi';

type Scope = 'unscheduled' | 'booked';

/** Past this many days a patient who agreed to treatment and was never booked is flagged. */
const LONG_WAIT_DAYS = 14;

/**
 * Patients who accepted a treatment plan and still have lines to do. Those
 * with nothing booked come first, longest wait on top: the list the front
 * desk calls through, with the visit one click away.
 */
export default function PendingTreatmentsPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const canBook = useAuthStore((s) => s.hasPermission('appointment.create'));
  const [scope, setScope] = useState<Scope>('unscheduled');
  const { data, isLoading, error } = usePendingTreatments();
  const [uncontacted,setUncontacted]=useState(false);
  const visiblePlans = (row:PendingTreatment) => (row.plans ?? []).filter(plan =>
    !uncontacted || !plan.contacts.some(c=>c.outcome !== 'UNREACHABLE'));

  const rows = (data?.rows ?? []).filter((r) => (scope === 'unscheduled') === (r.nextAppointmentAt === null) && (!uncontacted || visiblePlans(r).length > 0));
  const summary = data?.summary;

  const book = (r: PendingTreatment) => {
    const params = new URLSearchParams({ patientId: r.patientId, type: 'treatment', dentistId: r.dentistId });
    navigate(`/appointments?${params.toString()}`);
  };

  return (
    <div className="space-y-4">
      <PageHeader title={t('uiPlans.pending.title')} description={t('uiPlans.pending.description')} />

      {summary && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3" data-testid="pending-summary">
          <Stat label={t('uiPlans.pending.patients')} value={formatNumber(summary.unscheduledPatients)} />
          <Stat label={t('uiPlans.pending.value')} value={formatCurrency(summary.unscheduledValue)} />
          <Stat label={t('uiPlans.pending.total')} value={formatNumber(summary.patients)} />
        </div>
      )}

      <Card>
        <Tabs value={scope} onValueChange={(v) => setScope(v as Scope)}>
          <TabsList>
            <TabsTrigger value="unscheduled">{t('uiPlans.pending.scope.unscheduled')}</TabsTrigger>
            <TabsTrigger value="booked">{t('uiPlans.pending.scope.booked')}</TabsTrigger>
          </TabsList>
        </Tabs>
        <label className="m-2 inline-flex gap-2"><input type="checkbox" checked={uncontacted} onChange={e=>setUncontacted(e.target.checked)}/>Chưa liên hệ thành công</label>
      </Card>

      {error ? (
        <Alert type="danger">{getApiErrorMessage(error, t('uiPlans.pending.loadError'))}</Alert>
      ) : (
        <Card noPadding>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead className="bg-gray-50 text-left text-gray-600 dark:bg-surface-800 dark:text-surface-300">
                <tr>
                  <th className="px-3 py-2">{t('uiPlans.pending.patient')}</th>
                  <th className="px-3 py-2">{t('uiPlans.pending.treatment')}</th>
                  <th className="px-3 py-2 text-right">{t('uiPlans.pending.worth')}</th>
                  <th className="px-3 py-2">{t('uiPlans.pending.waiting')}</th>
                  <th className="px-3 py-2">{t('uiPlans.pending.nextVisit')}</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr>
                    <td colSpan={6} className="px-3 py-6 text-center text-gray-500">{t('uiRecalls.loading')}</td>
                  </tr>
                ) : rows.length === 0 ? (
                  <tr>
                    <td colSpan={6}>
                      <EmptyState
                        title={t(scope === 'unscheduled' ? 'uiPlans.pending.emptyUnscheduled' : 'uiPlans.pending.emptyBooked')}
                      />
                    </td>
                  </tr>
                ) : (
                  rows.map((r) => (
                    <tr key={r.patientId} data-testid="pending-row" className="border-t border-gray-100 align-top dark:border-surface-700">
                      <td className="px-3 py-2">
                        <Link to={`/patients/${r.patientId}`} className="font-medium text-brand-600 hover:underline">
                          {r.patientName}
                        </Link>
                        <p className="text-xs text-gray-500">
                          {r.patientCode}
                          {r.phone ? ` • ${r.phone}` : ''}
                        </p>
                      </td>
                      <td className="px-3 py-2">
                        <p>{r.procedures.join(', ')}</p>
                        {visiblePlans(r).map(plan=><PlanContacts key={plan.id} plan={plan} canRecord={canBook}/>)}
                        <p className="text-xs text-gray-500">
                          {r.lineCount > r.procedures.length
                            ? `${t('uiPlans.pending.moreLines', { count: r.lineCount - r.procedures.length })} · `
                            : ''}
                          {r.dentistName ? t('uiPlans.pending.by', { name: r.dentistName }) : ''}
                        </p>
                      </td>
                      <td className="px-3 py-2 text-right font-mono tabular-nums">{formatCurrency(r.value)}</td>
                      <td className="px-3 py-2">
                        <span
                          className={
                            r.nextAppointmentAt === null && r.waitingDays > LONG_WAIT_DAYS
                              ? 'font-medium text-rose-700 dark:text-rose-400'
                              : ''
                          }
                        >
                          {r.waitingDays === 0
                            ? t('uiPlans.pending.today')
                            : t('uiPlans.pending.waitingDays', { count: r.waitingDays })}
                        </span>
                      </td>
                      <td className="px-3 py-2">
                        {r.nextAppointmentAt ? formatDateTime(r.nextAppointmentAt) : <span className="text-gray-400">—</span>}
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex flex-wrap justify-end gap-2">
                          {r.phone && (
                            <a
                              href={`tel:${r.phone.replace(/[^\d+]/g, '')}`}
                              aria-label={t('uiPlans.pending.callLabel', { name: r.patientName })}
                              className="inline-flex items-center gap-1 rounded-md border border-gray-300 px-2.5 py-1.5 text-sm text-gray-700 hover:bg-gray-50 dark:border-surface-600 dark:text-surface-200 dark:hover:bg-surface-800"
                            >
                              <Phone className="h-4 w-4" aria-hidden />
                              {t('uiPlans.pending.call')}
                            </a>
                          )}
                          {canBook && scope === 'unscheduled' && (
                            <Button size="sm" leftIcon={<CalendarPlus className="h-4 w-4" />} onClick={() => book(r)}>
                              {t('uiPlans.pending.book')}
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}
      <p className="text-xs text-gray-500 dark:text-surface-400">{t('uiPlans.pending.basis')}</p>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white px-4 py-3 shadow-sm dark:border-surface-700 dark:bg-surface-900">
      <p className="text-xs text-gray-500 dark:text-surface-400">{label}</p>
      <p className="mt-1 font-mono text-xl font-semibold tabular-nums text-gray-900 dark:text-surface-100">{value}</p>
    </div>
  );
}

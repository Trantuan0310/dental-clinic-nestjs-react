import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { CalendarPlus, PhoneCall, RotateCcw } from 'lucide-react';
import { Alert, Badge, Button, Card, Checkbox, Input, Modal, Select, Textarea } from '@/components/ui';
import { PageHeader } from '@/components/ui/PageHeader';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui';
import { notify } from '@/components/ui/Toast';
import { formatDate } from '@/lib/format';
import { getApiErrorMessage } from '@/lib/errors';
import { clinicToday } from '@/lib/clinicTime';
import { useAuthStore } from '@/stores/authStore';
import {
  recallsApi,
  useRecallMutation,
  useRecalls,
  type Recall,
  type RecallContactResult,
  type RecallScope,
} from './recallsApi';

const RESULTS: RecallContactResult[] = ['BOOKED', 'POSTPONED', 'UNREACHABLE', 'DISMISSED'];

/**
 * Front desk: patients due back for a recall (nhắc tái khám). Call them,
 * record the outcome, book the visit; the daily job has already emailed
 * those with an email.
 */
export default function RecallsPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const canManage = useAuthStore((s) => s.hasPermission('recall.manage'));
  const canBook = useAuthStore((s) => s.hasPermission('appointment.create'));
  const [scope, setScope] = useState<RecallScope>('due');
  const [days, setDays] = useState(14);
  const [q, setQ] = useState('');
  const { data: recalls = [], isLoading, error } = useRecalls(scope, days, q);

  const [contacting, setContacting] = useState<Recall | null>(null);
  const [result, setResult] = useState<RecallContactResult>('BOOKED');
  const [postponedUntil, setPostponedUntil] = useState('');
  const [note, setNote] = useState('');
  const [optOut, setOptOut] = useState(false);

  const onError = (err: unknown) => notify.error(getApiErrorMessage(err, t('uiRecalls.actionError')));
  const contact = useRecallMutation(async (v: { recall: Recall }) => {
    if (optOut !== v.recall.patient.optedOut) await recallsApi.setOptOut(v.recall.patient.id, optOut);
    return recallsApi.contact(v.recall.id, {
      result,
      ...(result === 'POSTPONED' && { postponedUntil }),
      ...(note.trim() && { note: note.trim() }),
    });
  });
  const reopen = useRecallMutation((id: string) => recallsApi.reopen(id));

  const openContact = (recall: Recall) => {
    setContacting(recall);
    setResult('BOOKED');
    setPostponedUntil('');
    setNote('');
    setOptOut(recall.patient.optedOut);
  };
  const contactInvalid =
    (result === 'POSTPONED' && (!postponedUntil || postponedUntil <= clinicToday())) ||
    (result === 'DISMISSED' && note.trim().length < 3);

  return (
    <div className="space-y-4">
      <PageHeader title={t('uiRecalls.title')} description={t('uiRecalls.description')} />

      <Card>
        <div className="flex flex-wrap items-end gap-3">
          <Tabs value={scope} onValueChange={(v) => setScope(v as RecallScope)}>
            <TabsList>
              <TabsTrigger value="due">{t('uiRecalls.scope.due')}</TabsTrigger>
              <TabsTrigger value="booked">{t('uiRecalls.scope.booked')}</TabsTrigger>
              <TabsTrigger value="closed">{t('uiRecalls.scope.closed')}</TabsTrigger>
            </TabsList>
          </Tabs>
          {scope === 'due' && (
            <div className="w-48">
              <Select
                label={t('uiRecalls.horizon')}
                value={String(days)}
                onChange={(e) => setDays(Number(e.target.value))}
                options={[0, 7, 14, 30].map((d) => ({
                  value: String(d),
                  label: d === 0 ? t('uiRecalls.horizonToday') : t('uiRecalls.horizonDays', { count: d }),
                }))}
              />
            </div>
          )}
          <div className="w-64">
            <Input
              label={t('uiRecalls.search')}
              placeholder={t('uiRecalls.searchPlaceholder')}
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
        </div>
      </Card>

      {error ? (
        <Alert type="danger">{getApiErrorMessage(error, t('uiRecalls.loadError'))}</Alert>
      ) : (
        <Card noPadding>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-left text-gray-600 dark:bg-surface-800 dark:text-surface-300">
                <tr>
                  <th className="px-3 py-2">{t('uiRecalls.patient')}</th>
                  <th className="px-3 py-2">{t('uiRecalls.service')}</th>
                  <th className="px-3 py-2">{t('uiRecalls.due')}</th>
                  <th className="px-3 py-2">{t('uiRecalls.email')}</th>
                  <th className="px-3 py-2">{t('uiRecalls.lastContact')}</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr>
                    <td colSpan={6} className="px-3 py-6 text-center text-gray-500">{t('uiRecalls.loading')}</td>
                  </tr>
                ) : recalls.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-3 py-6 text-center text-gray-500">{t('uiRecalls.empty')}</td>
                  </tr>
                ) : (
                  recalls.map((r) => (
                    <tr key={r.id} data-testid="recall-row" className="border-t border-gray-100 align-top dark:border-surface-700">
                      <td className="px-3 py-2">
                        <Link to={`/patients/${r.patient.id}`} className="font-medium text-brand-600 hover:underline">
                          {r.patient.fullName}
                        </Link>
                        <p className="text-xs text-gray-500">
                          {r.patient.code}
                          {r.patient.phone ? ` • ${r.patient.phone}` : ''}
                        </p>
                      </td>
                      <td className="px-3 py-2">
                        <p>{r.service.name}</p>
                        {r.lastVisitAt && (
                          <p className="text-xs text-gray-500">{t('uiRecalls.lastVisit', { date: formatDate(r.lastVisitAt) })}</p>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <span className={r.overdue && r.status === 'PENDING' ? 'font-medium text-red-600' : ''}>
                          {formatDate(r.dueDate)}
                        </span>
                        {r.status === 'POSTPONED' && r.postponedUntil && (
                          <p className="text-xs text-amber-700">{t('uiRecalls.callBackOn', { date: formatDate(r.postponedUntil) })}</p>
                        )}
                        {r.nextVisitAt && (
                          <p className="text-xs text-green-700">{t('uiRecalls.nextVisit', { date: formatDate(r.nextVisitAt) })}</p>
                        )}
                        {scope !== 'due' && <Badge className="mt-1">{t(`uiRecalls.status.${r.status}`)}</Badge>}
                      </td>
                      <td className="px-3 py-2 text-xs">
                        {r.patient.optedOut ? (
                          <Badge variant="warning">{t('uiRecalls.optedOut')}</Badge>
                        ) : !r.patient.hasEmail ? (
                          <span className="text-gray-500">{t('uiRecalls.noEmail')}</span>
                        ) : r.emailedAt ? (
                          <span className="text-green-700">{t('uiRecalls.emailedOn', { date: formatDate(r.emailedAt) })}</span>
                        ) : (
                          <span className="text-gray-500">{t('uiRecalls.notEmailed')}</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-xs">
                        {r.lastContact ? (
                          <>
                            <p>
                              {r.lastContact.result ? t(`uiRecalls.result.${r.lastContact.result}`) : ''}
                              {' — '}
                              {formatDate(r.lastContact.at)}
                              {r.lastContact.by ? ` (${r.lastContact.by})` : ''}
                            </p>
                            {r.lastContact.note && <p className="text-gray-500">{r.lastContact.note}</p>}
                            {r.contactAttempts > 1 && (
                              <p className="text-gray-500">{t('uiRecalls.attempts', { count: r.contactAttempts })}</p>
                            )}
                          </>
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex flex-wrap justify-end gap-2">
                          {canBook && scope === 'due' && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => navigate(`/appointments?patientId=${r.patient.id}`)}
                            >
                              <CalendarPlus className="h-4 w-4" />
                              {t('uiRecalls.book')}
                            </Button>
                          )}
                          {canManage && scope === 'due' && (
                            <Button size="sm" onClick={() => openContact(r)}>
                              <PhoneCall className="h-4 w-4" />
                              {t('uiRecalls.record')}
                            </Button>
                          )}
                          {canManage && (r.status === 'BOOKED' || r.status === 'DISMISSED') && (
                            <Button
                              variant="outline"
                              size="sm"
                              isLoading={reopen.isPending && reopen.variables === r.id}
                              onClick={() =>
                                reopen.mutate(r.id, {
                                  onSuccess: () => notify.success(t('uiRecalls.reopened')),
                                  onError,
                                })
                              }
                            >
                              <RotateCcw className="h-4 w-4" />
                              {t('uiRecalls.reopen')}
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

      <Modal
        isOpen={!!contacting}
        onClose={() => setContacting(null)}
        title={contacting ? t('uiRecalls.recordTitle', { name: contacting.patient.fullName }) : ''}
      >
        {contacting && (
          <div className="space-y-4">
            <p className="text-sm text-gray-600 dark:text-surface-300">
              {contacting.service.name} — {t('uiRecalls.dueOn', { date: formatDate(contacting.dueDate) })}
              {contacting.patient.phone ? ` • ${contacting.patient.phone}` : ''}
            </p>
            <Select
              label={t('uiRecalls.resultLabel')}
              value={result}
              onChange={(e) => setResult(e.target.value as RecallContactResult)}
              options={RESULTS.map((r) => ({ value: r, label: t(`uiRecalls.result.${r}`) }))}
            />
            {result === 'POSTPONED' && (
              <Input
                label={t('uiRecalls.callBackDate')}
                type="date"
                min={clinicToday()}
                value={postponedUntil}
                onChange={(e) => setPostponedUntil(e.target.value)}
              />
            )}
            <Textarea
              label={result === 'DISMISSED' ? t('uiRecalls.dismissReason') : t('uiRecalls.note')}
              rows={2}
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
            <Checkbox label={t('uiRecalls.optOutLabel')} checked={optOut} onChange={setOptOut} />
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setContacting(null)}>{t('uiRecalls.cancel')}</Button>
              <Button
                disabled={contactInvalid}
                isLoading={contact.isPending}
                onClick={() =>
                  contact.mutate(
                    { recall: contacting },
                    {
                      onSuccess: () => {
                        setContacting(null);
                        notify.success(t('uiRecalls.saved'));
                        if (result === 'BOOKED' && canBook) navigate(`/appointments?patientId=${contacting.patient.id}`);
                      },
                      onError,
                    },
                  )
                }
              >
                {t('uiRecalls.save')}
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Card, Spinner } from '@/components/ui';
import { PermissionGuard } from '@/components/PermissionGuard';
import { useAuthStore } from '@/stores/authStore';
import { formatDate } from '@/lib/format';
import { notify } from '@/components/ui/Toast';
import { useConsentNotices, usePatientConsents, useRecordDeskConsent, useWithdrawConsent } from './consentApi';

export function PatientConsentsTab({ patientId }: { patientId: string }) {
  const { t } = useTranslation();
  const canRead = useAuthStore((s) => s.hasPermission('consent.read'));
  const [attested, setAttested] = useState(false);
  const records = usePatientConsents(patientId);
  const notices = useConsentNotices();
  const capture = useRecordDeskConsent(patientId);
  const withdraw = useWithdrawConsent(patientId);
  const notice = notices.data?.desk;
  const alreadyRecorded = !!notice && !!records.data?.some((record) => record.purpose === notice.purpose && record.version === notice.version);

  if (!canRead) return null;
  return <div className="space-y-3">
    <Card title={t('uiClinical.consentLedger')}>
      {notices.isLoading ? <Spinner /> : notices.isError ? <p role="alert">{t('uiClinical.consentError')}</p> : notice ? <div className="space-y-3">
        <div className="rounded-lg bg-gray-50 p-3 text-sm dark:bg-surface-800">
          <p className="mb-1 font-medium">{t('uiClinical.consentNoticeVersion', { version: notice.version })}</p>
          <p className="whitespace-pre-wrap">{notice.text}</p>
        </div>
        <PermissionGuard permission="consent.manage">
          {alreadyRecorded ? <p className="text-sm text-gray-600">{t('uiClinical.consentVersionAlreadyRecorded')}</p> : <>
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" checked={attested} onChange={(e) => setAttested(e.target.checked)} />
            <span>{t('uiClinical.consentAttestation')}</span>
          </label>
          <Button disabled={!attested || capture.isPending} onClick={() => capture.mutate(notice, {
            onSuccess: () => { setAttested(false); notify.success(t('uiClinical.consentRecorded')); },
            onError: () => notify.error(t('uiClinical.consentError')),
          })}>{t('uiClinical.recordConsent')}</Button>
          </>}
        </PermissionGuard>
      </div> : <p className="text-sm text-gray-500">{t('uiClinical.noApprovedConsentNotice')}</p>}
    </Card>
    <Card title={t('uiClinical.consentHistory')}>
      {records.isLoading ? <Spinner /> : records.isError ? <p role="alert">{t('uiClinical.consentError')}</p> : !records.data?.length ? <p className="text-sm text-gray-500">{t('uiClinical.noConsentRecords')}</p> :
        <div className="space-y-3">{records.data.map((record) => <article key={record.id} className="rounded-lg border border-gray-100 p-3 dark:border-surface-700">
          <div className="flex flex-wrap items-center justify-between gap-2"><strong>{record.purpose} · {record.version}</strong><span className="text-sm text-gray-500">{formatDate(record.createdAt, 'dd/MM/yyyy HH:mm')} · {record.channel}</span></div>
          <p className="mt-2 whitespace-pre-wrap text-sm">{record.text}</p>
          {record.withdrawnAt ? <p className="mt-2 text-sm text-amber-700">{t('uiClinical.consentWithdrawn', { date: formatDate(record.withdrawnAt, 'dd/MM/yyyy HH:mm') })}</p> : <PermissionGuard permission="consent.manage"><Button className="mt-2" variant="outline" size="sm" disabled={withdraw.isPending} onClick={() => withdraw.mutate(record.id, { onSuccess: () => notify.success(t('uiClinical.consentWithdrawalRecorded')), onError: () => notify.error(t('uiClinical.consentError')) })}>{t('uiClinical.withdrawConsent')}</Button></PermissionGuard>}
        </article>)}</div>}
    </Card>
  </div>;
}

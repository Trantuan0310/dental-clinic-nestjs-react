import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Download } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { api } from '@/lib/api';
import { useAuthStore } from '@/stores/authStore';
import { Button, Card, SearchInput, Spinner } from '@/components/ui';
import { notify } from '@/components/ui/Toast';
import type { ConsentRecord } from '@/features/patients/consentApi';

const PAGE_SIZE = 25;

export default function ConsentLedgerPage() {
  const { t, i18n } = useTranslation();
  const [q, setQ] = useState('');
  const [offset, setOffset] = useState(0);
  const [exporting, setExporting] = useState(false);
  const canExport = useAuthStore((s) => s.hasPermission('consent.export'));
  const { data, isLoading, isError } = useQuery({
    queryKey: ['admin-consents', q, offset],
    queryFn: async () => (await api.get<{ data: ConsentRecord[]; total: number }>('/admin/consents', { params: { q: q || undefined, offset, limit: PAGE_SIZE } })).data,
  });
  const download = async () => {
    setExporting(true);
    try {
      const response = await api.get('/admin/consents/export', { params: { q: q || undefined }, responseType: 'blob' });
      const url = URL.createObjectURL(response.data);
      const link = document.createElement('a'); link.href = url; link.download = 'consent-ledger.csv'; link.click(); URL.revokeObjectURL(url);
    } catch { notify.error(t('uiWorkforce.consentExportError')); } finally { setExporting(false); }
  };
  const rows = data?.data ?? [];
  return <div className="space-y-4">
    <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center"><div><h1 className="text-2xl font-semibold">{t('uiWorkforce.consentAdminTitle')}</h1><p className="mt-1 text-sm text-gray-500">{t('uiWorkforce.consentAdminCount', { count: data?.total ?? 0 })}</p></div>{canExport && <Button variant="outline" disabled={exporting} onClick={download}><Download className="h-4 w-4" />{exporting ? t('uiWorkforce.consentExporting') : t('uiWorkforce.consentExport')}</Button>}</div>
    <Card noPadding><div className="p-4"><SearchInput placeholder={t('uiWorkforce.consentSearch')} value={q} onChange={(e) => { setQ(e.target.value); setOffset(0); }} onClear={() => { setQ(''); setOffset(0); }} /></div>
      {isLoading ? <div className="flex justify-center p-8"><Spinner /></div> : isError ? <p role="alert" className="p-6 text-sm text-red-600">{t('uiWorkforce.consentLoadError')}</p> : rows.length === 0 ? <p className="p-6 text-sm text-gray-500">{t('uiWorkforce.consentNoRecords')}</p> : <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr className="border-b bg-gray-50 dark:bg-surface-800">{['patient','purpose','version','channel','created','status'].map((key) => <th key={key} className="px-4 py-3">{t(`uiWorkforce.consentCol${key[0].toUpperCase()}${key.slice(1)}`)}</th>)}</tr></thead><tbody>{rows.map((r) => <tr key={r.id} className="border-b"><td className="px-4 py-3">{r.patientId ?? (r.bookingRequestId ? t('uiWorkforce.consentBookingReference', { id: r.bookingRequestId }) : '—')}</td><td className="px-4 py-3">{r.purpose}</td><td className="px-4 py-3">{r.version}</td><td className="px-4 py-3">{r.channel}</td><td className="px-4 py-3">{new Date(r.createdAt).toLocaleString(i18n.language === 'vi' ? 'vi-VN' : 'en-US', { timeZone: 'Asia/Ho_Chi_Minh' })}</td><td className="px-4 py-3">{r.withdrawnAt ? t('uiClinical.consentStatusWithdrawn') : t('uiClinical.consentStatusActive')}</td></tr>)}</tbody></table></div>}
      <div className="flex items-center justify-between border-t p-4 text-sm"><span>{t('uiWorkforce.consentPageRange', { from: data?.total ? offset + 1 : 0, to: Math.min(offset + PAGE_SIZE, data?.total ?? 0), total: data?.total ?? 0 })}</span><div className="flex gap-2"><Button variant="outline" size="sm" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}>{t('uiClinical.previous')}</Button><Button variant="outline" size="sm" disabled={offset + PAGE_SIZE >= (data?.total ?? 0)} onClick={() => setOffset(offset + PAGE_SIZE)}>{t('uiClinical.next')}</Button></div></div>
    </Card>
  </div>;
}

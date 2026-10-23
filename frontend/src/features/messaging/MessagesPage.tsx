import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Send } from 'lucide-react';
import { Alert, Badge, Button, Card, Input, Pagination } from '@/components/ui';
import { PageHeader } from '@/components/ui/PageHeader';
import { notify } from '@/components/ui/Toast';
import { api, type AuthEnvelope, unwrap } from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import { getApiErrorMessage } from '@/lib/errors';

type MessageStatus = 'SENT' | 'MOCKED' | 'FAILED' | 'SKIPPED';

interface MessagingStatus {
  sms: 'off' | 'mock' | 'esms';
  zalo: 'off' | 'mock' | 'zns';
  visitReminders: boolean;
  recallReminders: boolean;
  problems: string[];
}

interface MessageLog {
  id: string;
  channel: 'SMS' | 'ZALO';
  provider: string;
  recipient: string;
  template: string;
  body: string;
  status: MessageStatus;
  error: string | null;
  createdAt: string;
}

const STATUS_VARIANT: Record<MessageStatus, 'success' | 'info' | 'danger' | 'default'> = {
  SENT: 'success',
  MOCKED: 'info',
  FAILED: 'danger',
  SKIPPED: 'default',
};
const PAGE_SIZE = 50;

/** Admin: SMS / Zalo channels, a test message, and every message sent. */
export default function MessagesPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [phone, setPhone] = useState('');

  const { data: status } = useQuery({
    queryKey: ['messaging', 'status'],
    queryFn: async () => unwrap((await api.get<AuthEnvelope<MessagingStatus>>('/messaging/status')).data),
  });
  const { data: logs, isLoading, error } = useQuery({
    queryKey: ['messaging', 'logs', page],
    queryFn: async () =>
      (
        await api.get<{ data: MessageLog[]; total: number }>('/messaging/logs', {
          params: { page, pageSize: PAGE_SIZE },
        })
      ).data,
  });
  const test = useMutation({
    mutationFn: async () =>
      unwrap((await api.post<AuthEnvelope<{ status: MessageStatus | null }>>('/messaging/test', { phone })).data),
    onSuccess: (res) => {
      if (res.status) notify.success(t('uiMessaging.testResult', { status: t(`uiMessaging.status.${res.status}`) }));
      else notify.error(t('uiMessaging.allOff'));
    },
    onError: (err) => notify.error(getApiErrorMessage(err, t('uiMessaging.testError'))),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['messaging', 'logs'] }),
  });

  const allOff = status && status.sms === 'off' && status.zalo === 'off';

  return (
    <div className="space-y-4">
      <PageHeader title={t('uiMessaging.title')} description={t('uiMessaging.description')} />

      <Card title={t('uiMessaging.channels')}>
        {status && (
          <div className="space-y-3 text-sm">
            <div className="flex flex-wrap gap-6">
              <p>
                Zalo: <strong data-testid="zalo-provider">{t(`uiMessaging.provider.${status.zalo}`)}</strong>
              </p>
              <p>
                SMS: <strong data-testid="sms-provider">{t(`uiMessaging.provider.${status.sms}`)}</strong>
              </p>
              <p>
                {t('uiMessaging.visitReminders')}: <strong>{status.visitReminders ? t('uiMessaging.on') : t('uiMessaging.off')}</strong>
              </p>
              <p>
                {t('uiMessaging.recallReminders')}: <strong>{status.recallReminders ? t('uiMessaging.on') : t('uiMessaging.off')}</strong>
              </p>
            </div>
            {allOff && <Alert type="info">{t('uiMessaging.allOffHint')}</Alert>}
            {status.problems.length > 0 && (
              <Alert type="warning">
                <ul className="list-disc pl-4">
                  {status.problems.map((p) => (
                    <li key={p}>{p}</li>
                  ))}
                </ul>
              </Alert>
            )}
            <div className="flex flex-wrap items-end gap-2">
              <div className="w-56">
                <Input
                  label={t('uiMessaging.testPhone')}
                  placeholder="09xx xxx xxx"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                />
              </div>
              <Button
                variant="outline"
                disabled={!!allOff || phone.replace(/\D/g, '').length < 9}
                isLoading={test.isPending}
                onClick={() => test.mutate()}
              >
                <Send className="h-4 w-4" />
                {t('uiMessaging.sendTest')}
              </Button>
            </div>
          </div>
        )}
      </Card>

      {error ? (
        <Alert type="danger">{getApiErrorMessage(error, t('uiMessaging.loadError'))}</Alert>
      ) : (
        <Card title={t('uiMessaging.log')} noPadding>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-left text-gray-600 dark:bg-surface-800 dark:text-surface-300">
                <tr>
                  <th className="px-3 py-2">{t('uiMessaging.time')}</th>
                  <th className="px-3 py-2">{t('uiMessaging.channel')}</th>
                  <th className="px-3 py-2">{t('uiMessaging.recipient')}</th>
                  <th className="px-3 py-2">{t('uiMessaging.content')}</th>
                  <th className="px-3 py-2">{t('uiMessaging.statusLabel')}</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr>
                    <td colSpan={5} className="px-3 py-6 text-center text-gray-500">…</td>
                  </tr>
                ) : !logs?.data.length ? (
                  <tr>
                    <td colSpan={5} className="px-3 py-6 text-center text-gray-500">{t('uiMessaging.empty')}</td>
                  </tr>
                ) : (
                  logs.data.map((m) => (
                    <tr key={m.id} data-testid="message-row" className="border-t border-gray-100 align-top dark:border-surface-700">
                      <td className="whitespace-nowrap px-3 py-2">{formatDateTime(m.createdAt)}</td>
                      <td className="px-3 py-2">
                        {m.channel} <span className="text-xs text-gray-500">({m.provider})</span>
                      </td>
                      <td className="px-3 py-2">{m.recipient}</td>
                      <td className="px-3 py-2">
                        <p className="text-xs text-gray-500">{t(`uiMessaging.template.${m.template}`, { defaultValue: m.template })}</p>
                        <p>{m.body}</p>
                        {m.error && <p className="text-xs text-red-600">{m.error}</p>}
                      </td>
                      <td className="px-3 py-2">
                        <Badge variant={STATUS_VARIANT[m.status]}>{t(`uiMessaging.status.${m.status}`)}</Badge>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          {logs && logs.total > PAGE_SIZE && (
            <div className="p-3">
              <Pagination currentPage={page} totalPages={Math.ceil(logs.total / PAGE_SIZE)} onPageChange={setPage} />
            </div>
          )}
        </Card>
      )}
    </div>
  );
}

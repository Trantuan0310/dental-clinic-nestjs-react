import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Button, Card } from '@/components/ui';
import { PermissionGuard } from '@/components/PermissionGuard';
import { api } from '@/lib/api';
import { formatDate } from '@/lib/format';
import { getApiErrorMessage } from '@/lib/errors';
import { useCallPatient } from './dispatchApi';

interface Chair {
  dentistId: string; name: string; waiting: number;
  current: {name: string; startedAt: string}[];
  next: {id: string; name: string; minutes: number; called: boolean} | null;
}
export function ChairBoard({ dentistId }: { dentistId: string }) {
  const { t } = useTranslation();
  const k = (key: string, o?: Record<string, unknown>) => t(`uiScheduling.chairBoard.${key}`, o);
  const chairs = useQuery({
    queryKey: ['appointments', 'chairs'],
    queryFn: async () => (await api.get<{data: Chair[]}>('/queue/chairs')).data.data,
    refetchInterval: 20000,
  });
  const call = useCallPatient();
  if (chairs.isPending) return <p role="status">{k('loading')}</p>;
  if (chairs.isError) return <p role="alert">{k('loadError')}</p>;
  const rows = chairs.data.filter(c => !dentistId || c.dentistId === dentistId);
  return <section aria-label={k('label')}>
    {call.isError && <p role="alert">{getApiErrorMessage(call.error, k('callError'))}</p>}
    {!rows.length && <p>{k('noDentists')}</p>}
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{rows.map(c => <Card key={c.dentistId} title={c.name}>
      {c.current.length ? c.current.map(e => <p key={e.startedAt + e.name}>{k('inChair', { name: e.name, time: formatDate(e.startedAt, 'HH:mm') })}</p>) : <p>{k('free')}</p>}
      <p>{k('waiting', { n: c.waiting })}</p>
      {c.next && <div className="mt-2"><p>{k(c.next.called ? 'called' : 'next', { name: c.next.name })}</p>
        <p className={c.next.minutes > 30 ? 'text-red-700' : c.next.minutes >= 15 ? 'text-amber-700' : 'text-green-700'}>{k('waitMinutes', { n: c.next.minutes })}</p>
        {!c.next.called && <PermissionGuard permission="queue.call"><Button disabled={call.isPending} onClick={() => call.mutate(c.next!.id)}>{k('call')}</Button></PermissionGuard>}
      </div>}
    </Card>)}</div>
  </section>;
}

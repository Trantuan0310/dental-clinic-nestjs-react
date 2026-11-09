import { useQuery } from '@tanstack/react-query';
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
  const chairs = useQuery({
    queryKey: ['appointments', 'chairs'],
    queryFn: async () => (await api.get<{data: Chair[]}>('/queue/chairs')).data.data,
    refetchInterval: 20000,
  });
  const call = useCallPatient();
  if (chairs.isPending) return <p role="status">Đang tải bảng ghế…</p>;
  if (chairs.isError) return <p role="alert">Không tải được bảng ghế.</p>;
  const rows = chairs.data.filter(c => !dentistId || c.dentistId === dentistId);
  return <section aria-label="Bảng ghế">
    {call.isError && <p role="alert">{getApiErrorMessage(call.error, 'Không gọi được bệnh nhân.')}</p>}
    {!rows.length && <p>Không có bác sĩ.</p>}
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{rows.map(c => <Card key={c.dentistId} title={c.name}>
      {c.current.length ? c.current.map(e => <p key={e.startedAt + e.name}>Đang khám: {e.name} · {formatDate(e.startedAt, 'HH:mm')}</p>) : <p>Ghế trống</p>}
      <p>{c.waiting} người chờ</p>
      {c.next && <div className="mt-2"><p>{c.next.called ? 'Đã gọi' : 'Kế tiếp'}: {c.next.name}</p>
        <p className={c.next.minutes > 30 ? 'text-red-700' : c.next.minutes >= 15 ? 'text-amber-700' : 'text-green-700'}>Chờ {c.next.minutes} phút</p>
        {!c.next.called && <PermissionGuard permission="queue.call"><Button disabled={call.isPending} onClick={() => call.mutate(c.next!.id)}>Gọi khám</Button></PermissionGuard>}
      </div>}
    </Card>)}</div>
  </section>;
}

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { api, unwrap } from '@/lib/api';
import { Button, Card, EmptyState } from '@/components/ui';
import { PageHeader } from '@/components/ui/PageHeader';
import { useAuthStore } from '@/stores/authStore';
import { formatDateTime } from '@/lib/format';
import { clinicIso } from '@/lib/clinicTime';

type RequestRow = {
  id: string;
  appointmentId: string;
  requestedStartAt: string | null;
  requestedEndAt: string | null;
  note: string | null;
  status: 'PENDING' | 'APPROVED' | 'CANCELLED';
  holdUntil: string | null;
  createdAt: string;
  appointment: {
    id: string;
    startAt: string;
    endAt: string;
    status: string;
    confirmedByPatient: boolean;
    patient: { id: string; fullName: string; primaryPhone: string | null };
    dentist: { id: string; fullName: string };
  };
};

export default function RescheduleRequestsPage() {
  const { t } = useTranslation();
  const k = (key: string) => t(`uiScheduling.rescheduleRequests.${key}`);
  const qc = useQueryClient();
  const canApprove = useAuthStore((state) => state.hasPermission('appointment.update'));
  const requests = useQuery({
    queryKey: ['appointment-links', 'reschedule-requests'],
    queryFn: async () => unwrap((await api.get('/appointment-links/reschedule-requests')).data) as RequestRow[],
  });
  const approve = useMutation({
    mutationFn: async ({ id, startAt }: { id: string; startAt?: string }) => unwrap((await api.post(`/appointment-links/reschedule-requests/${encodeURIComponent(id)}/approve`, startAt ? { startAt } : {})).data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['appointment-links', 'reschedule-requests'] });
      void qc.invalidateQueries({ queryKey: ['appointments'] });
    },
  });
  const pending = requests.data?.filter((row) => row.status === 'PENDING') ?? [];
  return (
    <div className="space-y-5">
      <PageHeader title={k('title')} description={k('description')} />
      {requests.isError && <p role="alert" className="text-sm text-red-700">{k('loadError')}</p>}
      {requests.isPending ? <p role="status">{k('loading')}</p> : pending.length === 0 ? <EmptyState title={k('empty')} /> : (
        <div className="space-y-3">
          {pending.map((row) => <RequestCard key={row.id} row={row} onApprove={(startAt) => approve.mutate({ id: row.id, startAt })} busy={approve.isPending} canApprove={canApprove} />)}
        </div>
      )}
      {approve.isError && <p role="alert" className="text-sm text-red-700">{k('approveError')}</p>}
    </div>
  );
}

function RequestCard({ row, onApprove, busy, canApprove }: { row: RequestRow; onApprove: (startAt?: string) => void; busy: boolean; canApprove: boolean }) {
  const { t } = useTranslation();
  const k = (key: string, o?: Record<string, unknown>) => t(`uiScheduling.rescheduleRequests.${key}`, o);
  const [selected, setSelected] = useState('');
  const noteOnly = !row.requestedStartAt;
  return (
    <Card className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="space-y-1 text-sm">
        <p className="font-semibold">{row.appointment.patient.fullName}{row.appointment.patient.primaryPhone ? ` · ${row.appointment.patient.primaryPhone}` : ''}</p>
        <p className="text-gray-600">{row.appointment.dentist.fullName} · {k('current', { time: formatDateTime(row.appointment.startAt) })}</p>
        {row.requestedStartAt && <p>{k('wanted')} <strong>{formatDateTime(row.requestedStartAt)}</strong></p>}
        {row.note && <p>{k('note', { note: row.note })}</p>}
        {row.holdUntil && <p className="text-amber-700">{k('heldUntil', { time: formatDateTime(row.holdUntil) })}</p>}
        {noteOnly && <label className="flex flex-wrap items-center gap-2 pt-2">{k('newTime')} <input aria-label={k('newTimeFor', { name: row.appointment.patient.fullName })} type="datetime-local" value={selected} onChange={(e) => setSelected(e.target.value)} className="rounded border px-2 py-1" /></label>}
      </div>
      {canApprove && <Button disabled={busy || (noteOnly && !selected)} onClick={() => onApprove(selected ? clinicIso(selected.slice(0, 10), selected.slice(11, 16)) : undefined)}>{k('approve')}</Button>}
    </Card>
  );
}

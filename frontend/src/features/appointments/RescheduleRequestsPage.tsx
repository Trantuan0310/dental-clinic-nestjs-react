import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { api, unwrap } from '@/lib/api';
import { Button, Card, EmptyState } from '@/components/ui';
import { PageHeader } from '@/components/ui/PageHeader';
import { useAuthStore } from '@/stores/authStore';

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
  const qc = useQueryClient();
  const canApprove = useAuthStore((state) => state.hasPermission('appointment.reschedule'));
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
      <PageHeader title="Yêu cầu dời lịch" description="Khách gửi yêu cầu qua liên kết nhắc lịch." />
      {requests.isError && <p role="alert" className="text-sm text-red-700">Không tải được yêu cầu dời lịch.</p>}
      {requests.isPending ? <p role="status">Đang tải…</p> : pending.length === 0 ? <EmptyState title="Không có yêu cầu dời lịch chờ duyệt" /> : (
        <div className="space-y-3">
          {pending.map((row) => <RequestCard key={row.id} row={row} onApprove={(startAt) => approve.mutate({ id: row.id, startAt })} busy={approve.isPending} canApprove={canApprove} />)}
        </div>
      )}
      {approve.isError && <p role="alert" className="text-sm text-red-700">Không duyệt được yêu cầu. Có thể giờ đã được người khác đặt; hãy tải lại danh sách.</p>}
    </div>
  );
}

function RequestCard({ row, onApprove, busy, canApprove }: { row: RequestRow; onApprove: (startAt?: string) => void; busy: boolean; canApprove: boolean }) {
  const [selected, setSelected] = useState(row.requestedStartAt ?? '');
  const noteOnly = !row.requestedStartAt;
  return (
    <Card className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="space-y-1 text-sm">
        <p className="font-semibold">{row.appointment.patient.fullName}{row.appointment.patient.primaryPhone ? ` · ${row.appointment.patient.primaryPhone}` : ''}</p>
        <p className="text-gray-600">{row.appointment.dentist.fullName} · lịch hiện tại {format(new Date(row.appointment.startAt), 'dd/MM/yyyy HH:mm')}</p>
        {row.requestedStartAt && <p>Giờ khách muốn: <strong>{format(new Date(row.requestedStartAt), 'dd/MM/yyyy HH:mm')}</strong></p>}
        {row.note && <p>Ghi chú: {row.note}</p>}
        {row.holdUntil && <p className="text-amber-700">Giữ giờ đến {format(new Date(row.holdUntil), 'dd/MM/yyyy HH:mm')}</p>}
        {noteOnly && <label className="flex flex-wrap items-center gap-2 pt-2">Giờ mới <input aria-label={`Giờ mới cho ${row.appointment.patient.fullName}`} type="datetime-local" value={selected} onChange={(e) => setSelected(e.target.value)} className="rounded border px-2 py-1" /></label>}
      </div>
      {canApprove && <Button disabled={busy || (noteOnly && !selected)} onClick={() => onApprove(selected ? new Date(selected).toISOString() : undefined)}>Duyệt và dời lịch</Button>}
    </Card>
  );
}

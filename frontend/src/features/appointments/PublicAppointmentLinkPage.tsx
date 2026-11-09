import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { vi } from 'date-fns/locale';
import { api, unwrap } from '@/lib/api';
import { Button, Card, Input, Select, Textarea } from '@/components/ui';
import { PublicTopBar } from '@/features/booking/PublicTopBar';
import { PatientIntake } from '@/features/booking/PatientIntake';

type PublicAppointment = {
  startAt: string;
  endAt: string;
  dentist?: { fullName: string };
  services: Array<{ name: string }>;
  status: string;
  confirmedByPatient: boolean;
  canConfirm: boolean;
  canReschedule: boolean;
  canCancel: boolean;
  rescheduleRequest: { status: string; requestedStartAt: string | null; note: string | null } | null;
};

export default function PublicAppointmentLinkPage() {
  const { ma = '' } = useParams();
  const [date, setDate] = useState('');
  const [requestedAt, setRequestedAt] = useState('');
  const [note, setNote] = useState('');
  const [message, setMessage] = useState('');
  const [cancelled, setCancelled] = useState(false);
  const appointment = useQuery({
    queryKey: ['public-appointment-link', ma],
    queryFn: async () => unwrap((await api.get(`/public/appointment-links/${encodeURIComponent(ma)}`)).data) as PublicAppointment,
    retry: false,
  });
  const slots = useQuery({
    enabled: !!date,
    queryKey: ['public-appointment-link-slots', ma, date],
    queryFn: async () => unwrap((await api.get(`/public/appointment-links/${encodeURIComponent(ma)}/slots`, { params: { date } })).data) as { slots: Array<{ startAt: string; endAt: string }> },
  });
  const action = useMutation({
    mutationFn: async ({ name, body }: { name: 'confirm' | 'reschedule' | 'cancel'; body?: object }) =>
      unwrap((await api.post(`/public/appointment-links/${encodeURIComponent(ma)}/${name}`, body ?? {})).data),
    onSuccess: (_data, variables) => {
      setMessage(variables.name === 'confirm' ? 'Bạn đã xác nhận lịch hẹn.' : variables.name === 'cancel' ? 'Lịch hẹn đã được hủy.' : 'Đã gửi yêu cầu dời lịch để lễ tân xem xét.');
      if (variables.name === 'cancel') setCancelled(true);
      else void appointment.refetch();
    },
  });
  const resetAction = action.reset;

  useEffect(() => {
    setDate('');
    setRequestedAt('');
    setNote('');
    setMessage('');
    setCancelled(false);
    resetAction();
  }, [ma, resetAction]);

  const visit = appointment.data;
  return (
    <main className="min-h-screen bg-gray-50 px-4 py-6 dark:bg-surface-950">
      <div className="mx-auto max-w-xl">
        <PublicTopBar />
        <Card className="p-5 sm:p-7">
          {appointment.isPending ? <p role="status">Đang tải lịch hẹn…</p> : appointment.isError || !visit ? (
            <div role="alert"><h1 className="text-xl font-semibold">Liên kết không hợp lệ hoặc đã hết hạn</h1><p className="mt-2 text-sm text-gray-600">Vui lòng liên hệ phòng khám để được hỗ trợ.</p></div>
          ) : (
            <>
              <h1 className="text-xl font-semibold">Lịch hẹn của bạn</h1>
              <dl className="mt-5 grid gap-3 text-sm">
                <div><dt className="text-gray-500">Ngày giờ</dt><dd className="font-medium">{format(new Date(visit.startAt), 'EEEE, dd/MM/yyyy · HH:mm', { locale: vi })}</dd></div>
                <div><dt className="text-gray-500">Bác sĩ</dt><dd className="font-medium">{visit.dentist?.fullName}</dd></div>
                {visit.services.length > 0 && <div><dt className="text-gray-500">Dịch vụ</dt><dd className="font-medium">{visit.services.map((s) => s.name).join(', ')}</dd></div>}
              </dl>
              {message && <p className="mt-4 rounded-md bg-green-50 p-3 text-sm text-green-800" role="status">{message}</p>}
              {visit.rescheduleRequest && <p className="mt-4 text-sm text-amber-700">Bạn đã gửi yêu cầu dời lịch, phòng khám sẽ liên hệ lại.</p>}
              {action.isError && <p className="mt-4 text-sm text-red-700" role="alert">Không thể cập nhật lịch hẹn. Vui lòng thử lại hoặc gọi phòng khám.</p>}
              {action.isPending ? <p className="mt-4" role="status">Đang gửi…</p> : null}
              {!cancelled && visit.status !== 'cancelled' && visit.status !== 'completed' && (
                <div className="mt-6 space-y-5 border-t pt-5">
                  <PatientIntake key={ma} token={ma} />
                  {visit.canConfirm && <Button onClick={() => action.mutate({ name: 'confirm' })}>Xác nhận lịch hẹn</Button>}
                  {visit.canReschedule && !visit.rescheduleRequest && <section className="space-y-3" aria-labelledby="reschedule-title">
                    <h2 id="reschedule-title" className="font-semibold">Xin dời lịch</h2>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <Input aria-label="Ngày muốn dời" type="date" value={date} onChange={(e) => { setDate(e.target.value); setRequestedAt(''); }} />
                      <Select aria-label="Giờ còn trống" value={requestedAt} onChange={(e) => setRequestedAt(e.target.value)} disabled={!date || slots.isLoading} placeholder="Chọn giờ" options={slots.data?.slots.map((slot) => ({ value: slot.startAt, label: format(new Date(slot.startAt), 'HH:mm') })) ?? []} />
                    </div>
                    <Textarea aria-label="Ghi chú dời lịch" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ghi chú (không bắt buộc)" />
                    <Button variant="outline" disabled={(!requestedAt && !note.trim()) || action.isPending} onClick={() => action.mutate({ name: 'reschedule', body: { startAt: requestedAt || undefined, note: note.trim() || undefined } })}>Gửi yêu cầu dời lịch</Button>
                    {slots.isError && <p role="alert" className="text-sm text-red-700">Không tải được giờ trống.</p>}
                  </section>}
                  {visit.canCancel && <Button variant="ghost" className="text-red-700" disabled={action.isPending} onClick={() => { if (window.confirm('Bạn có chắc muốn hủy lịch hẹn này?')) action.mutate({ name: 'cancel' }); }}>Hủy lịch hẹn</Button>}
                </div>
              )}
            </>
          )}
        </Card>
      </div>
    </main>
  );
}

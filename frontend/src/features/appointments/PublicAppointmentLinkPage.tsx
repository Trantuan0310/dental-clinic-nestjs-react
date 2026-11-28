import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { formatDate } from '@/lib/format';
import { clinicParts } from '@/lib/clinicTime';
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
  const { t } = useTranslation();
  const k = (key: string) => t(`uiScheduling.visitLink.${key}`);
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
      setMessage(variables.name === 'confirm' ? 'confirmedMsg' : variables.name === 'cancel' ? 'cancelledMsg' : 'rescheduleMsg');
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
          {appointment.isPending ? <p role="status">{k('loading')}</p> : appointment.isError || !visit ? (
            <div role="alert"><h1 className="text-xl font-semibold">{k('invalidTitle')}</h1><p className="mt-2 text-sm text-gray-600">{k('invalidHint')}</p></div>
          ) : (
            <>
              <h1 className="text-xl font-semibold">{k('title')}</h1>
              <dl className="mt-5 grid gap-3 text-sm">
                <div><dt className="text-gray-500">{k('when')}</dt><dd className="font-medium">{formatDate(visit.startAt, 'EEEE, dd/MM/yyyy · HH:mm')}</dd></div>
                <div><dt className="text-gray-500">{k('dentist')}</dt><dd className="font-medium">{visit.dentist?.fullName}</dd></div>
                {visit.services.length > 0 && <div><dt className="text-gray-500">{k('services')}</dt><dd className="font-medium">{visit.services.map((s) => s.name).join(', ')}</dd></div>}
              </dl>
              {message && <p className="mt-4 rounded-md bg-green-50 p-3 text-sm text-green-800" role="status">{k(message)}</p>}
              {visit.rescheduleRequest && <p className="mt-4 text-sm text-amber-700">{k('requestSent')}</p>}
              {action.isError && <p className="mt-4 text-sm text-red-700" role="alert">{k('updateError')}</p>}
              {action.isPending ? <p className="mt-4" role="status">{k('sending')}</p> : null}
              {!cancelled && visit.status !== 'cancelled' && visit.status !== 'completed' && (
                <div className="mt-6 space-y-5 border-t pt-5">
                  <PatientIntake key={ma} token={ma} />
                  {visit.canConfirm && <Button onClick={() => action.mutate({ name: 'confirm' })}>{k('confirm')}</Button>}
                  {visit.canReschedule && !visit.rescheduleRequest && <section className="space-y-3" aria-labelledby="reschedule-title">
                    <h2 id="reschedule-title" className="font-semibold">{k('rescheduleTitle')}</h2>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <Input aria-label={k('newDate')} type="date" value={date} onChange={(e) => { setDate(e.target.value); setRequestedAt(''); }} />
                      <Select aria-label={k('freeTimes')} value={requestedAt} onChange={(e) => setRequestedAt(e.target.value)} disabled={!date || slots.isLoading} placeholder={k('pickTime')} options={slots.data?.slots.map((slot) => ({ value: slot.startAt, label: clinicParts(slot.startAt).time })) ?? []} />
                    </div>
                    <Textarea aria-label={k('noteLabel')} value={note} onChange={(e) => setNote(e.target.value)} placeholder={k('notePlaceholder')} />
                    <Button variant="outline" disabled={(!requestedAt && !note.trim()) || action.isPending} onClick={() => action.mutate({ name: 'reschedule', body: { startAt: requestedAt || undefined, note: note.trim() || undefined } })}>{k('sendReschedule')}</Button>
                    {slots.isError && <p role="alert" className="text-sm text-red-700">{k('slotsError')}</p>}
                  </section>}
                  {visit.canCancel && <Button variant="ghost" className="text-red-700" disabled={action.isPending} onClick={() => { if (window.confirm(k('cancelConfirm'))) action.mutate({ name: 'cancel' }); }}>{k('cancel')}</Button>}
                </div>
              )}
            </>
          )}
        </Card>
      </div>
    </main>
  );
}

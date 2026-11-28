import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui';
import { api } from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import { getApiErrorMessage } from '@/lib/errors';
import { MessageDraftModal } from '../ai/MessageDraftModal';
import { planKeys, type PendingTreatment } from './treatmentPlansApi';

const CHANNELS = ['PHONE', 'SMS', 'ZALO', 'EMAIL', 'DESK'];
const OUTCOMES = ['REACHED', 'CALL_BACK', 'DECLINED', 'UNREACHABLE'];
export function PlanContacts({
  plan,
  canRecord,
}: {
  plan: PendingTreatment['plans'][number];
  canRecord: boolean;
}) {
  const { t } = useTranslation();
  const k = (key: string, o?: Record<string, unknown>) => t(`uiPlans.contacts.${key}`, o);
  const qc = useQueryClient();
  const [draft, setDraft] = useState(false),
    [channel, setChannel] = useState('PHONE'),
    [outcome, setOutcome] = useState('REACHED'),
    [time, setTime] = useState('');
  const save = useMutation({
    mutationFn: () =>
      api.post('/treatment-plans/' + plan.id + '/contacts', {
        channel,
        outcome,
        contactedAt: time ? new Date(time + ':00+07:00').toISOString() : undefined,
      }),
    onSuccess: () => {
      setTime('');
      return qc.invalidateQueries({ queryKey: planKeys.pending });
    },
  });
  return (
    <details className="mt-2 rounded border p-2">
      <summary className="cursor-pointer">
        {k('summary', { title: plan.title, n: plan.contacts.length })}
      </summary>
      <ul>
        {plan.contacts.map(c => (
          <li key={c.id}>
            {formatDateTime(c.contactedAt)} · {k(`channel.${c.channel}`)} · {k(`outcome.${c.outcome}`)}
          </li>
        ))}
      </ul>
      {canRecord && (
        <form
          className="mt-2 grid gap-2"
          onSubmit={e => {
            e.preventDefault();
            save.mutate();
          }}
        >
          <label>
            {k('channelLabel')}{' '}
            <select className="input-base mt-1 h-9 w-auto" value={channel} onChange={e => setChannel(e.target.value)}>
              {CHANNELS.map(c => (
                <option key={c} value={c}>
                  {k(`channel.${c}`)}
                </option>
              ))}
            </select>
          </label>
          <label>
            {k('outcomeLabel')}{' '}
            <select className="input-base mt-1 h-9 w-auto" value={outcome} onChange={e => setOutcome(e.target.value)}>
              {OUTCOMES.map(o => (
                <option key={o} value={o}>
                  {k(`outcome.${o}`)}
                </option>
              ))}
            </select>
          </label>
          <label>
            {k('timeLabel')}{' '}
            <input className="input-base mt-1 h-9 w-auto" type="datetime-local" value={time} onChange={e => setTime(e.target.value)} />
          </label>
          <Button type="submit" disabled={save.isPending}>
            {k('record')}
          </Button>
          {save.isError && (
            <p role="alert">{getApiErrorMessage(save.error, k('recordError'))}</p>
          )}
          {save.isSuccess && <p role="status">{k('recorded')}</p>}
          <Button variant="outline" type="button" onClick={() => setDraft(true)}>
            {k('draftInvite')}
          </Button>
        </form>
      )}
      {draft && (
        <MessageDraftModal
          open
          context={{ kind: 'plan_invite', planId: plan.id }}
          onClose={() => setDraft(false)}
        />
      )}
    </details>
  );
}

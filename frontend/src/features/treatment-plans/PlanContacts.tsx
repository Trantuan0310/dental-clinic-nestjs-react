import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui';
import { api } from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import { getApiErrorMessage } from '@/lib/errors';
import { MessageDraftModal } from '../ai/MessageDraftModal';
import { planKeys, type PendingTreatment } from './treatmentPlansApi';

const channels: Record<string, string> = {
  PHONE: 'Điện thoại',
  SMS: 'SMS',
  ZALO: 'Zalo',
  EMAIL: 'Email',
  DESK: 'Tại quầy',
};
const outcomes: Record<string, string> = {
  REACHED: 'Đã liên hệ',
  CALL_BACK: 'Hẹn gọi lại',
  DECLINED: 'Từ chối đặt lịch',
  UNREACHABLE: 'Không liên lạc được',
};
export function PlanContacts({
  plan,
  canRecord,
}: {
  plan: PendingTreatment['plans'][number];
  canRecord: boolean;
}) {
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
        contactedAt: time ? new Date(time + ':00+07:00').toISOString() : new Date().toISOString(),
      }),
    onSuccess: () => {
      setTime('');
      return qc.invalidateQueries({ queryKey: planKeys.pending });
    },
  });
  return (
    <details className="mt-2 rounded border p-2">
      <summary className="cursor-pointer">
        Liên hệ · {plan.title} ({plan.contacts.length})
      </summary>
      <ul>
        {plan.contacts.map(c => (
          <li key={c.id}>
            {formatDateTime(c.contactedAt)} · {channels[c.channel]} · {outcomes[c.outcome]}
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
            Kênh liên hệ{' '}
            <select value={channel} onChange={e => setChannel(e.target.value)}>
              {Object.entries(channels).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </label>
          <label>
            Kết quả{' '}
            <select value={outcome} onChange={e => setOutcome(e.target.value)}>
              {Object.entries(outcomes).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </label>
          <label>
            Thời điểm (để trống nếu vừa liên hệ){' '}
            <input type="datetime-local" value={time} onChange={e => setTime(e.target.value)} />
          </label>
          <Button type="submit" disabled={save.isPending}>
            Ghi nhận liên hệ
          </Button>
          {save.isError && (
            <p role="alert">{getApiErrorMessage(save.error, 'Không ghi nhận được liên hệ')}</p>
          )}
          {save.isSuccess && <p role="status">Đã ghi nhận liên hệ</p>}
          <Button variant="outline" type="button" onClick={() => setDraft(true)}>
            Soạn tin mời
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

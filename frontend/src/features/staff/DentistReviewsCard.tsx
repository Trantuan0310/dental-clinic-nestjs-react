import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Star } from 'lucide-react';
import { api } from '@/lib/api';
import { getApiErrorMessage } from '@/lib/errors';
import { formatDateTime } from '@/lib/format';
import { Badge, Button, Card, Modal, Textarea } from '@/components/ui';
import { notify } from '@/components/ui/Toast';
import { cn } from '@/lib/cn';

type Review = {
  id: string;
  rating: number;
  comment: string | null;
  status: 'PUBLISHED' | 'HIDDEN';
  hiddenReason: string | null;
  createdAt: string;
  encounterId: string;
  patient: { id: string; code: string; fullName: string };
};
type Data = { summary?: { average: number | null; count: number }; reviews: Review[] };

function Stars({ value }: { value: number }) {
  return (
    <span className="inline-flex" aria-hidden>
      {[1, 2, 3, 4, 5].map((i) => (
        <Star key={i} className={cn('h-4 w-4', i <= value ? 'fill-amber-400 text-amber-400' : 'text-gray-300 dark:text-surface-600')} />
      ))}
    </span>
  );
}

/** Patients' reviews of the dentist (as on the booking page), with hide / show for staff who may edit. */
export function DentistReviewsCard({ dentistId, canModerate }: { dentistId: string; canModerate: boolean }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const key = ['dentist-reviews', dentistId];
  const { data, isLoading, isError } = useQuery({
    queryKey: key,
    queryFn: async () => (await api.get<{ data: Data }>(`/dentists/${dentistId}/reviews`)).data.data,
  });
  const [hiding, setHiding] = useState<Review | null>(null);
  const [reason, setReason] = useState('');
  const setStatus = useMutation({
    mutationFn: (v: { id: string; status: Review['status']; reason?: string }) =>
      api.patch(`/dentists/${dentistId}/reviews/${v.id}`, { status: v.status, reason: v.reason }),
    onSuccess: (_r, v) => {
      notify.success(v.status === 'HIDDEN' ? t('uiWorkforce.reviewHidden') : t('uiWorkforce.reviewShown'));
      setHiding(null);
      setReason('');
      void qc.invalidateQueries({ queryKey: key });
    },
    onError: (e) => notify.error(getApiErrorMessage(e, t('uiWorkforce.reviewUpdateError'))),
  });
  const summary = data?.summary;
  return (
    <Card
      title={t('uiWorkforce.patientReviews')}
      description={
        summary && summary.count > 0 && summary.average != null
          ? t('uiWorkforce.reviewSummary', { average: summary.average.toFixed(1), count: summary.count })
          : t('uiWorkforce.reviewSummaryNone')
      }
    >
      {isLoading ? (
        <p className="text-sm text-gray-500 dark:text-surface-400">{t('common.loading')}</p>
      ) : isError ? (
        <p role="alert" className="text-sm text-red-600">{t('uiWorkforce.reviewLoadError')}</p>
      ) : !data?.reviews.length ? (
        <p className="text-sm text-gray-500 dark:text-surface-400">{t('uiWorkforce.noReviews')}</p>
      ) : (
        <ul className="max-h-[28rem] divide-y divide-gray-100 overflow-y-auto text-sm dark:divide-surface-800">
          {data.reviews.map((r) => (
            <li key={r.id} className={cn('py-3', r.status === 'HIDDEN' && 'opacity-70')}>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <Stars value={r.rating} />
                <span className="sr-only">{t('uiWorkforce.reviewStarsSr', { count: r.rating })}</span>
                <span className="font-medium text-gray-900 dark:text-surface-100">{r.patient.fullName}</span>
                <span className="text-xs text-gray-500 dark:text-surface-400">{r.patient.code} · {formatDateTime(r.createdAt)}</span>
                {r.status === 'HIDDEN' && <Badge variant="warning">{t('uiWorkforce.reviewHiddenBadge')}</Badge>}
                {canModerate && (
                  <span className="ml-auto">
                    {r.status === 'PUBLISHED' ? (
                      <Button size="sm" variant="ghost" onClick={() => setHiding(r)}>
                        {t('uiWorkforce.reviewHide')}
                      </Button>
                    ) : (
                      <Button size="sm" variant="ghost" isLoading={setStatus.isPending} onClick={() => setStatus.mutate({ id: r.id, status: 'PUBLISHED' })}>
                        {t('uiWorkforce.reviewShow')}
                      </Button>
                    )}
                  </span>
                )}
              </div>
              {r.comment && <p className="mt-1 text-gray-700 dark:text-surface-200">{r.comment}</p>}
              {r.status === 'HIDDEN' && r.hiddenReason && (
                <p className="mt-1 text-xs text-gray-500 dark:text-surface-400">{t('uiWorkforce.reviewHiddenReason', { reason: r.hiddenReason })}</p>
              )}
            </li>
          ))}
        </ul>
      )}
      <Modal open={!!hiding} onClose={() => setHiding(null)} title={t('uiWorkforce.reviewHideTitle')}>
        <div className="space-y-3">
          <p className="text-sm text-gray-600 dark:text-surface-300">{t('uiWorkforce.reviewHideHint')}</p>
          <Textarea
            label={t('uiWorkforce.reviewHideReason')}
            required
            placeholder={t('uiWorkforce.reviewHideReasonPlaceholder')}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            maxLength={300}
            rows={3}
          />
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setHiding(null)}>
              {t('uiWorkforce.cancel')}
            </Button>
            <Button
              disabled={reason.trim().length < 5}
              isLoading={setStatus.isPending}
              onClick={() => hiding && setStatus.mutate({ id: hiding.id, status: 'HIDDEN', reason: reason.trim() })}
            >
              {t('uiWorkforce.reviewHide')}
            </Button>
          </div>
        </div>
      </Modal>
    </Card>
  );
}

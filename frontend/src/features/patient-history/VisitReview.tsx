import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Star } from 'lucide-react';
import { api } from '@/lib/api';
import { getApiErrorMessage } from '@/lib/errors';
import { cn } from '@/lib/cn';

type Given = { rating: number; comment: string | null };

/**
 * Under a closed visit on the patient's history page: rate the dentist (1–5
 * stars, optional comment) once, or see the rating already given. The review
 * shows on the online booking page; staff may hide it.
 */
export function VisitReview({
  token,
  reviewKey,
  dentistName,
  review,
  canReview,
}: {
  token: string;
  reviewKey: string;
  dentistName: string;
  review: Given | null;
  canReview: boolean;
}) {
  const { t } = useTranslation();
  const [given, setGiven] = useState<Given | null>(review);
  const [open, setOpen] = useState(false);
  const [rating, setRating] = useState(0);
  const [hover, setHover] = useState(0);
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  if (given)
    return (
      <div className="mt-2 rounded-md bg-amber-50 px-3 py-2 text-sm text-gray-700 dark:bg-amber-900/20 dark:text-surface-200">
        <span className="inline-flex items-center gap-1 font-medium">
          {t('uiPatientHistory.reviewYours')}
          <span className="inline-flex" aria-label={t('uiPatientHistory.reviewStars', { count: given.rating })}>
            {[1, 2, 3, 4, 5].map((i) => (
              <Star key={i} aria-hidden className={cn('h-4 w-4', i <= given.rating ? 'fill-amber-400 text-amber-400' : 'text-gray-300')} />
            ))}
          </span>
        </span>
        {given.comment && <p className="mt-0.5">“{given.comment}”</p>}
      </div>
    );
  if (!canReview) return null;
  if (!open)
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-2 inline-flex min-h-11 items-center gap-1.5 rounded-md border border-amber-300 px-3 text-sm font-medium text-amber-800 hover:bg-amber-50 dark:border-amber-700 dark:text-amber-300 dark:hover:bg-amber-900/20"
      >
        <Star className="h-4 w-4" aria-hidden /> {t('uiPatientHistory.reviewOpen', { name: dentistName })}
      </button>
    );

  const submit = async () => {
    if (!rating) {
      setError(t('uiPatientHistory.reviewPickStars'));
      return;
    }
    setBusy(true);
    setError('');
    try {
      const res = await api.post<{ data: Given }>(`/public/patient-history/${encodeURIComponent(token)}/reviews`, {
        reviewKey,
        rating,
        comment: comment.trim() || undefined,
      });
      setGiven(res.data.data);
    } catch (e) {
      setError(getApiErrorMessage(e, t('uiPatientHistory.reviewError')));
    } finally {
      setBusy(false);
    }
  };
  const shown = hover || rating;
  return (
    <div className="mt-2 space-y-2 rounded-md border border-gray-200 p-3 dark:border-surface-700">
      <p className="text-sm font-medium text-gray-900 dark:text-surface-100">{t('uiPatientHistory.reviewQuestion', { name: dentistName })}</p>
      <div role="radiogroup" aria-label={t('uiPatientHistory.reviewStarsLabel')} className="flex gap-1" onMouseLeave={() => setHover(0)}>
        {[1, 2, 3, 4, 5].map((i) => (
          <button
            key={i}
            type="button"
            role="radio"
            aria-checked={rating === i}
            aria-label={t('uiPatientHistory.reviewStars', { count: i })}
            onMouseEnter={() => setHover(i)}
            onClick={() => setRating(i)}
            className="rounded p-1"
          >
            <Star className={cn('h-7 w-7', i <= shown ? 'fill-amber-400 text-amber-400' : 'text-gray-300 dark:text-surface-600')} aria-hidden />
          </button>
        ))}
        {shown > 0 && <span className="self-center text-sm text-gray-600 dark:text-surface-300">{t(`uiPatientHistory.reviewLevel${shown}`)}</span>}
      </div>
      <label className="block text-sm text-gray-700 dark:text-surface-200">
        {t('uiPatientHistory.reviewComment')}
        <textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          maxLength={1000}
          rows={3}
          placeholder={t('uiPatientHistory.reviewCommentPlaceholder')}
          className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-surface-600"
        />
      </label>
      <p className="text-xs text-gray-500 dark:text-surface-400">{t('uiPatientHistory.reviewPublicNote')}</p>
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={submit}
          disabled={busy}
          className="min-h-11 rounded-md bg-brand-600 px-4 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60"
        >
          {t('uiPatientHistory.reviewSubmit')}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="min-h-11 rounded-md px-3 text-sm text-gray-600 hover:bg-gray-100 dark:text-surface-300 dark:hover:bg-surface-800">
          {t('uiPatientHistory.reviewCancel')}
        </button>
      </div>
    </div>
  );
}

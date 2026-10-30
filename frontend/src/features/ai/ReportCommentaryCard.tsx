import { useTranslation } from 'react-i18next';
import { useMutation } from '@tanstack/react-query';
import { Sparkles } from 'lucide-react';
import { Alert, Button, Card } from '@/components/ui';
import { formatDate, formatDateTime } from '@/lib/format';
import { getApiErrorMessage } from '@/lib/errors';
import { aiAssistApi } from './aiAssistApi';
import { AiDraftNotice } from './AiDraftNotice';

/**
 * The manager's reading of the selected period. Asked for on a click (a
 * model call per range change would cost for nothing); the server keeps
 * each range's answer for an hour, "Soạn lại" asks again.
 */
export function ReportCommentaryCard({ from, to }: { from: string; to: string }) {
  const { t } = useTranslation();
  const comment = useMutation({ mutationFn: (refresh: boolean) => aiAssistApi.reportCommentary(from, to, refresh) });
  const data = comment.data;

  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-base font-semibold text-gray-900 dark:text-surface-100">
            <Sparkles className="h-4 w-4 text-brand-600" aria-hidden />
            {t('uiAi.report.title')}
          </h2>
          <p className="mt-0.5 text-xs text-gray-500 dark:text-surface-400">
            {t('uiAi.report.subtitle', { from: formatDate(from), to: formatDate(to) })}
          </p>
        </div>
        <Button
          size="sm"
          variant={data ? 'outline' : 'primary'}
          isLoading={comment.isPending}
          onClick={() => comment.mutate(!!data)}
          leftIcon={<Sparkles className="h-4 w-4" />}
        >
          {data ? t('uiAi.regenerate') : t('uiAi.report.generate')}
        </Button>
      </div>

      <div className="mt-3 space-y-3">
        {comment.isError ? (
          <Alert type="danger">{getApiErrorMessage(comment.error, t('uiAi.error'))}</Alert>
        ) : data ? (
          <>
            <ul className="list-disc space-y-1.5 pl-5 text-sm text-gray-800 dark:text-surface-200" data-testid="report-commentary">
              {data.points.map((p, i) => (
                <li key={i}>{p}</li>
              ))}
            </ul>
            <AiDraftNotice source={data.source} />
            {data.cached && (
              <p className="text-xs text-gray-400">{t('uiAi.report.cached', { time: formatDateTime(data.generatedAt) })}</p>
            )}
          </>
        ) : (
          <p className="text-sm text-gray-500 dark:text-surface-400">{t('uiAi.report.empty')}</p>
        )}
        <p className="text-xs text-gray-400 dark:text-surface-500">{t('uiAi.report.basis')}</p>
      </div>
    </Card>
  );
}

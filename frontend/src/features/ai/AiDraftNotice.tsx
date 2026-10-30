import { useTranslation } from 'react-i18next';
import { Sparkles } from 'lucide-react';
import type { SummarySource } from '@/features/dashboard/aiSummaryApi';

/** Under every AI draft: a draft to check, or a template when no model answered. */
export function AiDraftNotice({ source }: { source: SummarySource }) {
  const { t } = useTranslation();
  return (
    <p className="flex items-start gap-1.5 text-xs text-gray-500 dark:text-surface-400">
      <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-brand-600" aria-hidden />
      {source === 'fallback' ? t('uiAi.fallback') : t('uiAi.disclaimer')}
    </p>
  );
}

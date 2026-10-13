import { Link } from 'react-router-dom';
import { ShieldAlert } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { useTranslation } from 'react-i18next';

export function ForbiddenPage() {
  const { t } = useTranslation();
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <div className="text-center">
        <ShieldAlert className="mx-auto mb-4 h-12 w-12 text-amber-500" />
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-surface-100">{t('uiEntry.errors.forbiddenTitle')}</h1>
        <p className="mt-2 text-sm text-gray-500 dark:text-surface-400">
          {t('uiEntry.errors.forbiddenBody')}
        </p>
        <div className="mt-6">
          <Link to="/">
            <Button variant="outline">{t('uiEntry.errors.home')}</Button>
          </Link>
        </div>
      </div>
    </div>
  );
}

export function NotFoundPage() {
  const { t } = useTranslation();
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <div className="text-center">
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-surface-100">{t('uiEntry.errors.notFoundTitle')}</h1>
        <p className="mt-2 text-sm text-gray-500 dark:text-surface-400">{t('uiEntry.errors.notFoundBody')}</p>
        <div className="mt-6">
          <Link to="/">
            <Button variant="outline">{t('uiEntry.errors.home')}</Button>
          </Link>
        </div>
      </div>
    </div>
  );
}

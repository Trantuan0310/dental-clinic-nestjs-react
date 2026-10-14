import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Hammer } from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';

interface PlaceholderPageProps {
  title: string;
  description?: string;
}

export function PlaceholderPage({ title, description }: PlaceholderPageProps) {
  const { t } = useTranslation();
  return (
    <div>
      <PageHeader title={title} description={description} />
      <Card>
        <div className="flex flex-col items-center gap-3 py-12 text-center text-gray-500 dark:text-surface-400">
          <Hammer className="h-10 w-10 text-gray-400 dark:text-surface-500" />
          <h3 className="text-base font-medium text-gray-900 dark:text-surface-100">{t('uiEntry.placeholder.development')}</h3>
          <p className="max-w-md text-sm text-gray-600 dark:text-surface-300">{t('uiEntry.placeholder.description')}</p>
          <Link to="/">
            <Button variant="outline">{t('uiEntry.placeholder.home')}</Button>
          </Link>
        </div>
      </Card>
    </div>
  );
}
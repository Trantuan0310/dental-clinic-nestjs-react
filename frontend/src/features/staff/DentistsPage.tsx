import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Badge, Card, EmptyState, Select } from '@/components/ui';
import { PageHeader } from '@/components/ui/PageHeader';
import { useAuthStore } from '@/stores/authStore';
import { useDentistProfiles } from './staffApi';
import { PRACTICE_STATUS_VARIANT } from './labels';
import type { PracticeStatus } from './types';

export default function DentistsPage() {
  const { t } = useTranslation();
  const [status, setStatus] = useState<PracticeStatus | undefined>('ACTIVE');
  const { data: dentists = [], isLoading, isError, refetch } = useDentistProfiles(status);
  const myId = useAuthStore((s) => s.user?.id);

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('uiWorkforce.dentists')}
        description={t('uiWorkforce.dentistListDescription')}
        actions={
          <Select
            aria-label={t('uiWorkforce.filterPracticeStatus')}
            value={status ?? ''}
            onChange={(e) => setStatus((e.target.value || undefined) as PracticeStatus | undefined)}
            options={[
              { value: '', label: t('uiWorkforce.allPracticeStatuses') },
              ...(['ACTIVE', 'SUSPENDED', 'INACTIVE'] as const).map((value) => ({ value, label: t(`uiWorkforce.practiceStatus_${value}`) })),
            ]}
          />
        }
      />

      {isLoading ? (
        <p className="text-sm text-gray-500 dark:text-surface-400">{t('common.loading')}</p>
      ) : isError ? (
        <p className="text-sm text-red-500">
          {t('uiWorkforce.dentistsLoadError')}{' '}
          <button type="button" className="underline" onClick={() => refetch()}>
            {t('uiWorkforce.retry')}
          </button>
        </p>
      ) : dentists.length === 0 ? (
        <EmptyState title={t('uiWorkforce.noDentists')} description={t('uiWorkforce.noDentistsDescription')} />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {dentists.map((d) => (
            <Link key={d.id} to={`/dentists/${d.userId}`} className="block">
              <Card className="h-full transition-shadow hover:shadow-md">
                <div className="flex items-start gap-3">
                  <span
                    className="mt-1 h-3 w-3 shrink-0 rounded-full"
                    style={{ backgroundColor: d.calendarColor }}
                    aria-hidden
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold text-gray-900 dark:text-surface-100">{d.fullName}</p>
                      {d.userId === myId && <Badge variant="info">{t('uiWorkforce.me')}</Badge>}
                    </div>
                    <p className="text-xs text-gray-500 dark:text-surface-400">
                      {d.employeeCode}
                      {d.licenseNumber ? ` · ${t('uiWorkforce.licenseShort')} ${d.licenseNumber}` : ''}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-1">
                      <Badge variant={PRACTICE_STATUS_VARIANT[d.practiceStatus]}>
                        {t(`uiWorkforce.practiceStatus_${d.practiceStatus}`)}
                      </Badge>
                      {d.specialties.map((s) => <Badge key={s}>{t(`uiWorkforce.specialty_${s}`, { defaultValue: s })}</Badge>)}
                    </div>
                  </div>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

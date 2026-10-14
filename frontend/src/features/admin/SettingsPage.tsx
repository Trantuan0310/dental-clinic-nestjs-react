import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Bell, Building2, Clock, Info } from 'lucide-react';
import { Alert, Card } from '@/components/ui';
import { clinic } from '@/config/clinic';

/**
 * Read-only view of the clinic details the app actually uses. They are not
 * stored in the database: the landing page, printed invoices/prescriptions and
 * the page title read CLINIC_* from .env.production at build time (see
 * src/config/clinic.ts), so this page shows them and says where to change
 * them instead of offering a form that would save nothing.
 */

function Row({ label, envKey, value, notConfigured }: { label: string; envKey: string; value: ReactNode; notConfigured: string }) {
  return (
    <div className="grid gap-1 border-b border-gray-100 py-2.5 last:border-0 sm:grid-cols-[12rem_1fr_auto] sm:items-center sm:gap-4 dark:border-surface-800">
      <dt className="text-sm font-medium text-gray-700 dark:text-surface-200">{label}</dt>
      <dd className="break-words text-sm text-gray-900 dark:text-surface-100">
        {value || <span className="text-gray-400 dark:text-surface-500">{notConfigured}</span>}
      </dd>
      <dd>
        <code className="rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-600 dark:bg-surface-800 dark:text-surface-300">
          {envKey}
        </code>
      </dd>
    </div>
  );
}

export default function SettingsPage() {
  const { t, i18n } = useTranslation();
  const locale = i18n.resolvedLanguage?.startsWith('en') ? 'en-US' : 'vi-VN';
  const weekday = (date: number) => new Intl.DateTimeFormat(locale, { weekday: 'long', timeZone: 'UTC' }).format(new Date(Date.UTC(2024, 0, date)));
  const notConfigured = t('uiWorkforce.notConfiguredHidden');
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-surface-100">{t('uiWorkforce.clinicInfo')}</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-surface-400">
          {t('uiWorkforce.clinicInfoDescription')}
        </p>
      </div>

      <Alert type="info">
        {t('uiWorkforce.clinicSettingsReadOnly')}
      </Alert>

      <Card
        title={
          <span className="flex items-center gap-2">
            <Building2 className="h-4 w-4" aria-hidden /> {t('uiWorkforce.contactInfo')}
          </span>
        }
      >
        <dl>
          <Row label={t('uiWorkforce.clinicName')} envKey="CLINIC_NAME" value={clinic.name} notConfigured={notConfigured} />
          <Row label={t('uiWorkforce.tagline')} envKey="CLINIC_TAGLINE" value={clinic.taglineIsDefault ? t('uiEntry.landing.defaultTagline') : clinic.tagline} notConfigured={notConfigured} />
          <Row label={t('uiWorkforce.address')} envKey="CLINIC_ADDRESS" value={clinic.address} notConfigured={notConfigured} />
          <Row label={t('uiWorkforce.hotline')} envKey="CLINIC_PHONE" value={clinic.phone} notConfigured={notConfigured} />
          <Row label={t('uiWorkforce.clinicZalo')} envKey="CLINIC_ZALO" value={clinic.zaloHref} notConfigured={notConfigured} />
          <Row label={t('uiWorkforce.contactEmail')} envKey="CLINIC_EMAIL" value={clinic.email} notConfigured={notConfigured} />
          <Row label={t('uiWorkforce.map')} envKey="CLINIC_MAP_URL" value={clinic.mapUrl} notConfigured={notConfigured} />
          <Row label={t('uiWorkforce.clinicFacebook')} envKey="CLINIC_FACEBOOK_URL" value={clinic.facebookUrl} notConfigured={notConfigured} />
        </dl>
      </Card>

      <Card
        title={
          <span className="flex items-center gap-2">
            <Clock className="h-4 w-4" aria-hidden /> {t('uiWorkforce.displayedBusinessHours')}
          </span>
        }
      >
        <dl>
          <Row label={`${weekday(1)} – ${weekday(6)}`} envKey="CLINIC_HOURS" value={clinic.hours[0].time} notConfigured={notConfigured} />
          <Row label={weekday(7)} envKey="CLINIC_SUNDAY_HOURS" value={clinic.sundayHoursIsDefault ? t('uiEntry.landing.sundayClosed') : clinic.hours[1].time} notConfigured={notConfigured} />
        </dl>
        <p className="mt-3 flex gap-2 text-sm text-gray-500 dark:text-surface-400">
          <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          {t('uiWorkforce.displayedBusinessHoursNote')}
        </p>
      </Card>

      <Card
        title={
          <span className="flex items-center gap-2">
            <Bell className="h-4 w-4" aria-hidden /> {t('uiWorkforce.notificationEmail')}
          </span>
        }
      >
        <p className="text-sm text-gray-700 dark:text-surface-200">
          {t('uiWorkforce.notificationEmailDescription')}
        </p>
      </Card>
    </div>
  );
}

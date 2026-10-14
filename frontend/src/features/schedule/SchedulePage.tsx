import { useState } from 'react';
import { PageHeader } from '@/components/ui/PageHeader';
import { Tabs } from '@/components/ui';
import { WorkingScheduleTab } from './WorkingScheduleTab';
import { TimeOffTab } from './TimeOffTab';
import { OverridesTab } from './OverridesTab';
import { ImpactTab } from './ImpactTab';
import { ClinicClosuresTab } from './ClinicClosuresTab';
import { useScheduleImpact, useTimeOffs } from './scheduleApi';
import { useTranslation } from 'react-i18next';

type Tab = 'schedule' | 'time-off' | 'overrides' | 'closures' | 'impact';

export default function SchedulePage() {
  const { t } = useTranslation();
  const [tab, setTab] = useState<Tab>('schedule');
  const { data: pending = [] } = useTimeOffs(undefined, 'PENDING');
  const { data: impact = [] } = useScheduleImpact();

  return (
    <div className="space-y-4">
      <PageHeader
        title={t('uiScheduling.scheduleTitle')}
        description={t('uiScheduling.scheduleDescription')}
      />

      <Tabs
        aria-label={t('uiScheduling.scheduleTitle')}
        tabs={[
          { id: 'schedule', label: t('uiScheduling.workingSchedule') },
          { id: 'time-off', label: pending.length ? t('uiScheduling.timeOffPending', { count: pending.length }) : t('uiScheduling.timeOff') },
          { id: 'overrides', label: t('uiScheduling.scheduleOverrides') },
          { id: 'closures', label: t('uiScheduling.clinicClosures') },
          { id: 'impact', label: impact.length ? t('uiScheduling.scheduleImpactCount', { count: impact.length }) : t('uiScheduling.scheduleImpact') },
        ]}
        value={tab}
        onChange={(v) => setTab(v as Tab)}
      />

      {tab === 'schedule' && <WorkingScheduleTab />}
      {tab === 'time-off' && <TimeOffTab />}
      {tab === 'overrides' && <OverridesTab />}
      {tab === 'closures' && <ClinicClosuresTab />}
      {tab === 'impact' && <ImpactTab />}
    </div>
  );
}

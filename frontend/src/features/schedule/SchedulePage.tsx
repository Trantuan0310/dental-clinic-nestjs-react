import { useState } from 'react';
import { PageHeader } from '@/components/ui/PageHeader';
import { Tabs } from '@/components/ui';
import { WorkingScheduleTab } from './WorkingScheduleTab';
import { TimeOffTab } from './TimeOffTab';
import { OverridesTab } from './OverridesTab';
import { ImpactTab } from './ImpactTab';
import { useScheduleImpact, useTimeOffs } from './scheduleApi';

type Tab = 'schedule' | 'time-off' | 'overrides' | 'impact';

export default function SchedulePage() {
  const [tab, setTab] = useState<Tab>('schedule');
  const { data: pending = [] } = useTimeOffs(undefined, 'PENDING');
  const { data: impact = [] } = useScheduleImpact();

  return (
    <div className="space-y-4">
      <PageHeader
        title="Lịch làm việc & Nghỉ phép"
        description="Lịch làm việc cố định, nghỉ phép, ngoại lệ theo ngày và các lịch hẹn cần điều phối lại"
      />

      <Tabs
        aria-label="Lịch làm việc & Nghỉ phép"
        tabs={[
          { id: 'schedule', label: 'Lịch làm việc cố định' },
          { id: 'time-off', label: pending.length ? `Nghỉ phép (${pending.length} chờ duyệt)` : 'Nghỉ phép' },
          { id: 'overrides', label: 'Ngoại lệ theo ngày' },
          { id: 'impact', label: impact.length ? `Lịch hẹn bị ảnh hưởng (${impact.length})` : 'Lịch hẹn bị ảnh hưởng' },
        ]}
        value={tab}
        onChange={(v) => setTab(v as Tab)}
      />

      {tab === 'schedule' && <WorkingScheduleTab />}
      {tab === 'time-off' && <TimeOffTab />}
      {tab === 'overrides' && <OverridesTab />}
      {tab === 'impact' && <ImpactTab />}
    </div>
  );
}

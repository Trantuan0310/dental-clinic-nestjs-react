import { useState } from 'react';
import { PageHeader } from '@/components/ui/PageHeader';
import { Tabs } from '@/components/ui';
import { WorkingScheduleTab } from './WorkingScheduleTab';
import { TimeOffTab } from './TimeOffTab';

export default function SchedulePage() {
  const [tab, setTab] = useState<'schedule' | 'time-off'>('schedule');

  return (
    <div className="space-y-4">
      <PageHeader
        title="Lịch làm việc & Nghỉ phép"
        description="Quản lý lịch làm việc cố định hàng tuần và nghỉ phép của bác sĩ"
      />

      <Tabs
        aria-label="Lịch làm việc & Nghỉ phép"
        tabs={[
          { id: 'schedule', label: 'Lịch làm việc cố định' },
          { id: 'time-off', label: 'Nghỉ phép' },
        ]}
        value={tab}
        onChange={(v) => setTab(v as typeof tab)}
      />

      {tab === 'schedule' ? <WorkingScheduleTab /> : <TimeOffTab />}
    </div>
  );
}

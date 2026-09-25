import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Badge, Card, EmptyState, Select } from '@/components/ui';
import { PageHeader } from '@/components/ui/PageHeader';
import { useAuthStore } from '@/stores/authStore';
import { useDentistProfiles } from './staffApi';
import { PRACTICE_STATUS_LABEL, PRACTICE_STATUS_VARIANT, SPECIALTY_LABEL } from './labels';
import type { PracticeStatus } from './types';

export default function DentistsPage() {
  const [status, setStatus] = useState<PracticeStatus | undefined>('ACTIVE');
  const { data: dentists = [], isLoading, isError, refetch } = useDentistProfiles(status);
  const myId = useAuthStore((s) => s.user?.id);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Bác sĩ"
        description="Hồ sơ hành nghề, chuyên môn và màu lịch của từng bác sĩ"
        actions={
          <Select
            aria-label="Lọc theo trạng thái hành nghề"
            value={status ?? ''}
            onChange={(e) => setStatus((e.target.value || undefined) as PracticeStatus | undefined)}
            options={[
              { value: '', label: 'Tất cả' },
              ...Object.entries(PRACTICE_STATUS_LABEL).map(([value, label]) => ({ value, label })),
            ]}
          />
        }
      />

      {isLoading ? (
        <p className="text-sm text-gray-400">Đang tải…</p>
      ) : isError ? (
        <p className="text-sm text-red-500">
          Không tải được danh sách bác sĩ.{' '}
          <button type="button" className="underline" onClick={() => refetch()}>
            Thử lại
          </button>
        </p>
      ) : dentists.length === 0 ? (
        <EmptyState title="Không có bác sĩ" description="Tạo hồ sơ bác sĩ từ trang Nhân sự." />
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
                      {d.userId === myId && <Badge variant="info">Tôi</Badge>}
                    </div>
                    <p className="text-xs text-gray-500">
                      {d.employeeCode}
                      {d.licenseNumber ? ` · CCHN ${d.licenseNumber}` : ''}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-1">
                      <Badge variant={PRACTICE_STATUS_VARIANT[d.practiceStatus]}>
                        {PRACTICE_STATUS_LABEL[d.practiceStatus]}
                      </Badge>
                      {d.specialties.map((s) => (
                        <Badge key={s}>{SPECIALTY_LABEL[s] ?? s}</Badge>
                      ))}
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

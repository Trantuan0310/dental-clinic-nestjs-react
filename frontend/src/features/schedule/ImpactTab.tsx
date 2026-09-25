import { useState } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2 } from 'lucide-react';
import { Badge, Card, EmptyState, Select } from '@/components/ui';
import { PageLoader } from '@/components/ui/Loading';
import { useDentistOptions } from '@/features/appointments/appointmentApi';
import { useScheduleImpact } from './scheduleApi';
import { formatDateTime } from './format';
import type { ImpactedAppointment } from '@/types/schedule';

const REASON_LABEL: Record<ImpactedAppointment['reason'], string> = {
  TIME_OFF: 'Bác sĩ nghỉ phép',
  CLOSED: 'Lịch đã đóng',
  OUTSIDE_WORKING_HOURS: 'Ngoài giờ làm',
};

/**
 * BR-SCH-005: upcoming bookings (next 60 days) that the current calendar no
 * longer allows — the front desk's list of patients to call.
 */
export function ImpactTab() {
  const [dentistFilter, setDentistFilter] = useState('');
  const { data: dentists = [] } = useDentistOptions();
  const { data: rows = [], isLoading } = useScheduleImpact(dentistFilter || undefined);

  return (
    <div className="space-y-4">
      <Select
        aria-label="Lọc theo bác sĩ"
        value={dentistFilter}
        onChange={(e) => setDentistFilter(e.target.value)}
        options={[
          { value: '', label: 'Tất cả bác sĩ' },
          ...dentists.map((d) => ({ value: d.id, label: d.fullName })),
        ]}
      />
      {isLoading ? (
        <PageLoader />
      ) : rows.length === 0 ? (
        <Card>
          <EmptyState
            icon={<CheckCircle2 className="h-10 w-10 text-green-500" />}
            title="Không có lịch hẹn bị ảnh hưởng"
            description="Mọi lịch hẹn sắp tới (60 ngày) đều nằm trong giờ làm của bác sĩ."
          />
        </Card>
      ) : (
        <Card noPadding>
          <div className="overflow-x-auto">
            <table className="table-base">
              <thead>
                <tr>
                  <th>Giờ hẹn</th>
                  <th>Bệnh nhân</th>
                  <th>Bác sĩ</th>
                  <th>Lý do</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td className="whitespace-nowrap">{formatDateTime(r.startAt)}</td>
                    <td>
                      <Link to={`/appointments/list?open=${r.id}`} className="font-medium hover:underline">
                        {r.patient.fullName}
                      </Link>
                      <p className="text-xs text-gray-500">
                        {r.patient.code}
                        {r.patient.primaryPhone ? ` · ${r.patient.primaryPhone}` : ''}
                      </p>
                    </td>
                    <td>{r.dentistName}</td>
                    <td>
                      <Badge variant="warning">{REASON_LABEL[r.reason]}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}

import { Link } from 'react-router-dom';
import { Alert, Button, Modal } from '@/components/ui';
import type { TimeOffAffectedAppointment } from '@/types/schedule';
import { formatDateTime } from './format';

/**
 * Bookings still SCHEDULED/CONFIRMED that a calendar change no longer allows
 * (approved time-off, closed day, changed hours). The system never moves
 * them itself — front desk calls the patient and reschedules or cancels.
 */
export function AffectedAppointmentsModal({
  open,
  title = 'Lịch hẹn cần xử lý',
  appointments,
  onClose,
}: {
  open: boolean;
  title?: string;
  appointments: TimeOffAffectedAppointment[];
  onClose: () => void;
}) {
  return (
    <Modal open={open} onClose={onClose} title={title} size="sm">
      <div className="space-y-4">
        <Alert variant="warning">
          Còn {appointments.length} lịch hẹn bị ảnh hưởng. Vui lòng liên hệ bệnh nhân để đổi lịch
          hoặc hủy — hệ thống không tự dời các lịch này.
        </Alert>
        <ul className="divide-y divide-gray-100 rounded-md border border-gray-200 dark:divide-surface-800 dark:border-surface-700">
          {appointments.map((a) => (
            <li key={a.id} className="px-3 py-2 text-sm">
              <Link to={`/appointments/list?open=${a.id}`} className="font-medium text-gray-900 hover:underline dark:text-surface-100">
                {a.patient.fullName} <span className="text-gray-500">— {a.patient.code}</span>
              </Link>
              <p className="text-gray-600 dark:text-surface-300">
                {formatDateTime(a.startAt)}
                {a.patient.primaryPhone ? ` • ${a.patient.primaryPhone}` : ''}
              </p>
            </li>
          ))}
        </ul>
        <div className="flex justify-end border-t border-gray-100 pt-4 dark:border-surface-800">
          <Button onClick={onClose}>Đã hiểu</Button>
        </div>
      </div>
    </Modal>
  );
}

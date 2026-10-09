import { Link } from 'react-router-dom';
import { Alert, Button, Modal } from '@/components/ui';
import type { AffectedBookingRequest, TimeOffAffectedAppointment } from '@/types/schedule';
import { formatDateTime } from './format';

/**
 * Bookings still SCHEDULED/CONFIRMED that a calendar change no longer allows
 * (approved time-off, closed day, changed or removed hours, clinic closure),
 * plus open online booking requests at such times. The system never moves
 * them itself — front desk calls the patient and reschedules or cancels.
 */
export function AffectedAppointmentsModal({
  open,
  title = 'Lịch hẹn cần xử lý',
  appointments,
  bookingRequests = [],
  waitingPatients = [],
  onClose,
}: {
  open: boolean;
  title?: string;
  appointments: TimeOffAffectedAppointment[];
  bookingRequests?: AffectedBookingRequest[];
  /** Patients already checked in with the absent dentist: move them in Điều phối. */
  waitingPatients?: TimeOffAffectedAppointment[];
  onClose: () => void;
}) {
  return (
    <Modal open={open} onClose={onClose} title={title} size="sm">
      <div className="space-y-4">
        <Alert variant="warning">
          {appointments.length > 0 && <>Còn {appointments.length} lịch hẹn bị ảnh hưởng. </>}
          {bookingRequests.length > 0 && <>Có {bookingRequests.length} yêu cầu đặt lịch online đang chờ rơi vào giờ không còn làm việc. </>}
          Vui lòng liên hệ bệnh nhân để đổi lịch hoặc hủy — hệ thống không tự dời các lịch này. Danh sách luôn có ở thẻ
          "Lịch hẹn bị ảnh hưởng": tại đó chuyển bác sĩ thay, dời hàng loạt và đánh dấu đã gọi báo bệnh nhân.
        </Alert>
        {waitingPatients.length > 0 && (
          <Alert variant="danger">
            {waitingPatients.length} bệnh nhân đã check-in đang chờ bác sĩ này (
            {waitingPatients.map((w) => w.patient.fullName).join(', ')}) — hãy chuyển sang bác sĩ khác ở trang Điều phối.
          </Alert>
        )}
        {appointments.length > 0 && (
          <ul className="divide-y divide-gray-100 rounded-md border border-gray-200 dark:divide-surface-800 dark:border-surface-700">
            {appointments.map((a) => (
              <li key={a.id} className="px-3 py-2 text-sm">
                <Link to={`/appointments/list?open=${a.id}`} className="font-medium text-gray-900 hover:underline dark:text-surface-100">
                  {a.patient.fullName} <span className="text-gray-500">— {a.patient.code}</span>
                </Link>
                <p className="text-gray-600 dark:text-surface-300">
                  {formatDateTime(a.startAt)}
                  {a.dentistName ? ` • ${a.dentistName}` : ''}
                  {a.patient.primaryPhone ? ` • ${a.patient.primaryPhone}` : ''}
                </p>
              </li>
            ))}
          </ul>
        )}
        {bookingRequests.length > 0 && (
          <div className="space-y-1">
            <p className="text-sm font-medium text-gray-700 dark:text-surface-200">Yêu cầu đặt lịch online đang chờ</p>
            <ul className="divide-y divide-gray-100 rounded-md border border-gray-200 dark:divide-surface-800 dark:border-surface-700">
              {bookingRequests.map((r) => (
                <li key={r.id} className="px-3 py-2 text-sm">
                  <Link to="/booking-requests" className="font-medium text-gray-900 hover:underline dark:text-surface-100">
                    {r.fullName} <span className="text-gray-500">— {r.referenceCode}</span>
                  </Link>
                  <p className="text-gray-600 dark:text-surface-300">
                    {formatDateTime(r.startAt)} • {r.phone}
                  </p>
                  {r.slotIssue && <p className="text-xs text-amber-700">{r.slotIssue.message}</p>}
                </li>
              ))}
            </ul>
          </div>
        )}
        <div className="flex justify-end border-t border-gray-100 pt-4 dark:border-surface-800">
          <Button onClick={onClose}>Đã hiểu</Button>
        </div>
      </div>
    </Modal>
  );
}

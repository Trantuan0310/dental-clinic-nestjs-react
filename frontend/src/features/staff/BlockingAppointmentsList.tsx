import { Link } from 'react-router-dom';
import { Alert } from '@/components/ui';
import { formatDateTime } from '@/lib/format';
import type { BlockingAppointment } from './types';

/** BR-STAFF-004: the bookings to reassign before a dentist can stop working. */
export function BlockingAppointmentsList({ appointments }: { appointments: BlockingAppointment[] }) {
  return (
    <Alert type="warning" title={`Còn ${appointments.length} lịch hẹn sắp tới cần điều phối lại`}>
      <ul className="mt-2 max-h-48 space-y-1 overflow-y-auto text-sm">
        {appointments.map((a) => (
          <li key={a.id}>
            <Link to={`/appointments/list?open=${a.id}`} className="underline hover:no-underline">
              {formatDateTime(a.startAt)} — {a.patientName}
            </Link>
          </li>
        ))}
      </ul>
    </Alert>
  );
}

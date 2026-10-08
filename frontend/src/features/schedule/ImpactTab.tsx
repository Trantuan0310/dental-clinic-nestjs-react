import { useState } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2, PhoneCall } from 'lucide-react';
import { Alert, Badge, Button, Card, EmptyState, Input, Modal, Select, Textarea } from '@/components/ui';
import { PageLoader } from '@/components/ui/Loading';
import { notify } from '@/components/ui/Toast';
import { getApiErrorMessage } from '@/lib/errors';
import { clinicIso, clinicParts, clinicToday } from '@/lib/clinicTime';
import { useDentistOptions } from '@/features/appointments/appointmentApi';
import { useAuthStore } from '@/stores/authStore';
import {
  useBookingRequestIssues,
  useBulkReschedule,
  useClinicContact,
  useScheduleImpact,
} from './scheduleApi';
import { formatDateTime } from './format';
import type { BulkRescheduleResult, ImpactedAppointment } from '@/types/schedule';

const REASON_LABEL: Record<ImpactedAppointment['reason'], string> = {
  TIME_OFF: 'Bác sĩ nghỉ phép',
  CLOSED: 'Lịch đã đóng / phòng khám nghỉ',
  OUTSIDE_WORKING_HOURS: 'Ngoài giờ làm',
  DENTIST_UNAVAILABLE: 'Bác sĩ tạm ngưng / nghỉ',
};

type BulkAction = { kind: 'dentist' } | { kind: 'date' };

/**
 * BR-SCH-005: upcoming bookings (next 60 days) that the current calendar no
 * longer allows — the front desk's list of patients to call. A1-13: rows can
 * be moved (to a substitute dentist, or to another day at the same time) as
 * clinic moves, and marked once the patient has been told.
 */
export function ImpactTab() {
  const [dentistFilter, setDentistFilter] = useState('');
  // Suspended / on-leave dentists are the ones whose visits need moving (A1-16).
  const { data: dentists = [] } = useDentistOptions('schedule');
  const { data: bookable = [] } = useDentistOptions();
  const { data: rows = [], isLoading } = useScheduleImpact(dentistFilter || undefined);
  const hasPermission = useAuthStore((s) => s.hasPermission);
  const canReadRequests = hasPermission('booking_request.read');
  const canAct = hasPermission('appointment.update') && hasPermission('appointment.read.any');
  const { data: requests = [] } = useBookingRequestIssues(dentistFilter || undefined, canReadRequests);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulk, setBulk] = useState<BulkAction | null>(null);
  const [contacting, setContacting] = useState<ImpactedAppointment | null>(null);
  const [lastResult, setLastResult] = useState<BulkRescheduleResult | null>(null);

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const chosen = rows.filter((r) => selected.has(r.id));
  const patientOf = (id: string) => rows.find((r) => r.id === id)?.patient.fullName ?? id;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Select
          aria-label="Lọc theo bác sĩ"
          value={dentistFilter}
          onChange={(e) => setDentistFilter(e.target.value)}
          options={[
            { value: '', label: 'Tất cả bác sĩ' },
            ...dentists.map((d) => ({ value: d.id, label: d.fullName })),
          ]}
        />
        {canAct && rows.length > 0 && (
          <>
            <Button size="sm" variant="outline" disabled={chosen.length === 0} onClick={() => setBulk({ kind: 'dentist' })}>
              Chuyển bác sĩ thay ({chosen.length})
            </Button>
            <Button size="sm" variant="outline" disabled={chosen.length === 0} onClick={() => setBulk({ kind: 'date' })}>
              Dời sang ngày khác ({chosen.length})
            </Button>
          </>
        )}
      </div>
      {lastResult && lastResult.failed.length > 0 && (
        <Alert variant="warning" onClose={() => setLastResult(null)}>
          Đã chuyển {lastResult.moved.length} lịch. Không chuyển được {lastResult.failed.length}:{' '}
          {lastResult.failed.map((f) => `${patientOf(f.appointmentId)} (${f.reason})`).join('; ')}
        </Alert>
      )}
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
                  {canAct && (
                    <th>
                      <input
                        type="checkbox"
                        aria-label="Chọn tất cả"
                        checked={chosen.length === rows.length}
                        onChange={(e) => setSelected(e.target.checked ? new Set(rows.map((r) => r.id)) : new Set())}
                      />
                    </th>
                  )}
                  <th>Giờ hẹn</th>
                  <th>Bệnh nhân</th>
                  <th>Bác sĩ</th>
                  <th>Lý do</th>
                  <th>Đã báo bệnh nhân</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    {canAct && (
                      <td>
                        <input
                          type="checkbox"
                          aria-label={`Chọn ${r.patient.fullName}`}
                          checked={selected.has(r.id)}
                          onChange={() => toggle(r.id)}
                        />
                      </td>
                    )}
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
                      <p className="mt-1 text-xs text-gray-500">{r.message}</p>
                    </td>
                    <td className="whitespace-nowrap">
                      {r.clinicContactedAt ? (
                        <div className="text-xs">
                          <Badge variant="success">Đã gọi {formatDateTime(r.clinicContactedAt)}</Badge>
                          {r.clinicContactNote && <p className="mt-1 text-gray-500">{r.clinicContactNote}</p>}
                        </div>
                      ) : (
                        r.clinicContactNote && <p className="text-xs text-amber-700">{r.clinicContactNote}</p>
                      )}
                      {canAct && (
                        <Button size="sm" variant="ghost" onClick={() => setContacting(r)}>
                          <PhoneCall className="h-4 w-4" />
                          {r.clinicContactedAt ? 'Sửa' : 'Ghi nhận'}
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
      <BulkMoveModal
        action={bulk}
        rows={chosen}
        dentists={bookable}
        onClose={() => setBulk(null)}
        onDone={(result) => {
          setBulk(null);
          setSelected(new Set());
          setLastResult(result);
        }}
      />
      <ContactModal row={contacting} onClose={() => setContacting(null)} />
      {requests.length > 0 && (
        <Card title="Yêu cầu đặt lịch online không còn xác nhận được" noPadding>
          <div className="overflow-x-auto">
            <table className="table-base">
              <thead>
                <tr>
                  <th>Giờ yêu cầu</th>
                  <th>Người đặt</th>
                  <th>Bác sĩ</th>
                  <th>Lý do</th>
                </tr>
              </thead>
              <tbody>
                {requests.map((r) => {
                  const proposal = ['PROPOSED', 'PATIENT_ACCEPTED'].includes(r.status);
                  return (
                    <tr key={r.id}>
                      <td className="whitespace-nowrap">
                        {formatDateTime(proposal && r.proposedStartAt ? r.proposedStartAt : r.requestedStartAt)}
                      </td>
                      <td>
                        <Link to="/booking-requests" className="font-medium hover:underline">
                          {r.fullName}
                        </Link>
                        <p className="text-xs text-gray-500">
                          {r.referenceCode} · {r.phone}
                        </p>
                      </td>
                      <td>{(proposal && r.proposedDentist?.fullName) || r.preferredDentist.fullName}</td>
                      <td className="text-xs text-gray-600">{r.slotIssue?.message}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}

/**
 * Moves the chosen visits as clinic moves (not counted in the patient's
 * limit): to a substitute dentist at the same time, or to another day at the
 * same clinic time. Each visit is checked on its own; failures are listed.
 */
function BulkMoveModal({
  action,
  rows,
  dentists,
  onClose,
  onDone,
}: {
  action: BulkAction | null;
  rows: ImpactedAppointment[];
  dentists: Array<{ id: string; fullName: string }>;
  onClose: () => void;
  onDone: (r: BulkRescheduleResult) => void;
}) {
  const move = useBulkReschedule();
  const [dentistId, setDentistId] = useState('');
  const [date, setDate] = useState('');
  const [reason, setReason] = useState('');
  const close = () => {
    setDentistId('');
    setDate('');
    setReason('');
    onClose();
  };
  const ready = reason.trim().length >= 5 && (action?.kind === 'dentist' ? Boolean(dentistId) : Boolean(date));
  return (
    <Modal
      open={action !== null}
      onClose={close}
      title={action?.kind === 'dentist' ? 'Chuyển sang bác sĩ thay' : 'Dời sang ngày khác (giữ giờ)'}
      size="sm"
    >
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (!action) return;
          move.mutate(
            {
              reason: reason.trim(),
              items: rows.map((r) =>
                action.kind === 'dentist'
                  ? { appointmentId: r.id, newDentistId: dentistId }
                  : { appointmentId: r.id, newStartsAt: clinicIso(date, clinicParts(r.startAt).time) },
              ),
            },
            {
              onSuccess: (result) => {
                notify.success(`Đã chuyển ${result.moved.length}/${rows.length} lịch — bệnh nhân được báo qua email`);
                close();
                onDone(result);
              },
              onError: (err) => notify.error(getApiErrorMessage(err, 'Không chuyển được')),
            },
          );
        }}
      >
        <p className="text-sm text-gray-600 dark:text-surface-300">
          {rows.length} lịch được chọn. Đây là "phòng khám dời": không tính vào giới hạn 3 lần đổi lịch của bệnh nhân.
        </p>
        {action?.kind === 'dentist' ? (
          <Select
            label="Bác sĩ thay"
            value={dentistId}
            onChange={(e) => setDentistId(e.target.value)}
            placeholder="-- Chọn bác sĩ --"
            options={dentists.map((d) => ({ value: d.id, label: d.fullName }))}
            required
          />
        ) : (
          <Input label="Ngày mới" type="date" min={clinicToday()} value={date} onChange={(e) => setDate(e.target.value)} required />
        )}
        <Textarea label="Lý do" required minLength={5} rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="VD: Bác sĩ nghỉ ốm" />
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={close}>
            Đóng
          </Button>
          <Button type="submit" isLoading={move.isPending} disabled={!ready}>
            Chuyển
          </Button>
        </div>
      </form>
    </Modal>
  );
}

/** Mark that the patient was told (or note why not yet). */
function ContactModal({ row, onClose }: { row: ImpactedAppointment | null; onClose: () => void }) {
  const contact = useClinicContact();
  const [note, setNote] = useState('');
  const save = (contacted: boolean) => {
    if (!row) return;
    contact.mutate(
      { id: row.id, contacted, note: note.trim() || undefined },
      {
        onSuccess: () => {
          notify.success(contacted ? 'Đã ghi nhận đã gọi báo bệnh nhân' : 'Đã lưu ghi chú');
          setNote('');
          onClose();
        },
        onError: (err) => notify.error(getApiErrorMessage(err, 'Không lưu được')),
      },
    );
  };
  return (
    <Modal open={row !== null} onClose={onClose} title="Liên hệ bệnh nhân" size="sm">
      {row && (
        <div className="space-y-4 text-sm">
          <p>
            {row.patient.fullName}
            {row.patient.primaryPhone ? ` · ${row.patient.primaryPhone}` : ''} — hẹn {formatDateTime(row.startAt)}
          </p>
          <Textarea
            label="Ghi chú"
            rows={2}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={row.clinicContactNote ?? 'VD: Khách đồng ý dời sang thứ Sáu / chưa nghe máy'}
          />
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="outline" onClick={() => save(false)} isLoading={contact.isPending}>
              Chưa liên lạc được
            </Button>
            <Button onClick={() => save(true)} isLoading={contact.isPending}>
              Đã gọi báo
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}

import { useEffect, useMemo, useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Button } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Alert';
import { Tabs } from '@/components/ui/Tabs';
import { Spinner } from '@/components/ui/Loading';
import {
  useAvailability,
  useCreateAppointment,
  useDentistOptions,
  usePatientOptions,
  useUpdateAppointment,
} from './appointmentApi';
import type { Appointment, AppointmentType, CreateAppointmentPayload } from '@/types/appointment';
import { getApiErrorMessage } from '@/lib/errors';
import { notify } from '@/components/ui/Toast';
import { Search } from 'lucide-react';

interface AppointmentFormModalProps {
  open: boolean;
  onClose: () => void;
  appointment?: Appointment | null;
  defaultDate?: string;
  defaultDentistId?: string;
  defaultPatientId?: string;
  defaultStartTime?: string;
}

const APPOINTMENT_TYPE_OPTIONS: { value: AppointmentType; label: string }[] = [
  { value: 'consultation', label: 'Khám / Tư vấn' },
  { value: 'treatment', label: 'Điều trị' },
  { value: 'follow_up', label: 'Tái khám' },
];

const DURATION_OPTIONS = [
  { value: '15', label: '15 phút' },
  { value: '30', label: '30 phút' },
  { value: '45', label: '45 phút' },
  { value: '60', label: '60 phút' },
  { value: '90', label: '90 phút' },
  { value: '120', label: '120 phút' },
];

function isoDateOnly(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function isoFullLocal(date: string, time: string): string {
  // Combine YYYY-MM-DD + HH:mm into a local-tz ISO string (not UTC).
  const [y, mo, d] = date.split('-').map(Number);
  const [h, mi] = time.split(':').map(Number);
  const dt = new Date(y, (mo ?? 1) - 1, d ?? 1, h ?? 0, mi ?? 0, 0, 0);
  return dt.toISOString();
}

// Extract local YYYY-MM-DD and HH:mm from an ISO timestamp.
// Slicing the ISO string directly would use UTC, which is wrong for display.
function localDateTimeParts(iso: string): { date: string; time: string } {
  const d = new Date(iso);
  return { date: isoDateOnly(d), time: `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}` };
}

export function AppointmentFormModal({
  open,
  onClose,
  appointment,
  defaultDate,
  defaultDentistId,
  defaultPatientId,
  defaultStartTime,
}: AppointmentFormModalProps) {
  const isEdit = !!appointment;

  const today = useMemo(() => new Date(), []);
  const initialParts = appointment ? localDateTimeParts(appointment.startsAt) : null;
  const initialDate = appointment ? initialParts!.date : (defaultDate ?? isoDateOnly(today));
  const initialStart = appointment ? initialParts!.time : (defaultStartTime ?? '09:00');

  const [tab, setTab] = useState<'info' | 'lookup'>('info');
  const [patientId, setPatientId] = useState(appointment?.patientId ?? defaultPatientId ?? '');
  const [dentistId, setDentistId] = useState(appointment?.dentistId ?? defaultDentistId ?? '');
  const [date, setDate] = useState(
    appointment ? appointment.startsAt.slice(0, 10) : initialDate,
  );
  const [startTime, setStartTime] = useState(initialStart);
  const [duration, setDuration] = useState(
    String(appointment?.durationMinutes ?? 30),
  );
  const [appointmentType, setAppointmentType] = useState<AppointmentType>(
    appointment?.appointmentType ?? 'consultation',
  );
  const [reason, setReason] = useState(appointment?.reason ?? '');
  const [chiefComplaint, setChiefComplaint] = useState(appointment?.chiefComplaint ?? '');
  const [notes, setNotes] = useState(appointment?.notes ?? '');
  const [serverError, setServerError] = useState<string | null>(null);
  const [patientSearch, setPatientSearch] = useState('');

  const { data: patients, isLoading: isLoadingPatients } = usePatientOptions();
  const { data: dentists, isLoading: isLoadingDentists } = useDentistOptions();
  const { data: availability } = useAvailability(dentistId || undefined, date);

  const filteredPatients = useMemo(() => {
    const list = patients ?? [];
    if (!patientSearch) return list;
    const q = patientSearch.toLowerCase();
    return list.filter(
      (p) =>
        p.fullName.toLowerCase().includes(q) ||
        p.code.toLowerCase().includes(q) ||
        (p.primaryPhone ?? '').includes(q),
    );
  }, [patients, patientSearch]);

  useEffect(() => {
    if (!open) return;
    setServerError(null);
    if (appointment) {
      const parts = localDateTimeParts(appointment.startsAt);
      setPatientId(appointment.patientId);
      setDentistId(appointment.dentistId);
      setDate(parts.date);
      setStartTime(parts.time);
      setDuration(String(appointment.durationMinutes));
      setAppointmentType(appointment.appointmentType ?? 'consultation');
      setReason(appointment.reason ?? '');
      setChiefComplaint(appointment.chiefComplaint ?? '');
      setNotes(appointment.notes ?? '');
    } else {
      setPatientId(defaultPatientId ?? '');
      setDentistId(defaultDentistId ?? '');
      setDate(defaultDate ?? isoDateOnly(new Date()));
      setStartTime(defaultStartTime ?? '09:00');
      setDuration('30');
      setAppointmentType('consultation');
      setReason('');
      setChiefComplaint('');
      setNotes('');
    }
    setTab('info');
  }, [open, appointment, defaultDate, defaultDentistId, defaultPatientId, defaultStartTime]);

  const create = useCreateAppointment();
  const update = useUpdateAppointment(appointment?.id ?? '');

  const endTime = useMemo(() => addMinutes(startTime, Number(duration) || 30), [startTime, duration]);

  const isSlotAvailable = useMemo(() => {
    if (!availability) return null;
    // availableSlots only ever lists free slots (the backend never returns
    // a busy one), so a match means available and no match means this
    // start time isn't free — not "unknown", as `slot?.available ?? null`
    // used to report (every entry always has available: true, so a miss
    // fell through to null and the conflict warning below could never render).
    const targetMin = timeStringToMinutes(startTime);
    return availability.availableSlots.some((s) => {
      const slotMin = new Date(s.startTime).getHours() * 60 + new Date(s.startTime).getMinutes();
      return slotMin === targetMin;
    });
  }, [availability, startTime]);

  const handleSubmit = async () => {
    setServerError(null);
    if (!patientId) {
      setServerError('Vui lòng chọn bệnh nhân.');
      return;
    }
    if (!dentistId) {
      setServerError('Vui lòng chọn bác sĩ.');
      return;
    }
    const startsAt = isoFullLocal(date, startTime);
    const endsAt = isoFullLocal(date, endTime);
    try {
      if (isEdit && appointment) {
        await update.mutateAsync({
          reason,
          chiefComplaint,
          notes,
        });
        notify.success('Đã cập nhật lịch hẹn');
      } else {
        const payload: CreateAppointmentPayload = {
          patientId,
          dentistId,
          startsAt,
          endsAt,
          appointmentType,
          reason,
          chiefComplaint,
          notes,
          source: 'phone',
        };
        await create.mutateAsync(payload);
        notify.success('Đã tạo lịch hẹn mới');
      }
      onClose();
    } catch (err) {
      setServerError(getApiErrorMessage(err, 'Không thể lưu lịch hẹn'));
    }
  };

  const isPending = create.isPending || update.isPending;

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={isEdit ? 'Cập nhật lịch hẹn' : 'Tạo lịch hẹn mới'}
      description={
        isEdit
          ? `${appointment?.patientName} • ${appointment?.patientCode}`
          : 'Chọn bệnh nhân, bác sĩ, ngày và giờ trống phù hợp.'
      }
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={isPending}>
            Hủy
          </Button>
          <Button onClick={handleSubmit} isLoading={isPending}>
            {isEdit ? 'Lưu thay đổi' : 'Tạo lịch hẹn'}
          </Button>
        </>
      }
    >
      {!isEdit && (
        <div className="-mt-2 mb-4">
          <Tabs
            value={tab}
            onChange={(id) => setTab(id as 'info' | 'lookup')}
            tabs={[
              { id: 'info', label: 'Chọn bệnh nhân' },
              { id: 'lookup', label: 'Tra cứu nhanh' },
            ]}
          />
        </div>
      )}

      <div className="space-y-4">
        {serverError && <Alert variant="error">{serverError}</Alert>}

        {!isEdit && tab === 'lookup' ? (
          <div className="space-y-3">
            <Input
              label="Tìm bệnh nhân"
              placeholder="Nhập tên, mã BN hoặc SĐT..."
              value={patientSearch}
              onChange={(e) => setPatientSearch(e.target.value)}
              leftAddon={<Search className="h-3.5 w-3.5" />}
            />
            <div className="max-h-56 overflow-y-auto rounded-md border border-gray-200">
              {isLoadingPatients ? (
                <div className="flex items-center justify-center p-6 text-sm text-gray-500">
                  <Spinner size="sm" />
                  <span className="ml-2">Đang tải...</span>
                </div>
              ) : filteredPatients.length === 0 ? (
                <div className="p-6 text-center text-sm text-gray-500">Không tìm thấy bệnh nhân.</div>
              ) : (
                <ul>
                  {filteredPatients.map((p) => (
                    <li key={p.id}>
                      <button
                        type="button"
                        onClick={() => {
                          setPatientId(p.id);
                          setTab('info');
                        }}
                        className="flex w-full items-center justify-between border-b border-gray-100 px-3 py-2 text-left text-sm hover:bg-gray-50"
                      >
                        <div>
                          <p className="font-medium text-gray-900">{p.fullName}</p>
                          <p className="text-xs text-gray-500">
                            {p.code} • {p.primaryPhone ?? '—'}
                          </p>
                        </div>
                        <span className="text-xs text-primary-600">Chọn →</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        ) : (
          <>
            {!isEdit && (
              <>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  <div>
                    <label className="label">Bệnh nhân *</label>
                    <Select
                      value={patientId}
                      onChange={(e) => setPatientId(e.target.value)}
                      options={(patients ?? []).map((p) => ({
                        value: p.id,
                        label: `${p.fullName} — ${p.code}`,
                      }))}
                      placeholder={isLoadingPatients ? 'Đang tải...' : 'Chọn bệnh nhân'}
                    />
                  </div>
                  <div>
                    <label className="label">Bác sĩ *</label>
                    <Select
                      value={dentistId}
                      onChange={(e) => setDentistId(e.target.value)}
                      options={(dentists ?? []).map((d) => ({
                        value: d.id,
                        label: d.fullName + (d.specialization ? ` (${d.specialization})` : ''),
                      }))}
                      placeholder={isLoadingDentists ? 'Đang tải...' : 'Chọn bác sĩ'}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
                  <Input
                    type="date"
                    label="Ngày *"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                  />
                  <Input
                    type="time"
                    label="Giờ bắt đầu *"
                    value={startTime}
                    onChange={(e) => setStartTime(e.target.value)}
                  />
                  <Select
                    label="Thời lượng"
                    value={duration}
                    onChange={(e) => setDuration(e.target.value)}
                    options={DURATION_OPTIONS}
                  />
                  <div>
                    <label className="label">Kết thúc</label>
                    <div className="input-base flex items-center bg-gray-50 text-gray-700">
                      {endTime}
                    </div>
                  </div>
                </div>

                {isSlotAvailable === false && (
                  <Alert variant="warning">
                    Khung giờ này đã có lịch khác của bác sĩ. Vui lòng chọn giờ trống khác.
                  </Alert>
                )}
              </>
            )}

            {isEdit && (
              <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                Để đổi ngày/giờ/bác sĩ, vui lòng dùng chức năng <strong>“Đổi lịch”</strong> trong chi tiết lịch hẹn.
                Form này chỉ cập nhật <strong>lý do khám, triệu chứng và ghi chú</strong>.
              </div>
            )}

            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <Select
                label="Loại lịch hẹn"
                value={appointmentType}
                onChange={(e) => setAppointmentType(e.target.value as AppointmentType)}
                options={APPOINTMENT_TYPE_OPTIONS}
              />
              <Input
                label="Lý do khám"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="VD: Tái khám sau nhổ răng"
              />
            </div>

            <Input
              label="Triệu chứng / Lý do chính"
              value={chiefComplaint}
              onChange={(e) => setChiefComplaint(e.target.value)}
              placeholder="VD: Đau răng 26 kèm sưng nướu"
            />

            <div>
              <label className="label">Ghi chú nội bộ</label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                className="input-base resize-none"
                placeholder="VD: BN dị ứng penicillin, yêu cầu bác sĩ nữ..."
              />
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}

function addMinutes(time: string, minutes: number): string {
  const [h, m] = time.split(':').map(Number);
  const total = (h ?? 0) * 60 + (m ?? 0) + minutes;
  const nh = Math.floor((total / 60) % 24);
  const nm = total % 60;
  return `${String(nh).padStart(2, '0')}:${String(nm).padStart(2, '0')}`;
}

function timeStringToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}
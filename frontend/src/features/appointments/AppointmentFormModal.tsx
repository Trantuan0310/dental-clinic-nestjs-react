import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Button } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Alert';
import { Tabs } from '@/components/ui/Tabs';
import { Spinner } from '@/components/ui/Loading';
import {
  fetchPatientLookup,
  useAvailability,
  useCreateAppointment,
  useDentistOptions,
  usePatientMini,
  usePatientSearch,
  useUpdateAppointment,
} from './appointmentApi';
import { patientsApi } from '@/features/patients/imperativeApi';
import { isUnder12, isValidDob } from '@/features/patients/dobRules';
import type {
  Appointment,
  AppointmentSource,
  AppointmentType,
  CreateAppointmentPayload,
  DentistAvailability,
  PatientLookupCandidate,
  PatientMini,
} from '@/types/appointment';
import type { CreatePatientPayload, Gender } from '@/types/patients';
import { getApiErrorMessage } from '@/lib/errors';
import { notify } from '@/components/ui/Toast';
import { Search, UserPlus } from 'lucide-react';

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

const GENDER_OPTIONS: { value: Gender; label: string }[] = [
  { value: 'female', label: 'Nữ' },
  { value: 'male', label: 'Nam' },
  { value: 'other', label: 'Khác' },
];

const SOURCE_OPTIONS: { value: AppointmentSource; label: string }[] = [
  { value: 'phone', label: 'Điện thoại' },
  { value: 'walk_in', label: 'Khách vãng lai' },
  { value: 'online', label: 'Online' },
  { value: 'returning', label: 'Tái khám (hẹn tại quầy)' },
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

function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(t);
  }, [value, delayMs]);
  return debounced;
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

  const [tab, setTab] = useState<'info' | 'lookup' | 'new-patient'>('info');
  const [selectedPatient, setSelectedPatient] = useState<PatientMini | null>(null);
  // A pre-selected patient (?patientId=) counts as chosen right away — the
  // GET below only fetches their name for display, so a slow or failed
  // fetch can't drop the patient or block submit.
  const patientId = appointment?.patientId ?? selectedPatient?.id ?? defaultPatientId ?? '';
  // Quick-create — walk-ins with no existing record used to force staff out
  // of this modal to /patients/new and back, losing the in-progress booking.
  const [newPatientName, setNewPatientName] = useState('');
  const [newPatientDob, setNewPatientDob] = useState('');
  const [newPatientGender, setNewPatientGender] = useState<Gender>('female');
  const [newPatientPhone, setNewPatientPhone] = useState('');
  const [newPatientContactName, setNewPatientContactName] = useState('');
  const [newPatientContactPhone, setNewPatientContactPhone] = useState('');
  const [newPatientError, setNewPatientError] = useState<string | null>(null);
  // Existing records that look like the patient being quick-created (same
  // phone, or same name + DOB) — shown so staff pick one instead of making
  // a duplicate record.
  const [duplicateCandidates, setDuplicateCandidates] = useState<PatientLookupCandidate[] | null>(
    null,
  );
  const [isCheckingDuplicates, setIsCheckingDuplicates] = useState(false);
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
  const [source, setSource] = useState<AppointmentSource>('phone');
  const [serverError, setServerError] = useState<string | null>(null);
  const [patientSearch, setPatientSearch] = useState('');
  const debouncedSearch = useDebouncedValue(patientSearch, 300);

  const { data: searchResults = [], isFetching: isSearchingPatients } =
    usePatientSearch(debouncedSearch);
  const {
    data: defaultPatient,
    isLoading: isLoadingDefaultPatient,
    isError: defaultPatientFailed,
  } = usePatientMini(
    !appointment && open && !selectedPatient ? defaultPatientId : undefined,
  );
  const { data: dentists, isLoading: isLoadingDentists } = useDentistOptions();
  const { data: availability } = useAvailability(dentistId || undefined, date);

  const shownPatient = selectedPatient ?? (defaultPatientId ? defaultPatient : null) ?? null;
  const patientLabel = shownPatient
    ? `${shownPatient.fullName} — ${shownPatient.code}`
    : patientId && isLoadingDefaultPatient
      ? 'Đang tải thông tin bệnh nhân…'
      : patientId && defaultPatientFailed
        ? 'Không tải được tên bệnh nhân đã chọn sẵn'
        : 'Chưa chọn bệnh nhân';

  const queryClient = useQueryClient();
  const createPatient = useMutation({
    mutationFn: (payload: CreatePatientPayload) => patientsApi.create(payload),
    onSuccess: (created) => {
      queryClient.invalidateQueries({ queryKey: ['patients'] });
      setSelectedPatient({
        id: created.id,
        code: created.code,
        fullName: created.fullName,
        primaryPhone: newPatientPhone.trim() || null,
      });
      setTab('info');
      resetNewPatient();
      notify.success(`Đã tạo hồ sơ ${created.fullName}`);
    },
    onError: (err) => {
      setNewPatientError(getApiErrorMessage(err, 'Không thể tạo bệnh nhân'));
    },
  });

  const resetNewPatient = () => {
    setNewPatientName('');
    setNewPatientDob('');
    setNewPatientGender('female');
    setNewPatientPhone('');
    setNewPatientContactName('');
    setNewPatientContactPhone('');
    setNewPatientError(null);
    setDuplicateCandidates(null);
  };

  const newPatientIsMinor = isUnder12(newPatientDob);

  const pickPatient = (p: PatientMini) => {
    setSelectedPatient(p);
    setTab('info');
  };

  const handleCreatePatient = async (skipDuplicateCheck = false) => {
    setNewPatientError(null);
    if (!newPatientName.trim()) {
      setNewPatientError('Vui lòng nhập họ tên.');
      return;
    }
    if (!newPatientDob) {
      setNewPatientError('Vui lòng chọn ngày sinh.');
      return;
    }
    if (!isValidDob(newPatientDob)) {
      setNewPatientError('Ngày sinh không hợp lệ (phải trong quá khứ, cách đây không quá 150 năm).');
      return;
    }
    if (!newPatientPhone.trim()) {
      setNewPatientError('Vui lòng nhập số điện thoại (cần ít nhất 1 cách liên lạc).');
      return;
    }
    if (newPatientIsMinor && (!newPatientContactName.trim() || !newPatientContactPhone.trim())) {
      setNewPatientError('Bệnh nhân dưới 12 tuổi cần tên và số điện thoại người liên hệ.');
      return;
    }

    if (!skipDuplicateCheck) {
      setIsCheckingDuplicates(true);
      try {
        const [byPhone, byNameDob] = await Promise.all([
          fetchPatientLookup({ phone: newPatientPhone.trim() }),
          fetchPatientLookup({ name: newPatientName.trim(), dob: newPatientDob }),
        ]);
        const seen = new Set<string>();
        const matches = [...byPhone.candidates, ...byNameDob.candidates].filter((c) =>
          seen.has(c.id) ? false : (seen.add(c.id), true),
        );
        if (matches.length > 0) {
          setDuplicateCandidates(matches);
          return;
        }
      } catch (err) {
        setNewPatientError(getApiErrorMessage(err, 'Không kiểm tra được hồ sơ trùng'));
        return;
      } finally {
        setIsCheckingDuplicates(false);
      }
    }

    createPatient.mutate({
      fullName: newPatientName.trim(),
      dateOfBirth: newPatientDob,
      gender: newPatientGender,
      phone: newPatientPhone.trim(),
      ...(newPatientIsMinor
        ? {
            emergencyContactName: newPatientContactName.trim(),
            emergencyContactPhone: newPatientContactPhone.trim(),
          }
        : {}),
    });
  };

  useEffect(() => {
    if (!open) return;
    setServerError(null);
    if (appointment) {
      const parts = localDateTimeParts(appointment.startsAt);
      setDentistId(appointment.dentistId);
      setDate(parts.date);
      setStartTime(parts.time);
      setDuration(String(appointment.durationMinutes));
      setAppointmentType(appointment.appointmentType ?? 'consultation');
      setReason(appointment.reason ?? '');
      setChiefComplaint(appointment.chiefComplaint ?? '');
      setNotes(appointment.notes ?? '');
    } else {
      setSelectedPatient(null);
      setSource('phone');
      setDentistId(defaultDentistId ?? '');
      setDate(defaultDate ?? isoDateOnly(new Date()));
      setStartTime(defaultStartTime ?? '09:00');
      setDuration('30');
      setAppointmentType('consultation');
      setReason('');
      setChiefComplaint('');
      setNotes('');
    }
    resetNewPatient();
    setPatientSearch('');
    setTab('info');
  }, [open, appointment, defaultDate, defaultDentistId, defaultPatientId, defaultStartTime]);

  const create = useCreateAppointment();
  const update = useUpdateAppointment(appointment?.id ?? '');

  const endTime = useMemo(() => addMinutes(startTime, Number(duration) || 30), [startTime, duration]);

  const durationMin = Number(duration) || 30;

  // Checks the whole [start, start + duration) range against working hours,
  // bookings and time-off — the old check only compared the start time to
  // the slot grid, so a 60-min booking could run into the next appointment
  // unwarned, and an off-grid free time (09:10) was wrongly flagged as taken.
  const slotIssue = useMemo(
    () =>
      availability
        ? describeSlotIssue(availability, date, timeStringToMinutes(startTime), durationMin)
        : null,
    [availability, date, startTime, durationMin],
  );

  const suggestedStarts = useMemo(() => {
    if (!availability) return [];
    return availability.availableSlots
      .map((s) => {
        const d = new Date(s.startTime);
        return d.getHours() * 60 + d.getMinutes();
      })
      .filter((m) => describeSlotIssue(availability, date, m, durationMin) === null)
      .slice(0, 12)
      .map(minutesToTime);
  }, [availability, date, durationMin]);

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
          appointmentType,
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
          source,
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
            onChange={(id) => setTab(id as 'info' | 'lookup' | 'new-patient')}
            tabs={[
              { id: 'info', label: 'Chọn bệnh nhân' },
              { id: 'lookup', label: 'Tra cứu nhanh' },
              { id: 'new-patient', label: 'Bệnh nhân mới' },
            ]}
          />
        </div>
      )}

      <div className="space-y-4">
        {serverError && <Alert variant="error">{serverError}</Alert>}

        {!isEdit && tab === 'new-patient' ? (
          <div className="space-y-3">
            <p className="text-xs text-gray-500">
              Khách vãng lai chưa có hồ sơ — tạo nhanh rồi tiếp tục đặt lịch, không cần thoát khỏi form này.
            </p>
            {newPatientError && <Alert variant="error">{newPatientError}</Alert>}
            <Input
              label="Họ tên *"
              value={newPatientName}
              onChange={(e) => {
                setNewPatientName(e.target.value);
                setDuplicateCandidates(null);
              }}
              placeholder="Nguyễn Văn A"
            />
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <Input
                type="date"
                label="Ngày sinh *"
                value={newPatientDob}
                onChange={(e) => {
                  setNewPatientDob(e.target.value);
                  setDuplicateCandidates(null);
                }}
                max={isoDateOnly(today)}
              />
              <div>
                <label className="label">Giới tính *</label>
                <Select
                  value={newPatientGender}
                  onChange={(e) => {
                    setNewPatientGender(e.target.value as Gender);
                    setDuplicateCandidates(null);
                  }}
                  options={GENDER_OPTIONS}
                />
              </div>
            </div>
            <Input
              label="Số điện thoại *"
              value={newPatientPhone}
              onChange={(e) => {
                setNewPatientPhone(e.target.value);
                setDuplicateCandidates(null);
              }}
              placeholder="09xxxxxxxx"
            />
            {newPatientIsMinor && (
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <Input
                  label="Người liên hệ *"
                  value={newPatientContactName}
                  onChange={(e) => setNewPatientContactName(e.target.value)}
                  placeholder="Bố/mẹ/người giám hộ"
                />
                <Input
                  label="SĐT người liên hệ *"
                  value={newPatientContactPhone}
                  onChange={(e) => setNewPatientContactPhone(e.target.value)}
                  placeholder="09xxxxxxxx"
                />
              </div>
            )}
            {duplicateCandidates ? (
              <div className="space-y-2">
                <Alert variant="warning">
                  Đã có {duplicateCandidates.length} hồ sơ trùng số điện thoại hoặc trùng họ tên + ngày
                  sinh. Chọn hồ sơ có sẵn nếu đúng người để tránh tạo hồ sơ trùng.
                </Alert>
                <ul className="rounded-md border border-gray-200">
                  {duplicateCandidates.map((c) => (
                    <li key={c.id}>
                      <button
                        type="button"
                        onClick={() => {
                          pickPatient({
                            id: c.id,
                            code: c.code,
                            fullName: c.fullName,
                            primaryPhone: c.primaryPhone,
                          });
                          resetNewPatient();
                        }}
                        className="flex w-full items-center justify-between border-b border-gray-100 px-3 py-2 text-left text-sm last:border-b-0 hover:bg-gray-50"
                      >
                        <div>
                          <p className="font-medium text-gray-900">{c.fullName}</p>
                          <p className="text-xs text-gray-500">
                            {c.code} • {c.primaryPhone ?? '—'} • {c.dob ? c.dob.slice(0, 10) : '—'}
                          </p>
                        </div>
                        <span className="text-xs text-primary-600">Chọn hồ sơ này →</span>
                      </button>
                    </li>
                  ))}
                </ul>
                <Button
                  variant="outline"
                  leftIcon={<UserPlus className="h-4 w-4" />}
                  onClick={() => handleCreatePatient(true)}
                  isLoading={createPatient.isPending}
                >
                  Không phải — vẫn tạo hồ sơ mới
                </Button>
              </div>
            ) : (
              <Button
                leftIcon={<UserPlus className="h-4 w-4" />}
                onClick={() => handleCreatePatient()}
                isLoading={createPatient.isPending || isCheckingDuplicates}
              >
                Tạo hồ sơ & chọn bệnh nhân này
              </Button>
            )}
          </div>
        ) : !isEdit && tab === 'lookup' ? (
          <div className="space-y-3">
            <Input
              label="Tìm bệnh nhân"
              placeholder="Nhập tên, mã BN hoặc SĐT..."
              value={patientSearch}
              onChange={(e) => setPatientSearch(e.target.value)}
              leftAddon={<Search className="h-3.5 w-3.5" />}
            />
            <div className="max-h-56 overflow-y-auto rounded-md border border-gray-200">
              {debouncedSearch.trim().length < 2 ? (
                <div className="p-6 text-center text-sm text-gray-500">
                  Nhập ít nhất 2 ký tự để tìm trong toàn bộ hồ sơ bệnh nhân.
                </div>
              ) : isSearchingPatients && searchResults.length === 0 ? (
                <div className="flex items-center justify-center p-6 text-sm text-gray-500">
                  <Spinner size="sm" />
                  <span className="ml-2">Đang tìm...</span>
                </div>
              ) : searchResults.length === 0 ? (
                <div className="p-6 text-center text-sm text-gray-500">Không tìm thấy bệnh nhân.</div>
              ) : (
                <ul>
                  {searchResults.map((p) => (
                    <li key={p.id}>
                      <button
                        type="button"
                        onClick={() => pickPatient(p)}
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
                    <div className="input-base flex items-center justify-between gap-2">
                      <span className={shownPatient ? 'truncate text-gray-900' : 'text-gray-400'}>
                        {patientLabel}
                      </span>
                      <button
                        type="button"
                        onClick={() => setTab('lookup')}
                        className="shrink-0 text-xs font-medium text-primary-600 hover:underline"
                      >
                        {patientId ? 'Đổi' : 'Tìm bệnh nhân'}
                      </button>
                    </div>
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

                <Select
                  label="Nguồn đặt lịch"
                  value={source}
                  onChange={(e) => setSource(e.target.value as AppointmentSource)}
                  options={SOURCE_OPTIONS}
                />

                {slotIssue && <Alert variant="warning">{slotIssue}</Alert>}

                {dentistId && availability && suggestedStarts.length > 0 && (
                  <div>
                    <p className="mb-1 text-xs text-gray-500">
                      Giờ trống phù hợp với thời lượng {durationMin} phút:
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {suggestedStarts.map((t) => (
                        <button
                          key={t}
                          type="button"
                          onClick={() => setStartTime(t)}
                          className={
                            t === startTime
                              ? 'rounded-md border border-primary-500 bg-primary-50 px-2.5 py-1 text-xs font-medium text-primary-700'
                              : 'rounded-md border border-gray-200 bg-white px-2.5 py-1 text-xs font-medium text-gray-700 hover:border-primary-300 hover:bg-primary-50'
                          }
                        >
                          {t}
                        </button>
                      ))}
                    </div>
                  </div>
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

function minutesToTime(total: number): string {
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

/**
 * Why [startMin, startMin + durationMin) can't be booked on `date`, or null.
 * Times are clinic wall-clock minutes, as returned by the availability API.
 */
function describeSlotIssue(
  availability: DentistAvailability,
  date: string,
  startMin: number,
  durationMin: number,
): string | null {
  const endMin = startMin + durationMin;
  const now = new Date();
  const today = isoDateOnly(now);
  if (date < today || (date === today && startMin <= now.getHours() * 60 + now.getMinutes())) {
    return 'Giờ bắt đầu đã qua — vui lòng chọn giờ khác.';
  }
  if (availability.blockedReason === 'NO_SCHEDULE' || availability.windows.length === 0) {
    return 'Bác sĩ không có lịch làm việc ngày này.';
  }
  const inWindow = availability.windows.some(
    (w) => startMin >= timeStringToMinutes(w.startTime) && endMin <= timeStringToMinutes(w.endTime),
  );
  if (!inWindow) {
    const hours = availability.windows.map((w) => `${w.startTime}–${w.endTime}`).join(', ');
    return `Khung ${minutesToTime(startMin)}–${minutesToTime(endMin)} nằm ngoài giờ làm việc của bác sĩ (${hours}).`;
  }
  const clash = availability.busy.some(
    (b) => startMin < timeStringToMinutes(b.endTime) && timeStringToMinutes(b.startTime) < endMin,
  );
  if (clash) {
    return `Khung ${minutesToTime(startMin)}–${minutesToTime(endMin)} trùng lịch hẹn khác hoặc lịch nghỉ của bác sĩ.`;
  }
  return null;
}
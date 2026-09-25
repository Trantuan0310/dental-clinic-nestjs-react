import { useEffect, useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Button } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Alert';
import { Spinner } from '@/components/ui/Loading';
import { getApiErrorMessage } from '@/lib/errors';
import { notify } from '@/components/ui/Toast';
import {
  useBookableServices,
  useCreateWalkIn,
  useDentistOptions,
  usePatientSearch,
} from './appointmentApi';
import type { PatientMini } from '@/types/appointment';
import { clinicToday } from '@/lib/clinicTime';

interface WalkInModalProps {
  open: boolean;
  onClose: () => void;
  /** Called with the new appointment id, e.g. to open its drawer. */
  onCreated?: (appointmentId: string) => void;
}

const DURATION_OPTIONS = ['15', '30', '45', '60', '90'].map((v) => ({ value: v, label: `${v} phút` }));

/**
 * BR-APPT-032: a patient walks in without a booking. The visit starts now
 * and is checked in at once, so the dentist must be working, free and not on
 * leave right now — the backend refuses otherwise and the message says why.
 * A patient without a record is created from the booking form first.
 */
export function WalkInModal({ open, onClose, onCreated }: WalkInModalProps) {
  const [patient, setPatient] = useState<PatientMini | null>(null);
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [dentistId, setDentistId] = useState('');
  const [serviceIds, setServiceIds] = useState<string[]>([]);
  const [duration, setDuration] = useState('30');
  const [chiefComplaint, setChiefComplaint] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    if (!open) return;
    setPatient(null);
    setSearch('');
    setDentistId('');
    setServiceIds([]);
    setDuration('30');
    setChiefComplaint('');
    setError(null);
  }, [open]);

  const today = clinicToday();
  const { data: results = [], isFetching } = usePatientSearch(patient ? '' : debounced);
  const { data: dentists = [] } = useDentistOptions();
  const { data: services = [], isLoading: isLoadingServices } = useBookableServices(
    open ? dentistId || undefined : undefined,
    today,
  );
  const create = useCreateWalkIn();

  const chosen = services.filter((sv) => serviceIds.includes(sv.serviceId));
  const total = chosen.reduce((sum, sv) => sum + sv.durationMin, 0);

  const submit = async () => {
    setError(null);
    if (!patient) return setError('Vui lòng chọn bệnh nhân.');
    if (!dentistId) return setError('Vui lòng chọn bác sĩ.');
    try {
      const created = await create.mutateAsync({
        patientId: patient.id,
        dentistId,
        serviceIds: serviceIds.filter((id) => services.some((sv) => sv.serviceId === id)),
        durationMin: Number(duration),
        chiefComplaint,
      });
      notify.success(`Đã tiếp nhận ${patient.fullName} — đang chờ khám`);
      onClose();
      onCreated?.(created.id);
    } catch (err) {
      setError(getApiErrorMessage(err, 'Không thể tiếp nhận khách vãng lai'));
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="md"
      title="Tiếp nhận khách vãng lai"
      description="Khám ngay, không đặt trước: lịch hẹn bắt đầu từ bây giờ và được check-in luôn."
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={create.isPending}>
            Hủy
          </Button>
          <Button onClick={submit} isLoading={create.isPending}>
            Tiếp nhận
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {error && <Alert variant="error">{error}</Alert>}

        {patient ? (
          <div>
            <label className="label">Bệnh nhân *</label>
            <div className="input-base flex items-center justify-between gap-2">
              <span className="truncate text-gray-900">
                {patient.fullName} — {patient.code}
              </span>
              <button
                type="button"
                onClick={() => setPatient(null)}
                className="shrink-0 text-xs font-medium text-primary-600 hover:underline"
              >
                Đổi
              </button>
            </div>
          </div>
        ) : (
          <div>
            <Input
              label="Tìm bệnh nhân *"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Tên, số điện thoại hoặc mã bệnh nhân"
            />
            {isFetching && (
              <p className="mt-1 flex items-center gap-1 text-xs text-gray-500">
                <Spinner size="sm" /> Đang tìm…
              </p>
            )}
            {results.length > 0 && (
              <ul className="mt-1 max-h-48 overflow-y-auto rounded-md border border-gray-200">
                {results.map((p) => (
                  <li key={p.id}>
                    <button
                      type="button"
                      onClick={() => setPatient(p)}
                      className="flex w-full items-center justify-between border-b border-gray-100 px-3 py-2 text-left text-sm hover:bg-gray-50"
                    >
                      <span>
                        <span className="font-medium text-gray-900">{p.fullName}</span>
                        <span className="block text-xs text-gray-500">
                          {p.code} • {p.primaryPhone ?? '—'}
                        </span>
                      </span>
                      <span className="text-xs text-primary-600">Chọn →</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {debounced.trim().length >= 2 && !isFetching && results.length === 0 && (
              <p className="mt-1 text-xs text-gray-500">
                Không tìm thấy — tạo hồ sơ ở “Tạo lịch hẹn → Bệnh nhân mới” trước.
              </p>
            )}
          </div>
        )}

        <Select
          label="Bác sĩ *"
          value={dentistId}
          onChange={(e) => {
            setDentistId(e.target.value);
            setServiceIds([]);
          }}
          placeholder="Chọn bác sĩ"
          options={dentists.map((d) => ({ value: d.id, label: d.fullName }))}
        />

        {dentistId && (
          <fieldset>
            <legend className="label">Dịch vụ</legend>
            {isLoadingServices ? (
              <p className="text-xs text-gray-500">Đang tải dịch vụ…</p>
            ) : services.length === 0 ? (
              <p className="text-xs text-gray-500">Bác sĩ chưa được gán dịch vụ — chọn thời lượng.</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {services.map((sv) => (
                  <label
                    key={sv.serviceId}
                    className="flex cursor-pointer items-center gap-1.5 rounded-md border border-gray-200 px-2.5 py-1 text-xs font-medium text-gray-700"
                  >
                    <input
                      type="checkbox"
                      className="h-3.5 w-3.5"
                      checked={serviceIds.includes(sv.serviceId)}
                      disabled={!serviceIds.includes(sv.serviceId) && serviceIds.length >= 5}
                      onChange={() =>
                        setServiceIds((ids) =>
                          ids.includes(sv.serviceId)
                            ? ids.filter((x) => x !== sv.serviceId)
                            : [...ids, sv.serviceId],
                        )
                      }
                    />
                    {sv.name}
                    <span className="text-gray-400">{sv.durationMin}′</span>
                  </label>
                ))}
              </div>
            )}
          </fieldset>
        )}

        {chosen.length > 0 ? (
          <p className="text-xs text-gray-500">Thời lượng theo dịch vụ: {total} phút.</p>
        ) : (
          <Select
            label="Thời lượng"
            value={duration}
            onChange={(e) => setDuration(e.target.value)}
            options={DURATION_OPTIONS}
          />
        )}

        <Input
          label="Triệu chứng / Lý do đến"
          value={chiefComplaint}
          onChange={(e) => setChiefComplaint(e.target.value)}
          placeholder="VD: Đau răng hàm dưới từ tối qua"
        />
      </div>
    </Modal>
  );
}

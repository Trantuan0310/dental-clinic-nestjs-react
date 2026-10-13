import { useEffect, useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Button } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Alert';
import { Spinner } from '@/components/ui/Loading';
import { getApiErrorCode, getApiErrorMessage } from '@/lib/errors';
import { notify } from '@/components/ui/Toast';
import {
  useBookableServices,
  useCreateWalkIn,
  useDentistOptions,
  usePatientSearch,
} from './appointmentApi';
import type { PatientMini } from '@/types/appointment';
import { clinicToday } from '@/lib/clinicTime';
import { useTranslation } from 'react-i18next';

interface WalkInModalProps {
  open: boolean;
  onClose: () => void;
  /** Called with the new appointment id, e.g. to open its drawer. */
  onCreated?: (appointmentId: string) => void;
}


/**
 * BR-APPT-032: a patient walks in without a booking. The visit is checked in
 * at once and joins the dentist's queue: the dentist must be working and not
 * on leave right now, but may be busy (A3-02). Running past the end of hours
 * needs an explicit overtime reason; a patient with a booking to come is
 * asked about first (A3-08). A patient without a record is created from the
 * booking form first.
 */
export function WalkInModal({ open, onClose, onCreated }: WalkInModalProps) {
  const { t } = useTranslation();
  const durationOptions = ['15', '30', '45', '60', '90'].map((value) => ({
    value, label: t('uiScheduling.minutesValue', { count: Number(value) }),
  }));
  const [patient, setPatient] = useState<PatientMini | null>(null);
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [dentistId, setDentistId] = useState('');
  const [serviceIds, setServiceIds] = useState<string[]>([]);
  const [duration, setDuration] = useState('30');
  const [chiefComplaint, setChiefComplaint] = useState('');
  const [error, setError] = useState<string | null>(null);
  // Asked by the backend: past the end of hours / the patient has a booking.
  const [overtimeAsked, setOvertimeAsked] = useState(false);
  const [overtimeReason, setOvertimeReason] = useState('');
  const [bookingAsked, setBookingAsked] = useState(false);

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
    setOvertimeAsked(false);
    setOvertimeReason('');
    setBookingAsked(false);
  }, [open]);

  // The questions were about this patient and this dentist.
  useEffect(() => setBookingAsked(false), [patient]);
  useEffect(() => {
    setOvertimeAsked(false);
    setOvertimeReason('');
  }, [dentistId]);

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

  const submit = async (ignoreUpcomingBookings = false) => {
    setError(null);
    if (!patient) return setError(t('uiScheduling.selectPatientError'));
    if (!dentistId) return setError(t('uiScheduling.selectDentistError'));
    if (overtimeAsked && overtimeReason.trim().length < 5) {
      return setError(t('uiScheduling.overtimeReasonRequired'));
    }
    try {
      const created = await create.mutateAsync({
        patientId: patient.id,
        dentistId,
        serviceIds: serviceIds.filter((id) => services.some((sv) => sv.serviceId === id)),
        durationMin: Number(duration),
        chiefComplaint,
        overtimeReason: overtimeAsked ? overtimeReason : undefined,
        ignoreUpcomingBookings,
      });
      notify.success(t('uiScheduling.walkInCreated', { name: patient.fullName }));
      onClose();
      onCreated?.(created.id);
    } catch (err) {
      const code = getApiErrorCode(err);
      if (code === 'OVERTIME_CONFIRM_REQUIRED') setOvertimeAsked(true);
      setBookingAsked(code === 'PATIENT_HAS_BOOKING');
      setError(getApiErrorMessage(err, t('uiScheduling.walkInError')));
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="md"
      title={t('uiScheduling.walkInTitle')}
      description={t('uiScheduling.walkInDescription')}
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={create.isPending}>
            {t('uiScheduling.cancel')}
          </Button>
          {bookingAsked ? (
            <Button onClick={() => void submit(true)} isLoading={create.isPending}>
              {t('uiScheduling.walkInConfirmWithBooking')}
            </Button>
          ) : (
            <Button onClick={() => void submit()} isLoading={create.isPending}>
              {t('uiScheduling.walkInSubmit')}
            </Button>
          )}
        </>
      }
    >
      <div className="space-y-4">
        {error && <Alert variant="error">{error}</Alert>}

        {patient ? (
          <div>
            <label className="label">{t('uiScheduling.patientRequired')}</label>
            <div className="input-base flex items-center justify-between gap-2">
              <span className="truncate text-gray-900">
                {patient.fullName} — {patient.code}
              </span>
              <button
                type="button"
                onClick={() => setPatient(null)}
                className="shrink-0 text-xs font-medium text-primary-600 hover:underline"
              >
                {t('uiScheduling.change')}
              </button>
            </div>
          </div>
        ) : (
          <div>
            <Input
              label={t('uiScheduling.patientSearchRequired')}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('uiScheduling.patientSearch')}
            />
            {isFetching && (
              <p className="mt-1 flex items-center gap-1 text-xs text-gray-500">
                <Spinner size="sm" /> {t('uiScheduling.searching')}
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
                      <span className="text-xs text-primary-600">{t('uiScheduling.choose')}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {debounced.trim().length >= 2 && !isFetching && results.length === 0 && (
              <p className="mt-1 text-xs text-gray-500">
                {t('uiScheduling.walkInPatientMissing')}
              </p>
            )}
          </div>
        )}

        <Select
          label={t('uiScheduling.dentistRequired')}
          value={dentistId}
          onChange={(e) => {
            setDentistId(e.target.value);
            setServiceIds([]);
          }}
          placeholder={t('uiScheduling.chooseDentist')}
          options={dentists.map((d) => ({ value: d.id, label: d.fullName }))}
        />

        {dentistId && (
          <fieldset>
            <legend className="label">{t('uiScheduling.service')}</legend>
            {isLoadingServices ? (
              <p className="text-xs text-gray-500">{t('uiScheduling.loadingServices')}</p>
            ) : services.length === 0 ? (
              <p className="text-xs text-gray-500">{t('uiScheduling.dentistNoServices')}</p>
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
          <p className="text-xs text-gray-500">{t('uiScheduling.durationByService', { minutes: total })}</p>
        ) : (
          <Select
            label={t('uiScheduling.duration')}
            value={duration}
            onChange={(e) => setDuration(e.target.value)}
            options={durationOptions}
          />
        )}

        {overtimeAsked && (
          <Input
            label={t('uiScheduling.overtimeReasonLabel')}
            value={overtimeReason}
            onChange={(e) => setOvertimeReason(e.target.value)}
            placeholder={t('uiScheduling.walkInNoteExample')}
          />
        )}

        <Input
          label={t('uiScheduling.symptoms')}
          value={chiefComplaint}
          onChange={(e) => setChiefComplaint(e.target.value)}
          placeholder={t('uiScheduling.reasonExample')}
        />
      </div>
    </Modal>
  );
}

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
  useBookableServices,
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
  BookableService,
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
import { clinicIso, clinicMinutes, clinicParts, clinicToday } from '@/lib/clinicTime';
import { useAuthStore } from '@/stores/authStore';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';

const DURATION_VALUES = ['15', '30', '45', '60', '90', '120'];

interface AppointmentFormModalProps {
  open: boolean;
  onClose: () => void;
  appointment?: Appointment | null;
  defaultDate?: string;
  defaultDentistId?: string;
  defaultPatientId?: string;
  defaultStartTime?: string;
  /** e.g. 'follow_up' when a dentist books the next visit from an encounter. */
  defaultType?: AppointmentType;
}

function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(t);
  }, [value, delayMs]);
  return debounced;
}

export function AppointmentFormModal({
  open,
  onClose,
  appointment,
  defaultDate,
  defaultDentistId,
  defaultPatientId,
  defaultStartTime,
  defaultType,
}: AppointmentFormModalProps) {
  const { t } = useTranslation();
  const appointmentTypeOptions = [
    { value: 'consultation', label: t('uiScheduling.typeConsultation') },
    { value: 'treatment', label: t('uiScheduling.typeTreatment') },
    { value: 'follow_up', label: t('uiScheduling.typeFollowUp') },
  ];
  const genderOptions = [
    { value: 'female', label: t('uiScheduling.genderFemale') },
    { value: 'male', label: t('uiScheduling.genderMale') },
    { value: 'other', label: t('uiScheduling.genderOther') },
  ];
  const sourceOptions = [
    { value: 'phone', label: t('uiScheduling.sourcePhone') },
    { value: 'walk_in', label: t('uiScheduling.sourceWalkIn') },
    { value: 'online', label: t('uiScheduling.sourceOnline') },
    { value: 'returning', label: t('uiScheduling.sourceReturning') },
  ];
  const isEdit = !!appointment;
  // A dentist (own appointments only) books on their own calendar, for
  // patients they have treated (enforced by the API); front desk books for
  // anyone and can quick-create a patient.
  const me = useAuthStore((s) => s.user?.id);
  const ownCalendarOnly = useAuthStore(
    (s) => s.hasPermission('appointment.read.own') && !s.hasPermission('appointment.read.any'),
  );
  const canCreatePatient = useAuthStore((s) => s.hasPermission('patient.create'));
  const lockedDentistId = ownCalendarOnly ? me : undefined;

  const initialParts = appointment ? clinicParts(appointment.startsAt) : null;
  const initialDate = appointment ? initialParts!.date : (defaultDate ?? clinicToday());
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
  const [dentistId, setDentistId] = useState(
    appointment?.dentistId ?? lockedDentistId ?? defaultDentistId ?? '',
  );
  const [date, setDate] = useState(initialDate);
  const [startTime, setStartTime] = useState(initialStart);
  const [duration, setDuration] = useState(
    String(appointment?.durationMinutes ?? 30),
  );
  const [appointmentType, setAppointmentType] = useState<AppointmentType>(
    appointment?.appointmentType ?? defaultType ?? 'consultation',
  );
  const [reason, setReason] = useState(appointment?.reason ?? '');
  const [chiefComplaint, setChiefComplaint] = useState(appointment?.chiefComplaint ?? '');
  const [notes, setNotes] = useState(appointment?.notes ?? '');
  // A follow-up booked from the encounter is a returning patient, not a call
  // (A6-18: "Khách quay lại" in the source report stayed empty otherwise).
  const [source, setSource] = useState<AppointmentSource>(
    defaultType === 'follow_up' ? 'returning' : 'phone',
  );
  // ADR-0009 phase 5: services chosen for the visit, in click order.
  const [serviceIds, setServiceIds] = useState<string[]>([]);
  const [durationOverrideReason, setDurationOverrideReason] = useState('');
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
  const { data: bookableServices = [], isLoading: isLoadingServices } = useBookableServices(
    !isEdit && open ? dentistId || undefined : undefined,
    date,
  );
  // Only services the dentist still performs on the chosen date count —
  // changing the date or dentist silently drops the rest.
  const chosenServices = useMemo(
    () =>
      serviceIds
        .map((id) => bookableServices.find((sv) => sv.serviceId === id))
        .filter((sv): sv is NonNullable<typeof sv> => !!sv),
    [serviceIds, bookableServices],
  );
  const servicesTotal = chosenServices.reduce((sum, sv) => sum + sv.durationMin, 0);
  const bufferBeforeMin = Math.max(0, ...chosenServices.map((sv) => sv.bufferBeforeMin));
  const bufferAfterMin = Math.max(0, ...chosenServices.map((sv) => sv.bufferAfterMin));
  // Another dentist or day can change the services' durations (the dentist's
  // own override, BR-SVC-006): the length follows the new total, as the API
  // re-plans it. A manual length stays until the total changes.
  useEffect(() => {
    if (isEdit || servicesTotal <= 0) return;
    setDuration(String(servicesTotal));
    setDurationOverrideReason('');
  }, [isEdit, dentistId, date, servicesTotal]);
  const durationMin = Number(duration) || 30;
  // BR-APPT-031: a length other than the services' total needs a reason.
  const durationOverridden = chosenServices.length > 0 && durationMin !== servicesTotal;
  // The same grid as online booking and rescheduling (SLOT_STEP_MIN, for
  // this visit's length and buffers); describeSlotIssue re-checks the range.
  const { data: availability } = useAvailability(dentistId || undefined, date, {
    slotDuration: durationMin,
    bufferBeforeMin,
    bufferAfterMin,
  });

  const toggleService = (id: string) => {
    const next = serviceIds.includes(id)
      ? serviceIds.filter((x) => x !== id)
      : [...serviceIds, id];
    setServiceIds(next);
    const total = next
      .map((x) => bookableServices.find((sv) => sv.serviceId === x)?.durationMin ?? 0)
      .reduce((a, b) => a + b, 0);
    if (total > 0) setDuration(String(total));
    setDurationOverrideReason('');
  };

  const shownPatient = selectedPatient ?? (defaultPatientId ? defaultPatient : null) ?? null;
  const patientLabel = shownPatient
    ? `${shownPatient.fullName} — ${shownPatient.code}`
    : patientId && isLoadingDefaultPatient
      ? t('uiScheduling.loadingPatientInfo')
      : patientId && defaultPatientFailed
        ? t('uiScheduling.prefilledPatientLoadError')
        : t('uiScheduling.noPatientSelected');

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
      notify.success(t('uiScheduling.patientCreated', { name: created.fullName }));
    },
    onError: (err) => {
      setNewPatientError(getApiErrorMessage(err, t('uiScheduling.createPatientError')));
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
      setNewPatientError(t('uiScheduling.patientNameRequiredError'));
      return;
    }
    if (!newPatientDob) {
      setNewPatientError(t('uiScheduling.dateOfBirthRequiredError'));
      return;
    }
    if (!isValidDob(newPatientDob)) {
      setNewPatientError(t('uiScheduling.invalidDateOfBirthError'));
      return;
    }
    if (!newPatientPhone.trim()) {
      setNewPatientError(t('uiScheduling.phoneRequiredError'));
      return;
    }
    if (newPatientIsMinor && (!newPatientContactName.trim() || !newPatientContactPhone.trim())) {
      setNewPatientError(t('uiScheduling.minorContactRequiredError'));
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
        setNewPatientError(getApiErrorMessage(err, t('uiScheduling.duplicatePatientCheckError')));
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
      const parts = clinicParts(appointment.startsAt);
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
      setSource(defaultType === 'follow_up' ? 'returning' : 'phone');
      setDentistId(lockedDentistId ?? defaultDentistId ?? '');
      setDate(defaultDate ?? clinicToday());
      setStartTime(defaultStartTime ?? '09:00');
      setDuration('30');
      setAppointmentType(defaultType ?? 'consultation');
      setReason('');
      setChiefComplaint('');
      setNotes('');
    }
    setServiceIds([]);
    setDurationOverrideReason('');
    resetNewPatient();
    setPatientSearch('');
    setTab('info');
  }, [open, appointment, defaultDate, defaultDentistId, defaultPatientId, defaultStartTime, defaultType, lockedDentistId]);

  const create = useCreateAppointment();
  const update = useUpdateAppointment(appointment?.id ?? '');

  const endTime = useMemo(() => addMinutes(startTime, Number(duration) || 30), [startTime, duration]);

  // Checks the whole [start, start + duration) range against working hours,
  // bookings and time-off — the old check only compared the start time to
  // the slot grid, so a 60-min booking could run into the next appointment
  // unwarned, and an off-grid free time (09:10) was wrongly flagged as taken.
  const slotIssue = useMemo(
    () =>
      availability
        ? describeSlotIssue(availability, date, timeStringToMinutes(startTime), durationMin, t, {
            before: bufferBeforeMin,
            after: bufferAfterMin,
          })
        : null,
    [availability, date, startTime, durationMin, bufferBeforeMin, bufferAfterMin, t],
  );

  const suggestedStarts = useMemo(() => {
    if (!availability) return [];
    return availability.availableSlots
      .map((s) => clinicMinutes(s.startTime))
      .filter(
        (m) =>
          describeSlotIssue(availability, date, m, durationMin, t, {
            before: bufferBeforeMin,
            after: bufferAfterMin,
          }) === null,
      )
      .map(minutesToTime);
  }, [availability, date, durationMin, bufferBeforeMin, bufferAfterMin, t]);
  // Every free time, grouped morning / afternoon (not only the first few).
  const suggestedGroups = useMemo(
    () =>
      [
        { label: t('uiScheduling.morning'), times: suggestedStarts.filter((t) => t < '12:00') },
        { label: t('uiScheduling.afternoon'), times: suggestedStarts.filter((t) => t >= '12:00') },
      ].filter((g) => g.times.length > 0),
    [suggestedStarts, t],
  );

  const durationOptions = useMemo(
    () =>
      (DURATION_VALUES.includes(duration) ? DURATION_VALUES : [...DURATION_VALUES, duration])
        .map((value) => ({ value, label: t('uiScheduling.minutesValue', { count: Number(value) }) }))
        .sort(
            (a, b) => Number(a.value) - Number(b.value),
          ),
    [duration, t],
  );

  const handleSubmit = async () => {
    setServerError(null);
    if (!patientId) {
      setServerError(t('uiScheduling.selectPatientError'));
      return;
    }
    if (!dentistId) {
      setServerError(t('uiScheduling.selectDentistError'));
      return;
    }
    if (!isEdit && durationOverridden && durationOverrideReason.trim().length < 5) {
      setServerError(
        t('uiScheduling.durationOverrideReasonRequired', { services: servicesTotal, duration: durationMin }),
      );
      return;
    }
    const startsAt = clinicIso(date, startTime);
    const endsAt = clinicIso(date, endTime);
    try {
      if (isEdit && appointment) {
        await update.mutateAsync({
          reason,
          chiefComplaint,
          appointmentType,
          notes,
        });
      notify.success(t('uiScheduling.appointmentUpdated'));
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
          serviceIds: chosenServices.map((sv) => sv.serviceId),
          durationOverrideReason: durationOverridden ? durationOverrideReason : undefined,
        };
        await create.mutateAsync(payload);
        notify.success(t('uiScheduling.appointmentCreated'));
      }
      onClose();
    } catch (err) {
      setServerError(getApiErrorMessage(err, t('uiScheduling.saveAppointmentError')));
    }
  };

  const isPending = create.isPending || update.isPending;

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={isEdit ? t('uiScheduling.updateAppointment') : t('uiScheduling.appointmentCreateTitle')}
      description={
        isEdit
          ? `${appointment?.patientName} • ${appointment?.patientCode}`
          : t('uiScheduling.appointmentFormHint')
      }
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={isPending}>
            {t('uiScheduling.cancel')}
          </Button>
          <Button onClick={handleSubmit} isLoading={isPending}>
            {isEdit ? t('uiScheduling.saveChanges') : t('uiScheduling.createAppointment')}
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
              { id: 'info', label: t('uiScheduling.selectPatient') },
              { id: 'lookup', label: t('uiScheduling.quickSearch') },
              ...(canCreatePatient ? [{ id: 'new-patient', label: t('uiScheduling.newPatient') }] : []),
            ]}
          />
        </div>
      )}

      <div className="space-y-4">
        {serverError && <Alert variant="error">{serverError}</Alert>}

        {!isEdit && tab === 'new-patient' ? (
          <div className="space-y-3">
            <p className="text-xs text-gray-500">
              {t('uiScheduling.newPatientTabHint')}
            </p>
            {newPatientError && <Alert variant="error">{newPatientError}</Alert>}
            <Input
              label={t('uiScheduling.patientNameRequired')}
              value={newPatientName}
              onChange={(e) => {
                setNewPatientName(e.target.value);
                setDuplicateCandidates(null);
              }}
              placeholder={t('uiScheduling.patientNameExample')}
            />
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <Input
                type="date"
                label={t('uiScheduling.dateOfBirthRequired')}
                value={newPatientDob}
                onChange={(e) => {
                  setNewPatientDob(e.target.value);
                  setDuplicateCandidates(null);
                }}
                max={clinicToday()}
              />
              <div>
              <label className="label">{t('uiScheduling.gender')}</label>
                <Select
                  value={newPatientGender}
                  onChange={(e) => {
                    setNewPatientGender(e.target.value as Gender);
                    setDuplicateCandidates(null);
                  }}
                  options={genderOptions}
                />
              </div>
            </div>
            <Input
              label={t('uiScheduling.phoneNumberRequired')}
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
                  label={t('uiScheduling.contactPersonRequired')}
                  value={newPatientContactName}
                  onChange={(e) => setNewPatientContactName(e.target.value)}
                  placeholder={t('uiScheduling.guardianExample')}
                />
                <Input
                  label={t('uiScheduling.contactPhoneRequired')}
                  value={newPatientContactPhone}
                  onChange={(e) => setNewPatientContactPhone(e.target.value)}
                  placeholder="09xxxxxxxx"
                />
              </div>
            )}
            {duplicateCandidates ? (
              <div className="space-y-2">
                <Alert variant="warning">
                  {t('uiScheduling.duplicateCandidatesFound', { count: duplicateCandidates.length })}
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
                        <span className="text-xs text-primary-600">{t('uiScheduling.selectThisPatient')}</span>
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
                  {t('uiScheduling.createNewPatientAnyway')}
                </Button>
              </div>
            ) : (
              <Button
                leftIcon={<UserPlus className="h-4 w-4" />}
                onClick={() => handleCreatePatient()}
                isLoading={createPatient.isPending || isCheckingDuplicates}
              >
                {t('uiScheduling.createPatientAndSelect')}
              </Button>
            )}
          </div>
        ) : !isEdit && tab === 'lookup' ? (
          <div className="space-y-3">
            <Input
              label={t('uiScheduling.findPatient')}
              placeholder={t('uiScheduling.patientSearch')}
              value={patientSearch}
              onChange={(e) => setPatientSearch(e.target.value)}
              leftAddon={<Search className="h-3.5 w-3.5" />}
            />
            <div className="max-h-56 overflow-y-auto rounded-md border border-gray-200">
              {debouncedSearch.trim().length < 2 ? (
                <div className="p-6 text-center text-sm text-gray-500">
                  {t('uiScheduling.patientSearchMinChars')}
                </div>
              ) : isSearchingPatients && searchResults.length === 0 ? (
                <div className="flex items-center justify-center p-6 text-sm text-gray-500">
                  <Spinner size="sm" />
                  <span className="ml-2">{t('uiScheduling.searching')}</span>
                </div>
              ) : searchResults.length === 0 ? (
                <div className="p-6 text-center text-sm text-gray-500">{t('uiScheduling.noPatientFound')}</div>
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
                        <span className="text-xs text-primary-600">{t('uiScheduling.choose')}</span>
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
                    <label className="label">{t('uiScheduling.patientRequired')}</label>
                    <div className="input-base flex items-center justify-between gap-2">
                      <span className={shownPatient ? 'truncate text-gray-900' : 'text-gray-400'}>
                        {patientLabel}
                      </span>
                      <button
                        type="button"
                        onClick={() => setTab('lookup')}
                        className="shrink-0 text-xs font-medium text-primary-600 hover:underline"
                      >
                        {patientId ? t('uiScheduling.change') : t('uiScheduling.findPatient')}
                      </button>
                    </div>
                  </div>
                  <div>
                    <label className="label">{t('uiScheduling.dentistRequired')}</label>
                    <Select
                      aria-label={t('uiScheduling.dentist')}
                      value={dentistId}
                      disabled={!!lockedDentistId}
                      onChange={(e) => {
                        setDentistId(e.target.value);
                        setServiceIds([]);
                      }}
                      options={(dentists ?? [])
                        .filter((d) => !lockedDentistId || d.id === lockedDentistId)
                        .map((d) => ({
                          value: d.id,
                          label: d.fullName + (d.specialization ? ` (${d.specialization})` : ''),
                        }))}
                      placeholder={isLoadingDentists ? t('uiScheduling.loading') : t('uiScheduling.chooseDentist')}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
                  <Input
                    type="date"
                    label={t('uiScheduling.appointmentDateRequired')}
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                  />
                  <Input
                    type="time"
                    label={t('uiScheduling.startTimeRequired')}
                    value={startTime}
                    onChange={(e) => setStartTime(e.target.value)}
                  />
                  <Select
                    label={t('uiScheduling.duration')}
                    value={duration}
                    onChange={(e) => setDuration(e.target.value)}
                    options={durationOptions}
                  />
                  <div>
                    <label className="label">{t('uiScheduling.endTime')}</label>
                    <div className="input-base flex items-center bg-gray-50 text-gray-700">
                      {endTime}
                    </div>
                  </div>
                </div>

                {dentistId && (
                  <ServicePicker
                    services={bookableServices}
                    isLoading={isLoadingServices}
                    selected={serviceIds}
                    onToggle={toggleService}
                    totalMin={servicesTotal}
                    bufferBeforeMin={bufferBeforeMin}
                    bufferAfterMin={bufferAfterMin}
                  />
                )}

                {durationOverridden && (
                  <Input
                    label={t('uiScheduling.durationOverrideReasonLabel', { minutes: servicesTotal })}
                    value={durationOverrideReason}
                    onChange={(e) => setDurationOverrideReason(e.target.value)}
                    placeholder={t('uiScheduling.durationOverrideExample')}
                  />
                )}

                <Select
                  label={t('uiScheduling.source')}
                  value={source}
                  onChange={(e) => setSource(e.target.value as AppointmentSource)}
                options={sourceOptions}
                />

                {slotIssue && <Alert variant="warning">{slotIssue}</Alert>}
                {availability?.pendingTimeOffs && availability.pendingTimeOffs.length > 0 && (
                  <Alert variant="info">
                    {t('uiScheduling.pendingTimeOffWarning', { times: availability.pendingTimeOffs.map((timeOff) => `${timeOff.startTime}–${timeOff.endTime}`).join(', ') })}
                  </Alert>
                )}

                {dentistId && availability && suggestedStarts.length > 0 && (
                  <div>
                    <p className="mb-1 text-xs text-gray-500">
                      {t('uiScheduling.availableStartsForDuration', { minutes: durationMin, count: suggestedStarts.length })}
                    </p>
                    <div className="max-h-40 space-y-1.5 overflow-y-auto">
                      {suggestedGroups.map((g) => (
                        <div key={g.label} className="flex flex-wrap items-center gap-1.5">
                          <span className="w-10 text-xs text-gray-400">{g.label}</span>
                          {g.times.map((t) => (
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
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}

            {isEdit && (
              <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                {t('uiScheduling.editAppointmentHint')}
              </div>
            )}

            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <Select
                label={t('uiScheduling.appointmentType')}
                value={appointmentType}
                onChange={(e) => setAppointmentType(e.target.value as AppointmentType)}
                options={appointmentTypeOptions}
              />
              <Input
                label={t('uiScheduling.reason')}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder={t('uiScheduling.reasonExample')}
              />
            </div>

            <Input
              label={t('uiScheduling.symptoms')}
              value={chiefComplaint}
              onChange={(e) => setChiefComplaint(e.target.value)}
              placeholder={t('uiScheduling.symptomsExample')}
            />

            <div>
              <label className="label">{t('uiScheduling.internalNote')}</label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                className="input-base resize-none"
                placeholder={t('uiScheduling.internalNoteExample')}
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
  t: TFunction,
  buffers: { before: number; after: number } = { before: 0, after: 0 },
): string | null {
  const endMin = startMin + durationMin;
  const now = new Date();
  const today = clinicToday(now);
  if (date < today || (date === today && startMin <= clinicMinutes(now))) {
    return t('uiScheduling.startTimePassed');
  }
  if (availability.blockedReason === 'NO_SCHEDULE' || availability.windows.length === 0) {
    return t('uiScheduling.dentistNoSchedule');
  }
  const inWindow = availability.windows.some(
    (w) => startMin >= timeStringToMinutes(w.startTime) && endMin <= timeStringToMinutes(w.endTime),
  );
  if (!inWindow) {
    const hours = availability.windows.map((w) => `${w.startTime}–${w.endTime}`).join(', ');
    return t('uiScheduling.outsideWorkingHours', { start: minutesToTime(startMin), end: minutesToTime(endMin), hours });
  }
  // `busy` already includes other bookings' buffers; add this visit's own
  // prep/clean-up time (ADR-0009 D4).
  const busyFrom = startMin - buffers.before;
  const busyTo = endMin + buffers.after;
  const clash = availability.busy.some(
    (b) => busyFrom < timeStringToMinutes(b.endTime) && timeStringToMinutes(b.startTime) < busyTo,
  );
  if (clash) {
    return t('uiScheduling.timeSlotUnavailable', { start: minutesToTime(startMin), end: minutesToTime(endMin), withBuffers: buffers.before || buffers.after ? t('uiScheduling.includingBuffers') : '' });
  }
  return null;
}
/** Services the dentist performs that day; click order is the visit order. */
function ServicePicker({
  services,
  isLoading,
  selected,
  onToggle,
  totalMin,
  bufferBeforeMin,
  bufferAfterMin,
}: {
  services: BookableService[];
  isLoading: boolean;
  selected: string[];
  onToggle: (id: string) => void;
  totalMin: number;
  bufferBeforeMin: number;
  bufferAfterMin: number;
}) {
  const { t } = useTranslation();
  return (
    <fieldset>
      <legend className="label">{t('uiScheduling.service')}</legend>
      {isLoading ? (
        <p className="text-xs text-gray-500">{t('uiScheduling.loadingDentistServices')}</p>
      ) : services.length === 0 ? (
        <p className="text-xs text-gray-500">
          {t('uiScheduling.dentistNoServicesForDay')}
        </p>
      ) : (
        <>
          <div className="flex flex-wrap gap-1.5">
            {services.map((sv) => {
              const checked = selected.includes(sv.serviceId);
              return (
                <label
                  key={sv.serviceId}
                  className={
                    checked
                      ? 'flex cursor-pointer items-center gap-1.5 rounded-md border border-primary-500 bg-primary-50 px-2.5 py-1 text-xs font-medium text-primary-700'
                      : 'flex cursor-pointer items-center gap-1.5 rounded-md border border-gray-200 bg-white px-2.5 py-1 text-xs font-medium text-gray-700 hover:border-primary-300'
                  }
                >
                  <input
                    type="checkbox"
                    className="h-3.5 w-3.5"
                    checked={checked}
                    disabled={!checked && selected.length >= 5}
                    onChange={() => onToggle(sv.serviceId)}
                  />
                  {sv.name}
                  <span className="text-gray-400">{sv.durationMin}′</span>
                </label>
              );
            })}
          </div>
          {selected.length > 0 && (
            <p className="mt-1 text-xs text-gray-500">
              {t('uiScheduling.totalMinutes', { count: totalMin })}
              {bufferBeforeMin || bufferAfterMin
                ? t('uiScheduling.serviceBuffers', { before: bufferBeforeMin, after: bufferAfterMin })
                : ''}
            </p>
          )}
        </>
      )}
    </fieldset>
  );
}

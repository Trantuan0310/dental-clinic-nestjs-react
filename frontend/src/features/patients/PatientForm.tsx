import { useState, useEffect, useRef, useMemo } from 'react';
import { useBlocker, useNavigate, useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { differenceInYears, format, parseISO } from 'date-fns';
import { isValidDob } from './dobRules';
import { ArrowLeft, Save, Plus, X } from 'lucide-react';
import { patientsApi } from '@/features/patients/imperativeApi';
import { Button, Card, Input, Textarea, Alert } from '@/components/ui';
import { notify } from '@/components/ui/Toast';
import { getApiErrorCode, getApiErrorMessage } from '@/lib/errors';
import type { CreatePatientPayload, UpdatePatientPayload, PatientLookupResult } from '@/types/patients';
import { useTranslation } from 'react-i18next';

// VN mobile numbers: 10 digits starting 0, next digit one of 3/5/7/8/9.
const VN_PHONE_REGEX = /^0(3|5|7|8|9)[0-9]{8}$/;
const makePatientSchema = (t: (key: string) => string) => {
  const vnPhone = z.string().regex(VN_PHONE_REGEX, t('uiClinical.phoneInvalid')).optional().or(z.literal(''));
  return z.object({
    fullName: z.string().min(1, t('uiClinical.requiredName')),
    dateOfBirth: z.string().min(1, t('uiClinical.dobRequired')).refine(isValidDob, t('uiClinical.dobInvalid')),
    gender: z.enum(['male', 'female', 'other']),
    phone: vnPhone,
    email: z.string().email(t('uiClinical.emailInvalid')).optional().or(z.literal('')),
    address: z.string().optional(), occupation: z.string().optional(), emergencyContactName: z.string().optional(),
    emergencyContactPhone: vnPhone, notes: z.string().optional(), allergies: z.array(z.string()).optional(),
    chronicDiseases: z.array(z.string()).optional(), currentMedications: z.array(z.string()).optional(),
  }).superRefine((data, ctx) => {
    if (!data.phone && !data.emergencyContactPhone) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['phone'],
        message: t('uiClinical.contactRequired'),
      });
    }
    if (!data.phone && data.emergencyContactPhone && !data.emergencyContactName) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['emergencyContactName'],
        message: t('uiClinical.contactNameRequired'),
      });
    }

    if (!isValidDob(data.dateOfBirth)) return;
    const age = differenceInYears(new Date(), parseISO(data.dateOfBirth));
    if (age < 12 && !data.emergencyContactName) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['emergencyContactName'],
        message: t('uiClinical.childContactNameRequired'),
      });
    }
    if (age < 12 && !data.emergencyContactPhone) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['emergencyContactPhone'],
        message: t('uiClinical.childContactPhoneRequired'),
      });
    }
  });
};

type PatientFormData = z.infer<ReturnType<typeof makePatientSchema>>;

export function PatientForm() {
  const { t } = useTranslation();
  const patientSchema = useMemo(() => makePatientSchema(t), [t]);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  // "patients/new" has no :id param, so this is undefined there — that's how
  // the form tells "create" apart from "edit" (patients/:id/edit).
  const { id: patientId } = useParams<{ id: string }>();
  const [allergies, setAllergies] = useState<string[]>([]);
  const [chronicDiseases, setChronicDiseases] = useState<string[]>([]);
  const [currentMedications, setCurrentMedications] = useState<string[]>([]);
  const [duplicateWarning, setDuplicateWarning] = useState<PatientLookupResult[]>([]);
  const [newTag, setNewTag] = useState({ allergies: '', chronicDiseases: '', currentMedications: '' });
  const [tagsDirty, setTagsDirty] = useState(false);
  const saved = useRef(false);

  const { data: patient, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ['patient', patientId],
    queryFn: () => patientsApi.get(patientId!),
    enabled: !!patientId,
  });

  const createMutation = useMutation({
    mutationFn: (data: CreatePatientPayload) => patientsApi.create(data),
    onSuccess: (data) => {
      saved.current = true;
      navigate(`/patients/${data.id}`);
    },
    onError: (err) => {
      notify.error(getApiErrorMessage(err, t('uiClinical.createPatientError')));
    },
  });

  const updateMutation = useMutation({
    mutationFn: (data: UpdatePatientPayload) => patientsApi.update(patientId!, data),
    onSuccess: (data) => {
      saved.current = true;
      navigate(`/patients/${data.id}`);
    },
    onError: (err) => {
      notify.error(getApiErrorMessage(err, t('uiClinical.savePatientError')));
      // Someone else saved this patient after the form loaded: reload it so
      // the next save starts from (and keeps) their changes.
      if (getApiErrorCode(err) === 'PATIENT_VERSION_CONFLICT') {
        queryClient.invalidateQueries({ queryKey: ['patient', patientId] });
      }
    },
  });

  const {
    register,
    handleSubmit,
    watch,
    reset,
    trigger,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<PatientFormData>({
    resolver: zodResolver(patientSchema),
    defaultValues: {
      gender: 'male',
    },
  });

  const invalidFieldNames = Object.keys(errors).join('|');
  useEffect(() => {
    const invalidFields = invalidFieldNames.split('|').filter(Boolean) as Array<keyof PatientFormData>;
    if (invalidFields.length > 0) void trigger(invalidFields);
  }, [invalidFieldNames, patientSchema, trigger]);

  useEffect(() => {
    if (patient) {
      reset({
        fullName: patient.fullName,
        dateOfBirth: patient.dateOfBirth.split('T')[0],
        gender: patient.gender,
        phone: patient.phone || '',
        email: patient.email || '',
        address: patient.address || '',
        occupation: patient.occupation || '',
        emergencyContactName: patient.emergencyContactName || '',
        emergencyContactPhone: patient.emergencyContactPhone || '',
        notes: patient.notes || '',
      });
      setAllergies(patient.allergies || []);
      setChronicDiseases(patient.chronicDiseases || []);
      setCurrentMedications(patient.currentMedications || []);
      setTagsDirty(false);
    }
  }, [patient, reset]);

  const handlePhoneSearch = async (phone: string) => {
    if (phone.length >= 3) {
      const results = await patientsApi.searchByPhone(phone);
      setDuplicateWarning(results);
    } else {
      setDuplicateWarning([]);
    }
  };

  const addTag = (
    setter: React.Dispatch<React.SetStateAction<string[]>>,
    value: string,
    field: keyof typeof newTag,
  ) => {
    const trimmed = value.trim();
    if (!trimmed) return;
    setter((prev) => (prev.includes(trimmed) ? prev : [...prev, trimmed]));
    setNewTag((prev) => ({ ...prev, [field]: '' }));
    setTagsDirty(true);
  };

  // Removes by index, not by value — two entries with the same text (e.g.
  // two "Penicillin" allergies entered before dedup existed) must be
  // removable independently instead of both vanishing on one click.
  const removeTag = (
    setter: React.Dispatch<React.SetStateAction<string[]>>,
    index: number,
  ) => {
    setter((prev) => prev.filter((_, i) => i !== index));
    setTagsDirty(true);
  };

  const onSubmit = (data: PatientFormData) => {
    if (patientId) {
      // Without the loaded version the save could overwrite a newer record
      // (e.g. an allergy added meanwhile) — reload instead of skipping the check.
      if (!patient?.updatedAt) {
        notify.error(t('uiClinical.versionUnknown'));
        queryClient.invalidateQueries({ queryKey: ['patient', patientId] });
        return;
      }
      // Backend treats any dob present in the payload as an attempt to
      // change it and 409s once the patient has encounters — omit it here
      // when the user didn't actually touch the date field, instead of
      // resubmitting the same value on every unrelated edit.
      const dobUnchanged =
        !!patient && data.dateOfBirth === patient.dateOfBirth.split('T')[0];
      const { dateOfBirth, ...rest } = data;
      // Same for the history lists: resending the lists loaded with the form
      // would overwrite an allergy recorded meanwhile (e.g. by the dentist).
      const changed = (next: string[], loaded?: string[]) =>
        JSON.stringify(next) !== JSON.stringify(loaded ?? []);
      const payload: UpdatePatientPayload = {
        ...rest,
        ...(dobUnchanged ? {} : { dateOfBirth }),
        ...(changed(allergies, patient?.allergies) && { allergies }),
        ...(changed(chronicDiseases, patient?.chronicDiseases) && { chronicDiseases }),
        ...(changed(currentMedications, patient?.currentMedications) && { currentMedications }),
        expectedUpdatedAt: patient.updatedAt,
      };
      updateMutation.mutate(payload);
    } else {
      const payload: CreatePatientPayload = {
        ...data,
        allergies,
        chronicDiseases,
        currentMedications,
      };
      createMutation.mutate(payload);
    }
  };

  const dob = watch('dateOfBirth');
  // Guard against a not-yet-submitted future date (RHF only re-validates
  // on submit by default) rendering a nonsensical negative age — and, worse,
  // spuriously showing the under-12 emergency-contact panel, since age < 12
  // is also true for negative ages.
  const age = dob && isValidDob(dob)
    ? differenceInYears(new Date(), parseISO(dob))
    : null;
  const todayIso = format(new Date(), 'yyyy-MM-dd');
  const hasUnsavedChanges =
    isDirty || tagsDirty || Object.values(newTag).some((value) => value.trim());
  const blocker = useBlocker(({ currentLocation, nextLocation }) =>
    hasUnsavedChanges && !saved.current && nextLocation.pathname !== '/login' &&
    currentLocation.pathname !== nextLocation.pathname,
  );

  useEffect(() => {
    if (blocker.state !== 'blocked') return;
    if (window.confirm(t('uiClinical.unsavedChanges'))) blocker.proceed();
    else blocker.reset();
  }, [blocker, t]);

  useEffect(() => {
    const warnBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!hasUnsavedChanges) return;
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warnBeforeUnload);
    return () => window.removeEventListener('beforeunload', warnBeforeUnload);
  }, [hasUnsavedChanges]);

  const cancelForm = () => {
    navigate(-1);
  };

  if (patientId && isLoading) {
    return <div>{t('uiClinical.loading')}</div>;
  }

  if (patientId && isError && !patient) {
    return (
      <Alert type="danger" title={t('uiClinical.patientRecordLoadError')}>
        <p className="mb-3">{t('uiClinical.reloadBeforeEdit')}</p>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => refetch()} isLoading={isFetching}>{t('uiClinical.retry')}</Button>
          <Button variant="ghost" onClick={cancelForm}>{t('uiClinical.cancel')}</Button>
        </div>
      </Alert>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" onClick={cancelForm} aria-label={t('uiClinical.backToPatients')}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-surface-100">
          {patientId ? t('uiClinical.editPatient') : t('uiClinical.createNewPatient')}
        </h1>
      </div>

      {duplicateWarning.length > 0 && (
        <Alert type="warning" title={t('uiClinical.duplicatePatient')}>
          <div className="space-y-2">
            {duplicateWarning.map((p) => (
              <div
                key={p.id}
                className="flex items-center justify-between rounded bg-amber-50 p-2"
              >
                <div>
                  <p className="font-medium">{p.fullName}</p>
                  <p className="text-xs text-amber-700">
                    {p.code} • {p.phone}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => navigate(`/patients/${p.id}`)}
                >
                  {t('uiClinical.openPatient')}
                </Button>
              </div>
            ))}
          </div>
        </Alert>
      )}

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        <Card title={t('uiClinical.basicInformation')}>
          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              label={t('uiClinical.fullName')}
              required
              error={errors.fullName?.message}
              {...register('fullName')}
            />
            <div className="grid gap-4 sm:col-span-2 sm:grid-cols-2">
              <Input
                label={t('uiClinical.dateOfBirth')}
                type="date"
                required
                max={todayIso}
                error={errors.dateOfBirth?.message}
                {...register('dateOfBirth')}
              />
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-surface-200">
                  {t('uiClinical.gender')}
                </label>
                <div className="mt-1.5 flex min-h-10 flex-wrap items-center gap-4">
                  <label className="flex items-center gap-2">
                    <input type="radio" value="male" {...register('gender')} />
                    <span className="text-sm">{t('uiClinical.male')}</span>
                  </label>
                  <label className="flex items-center gap-2">
                    <input type="radio" value="female" {...register('gender')} />
                    <span className="text-sm">{t('uiClinical.female')}</span>
                  </label>
                  <label className="flex items-center gap-2">
                    <input type="radio" value="other" {...register('gender')} />
                    <span className="text-sm">{t('uiClinical.other')}</span>
                  </label>
                </div>
              </div>
            </div>
            <Input
              label={t('uiClinical.primaryPhone')}
              type="tel"
              error={errors.phone?.message}
              {...register('phone')}
              onChange={(e) => {
                register('phone').onChange(e);
                handlePhoneSearch(e.target.value);
              }}
            />
            <Input
              label={t('uiClinical.email')}
              type="email"
              error={errors.email?.message}
              {...register('email')}
            />
            <p className="-mt-2 text-xs text-gray-500 dark:text-surface-400 sm:col-span-2">
              {t('uiClinical.contactDetailsRequired')}
            </p>
            <div className="sm:col-span-2">
              <Input label={t('uiClinical.address')} {...register('address')} />
            </div>
            <Input
              label={t('uiClinical.occupation')}
              {...register('occupation')}
            />
          </div>
          {age !== null && (
            <p className="mt-2 text-sm text-gray-500 dark:text-surface-400">
              {t('uiClinical.age')}: {age}
            </p>
          )}
        </Card>

        <Card
          title={
            age !== null && age < 12
              ? t('uiClinical.contactRequiredLabel')
              : t('uiClinical.contactPerson')
          }
        >
            <div className="grid gap-4 sm:grid-cols-2">
              <Input
                label={t('uiClinical.contactName')}
                required={age !== null && age < 12}
                error={errors.emergencyContactName?.message}
                {...register('emergencyContactName')}
              />
              <Input
                label={t('uiClinical.contactPhone')}
                type="tel"
                required={age !== null && age < 12}
                error={errors.emergencyContactPhone?.message}
                {...register('emergencyContactPhone')}
              />
            </div>
        </Card>

        <Card title={t('uiClinical.medicalInformation')}>
          {/* Allergies */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 dark:text-surface-200">
              {t('uiClinical.allergies')}
            </label>
            <div className="mt-1 flex flex-wrap gap-2">
              {allergies.map((tag, index) => (
                <span
                  key={`${tag}-${index}`}
                  className="inline-flex items-center gap-1 rounded-full bg-red-50 px-3 py-1 text-sm text-red-700"
                >
                  {tag}
                  <button
                    type="button"
                    aria-label={t('uiClinical.removeAllergy', { name: tag })}
                    onClick={() => removeTag(setAllergies, index)}
                    className="text-red-400 hover:text-red-600"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
            <div className="mt-2 grid grid-cols-[minmax(0,1fr)_auto] items-end gap-2">
              <Input
                label={t('uiClinical.addAllergy')}
                placeholder={t('uiClinical.allergyExample')}
                value={newTag.allergies}
                onChange={(e) =>
                  setNewTag((prev) => ({ ...prev, allergies: e.target.value }))
                }
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addTag(setAllergies, newTag.allergies, 'allergies');
                  }
                }}
                className="flex-1"
              />
              <Button
                type="button"
                aria-label={t('uiClinical.addAllergy')}
                variant="outline"
                size="sm"
                onClick={() => addTag(setAllergies, newTag.allergies, 'allergies')}
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Chronic Diseases */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 dark:text-surface-200">
              {t('uiClinical.chronicConditions')}
            </label>
            <div className="mt-1 flex flex-wrap gap-2">
              {chronicDiseases.map((tag, index) => (
                <span
                  key={`${tag}-${index}`}
                  className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-3 py-1 text-sm text-amber-700"
                >
                  {tag}
                  <button
                    type="button"
                    aria-label={t('uiClinical.removeCondition', { name: tag })}
                    onClick={() => removeTag(setChronicDiseases, index)}
                    className="text-amber-400 hover:text-amber-600"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
            <div className="mt-2 grid grid-cols-[minmax(0,1fr)_auto] items-end gap-2">
              <Input
                label={t('uiClinical.addChronicDisease')}
                placeholder={t('uiClinical.chronicDiseaseExample')}
                value={newTag.chronicDiseases}
                onChange={(e) =>
                  setNewTag((prev) => ({
                    ...prev,
                    chronicDiseases: e.target.value,
                  }))
                }
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addTag(setChronicDiseases, newTag.chronicDiseases, 'chronicDiseases');
                  }
                }}
                className="flex-1"
              />
              <Button
                type="button"
                aria-label={t('uiClinical.addChronicDisease')}
                variant="outline"
                size="sm"
                onClick={() =>
                  addTag(setChronicDiseases, newTag.chronicDiseases, 'chronicDiseases')
                }
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Current Medications */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-surface-200">
              {t('uiClinical.currentMedications')}
            </label>
            <div className="mt-1 flex flex-wrap gap-2">
              {currentMedications.map((tag, index) => (
                <span
                  key={`${tag}-${index}`}
                  className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-3 py-1 text-sm text-blue-700"
                >
                  {tag}
                  <button
                    type="button"
                    aria-label={t('uiClinical.removeMedication', { name: tag })}
                    onClick={() => removeTag(setCurrentMedications, index)}
                    className="text-blue-400 hover:text-blue-600"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
            <div className="mt-2 grid grid-cols-[minmax(0,1fr)_auto] items-end gap-2">
              <Input
                label={t('uiClinical.addMedication')}
                placeholder={t('uiClinical.medicationExample')}
                value={newTag.currentMedications}
                onChange={(e) =>
                  setNewTag((prev) => ({
                    ...prev,
                    currentMedications: e.target.value,
                  }))
                }
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addTag(
                      setCurrentMedications,
                      newTag.currentMedications,
                      'currentMedications',
                    );
                  }
                }}
                className="flex-1"
              />
              <Button
                type="button"
                aria-label={t('uiClinical.addMedication')}
                variant="outline"
                size="sm"
                onClick={() =>
                  addTag(
                    setCurrentMedications,
                    newTag.currentMedications,
                    'currentMedications',
                  )
                }
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </Card>

        <Card title={t('uiClinical.patientNotes')}>
          <Textarea
            label={t('uiClinical.patientNotes')}
            placeholder={t('uiClinical.patientNotesPlaceholder')}
            rows={3}
            {...register('notes')}
          />
        </Card>

        <div className="sticky bottom-4 z-10 flex justify-end gap-3 rounded-lg border border-gray-200 bg-white/95 dark:bg-surface-900/95 dark:border-surface-700 p-3 shadow-lg backdrop-blur">
          <Button variant="outline" type="button" onClick={cancelForm}>
            {t('uiClinical.cancel')}
          </Button>
          <Button
            type="submit"
            isLoading={isSubmitting || createMutation.isPending || updateMutation.isPending}
          >
            <Save className="h-4 w-4" />
            {t('uiClinical.save')}
          </Button>
        </div>
      </form>
    </div>
  );
}

export default PatientForm;

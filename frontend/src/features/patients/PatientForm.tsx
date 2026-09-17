import { useState, useEffect, useRef } from 'react';
import { useBlocker, useNavigate, useParams } from 'react-router-dom';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { differenceInYears, format, parseISO } from 'date-fns';
import { ArrowLeft, Save, Plus, X } from 'lucide-react';
import { patientsApi } from '@/features/patients/imperativeApi';
import { Button, Card, Input, Textarea, Alert } from '@/components/ui';
import { notify } from '@/components/ui/Toast';
import { getApiErrorMessage } from '@/lib/errors';
import type { CreatePatientPayload, UpdatePatientPayload, PatientLookupResult } from '@/types/patients';

// VN mobile numbers: 10 digits starting 0, next digit one of 3/5/7/8/9.
const VN_PHONE_REGEX = /^0(3|5|7|8|9)[0-9]{8}$/;
const vnPhone = z
  .string()
  .regex(VN_PHONE_REGEX, 'Số điện thoại không hợp lệ (VD: 0912345678)')
  .optional()
  .or(z.literal(''));

// Mirrors backend's isValidDob (patients/domain/patient-rules.ts): must be
// today or earlier, and no more than 150 years ago. Without this, picking a
// future birth year rendered a nonsensical negative age and could trigger
// the emergency-contact panel (age < 12 is true for negative ages too).
const isValidDob = (value: string) => {
  const dob = parseISO(value);
  if (Number.isNaN(dob.getTime())) return false;
  const now = new Date();
  const minDate = new Date(now.getFullYear() - 150, now.getMonth(), now.getDate());
  return dob >= minDate && dob <= now;
};

const patientSchema = z
  .object({
    fullName: z.string().min(1, 'Họ tên là bắt buộc'),
    dateOfBirth: z
      .string()
      .min(1, 'Ngày sinh là bắt buộc')
      .refine(isValidDob, 'Ngày sinh không hợp lệ (phải trong quá khứ, cách đây không quá 150 năm)'),
    gender: z.enum(['male', 'female', 'other']),
    phone: vnPhone,
    email: z.string().email('Email không hợp lệ').optional().or(z.literal('')),
    address: z.string().optional(),
    occupation: z.string().optional(),
    emergencyContactName: z.string().optional(),
    emergencyContactPhone: vnPhone,
    notes: z.string().optional(),
    allergies: z.array(z.string()).optional(),
    chronicDiseases: z.array(z.string()).optional(),
    currentMedications: z.array(z.string()).optional(),
  })
  .superRefine((data, ctx) => {
    if (!data.phone && !data.emergencyContactPhone) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['phone'],
        message: 'Cần ít nhất một số liên lạc',
      });
    }
    if (!data.phone && data.emergencyContactPhone && !data.emergencyContactName) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['emergencyContactName'],
        message: 'Cần tên người liên hệ',
      });
    }

    if (!isValidDob(data.dateOfBirth)) return;
    const age = differenceInYears(new Date(), parseISO(data.dateOfBirth));
    if (age < 12 && !data.emergencyContactName) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['emergencyContactName'],
        message: 'Bệnh nhân dưới 12 tuổi cần tên người liên hệ',
      });
    }
    if (age < 12 && !data.emergencyContactPhone) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['emergencyContactPhone'],
        message: 'Bệnh nhân dưới 12 tuổi cần SĐT người liên hệ',
      });
    }
  });

type PatientFormData = z.infer<typeof patientSchema>;

export function PatientForm() {
  const navigate = useNavigate();
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

  const { data: patient, isLoading } = useQuery({
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
      notify.error(getApiErrorMessage(err, 'Không thể tạo bệnh nhân'));
    },
  });

  const updateMutation = useMutation({
    mutationFn: (data: UpdatePatientPayload) => patientsApi.update(patientId!, data),
    onSuccess: (data) => {
      saved.current = true;
      navigate(`/patients/${data.id}`);
    },
    onError: (err) => {
      notify.error(getApiErrorMessage(err, 'Không thể lưu thông tin bệnh nhân'));
    },
  });

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting, isDirty },
    watch,
    reset,
  } = useForm<PatientFormData>({
    resolver: zodResolver(patientSchema),
    defaultValues: {
      gender: 'male',
    },
  });

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
      // Backend treats any dob present in the payload as an attempt to
      // change it and 409s once the patient has encounters — omit it here
      // when the user didn't actually touch the date field, instead of
      // resubmitting the same value on every unrelated edit.
      const dobUnchanged =
        !!patient && data.dateOfBirth === patient.dateOfBirth.split('T')[0];
      const { dateOfBirth, ...rest } = data;
      const payload: UpdatePatientPayload = {
        ...rest,
        ...(dobUnchanged ? {} : { dateOfBirth }),
        allergies,
        chronicDiseases,
        currentMedications,
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
    if (window.confirm('Bạn có thay đổi chưa lưu. Vẫn rời trang?')) blocker.proceed();
    else blocker.reset();
  }, [blocker]);

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
    return <div>Đang tải...</div>;
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" onClick={cancelForm} aria-label="Quay lại">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h1 className="text-2xl font-semibold text-gray-900">
          {patientId ? 'Sửa thông tin bệnh nhân' : 'Tạo bệnh nhân mới'}
        </h1>
      </div>

      {duplicateWarning.length > 0 && (
        <Alert type="warning" title="Phát hiện bệnh nhân trùng lặp">
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
                  Mở bệnh nhân
                </Button>
              </div>
            ))}
          </div>
        </Alert>
      )}

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        <Card title="Thông tin cơ bản">
          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              label="Họ và tên"
              required
              error={errors.fullName?.message}
              {...register('fullName')}
            />
            <div className="grid grid-cols-2 gap-4">
              <Input
                label="Ngày sinh"
                type="date"
                required
                max={todayIso}
                error={errors.dateOfBirth?.message}
                {...register('dateOfBirth')}
              />
              <div>
                <label className="block text-sm font-medium text-gray-700">
                  Giới tính
                </label>
                <div className="mt-1.5 flex gap-4">
                  <label className="flex items-center gap-2">
                    <input type="radio" value="male" {...register('gender')} />
                    <span className="text-sm">Nam</span>
                  </label>
                  <label className="flex items-center gap-2">
                    <input type="radio" value="female" {...register('gender')} />
                    <span className="text-sm">Nữ</span>
                  </label>
                  <label className="flex items-center gap-2">
                    <input type="radio" value="other" {...register('gender')} />
                    <span className="text-sm">Khác</span>
                  </label>
                </div>
              </div>
            </div>
            <Input
              label="SĐT chính"
              type="tel"
              error={errors.phone?.message}
              {...register('phone')}
              onChange={(e) => {
                register('phone').onChange(e);
                handlePhoneSearch(e.target.value);
              }}
            />
            <Input
              label="Email"
              type="email"
              error={errors.email?.message}
              {...register('email')}
            />
            <p className="-mt-2 text-xs text-gray-500 sm:col-span-2">
              Cần ít nhất SĐT chính hoặc SĐT người liên hệ.
            </p>
            <Input
              label="Địa chỉ"
              className="sm:col-span-2"
              {...register('address')}
            />
            <Input
              label="Nghề nghiệp"
              {...register('occupation')}
            />
          </div>
          {age !== null && (
            <p className="mt-2 text-sm text-gray-500">
              Tuổi: {age} tuổi
            </p>
          )}
        </Card>

        <Card
          title={
            age !== null && age < 12
              ? 'Người liên hệ (bắt buộc với bệnh nhân dưới 12 tuổi)'
              : 'Người liên hệ'
          }
        >
            <div className="grid gap-4 sm:grid-cols-2">
              <Input
                label="Tên người liên hệ"
                required={age !== null && age < 12}
                error={errors.emergencyContactName?.message}
                {...register('emergencyContactName')}
              />
              <Input
                label="SĐT người liên hệ"
                type="tel"
                required={age !== null && age < 12}
                error={errors.emergencyContactPhone?.message}
                {...register('emergencyContactPhone')}
              />
            </div>
        </Card>

        <Card title="Thông tin y tế">
          {/* Allergies */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700">
              Dị ứng
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
                    aria-label={`Xóa dị ứng ${tag}`}
                    onClick={() => removeTag(setAllergies, index)}
                    className="text-red-400 hover:text-red-600"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
            <div className="mt-2 flex gap-2">
              <Input
                label="Thêm dị ứng"
                placeholder="VD: Penicillin"
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
                aria-label="Thêm dị ứng"
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
            <label className="block text-sm font-medium text-gray-700">
              Bệnh mãn tính
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
                    aria-label={`Xóa bệnh mãn tính ${tag}`}
                    onClick={() => removeTag(setChronicDiseases, index)}
                    className="text-amber-400 hover:text-amber-600"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
            <div className="mt-2 flex gap-2">
              <Input
                label="Thêm bệnh mãn tính"
                placeholder="VD: Tăng huyết áp"
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
                aria-label="Thêm bệnh mãn tính"
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
            <label className="block text-sm font-medium text-gray-700">
              Thuốc đang dùng
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
                    aria-label={`Xóa thuốc đang dùng ${tag}`}
                    onClick={() => removeTag(setCurrentMedications, index)}
                    className="text-blue-400 hover:text-blue-600"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
            <div className="mt-2 flex gap-2">
              <Input
                label="Thêm thuốc đang dùng"
                placeholder="VD: Amlodipine 5mg"
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
                aria-label="Thêm thuốc đang dùng"
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

        <Card title="Ghi chú">
          <Textarea
            label="Ghi chú bệnh nhân"
            placeholder="Ghi chú thêm về bệnh nhân..."
            rows={3}
            {...register('notes')}
          />
        </Card>

        <div className="sticky bottom-4 z-10 flex justify-end gap-3 rounded-lg border border-gray-200 bg-white/95 p-3 shadow-lg backdrop-blur">
          <Button variant="outline" type="button" onClick={cancelForm}>
            Hủy
          </Button>
          <Button
            type="submit"
            isLoading={isSubmitting || createMutation.isPending || updateMutation.isPending}
          >
            <Save className="h-4 w-4" />
            Lưu
          </Button>
        </div>
      </form>
    </div>
  );
}

export default PatientForm;

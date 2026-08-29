import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { ArrowLeft, Save, Plus, X } from 'lucide-react';
import { patientsApi } from '@/features/patients/imperativeApi';
import { Button, Card, Input, Textarea, Alert } from '@/components/ui';
import type { CreatePatientPayload, PatientLookupResult } from '@/types/patients';

const patientSchema = z.object({
  fullName: z.string().min(1, 'Họ tên là bắt buộc'),
  dateOfBirth: z.string().min(1, 'Ngày sinh là bắt buộc'),
  gender: z.enum(['male', 'female', 'other']),
  phone: z.string().optional(),
  email: z.string().email('Email không hợp lệ').optional().or(z.literal('')),
  address: z.string().optional(),
  occupation: z.string().optional(),
  emergencyContactName: z.string().optional(),
  emergencyContactPhone: z.string().optional(),
  notes: z.string().optional(),
  allergies: z.array(z.string()).optional(),
  chronicDiseases: z.array(z.string()).optional(),
  currentMedications: z.array(z.string()).optional(),
});

type PatientFormData = z.infer<typeof patientSchema>;

interface PatientFormProps {
  patientId?: string;
}

export function PatientForm({ patientId }: PatientFormProps) {
  const navigate = useNavigate();
  const [allergies, setAllergies] = useState<string[]>([]);
  const [chronicDiseases, setChronicDiseases] = useState<string[]>([]);
  const [currentMedications, setCurrentMedications] = useState<string[]>([]);
  const [duplicateWarning, setDuplicateWarning] = useState<PatientLookupResult[]>([]);
  const [newTag, setNewTag] = useState({ allergies: '', chronicDiseases: '', currentMedications: '' });

  const { data: patient, isLoading } = useQuery({
    queryKey: ['patient', patientId],
    queryFn: () => patientsApi.get(patientId!),
    enabled: !!patientId,
  });

  const createMutation = useMutation({
    mutationFn: (data: CreatePatientPayload) => patientsApi.create(data),
    onSuccess: (data) => {
      navigate(`/patients/${data.id}`);
    },
  });

  const updateMutation = useMutation({
    mutationFn: (data: CreatePatientPayload) => patientsApi.update(patientId!, data),
    onSuccess: (data) => {
      navigate(`/patients/${data.id}`);
    },
  });

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
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
    if (value.trim()) {
      setter((prev) => [...prev, value.trim()]);
      setNewTag((prev) => ({ ...prev, [field]: '' }));
    }
  };

  const removeTag = (
    setter: React.Dispatch<React.SetStateAction<string[]>>,
    tag: string,
  ) => {
    setter((prev) => prev.filter((t) => t !== tag));
  };

  const onSubmit = (data: PatientFormData) => {
    const payload: CreatePatientPayload = {
      ...data,
      allergies,
      chronicDiseases,
      currentMedications,
    };
    if (patientId) {
      updateMutation.mutate(payload);
    } else {
      createMutation.mutate(payload);
    }
  };

  const dob = watch('dateOfBirth');
  const age = dob
    ? Math.floor(
        (Date.now() - new Date(dob).getTime()) / (365.25 * 24 * 60 * 60 * 1000),
      )
    : null;

  if (patientId && isLoading) {
    return <div>Đang tải...</div>;
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" onClick={() => navigate(-1)}>
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

        {age !== null && age < 12 && (
          <Card title="Người liên hệ khẩn cấp (bệnh nhân dưới 12 tuổi)">
            <div className="grid gap-4 sm:grid-cols-2">
              <Input
                label="Tên người liên hệ"
                {...register('emergencyContactName')}
              />
              <Input
                label="SĐT người liên hệ"
                type="tel"
                {...register('emergencyContactPhone')}
              />
            </div>
          </Card>
        )}

        <Card title="Thông tin y tế">
          {/* Allergies */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700">
              Dị ứng
            </label>
            <div className="mt-1 flex flex-wrap gap-2">
              {allergies.map((tag) => (
                <span
                  key={tag}
                  className="inline-flex items-center gap-1 rounded-full bg-red-50 px-3 py-1 text-sm text-red-700"
                >
                  {tag}
                  <button
                    type="button"
                    onClick={() => removeTag(setAllergies, tag)}
                    className="text-red-400 hover:text-red-600"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
            <div className="mt-2 flex gap-2">
              <Input
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
              {chronicDiseases.map((tag) => (
                <span
                  key={tag}
                  className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-3 py-1 text-sm text-amber-700"
                >
                  {tag}
                  <button
                    type="button"
                    onClick={() => removeTag(setChronicDiseases, tag)}
                    className="text-amber-400 hover:text-amber-600"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
            <div className="mt-2 flex gap-2">
              <Input
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
              {currentMedications.map((tag) => (
                <span
                  key={tag}
                  className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-3 py-1 text-sm text-blue-700"
                >
                  {tag}
                  <button
                    type="button"
                    onClick={() => removeTag(setCurrentMedications, tag)}
                    className="text-blue-400 hover:text-blue-600"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
            <div className="mt-2 flex gap-2">
              <Input
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
            placeholder="Ghi chú thêm về bệnh nhân..."
            rows={3}
            {...register('notes')}
          />
        </Card>

        <div className="flex justify-end gap-3">
          <Button variant="outline" type="button" onClick={() => navigate(-1)}>
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

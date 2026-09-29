import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Pencil, Plus, Printer } from 'lucide-react';
import { medicalRecordsApi } from '@/features/medical-records/imperativeApi';
import { Button, Modal, Input, Textarea } from '@/components/ui';
import { notify } from '@/components/ui/Toast';
import { getApiErrorCode, getApiErrorDetails, getApiErrorMessage } from '@/lib/errors';
import type {
  Encounter,
  Prescription,
  PrescriptionAllergyConflict,
  PrescriptionItem,
  CreatePrescriptionPayload,
} from '@/types/medical-records';
import { useAuthStore } from '@/stores/authStore';

const MIN_OVERRIDE_REASON = 10;

interface PrescriptionsTabProps {
  encounter: Encounter;
}

export function PrescriptionsTab({ encounter }: PrescriptionsTabProps) {
  const queryClient = useQueryClient();
  const [showAddModal, setShowAddModal] = useState(false);
  const [diagnosis, setDiagnosis] = useState('');
  const [instructions, setInstructions] = useState('');
  const [followUpNote, setFollowUpNote] = useState('');
  const [items, setItems] = useState<Omit<PrescriptionItem, 'id' | 'prescriptionId'>[]>([]);
  // Set while editing: the version echoed back so the save replaces the
  // current prescription (all lines) instead of being rejected as a duplicate.
  const [editingVersion, setEditingVersion] = useState<number | undefined>();
  // Drug/allergy pairs from a 409 PRESCRIPTION_ALLERGY_CONFLICT; non-null
  // shows the red warning in place of the form.
  const [allergyConflicts, setAllergyConflicts] = useState<PrescriptionAllergyConflict[] | null>(
    null,
  );
  const [overrideReason, setOverrideReason] = useState('');

  const createMutation = useMutation({
    mutationFn: (payload: CreatePrescriptionPayload) =>
      medicalRecordsApi.upsertPrescription(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['encounter', encounter.id] });
      resetForm();
    },
    onError: (err) => {
      if (getApiErrorCode(err) === 'PRESCRIPTION_ALLERGY_CONFLICT') {
        const details = getApiErrorDetails<{ conflicts?: PrescriptionAllergyConflict[] }>(err);
        setAllergyConflicts(details?.conflicts ?? []);
        return;
      }
      notify.error(getApiErrorMessage(err, 'Không thể lưu đơn thuốc'));
    },
  });

  const resetForm = () => {
    setShowAddModal(false);
    setDiagnosis('');
    setInstructions('');
    setFollowUpNote('');
    setItems([]);
    setEditingVersion(undefined);
    setAllergyConflicts(null);
    setOverrideReason('');
  };

  const openEdit = (prescription: Prescription) => {
    setDiagnosis(prescription.diagnosis ?? '');
    setInstructions(prescription.instructions ?? '');
    setFollowUpNote(prescription.followUpNote ?? '');
    setItems(
      (prescription.items ?? prescription.lines ?? []).map((item) => ({
        drugName: item.drugName || item.medicationName || '',
        dosage: item.dosage ?? '',
        frequency: item.frequency ?? '',
        quantity: item.quantity,
        unit: item.unit,
        durationDays: item.durationDays,
        instructions: item.instructions ?? undefined,
      })),
    );
    setEditingVersion(prescription.version ?? 0);
    setShowAddModal(true);
  };

  // Back to the form to change the drugs; the reason is dropped so a new
  // conflict has to be confirmed again.
  const backToForm = () => {
    setAllergyConflicts(null);
    setOverrideReason('');
  };

  const addItem = () => {
    setItems([
      ...items,
      {
        drugName: '',
        dosage: '',
        frequency: '',
        quantity: undefined,
        unit: 'viên',
        durationDays: undefined,
        instructions: undefined,
      },
    ]);
  };

  const updateItem = (index: number, field: string, value: string | number | undefined) => {
    const newItems = [...items];
    newItems[index] = { ...newItems[index], [field]: value };
    setItems(newItems);
  };

  const removeItem = (index: number) => {
    setItems(items.filter((_, i) => i !== index));
  };

  const handleSubmit = (allergyOverrideReason?: string) => {
    // Forward all four patient-facing fields. `notes` is a fallback for the
    // legacy `note` so callers that only set `note` still see it on the
    // printed sheet.
    createMutation.mutate({
      encounterId: encounter.id,
      diagnosis,
      instructions,
      followUpNote,
      notes: followUpNote,
      items,
      version: editingVersion,
      allergyOverrideReason,
    });
  };

  const prescriptions = encounter.prescriptions || [];
  const canWrite = useAuthStore((s) => s.hasPermission('prescription.write'));
  const isEditable = encounter.status === 'in_progress' && canWrite;

  return (
    <div className="space-y-4">
      {prescriptions.length > 0 ? (
        prescriptions.map((prescription) => (
          <div key={prescription.id} className="print-document rounded-lg border border-gray-200 p-4">
            <div className="mb-4 hidden border-b border-gray-300 pb-3 text-center print:block">
              <p className="text-lg font-bold">NHA KHOA GENSMILE</p>
              <p className="text-sm">ĐƠN THUỐC</p>
              <p className="mt-2 text-left text-sm">
                Bệnh nhân: <strong>{encounter.patientName}</strong> ({encounter.patientCode})
              </p>
            </div>
            <div className="flex items-start justify-between">
              <div>
                {prescription.diagnosis && (
                  <p className="font-medium text-gray-900">Chẩn đoán: {prescription.diagnosis}</p>
                )}
                <p className="text-sm text-gray-500">Kê bởi: {prescription.prescribedByUserName}</p>
              </div>
              <div className="no-print flex items-center gap-1">
                {isEditable && (
                  <Button variant="outline" size="sm" onClick={() => openEdit(prescription)}>
                    <Pencil className="h-4 w-4" />
                    Sửa đơn
                  </Button>
                )}
                <button
                  type="button"
                  onClick={() => window.print()}
                  aria-label="In đơn thuốc"
                  className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                >
                  <Printer className="h-4 w-4" />
                </button>
              </div>
            </div>

            {prescription.items && prescription.items.length > 0 && (
              <table className="mt-4 w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 text-left">
                    <th className="pb-2 font-medium text-gray-600">Thuốc</th>
                    <th className="pb-2 font-medium text-gray-600">Liều</th>
                    <th className="pb-2 font-medium text-gray-600">Tần suất</th>
                    <th className="pb-2 font-medium text-gray-600">Số lượng</th>
                    <th className="pb-2 font-medium text-gray-600">Thời gian</th>
                  </tr>
                </thead>
                <tbody>
                  {prescription.items.map((item) => (
                    <tr key={item.id} className="border-b border-gray-50">
                      <td className="py-2 font-medium">{item.medicationName ?? item.drugName}</td>
                      <td className="py-2">{item.dosage}</td>
                      <td className="py-2">{item.frequency}</td>
                      <td className="py-2">
                        {item.quantity ? `${item.quantity} ${item.unit || 'viên'}` : '-'}
                      </td>
                      <td className="py-2">
                        {item.durationDays ? `${item.durationDays} ngày` : '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {prescription.instructions && (
              <p className="mt-3 text-sm text-gray-600">
                <span className="font-medium">Hướng dẫn:</span> {prescription.instructions}
              </p>
            )}

            {prescription.followUpNote && (
              <p className="mt-2 text-sm text-amber-600">
                <span className="font-medium">Tái khám:</span> {prescription.followUpNote}
              </p>
            )}
          </div>
        ))
      ) : (
        <p className="text-sm text-gray-500">Chưa có đơn thuốc nào</p>
      )}

      {/* Add Button */}
      {isEditable && prescriptions.length === 0 && (
        <Button onClick={() => setShowAddModal(true)}>
          <Plus className="h-4 w-4" />
          Tạo đơn thuốc
        </Button>
      )}

      {/* Add / edit modal — hidden (state kept) while the allergy warning is up */}
      <Modal
        isOpen={showAddModal && allergyConflicts === null}
        onClose={resetForm}
        title={editingVersion !== undefined ? 'Sửa đơn thuốc' : 'Tạo đơn thuốc'}
        size="lg"
      >
        <div className="space-y-4">
          <Input
            label="Chẩn đoán"
            value={diagnosis}
            onChange={(e) => setDiagnosis(e.target.value)}
            placeholder="VD: Viêm quanh răng"
          />

          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700">
              Thuốc
            </label>
            {items.map((item, index) => (
              <div key={index} className="mb-3 rounded border border-gray-200 p-3">
                <div className="grid grid-cols-2 gap-3">
                  <Input
                    label="Tên thuốc"
                    value={item.drugName}
                    maxLength={255}
                    onChange={(e) => updateItem(index, 'drugName', e.target.value)}
                    placeholder="VD: Amoxicillin 500mg"
                  />
                  <Input
                    label="Liều"
                    value={item.dosage}
                    maxLength={100}
                    onChange={(e) => updateItem(index, 'dosage', e.target.value)}
                    placeholder="VD: 500mg"
                  />
                  <Input
                    label="Tần suất"
                    value={item.frequency}
                    maxLength={100}
                    onChange={(e) => updateItem(index, 'frequency', e.target.value)}
                    placeholder="VD: 3 lần/ngày"
                  />
                  <div className="grid grid-cols-3 gap-2">
                    <Input
                      label="Số lượng"
                      type="number"
                      min="1"
                      max="10000"
                      value={item.quantity?.toString() || ''}
                      onChange={(e) =>
                        updateItem(index, 'quantity', Math.min(parseInt(e.target.value) || 0, 10000) || undefined)
                      }
                      placeholder="15"
                    />
                    <Input
                      label="Đơn vị"
                      value={item.unit || ''}
                      maxLength={50}
                      onChange={(e) => updateItem(index, 'unit', e.target.value)}
                      placeholder="viên"
                    />
                    <Input
                      label="Số ngày"
                      type="number"
                      min="1"
                      max="365"
                      value={item.durationDays?.toString() || ''}
                      onChange={(e) => updateItem(index, 'durationDays', parseInt(e.target.value) || undefined)}
                      placeholder="5"
                    />
                  </div>
                </div>
                <div className="mt-2 flex justify-end">
                  <button
                    type="button"
                    onClick={() => removeItem(index)}
                    className="text-sm text-red-600 hover:text-red-700"
                  >
                    Xóa
                  </button>
                </div>
              </div>
            ))}
            <Button variant="outline" size="sm" onClick={addItem}>
              <Plus className="h-4 w-4" />
              Thêm thuốc
            </Button>
          </div>

          <Textarea
            label="Hướng dẫn sử dụng"
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
            placeholder="VD: Uống sau ăn..."
            rows={2}
          />

          <Input
            label="Ghi chú tái khám"
            value={followUpNote}
            onChange={(e) => setFollowUpNote(e.target.value)}
            placeholder="VD: Sau 1 tuần nếu không giảm"
          />

          <div className="flex justify-end gap-3 pt-4 border-t border-gray-100">
            <Button variant="outline" onClick={resetForm}>
              Hủy
            </Button>
            <Button
              onClick={() => handleSubmit()}
              isLoading={createMutation.isPending}
              disabled={items.length === 0 || items.some((item) => !item.drugName.trim())}
            >
              {editingVersion !== undefined ? 'Lưu đơn thuốc' : 'Tạo đơn thuốc'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Allergy conflict (409 PRESCRIPTION_ALLERGY_CONFLICT) */}
      <Modal
        isOpen={showAddModal && allergyConflicts !== null}
        onClose={backToForm}
        title={
          <span className="flex items-center gap-2 text-red-700">
            <AlertTriangle className="h-5 w-5" aria-hidden="true" />
            Cảnh báo dị ứng thuốc
          </span>
        }
        size="md"
      >
        <div className="space-y-4">
          <div role="alert" className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800">
            <p className="font-medium">Bệnh nhân có ghi nhận dị ứng trùng với thuốc trong đơn:</p>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              {(allergyConflicts ?? []).map((c, i) => (
                <li key={`${c.lineIndex}-${c.allergy}-${i}`}>
                  <strong>{c.drugName}</strong> — dị ứng: <strong>{c.allergy}</strong>
                  {c.drugClass ? ` (${c.drugClass})` : ''}
                </li>
              ))}
            </ul>
          </div>
          <Textarea
            label="Lý do vẫn kê đơn"
            value={overrideReason}
            onChange={(e) => setOverrideReason(e.target.value)}
            placeholder="VD: Đã test da âm tính, bệnh nhân đồng ý và được theo dõi"
            rows={3}
            hint={`Tối thiểu ${MIN_OVERRIDE_REASON} ký tự. Lý do được ghi vào nhật ký kiểm toán.`}
          />
          <div className="flex justify-end gap-3 border-t border-gray-100 pt-4">
            <Button variant="outline" onClick={backToForm}>
              Quay lại sửa đơn
            </Button>
            <Button
              variant="danger"
              onClick={() => handleSubmit(overrideReason.trim())}
              isLoading={createMutation.isPending}
              disabled={overrideReason.trim().length < MIN_OVERRIDE_REASON}
            >
              Vẫn kê đơn
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

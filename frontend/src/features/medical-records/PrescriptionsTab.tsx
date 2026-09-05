import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Printer } from 'lucide-react';
import { medicalRecordsApi } from '@/features/medical-records/imperativeApi';
import { Button, Modal, Input, Textarea } from '@/components/ui';
import { notify } from '@/components/ui/Toast';
import { getApiErrorMessage } from '@/lib/errors';
import type { Encounter, PrescriptionItem, CreatePrescriptionPayload } from '@/types/medical-records';

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

  const createMutation = useMutation({
    mutationFn: (payload: CreatePrescriptionPayload) =>
      medicalRecordsApi.upsertPrescription(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['encounter', encounter.id] });
      resetForm();
    },
    onError: (err) => {
      notify.error(getApiErrorMessage(err, 'Không thể lưu đơn thuốc'));
    },
  });

  const resetForm = () => {
    setShowAddModal(false);
    setDiagnosis('');
    setInstructions('');
    setFollowUpNote('');
    setItems([]);
  };

  const addItem = () => {
    setItems([
      ...items,
      {
        drugName: '',
        medicationName: '',
        dosage: '',
        frequency: '',
        quantity: undefined,
        durationDays: undefined,
        duration: undefined,
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

  const handleSubmit = () => {
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
    });
  };

  const prescriptions = encounter.prescriptions || [];
  const isCompleted = encounter.status === 'completed';

  return (
    <div className="space-y-4">
      {prescriptions.length > 0 ? (
        prescriptions.map((prescription) => (
          <div key={prescription.id} className="rounded-lg border border-gray-200 p-4">
            <div className="flex items-start justify-between">
              <div>
                {prescription.diagnosis && (
                  <p className="font-medium text-gray-900">Chẩn đoán: {prescription.diagnosis}</p>
                )}
                <p className="text-sm text-gray-500">Kê bởi: {prescription.prescribedByUserName}</p>
              </div>
              {!isCompleted && (
                <div className="flex gap-2">
                  <button className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600">
                    <Printer className="h-4 w-4" />
                  </button>
                </div>
              )}
            </div>

            {prescription.items && prescription.items.length > 0 && (
              <table className="mt-4 w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 text-left">
                    <th className="pb-2 font-medium text-gray-600">Thuốc</th>
                    <th className="pb-2 font-medium text-gray-600">Liều</th>
                    <th className="pb-2 font-medium text-gray-600">Tần suất</th>
                    <th className="pb-2 font-medium text-gray-600">Số lượng</th>
                  </tr>
                </thead>
                <tbody>
                  {prescription.items.map((item) => (
                    <tr key={item.id} className="border-b border-gray-50">
                      <td className="py-2 font-medium">{item.medicationName}</td>
                      <td className="py-2">{item.dosage}</td>
                      <td className="py-2">{item.frequency}</td>
                      <td className="py-2">
                        {item.quantity ? `${item.quantity} ${item.duration || 'viên'}` : '-'}
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
      {!isCompleted && (
        <Button onClick={() => setShowAddModal(true)}>
          <Plus className="h-4 w-4" />
          Tạo đơn thuốc
        </Button>
      )}

      {/* Add Modal */}
      <Modal
        isOpen={showAddModal}
        onClose={resetForm}
        title="Tạo đơn thuốc"
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
                    value={item.medicationName}
                    onChange={(e) => updateItem(index, 'medicationName', e.target.value)}
                    placeholder="VD: Amoxicillin 500mg"
                  />
                  <Input
                    label="Liều"
                    value={item.dosage}
                    onChange={(e) => updateItem(index, 'dosage', e.target.value)}
                    placeholder="VD: 500mg"
                  />
                  <Input
                    label="Tần suất"
                    value={item.frequency}
                    onChange={(e) => updateItem(index, 'frequency', e.target.value)}
                    placeholder="VD: 3 lần/ngày"
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <Input
                      label="Số lượng"
                      type="number"
                      value={item.quantity?.toString() || ''}
                      onChange={(e) => updateItem(index, 'quantity', parseInt(e.target.value) || undefined)}
                      placeholder="15"
                    />
                    <Input
                      label="Thời gian"
                      value={item.duration || ''}
                      onChange={(e) => updateItem(index, 'duration', e.target.value)}
                      placeholder="5 ngày"
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
              onClick={handleSubmit}
              isLoading={createMutation.isPending}
              disabled={items.length === 0 || !items[0]?.medicationName}
            >
              Tạo đơn thuốc
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { formatCurrency } from '@/lib/format';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import { medicalRecordsApi } from '@/features/medical-records/imperativeApi';
import { Button, Modal, Input, Textarea } from '@/components/ui';
import type { Encounter, Treatment, CreateTreatmentPayload } from '@/types/medical-records';

interface TreatmentsTabProps {
  encounter: Encounter;
  initialToothNumber?: number | string | null;
  onClearInitialTooth?: () => void;
  onViewToothDetail?: (toothNumber: number) => void;
}

export function TreatmentsTab({ encounter, initialToothNumber, onClearInitialTooth, onViewToothDetail }: TreatmentsTabProps) {
  const queryClient = useQueryClient();
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingTreatment, setEditingTreatment] = useState<Treatment | null>(null);

  const [toothNumber, setToothNumber] = useState('');
  const [procedureCode, setProcedureCode] = useState('');
  const [procedureName, setProcedureName] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [unitPrice, setUnitPrice] = useState('');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (initialToothNumber === undefined || initialToothNumber === null) return;
    setShowAddModal(true);
    setEditingTreatment(null);
    setToothNumber(String(initialToothNumber));
    setProcedureCode('');
    setProcedureName('');
    setQuantity('1');
    setUnitPrice('');
    setNotes('');
    onClearInitialTooth?.();
  }, [initialToothNumber, onClearInitialTooth]);

  const createMutation = useMutation({
    mutationFn: (payload: CreateTreatmentPayload) => medicalRecordsApi.createTreatment(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['encounter', encounter.id] });
      resetForm();
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Partial<CreateTreatmentPayload> }) =>
      medicalRecordsApi.updateTreatment(encounter.id, id, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['encounter', encounter.id] });
      setEditingTreatment(null);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => medicalRecordsApi.deleteTreatment(encounter.id, id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['encounter', encounter.id] });
    },
  });

  const resetForm = () => {
    setShowAddModal(false);
    setToothNumber('');
    setProcedureCode('');
    setProcedureName('');
    setQuantity('1');
    setUnitPrice('');
    setNotes('');
  };

  const openEditModal = (treatment: Treatment) => {
    setEditingTreatment(treatment);
    setToothNumber(String(treatment.toothNumber));
    setProcedureCode(treatment.procedureCode ?? '');
    setProcedureName(treatment.procedureName ?? '');
    setQuantity(treatment.quantity.toString());
    setUnitPrice((treatment.unitPrice ?? treatment.priceCents).toString());
    setNotes(treatment.notes ?? '');
  };

  const handleSubmit = () => {
    if (editingTreatment) {
      updateMutation.mutate({
        id: editingTreatment.id,
        payload: {
          toothNumber,
          treatmentCode: procedureCode,
          treatmentName: procedureName,
          quantity: parseInt(quantity),
          priceCents: parseInt(unitPrice),
          description: notes,
        },
      });
    } else {
      createMutation.mutate({
        encounterId: encounter.id,
        toothNumber,
        treatmentCode: procedureCode,
        treatmentName: procedureName,
        quantity: parseInt(quantity),
        priceCents: parseInt(unitPrice),
        description: notes,
      });
    }
  };

  const treatments = encounter.treatments || [];
  const totalTreatment = treatments.reduce((sum, t) => sum + (t.total ?? 0), 0);
  const isCompleted = encounter.status === 'completed';

  // Group treatments by tooth
  const treatmentsByTooth = treatments.reduce((acc, treatment) => {
    if (!acc[treatment.toothNumber]) {
      acc[treatment.toothNumber] = [];
    }
    acc[treatment.toothNumber].push(treatment);
    return acc;
  }, {} as Record<string, Treatment[]>);

  return (
    <div className="space-y-4">
      {Object.entries(treatmentsByTooth).length > 0 ? (
        Object.entries(treatmentsByTooth).map(([tooth, toothTreatments]) => (
          <div key={tooth} className="rounded-lg border border-gray-200 p-4">
            <div className="mb-3 flex items-center justify-between gap-2">
              <h4 className="font-medium text-gray-900">Răng {tooth}</h4>
              {onViewToothDetail && (
                <button
                  type="button"
                  onClick={() => onViewToothDetail(Number(tooth))}
                  className="text-xs text-primary-700 hover:underline"
                >
                  Xem lịch sử răng →
                </button>
              )}
            </div>
            <div className="space-y-2">
              {toothTreatments.map((treatment) => (
                <div
                  key={treatment.id}
                  className="flex items-start justify-between rounded bg-gray-50 p-3"
                >
                  <div>
                    <p className="font-medium text-gray-900">{treatment.procedureName}</p>
                    <p className="text-sm text-gray-500">Mã: {treatment.procedureCode}</p>
                    <p className="text-sm text-gray-600">
                      {treatment.quantity} x {formatCurrency(treatment.unitPrice)} ={' '}
                      <span className="font-medium">{formatCurrency(treatment.total)}</span>
                    </p>
                    {treatment.notes && (
                      <p className="mt-1 text-xs text-gray-500">{treatment.notes}</p>
                    )}
                  </div>
                  {!isCompleted && (
                    <div className="flex gap-2">
                      <button
                        onClick={() => openEditModal(treatment)}
                        className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => deleteMutation.mutate(treatment.id)}
                        className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-600"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))
      ) : (
        <p className="text-sm text-gray-500">Chưa có điều trị nào</p>
      )}

      {/* Total */}
      {treatments.length > 0 && (
        <div className="flex items-center justify-between rounded-lg border border-gray-200 bg-gray-50 p-4">
          <span className="font-medium text-gray-900">Tổng điều trị</span>
          <span className="text-xl font-semibold text-gray-900">
            {formatCurrency(totalTreatment)}
          </span>
        </div>
      )}

      {/* Add Button */}
      {!isCompleted && (
        <Button onClick={() => setShowAddModal(true)}>
          <Plus className="h-4 w-4" />
          Thêm điều trị
        </Button>
      )}

      {/* Add/Edit Modal */}
      <Modal
        isOpen={showAddModal || !!editingTreatment}
        onClose={resetForm}
        title={editingTreatment ? 'Sửa điều trị' : 'Thêm điều trị'}
      >
        <div className="space-y-4">
          <Input
            label="Số răng"
            value={toothNumber}
            onChange={(e) => setToothNumber(String(e.target.value))}
            placeholder="VD: 16, 26, 46"
          />
          <Input
            label="Mã thủ thuật"
            value={procedureCode}
            onChange={(e) => setProcedureCode(e.target.value)}
            placeholder="VD: D2392"
          />
          <Input
            label="Tên thủ thuật"
            value={procedureName}
            onChange={(e) => setProcedureName(e.target.value)}
            placeholder="VD: Hàn răng Composite"
          />
          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Số lượng"
              type="number"
              min="1"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
            />
            <Input
              label="Đơn giá (VND)"
              type="number"
              value={unitPrice}
              onChange={(e) => setUnitPrice(e.target.value)}
              placeholder="350000"
            />
          </div>
          <Textarea
            label="Ghi chú"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
          />
          <div className="flex justify-end gap-3 pt-4 border-t border-gray-100">
            <Button variant="outline" onClick={resetForm}>
              Hủy
            </Button>
            <Button
              onClick={handleSubmit}
              isLoading={createMutation.isPending || updateMutation.isPending}
              disabled={!toothNumber || !procedureName || !unitPrice}
            >
              {editingTreatment ? 'Lưu' : 'Thêm'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

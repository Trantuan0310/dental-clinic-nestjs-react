import { useEffect, useState } from 'react';
import { clinicToday } from '@/lib/clinicTime';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { formatCurrency } from '@/lib/format';
import { Plus, Pencil, Trash2, X } from 'lucide-react';
import { medicalRecordsApi } from '@/features/medical-records/imperativeApi';
import { Button, Modal, Input, Textarea, Select, ConfirmDialog } from '@/components/ui';
import { notify } from '@/components/ui/Toast';
import { getApiErrorMessage } from '@/lib/errors';
import { useInventoryItems } from '@/features/inventory/inventoryApi';
import { useAppointment, useBookableServices } from '@/features/appointments/appointmentApi';
import type { Encounter, Treatment, CreateTreatmentPayload, TreatmentInventoryUsage } from '@/types/medical-records';
import { isValidFdiToothNumber } from '@/types/medical-records';
import { useAuthStore } from '@/stores/authStore';
import { useIsOwnEncounterScope } from './encounterUtils';

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
  const [confirmDelete, setConfirmDelete] = useState<Treatment | null>(null);

  const [toothNumber, setToothNumber] = useState('');
  const [procedureCode, setProcedureCode] = useState('');
  const [procedureName, setProcedureName] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [unitPrice, setUnitPrice] = useState('');
  const [priceReason, setPriceReason] = useState('');
  const [notes, setNotes] = useState('');
  // ADR-0009 D6: optional catalogue pick; it pre-fills code, name and price.
  const [serviceId, setServiceId] = useState('');
  const today = clinicToday();
  const { data: catalogServices = [] } = useBookableServices(encounter.dentistId, today);
  // A visit booked with services froze their prices at booking time; those
  // are pre-filled instead of today's price, with a note when they differ.
  const [priceNote, setPriceNote] = useState('');
  const { data: bookedVisit } = useAppointment(
    showAddModal && !editingTreatment ? (encounter.appointmentId ?? undefined) : undefined,
  );
  // Services booked on this visit stay pickable at their frozen price even
  // when stopped or no longer assigned to the dentist since (A5-19, A2-13).
  const pickable = [
    ...catalogServices.map((sv) => ({ serviceId: sv.serviceId, code: sv.code, name: sv.name, price: sv.price, durationMin: sv.durationMin, offCatalog: false })),
    ...(bookedVisit?.services ?? [])
      .filter((b) => !catalogServices.some((sv) => sv.serviceId === b.serviceId))
      .map((b) => ({ serviceId: b.serviceId, code: b.serviceCode, name: b.serviceName, price: b.price, durationMin: b.durationMin, offCatalog: true })),
  ];
  // Decision 3: the booked (else catalogue) price is the default; another
  // price needs treatment.price_override and a reason, kept in the audit.
  const canOverridePrice = useAuthStore((s) => s.hasPermission('treatment.price_override'));
  const pickedSnapshot = serviceId ? bookedVisit?.services?.find((b) => b.serviceId === serviceId) : undefined;
  const listPrice: number | null = editingTreatment
    ? (editingTreatment.listPrice ?? null)
    : serviceId
      ? (pickedSnapshot?.price ?? pickable.find((sv) => sv.serviceId === serviceId)?.price ?? null)
      : null;
  const priceNumber = Number(unitPrice);
  const priceChanged = editingTreatment
    ? unitPrice !== '' && priceNumber !== (editingTreatment.unitPrice ?? editingTreatment.priceCents)
    : false;
  const needsReason = editingTreatment
    ? priceChanged && (listPrice === null || priceNumber !== listPrice)
    : listPrice !== null && unitPrice !== '' && priceNumber !== listPrice;
  const priceLocked = listPrice !== null && !canOverridePrice;

  // Materials consumed by this treatment — only meaningful on create; the
  // backend's UpdateTreatmentDto has no field for it, so editing an existing
  // treatment's inventory usage isn't supported and the picker is hidden then.
  const [inventoryUsages, setInventoryUsages] = useState<TreatmentInventoryUsage[]>([]);
  const [pickedItemId, setPickedItemId] = useState('');
  const [pickedQty, setPickedQty] = useState('1');
  const { data: inventoryData } = useInventoryItems();
  const inventoryItems = inventoryData?.items ?? [];

  const addInventoryUsage = () => {
    const item = inventoryItems.find((i) => i.id === pickedItemId);
    const qty = Number(pickedQty);
    if (!item || !qty || qty <= 0) return;
    setInventoryUsages((prev) => [
      ...prev,
      { inventoryItemId: item.id, inventoryItemName: item.name, unit: item.unit, quantityUsed: qty },
    ]);
    setPickedItemId('');
    setPickedQty('1');
  };

  const removeInventoryUsage = (index: number) => {
    setInventoryUsages((prev) => prev.filter((_, i) => i !== index));
  };

  useEffect(() => {
    if (initialToothNumber === undefined || initialToothNumber === null) return;
    setShowAddModal(true);
    setEditingTreatment(null);
    setToothNumber(String(initialToothNumber));
    setProcedureCode('');
    setProcedureName('');
    setQuantity('1');
    setUnitPrice('');
    setPriceReason('');
    setPriceNote('');
    setNotes('');
    setServiceId('');
    setInventoryUsages([]);
    setPickedItemId('');
    setPickedQty('1');
    onClearInitialTooth?.();
  }, [initialToothNumber, onClearInitialTooth]);

  const createMutation = useMutation({
    mutationFn: (payload: CreateTreatmentPayload) => medicalRecordsApi.createTreatment(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['encounter', encounter.id] });
      resetForm();
    },
    onError: (err) => {
      notify.error(getApiErrorMessage(err, 'Không thể thêm dịch vụ'));
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Partial<CreateTreatmentPayload> }) =>
      medicalRecordsApi.updateTreatment(encounter.id, id, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['encounter', encounter.id] });
      setEditingTreatment(null);
    },
    onError: (err) => {
      notify.error(getApiErrorMessage(err, 'Không thể cập nhật dịch vụ'));
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => medicalRecordsApi.deleteTreatment(encounter.id, id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['encounter', encounter.id] });
      setConfirmDelete(null);
    },
    onError: (err) => {
      setConfirmDelete(null);
      notify.error(getApiErrorMessage(err, 'Không thể xoá dịch vụ'));
    },
  });

  const resetForm = () => {
    setShowAddModal(false);
    setToothNumber('');
    setProcedureCode('');
    setProcedureName('');
    setQuantity('1');
    setUnitPrice('');
    setPriceReason('');
    setPriceNote('');
    setNotes('');
    // A2-21: the next free-text line must not carry the previous pick.
    setServiceId('');
    setInventoryUsages([]);
    setPickedItemId('');
    setPickedQty('1');
  };

  const openEditModal = (treatment: Treatment) => {
    setEditingTreatment(treatment);
    setToothNumber(String(treatment.toothNumber));
    setProcedureCode(treatment.procedureCode ?? '');
    setProcedureName(treatment.procedureName ?? '');
    setQuantity(treatment.quantity.toString());
    setUnitPrice((treatment.unitPrice ?? treatment.priceCents).toString());
    setPriceReason('');
    setNotes(treatment.notes ?? '');
  };

  const handleSubmit = () => {
    // Mirrors the backend DTO: permanent 11–48 or primary 51–85 (FDI).
    if (toothNumber.trim() !== '' && !isValidFdiToothNumber(Number(toothNumber.trim()))) {
      notify.error('Số răng không hợp lệ (FDI: 11–48 răng vĩnh viễn, 51–85 răng sữa).');
      return;
    }
    if (editingTreatment) {
      updateMutation.mutate({
        id: editingTreatment.id,
        payload: {
          toothNumber,
          treatmentCode: procedureCode,
          treatmentName: procedureName,
          quantity: parseInt(quantity),
          priceCents: parseInt(unitPrice),
          ...(priceChanged && priceReason.trim() && { priceReason: priceReason.trim() }),
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
        ...(needsReason && { priceReason: priceReason.trim() }),
        description: notes,
        inventoryItemsUsed: inventoryUsages,
        serviceId: serviceId || undefined,
        durationMinutes: pickable.find((sv) => sv.serviceId === serviceId)?.durationMin,
      });
    }
  };

  const treatments = encounter.treatments || [];
  const totalTreatment = treatments.reduce((sum, t) => sum + (t.total ?? 0), 0);
  const canWrite = useAuthStore((s) => s.hasPermission('treatment.write'));
  const ownScope = useIsOwnEncounterScope(encounter);
  const isEditable = encounter.status === 'in_progress' && canWrite && ownScope;

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
              <h4 className="font-medium text-gray-900">{tooth ? `Răng ${tooth}` : 'Toàn hàm / Chung'}</h4>
              {onViewToothDetail && tooth && (
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
                    <p className="text-sm text-gray-600">
                      {treatment.quantity} x {formatCurrency(treatment.unitPrice)} ={' '}
                      <span className="font-medium">{formatCurrency(treatment.total)}</span>
                    </p>
                    {treatment.listPrice != null && treatment.listPrice !== treatment.unitPrice && (
                      <p className="text-xs text-amber-700">
                        Giá đã chốt {formatCurrency(treatment.listPrice)}
                        {treatment.priceReason ? ` • Lý do: ${treatment.priceReason}` : ''}
                      </p>
                    )}
                    {treatment.notes && (
                      <p className="mt-1 text-xs text-gray-500">{treatment.notes}</p>
                    )}
                  </div>
                  {isEditable && (
                    <div className="flex gap-2">
                      <button
                        onClick={() => openEditModal(treatment)}
                        className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => setConfirmDelete(treatment)}
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
      {isEditable && (
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
            placeholder="VD: 16 (răng sữa: 51–85)"
            hint="Để trống nếu không gắn răng (khám, cạo vôi, X-quang toàn hàm…)"
          />
          {!editingTreatment && pickable.length > 0 && (
            <Select
              label="Dịch vụ từ danh mục"
              value={serviceId}
              onChange={(e) => {
                const sv = pickable.find((x) => x.serviceId === e.target.value);
                setServiceId(e.target.value);
                const snapshot = sv && bookedVisit?.services?.find((b) => b.serviceId === sv.serviceId);
                setPriceNote(
                  sv && snapshot && snapshot.price !== sv.price
                    ? `Giá lúc đặt lịch hẹn ${formatCurrency(snapshot.price)}; giá hiện hành ${formatCurrency(sv.price)}.`
                    : '',
                );
                if (sv) {
                  setProcedureCode(sv.code);
                  setProcedureName(sv.name);
                  setUnitPrice(String(snapshot ? snapshot.price : sv.price));
                }
              }}
              options={[
                { value: '', label: '— Nhập tay —' },
                ...pickable.map((sv) => ({
                  value: sv.serviceId,
                  label: `${sv.name} (${sv.code})${sv.offCatalog ? ' — theo lịch hẹn, đã ngừng/không còn phân công' : ''}`,
                })),
              ]}
            />
          )}
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
              max="100"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
            />
            <Input
              label="Đơn giá (VND)"
              type="number"
              step={1000}
              hint={
                priceLocked
                  ? `Theo giá đã chốt ${formatCurrency(listPrice!)}`
                  : priceNote || (listPrice !== null ? `Giá đã chốt ${formatCurrency(listPrice)}` : undefined)
              }
              disabled={priceLocked}
              value={unitPrice}
              onChange={(e) => setUnitPrice(e.target.value)}
              placeholder="350000"
            />
          </div>
          {needsReason && (
            <Input
              label="Lý do đổi đơn giá *"
              value={priceReason}
              onChange={(e) => setPriceReason(e.target.value)}
              placeholder="VD: Răng sữa, làm nhỏ hơn bình thường"
              hint="Bắt buộc; được ghi vào nhật ký"
            />
          )}
          <Textarea
            label="Ghi chú"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
          />

          {/* Materials used — create-only: the backend has no field to
              change this on an existing treatment (UpdateTreatmentDto),
              so the picker is hidden while editing. */}
          {!editingTreatment && (
            <div className="space-y-2 border-t border-gray-100 pt-4">
              <label htmlFor="treatment-inventory-item" className="block text-sm font-medium text-gray-700">
                Vật tư sử dụng
              </label>
              <div className="flex items-end gap-2">
                <div className="flex-1">
                  <Select
                    id="treatment-inventory-item"
                    value={pickedItemId}
                    onChange={(e) => setPickedItemId(e.target.value)}
                    placeholder="-- Chọn vật tư --"
                    options={inventoryItems.map((item) => ({
                      value: item.id,
                      label: `${item.name} (còn ${item.quantityOnHand} ${item.unit})`,
                      disabled: item.quantityOnHand <= 0,
                    }))}
                  />
                </div>
                <div className="w-24">
                  <Input
                    type="number"
                    min="0.01"
                    step="0.01"
                    aria-label="Số lượng vật tư sử dụng"
                    value={pickedQty}
                    onChange={(e) => setPickedQty(e.target.value)}
                  />
                </div>
                <Button
                  type="button"
                  variant="outline"
                  aria-label="Thêm vật tư vào danh sách"
                  onClick={addInventoryUsage}
                  disabled={!pickedItemId}
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
              {inventoryUsages.length > 0 && (
                <ul className="space-y-1">
                  {inventoryUsages.map((usage, index) => (
                    <li
                      key={`${usage.inventoryItemId}-${index}`}
                      className="flex items-center justify-between rounded bg-gray-50 px-3 py-1.5 text-sm"
                    >
                      <span>
                        {usage.inventoryItemName} — {usage.quantityUsed} {usage.unit}
                      </span>
                      <button
                        type="button"
                        onClick={() => removeInventoryUsage(index)}
                        className="rounded p-0.5 text-gray-400 hover:bg-red-50 hover:text-red-600"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          <div className="flex justify-end gap-3 pt-4 border-t border-gray-100">
            <Button variant="outline" onClick={resetForm}>
              Hủy
            </Button>
            <Button
              onClick={handleSubmit}
              isLoading={createMutation.isPending || updateMutation.isPending}
              disabled={
                !procedureName ||
                !unitPrice ||
                !Number.isInteger(Number(unitPrice)) ||
                (needsReason && priceReason.trim().length < 3)
              }
            >
              {editingTreatment ? 'Lưu' : 'Thêm'}
            </Button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        onConfirm={() => confirmDelete && deleteMutation.mutate(confirmDelete.id)}
        title="Xoá dịch vụ?"
        description={
          confirmDelete
            ? `Dịch vụ "${confirmDelete.procedureName}" sẽ bị xoá khỏi phiếu điều trị. Hành động này không thể hoàn tác.`
            : ''
        }
        confirmLabel="Xoá"
        confirmVariant="danger"
        isLoading={deleteMutation.isPending}
      />
    </div>
  );
}

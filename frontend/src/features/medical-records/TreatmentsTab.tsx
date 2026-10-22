import { useTranslation } from 'react-i18next';
import { useEffect, useState } from 'react';
import { clinicToday } from '@/lib/clinicTime';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { formatCurrency } from '@/lib/format';
import { ClipboardList, Plus, Pencil, Trash2, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
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
import { planKeys, useOpenPlanItems } from '@/features/treatment-plans/treatmentPlansApi';

interface TreatmentsTabProps {
  encounter: Encounter;
  initialToothNumber?: number | string | null;
  onClearInitialTooth?: () => void;
  onViewToothDetail?: (toothNumber: number) => void;
}

export function TreatmentsTab({ encounter, initialToothNumber, onClearInitialTooth, onViewToothDetail }: TreatmentsTabProps) {
  const { t } = useTranslation();
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
  // A line of the patient's agreed treatment plan: its quoted price is the
  // agreed one, and the line is ticked off when the encounter closes.
  const [planItemId, setPlanItemId] = useState('');
  const navigate = useNavigate();
  const canReadPlans = useAuthStore((s) => s.hasPermission('treatment_plan.read'));
  const canWritePlans = useAuthStore((s) => s.hasPermission('treatment_plan.write'));
  const { data: openPlanItems = [] } = useOpenPlanItems(
    encounter.patientId,
    canReadPlans && showAddModal && !editingTreatment,
  );
  const planItem = planItemId ? openPlanItems.find((i) => i.id === planItemId) : undefined;
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
    : planItem
      ? planItem.unitPrice
      : serviceId
      ? (pickedSnapshot?.price ?? pickable.find((sv) => sv.serviceId === serviceId)?.price ?? null)
      : null;
  const priceNumber = Number(unitPrice);
  const priceChanged = editingTreatment
    ? unitPrice !== '' && priceNumber !== (editingTreatment.unitPrice ?? editingTreatment.priceCents)
    : false;
  // 3.6: a free-text line (no catalogue service) always needs a price reason.
  const freeText = !editingTreatment && !serviceId && !planItem;
  const needsReason = editingTreatment
    ? priceChanged && (listPrice === null || priceNumber !== listPrice)
    : freeText || (listPrice !== null && unitPrice !== '' && priceNumber !== listPrice);
  const priceLocked = listPrice !== null && !canOverridePrice;

  // Materials consumed by this treatment; editable while the encounter is
  // open (3.4) — stock is only taken when it closes.
  const [inventoryUsages, setInventoryUsages] = useState<TreatmentInventoryUsage[]>([]);
  const [pickedItemId, setPickedItemId] = useState('');
  const [pickedQty, setPickedQty] = useState('1');
  const { data: inventoryData } = useInventoryItems();
  // BR-INV-014: only ACTIVE items are offered (useInventoryItems asks for
  // status=ACTIVE); the server refuses a discontinued one too.
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
    setPlanItemId('');
    setInventoryUsages([]);
    setPickedItemId('');
    setPickedQty('1');
    onClearInitialTooth?.();
  }, [initialToothNumber, onClearInitialTooth]);

  const createMutation = useMutation({
    mutationFn: (payload: CreateTreatmentPayload) => medicalRecordsApi.createTreatment(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['encounter', encounter.id] });
      queryClient.invalidateQueries({ queryKey: planKeys.all });
      resetForm();
    },
    onError: (err) => {
      notify.error(getApiErrorMessage(err, t('uiClinical.serviceAddError')));
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Partial<CreateTreatmentPayload> }) =>
      medicalRecordsApi.updateTreatment(encounter.id, id, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['encounter', encounter.id] });
      setEditingTreatment(null);
      setInventoryUsages([]);
    },
    onError: (err) => {
      notify.error(getApiErrorMessage(err, t('uiClinical.serviceUpdateError')));
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => medicalRecordsApi.deleteTreatment(encounter.id, id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['encounter', encounter.id] });
      // The plan line it carried out is free again.
      queryClient.invalidateQueries({ queryKey: planKeys.all });
      setConfirmDelete(null);
    },
    onError: (err) => {
      setConfirmDelete(null);
      notify.error(getApiErrorMessage(err, t('uiClinical.serviceDeleteError')));
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
    setPlanItemId('');
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
    setInventoryUsages(
      (treatment.inventoryItemsUsed ?? []).map((u) => {
        const item = inventoryData?.items.find((i) => i.id === u.inventoryItemId);
        return { ...u, inventoryItemName: item?.name ?? u.inventoryItemName, unit: u.unit ?? item?.unit };
      }),
    );
    setPickedItemId('');
    setPickedQty('1');
  };

  const handleSubmit = () => {
    // Mirrors the backend DTO: permanent 11–48 or primary 51–85 (FDI).
    if (!planItem && toothNumber.trim() !== '' && !isValidFdiToothNumber(Number(toothNumber.trim()))) {
      notify.error(t('uiClinical.invalidToothNumber'));
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
          inventoryItemsUsed: inventoryUsages,
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
        ...(planItem && { planItemId: planItem.id, toothNumbers: planItem.toothNumbers }),
        durationMinutes: pickable.find((sv) => sv.serviceId === serviceId)?.durationMin,
      });
    }
  };

  const treatments = encounter.treatments || [];
  const totalTreatment = treatments.reduce((sum, line) => sum + (line.total ?? 0), 0);
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
              <h4 className="font-medium text-gray-900">{tooth ? t('uiClinical.toothName', { number: tooth }) : t('uiClinical.treatmentWholeMouth')}</h4>
              {onViewToothDetail && tooth && (
                <button
                  type="button"
                  onClick={() => onViewToothDetail(Number(tooth))}
                  className="text-xs text-primary-700 hover:underline"
                >
                  {t('uiClinical.viewToothHistory')} →
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
                        {t('uiClinical.lockedPriceHint', { price: formatCurrency(treatment.listPrice) })}
                        {treatment.priceReason ? ` • ${t('uiClinical.treatmentPriceReason', { reason: treatment.priceReason })}` : ''}
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
        <p className="text-sm text-gray-500">{t('uiClinical.treatmentEmpty')}</p>
      )}

      {/* Total */}
      {treatments.length > 0 && (
        <div className="flex items-center justify-between rounded-lg border border-gray-200 bg-gray-50 p-4">
          <span className="font-medium text-gray-900">{t('uiClinical.treatmentTotal')}</span>
          <span className="text-xl font-semibold text-gray-900">
            {formatCurrency(totalTreatment)}
          </span>
        </div>
      )}

      {/* Add Button */}
      {isEditable && (
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => setShowAddModal(true)}>
            <Plus className="h-4 w-4" />
            {t('uiClinical.treatmentAddButton')}
          </Button>
          {canWritePlans && (
            <Button
              variant="outline"
              onClick={() => navigate(`/treatment-plans/new?patientId=${encounter.patientId}&encounterId=${encounter.id}`)}
            >
              <ClipboardList className="h-4 w-4" />
              {t('uiPlans.newPlan')}
            </Button>
          )}
        </div>
      )}

      {/* Add/Edit Modal */}
      <Modal
        isOpen={showAddModal || !!editingTreatment}
        onClose={resetForm}
        title={editingTreatment ? t('uiClinical.treatmentEdit') : t('uiClinical.treatmentAdd')}
      >
        <div className="space-y-4">
          {!editingTreatment && openPlanItems.length > 0 && (
            <Select
              label={t('uiPlans.fromPlan')}
              value={planItemId}
              hint={planItem ? t('uiPlans.fromPlanHint') : undefined}
              onChange={(e) => {
                const item = openPlanItems.find((i) => i.id === e.target.value);
                setPlanItemId(e.target.value);
                setPriceNote('');
                if (item) {
                  setServiceId(item.serviceId ?? '');
                  setProcedureCode(item.service?.code ?? '');
                  setProcedureName(item.procedure);
                  setQuantity(String(item.quantity));
                  setUnitPrice(String(item.unitPrice));
                  setToothNumber(item.toothNumbers.join(', '));
                } else {
                  setServiceId('');
                  setToothNumber('');
                }
              }}
              options={[
                { value: '', label: t('uiPlans.fromPlanNone') },
                ...openPlanItems.map((item) => ({
                  value: item.id,
                  label: t('uiPlans.planLineOption', {
                    plan: item.planTitle,
                    procedure: item.procedure,
                    teeth: item.toothNumbers.length ? ` (${item.toothNumbers.join(', ')})` : '',
                    price: formatCurrency(item.quantity * item.unitPrice),
                  }),
                })),
              ]}
            />
          )}
          <Input
            label={t('uiClinical.toothNumber')}
            value={toothNumber}
            disabled={!!planItem}
            onChange={(e) => setToothNumber(String(e.target.value))}
            placeholder={t('uiClinical.toothNumberExample')}
            hint={t('uiClinical.toothNumberHint')}
          />
          {!editingTreatment && !planItem && pickable.length > 0 && (
            <Select
              label={t('uiClinical.serviceCatalog')}
              value={serviceId}
              onChange={(e) => {
                const sv = pickable.find((x) => x.serviceId === e.target.value);
                setServiceId(e.target.value);
                const snapshot = sv && bookedVisit?.services?.find((b) => b.serviceId === sv.serviceId);
                setPriceNote(
                  sv && snapshot && snapshot.price !== sv.price
                    ? t('uiClinical.priceAtBooking', { booked: formatCurrency(snapshot.price), current: formatCurrency(sv.price) })
                    : '',
                );
                if (sv) {
                  setProcedureCode(sv.code);
                  setProcedureName(sv.name);
                  setUnitPrice(String(snapshot ? snapshot.price : sv.price));
                }
              }}
              options={[
                { value: '', label: t('uiClinical.manualEntry') },
                ...pickable.map((sv) => ({
                  value: sv.serviceId,
                  label: `${sv.name} (${sv.code})${sv.offCatalog ? ` — ${t('uiClinical.serviceOffCatalog')}` : ''}`,
                })),
              ]}
            />
          )}
          <Input
            label={t('uiClinical.procedureName')}
            value={procedureName}
            onChange={(e) => setProcedureName(e.target.value)}
            placeholder={t('uiClinical.procedureExample')}
          />
          <div className="grid grid-cols-2 gap-4">
            <Input
              label={t('uiClinical.quantity')}
              type="number"
              min="1"
              max="100"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
            />
            <Input
              label={t('uiClinical.unitPrice')}
              type="number"
              step={1000}
              hint={
                priceLocked
                  ? t('uiClinical.priceLockedHint', { price: formatCurrency(listPrice!) })
                  : priceNote || (listPrice !== null ? t('uiClinical.lockedPriceHint', { price: formatCurrency(listPrice) }) : undefined)
              }
              disabled={priceLocked}
              value={unitPrice}
              onChange={(e) => setUnitPrice(e.target.value)}
              placeholder="350000"
            />
          </div>
          {needsReason && (
            <Input
              label={freeText ? t('uiClinical.freeTextPriceReason') : t('uiClinical.priceChangeReason')}
              value={priceReason}
              onChange={(e) => setPriceReason(e.target.value)}
              placeholder={t('uiClinical.priceReasonExample')}
              hint={t('uiClinical.priceReasonHint')}
            />
          )}
          <Textarea
            label={t('uiClinical.treatmentNote')}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
          />

          {/* Materials used — editable until the encounter closes (3.4). */}
          <div className="space-y-2 border-t border-gray-100 pt-4">
            <label htmlFor="treatment-inventory-item" className="block text-sm font-medium text-gray-700">
              {t('uiClinical.suppliesUsed')}
            </label>
            <div className="flex items-end gap-2">
              <div className="flex-1">
                <Select
                  id="treatment-inventory-item"
                  value={pickedItemId}
                  onChange={(e) => setPickedItemId(e.target.value)}
                  placeholder={t('uiClinical.selectSupply')}
                  options={inventoryItems.map((item) => ({
                    value: item.id,
                    label: t('uiClinical.supplyOption', { name: item.name, quantity: item.quantityOnHand, unit: item.unit }),
                    disabled: item.quantityOnHand <= 0,
                  }))}
                />
              </div>
              <div className="w-24">
                <Input
                  type="number"
                  min="0.01"
                  step="0.01"
                  aria-label={t('uiClinical.supplyQuantity')}
                  value={pickedQty}
                  onChange={(e) => setPickedQty(e.target.value)}
                />
              </div>
              <Button
                type="button"
                variant="outline"
                aria-label={t('uiClinical.addSupply')}
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

          <div className="flex justify-end gap-3 pt-4 border-t border-gray-100">
            <Button variant="outline" onClick={resetForm}>
              {t('uiClinical.cancel')}
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
              {editingTreatment ? t('uiClinical.save') : t('uiClinical.add')}
            </Button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        onConfirm={() => confirmDelete && deleteMutation.mutate(confirmDelete.id)}
        title={t('uiClinical.deleteService')}
        description={
          confirmDelete
            ? t('uiClinical.confirmDeleteServiceText', { name: confirmDelete.procedureName })
            : ''
        }
        confirmLabel={t('uiClinical.deleteServiceConfirm')}
        confirmVariant="danger"
        isLoading={deleteMutation.isPending}
      />
    </div>
  );
}

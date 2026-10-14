import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { vi } from 'date-fns/locale';
import { ArrowLeft, Plus, Minus, Settings } from 'lucide-react';
import { inventoryApi, stockMovementLabel } from '@/types/inventory';
import { Button, Card, StatusBadge, Modal, Input, Textarea } from '@/components/ui';
import { notify } from '@/components/ui/Toast';
import { getApiErrorMessage } from '@/lib/errors';
import { formatCurrency } from '@/lib/format';
import { PermissionGuard } from '@/components/PermissionGuard';
import { useAuthStore } from '@/stores/authStore';
import type { StockMovementType } from '@/types/inventory';

export default function InventoryItemDetailPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const hasPermission = useAuthStore((s) => s.hasPermission);

  const [showAdjustModal, setShowAdjustModal] = useState(false);
  const [adjustmentType, setAdjustmentType] = useState<StockMovementType>('STOCK_IN');
  const [adjustmentQuantity, setAdjustmentQuantity] = useState('');
  const [adjustmentReason, setAdjustmentReason] = useState('');

  const { data: item, isLoading } = useQuery({
    queryKey: ['inventory-item', id],
    queryFn: () => inventoryApi.get(id!),
    enabled: !!id,
  });

  const { data: movements } = useQuery({
    queryKey: ['inventory-movements', id],
    queryFn: () => inventoryApi.listMovements({ itemId: id, pageSize: 20 }),
    enabled: !!id,
  });

  const parsedAdjustQty = parseInt(adjustmentQuantity, 10) || 0;
  const adjustDelta = adjustmentType === 'STOCK_IN' ? parsedAdjustQty : -parsedAdjustQty;
  const previewQuantity = item ? item.currentQuantity + adjustDelta : null;

  const adjustMutation = useMutation({
    mutationFn: () => {
      // Route to the endpoint that matches the selected type instead of
      // always calling /adjust — that endpoint hardcodes MovementType.
      // ADJUSTMENT regardless of what the picker shows, so choosing
      // "Nhập kho"/"Xuất kho" was always silently recorded as a generic
      // stocktake in movement history.
      if (adjustmentType === 'STOCK_IN') {
        return inventoryApi.stockIn(id!, { quantity: parsedAdjustQty, reason: adjustmentReason });
      }
      if (adjustmentType === 'STOCK_OUT') {
        return inventoryApi.stockOut(id!, { quantity: parsedAdjustQty, reason: adjustmentReason });
      }
      // BR-INV-004: adjustment is an ABSOLUTE set of `quantityOnHand`,
      // not a delta. Send only the target value + reason.
      return inventoryApi.adjust(id!, {
        newQuantity: previewQuantity ?? 0,
        reason: adjustmentReason,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inventory-item', id] });
      queryClient.invalidateQueries({ queryKey: ['inventory-movements', id] });
      setShowAdjustModal(false);
      setAdjustmentQuantity('');
      setAdjustmentReason('');
    },
    onError: (err) => {
      notify.error(getApiErrorMessage(err, t('uiOperations.adjustInventoryFailed')));
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-10">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" />
      </div>
    );
  }

  if (!item) {
    return (
      <div className="text-center py-10">
        <p className="text-gray-500">{t('uiOperations.itemNotFound')}</p>
        <Button variant="outline" className="mt-3" onClick={() => navigate('/inventory')}>
          {t('uiOperations.backToList')}
        </Button>
      </div>
    );
  }

  const getStockStatus = () => {
    if (item.currentQuantity === 0) return 'out_of_stock';
    if (item.currentQuantity < item.minStockLevel) return 'low_stock';
    return 'in_stock';
  };

  const stockStatus = getStockStatus();
  const movementsList = movements?.data ?? [];

  // Limited to the 3 movement types the backend can actually record
  // distinctly (Prisma MovementType enum: STOCK_IN | STOCK_OUT |
  // ADJUSTMENT) — other labels in StockMovementType exist only for
  // displaying historical/legacy movement records, not for creating new
  // ones, so offering them here silently collapsed into a generic
  // ADJUSTMENT movement no matter which was picked.
  // Backend gates each type separately (POST .../stock-in needs
  // inventory.stock_in, .../stock-out needs inventory.stock_out,
  // .../adjust needs the stronger inventory.update — an absolute
  // quantityOnHand set, not an auditable in/out) — filter to what this
  // actor can actually submit. Receptionist holds stock_in/stock_out but
  // not update, so "Kiểm kê" never appears for her rather than 403ing on
  // submit.
  const allAdjustmentTypes: { value: StockMovementType; label: string; icon: typeof Plus; permission: string }[] = [
    { value: 'STOCK_IN', label: t('uiOperations.stockIn'), icon: Plus, permission: 'inventory.stock_in' },
    { value: 'STOCK_OUT', label: t('uiOperations.stockOut'), icon: Minus, permission: 'inventory.stock_out' },
    { value: 'ADJUSTMENT', label: t('uiOperations.stockAdjustment'), icon: Settings, permission: 'inventory.update' },
  ];
  const adjustmentTypes = allAdjustmentTypes.filter((t) => hasPermission(t.permission));

  const getMovementIcon = (type: StockMovementType | string) => {
    switch (type) {
      case 'STOCK_IN':
      case 'RETURNED':
        return '+';
      case 'STOCK_OUT':
      case 'ENCOUNTER_REF':
      case 'WRITE_OFF':
      case 'EXPIRED':
      case 'DAMAGED':
        return '-';
      default:
        return '';
    }
  };

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" onClick={() => navigate('/inventory')}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">{item.name}</h1>
            <StatusBadge status={stockStatus} />
          </div>
          <p className="mt-0.5 text-sm text-gray-500 font-mono">{item.code}</p>
        </div>
        <PermissionGuard anyOf={['inventory.stock_in', 'inventory.stock_out', 'inventory.update']}>
          <Button onClick={() => setShowAdjustModal(true)}>
            <Settings className="h-4 w-4" />
            {t('uiOperations.adjust')}
          </Button>
        </PermissionGuard>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Main Content */}
        <div className="lg:col-span-2 space-y-3">
          {/* Item Info */}
          <Card title={t('uiOperations.itemInformation')}>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400">{t('uiOperations.category')}</p>
                <p className="font-medium">{item.category?.name ?? '-'}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400">{t('uiOperations.unit')}</p>
                <p className="font-medium">{item.unit}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400">{t('uiOperations.supplier')}</p>
                <p className="font-medium">{item.supplier || '-'}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400">{t('uiOperations.status')}</p>
                <p className="font-medium">{item.status === 'ACTIVE' ? t('uiOperations.active') : t('uiOperations.inactive')}</p>
              </div>
            </div>
            {item.description && (
              <div className="mt-3 pt-3 border-t border-gray-100">
                <p className="text-sm text-gray-500 dark:text-gray-400">{t('uiOperations.description')}</p>
                <p className="text-sm text-gray-700 dark:text-gray-300">{item.description}</p>
              </div>
            )}
          </Card>

          {/* Stock Movement History */}
          <Card title={t('uiOperations.stockMovementHistory')} actions={<Link to={`/inventory/movements?itemId=${id}`} className="text-sm text-brand-600 hover:underline dark:text-brand-400">{t('uiOperations.viewAll')}</Link>}>
            {movementsList.length > 0 ? (
              <div className="space-y-2">
                {movementsList.slice(0, 10).map((movement) => (
                  <div key={movement.id} className="flex items-start gap-3 text-sm">
                    <div className={`shrink-0 h-6 w-6 rounded-full flex items-center justify-center text-xs font-bold ${
                      movement.quantity > 0 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                    }`}>
                      {getMovementIcon(movement.type)}
                    </div>
                    <div className="flex-1">
                      <div className="flex justify-between">
                        <span className="font-medium">
                          {stockMovementLabel(movement.type)}
                        </span>
                        <span className={movement.quantity > 0 ? 'text-green-600' : 'text-red-600'}>
                          {movement.quantity > 0 ? '+' : ''}{movement.quantity}
                        </span>
                      </div>
                      <p className="text-gray-500 dark:text-gray-400">
                        {format(new Date(movement.createdAt), 'dd/MM/yyyy HH:mm', { locale: vi })} • {t('uiOperations.remaining')}: {movement.balanceAfter}
                      </p>
                      {movement.reason && (
                        <p className="text-xs text-gray-500 dark:text-gray-400">{movement.reason}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-500 dark:text-gray-400">{t('uiOperations.noStockMovements')}</p>
            )}
          </Card>
        </div>

        {/* Sidebar */}
        <div className="space-y-3">
          <Card title={t('uiOperations.inventoryStock')}>
            <div className="text-center">
              <p className={`text-4xl font-bold ${
                stockStatus === 'out_of_stock' ? 'text-red-600 dark:text-red-400' : stockStatus === 'low_stock' ? 'text-amber-600 dark:text-amber-400' : 'text-gray-900 dark:text-gray-100'
              }`}>
                {item.currentQuantity}
              </p>
              <p className="text-sm text-gray-500 dark:text-gray-400">{item.unit}</p>
            </div>

            <div className="mt-3 space-y-1.5">
              <div className="flex justify-between text-sm">
                <span className="text-gray-500 dark:text-gray-400">{t('uiOperations.minimum')}</span>
                <span className={item.currentQuantity < item.minStockLevel ? 'text-amber-600 font-medium dark:text-amber-400' : 'text-gray-700 dark:text-gray-300'}>
                  {item.minStockLevel}
                </span>
              </div>
              {item.maxStockLevel && (
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500 dark:text-gray-400">{t('uiOperations.maximum')}</span>
                  <span className="text-gray-700 dark:text-gray-300">{item.maxStockLevel}</span>
                </div>
              )}
            </div>

            {stockStatus !== 'in_stock' && (
              <div className={`mt-3 rounded p-2.5 ${
                stockStatus === 'out_of_stock' ? 'bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300' : 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300'
              }`}>
                <p className="text-sm font-medium">
                  {stockStatus === 'out_of_stock' ? t('uiOperations.outOfStock') : t('uiOperations.runningLow')}
                </p>
                <p className="text-xs mt-0.5">
                  {t('uiOperations.restockToMinimum', { quantity: item.minStockLevel - item.currentQuantity, unit: item.unit })}
                </p>
              </div>
            )}
          </Card>

          <Card title={t('uiOperations.price')}>
            <div className="space-y-1.5">
              <div className="flex justify-between text-sm">
                <span className="text-gray-500 dark:text-gray-400">{t('uiOperations.purchasePrice')}</span>
                <span className="font-medium">{formatCurrency(item.costPrice)}</span>
              </div>
            </div>
          </Card>
        </div>
      </div>

      {/* Adjustment Modal */}
      <Modal
        isOpen={showAdjustModal}
        onClose={() => setShowAdjustModal(false)}
        title={t('uiOperations.adjustInventory')}
        size="sm"
      >
        <div className="space-y-3">
          <div className="rounded-lg bg-gray-50 p-2.5 dark:bg-surface-800">
            <p className="text-sm text-gray-600 dark:text-gray-300">{t('uiOperations.currentStock')}</p>
            <p className="text-lg font-semibold">{item.currentQuantity} {item.unit}</p>
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-200">{t('uiOperations.adjustmentType')}</label>
            <div className="grid grid-cols-2 gap-2">
              {adjustmentTypes.map((type) => (
                <button
                  key={type.value}
                  onClick={() => setAdjustmentType(type.value)}
                  className={`rounded border p-1.5 text-sm transition-colors ${
                    adjustmentType === type.value
                      ? 'border-brand-500 bg-brand-50 text-brand-700'
                      : 'border-gray-200 hover:bg-gray-50 dark:border-surface-600 dark:text-gray-200 dark:hover:bg-surface-800'
                  }`}
                >
                  {type.label}
                </button>
              ))}
            </div>
          </div>

          <Input
            label={t('uiOperations.quantity')}
            type="number"
            min="1"
            value={adjustmentQuantity}
            onChange={(e) => setAdjustmentQuantity(e.target.value)}
            placeholder={t('uiOperations.quantityExample')}
          />

          <Textarea
            label={t('uiOperations.reason')}
            value={adjustmentReason}
            onChange={(e) => setAdjustmentReason(e.target.value)}
            placeholder={t('uiOperations.stockInReasonExample')}
            rows={2}
          />

          {adjustmentQuantity && previewQuantity !== null && (
            <div className={`rounded-lg p-2.5 ${previewQuantity < 0 ? 'bg-red-50 dark:bg-red-950/40' : 'bg-brand-50 dark:bg-brand-950/40'}`}>
              <p className={`text-sm ${previewQuantity < 0 ? 'text-red-700 dark:text-red-300' : 'text-brand-700 dark:text-brand-300'}`}>
                {t('uiOperations.afterAdjustment')}{' '}
                <span className="font-semibold">
                  {previewQuantity} {item.unit}
                </span>
              </p>
              {previewQuantity < 0 && (
                <p className="mt-1 text-xs text-red-600 dark:text-red-400">
                  {t('uiOperations.adjustmentExceedsStock', { quantity: item.currentQuantity, unit: item.unit })}
                </p>
              )}
            </div>
          )}

          <div className="flex justify-end gap-3 pt-3 border-t border-gray-100 dark:border-surface-700">
            <Button variant="outline" onClick={() => setShowAdjustModal(false)}>
              {t('uiOperations.cancel')}
            </Button>
            <Button
              onClick={() => adjustMutation.mutate()}
              isLoading={adjustMutation.isPending}
              disabled={
                !adjustmentQuantity ||
                !adjustmentReason ||
                parsedAdjustQty <= 0 ||
                previewQuantity === null ||
                previewQuantity < 0
              }
            >
              {t('uiOperations.confirm')}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

import { useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { vi } from 'date-fns/locale';
import { ArrowLeft, Package, Plus, Minus, Settings } from 'lucide-react';
import { inventoryApi, stockMovementLabel } from '@/types/inventory';
import { Button, Card, StatusBadge, Modal, Input, Textarea } from '@/components/ui';
import { formatCurrency } from '@/lib/format';
import type { StockMovementType } from '@/types/inventory';

export default function InventoryItemDetailPage() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();

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

  const adjustMutation = useMutation({
    mutationFn: () => {
      const parsedQty = parseInt(adjustmentQuantity) || 0;
      const isPositive = adjustmentType === 'STOCK_IN' || adjustmentType === 'RETURNED';
      const delta = isPositive ? parsedQty : -parsedQty;
      const newQuantity = item ? item.currentQuantity + delta : parsedQty;
      // BR-INV-004: adjustment is an ABSOLUTE set of `quantityOnHand`,
      // not a delta. Send only the target value + reason.
      return inventoryApi.adjust(id!, {
        newQuantity,
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
        <p className="text-gray-500">Không tìm thấy vật tư</p>
        <Button variant="outline" className="mt-3" onClick={() => navigate('/inventory')}>
          Quay lại danh sách
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

  const adjustmentTypes: { value: StockMovementType; label: string; icon: typeof Plus }[] = [
    { value: 'STOCK_IN', label: 'Nhập kho', icon: Plus },
    { value: 'STOCK_OUT', label: 'Xuất kho', icon: Minus },
    { value: 'ADJUSTMENT', label: 'Kiểm kê', icon: Settings },
    { value: 'RETURNED', label: 'Khách trả', icon: Package },
    { value: 'EXPIRED', label: 'Hết hạn', icon: Minus },
    { value: 'DAMAGED', label: 'Hư hỏng', icon: Minus },
  ];

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
            <h1 className="text-2xl font-semibold text-gray-900">{item.name}</h1>
            <StatusBadge status={stockStatus} />
          </div>
          <p className="mt-0.5 text-sm text-gray-500 font-mono">{item.code}</p>
        </div>
        <Button onClick={() => setShowAdjustModal(true)}>
          <Settings className="h-4 w-4" />
          Điều chỉnh
        </Button>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Main Content */}
        <div className="lg:col-span-2 space-y-3">
          {/* Item Info */}
          <Card title="Thông tin vật tư">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <p className="text-sm text-gray-500">Loại</p>
                <p className="font-medium">{item.category?.name ?? '-'}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Đơn vị</p>
                <p className="font-medium">{item.unit}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Nhà cung cấp</p>
                <p className="font-medium">{item.supplier || '-'}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Trạng thái</p>
                <p className="font-medium">{item.status === 'ACTIVE' ? 'Hoạt động' : 'Ngừng sử dụng'}</p>
              </div>
            </div>
            {item.description && (
              <div className="mt-3 pt-3 border-t border-gray-100">
                <p className="text-sm text-gray-500">Mô tả</p>
                <p className="text-sm text-gray-700">{item.description}</p>
              </div>
            )}
          </Card>

          {/* Stock Movement History */}
          <Card title="Lịch sử xuất nhập" actions={<Link to={`/inventory/movements?itemId=${id}`} className="text-sm text-brand-600 hover:underline">Xem tất cả</Link>}>
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
                      <p className="text-gray-500">
                        {format(new Date(movement.createdAt), 'dd/MM/yyyy HH:mm', { locale: vi })} • Còn lại: {movement.balanceAfter}
                      </p>
                      {movement.reason && (
                        <p className="text-xs text-gray-400">{movement.reason}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-500">Chưa có lịch sử xuất nhập</p>
            )}
          </Card>
        </div>

        {/* Sidebar */}
        <div className="space-y-3">
          <Card title="Tồn kho">
            <div className="text-center">
              <p className={`text-4xl font-bold ${
                stockStatus === 'out_of_stock' ? 'text-red-600' : stockStatus === 'low_stock' ? 'text-amber-600' : 'text-gray-900'
              }`}>
                {item.currentQuantity}
              </p>
              <p className="text-sm text-gray-500">{item.unit}</p>
            </div>

            <div className="mt-3 space-y-1.5">
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Mức tối thiểu</span>
                <span className={item.currentQuantity < item.minStockLevel ? 'text-amber-600 font-medium' : 'text-gray-700'}>
                  {item.minStockLevel}
                </span>
              </div>
              {item.maxStockLevel && (
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Mức tối đa</span>
                  <span className="text-gray-700">{item.maxStockLevel}</span>
                </div>
              )}
            </div>

            {stockStatus !== 'in_stock' && (
              <div className={`mt-3 rounded p-2.5 ${
                stockStatus === 'out_of_stock' ? 'bg-red-50 text-red-700' : 'bg-amber-50 text-amber-700'
              }`}>
                <p className="text-sm font-medium">
                  {stockStatus === 'out_of_stock' ? 'Hết hàng!' : 'Sắp hết hàng'}
                </p>
                <p className="text-xs mt-0.5">
                  Cần nhập thêm {item.minStockLevel - item.currentQuantity} {item.unit} để đạt mức tối thiểu
                </p>
              </div>
            )}
          </Card>

          <Card title="Giá">
            <div className="space-y-1.5">
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Giá nhập</span>
                <span className="font-medium">{formatCurrency(item.costPrice)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Giá bán</span>
                <span className="font-medium">{formatCurrency(item.sellingPrice)}</span>
              </div>
            </div>
          </Card>
        </div>
      </div>

      {/* Adjustment Modal */}
      <Modal
        isOpen={showAdjustModal}
        onClose={() => setShowAdjustModal(false)}
        title="Điều chỉnh tồn kho"
        size="sm"
      >
        <div className="space-y-3">
          <div className="rounded-lg bg-gray-50 p-2.5">
            <p className="text-sm text-gray-600">Tồn hiện tại</p>
            <p className="text-lg font-semibold">{item.currentQuantity} {item.unit}</p>
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">Loại điều chỉnh</label>
            <div className="grid grid-cols-2 gap-2">
              {adjustmentTypes.map((type) => (
                <button
                  key={type.value}
                  onClick={() => setAdjustmentType(type.value)}
                  className={`rounded border p-1.5 text-sm transition-colors ${
                    adjustmentType === type.value
                      ? 'border-brand-500 bg-brand-50 text-brand-700'
                      : 'border-gray-200 hover:bg-gray-50'
                  }`}
                >
                  {type.label}
                </button>
              ))}
            </div>
          </div>

          <Input
            label="Số lượng"
            type="number"
            min="1"
            value={adjustmentQuantity}
            onChange={(e) => setAdjustmentQuantity(e.target.value)}
            placeholder="VD: 50"
          />

          <Textarea
            label="Lý do"
            value={adjustmentReason}
            onChange={(e) => setAdjustmentReason(e.target.value)}
            placeholder="VD: Nhập hàng từ nhà cung cấp"
            rows={2}
          />

          {adjustmentQuantity && (
            <div className="rounded-lg bg-brand-50 p-2.5">
              <p className="text-sm text-brand-700">
                Sau điều chỉnh:{' '}
                <span className="font-semibold">
                  {item.currentQuantity + (adjustmentType === 'STOCK_IN' || adjustmentType === 'RETURNED' ? parseInt(adjustmentQuantity) || 0 : -parseInt(adjustmentQuantity) || 0)} {item.unit}
                </span>
              </p>
            </div>
          )}

          <div className="flex justify-end gap-3 pt-3 border-t border-gray-100">
            <Button variant="outline" onClick={() => setShowAdjustModal(false)}>
              Hủy
            </Button>
            <Button
              onClick={() => adjustMutation.mutate()}
              isLoading={adjustMutation.isPending}
              disabled={!adjustmentQuantity || !adjustmentReason}
            >
              Xác nhận
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

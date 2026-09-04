import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Package, AlertTriangle, AlertCircle } from 'lucide-react';
import { inventoryApi, type InventoryCategoryOption } from '@/types/inventory';
import { Button, Card, StatusBadge, SearchInput, Pagination, EmptyState, Modal, Input, Select } from '@/components/ui';
import { notify } from '@/components/ui/Toast';
import { getApiErrorMessage } from '@/lib/errors';
import { formatCurrency } from '@/lib/format';
import { PermissionGuard } from '@/components/PermissionGuard';
import { useAuthStore } from '@/stores/authStore';
import type { InventoryItem, InventoryFilters } from '@/types/inventory';

const PAGE_SIZE = 20;

export default function InventoryListPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  // Backend POST /inventory/items requires inventory.create — receptionist
  // only has stock_in/stock_out (issue/receive against existing items), not
  // create, so without this the button is always live but always fails.
  const canCreateInventoryItem = useAuthStore((s) => s.hasPermission('inventory.create'));

  // categoryId is a UUID fetched from /inventory/categories; UI keeps
  // the selection as the raw UUID and forwards it to the backend.
  const [filters, setFilters] = useState<InventoryFilters>({
    page: 1,
    pageSize: PAGE_SIZE,
    status: 'ACTIVE',
  });
  const [search, setSearch] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [newSku, setNewSku] = useState('');
  const [newName, setNewName] = useState('');
  const [newUnit, setNewUnit] = useState('');
  const [newCategoryId, setNewCategoryId] = useState('');
  const [newQuantity, setNewQuantity] = useState('0');
  const [newMinStock, setNewMinStock] = useState('');
  const [newCostPrice, setNewCostPrice] = useState('');

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['inventory', filters],
    queryFn: () => inventoryApi.list(filters),
  });

  const { data: categories = [] } = useQuery({
    queryKey: ['inventory-categories'],
    queryFn: () => inventoryApi.listCategories(),
  });

  const resetAddForm = () => {
    setShowAddModal(false);
    setNewSku('');
    setNewName('');
    setNewUnit('');
    setNewCategoryId('');
    setNewQuantity('0');
    setNewMinStock('');
    setNewCostPrice('');
  };

  const createMutation = useMutation({
    mutationFn: () =>
      inventoryApi.create({
        code: newSku,
        name: newName,
        unit: newUnit,
        categoryId: newCategoryId || undefined,
        currentQuantity: parseInt(newQuantity, 10) || 0,
        minStockLevel: newMinStock ? parseInt(newMinStock, 10) : undefined,
        costPrice: newCostPrice ? parseInt(newCostPrice, 10) : undefined,
        sellingPrice: 0,
        status: 'ACTIVE',
      } as Omit<InventoryItem, 'id' | 'createdAt' | 'updatedAt'>),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inventory'] });
      notify.success('Đã thêm vật tư mới');
      resetAddForm();
    },
    onError: (err) => {
      notify.error(getApiErrorMessage(err, 'Không thể thêm vật tư'));
    },
  });

  const handleSearch = useCallback((value: string) => {
    setSearch(value);
    setFilters((f) => ({ ...f, q: value || undefined, page: 1 }));
  }, []);

  const handlePageChange = useCallback((page: number) => {
    setFilters((f) => ({ ...f, page }));
  }, []);

  const handleCategoryFilter = useCallback((categoryId: string) => {
    setFilters((f) => ({
      ...f,
      categoryId: categoryId === 'all' ? undefined : categoryId,
      page: 1,
    }));
  }, []);

  const handleLowStockFilter = useCallback(() => {
    setFilters((f) => ({
      ...f,
      lowStockOnly: f.lowStockOnly === 'true' ? undefined : 'true',
      page: 1,
    }));
  }, []);

  const items = data?.data ?? [];
  const totalItems = data?.total ?? 0;
  const totalPages = Math.ceil(totalItems / PAGE_SIZE);

  const getStockStatus = (item: InventoryItem) => {
    if (item.currentQuantity === 0) return 'out_of_stock';
    if (item.currentQuantity < item.minStockLevel) return 'low_stock';
    return 'in_stock';
  };

  const getStockStatusColor = (status: string) => {
    if (status === 'out_of_stock') return 'bg-red-50';
    if (status === 'low_stock') return 'bg-amber-50';
    return '';
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Vật tư & Thuốc</h1>
          <p className="mt-0.5 text-sm text-gray-500">
            Quản lý tồn kho của phòng khám
          </p>
        </div>
        <PermissionGuard permission="inventory.create">
          <Button onClick={() => setShowAddModal(true)}>
            <Plus className="h-4 w-4" />
            Thêm vật tư
          </Button>
        </PermissionGuard>
      </div>

      <Card noPadding>
        <div className="p-3">
          <div className="flex flex-col gap-3 sm:flex-row">
            <div className="flex-1">
              <SearchInput
                placeholder="Tìm theo mã, tên..."
                value={search}
                onChange={(e) => handleSearch(e.target.value)}
                onClear={() => handleSearch('')}
              />
            </div>
            <div className="flex gap-2">
              <select
                className="rounded-md border border-gray-300 px-3 py-2 text-sm"
                value={filters.categoryId || 'all'}
                onChange={(e) => handleCategoryFilter(e.target.value)}
              >
                <option value="all">Tất cả loại</option>
                {categories.map((c: InventoryCategoryOption) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
              <Button
                variant={filters.lowStockOnly === 'true' ? 'primary' : 'outline'}
                size="sm"
                onClick={handleLowStockFilter}
              >
                <AlertTriangle className="h-4 w-4" />
                Sắp hết
              </Button>
            </div>
          </div>
        </div>

        {isLoading ? (
          <div className="p-4">
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="h-12 animate-pulse rounded bg-gray-100" />
              ))}
            </div>
          </div>
        ) : isError && items.length === 0 ? (
          <EmptyState
            icon={<AlertCircle className="h-10 w-10 text-red-400 dark:text-red-500" />}
            title="Không thể tải danh sách vật tư"
            description="Đã có lỗi xảy ra khi tải dữ liệu. Vui lòng thử lại."
            action={{ label: 'Thử lại', onClick: () => refetch() }}
          />
        ) : items.length === 0 ? (
          <EmptyState
            icon={<Package className="h-10 w-10 text-gray-400" />}
            title="Chưa có vật tư nào"
            description="Bắt đầu bằng việc thêm vật tư đầu tiên"
            action={
              canCreateInventoryItem
                ? { label: 'Thêm vật tư', onClick: () => setShowAddModal(true) }
                : undefined
            }
          />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50">
                    <th className="px-4 py-3 font-medium text-gray-600">Mã</th>
                    <th className="px-4 py-3 font-medium text-gray-600">Tên</th>
                    <th className="px-4 py-3 font-medium text-gray-600">Loại</th>
                    <th className="px-4 py-3 font-medium text-gray-600 text-right">Tồn</th>
                    <th className="px-4 py-3 font-medium text-gray-600 text-right">Tối thiểu</th>
                    <th className="px-4 py-3 font-medium text-gray-600 text-right">Giá nhập</th>
                    <th className="px-4 py-3 font-medium text-gray-600">Trạng thái</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => {
                    const stockStatus = getStockStatus(item);
                    return (
                      <tr
                        key={item.id}
                        className={`border-b border-gray-50 hover:bg-gray-50 cursor-pointer ${getStockStatusColor(stockStatus)}`}
                        onClick={() => navigate(`/inventory/items/${item.id}`)}
                      >
                        <td className="px-4 py-3 font-mono text-xs text-gray-500">
                          {item.code}
                        </td>
                        <td className="px-4 py-3 font-medium text-gray-900">
                          {item.name}
                        </td>
                        <td className="px-4 py-3 text-gray-600">
                          {item.category?.name ?? '—'}
                        </td>
                        <td className={`px-4 py-3 text-right ${stockStatus === 'out_of_stock' ? 'text-red-600 font-medium' : stockStatus === 'low_stock' ? 'text-amber-600 font-medium' : 'text-gray-900'}`}>
                          {item.currentQuantity}
                        </td>
                        <td className="px-4 py-3 text-right text-gray-600">
                          {item.minStockLevel}
                        </td>
                        <td className="px-4 py-3 text-right text-gray-900">
                          {formatCurrency(item.costPrice)}
                        </td>
                        <td className="px-4 py-3">
                          <StatusBadge status={stockStatus} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {totalPages > 1 && (
              <div className="border-t border-gray-100 px-4 py-3">
                <Pagination
                  currentPage={filters.page || 1}
                  totalPages={totalPages}
                  totalItems={totalItems}
                  pageSize={PAGE_SIZE}
                  onPageChange={handlePageChange}
                />
              </div>
            )}
          </>
        )}
      </Card>

      <Modal isOpen={showAddModal} onClose={resetAddForm} title="Thêm vật tư">
        <div className="space-y-4">
          <Input
            label="Mã (SKU)"
            required
            value={newSku}
            onChange={(e) => setNewSku(e.target.value)}
            placeholder="VD: COMP-A2"
          />
          <Input
            label="Tên vật tư"
            required
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="VD: Composite A2 (tuýp 4g)"
          />
          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Đơn vị"
              required
              value={newUnit}
              onChange={(e) => setNewUnit(e.target.value)}
              placeholder="VD: tuýp, hộp, lọ"
            />
            <Select
              label="Loại"
              value={newCategoryId}
              onChange={(e) => setNewCategoryId(e.target.value)}
              options={[
                { value: '', label: 'Không phân loại' },
                ...categories.map((c: InventoryCategoryOption) => ({ value: c.id, label: c.name })),
              ]}
            />
          </div>
          <div className="grid grid-cols-3 gap-4">
            <Input
              label="Tồn kho ban đầu"
              type="number"
              min="0"
              value={newQuantity}
              onChange={(e) => setNewQuantity(e.target.value)}
            />
            <Input
              label="Mức tối thiểu"
              type="number"
              min="0"
              value={newMinStock}
              onChange={(e) => setNewMinStock(e.target.value)}
              placeholder="0"
            />
            <Input
              label="Giá nhập (VND)"
              type="number"
              min="0"
              value={newCostPrice}
              onChange={(e) => setNewCostPrice(e.target.value)}
              placeholder="0"
            />
          </div>
          <div className="flex justify-end gap-3 pt-4 border-t border-gray-100">
            <Button variant="outline" onClick={resetAddForm}>
              Hủy
            </Button>
            <Button
              onClick={() => createMutation.mutate()}
              isLoading={createMutation.isPending}
              disabled={!newSku.trim() || !newName.trim() || !newUnit.trim()}
            >
              Thêm vật tư
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
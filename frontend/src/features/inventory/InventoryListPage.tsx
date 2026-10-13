import { useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
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
  const { t } = useTranslation();
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
      notify.success(t('uiOperations.inventoryCreated'));
      resetAddForm();
    },
    onError: (err) => {
      notify.error(getApiErrorMessage(err, t('uiOperations.inventoryCreateFailed')));
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
    if (status === 'out_of_stock') return 'bg-red-50 dark:bg-red-950/40';
    if (status === 'low_stock') return 'bg-amber-50 dark:bg-amber-950/40';
    return '';
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">{t('uiOperations.inventoryTitle')}</h1>
          <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">
            {t('uiOperations.inventoryDescription')}
          </p>
        </div>
        <PermissionGuard permission="inventory.create">
          <Button onClick={() => setShowAddModal(true)}>
            <Plus className="h-4 w-4" />
            {t('uiOperations.addItem')}
          </Button>
        </PermissionGuard>
      </div>

      <Card noPadding>
        <div className="p-3">
          <div className="flex flex-col gap-3 sm:flex-row">
            <div className="flex-1">
              <SearchInput
                placeholder={t('uiOperations.inventorySearch')}
                value={search}
                onChange={(e) => handleSearch(e.target.value)}
                onClear={() => handleSearch('')}
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <select
                aria-label={t('uiOperations.itemType')}
                className="min-w-0 max-w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 dark:border-surface-600 dark:bg-surface-800 dark:text-gray-100"
                value={filters.categoryId || 'all'}
                onChange={(e) => handleCategoryFilter(e.target.value)}
              >
                <option value="all">{t('uiOperations.allTypes')}</option>
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
                {t('uiOperations.runningLow')}
              </Button>
            </div>
          </div>
        </div>

        {isLoading ? (
          <div className="p-4">
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="h-12 animate-pulse rounded bg-gray-100 dark:bg-surface-800" />
              ))}
            </div>
          </div>
        ) : isError && items.length === 0 ? (
          <EmptyState
            icon={<AlertCircle className="h-10 w-10 text-red-400 dark:text-red-500" />}
            title={t('uiOperations.loadInventoryFailed')}
            description={t('uiOperations.loadDataFailedRetry')}
            action={{ label: t('uiOperations.retry'), onClick: () => refetch() }}
          />
        ) : items.length === 0 ? (
          <EmptyState
            icon={<Package className="h-10 w-10 text-gray-400" />}
            title={t('uiOperations.noItems')}
            description={t('uiOperations.addFirstItem')}
            action={
              canCreateInventoryItem
                ? { label: t('uiOperations.addItem'), onClick: () => setShowAddModal(true) }
                : undefined
            }
          />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-left text-sm">
                <thead>
                  <tr className="border-b border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800">
                    <th className="px-4 py-3 font-medium text-gray-600 dark:text-gray-300">{t('uiOperations.code')}</th>
                    <th className="px-4 py-3 font-medium text-gray-600 dark:text-gray-300">{t('uiOperations.name')}</th>
                    <th className="px-4 py-3 font-medium text-gray-600 dark:text-gray-300">{t('uiOperations.category')}</th>
                    <th className="px-4 py-3 font-medium text-gray-600 dark:text-gray-300 text-right">{t('uiOperations.stock')}</th>
                    <th className="px-4 py-3 font-medium text-gray-600 dark:text-gray-300 text-right">{t('uiOperations.minimum')}</th>
                    <th className="px-4 py-3 font-medium text-gray-600 dark:text-gray-300 text-right">{t('uiOperations.purchasePrice')}</th>
                    <th className="px-4 py-3 font-medium text-gray-600 dark:text-gray-300">{t('uiOperations.status')}</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => {
                    const stockStatus = getStockStatus(item);
                    return (
                      <tr
                        key={item.id}
                        className={`border-b border-gray-50 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer ${getStockStatusColor(stockStatus)}`}
                        onClick={() => navigate(`/inventory/items/${item.id}`)}
                      >
                        <td className="px-4 py-3 font-mono text-xs text-gray-500 dark:text-gray-400">
                          {item.code}
                        </td>
                        <td className="px-4 py-3 font-medium text-gray-900 dark:text-gray-100">
                          {item.name}
                        </td>
                        <td className="px-4 py-3 text-gray-600 dark:text-gray-300">
                          {item.category?.name ?? '—'}
                        </td>
                        <td className={`px-4 py-3 text-right ${stockStatus === 'out_of_stock' ? 'text-red-600 dark:text-red-400 font-medium' : stockStatus === 'low_stock' ? 'text-amber-600 dark:text-amber-400 font-medium' : 'text-gray-900 dark:text-gray-100'}`}>
                          {item.currentQuantity}
                        </td>
                        <td className="px-4 py-3 text-right text-gray-600 dark:text-gray-300">
                          {item.minStockLevel}
                        </td>
                        <td className="px-4 py-3 text-right text-gray-900 dark:text-gray-100">
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
              <div className="border-t border-gray-100 dark:border-gray-800 px-4 py-3">
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

      <Modal isOpen={showAddModal} onClose={resetAddForm} title={t('uiOperations.addItem')}>
        <div className="space-y-4">
          <Input
            label={t('uiOperations.sku')}
            required
            value={newSku}
            onChange={(e) => setNewSku(e.target.value)}
            placeholder={t('uiOperations.inventorySkuExample')}
          />
          <Input
            label={t('uiOperations.itemName')}
            required
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder={t('uiOperations.itemNameExample')}
          />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Input
              label={t('uiOperations.unit')}
              required
              value={newUnit}
              onChange={(e) => setNewUnit(e.target.value)}
              placeholder={t('uiOperations.unitExample')}
            />
            <Select
              label={t('uiOperations.category')}
              value={newCategoryId}
              onChange={(e) => setNewCategoryId(e.target.value)}
              options={[
                { value: '', label: t('uiOperations.uncategorized') },
                ...categories.map((c: InventoryCategoryOption) => ({ value: c.id, label: c.name })),
              ]}
            />
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Input
              label={t('uiOperations.initialStock')}
              type="number"
              min="0"
              value={newQuantity}
              onChange={(e) => setNewQuantity(e.target.value)}
            />
            <Input
              label={t('uiOperations.minimum')}
              type="number"
              min="0"
              value={newMinStock}
              onChange={(e) => setNewMinStock(e.target.value)}
              placeholder="0"
            />
            <Input
              label={t('uiOperations.purchasePriceVnd')}
              type="number"
              min="0"
              value={newCostPrice}
              onChange={(e) => setNewCostPrice(e.target.value)}
              placeholder="0"
            />
          </div>
          <div className="flex justify-end gap-3 pt-4 border-t border-gray-100 dark:border-gray-800">
            <Button variant="outline" onClick={resetAddForm}>
              {t('uiOperations.cancel')}
            </Button>
            <Button
              onClick={() => createMutation.mutate()}
              isLoading={createMutation.isPending}
              disabled={!newSku.trim() || !newName.trim() || !newUnit.trim()}
            >
              {t('uiOperations.addItem')}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

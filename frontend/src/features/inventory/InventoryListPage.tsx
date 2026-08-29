import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Plus, Package, AlertTriangle } from 'lucide-react';
import { inventoryApi, type InventoryCategoryOption } from '@/types/inventory';
import { Button, Card, StatusBadge, SearchInput, Pagination, EmptyState } from '@/components/ui';
import { formatCurrency } from '@/lib/format';
import type { InventoryItem, InventoryFilters } from '@/types/inventory';

const PAGE_SIZE = 20;

export default function InventoryListPage() {
  const navigate = useNavigate();

  // categoryId is a UUID fetched from /inventory/categories; UI keeps
  // the selection as the raw UUID and forwards it to the backend.
  const [filters, setFilters] = useState<InventoryFilters>({
    page: 1,
    pageSize: PAGE_SIZE,
    status: 'ACTIVE',
  });
  const [search, setSearch] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['inventory', filters],
    queryFn: () => inventoryApi.list(filters),
  });

  const { data: categories = [] } = useQuery({
    queryKey: ['inventory-categories'],
    queryFn: () => inventoryApi.listCategories(),
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
        <Button onClick={() => navigate('/inventory/items/new')}>
          <Plus className="h-4 w-4" />
          Thêm vật tư
        </Button>
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
        ) : items.length === 0 ? (
          <EmptyState
            icon={<Package className="h-10 w-10 text-gray-400" />}
            title="Chưa có vật tư nào"
            description="Bắt đầu bằng việc thêm vật tư đầu tiên"
            action={{
              label: 'Thêm vật tư',
              onClick: () => navigate('/inventory/items/new'),
            }}
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
                    <th className="px-4 py-3 font-medium text-gray-600 text-right">Giá bán</th>
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
                          {formatCurrency(item.sellingPrice)}
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
    </div>
  );
}
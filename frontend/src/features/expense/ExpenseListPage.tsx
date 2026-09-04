import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import {
  Plus,
  Edit,
  Trash2,
  Check,
  X,
  Receipt,
  RefreshCw,
  DollarSign,
} from 'lucide-react';
import { expenseApi } from './expenseApi';
import { Button, Card, Modal, Input, Select, DatePicker, Textarea, StatusBadge } from '@/components/ui';
import { notify } from '@/components/ui/Toast';
import { formatCurrency } from '@/lib/format';
import { getApiErrorMessage } from '@/lib/errors';
import { useAuthStore } from '@/stores/authStore';
import type { Expense, ExpenseCategory, CreateExpensePayload, ExpenseFilters } from './types';

function ExpenseFormModal({
  expense,
  categories,
  onClose,
  onSave,
}: {
  expense?: Expense;
  categories: ExpenseCategory[];
  onClose: () => void;
  onSave: (data: CreateExpensePayload) => Promise<void>;
}) {
  const [form, setForm] = useState<CreateExpensePayload>({
    amount: expense?.amount ?? 0,
    description: expense?.description ?? '',
    expenseDate: expense?.expenseDate ?? format(new Date(), 'yyyy-MM-dd'),
    categoryId: expense?.category?.id,
    notes: expense?.notes ?? '',
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await onSave(form);
    onClose();
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <Input
        label="Số tiền (VND)"
        type="number"
        value={form.amount}
        onChange={(e) => setForm({ ...form, amount: Number(e.target.value) })}
        required
        min={0}
      />
      <Input
        label="Mô tả"
        value={form.description}
        onChange={(e) => setForm({ ...form, description: e.target.value })}
        required
        placeholder="Mô tả chi phí..."
      />
      <DatePicker
        label="Ngày chi"
        value={form.expenseDate}
        onChange={(val: string) => setForm({ ...form, expenseDate: val })}
        required
      />
      <Select
        label="Danh mục"
        value={form.categoryId ?? ''}
        onChange={(e) => setForm({ ...form, categoryId: e.target.value || undefined })}
        options={[
          { value: '', label: '-- Chọn danh mục --' },
          ...categories.map((c) => ({ value: c.id, label: c.name })),
        ]}
      />
      <Textarea
        label="Ghi chú"
        value={form.notes ?? ''}
        onChange={(e) => setForm({ ...form, notes: e.target.value })}
        placeholder="Ghi chú thêm..."
        rows={3}
      />
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onClose}>Hủy</Button>
        <Button type="submit">{expense ? 'Cập nhật' : 'Tạo mới'}</Button>
      </div>
    </form>
  );
}

export default function ExpenseListPage() {
  const qc = useQueryClient();
  const currentUserId = useAuthStore((s) => s.user?.id);
  const [searchParams, setSearchParams] = useSearchParams();
  const [filters, setFilters] = useState<ExpenseFilters>(() => ({
    page: Number(searchParams.get('page')) || 1,
    // The summary cards and the search box below both derive from
    // whatever page `data.data` holds (see `filteredData`), not a
    // separate all-records total — a pageSize of 20 made "Tổng chi phí"
    // silently mean "total of the 20 rows currently on screen" and made
    // search only look within those 20. 200 keeps everything on one
    // page for any clinic-realistic expense count so both are accurate.
    pageSize: 200,
    status: (searchParams.get('status') as ExpenseFilters['status']) || undefined,
  }));
  const [search, setSearch] = useState('');

  // Keep the filter/page selection in the URL — otherwise a refresh or a
  // shared link silently drops the current status filter and page.
  useEffect(() => {
    const next = new URLSearchParams();
    if (filters.status) next.set('status', filters.status);
    if (filters.page && filters.page !== 1) next.set('page', String(filters.page));
    setSearchParams(next, { replace: true });
  }, [filters.status, filters.page, setSearchParams]);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Expense | undefined>();
  const [confirmDelete, setConfirmDelete] = useState<Expense | null>(null);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['expenses', filters],
    queryFn: () => expenseApi.list(filters),
  });

  const { data: categories = [] } = useQuery({
    queryKey: ['expense-categories'],
    queryFn: () => expenseApi.listCategories(),
    staleTime: Infinity,
  });

  const createMutation = useMutation({
    mutationFn: (payload: CreateExpensePayload) => expenseApi.create(payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['expenses'] });
      notify.success('Tạo chi phí thành công');
    },
    onError: () => notify.error('Không thể tạo chi phí. Vui lòng thử lại.'),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Parameters<typeof expenseApi.update>[1] }) =>
      expenseApi.update(id, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['expenses'] });
      notify.success('Cập nhật chi phí thành công');
    },
    onError: () => notify.error('Không thể cập nhật chi phí. Vui lòng thử lại.'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => expenseApi.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['expenses'] });
      setConfirmDelete(null);
      notify.success('Xóa chi phí thành công');
    },
    onError: () => {
      setConfirmDelete(null);
      notify.error('Không thể xóa chi phí. Vui lòng thử lại.');
    },
  });

  const approveMutation = useMutation({
    mutationFn: (id: string) => expenseApi.approve(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['expenses'] });
      notify.success('Duyệt chi phí thành công');
    },
    onError: (err) => notify.error(getApiErrorMessage(err, 'Không thể duyệt chi phí. Vui lòng thử lại.')),
  });

  const rejectMutation = useMutation({
    mutationFn: (id: string) => expenseApi.reject(id, 'Từ chối'),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['expenses'] });
      notify.success('Từ chối chi phí thành công');
    },
    onError: () => notify.error('Không thể từ chối chi phí. Vui lòng thử lại.'),
  });

  const filteredData = (data?.data ?? []).filter((e) =>
    e.description.toLowerCase().includes(search.toLowerCase()) ||
    e.code.toLowerCase().includes(search.toLowerCase())
  );

  const totalAmount = filteredData.reduce((s, e) => s + e.amount, 0);
  const approvedAmount = filteredData.filter(e => e.status === 'APPROVED').reduce((s, e) => s + e.amount, 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">Quản lý chi phí</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Theo dõi chi phí hoạt động của phòng khám
          </p>
        </div>
        <Button onClick={() => { setEditing(undefined); setShowForm(true); }}>
          <Plus className="h-4 w-4" />
          Thêm chi phí
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <div className="flex items-center gap-4">
            <div className="rounded-full bg-blue-100 dark:bg-blue-900 p-3">
              <DollarSign className="h-6 w-6 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400">Tổng chi phí</p>
              <p className="text-xl font-semibold text-gray-900 dark:text-white">{formatCurrency(totalAmount)}</p>
            </div>
          </div>
        </Card>
        <Card>
          <div className="flex items-center gap-4">
            <div className="rounded-full bg-green-100 dark:bg-green-900 p-3">
              <Check className="h-6 w-6 text-green-600 dark:text-green-400" />
            </div>
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400">Đã duyệt</p>
              <p className="text-xl font-semibold text-green-600 dark:text-green-400">{formatCurrency(approvedAmount)}</p>
            </div>
          </div>
        </Card>
        <Card>
          <div className="flex items-center gap-4">
            <div className="rounded-full bg-gray-100 dark:bg-gray-700 p-3">
              <Receipt className="h-6 w-6 text-gray-600 dark:text-gray-400" />
            </div>
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400">Số khoản</p>
              <p className="text-xl font-semibold text-gray-900 dark:text-white">{filteredData.length}</p>
            </div>
          </div>
        </Card>
      </div>

      {/* Filters */}
      <Card noPadding className="p-4">
        <div className="flex flex-wrap items-end gap-4">
          <div className="flex-1 min-w-[200px]">
            <Input
              placeholder="Tìm kiếm mô tả, mã..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div>
            <Select
              value={filters.status ?? 'all'}
              onChange={(e) => setFilters({ ...filters, status: e.target.value as ExpenseFilters['status'], page: 1 })}
              options={[
                { value: 'all', label: 'Tất cả trạng thái' },
                { value: 'DRAFT', label: 'Nháp' },
                { value: 'APPROVED', label: 'Đã duyệt' },
                { value: 'REJECTED', label: 'Từ chối' },
                { value: 'REIMBURSED', label: 'Đã hoàn tiền' },
              ]}
              className="min-w-[160px]"
            />
          </div>
        </div>
      </Card>

      {/* Table */}
      <Card noPadding>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
                <th className="text-left py-3 px-4 font-medium text-gray-600 dark:text-gray-400">Mã</th>
                <th className="text-left py-3 px-4 font-medium text-gray-600 dark:text-gray-400">Mô tả</th>
                <th className="text-left py-3 px-4 font-medium text-gray-600 dark:text-gray-400">Danh mục</th>
                <th className="text-left py-3 px-4 font-medium text-gray-600 dark:text-gray-400">Ngày</th>
                <th className="text-right py-3 px-4 font-medium text-gray-600 dark:text-gray-400">Số tiền</th>
                <th className="text-center py-3 px-4 font-medium text-gray-600 dark:text-gray-400">Trạng thái</th>
                <th className="text-center py-3 px-4 font-medium text-gray-600 dark:text-gray-400">Hành động</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-gray-400">Đang tải...</td>
                </tr>
              ) : isError && filteredData.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-red-400 dark:text-red-500">
                    Không thể tải danh sách chi phí.{' '}
                    <button type="button" onClick={() => refetch()} className="underline hover:no-underline">
                      Thử lại
                    </button>
                  </td>
                </tr>
              ) : filteredData.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-gray-400 dark:text-gray-500">Không có chi phí nào</td>
                </tr>
              ) : filteredData.map((expense) => (
                <tr key={expense.id} className="border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800">
                  <td className="py-3 px-4 font-mono text-gray-900 dark:text-white">{expense.code}</td>
                  <td className="py-3 px-4 text-gray-700 dark:text-gray-300">
                    <div>{expense.description}</div>
                    {expense.notes && <div className="text-xs text-gray-400">{expense.notes}</div>}
                  </td>
                  <td className="py-3 px-4 text-gray-700 dark:text-gray-300">
                    {expense.category?.name ?? '—'}
                  </td>
                  <td className="py-3 px-4 text-gray-500 dark:text-gray-400">
                    {format(new Date(expense.expenseDate), 'dd/MM/yyyy')}
                  </td>
                  <td className="py-3 px-4 text-right font-medium text-gray-900 dark:text-white">
                    {formatCurrency(expense.amount)}
                  </td>
                  <td className="py-3 px-4 text-center">
                    <StatusBadge status={expense.status} />
                  </td>
                  <td className="py-3 px-4">
                    <div className="flex items-center justify-center gap-1">
                      {expense.status === 'DRAFT' && (
                        <>
                          <button
                            onClick={() => { setEditing(expense); setShowForm(true); }}
                            className="rounded p-1.5 hover:bg-gray-200 dark:hover:bg-gray-700"
                            title="Sửa"
                          >
                            <Edit className="h-4 w-4 text-gray-500" />
                          </button>
                          {expense.createdBy && expense.createdBy === currentUserId ? (
                            <span
                              className="px-1.5 text-xs text-gray-400"
                              title="Cần một người khác duyệt khoản chi do bạn tạo"
                            >
                              Chờ duyệt
                            </span>
                          ) : (
                            <>
                              <button
                                onClick={() => approveMutation.mutate(expense.id)}
                                className="rounded p-1.5 hover:bg-green-100 dark:hover:bg-green-900"
                                title="Duyệt"
                              >
                                <Check className="h-4 w-4 text-green-600" />
                              </button>
                              <button
                                onClick={() => rejectMutation.mutate(expense.id)}
                                className="rounded p-1.5 hover:bg-red-100 dark:hover:bg-red-900"
                                title="Từ chối"
                              >
                                <X className="h-4 w-4 text-red-600" />
                              </button>
                            </>
                          )}
                          <button
                            onClick={() => setConfirmDelete(expense)}
                            className="rounded p-1.5 hover:bg-red-100 dark:hover:bg-red-900"
                            title="Xóa"
                          >
                            <Trash2 className="h-4 w-4 text-red-500" />
                          </button>
                        </>
                      )}
                      {expense.status === 'APPROVED' && (
                        <button
                          onClick={async () => {
                            await expenseApi.markReimbursed(expense.id);
                            qc.invalidateQueries({ queryKey: ['expenses'] });
                            notify.success('Đánh dấu hoàn tiền thành công');
                          }}
                          className="rounded p-1.5 hover:bg-blue-100 dark:hover:bg-blue-900"
                          title="Đánh dấu hoàn tiền"
                        >
                          <RefreshCw className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {data && data.pagination.totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-gray-200 dark:border-gray-700 px-4 py-3">
            <p className="text-sm text-gray-500">
              Trang {data.pagination.page}/{data.pagination.totalPages} — {data.pagination.total} kết quả
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={filters.page === 1}
                onClick={() => setFilters({ ...filters, page: (filters.page ?? 1) - 1 })}
              >
                Trước
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={filters.page === data.pagination.totalPages}
                onClick={() => setFilters({ ...filters, page: (filters.page ?? 1) + 1 })}
              >
                Sau
              </Button>
            </div>
          </div>
        )}
      </Card>

      {/* Create/Edit Modal */}
      <Modal
        open={showForm}
        onClose={() => setShowForm(false)}
        title={editing ? 'Sửa chi phí' : 'Thêm chi phí mới'}
      >
        <ExpenseFormModal
          expense={editing}
          categories={categories}
          onClose={() => setShowForm(false)}
          onSave={async (payload) => {
            if (editing) {
              await updateMutation.mutateAsync({ id: editing.id, payload });
            } else {
              await createMutation.mutateAsync(payload);
            }
          }}
        />
      </Modal>

      {/* Delete Confirmation */}
      <Modal
        open={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        title="Xác nhận xóa"
      >
        <p className="text-gray-600 dark:text-gray-400">
          Bạn có chắc muốn xóa chi phí <strong>{confirmDelete?.code}</strong> không?
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="outline" onClick={() => setConfirmDelete(null)}>Hủy</Button>
          <Button
            variant="danger"
            onClick={async () => {
              if (confirmDelete) {
                await deleteMutation.mutateAsync(confirmDelete.id);
                setConfirmDelete(null);
              }
            }}
          >
            Xóa
          </Button>
        </div>
      </Modal>
    </div>
  );
}

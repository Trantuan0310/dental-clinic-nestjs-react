import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
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
import { Button, Card, Modal, Input, Select, DatePicker, Textarea, ExpenseStatusBadge } from '@/components/ui';
import { notify } from '@/components/ui/Toast';
import { formatCurrency } from '@/lib/format';
import { getApiErrorMessage } from '@/lib/errors';
import { PermissionGuard } from '@/components/PermissionGuard';
import { useAuthStore } from '@/stores/authStore';
import type { Expense, ExpenseCategory, CreateExpensePayload, ExpenseFilters } from './types';
import { clinicToday } from '@/lib/clinicTime';

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
  const { t } = useTranslation();
  const [form, setForm] = useState<CreateExpensePayload>({
    amount: expense?.amount ?? 0,
    description: expense?.description ?? '',
    expenseDate: expense?.expenseDate ?? clinicToday(),
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
        label={t('uiOperations.amount') + ' (VND)'}
        type="number"
        value={form.amount}
        onChange={(e) => setForm({ ...form, amount: Number(e.target.value) })}
        required
        min={0}
      />
      <Input
        label={t('uiOperations.description')}
        value={form.description}
        onChange={(e) => setForm({ ...form, description: e.target.value })}
        required
        placeholder={t('uiOperations.expenseDescriptionPlaceholder')}
      />
      <DatePicker
        label={t('uiOperations.expenseDate')}
        value={form.expenseDate}
        onChange={(val: string) => setForm({ ...form, expenseDate: val })}
        required
      />
      <Select
        label={t('uiOperations.category')}
        value={form.categoryId ?? ''}
        onChange={(e) => setForm({ ...form, categoryId: e.target.value || undefined })}
        options={[
          { value: '', label: t('uiOperations.selectCategory') },
          ...categories.map((c) => ({ value: c.id, label: c.name })),
        ]}
      />
      <Textarea
        label={t('uiOperations.note')}
        value={form.notes ?? ''}
        onChange={(e) => setForm({ ...form, notes: e.target.value })}
        placeholder={t('uiOperations.additionalNotes')}
        rows={3}
      />
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onClose}>{t('uiOperations.cancel')}</Button>
        <Button type="submit">{expense ? t('uiOperations.update') : t('uiOperations.create')}</Button>
      </div>
    </form>
  );
}

export default function ExpenseListPage() {
  const { t } = useTranslation();
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
    // A bookmarked/back-navigated URL could still carry the old '?status=all'
    // sentinel from before it was excluded from the URL sync below — treat
    // it the same as unset rather than sending 'all' to the API.
    status: (() => {
      const raw = searchParams.get('status');
      return raw && raw !== 'all' ? (raw as ExpenseFilters['status']) : undefined;
    })(),
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
      notify.success(t('uiOperations.expenseCreated'));
    },
    onError: () => notify.error(t('uiOperations.expenseCreateFailed')),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Parameters<typeof expenseApi.update>[1] }) =>
      expenseApi.update(id, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['expenses'] });
      notify.success(t('uiOperations.expenseUpdated'));
    },
    onError: () => notify.error(t('uiOperations.expenseUpdateFailed')),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => expenseApi.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['expenses'] });
      setConfirmDelete(null);
      notify.success(t('uiOperations.expenseDeleted'));
    },
    onError: () => {
      setConfirmDelete(null);
      notify.error(t('uiOperations.expenseDeleteFailed'));
    },
  });

  const approveMutation = useMutation({
    mutationFn: (id: string) => expenseApi.approve(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['expenses'] });
      notify.success(t('uiOperations.expenseApproved'));
    },
    onError: (err) => notify.error(getApiErrorMessage(err, t('uiOperations.expenseApproveFailed'))),
  });

  const rejectMutation = useMutation({
    mutationFn: (id: string) => expenseApi.reject(id, 'Từ chối'),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['expenses'] });
      notify.success(t('uiOperations.expenseRejected'));
    },
    onError: () => notify.error(t('uiOperations.expenseRejectFailed')),
  });

  const reimburseMutation = useMutation({
    mutationFn: (id: string) => expenseApi.markReimbursed(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['expenses'] });
      notify.success(t('uiOperations.expenseReimbursed'));
    },
    onError: (err) => notify.error(getApiErrorMessage(err, t('uiOperations.expenseReimburseFailed'))),
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
      <div className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">{t('uiOperations.expenseManagement')}</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            {t('uiOperations.expenseDescription')}
          </p>
        </div>
        <PermissionGuard permission="expense.create">
          <Button onClick={() => { setEditing(undefined); setShowForm(true); }}>
            <Plus className="h-4 w-4" />
            {t('uiOperations.addExpense')}
          </Button>
        </PermissionGuard>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <div className="flex items-center gap-4">
            <div className="rounded-full bg-blue-100 dark:bg-blue-900 p-3">
              <DollarSign className="h-6 w-6 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400">{t('uiOperations.expenseTotal')}</p>
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
              <p className="text-sm text-gray-500 dark:text-gray-400">{t('uiOperations.approved')}</p>
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
              <p className="text-sm text-gray-500 dark:text-gray-400">{t('uiOperations.expenseCount')}</p>
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
              placeholder={t('uiOperations.expenseSearch')}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div>
            <Select
              value={filters.status ?? 'all'}
              onChange={(e) => {
                const value = e.target.value;
                setFilters({
                  ...filters,
                  // 'all' is a UI-only sentinel for "no filter" — the backend
                  // rejects it (not a real ExpenseStatus), so send undefined
                  // instead, matching how filters.status starts out unset.
                  status: value === 'all' ? undefined : (value as ExpenseFilters['status']),
                  page: 1,
                });
              }}
              options={[
                { value: 'all', label: t('uiOperations.allStatuses') },
                { value: 'DRAFT', label: t('uiOperations.draft') },
                { value: 'APPROVED', label: t('uiOperations.approved') },
                { value: 'REJECTED', label: t('uiOperations.reject') },
                { value: 'REIMBURSED', label: t('uiOperations.reimbursed') },
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
                <th className="text-left py-3 px-4 font-medium text-gray-600 dark:text-gray-400">{t('uiOperations.code')}</th>
                <th className="text-left py-3 px-4 font-medium text-gray-600 dark:text-gray-400">{t('uiOperations.description')}</th>
                <th className="text-left py-3 px-4 font-medium text-gray-600 dark:text-gray-400">{t('uiOperations.category')}</th>
                <th className="text-left py-3 px-4 font-medium text-gray-600 dark:text-gray-400">{t('uiOperations.date')}</th>
                <th className="text-right py-3 px-4 font-medium text-gray-600 dark:text-gray-400">{t('uiOperations.amount')}</th>
                <th className="text-center py-3 px-4 font-medium text-gray-600 dark:text-gray-400">{t('uiOperations.status')}</th>
                <th className="text-center py-3 px-4 font-medium text-gray-600 dark:text-gray-400">{t('uiOperations.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-gray-400">{t('uiOperations.loading')}</td>
                </tr>
              ) : isError && filteredData.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-red-400 dark:text-red-500">
                    {t('uiOperations.loadExpensesFailed')}{' '}
                    <button type="button" onClick={() => refetch()} className="underline hover:no-underline">
                      {t('uiOperations.retry')}
                    </button>
                  </td>
                </tr>
              ) : filteredData.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-gray-400 dark:text-gray-500">{t('uiOperations.noExpenses')}</td>
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
                    <ExpenseStatusBadge status={expense.status} />
                  </td>
                  <td className="py-3 px-4">
                    <div className="flex items-center justify-center gap-1">
                      {expense.status === 'DRAFT' && (
                        <>
                          <PermissionGuard permission="expense.update">
                            <button
                              onClick={() => { setEditing(expense); setShowForm(true); }}
                              className="rounded p-1.5 hover:bg-gray-200 dark:hover:bg-gray-700"
                              title={t('uiOperations.edit')}
                            >
                              <Edit className="h-4 w-4 text-gray-500 dark:text-surface-400" />
                            </button>
                          </PermissionGuard>
                          {expense.createdBy && expense.createdBy === currentUserId ? (
                            <span
                              className="px-1.5 text-xs text-gray-400"
                              title={t('uiOperations.expenseApprovalByAnother')}
                            >
                              {t('uiOperations.pendingApproval')}
                            </span>
                          ) : (
                            <>
                              <PermissionGuard permission="expense.approve">
                                <button
                                  onClick={() => approveMutation.mutate(expense.id)}
                                  className="rounded p-1.5 hover:bg-green-100 dark:hover:bg-green-900"
                                  title={t('uiOperations.approve')}
                                >
                                  <Check className="h-4 w-4 text-green-600" />
                                </button>
                              </PermissionGuard>
                              <PermissionGuard permission="expense.approve">
                                <button
                                  onClick={() => rejectMutation.mutate(expense.id)}
                                  className="rounded p-1.5 hover:bg-red-100 dark:hover:bg-red-900"
                                  title={t('uiOperations.reject')}
                                >
                                  <X className="h-4 w-4 text-red-600" />
                                </button>
                              </PermissionGuard>
                            </>
                          )}
                          <PermissionGuard permission="expense.delete">
                            <button
                              onClick={() => setConfirmDelete(expense)}
                              className="rounded p-1.5 hover:bg-red-100 dark:hover:bg-red-900"
                              title={t('uiOperations.delete')}
                            >
                              <Trash2 className="h-4 w-4 text-red-500" />
                            </button>
                          </PermissionGuard>
                        </>
                      )}
                      {expense.status === 'APPROVED' && (
                        <PermissionGuard permission="expense.approve">
                          <button
                            onClick={() => reimburseMutation.mutate(expense.id)}
                            disabled={reimburseMutation.isPending}
                            className="rounded p-1.5 hover:bg-blue-100 dark:hover:bg-blue-900 disabled:opacity-50"
                            title={t('uiOperations.markReimbursed')}
                          >
                            <RefreshCw className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                          </button>
                        </PermissionGuard>
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
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-gray-200 dark:border-gray-700 px-4 py-3">
            <p className="text-sm text-gray-500">
              {t('uiOperations.paginationSummary', { page: data.pagination.page, totalPages: data.pagination.totalPages, total: data.pagination.total })}
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={filters.page === 1}
                onClick={() => setFilters({ ...filters, page: (filters.page ?? 1) - 1 })}
              >
                {t('uiOperations.previous')}
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={filters.page === data.pagination.totalPages}
                onClick={() => setFilters({ ...filters, page: (filters.page ?? 1) + 1 })}
              >
                {t('uiOperations.next')}
              </Button>
            </div>
          </div>
        )}
      </Card>

      {/* Create/Edit Modal */}
      <Modal
        open={showForm}
        onClose={() => setShowForm(false)}
        title={editing ? t('uiOperations.expenseEditTitle') : t('uiOperations.expenseAddTitle')}
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
            title={t('uiOperations.confirmDelete')}
      >
        <p className="text-gray-600 dark:text-gray-400">
          {t('uiOperations.confirmDeleteExpense')} <strong>{confirmDelete?.code}</strong>?
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="outline" onClick={() => setConfirmDelete(null)}>{t('uiOperations.cancel')}</Button>
          <Button
            variant="danger"
            onClick={async () => {
              if (confirmDelete) {
                await deleteMutation.mutateAsync(confirmDelete.id);
                setConfirmDelete(null);
              }
            }}
          >
            {t('uiOperations.delete')}
          </Button>
        </div>
      </Modal>
    </div>
  );
}

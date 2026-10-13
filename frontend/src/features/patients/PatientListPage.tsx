import { useState, useCallback, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, MoreHorizontal, Loader2, Trash2, AlertCircle } from 'lucide-react';
import { format } from 'date-fns';
import { vi } from 'date-fns/locale';
import { patientsApi } from '@/features/patients/imperativeApi';
import {
  Button,
  Card,
  StatusBadge,
  SearchInput,
  EmptyState,
  Modal,
  FormSkeleton,
  Select,
  DropdownMenu,
  DropdownMenuItem,
} from '@/components/ui';
import { notify } from '@/components/ui/Toast';
import type { PatientFilters, Patient } from '@/types/patients';
import { formatPhone } from '@/lib/format';
import { useTranslation } from 'react-i18next';

const PAGE_SIZE = 20;

export default function PatientListPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const { t } = useTranslation();

  const [filters, setFilters] = useState<PatientFilters>({
    pageSize: PAGE_SIZE,
    status: 'active',
  });
  const search = searchParams.get('q') ?? '';
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [cursor, setCursor] = useState<string | undefined>(undefined);
  const [rows, setRows] = useState<Patient[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);

  const { data, isLoading, isFetching, isError, refetch } = useQuery({
    queryKey: ['patients', filters, search, cursor],
    queryFn: () => patientsApi.list({ ...filters, q: search || undefined, cursor }),
  });

  useEffect(() => {
    setCursor(undefined);
    setRows([]);
  }, [search]);

  // Reset accumulated list when filters/search change (cursor is cleared).
  // Merge the latest page into the accumulator when paginating forward.
  useEffect(() => {
    if (!data) return;
    if (cursor === undefined) {
      setRows(data.data);
    } else {
      setRows((prev) => {
        const seen = new Set(prev.map((p) => p.id));
        const merged = [...prev];
        for (const item of data.data) {
          if (!seen.has(item.id)) merged.push(item);
        }
        return merged;
      });
    }
    setHasMore(data.pagination.hasMore);
    setNextCursor(data.pagination.nextCursor);
  }, [data, cursor]);

  const deleteMutation = useMutation({
    mutationFn: (id: string) => patientsApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['patients'] });
      setDeleteId(null);
      notify.success(t('uiClinical.patientDeleted'));
    },
    onError: () => {
      notify.error(t('uiClinical.patientDeleteError'));
    },
  });

  const handleSearch = useCallback((value: string) => {
    const next = new URLSearchParams(searchParams);
    const query = value.trim();
    if (query) next.set('q', query);
    else next.delete('q');
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  const handleLoadMore = useCallback(() => {
    if (nextCursor && !isFetching) setCursor(nextCursor);
  }, [nextCursor, isFetching]);

  const handleStatusFilter = useCallback((status: string) => {
    setCursor(undefined);
    setRows([]);
    setFilters((f) => ({
      ...f,
      status: status === 'all' ? undefined : (status as PatientFilters['status']),
    }));
  }, []);

  const patients = rows;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-surface-100">{t('uiClinical.patients')}</h1>
          <p className="mt-0.5 text-sm text-gray-500">
            {t('uiClinical.patientManagement')}
          </p>
        </div>
        <Button onClick={() => navigate('/patients/new')} className="sm:ml-auto">
          <Plus className="h-4 w-4" />
          {t('uiClinical.createPatient')}
        </Button>
      </div>

      <Card noPadding>
        <div className="p-3">
          <div className="flex flex-col gap-3 sm:flex-row">
            <div className="flex-1">
              <SearchInput
                placeholder={t('uiClinical.searchPatients')}
                value={search}
                onChange={(e) => handleSearch(e.target.value)}
                onClear={() => handleSearch('')}
              />
            </div>
            <div className="flex gap-2">
              <Select
                aria-label={t('uiClinical.status')}
                value={filters.status || 'all'}
                onChange={(e) => handleStatusFilter(e.target.value)}
                options={[
                  { value: 'all', label: t('uiClinical.all') },
                  { value: 'active', label: t('uiClinical.active') },
                ]}
                className="min-w-[160px]"
              />
            </div>
          </div>
        </div>

        {isLoading ? (
          <div className="p-4">
            <FormSkeleton rows={5} columns={5} />
          </div>
        ) : isError && patients.length === 0 ? (
          <EmptyState
            icon={<AlertCircle className="h-10 w-10 text-red-400 dark:text-red-500" />}
            title={t('uiClinical.patientListLoadError')}
            description={t('uiClinical.loadErrorRetry')}
            action={{
              label: t('uiClinical.retry'),
              onClick: () => refetch(),
            }}
          />
        ) : patients.length === 0 ? (
          <EmptyState
            title={t('uiClinical.noPatients')}
            description={t('uiClinical.createFirstPatient')}
            action={{
              label: t('uiClinical.createPatient'),
              onClick: () => navigate('/patients/new'),
            }}
          />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50">
                    <th className="px-4 py-3 font-medium text-gray-600 dark:text-surface-300">{t('uiClinical.patientCode')}</th>
                    <th className="px-4 py-3 font-medium text-gray-600 dark:text-surface-300">{t('uiClinical.fullName')}</th>
                    <th className="px-4 py-3 font-medium text-gray-600 dark:text-surface-300">{t('uiClinical.gender')}</th>
                    <th className="px-4 py-3 font-medium text-gray-600 dark:text-surface-300">{t('uiClinical.phone')}</th>
                    <th className="px-4 py-3 font-medium text-gray-600 dark:text-surface-300">{t('uiClinical.dateOfBirth')}</th>
                    <th className="px-4 py-3 font-medium text-gray-600 dark:text-surface-300">{t('uiClinical.status')}</th>
                    <th className="px-4 py-3 font-medium text-gray-600 w-12"></th>
                  </tr>
                </thead>
                <tbody>
                  {patients.map((patient) => (
                    <tr
                      key={patient.id}
                      className="border-b border-gray-50 hover:bg-gray-50 cursor-pointer"
                      onClick={() => navigate(`/patients/${patient.id}`)}
                    >
                      <td className="px-4 py-3 font-mono text-xs text-gray-500">
                        {patient.code}
                      </td>
                      <td className="px-4 py-3 font-medium text-gray-900">
                        {patient.fullName}
                      </td>
                      <td className="px-4 py-3 text-gray-600">
                        {patient.gender === 'male' ? t('uiClinical.male') : patient.gender === 'female' ? t('uiClinical.female') : t('uiClinical.other')}
                      </td>
                      <td className="px-4 py-3 text-gray-600">
                        {patient.phone ? formatPhone(patient.phone) : '-'}
                      </td>
                      <td className="px-4 py-3 text-gray-600">
                        {patient.dateOfBirth
                          ? format(new Date(patient.dateOfBirth), 'dd/MM/yyyy', { locale: vi })
                          : '-'}
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge status={patient.status} />
                      </td>
                      <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                        <DropdownMenu trigger={<MoreHorizontal className="h-4 w-4 text-gray-400" />}>
                          <DropdownMenuItem
                            variant="danger"
                            icon={<Trash2 className="h-4 w-4" />}
                            onClick={() => setDeleteId(patient.id)}
                          >
                            {t('uiClinical.delete')}
                          </DropdownMenuItem>
                        </DropdownMenu>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {hasMore && (
              <div className="flex items-center justify-center border-t border-gray-100 px-4 py-3">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleLoadMore}
                  isLoading={isFetching}
                >
                  {!isFetching && <Loader2 className="h-4 w-4" />}
                  {t('uiClinical.loadMore')}
                </Button>
              </div>
            )}
          </>
        )}
      </Card>

      {/* Delete Confirmation Modal */}
      <Modal
        isOpen={!!deleteId}
        onClose={() => setDeleteId(null)}
        title={t('uiClinical.confirmDeletePatient')}
        size="sm"
      >
        <p className="text-sm text-gray-600">
          {t('uiClinical.confirmDeletePatientText')}
        </p>
        <div className="mt-4 flex justify-end gap-3">
          <Button variant="outline" onClick={() => setDeleteId(null)}>
            {t('uiClinical.cancel')}
          </Button>
          <Button
            variant="danger"
            isLoading={deleteMutation.isPending}
            onClick={() => deleteId && deleteMutation.mutate(deleteId)}
          >
            {t('uiClinical.delete')}
          </Button>
        </div>
      </Modal>
    </div>
  );
}

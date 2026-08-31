import { useState, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, MoreHorizontal, Loader2, Trash2 } from 'lucide-react';
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

const PAGE_SIZE = 20;

export default function PatientListPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [filters, setFilters] = useState<PatientFilters>({
    pageSize: PAGE_SIZE,
    status: 'active',
  });
  const [search, setSearch] = useState('');
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [cursor, setCursor] = useState<string | undefined>(undefined);
  const [rows, setRows] = useState<Patient[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['patients', filters, cursor],
    queryFn: () => patientsApi.list({ ...filters, cursor }),
  });

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
      notify.success('Xóa bệnh nhân thành công');
    },
    onError: () => {
      notify.error('Không thể xóa bệnh nhân. Vui lòng thử lại.');
    },
  });

  const handleSearch = useCallback((value: string) => {
    setSearch(value);
    setCursor(undefined);
    setRows([]);
    setFilters((f) => ({ ...f, q: value || undefined }));
  }, []);

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
          <h1 className="text-2xl font-semibold text-gray-900">Bệnh nhân</h1>
          <p className="mt-0.5 text-sm text-gray-500">
            Quản lý danh sách bệnh nhân của phòng khám
          </p>
        </div>
        <Button onClick={() => navigate('/patients/new')} className="sm:ml-auto">
          <Plus className="h-4 w-4" />
          Tạo bệnh nhân
        </Button>
      </div>

      <Card noPadding>
        <div className="p-3">
          <div className="flex flex-col gap-3 sm:flex-row">
            <div className="flex-1">
              <SearchInput
                placeholder="Tìm theo tên, mã BN, SĐT..."
                value={search}
                onChange={(e) => handleSearch(e.target.value)}
                onClear={() => handleSearch('')}
              />
            </div>
            <div className="flex gap-2">
              <Select
                aria-label="Trạng thái"
                value={filters.status || 'all'}
                onChange={(e) => handleStatusFilter(e.target.value)}
                options={[
                  { value: 'all', label: 'Tất cả' },
                  { value: 'active', label: 'Hoạt động' },
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
        ) : patients.length === 0 ? (
          <EmptyState
            title="Chưa có bệnh nhân nào"
            description="Bắt đầu bằng việc tạo bệnh nhân đầu tiên"
            action={{
              label: 'Tạo bệnh nhân',
              onClick: () => navigate('/patients/new'),
            }}
          />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50">
                    <th className="px-4 py-3 font-medium text-gray-600">Mã BN</th>
                    <th className="px-4 py-3 font-medium text-gray-600">Họ tên</th>
                    <th className="px-4 py-3 font-medium text-gray-600">Giới tính</th>
                    <th className="px-4 py-3 font-medium text-gray-600">SĐT</th>
                    <th className="px-4 py-3 font-medium text-gray-600">Ngày sinh</th>
                    <th className="px-4 py-3 font-medium text-gray-600">Trạng thái</th>
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
                        {patient.gender === 'male' ? 'Nam' : patient.gender === 'female' ? 'Nữ' : 'Khác'}
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
                            Xóa
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
                  Tải thêm
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
        title="Xác nhận xóa bệnh nhân"
        size="sm"
      >
        <p className="text-sm text-gray-600">
          Bạn có chắc muốn xóa bệnh nhân này? Hành động này không thể hoàn tác.
        </p>
        <div className="mt-4 flex justify-end gap-3">
          <Button variant="outline" onClick={() => setDeleteId(null)}>
            Hủy
          </Button>
          <Button
            variant="danger"
            isLoading={deleteMutation.isPending}
            onClick={() => deleteId && deleteMutation.mutate(deleteId)}
          >
            Xóa
          </Button>
        </div>
      </Modal>
    </div>
  );
}

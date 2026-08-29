import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import { vi } from 'date-fns/locale';
import { Plus, Calculator, Calendar, CheckCircle, Wallet } from 'lucide-react';
import { Button, Card, StatusBadge, EmptyState, Modal, Input, Select } from '@/components/ui';
import { notify } from '@/components/ui/Toast';
import { getApiErrorMessage } from '@/lib/errors';
import {
  usePeriods,
  useCreatePeriod,
  useComputePeriod,
  useApprovePeriod,
} from './payrollApi';
import { MarkPaidModal } from './MarkPaidModal';

export function PayrollListPage() {
  const navigate = useNavigate();
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newPeriodStart, setNewPeriodStart] = useState('');
  const [newPeriodEnd, setNewPeriodEnd] = useState('');
  const [newPeriodCycle, setNewPeriodCycle] = useState<'WEEKLY' | 'BIWEEKLY' | 'MONTHLY'>('MONTHLY');
  const [markPaidPeriodId, setMarkPaidPeriodId] = useState<string | null>(null);

  const { data: periods, isLoading } = usePeriods(
    statusFilter !== 'all' ? { status: statusFilter } : undefined,
  );

  const createPeriod = useCreatePeriod();
  const computePeriod = useComputePeriod();
  const approvePeriod = useApprovePeriod();

  const handleCreate = async () => {
    try {
      await createPeriod.mutateAsync({
        periodStart: newPeriodStart,
        periodEnd: newPeriodEnd,
        payrollCycle: newPeriodCycle,
      });
      notify.success('Đã tạo kỳ lương mới');
      setShowCreateModal(false);
      setNewPeriodStart('');
      setNewPeriodEnd('');
    } catch (err) {
      notify.error(getApiErrorMessage(err, 'Không thể tạo kỳ lương'));
    }
  };

  const handleCompute = async (id: string) => {
    try {
      await computePeriod.mutateAsync(id);
      notify.success('Đã tính lương cho kỳ này');
    } catch (err) {
      notify.error(getApiErrorMessage(err, 'Không thể tính lương'));
    }
  };

  const handleApprove = async (id: string) => {
    try {
      await approvePeriod.mutateAsync(id);
      notify.success('Đã duyệt kỳ lương');
    } catch (err) {
      notify.error(getApiErrorMessage(err, 'Không thể duyệt kỳ lương'));
    }
  };

  const rows = periods ?? [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex gap-2">
          <select
            className="rounded-md border border-gray-300 px-3 py-2 text-sm"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="all">Tất cả trạng thái</option>
            <option value="DRAFT">Bản nháp</option>
            <option value="REVIEWING">Đang xem xét</option>
            <option value="APPROVED">Đã duyệt</option>
            <option value="PAID">Đã trả lương</option>
            <option value="LOCKED">Đã khóa</option>
          </select>
        </div>
        <Button onClick={() => setShowCreateModal(true)}>
          <Plus className="h-4 w-4" />
          Tạo kỳ lương
        </Button>
      </div>

      <Card noPadding>
        {isLoading ? (
          <div className="p-6">
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="h-12 animate-pulse rounded bg-gray-100" />
              ))}
            </div>
          </div>
        ) : rows.length === 0 ? (
          <EmptyState
            icon={<Calendar className="h-10 w-10 text-gray-400" />}
            title="Chưa có kỳ lương nào"
            description="Tạo kỳ lương đầu tiên để bắt đầu tính lương"
            action={{
              label: 'Tạo kỳ lương',
              onClick: () => setShowCreateModal(true),
            }}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="px-4 py-3 font-medium text-gray-600">Kỳ</th>
                  <th className="px-4 py-3 font-medium text-gray-600">Chu kỳ</th>
                  <th className="px-4 py-3 font-medium text-gray-600">Trạng thái</th>
                  <th className="px-4 py-3 font-medium text-gray-600 w-32"></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((period) => (
                  <tr
                    key={period.id}
                    className="border-b border-gray-50 hover:bg-gray-50 cursor-pointer"
                    onClick={() => navigate(`/payroll/periods/${period.id}`)}
                  >
                    <td className="px-4 py-3 font-medium text-gray-900">
                      {format(new Date(period.periodStart), 'dd/MM/yyyy')} —{' '}
                      {format(new Date(period.periodEnd), 'dd/MM/yyyy', { locale: vi })}
                    </td>
                    <td className="px-4 py-3 text-gray-600">{period.payrollCycle}</td>
                    <td className="px-4 py-3">
                      <StatusBadge status={period.status} />
                    </td>
                    <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                      <div className="flex gap-1">
                        {(period.status === 'DRAFT' || period.status === 'REVIEWING') && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleCompute(period.id)}
                            isLoading={computePeriod.isPending && computePeriod.variables === period.id}
                            title="Tính lương"
                          >
                            <Calculator className="h-4 w-4" />
                          </Button>
                        )}
                        {period.status === 'REVIEWING' && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleApprove(period.id)}
                            isLoading={approvePeriod.isPending && approvePeriod.variables === period.id}
                            title="Duyệt"
                          >
                            <CheckCircle className="h-4 w-4" />
                          </Button>
                        )}
                        {period.status === 'APPROVED' && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setMarkPaidPeriodId(period.id)}
                            title="Đánh dấu đã trả"
                          >
                            <Wallet className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Create Period Modal */}
      <Modal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        title="Tạo kỳ lương mới"
        size="sm"
      >
        <div className="space-y-4">
          <Input
            label="Ngày bắt đầu"
            type="date"
            value={newPeriodStart}
            onChange={(e) => setNewPeriodStart(e.target.value)}
          />
          <Input
            label="Ngày kết thúc"
            type="date"
            value={newPeriodEnd}
            onChange={(e) => setNewPeriodEnd(e.target.value)}
          />
          <Select
            label="Chu kỳ"
            value={newPeriodCycle}
            onChange={(e) => setNewPeriodCycle(e.target.value as 'WEEKLY' | 'BIWEEKLY' | 'MONTHLY')}
            options={[
              { value: 'MONTHLY', label: 'Hàng tháng' },
              { value: 'BIWEEKLY', label: 'Hàng 2 tuần' },
              { value: 'WEEKLY', label: 'Hàng tuần' },
            ]}
          />
          <div className="flex justify-end gap-3 pt-4 border-t border-gray-100">
            <Button variant="outline" onClick={() => setShowCreateModal(false)}>
              Hủy
            </Button>
            <Button
              onClick={handleCreate}
              isLoading={createPeriod.isPending}
              disabled={!newPeriodStart || !newPeriodEnd}
            >
              Tạo
            </Button>
          </div>
        </div>
      </Modal>

      <MarkPaidModal
        open={!!markPaidPeriodId}
        onClose={() => setMarkPaidPeriodId(null)}
        periodId={markPaidPeriodId ?? ''}
      />
    </div>
  );
}

import { useState } from 'react';
import { format } from 'date-fns';
import { vi } from 'date-fns/locale';
import { DollarSign, Plus } from 'lucide-react';
import { useCompensations, useCreateCompensation } from './payrollApi';
import { Modal, Input, Select, Button, Card, EmptyState } from '@/components/ui';
import { notify } from '@/components/ui/Toast';
import { getApiErrorMessage } from '@/lib/errors';
import { formatCurrency } from '@/lib/format';
import { useDentistOptions } from '@/features/appointments/appointmentApi';
import type { DentistCompensation } from '@/types/payroll';

export function CompensationListPage() {
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedDentist, setSelectedDentist] = useState('');
  const [baseSalary, setBaseSalary] = useState('');
  const [commission, setCommission] = useState('');
  const [effectiveFrom, setEffectiveFrom] = useState('');

  const { data: compensations, isLoading } = useCompensations();

  const { data: dentists } = useDentistOptions();

  const createMutation = useCreateCompensation();

  const handleCreate = async () => {
    try {
      await createMutation.mutateAsync({
        dentistId: selectedDentist,
        effectiveFrom,
        baseSalary: parseInt(baseSalary, 10),
        commissionPercentage: parseFloat(commission),
      });
      notify.success('Đã thêm chính sách lương');
      setShowAddModal(false);
      setSelectedDentist('');
      setBaseSalary('');
      setCommission('');
      setEffectiveFrom('');
    } catch (err) {
      notify.error(getApiErrorMessage(err, 'Không thể thêm chính sách lương'));
    }
  };

  // Group compensations by dentist
  const compensationsByDentist = compensations?.reduce((acc, comp) => {
    if (!acc[comp.dentistId]) {
      acc[comp.dentistId] = [];
    }
    acc[comp.dentistId].push(comp);
    return acc;
  }, {} as Record<string, DentistCompensation[]>);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-end">
        <Button onClick={() => setShowAddModal(true)}>
          <Plus className="h-4 w-4" />
          Thêm chính sách
        </Button>
      </div>

      <Card noPadding>
        {isLoading ? (
          <div className="p-6">
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="h-16 animate-pulse rounded bg-gray-100" />
              ))}
            </div>
          </div>
        ) : !compensationsByDentist || Object.keys(compensationsByDentist).length === 0 ? (
          <EmptyState
            icon={<DollarSign className="h-10 w-10 text-gray-400" />}
            title="Chưa có chính sách lương nào"
            description="Thêm chính sách lương cho bác sĩ"
            action={{
              label: 'Thêm chính sách',
              onClick: () => setShowAddModal(true),
            }}
          />
        ) : (
          <div className="divide-y divide-gray-100">
            {Object.entries(compensationsByDentist).map(([dentistId, dentistCompensations]) => {
              const latestComp = dentistCompensations[0];
              return (
                <div key={dentistId} className="p-4 hover:bg-gray-50">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium text-gray-900">{latestComp.dentistName}</p>
                      <p className="text-sm text-gray-500">
                        Hiệu lực từ: {format(new Date(latestComp.effectiveFrom), 'dd/MM/yyyy', { locale: vi })}
                      </p>
                    </div>
                    <div className="flex gap-6 text-right">
                      <div>
                        <p className="text-sm text-gray-500">Lương cơ bản</p>
                        <p className="font-medium">{formatCurrency(latestComp.baseSalary)}</p>
                      </div>
                      <div>
                        <p className="text-sm text-gray-500">Hoa hồng</p>
                        <p className="font-medium">{latestComp.commissionPercentage}%</p>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {/* Add Compensation Modal */}
      <Modal
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        title="Thêm chính sách lương"
        size="sm"
      >
        <div className="space-y-4">
          <Select
            label="Bác sĩ"
            value={selectedDentist}
            onChange={(e) => setSelectedDentist(e.target.value)}
            options={[
              { value: '', label: '-- Chọn bác sĩ --' },
              ...(dentists ?? []).map((d) => ({ value: d.id, label: d.fullName })),
            ]}
          />
          <Input
            label="Lương cơ bản (VND)"
            type="number"
            value={baseSalary}
            onChange={(e) => setBaseSalary(e.target.value)}
            placeholder="VD: 15000000"
          />
          <Input
            label="% Hoa hồng"
            type="number"
            step="0.1"
            value={commission}
            onChange={(e) => setCommission(e.target.value)}
            placeholder="VD: 30"
          />
          <Input
            label="Hiệu lực từ ngày"
            type="date"
            value={effectiveFrom}
            onChange={(e) => setEffectiveFrom(e.target.value)}
          />
          <div className="flex justify-end gap-3 pt-4 border-t border-gray-100">
            <Button variant="outline" onClick={() => setShowAddModal(false)}>
              Hủy
            </Button>
            <Button
              onClick={handleCreate}
              isLoading={createMutation.isPending}
              disabled={!selectedDentist || !baseSalary || !commission || !effectiveFrom}
            >
              Thêm
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

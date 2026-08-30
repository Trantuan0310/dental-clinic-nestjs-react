import { Card, Badge, EmptyState } from '@/components/ui';
import { formatCurrency } from '@/lib/format';
import { format } from 'date-fns';
import { vi } from 'date-fns/locale';
import { DollarSign } from 'lucide-react';
import { useMyCompensation } from './payrollApi';

export default function MyCompensationPage() {
  const { data: comp, isLoading } = useMyCompensation();

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">Chính sách lương của tôi</h1>
        <p className="mt-1 text-sm text-gray-500">
          Thông tin lương và hoa hồng hiện tại
        </p>
      </div>

      {isLoading ? (
        <Card>
          <div className="h-40 animate-pulse rounded bg-gray-100" />
        </Card>
      ) : !comp ? (
        <Card>
          <EmptyState
            icon={<DollarSign className="h-10 w-10 text-gray-400" />}
            title="Chưa có chính sách lương"
            description="Liên hệ quản trị viên để thiết lập chính sách lương cho bạn"
          />
        </Card>
      ) : (
        <Card>
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-semibold text-gray-900">Chính sách hiện tại</h2>
            <Badge variant="success">Đang áp dụng</Badge>
          </div>

          <div className="grid gap-6 sm:grid-cols-3">
            <div>
              <p className="text-sm text-gray-500">Lương cơ bản</p>
              <p className="text-2xl font-bold text-gray-900">{formatCurrency(comp.baseSalary)}</p>
              <p className="text-xs text-gray-400">/ tháng</p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Hoa hồng</p>
              <p className="text-2xl font-bold text-gray-900">{comp.commissionPercentage}%</p>
              <p className="text-xs text-gray-400">trên doanh thu</p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Lương làm thêm</p>
              <p className="text-2xl font-bold text-gray-900">{formatCurrency(comp.overtimeHourlyRate)}</p>
              <p className="text-xs text-gray-400">/ giờ</p>
            </div>
          </div>

          <div className="mt-6 pt-6 border-t border-gray-100">
            <p className="text-sm text-gray-500">
              Hiệu lực từ: {format(new Date(comp.effectiveFrom), 'dd/MM/yyyy', { locale: vi })}
              {comp.effectiveTo &&
                ` — đến ${format(new Date(comp.effectiveTo), 'dd/MM/yyyy', { locale: vi })}`}
            </p>
            {comp.notes && <p className="mt-1 text-sm text-gray-500">Ghi chú: {comp.notes}</p>}
          </div>
        </Card>
      )}
    </div>
  );
}

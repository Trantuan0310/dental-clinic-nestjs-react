import { useState } from 'react';
import { Card, Badge } from '@/components/ui';
import { formatCurrency } from '@/lib/format';
import { format } from 'date-fns';
import { vi } from 'date-fns/locale';

interface CompensationVersion {
  id: string;
  effectiveFrom: string;
  effectiveTo?: string;
  baseSalary: number;
  commissionPercentage: number;
  overtimeHourlyRate: number;
  isActive: boolean;
}

export default function MyCompensationPage() {
  const [versions] = useState<CompensationVersion[]>([
    {
      id: '1',
      effectiveFrom: '2026-01-01',
      baseSalary: 15000000,
      commissionPercentage: 30,
      overtimeHourlyRate: 100000,
      isActive: true,
    },
    {
      id: '2',
      effectiveFrom: '2025-06-01',
      effectiveTo: '2025-12-31',
      baseSalary: 12000000,
      commissionPercentage: 25,
      overtimeHourlyRate: 80000,
      isActive: false,
    },
  ]);

  const activeComp = versions.find(v => v.isActive);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">Chính sách lương của tôi</h1>
        <p className="mt-1 text-sm text-gray-500">
          Thông tin lương và hoa hồng hiện tại
        </p>
      </div>

      {activeComp && (
        <Card>
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-semibold text-gray-900">Chính sách hiện tại</h2>
            <Badge variant="success">Đang áp dụng</Badge>
          </div>

          <div className="grid gap-6 sm:grid-cols-3">
            <div>
              <p className="text-sm text-gray-500">Lương cơ bản</p>
              <p className="text-2xl font-bold text-gray-900">{formatCurrency(activeComp.baseSalary)}</p>
              <p className="text-xs text-gray-400">/ tháng</p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Hoa hồng</p>
              <p className="text-2xl font-bold text-gray-900">{activeComp.commissionPercentage}%</p>
              <p className="text-xs text-gray-400">trên doanh thu</p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Lương làm thêm</p>
              <p className="text-2xl font-bold text-gray-900">{formatCurrency(activeComp.overtimeHourlyRate)}</p>
              <p className="text-xs text-gray-400">/ giờ</p>
            </div>
          </div>

          <div className="mt-6 pt-6 border-t border-gray-100">
            <p className="text-sm text-gray-500">
              Hiệu lực từ: {format(new Date(activeComp.effectiveFrom), 'dd/MM/yyyy', { locale: vi })}
            </p>
          </div>
        </Card>
      )}

      <Card title="Lịch sử thay đổi">
        <div className="space-y-4">
          {versions.filter(v => !v.isActive).map((version) => (
            <div key={version.id} className="flex items-center justify-between py-3 border-b border-gray-100 last:border-0">
              <div>
                <p className="font-medium text-gray-900">
                  {format(new Date(version.effectiveFrom), 'dd/MM/yyyy', { locale: vi })}
                  {version.effectiveTo && ` - ${format(new Date(version.effectiveTo), 'dd/MM/yyyy', { locale: vi })}`}
                </p>
                <p className="text-sm text-gray-500">
                  Lương cơ bản: {formatCurrency(version.baseSalary)} • Hoa hồng: {version.commissionPercentage}%
                </p>
              </div>
              <Badge variant="default">Đã kết thúc</Badge>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

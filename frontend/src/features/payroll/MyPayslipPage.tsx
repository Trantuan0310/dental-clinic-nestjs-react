import { Card, Button, Badge, EmptyState } from '@/components/ui';
import { formatCurrency } from '@/lib/format';
import { format } from 'date-fns';
import { vi } from 'date-fns/locale';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, FileX } from 'lucide-react';
import { useMyPayslip } from './payrollApi';

export default function MyPayslipPage() {
  const { periodId } = useParams<{ periodId: string }>();
  const { data: payslip, isLoading } = useMyPayslip(periodId);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-64 animate-pulse rounded bg-gray-100" />
        <div className="h-96 animate-pulse rounded bg-gray-100" />
      </div>
    );
  }

  if (!payslip) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" asChild>
          <Link to="/my-payroll/history">
            <ArrowLeft className="h-4 w-4" />
            Quay lại
          </Link>
        </Button>
        <Card>
          <EmptyState
            icon={<FileX className="h-10 w-10 text-gray-400" />}
            title="Không tìm thấy phiếu lương"
            description="Kỳ lương này chưa được tính toán hoặc bạn không có quyền xem"
          />
        </Card>
      </div>
    );
  }

  const totalDeductions = payslip.taxTNCN + payslip.bhxh + payslip.bhyt + payslip.bhtn;
  const bonusAdjustments = payslip.adjustments.filter((a) => a.type === 'BONUS');

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <Button variant="ghost" asChild>
          <Link to="/my-payroll/history">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-semibold text-gray-900">
            Phiếu lương {format(new Date(payslip.computedAt), 'MM/yyyy', { locale: vi })}
          </h1>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-4">
          {/* Earnings */}
          <Card title="Thu nhập">
            <div className="space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Lương cơ bản</span>
                <span className="font-medium">{formatCurrency(payslip.baseSalary)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Hoa hồng</span>
                <span className="font-medium">{formatCurrency(payslip.commission)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Làm thêm giờ</span>
                <span className="font-medium">{formatCurrency(payslip.overtime)}</span>
              </div>
              {bonusAdjustments.map((adj) => (
                <div key={adj.id} className="flex justify-between text-sm">
                  <span className="text-gray-600">Thưởng — {adj.reason}</span>
                  <span className="font-medium text-green-600">{formatCurrency(adj.amountVnd)}</span>
                </div>
              ))}
              <div className="flex justify-between border-t border-gray-200 pt-3 font-semibold">
                <span>Tổng thu nhập</span>
                <span>{formatCurrency(payslip.grossSalary)}</span>
              </div>
            </div>
          </Card>

          {/* Deductions */}
          <Card title="Khấu trừ">
            <div className="space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Thuế TNCN</span>
                <span className="font-medium text-red-600">-{formatCurrency(payslip.taxTNCN)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">BHXH</span>
                <span className="font-medium text-red-600">-{formatCurrency(payslip.bhxh)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">BHYT</span>
                <span className="font-medium text-red-600">-{formatCurrency(payslip.bhyt)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">BHTN</span>
                <span className="font-medium text-red-600">-{formatCurrency(payslip.bhtn)}</span>
              </div>
              {payslip.otherDeductions > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Khấu trừ khác</span>
                  <span className="font-medium text-red-600">-{formatCurrency(payslip.otherDeductions)}</span>
                </div>
              )}
              <div className="flex justify-between border-t border-gray-200 pt-3 font-semibold text-red-600">
                <span>Tổng khấu trừ</span>
                <span>-{formatCurrency(totalDeductions)}</span>
              </div>
            </div>
          </Card>

          {/* Encounters */}
          <Card title="Lịch sử khám trong kỳ">
            {payslip.encounters.length === 0 ? (
              <p className="py-4 text-center text-sm text-gray-500">Không có ca khám nào trong kỳ này</p>
            ) : (
              <div className="space-y-2">
                {payslip.encounters.map((enc) => (
                  <div key={enc.id} className="flex items-center justify-between rounded border border-gray-100 p-3">
                    <div>
                      <p className="font-medium text-gray-900">{enc.patientName}</p>
                      <p className="text-sm text-gray-500">
                        {enc.chiefComplaint || enc.summary || '—'}
                      </p>
                    </div>
                    <span className="text-sm text-gray-500">
                      {format(new Date(enc.startedAt), 'dd/MM/yyyy', { locale: vi })}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>

        <div>
          {/* Summary */}
          <Card className="sticky top-4">
            <div className="text-center">
              <p className="text-sm text-gray-500">Lương thực nhận</p>
              <p className="mt-2 text-4xl font-bold text-green-600">
                {formatCurrency(payslip.netSalary)}
              </p>
              <p className="mt-2 text-sm text-gray-500">
                Kỳ {format(new Date(payslip.computedAt), 'MM/yyyy', { locale: vi })}
              </p>
              <Badge variant="success">Đã tính lương</Badge>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

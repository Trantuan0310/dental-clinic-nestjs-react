import { Card, Button, Badge } from '@/components/ui';
import { formatCurrency } from '@/lib/format';
import { format } from 'date-fns';
import { vi } from 'date-fns/locale';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, Download } from 'lucide-react';

export default function MyPayslipPage() {
  const { periodId: _periodId } = useParams<{ periodId: string }>();

  // Mock data
  const payslip = {
    period: '06/2026',
    status: 'PAID',
    baseSalary: 15000000,
    commission: 8500000,
    overtime: 1500000,
    bonus: 0,
    grossSalary: 25000000,
    taxTNCN: 2500000,
    bhxh: 1200000,
    bhyt: 150000,
    bhtn: 150000,
    otherDeductions: 0,
    netSalary: 21000000,
    encounters: [
      { date: '2026-06-01', summary: 'Hàn răng Composite 16', revenue: 350000 },
      { date: '2026-06-03', summary: 'Nhổ răng khôn 48', revenue: 800000 },
      { date: '2026-06-05', summary: 'Khám định kỳ', revenue: 200000 },
    ],
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <Button variant="ghost" asChild>
          <Link to="/my-payroll">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-semibold text-gray-900">
            Phiếu lương {payslip.period}
          </h1>
        </div>
        <Button variant="outline">
          <Download className="h-4 w-4" />
          Tải PDF
        </Button>
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
              {payslip.bonus > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Thưởng</span>
                  <span className="font-medium text-green-600">{formatCurrency(payslip.bonus)}</span>
                </div>
              )}
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
                <span className="text-gray-600">BHXH (8%)</span>
                <span className="font-medium text-red-600">-{formatCurrency(payslip.bhxh)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">BHYT (1.5%)</span>
                <span className="font-medium text-red-600">-{formatCurrency(payslip.bhyt)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">BHTN (1%)</span>
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
                <span>
                  -{formatCurrency(payslip.taxTNCN + payslip.bhxh + payslip.bhyt + payslip.bhtn)}
                </span>
              </div>
            </div>
          </Card>

          {/* Encounters */}
          <Card title="Lịch sử khám trong kỳ">
            <div className="space-y-2">
              {payslip.encounters.map((enc, i) => (
                <div key={i} className="flex items-center justify-between rounded border border-gray-100 p-3">
                  <div>
                    <p className="font-medium text-gray-900">{enc.summary}</p>
                    <p className="text-sm text-gray-500">
                      {format(new Date(enc.date), 'dd/MM/yyyy', { locale: vi })}
                    </p>
                  </div>
                  <span className="font-medium text-gray-900">{formatCurrency(enc.revenue)}</span>
                </div>
              ))}
            </div>
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
                Kỳ {payslip.period}
              </p>
              <Badge variant={payslip.status === 'PAID' ? 'success' : 'info'}>
                {payslip.status === 'PAID' ? 'Đã trả lương' : 'Đã duyệt'}
              </Badge>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

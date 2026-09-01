import { DollarSign, Calendar, Eye } from 'lucide-react';
import { Card, Tabs, TabsList, TabsTrigger, TabsContent, EmptyState } from '@/components/ui';
import { formatCurrency } from '@/lib/format';
import { format } from 'date-fns';
import { vi } from 'date-fns/locale';
import { Link } from 'react-router-dom';
import { useMyPayrollHistory } from './payrollApi';

const STATUS_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  DRAFT: { bg: 'bg-gray-50', text: 'text-gray-700', label: 'Nháp' },
  REVIEWING: { bg: 'bg-amber-50', text: 'text-amber-700', label: 'Đang xét duyệt' },
  APPROVED: { bg: 'bg-blue-50', text: 'text-blue-700', label: 'Đã duyệt' },
  PAID: { bg: 'bg-green-50', text: 'text-green-700', label: 'Đã trả lương' },
  LOCKED: { bg: 'bg-gray-50', text: 'text-gray-700', label: 'Đã khóa' },
};

function getStatusBadge(status: string) {
  const style = STATUS_STYLES[status] ?? { bg: 'bg-gray-50', text: 'text-gray-700', label: status };
  return (
    <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${style.bg} ${style.text}`}>
      {style.label}
    </span>
  );
}

export default function MyPayrollHistoryPage() {
  const { data: payslips, isLoading } = useMyPayrollHistory();

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Phiếu lương của tôi</h1>
          <p className="mt-1 text-sm text-gray-500">
            Lịch sử lương và phiếu lương chi tiết
          </p>
        </div>
      </div>

      <Tabs defaultValue="paid">
        <TabsList>
          <TabsTrigger value="paid">
            <DollarSign className="h-4 w-4 mr-2" />
            Đã trả lương
          </TabsTrigger>
          <TabsTrigger value="preview">
            <Eye className="h-4 w-4 mr-2" />
            Ước tính tháng này
          </TabsTrigger>
        </TabsList>

        <TabsContent value="paid">
          <Card noPadding>
            {isLoading ? (
              <div className="space-y-3 p-6">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="h-12 animate-pulse rounded bg-gray-100" />
                ))}
              </div>
            ) : !payslips || payslips.length === 0 ? (
              <EmptyState
                icon={<DollarSign className="h-10 w-10 text-gray-400" />}
                title="Chưa có kỳ lương nào"
                description="Kỳ lương đầu tiên sẽ xuất hiện sau khi admin tạo và tính toán"
              />
            ) : (
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50">
                    <th className="px-4 py-3 font-medium text-gray-600">Kỳ</th>
                    <th className="px-4 py-3 font-medium text-gray-600 text-right">Lương thực nhận</th>
                    <th className="px-4 py-3 font-medium text-gray-600">Trạng thái</th>
                    <th className="px-4 py-3 font-medium text-gray-600">Ngày trả</th>
                    <th className="px-4 py-3 font-medium text-gray-600 w-12"></th>
                  </tr>
                </thead>
                <tbody>
                  {payslips.map((payslip) => (
                    <tr key={payslip.id} className="border-b border-gray-50 hover:bg-gray-50">
                      <td className="px-4 py-3 font-medium text-gray-900">
                        {format(new Date(payslip.periodStart), 'dd/MM', { locale: vi })}
                        {' – '}
                        {format(new Date(payslip.periodEnd), 'dd/MM/yyyy', { locale: vi })}
                      </td>
                      <td className="px-4 py-3 text-right text-green-600 font-semibold">
                        {formatCurrency(payslip.netSalary)}
                      </td>
                      <td className="px-4 py-3">
                        {getStatusBadge(payslip.status)}
                      </td>
                      <td className="px-4 py-3 text-gray-500">
                        {payslip.paidAt
                          ? format(new Date(payslip.paidAt), 'dd/MM/yyyy', { locale: vi })
                          : '-'}
                      </td>
                      <td className="px-4 py-3">
                        <Link
                          to={`/my-payroll/payslip/${payslip.periodId}`}
                          className="text-brand-600 hover:underline"
                        >
                          Chi tiết
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>
        </TabsContent>

        <TabsContent value="preview">
          <Card>
            <div className="text-center py-8">
              <Calendar className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900">Ước tính lương tháng này</h3>
              <p className="mt-1 text-sm text-gray-500">
                Tính năng đang được phát triển. Ước tính lương dựa trên các lịch hẹn đã hoàn
                thành sẽ hiển thị ở đây.
              </p>
            </div>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

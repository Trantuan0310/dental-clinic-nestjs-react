import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, Calculator, Lock, CheckCircle, Wallet, SlidersHorizontal } from 'lucide-react';
import { Card, Button, StatusBadge, EmptyState } from '@/components/ui';
import { PageLoader } from '@/components/ui/Loading';
import { notify } from '@/components/ui/Toast';
import { getApiErrorMessage } from '@/lib/errors';
import { formatVnd, formatDate } from '@/lib/format';
import { useAuthStore } from '@/stores/authStore';
import { usePeriodDetail, useComputePeriod, useLockPeriod, useApprovePeriod } from './payrollApi';
import { LineItemBreakdownDrawer } from './LineItemBreakdownDrawer';
import { AdjustmentModal } from './AdjustmentModal';
import { MarkPaidModal } from './MarkPaidModal';
import type { PayrollLineItem } from '@/types/payroll';

export default function PeriodDetailPage() {
  const { id } = useParams<{ id: string }>();
  const hasPermission = useAuthStore((s) => s.hasPermission);
  const { data: period, isLoading } = usePeriodDetail(id);
  const computePeriod = useComputePeriod();
  const lockPeriod = useLockPeriod();
  const approvePeriod = useApprovePeriod();

  const [breakdownItem, setBreakdownItem] = useState<PayrollLineItem | null>(null);
  const [adjustItem, setAdjustItem] = useState<PayrollLineItem | null>(null);
  const [showMarkPaid, setShowMarkPaid] = useState(false);

  if (isLoading) return <PageLoader />;

  if (!period) {
    return (
      <Card>
        <EmptyState title="Không tìm thấy kỳ lương" description="Kỳ lương này có thể đã bị xóa hoặc bạn không có quyền xem." />
      </Card>
    );
  }

  // grossPayVnd/netPayVnd/taxTncnVnd/bhxhVnd are Prisma Decimal fields, which
  // serialize as strings over JSON — coerce with Number() before summing so
  // `+` adds instead of concatenating.
  const totals = period.lineItems.reduce(
    (acc, li) => ({
      gross: acc.gross + Number(li.grossPayVnd),
      net: acc.net + Number(li.netPayVnd),
      tax: acc.tax + Number(li.taxTncnVnd),
      bhxh: acc.bhxh + Number(li.bhxhVnd),
    }),
    { gross: 0, net: 0, tax: 0, bhxh: 0 },
  );

  const runCompute = async () => {
    try {
      await computePeriod.mutateAsync(period.id);
      notify.success('Đã tính lương cho kỳ này');
    } catch (err) {
      notify.error(getApiErrorMessage(err, 'Không thể tính lương'));
    }
  };

  const runLock = async () => {
    try {
      await lockPeriod.mutateAsync(period.id);
      notify.success('Đã khóa kỳ lương (chuyển sang REVIEWING)');
    } catch (err) {
      notify.error(getApiErrorMessage(err, 'Không thể khóa kỳ lương'));
    }
  };

  const runApprove = async () => {
    try {
      await approvePeriod.mutateAsync(period.id);
      notify.success('Đã duyệt kỳ lương');
    } catch (err) {
      notify.error(getApiErrorMessage(err, 'Không thể duyệt kỳ lương'));
    }
  };

  const canCompute = hasPermission('payroll.period.compute') && (period.status === 'DRAFT' || period.status === 'REVIEWING');
  const canAdjust = hasPermission('payroll.period.adjust') && (period.status === 'DRAFT' || period.status === 'REVIEWING');
  const canLock = hasPermission('payroll.period.lock') && period.status === 'DRAFT';
  const canApprove = hasPermission('payroll.period.approve') && period.status === 'REVIEWING';
  const canMarkPaid = hasPermission('payroll.period.mark_paid') && period.status === 'APPROVED';

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          {/* /payroll/periods still resolves to the unfinished PeriodListPage
              stub — the real, wired periods list lives in the "Kỳ lương" tab
              of the payroll dashboard at /payroll. */}
          <Link
            to="/payroll"
            className="mb-1 inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Danh sách kỳ lương
          </Link>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold text-gray-900">
              Kỳ lương {formatDate(period.periodStart)} — {formatDate(period.periodEnd)}
            </h1>
            <StatusBadge status={period.status} />
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {canCompute && (
            <Button variant="outline" onClick={runCompute} isLoading={computePeriod.isPending}>
              <Calculator className="h-4 w-4" /> Tính lương
            </Button>
          )}
          {canLock && (
            <Button variant="outline" onClick={runLock} isLoading={lockPeriod.isPending}>
              <Lock className="h-4 w-4" /> Khóa kỳ
            </Button>
          )}
          {canApprove && (
            <Button variant="outline" onClick={runApprove} isLoading={approvePeriod.isPending}>
              <CheckCircle className="h-4 w-4" /> Duyệt
            </Button>
          )}
          {canMarkPaid && (
            <Button onClick={() => setShowMarkPaid(true)}>
              <Wallet className="h-4 w-4" /> Đánh dấu đã trả
            </Button>
          )}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-4">
        <Card>
          <p className="text-sm text-gray-500">Tổng gross</p>
          <p className="mt-1 text-xl font-semibold text-gray-900">{formatVnd(totals.gross)}</p>
        </Card>
        <Card>
          <p className="text-sm text-gray-500">Tổng net</p>
          <p className="mt-1 text-xl font-semibold text-emerald-700">{formatVnd(totals.net)}</p>
        </Card>
        <Card>
          <p className="text-sm text-gray-500">Tổng thuế TNCN</p>
          <p className="mt-1 text-xl font-semibold text-gray-900">{formatVnd(totals.tax)}</p>
        </Card>
        <Card>
          <p className="text-sm text-gray-500">Tổng BHXH</p>
          <p className="mt-1 text-xl font-semibold text-gray-900">{formatVnd(totals.bhxh)}</p>
        </Card>
      </div>

      <Card title={`Bác sĩ (${period.lineItems.length})`} noPadding>
        {period.lineItems.length === 0 ? (
          <EmptyState
            title="Chưa có dữ liệu tính lương"
            description={canCompute ? 'Bấm "Tính lương" để tạo line item cho từng bác sĩ.' : 'Kỳ lương chưa được tính.'}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="table-base">
              <thead>
                <tr>
                  <th>Bác sĩ</th>
                  <th className="text-right">Encounters</th>
                  <th className="text-right">Gross</th>
                  <th className="text-right">Thuế TNCN</th>
                  <th className="text-right">BHXH</th>
                  <th className="text-right">Net</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {period.lineItems.map((li) => (
                  <tr key={li.id}>
                    <td className="font-medium text-gray-900">
                      {li.dentistName}
                      {li.manuallyAdjusted && (
                        <span className="ml-2 text-xs font-normal text-amber-600">(đã điều chỉnh)</span>
                      )}
                    </td>
                    <td className="text-right">{li.encountersCount}</td>
                    <td className="text-right">{formatVnd(li.grossPayVnd)}</td>
                    <td className="text-right">{formatVnd(li.taxTncnVnd)}</td>
                    <td className="text-right">{formatVnd(li.bhxhVnd)}</td>
                    <td className="text-right font-semibold text-emerald-700">{formatVnd(li.netPayVnd)}</td>
                    <td className="whitespace-nowrap text-right">
                      <Button variant="outline" size="sm" onClick={() => setBreakdownItem(li)}>
                        Xem chi tiết
                      </Button>
                      {canAdjust && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="ml-2"
                          onClick={() => setAdjustItem(li)}
                        >
                          <SlidersHorizontal className="h-3.5 w-3.5" /> Điều chỉnh
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <LineItemBreakdownDrawer
        open={!!breakdownItem}
        onClose={() => setBreakdownItem(null)}
        dentistName={breakdownItem?.dentistName ?? ''}
        encounters={breakdownItem?.encounterDetails ?? []}
        adjustments={breakdownItem?.adjustments ?? []}
        computationLog={breakdownItem?.computationLog}
      />

      <AdjustmentModal
        open={!!adjustItem}
        onClose={() => setAdjustItem(null)}
        periodId={period.id}
        lineItem={adjustItem}
      />

      <MarkPaidModal open={showMarkPaid} onClose={() => setShowMarkPaid(false)} periodId={period.id} />
    </div>
  );
}

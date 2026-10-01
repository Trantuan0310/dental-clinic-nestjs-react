import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, Calculator, Lock, CheckCircle, Wallet, SlidersHorizontal } from 'lucide-react';
import { Card, Button, StatusBadge, EmptyState } from '@/components/ui';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { PageLoader } from '@/components/ui/Loading';
import { notify } from '@/components/ui/Toast';
import { getApiErrorMessage } from '@/lib/errors';
import { formatVnd, formatDate, formatDateTime, formatNumber } from '@/lib/format';
import { useAuthStore } from '@/stores/authStore';
import {
  usePeriodDetail,
  usePeriodWarnings,
  useComputePeriod,
  useLockPeriod,
  useApprovePeriod,
} from './payrollApi';
import { LineItemBreakdownDrawer } from './LineItemBreakdownDrawer';
import { AdjustmentModal } from './AdjustmentModal';
import { MarkPaidModal } from './MarkPaidModal';
import type { PayrollLineItem, PayrollPeriodWarnings } from '@/types/payroll';

function warningCount(w: PayrollPeriodWarnings | undefined) {
  if (!w) return 0;
  return (
    w.draftInvoices.length +
    w.dentistsWithoutCompensation.length +
    w.outsideHoursEncounters.length +
    w.terminatedDentists.length
  );
}

/** Things to settle before locking the period (H4/H5 warnings). */
function PeriodWarningsCard({ warnings }: { warnings: PayrollPeriodWarnings }) {
  return (
    <Card title="Cần kiểm tra trước khi khóa kỳ">
      <div className="space-y-4 text-sm">
        {warnings.draftInvoices.length > 0 && (
          <section>
            <p className="font-medium text-amber-700">
              {warnings.draftInvoices.length} hóa đơn nháp quá {warnings.draftInvoiceDays} ngày chưa phát hành
            </p>
            <p className="text-gray-500">
              Hoa hồng chỉ tính trên hóa đơn đã phát hành. Nhờ lễ tân phát hành (hoặc hủy nếu sai), rồi bấm
              "Tính lương" lại.
            </p>
            <ul className="mt-1 list-disc pl-5 text-gray-700">
              {warnings.draftInvoices.slice(0, 20).map((d) => (
                <li key={d.invoiceId}>
                  {d.code} — {d.patientName} — BS {d.dentistName} — {formatVnd(d.totalVnd)} ({d.ageDays} ngày)
                </li>
              ))}
              {warnings.draftInvoices.length > 20 && <li>… và {warnings.draftInvoices.length - 20} hóa đơn khác</li>}
            </ul>
          </section>
        )}
        {warnings.dentistsWithoutCompensation.length > 0 && (
          <section>
            <p className="font-medium text-amber-700">Bác sĩ có phiên khám nhưng chưa có cấu hình lương</p>
            <p className="text-gray-500">
              Không có lương cơ bản và hoa hồng. Thêm cấu hình lương (tab "Cấu hình lương") rồi tính lại.
            </p>
            <ul className="mt-1 list-disc pl-5 text-gray-700">
              {warnings.dentistsWithoutCompensation.map((d) => (
                <li key={d.dentistId}>
                  {d.dentistName} — {d.encounterCount} phiên khám
                </li>
              ))}
            </ul>
          </section>
        )}
        {warnings.outsideHoursEncounters.length > 0 && (
          <section>
            <p className="font-medium text-amber-700">Phiên khám ngoài giờ làm (chưa được tính giờ)</p>
            <p className="text-gray-500">
              Nếu là làm thêm thật, ghi "Đổi giờ làm" hoặc ca đăng ký cho ngày đó rồi tính lại.
            </p>
            <ul className="mt-1 list-disc pl-5 text-gray-700">
              {warnings.outsideHoursEncounters.slice(0, 20).map((e) => (
                <li key={e.encounterId}>
                  {e.dentistName} — {formatDateTime(e.startedAt)} → {formatDateTime(e.closedAt)} ({e.minutes} phút ngoài giờ)
                </li>
              ))}
            </ul>
          </section>
        )}
        {warnings.terminatedDentists.length > 0 && (
          <section>
            <p className="font-medium text-gray-700">Nghỉ việc trong kỳ (lương tính đến ngày nghỉ)</p>
            <ul className="mt-1 list-disc pl-5 text-gray-700">
              {warnings.terminatedDentists.map((d) => (
                <li key={d.dentistId ?? d.dentistName}>
                  {d.dentistName} — {d.terminationDate ? formatDate(d.terminationDate) : ''}
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </Card>
  );
}

export default function PeriodDetailPage() {
  const { id } = useParams<{ id: string }>();
  const hasPermission = useAuthStore((s) => s.hasPermission);
  const { data: period, isLoading } = usePeriodDetail(id);
  const computePeriod = useComputePeriod();
  const lockPeriod = useLockPeriod();
  const approvePeriod = useApprovePeriod();
  const isOpenPeriod = period?.status === 'DRAFT' || period?.status === 'REVIEWING';
  const { data: warnings } = usePeriodWarnings(id, isOpenPeriod);
  const [confirmLock, setConfirmLock] = useState(false);

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
    setConfirmLock(false);
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
          {/* Periods list lives in the "Kỳ lương" tab of the payroll dashboard. */}
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
            <Button
              variant="outline"
              onClick={() => (warningCount(warnings) > 0 ? setConfirmLock(true) : runLock())}
              isLoading={lockPeriod.isPending}
            >
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

      {isOpenPeriod && warnings && warningCount(warnings) > 0 && <PeriodWarningsCard warnings={warnings} />}

      <p className="text-xs text-gray-500">
        Hoa hồng tính trên hóa đơn đã phát hành trong kỳ (theo ngày phát hành, sau giảm giá). Giờ làm theo lịch làm việc,
        trừ ngày phòng khám nghỉ, ngày đóng lịch và nghỉ phép đã duyệt.
      </p>

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
                  <th className="text-right">Giờ làm</th>
                  <th className="text-right">Tăng ca (giờ)</th>
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
                    <td className="text-right">{formatNumber(li.totalHours)}</td>
                    <td className={`text-right ${Number(li.overtimeHours) > 0 ? 'font-medium text-amber-600' : ''}`}>
                      {formatNumber(li.overtimeHours)}
                    </td>
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

      <ConfirmDialog
        open={confirmLock}
        onClose={() => setConfirmLock(false)}
        onConfirm={runLock}
        title="Khóa kỳ lương khi còn cảnh báo?"
        description={`Còn ${warningCount(warnings)} mục cần kiểm tra (xem khung "Cần kiểm tra trước khi khóa kỳ"). Sau khi khóa vẫn có thể tính lại khi kỳ ở trạng thái REVIEWING.`}
        confirmLabel="Vẫn khóa"
        isLoading={lockPeriod.isPending}
      />

      <MarkPaidModal open={showMarkPaid} onClose={() => setShowMarkPaid(false)} periodId={period.id} />
    </div>
  );
}

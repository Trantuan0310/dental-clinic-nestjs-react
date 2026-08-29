import { useState } from 'react';
import { Drawer } from '@/components/ui/Drawer';
import { Button } from '@/components/ui/Button';
import { AdjustmentTypeBadge } from '@/components/ui/StatusBadge';
import { formatVnd, formatDateTime } from '@/lib/format';
import type { PayrollEncounterDetail, PayrollAdjustment } from '@/types/payroll';

interface Props {
  open: boolean;
  onClose: () => void;
  dentistName: string;
  encounters: PayrollEncounterDetail[];
  adjustments: PayrollAdjustment[];
  computationLog: Record<string, unknown> | undefined;
}

export function LineItemBreakdownDrawer({ open, onClose, dentistName, encounters, adjustments, computationLog }: Props) {
  const [showLog, setShowLog] = useState(false);
  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={`Chi tiết tính lương — ${dentistName}`}
      width="xl"
      footer={
        <div className="flex justify-between">
          <Button variant="outline" onClick={() => setShowLog((s) => !s)}>
            {showLog ? 'Ẩn' : 'Hiện'} computation log (JSON)
          </Button>
          <Button variant="outline" onClick={onClose}>
            Đóng
          </Button>
        </div>
      }
    >
      <div className="space-y-6">
        <section>
          <h3 className="mb-2 text-sm font-semibold text-gray-900">Điều chỉnh</h3>
          {adjustments.length === 0 ? (
            <p className="text-sm text-gray-500">Không có điều chỉnh nào.</p>
          ) : (
            <div className="space-y-2">
              {adjustments.map((a) => (
                <div key={a.id} className="flex items-start gap-3 rounded-md border border-gray-200 px-3 py-2 text-sm">
                  <AdjustmentTypeBadge type={a.type} />
                  <div className="flex-1">
                    <p className="text-gray-900">{a.reason}</p>
                    <p className="text-xs text-gray-500">{formatDateTime(a.adjustedAt)}</p>
                  </div>
                  <span className={a.amountVnd >= 0 ? 'font-medium text-emerald-700' : 'font-medium text-red-700'}>
                    {a.amountVnd >= 0 ? '+' : ''}
                    {formatVnd(a.amountVnd)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>

        <section>
          <h3 className="mb-2 text-sm font-semibold text-gray-900">
            Encounters contributing ({encounters.length})
          </h3>
          {encounters.length === 0 ? (
            <p className="text-sm text-gray-500">Không có encounter nào.</p>
          ) : (
            <div className="overflow-hidden rounded-md border border-gray-200">
              <table className="table-base">
                <thead>
                  <tr>
                    <th>Ngày</th>
                    <th>Thời lượng</th>
                    <th className="text-right">Doanh thu</th>
                  </tr>
                </thead>
                <tbody>
                  {encounters.map((e) => (
                    <tr key={e.id}>
                      <td>
                        <p className="text-gray-900">{formatDateTime(e.encounterStartAt)}</p>
                        <p className="text-xs text-gray-500">→ {formatDateTime(e.encounterEndAt)}</p>
                      </td>
                      <td className="font-mono text-xs">{e.durationMinutes} phút</td>
                      <td className="text-right font-medium">{formatVnd(e.treatmentRevenueVnd)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {showLog && (
          <section>
            <h3 className="mb-2 text-sm font-semibold text-gray-900">Computation log</h3>
            <pre className="overflow-auto rounded-md bg-gray-900 p-3 text-xs text-gray-100 scrollbar-thin">
              {JSON.stringify(computationLog ?? {}, null, 2)}
            </pre>
          </section>
        )}
      </div>
    </Drawer>
  );
}
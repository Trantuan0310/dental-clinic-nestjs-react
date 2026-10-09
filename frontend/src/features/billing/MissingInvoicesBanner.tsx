import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle } from 'lucide-react';
import { billingApi } from '@/features/billing/billingApi';
import { Button } from '@/components/ui';
import { notify } from '@/components/ui/Toast';
import { formatDateTime } from '@/lib/format';
import { getApiErrorMessage } from '@/lib/errors';
import { useAuthStore } from '@/stores/authStore';

/**
 * Closed encounters without a valid invoice (A2-03 / A6-11): the automatic
 * draft failed, or the invoice was voided and not re-made. One click drafts
 * it ("tạo bù"); a voided one opens so it can be re-made.
 */
export function MissingInvoicesBanner() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const canCreate = useAuthStore((s) => s.hasPermission('invoice.create'));
  const [expanded, setExpanded] = useState(false);
  const { data: rows = [] } = useQuery({
    queryKey: ['invoices', 'missing'],
    queryFn: billingApi.listMissingInvoices,
    enabled: canCreate,
    staleTime: 60_000,
  });
  const backfill = useMutation({
    mutationFn: (encounterId: string) => billingApi.createFromEncounter(encounterId),
    onSuccess: (res) => {
      notify.success(res.created ? `Đã tạo hóa đơn nháp ${res.data.code}` : `Phiên khám đã có hóa đơn ${res.data.code}`);
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      navigate(`/billing/invoices/${res.data.id}`);
    },
    onError: (err) => notify.error(getApiErrorMessage(err, 'Không tạo được hóa đơn')),
  });

  if (!canCreate || rows.length === 0) return null;
  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
      <div className="flex items-center justify-between gap-3">
        <p className="flex items-center gap-2 font-medium">
          <AlertTriangle className="h-4 w-4" />
          {rows.length} phiên khám đã đóng nhưng chưa có hóa đơn hợp lệ
        </p>
        <button type="button" className="text-sm underline" onClick={() => setExpanded((v) => !v)}>
          {expanded ? 'Thu gọn' : 'Xem'}
        </button>
      </div>
      {expanded && (
        <ul className="mt-2 divide-y divide-amber-200 dark:divide-amber-500/20">
          {rows.map((r) => (
            <li key={r.encounterId} className="flex flex-wrap items-center justify-between gap-2 py-1.5">
              <span>
                {r.patientName} ({r.patientCode}) • BS {r.dentistName} • đóng {formatDateTime(r.closedAt)}
                {r.voidedInvoice && <> • hóa đơn {r.voidedInvoice.code} đã hủy</>}
              </span>
              {r.voidedInvoice ? (
                <Button size="sm" variant="outline" onClick={() => navigate(`/billing/invoices/${r.voidedInvoice!.id}`)}>
                  Mở hóa đơn đã hủy
                </Button>
              ) : (
                <Button
                  size="sm"
                  onClick={() => backfill.mutate(r.encounterId)}
                  isLoading={backfill.isPending && backfill.variables === r.encounterId}
                >
                  Tạo hóa đơn
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

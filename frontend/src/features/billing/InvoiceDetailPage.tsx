import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { vi } from 'date-fns/locale';
import {
  ArrowLeft,
  Printer,
  Send,
  XCircle,
  Plus,
  Percent,
  Pencil,
  RotateCcw,
  Undo2,
  FilePlus2,
} from 'lucide-react';
import { billingApi } from '@/features/billing/billingApi';
import { Button, Card, InvoiceStatusBadge, Modal, Alert, Textarea, Spinner } from '@/components/ui';
import { PaymentModal } from './PaymentModal';
import { notify } from '@/components/ui/Toast';
import { formatCurrency } from '@/lib/format';
import { getApiErrorMessage } from '@/lib/errors';
import { PermissionGuard } from '@/components/PermissionGuard';
import { ClinicPrintHeading } from '@/components/brand/ClinicPrintHeading';
import { useAuthStore } from '@/stores/authStore';
import type { InvoiceLineItem, Payment } from '@/types/billing';
import {
  DiscountModal,
  ItemEditModal,
  RefundModal,
  ReissueModal,
  VoidPaymentModal,
} from './InvoiceCorrections';

export default function InvoiceDetailPage() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();

  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [showVoidModal, setShowVoidModal] = useState(false);
  const [voidReason, setVoidReason] = useState('');
  const [showDiscount, setShowDiscount] = useState(false);
  const [showRefund, setShowRefund] = useState(false);
  const [showReissue, setShowReissue] = useState(false);
  const [editingItem, setEditingItem] = useState<InvoiceLineItem | null>(null);
  const [voidingPayment, setVoidingPayment] = useState<Payment | null>(null);
  const hasPermission = useAuthStore((s) => s.hasPermission);
  const myId = useAuthStore((s) => s.user?.id);

  const { data: invoice, isLoading } = useQuery({
    queryKey: ['invoice', id],
    queryFn: () => billingApi.getInvoice(id!),
    enabled: !!id,
  });

  const issueMutation = useMutation({
    mutationFn: () => billingApi.issueInvoice(id!, invoice!.version),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invoice', id] });
      notify.success('Phát hành hóa đơn thành công');
    },
    onError: (err) => {
      // A stale `invoice.version` (another tab already issued/paid/voided
      // this invoice) 409s here — without refetching, the cached version
      // never updates, so every retry fails identically until a manual
      // page refresh.
      queryClient.invalidateQueries({ queryKey: ['invoice', id] });
      notify.error(getApiErrorMessage(err, 'Không thể phát hành hóa đơn. Vui lòng thử lại.'));
    },
  });

  const voidMutation = useMutation({
    mutationFn: (reason: string) => billingApi.voidInvoice(id!, reason, invoice!.version),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invoice', id] });
      setShowVoidModal(false);
      notify.success('Hủy hóa đơn thành công');
    },
    onError: (err) => {
      queryClient.invalidateQueries({ queryKey: ['invoice', id] });
      notify.error(getApiErrorMessage(err, 'Không thể hủy hóa đơn. Vui lòng thử lại.'));
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-10">
        <Spinner size="lg" />
      </div>
    );
  }

  if (!invoice) {
    return (
      <div className="text-center py-10">
        <p className="text-gray-500">Không tìm thấy hóa đơn</p>
        <Button variant="outline" className="mt-3" onClick={() => navigate('/billing/list')}>
          Quay lại danh sách
        </Button>
      </div>
    );
  }

  const isDraft = invoice.status === 'DRAFT';
  const canIssue = isDraft;
  const canPay = invoice.status === 'ISSUED' || invoice.status === 'PARTIAL';
  // Money kept on the invoice must be refunded or its payment cancelled first (A2-01).
  const canVoid = invoice.status !== 'VOIDED' && invoice.paidAmount <= 0;
  const keepsMoney = invoice.status !== 'VOIDED' && invoice.paidAmount > 0;
  const canRefund = keepsMoney && invoice.status !== 'DRAFT';
  const canReissue = invoice.status === 'VOIDED' && !invoice.replacedBy;
  const editLines = isDraft && hasPermission('invoice.item.update');
  const discountAmount = invoice.subtotal - invoice.total;
  const refunded = invoice.refundedAmount ?? 0;

  return (
    <div className="print-document space-y-3">
      <div className="hidden text-center print:block">
        <ClinicPrintHeading />
        <p>HÓA ĐƠN DỊCH VỤ</p>
      </div>
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" aria-label="Quay lại danh sách hóa đơn" onClick={() => navigate('/billing/list')}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold text-gray-900">{invoice.code}</h1>
            <InvoiceStatusBadge status={invoice.status} />
          </div>
          <p className="mt-0.5 text-sm text-gray-500">
            {invoice.patientName} • {invoice.patientCode}
          </p>
        </div>
        <div className="flex gap-2">
          {canIssue && (
            <PermissionGuard permission="invoice.issue">
              <Button
                variant="outline"
                onClick={() => issueMutation.mutate()}
                isLoading={issueMutation.isPending}
              >
                <Send className="h-4 w-4" />
                Phát hành
              </Button>
            </PermissionGuard>
          )}
          {canPay && (
            <PermissionGuard permission="invoice.payment.create">
              <Button onClick={() => setShowPaymentModal(true)}>
                <Plus className="h-4 w-4" />
                Thu tiền
              </Button>
            </PermissionGuard>
          )}
          {isDraft && (
            <PermissionGuard permission="invoice.update">
              <Button variant="outline" onClick={() => setShowDiscount(true)}>
                <Percent className="h-4 w-4" />
                Giảm giá
              </Button>
            </PermissionGuard>
          )}
          {canRefund && (
            <PermissionGuard permission="invoice.refund">
              <Button variant="outline" onClick={() => setShowRefund(true)}>
                <Undo2 className="h-4 w-4" />
                Hoàn tiền
              </Button>
            </PermissionGuard>
          )}
          {canVoid && (
            <PermissionGuard permission="invoice.void">
              <Button variant="ghost" onClick={() => setShowVoidModal(true)}>
                <XCircle className="h-4 w-4" />
                Hủy HĐ
              </Button>
            </PermissionGuard>
          )}
          {canReissue && (
            <PermissionGuard permission="invoice.reissue">
              <Button variant="outline" onClick={() => setShowReissue(true)}>
                <FilePlus2 className="h-4 w-4" />
                Lập lại hóa đơn
              </Button>
            </PermissionGuard>
          )}
          <Button variant="outline" onClick={() => window.print()}>
            <Printer className="h-4 w-4" />
            In
          </Button>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Main Content */}
        <div className="lg:col-span-2 space-y-3">
          {/* Invoice Details */}
          <Card>
            <div className="space-y-3">
              <div className="flex justify-between text-sm">
                <div>
                  <p className="text-gray-500">Ngày tạo</p>
                  <p className="font-medium">
                    {format(new Date(invoice.createdAt), 'dd/MM/yyyy HH:mm', { locale: vi })}
                  </p>
                </div>
                {invoice.issuedAt && (
                  <div>
                    <p className="text-gray-500">Ngày phát hành</p>
                    <p className="font-medium">
                      {format(new Date(invoice.issuedAt), 'dd/MM/yyyy HH:mm', { locale: vi })}
                    </p>
                  </div>
                )}
                {invoice.voidedAt && (
                  <div>
                    <p className="text-gray-500">Ngày hủy</p>
                    <p className="font-medium">
                      {format(new Date(invoice.voidedAt), 'dd/MM/yyyy HH:mm', { locale: vi })}
                    </p>
                  </div>
                )}
              </div>

              {invoice.voidReason && (
                <Alert type="danger" title="Lý do hủy">
                  {invoice.voidReason}
                </Alert>
              )}
              {invoice.replacedBy && (
                <Alert type="info">
                  Đã lập lại thành hóa đơn{' '}
                  <Link className="font-medium underline" to={`/billing/invoices/${invoice.replacedBy.id}`}>
                    {invoice.replacedBy.code}
                  </Link>
                  .
                </Alert>
              )}
              {invoice.replaces && (
                <Alert type="info">
                  Lập lại thay cho hóa đơn đã hủy{' '}
                  <Link className="font-medium underline" to={`/billing/invoices/${invoice.replaces.id}`}>
                    {invoice.replaces.code}
                  </Link>
                  .
                </Alert>
              )}
              {keepsMoney && hasPermission('invoice.void') && (
                <p className="text-xs text-gray-500 print:hidden">
                  Muốn hủy hóa đơn này: hủy phiếu thu ghi nhầm hoặc hoàn tiền cho khách trước, rồi chọn "Hủy HĐ".
                </p>
              )}
            </div>
          </Card>

          {/* Line Items */}
          <Card title="Chi tiết hóa đơn">
            {invoice.items && invoice.items.length > 0 ? (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 text-left">
                    <th className="py-2 font-medium text-gray-600">#</th>
                    <th className="py-2 font-medium text-gray-600">Mô tả</th>
                    <th className="py-2 font-medium text-gray-600 text-right">SL</th>
                    <th className="py-2 font-medium text-gray-600 text-right">Đơn giá</th>
                    <th className="py-2 font-medium text-gray-600 text-right">Tổng</th>
                    {editLines && <th className="py-2 print:hidden" />}
                  </tr>
                </thead>
                <tbody>
                  {invoice.items.map((item, index) => (
                    <tr key={item.id} className="border-b border-gray-50">
                      <td className="py-2 text-gray-500">{index + 1}</td>
                      <td className="py-2">{item.description}</td>
                      <td className="py-2 text-right">{item.quantity}</td>
                      <td className="py-2 text-right">{formatCurrency(item.unitPrice)}</td>
                      <td className="py-2 text-right font-medium">{formatCurrency(item.lineTotal)}</td>
                      {editLines && (
                        <td className="py-2 text-right print:hidden">
                          <button
                            type="button"
                            aria-label={`Sửa dòng ${item.description}`}
                            onClick={() => setEditingItem(item)}
                            className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="text-sm text-gray-500">Chưa có dịch vụ nào</p>
            )}

            <div className="mt-3 space-y-1.5 border-t border-gray-100 pt-3">
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Tổng cộng</span>
                <span className="font-medium">{formatCurrency(invoice.subtotal)}</span>
              </div>
              {discountAmount > 0 && (
                <div className="flex justify-between text-sm text-green-600">
                  <span>
                    Giảm giá
                    {invoice.discountType === 'PERCENT' && invoice.discountValue
                      ? ` (${invoice.discountValue}%)`
                      : ''}
                  </span>
                  <span>-{formatCurrency(discountAmount)}</span>
                </div>
              )}
              <div className="flex justify-between text-sm font-medium border-t border-gray-100 pt-2">
                <span>Phải thu</span>
                <span>{formatCurrency(invoice.total)}</span>
              </div>
              <div className="flex justify-between text-sm text-green-600">
                <span>{refunded > 0 ? 'Đã thu (sau hoàn)' : 'Đã thu'}</span>
                <span>{formatCurrency(invoice.paidAmount)}</span>
              </div>
              {refunded > 0 && (
                <div className="flex justify-between text-sm text-red-600">
                  <span>Đã hoàn cho khách</span>
                  <span>{formatCurrency(refunded)}</span>
                </div>
              )}
              {invoice.outstandingAmount > 0 && (
                <div className="flex justify-between text-sm font-medium text-amber-600 border-t border-gray-100 pt-2">
                  <span>Còn nợ</span>
                  <span>{formatCurrency(invoice.outstandingAmount)}</span>
                </div>
              )}
            </div>
          </Card>
        </div>

        {/* Sidebar */}
        <div className="space-y-3">
          <Card>
            <h3 className="font-medium text-gray-900">Bệnh nhân</h3>
            <Link
              to={`/patients/${invoice.patientId}`}
              className="mt-1.5 block text-sm text-brand-600 hover:underline"
            >
              {invoice.patientName}
            </Link>
            <p className="text-xs text-gray-500">{invoice.patientCode}</p>
          </Card>

          {/* Payment History */}
          <Card title="Lịch sử thanh toán">
            {invoice.payments && invoice.payments.length > 0 ? (
              <div className="space-y-2">
                {invoice.payments.map((payment) => {
                  const isRefund = payment.kind === 'REFUND';
                  const voided = payment.status === 'VOIDED';
                  const mayVoid =
                    !voided && invoice.status !== 'VOIDED' && hasPermission('invoice.payment.void');
                  return (
                    <div
                      key={payment.id}
                      className={`rounded p-2.5 text-sm ${voided ? 'bg-gray-50 opacity-70' : isRefund ? 'bg-red-50' : 'bg-gray-50'}`}
                    >
                      <div className="flex justify-between">
                        <span
                          className={`font-medium ${voided ? 'text-gray-400 line-through' : isRefund ? 'text-red-600' : 'text-green-600'}`}
                        >
                          {isRefund ? '−' : '+'}
                          {formatCurrency(payment.amount)}
                          {isRefund && ' (hoàn)'}
                        </span>
                        <span className="text-gray-500">
                          {format(new Date(payment.paidAt), 'dd/MM/yyyy HH:mm', { locale: vi })}
                        </span>
                      </div>
                      <div className="mt-0.5 text-xs text-gray-500">
                        {payment.method === 'CASH' && 'Tiền mặt'}
                        {payment.method === 'BANK_TRANSFER' && 'Chuyển khoản'}
                        {payment.note && <span> • {payment.note}</span>}
                      </div>
                      <p className="text-xs text-gray-400">Bởi: {payment.receivedByUser?.fullName ?? '-'}</p>
                      {voided && (
                        <p className="text-xs text-red-600">
                          Đã hủy{payment.voidedByUser ? ` bởi ${payment.voidedByUser.fullName}` : ''}
                          {payment.voidReason ? `: ${payment.voidReason}` : ''}
                        </p>
                      )}
                      {mayVoid && (
                        <button
                          type="button"
                          className="mt-1 inline-flex items-center gap-1 text-xs text-red-600 hover:underline print:hidden"
                          onClick={() => setVoidingPayment(payment)}
                          title={
                            payment.receivedBy === myId
                              ? 'Phiếu do bạn lập: cần một quản trị viên khác hủy (trừ khi chỉ có mình bạn có quyền này)'
                              : undefined
                          }
                        >
                          <RotateCcw className="h-3 w-3" />
                          {isRefund ? 'Hủy phiếu hoàn (lập nhầm)' : 'Hủy phiếu thu (ghi nhầm)'}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-sm text-gray-500">Chưa có thanh toán nào</p>
            )}
          </Card>
        </div>
      </div>

      {/* Payment Modal */}
      <PaymentModal
        isOpen={showPaymentModal}
        onClose={() => setShowPaymentModal(false)}
        invoice={invoice}
      />

      <DiscountModal invoice={invoice} isOpen={showDiscount} onClose={() => setShowDiscount(false)} />
      <ItemEditModal invoice={invoice} item={editingItem} onClose={() => setEditingItem(null)} />
      <RefundModal invoice={invoice} isOpen={showRefund} onClose={() => setShowRefund(false)} />
      <VoidPaymentModal invoice={invoice} payment={voidingPayment} onClose={() => setVoidingPayment(null)} />
      <ReissueModal invoice={invoice} isOpen={showReissue} onClose={() => setShowReissue(false)} />

      {/* Void Modal */}
      <Modal
        isOpen={showVoidModal}
        onClose={() => setShowVoidModal(false)}
        title="Hủy hóa đơn"
        size="sm"
      >
        <div className="space-y-4">
          <Alert type="warning">
            Hóa đơn sẽ bị hủy và không còn tính doanh thu. Nếu lập sai, sau khi hủy có thể chọn "Lập lại hóa đơn"
            để tạo hóa đơn mới cho phiên khám này.
          </Alert>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-200">
              Lý do hủy <span className="text-red-500">*</span>
            </label>
            <Textarea
              value={voidReason}
              onChange={(e) => setVoidReason(e.target.value)}
              className="mt-1"
              rows={3}
              placeholder="Nhập lý do hủy hóa đơn..."
            />
          </div>
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={() => setShowVoidModal(false)}>
              Hủy
            </Button>
            <Button
              variant="danger"
              onClick={() => voidMutation.mutate(voidReason)}
              isLoading={voidMutation.isPending}
              disabled={voidReason.trim().length < 5}
            >
              Hủy hóa đơn
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

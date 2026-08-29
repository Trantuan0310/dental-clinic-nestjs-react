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
} from 'lucide-react';
import { billingApi } from '@/features/billing/billingApi';
import { Button, Card, StatusBadge, Modal, Alert, Textarea, Spinner } from '@/components/ui';
import { PaymentModal } from './PaymentModal';
import { notify } from '@/components/ui/Toast';
import { formatCurrency } from '@/lib/format';

export default function InvoiceDetailPage() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();

  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [showVoidModal, setShowVoidModal] = useState(false);
  const [voidReason, setVoidReason] = useState('');

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
    onError: () => notify.error('Không thể phát hành hóa đơn. Vui lòng thử lại.'),
  });

  const voidMutation = useMutation({
    mutationFn: (reason: string) => billingApi.voidInvoice(id!, reason, invoice!.version),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invoice', id] });
      setShowVoidModal(false);
      notify.success('Hủy hóa đơn thành công');
    },
    onError: () => {
      notify.error('Không thể hủy hóa đơn. Vui lòng thử lại.');
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
        <Button variant="outline" className="mt-3" onClick={() => navigate('/invoices')}>
          Quay lại danh sách
        </Button>
      </div>
    );
  }

  const canIssue = invoice.status === 'draft';
  const canPay = invoice.status === 'issued' || invoice.status === 'partial';
  const canVoid = invoice.status !== 'void' && invoice.status !== 'paid';

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" onClick={() => navigate('/invoices')}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold text-gray-900">{invoice.code}</h1>
            <StatusBadge status={invoice.status} />
          </div>
          <p className="mt-0.5 text-sm text-gray-500">
            {invoice.patientName} • {invoice.patientCode}
          </p>
        </div>
        <div className="flex gap-2">
          {canIssue && (
            <Button
              variant="outline"
              onClick={() => issueMutation.mutate()}
              isLoading={issueMutation.isPending}
            >
              <Send className="h-4 w-4" />
              Phát hành
            </Button>
          )}
          {canPay && (
            <Button onClick={() => setShowPaymentModal(true)}>
              <Plus className="h-4 w-4" />
              Thu tiền
            </Button>
          )}
          {canVoid && (
            <Button variant="ghost" onClick={() => setShowVoidModal(true)}>
              <XCircle className="h-4 w-4" />
              Hủy HĐ
            </Button>
          )}
          <Button variant="outline">
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
            </div>
          </Card>

          {/* Line Items */}
          <Card title="Chi tiết hóa đơn">
            {invoice.lineItems && invoice.lineItems.length > 0 ? (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 text-left">
                    <th className="py-2 font-medium text-gray-600">#</th>
                    <th className="py-2 font-medium text-gray-600">Mô tả</th>
                    <th className="py-2 font-medium text-gray-600 text-right">SL</th>
                    <th className="py-2 font-medium text-gray-600 text-right">Đơn giá</th>
                    <th className="py-2 font-medium text-gray-600 text-right">Tổng</th>
                  </tr>
                </thead>
                <tbody>
                  {invoice.lineItems.map((item, index) => (
                    <tr key={item.id} className="border-b border-gray-50">
                      <td className="py-2 text-gray-500">{index + 1}</td>
                      <td className="py-2">{item.description}</td>
                      <td className="py-2 text-right">{item.quantity}</td>
                      <td className="py-2 text-right">{formatCurrency(item.unitPrice)}</td>
                      <td className="py-2 text-right font-medium">{formatCurrency(item.total)}</td>
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
              {invoice.discount > 0 && (
                <div className="flex justify-between text-sm text-green-600">
                  <span>Giảm giá</span>
                  <span>-{formatCurrency(invoice.discount)}</span>
                </div>
              )}
              <div className="flex justify-between text-sm font-medium border-t border-gray-100 pt-2">
                <span>Phải thu</span>
                <span>{formatCurrency(invoice.total)}</span>
              </div>
              <div className="flex justify-between text-sm text-green-600">
                <span>Đã thu</span>
                <span>{formatCurrency(invoice.amountPaid)}</span>
              </div>
              {invoice.amountDue > 0 && (
                <div className="flex justify-between text-sm font-medium text-amber-600 border-t border-gray-100 pt-2">
                  <span>Còn nợ</span>
                  <span>{formatCurrency(invoice.amountDue)}</span>
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
                {invoice.payments.map((payment) => (
                  <div key={payment.id} className="rounded bg-gray-50 p-2.5 text-sm">
                    <div className="flex justify-between">
                      <span className="font-medium text-green-600">
                        +{formatCurrency(payment.amount)}
                      </span>
                      <span className="text-gray-500">
                        {format(new Date(payment.paidAt), 'dd/MM/yyyy HH:mm', { locale: vi })}
                      </span>
                    </div>
                    <div className="mt-0.5 text-xs text-gray-500">
                      {payment.method === 'cash' && 'Tiền mặt'}
                      {payment.method === 'bank_transfer' && 'Chuyển khoản'}
                      {payment.method === 'card' && 'Thẻ'}
                      {payment.notes && <span> • {payment.notes}</span>}
                    </div>
                    <p className="text-xs text-gray-400">Bởi: {payment.receivedByUser?.fullName ?? '-'}</p>
                  </div>
                ))}
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

      {/* Void Modal */}
      <Modal
        isOpen={showVoidModal}
        onClose={() => setShowVoidModal(false)}
        title="Hủy hóa đơn"
        size="sm"
      >
        <div className="space-y-4">
          <Alert type="warning">
            Hành động này sẽ hủy hóa đơn. Không thể hoàn tác.
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
              disabled={!voidReason.trim()}
            >
              Hủy hóa đơn
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

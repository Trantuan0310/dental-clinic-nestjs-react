import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Modal, Button, Input, Select } from '@/components/ui';
import { notify } from '@/components/ui/Toast';
import { getApiErrorMessage } from '@/lib/errors';
import { formatCurrency } from '@/lib/format';
import { billingApi } from '@/features/billing/billingApi';
import type { Invoice, PaymentMethod } from '@/types/billing';

interface PaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  invoice: Invoice;
}

export function PaymentModal({ isOpen, onClose, invoice }: PaymentModalProps) {
  const queryClient = useQueryClient();
  const [amount, setAmount] = useState(invoice.outstandingAmount.toString());
  const [method, setMethod] = useState<PaymentMethod>('CASH');
  const [note, setNote] = useState('');

  // This modal never unmounts between opens (only Modal's `isOpen` toggles),
  // so state from a previous payment (e.g. a partial amount + note) would
  // otherwise stick around and default to a stale outstandingAmount next
  // time it's opened. Re-sync to the current invoice whenever it (re)opens.
  useEffect(() => {
    if (isOpen) {
      setAmount(invoice.outstandingAmount.toString());
      setMethod('CASH');
      setNote('');
    }
  }, [isOpen, invoice.outstandingAmount]);

  const parsedAmount = parseFloat(amount);

  const mutation = useMutation({
    mutationFn: () =>
      billingApi.createPayment(invoice.id, {
        amount: parsedAmount,
        method,
        note: note || undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invoice', invoice.id] });
      onClose();
    },
    onError: (err) => {
      notify.error(getApiErrorMessage(err, 'Không thể ghi nhận thanh toán'));
    },
  });

  const handlePayAll = () => {
    setAmount(invoice.outstandingAmount.toString());
  };

  const handleSubmit = () => {
    mutation.mutate();
  };

  const paymentMethods: { value: PaymentMethod; label: string }[] = [
    { value: 'CASH', label: 'Tiền mặt' },
    { value: 'BANK_TRANSFER', label: 'Chuyển khoản' },
  ];

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Thu tiền" size="sm">
      <div className="space-y-4">
        {/* Invoice Summary */}
        <div className="rounded-lg bg-gray-50 p-4 space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-gray-600">Tổng hóa đơn</span>
            <span className="font-medium">{formatCurrency(invoice.total)}</span>
          </div>
          <div className="flex justify-between text-sm text-green-600">
            <span>Đã thu</span>
            <span>{formatCurrency(invoice.paidAmount)}</span>
          </div>
          <div className="flex justify-between text-sm font-medium text-amber-600 border-t border-gray-200 pt-2">
            <span>Còn nợ</span>
            <span>{formatCurrency(invoice.outstandingAmount)}</span>
          </div>
        </div>

        {/* Amount */}
        <Input
          label="Số tiền thu (VND)"
          type="number"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          min={1}
          max={invoice.outstandingAmount}
          required
        />

        <button
          type="button"
          onClick={handlePayAll}
          className="text-sm text-brand-600 hover:text-brand-700 hover:underline"
        >
          Thu hết ({formatCurrency(invoice.outstandingAmount)})
        </button>

        {/* Payment Method */}
        <Select
          label="Phương thức thanh toán"
          value={method}
          onChange={(e) => setMethod(e.target.value as PaymentMethod)}
          options={paymentMethods}
          required
        />

        {/* Notes */}
        <div>
          <label className="block text-sm font-medium text-gray-700">Ghi chú</label>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            rows={2}
            placeholder="VD: Khách trả trước một phần..."
          />
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-3 pt-4 border-t border-gray-100">
          <Button variant="outline" onClick={onClose}>
            Hủy
          </Button>
          <Button
            onClick={handleSubmit}
            isLoading={mutation.isPending}
            disabled={
              !amount ||
              !Number.isFinite(parsedAmount) ||
              parsedAmount <= 0 ||
              parsedAmount > invoice.outstandingAmount
            }
          >
            Xác nhận
          </Button>
        </div>
      </div>
    </Modal>
  );
}

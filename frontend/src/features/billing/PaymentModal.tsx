import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Modal, Button, Input, Select } from '@/components/ui';
import { notify } from '@/components/ui/Toast';
import { getApiErrorMessage } from '@/lib/errors';
import { formatCurrency } from '@/lib/format';
import { billingApi } from '@/features/billing/billingApi';
import type { Invoice, PaymentMethod } from '@/types/billing';

/** A key for one payment the cashier means to record (see requestKey). */
function newRequestKey(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

interface PaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  invoice: Invoice;
}

export function PaymentModal({ isOpen, onClose, invoice }: PaymentModalProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [amount, setAmount] = useState(String(Math.floor(invoice.outstandingAmount)));
  const [method, setMethod] = useState<PaymentMethod>('CASH');
  const [note, setNote] = useState('');
  // Kept for the whole time the dialog is open: a double click or a retry
  // after a lost response sends the same key, and the server records the
  // money once (BILL-02). A fresh key each time the dialog opens.
  const [requestKey, setRequestKey] = useState(newRequestKey);

  // This modal never unmounts between opens (only Modal's `isOpen` toggles),
  // so state from a previous payment (e.g. a partial amount + note) would
  // otherwise stick around and default to a stale outstandingAmount next
  // time it's opened. Re-sync to the current invoice whenever it (re)opens.
  useEffect(() => {
    if (isOpen) {
      setAmount(String(Math.floor(invoice.outstandingAmount)));
      setMethod('CASH');
      setNote('');
      setRequestKey(newRequestKey());
    }
  }, [isOpen, invoice.outstandingAmount]);

  const parsedAmount = parseFloat(amount);

  const mutation = useMutation({
    mutationFn: () =>
      billingApi.createPayment(invoice.id, {
        amount: parsedAmount,
        method,
        note: note || undefined,
        requestKey,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invoice', invoice.id] });
      // The AI summary counts the patient's unpaid invoices.
      queryClient.invalidateQueries({ queryKey: ['ai-summary', invoice.patientId] });
      onClose();
    },
    onError: (err) => {
      notify.error(getApiErrorMessage(err, t('uiOperations.paymentFailed')));
    },
  });

  const handlePayAll = () => {
    setAmount(String(Math.floor(invoice.outstandingAmount)));
  };

  const handleSubmit = () => {
    mutation.mutate();
  };

  const paymentMethods: { value: PaymentMethod; label: string }[] = [
    { value: 'CASH', label: t('uiOperations.cash') },
    { value: 'BANK_TRANSFER', label: t('uiOperations.bankTransfer') },
  ];

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={t('uiOperations.payment')} size="sm">
      <div className="space-y-4">
        {/* Invoice Summary */}
        <div className="rounded-lg bg-gray-50 p-4 space-y-2 dark:bg-surface-800">
          <div className="flex justify-between text-sm">
            <span className="text-gray-600 dark:text-gray-300">{t('uiOperations.invoiceTotal')}</span>
            <span className="font-medium">{formatCurrency(invoice.total)}</span>
          </div>
          <div className="flex justify-between text-sm text-green-600 dark:text-green-400">
            <span>{t('uiOperations.collected')}</span>
            <span>{formatCurrency(invoice.paidAmount)}</span>
          </div>
          <div className="flex justify-between text-sm font-medium text-amber-600 border-t border-gray-200 pt-2 dark:border-surface-700 dark:text-amber-400">
            <span>{t('uiOperations.outstanding')}</span>
            <span>{formatCurrency(invoice.outstandingAmount)}</span>
          </div>
        </div>

        {/* Amount */}
        <Input
          label={t('uiOperations.amountReceivedVnd')}
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
          className="text-sm text-brand-600 hover:text-brand-700 hover:underline dark:text-brand-400 dark:hover:text-brand-300"
        >
          {t('uiOperations.payAll', { amount: formatCurrency(invoice.outstandingAmount) })}
        </button>

        {/* Payment Method */}
        <Select
          label={t('uiOperations.paymentMethod')}
          value={method}
          onChange={(e) => setMethod(e.target.value as PaymentMethod)}
          options={paymentMethods}
          required
        />

        {/* Notes */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-200">{t('uiOperations.note')}</label>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className="mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 dark:border-surface-600 dark:bg-surface-800 dark:text-gray-100"
            rows={2}
            placeholder={t('uiOperations.paymentNoteExample')}
          />
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-3 pt-4 border-t border-gray-100 dark:border-surface-700">
            <Button variant="outline" onClick={onClose}>
            {t('uiOperations.cancel')}
          </Button>
          <Button
            onClick={handleSubmit}
            isLoading={mutation.isPending}
            disabled={
              !amount ||
              !Number.isFinite(parsedAmount) ||
              parsedAmount <= 0 ||
              // Whole đồng only; a sub-đồng remainder of an old invoice counts as settled.
              !Number.isInteger(parsedAmount) ||
              parsedAmount > invoice.outstandingAmount
            }
          >
            {t('uiOperations.confirm')}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

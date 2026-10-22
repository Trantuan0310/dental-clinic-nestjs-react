// Correction dialogs of the invoice detail page: discount and line edits
// while DRAFT, refunds, cancelling a payment entered by mistake, re-making a
// voided invoice. Every one asks for a reason (kept in the invoice history).
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { billingApi } from '@/features/billing/billingApi';
import { Alert, Button, Input, Modal, Select, Textarea } from '@/components/ui';
import { notify } from '@/components/ui/Toast';
import { formatCurrency } from '@/lib/format';
import { getApiErrorMessage } from '@/lib/errors';
import { useAuthStore } from '@/stores/authStore';
import type { Invoice, InvoiceLineItem, Payment, PaymentMethod } from '@/types/billing';

const MIN_REASON = 5;
/** Same threshold as the server (billing.service LARGE_DISCOUNT_RATIO). */
const LARGE_DISCOUNT_RATIO = 0.5;

function ReasonField({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  const { t } = useTranslation();
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 dark:text-gray-200">
        {t('uiOperations.reason')} <span className="text-red-500">*</span>
      </label>
      <Textarea value={value} onChange={(e) => onChange(e.target.value)} className="mt-1" rows={2} placeholder={placeholder} />
      {value.trim().length > 0 && value.trim().length < MIN_REASON && (
        <p className="mt-1 text-xs text-red-600">{t('uiOperations.reasonMinLength', { count: MIN_REASON })}</p>
      )}
    </div>
  );
}

/** Refetch the invoice whatever happened: a 409 usually means it changed meanwhile. */
function useInvoiceMutation<T>(invoiceId: string, fn: (v: T) => Promise<unknown>, done: string, onDone: () => void, failed: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      notify.success(done);
      onDone();
    },
    onError: (err) => notify.error(getApiErrorMessage(err, failed)),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['invoice', invoiceId] });
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      // Refunds and cancelled receipts change the AI summary's unpaid count.
      queryClient.invalidateQueries({ queryKey: ['ai-summary'] });
    },
  });
}

/** Discount by percent (rounded to whole đồng by the server) or amount, DRAFT only (A2-10). */
export function DiscountModal({ invoice, isOpen, onClose }: { invoice: Invoice; isOpen: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const [type, setType] = useState<'PERCENT' | 'AMOUNT'>('PERCENT');
  const [value, setValue] = useState('');
  const [reason, setReason] = useState('');
  // Kept in the dialog, not only in a toast: e.g. "above 50% needs an admin".
  const [apiError, setApiError] = useState<string | null>(null);
  useEffect(() => {
    if (!isOpen) return;
    setType(invoice.discountType ?? 'PERCENT');
    setValue(invoice.discountValue ? String(invoice.discountValue) : '');
    setReason('');
    setApiError(null);
  }, [isOpen, invoice.discountType, invoice.discountValue]);

  const num = value === '' ? 0 : Number(value);
  const preview = type === 'PERCENT' ? Math.round((invoice.subtotal * num) / 100) : num;
  // BR-BILL-025: above half the subtotal only an admin may discount (the server checks too).
  const canDiscountLarge = useAuthStore((s) => s.hasPermission('invoice.discount.large'));
  const tooLarge = !canDiscountLarge && preview > invoice.subtotal * LARGE_DISCOUNT_RATIO;
  const invalid =
    !Number.isFinite(num) ||
    num < 0 ||
    (type === 'PERCENT' ? num > 100 : num > invoice.subtotal || !Number.isInteger(num)) ||
    (num > 0 && reason.trim().length < MIN_REASON) ||
    tooLarge;

  const save = useInvoiceMutation(
    invoice.id,
    () =>
      billingApi.updateDiscount(invoice.id, {
        discountType: type,
        discountValue: num,
        ...(num > 0 && { reason: reason.trim() }),
        version: invoice.version,
      }),
    num > 0 ? t('uiOperations.discountApplied') : t('uiOperations.discountRemoved'),
    onClose,
    t('uiOperations.discountFailed'),
  );

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={t('uiOperations.invoiceDiscount')} size="sm">
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Select
            label={t('uiOperations.discountType')}
            value={type}
            onChange={(e) => setType(e.target.value as 'PERCENT' | 'AMOUNT')}
            options={[
              { value: 'PERCENT', label: t('uiOperations.byPercent') },
              { value: 'AMOUNT', label: t('uiOperations.amountVnd') },
            ]}
          />
          <Input
            label={type === 'PERCENT' ? t('uiOperations.percentage') : t('uiOperations.amount')}
            type="number"
            min={0}
            max={type === 'PERCENT' ? 100 : invoice.subtotal}
            step={type === 'PERCENT' ? 0.5 : 1000}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            hint={t('uiOperations.enterZeroToRemoveDiscount')}
          />
        </div>
        <div className="rounded bg-gray-50 p-3 text-sm dark:bg-surface-800">
          <div className="flex justify-between">
            <span>{t('uiOperations.subtotal')}</span>
            <span>{formatCurrency(invoice.subtotal)}</span>
          </div>
          <div className="flex justify-between text-green-600">
            <span>{t('uiOperations.discount')}</span>
            <span>-{formatCurrency(Number.isFinite(preview) ? preview : 0)}</span>
          </div>
          <div className="flex justify-between font-medium">
            <span>{t('uiOperations.amountDue')}</span>
            <span>{formatCurrency(invoice.subtotal - (Number.isFinite(preview) ? preview : 0))}</span>
          </div>
        </div>
        {num > 0 && <ReasonField value={reason} onChange={setReason} placeholder={t('uiOperations.discountReasonExample')} />}
        {tooLarge && <Alert type="warning">{t('uiOperations.discountLargeNeedsAdmin')}</Alert>}
        {apiError && <Alert type="danger">{apiError}</Alert>}
        <div className="flex justify-end gap-3">
          <Button variant="outline" onClick={onClose}>{t('uiOperations.cancel')}</Button>
          <Button
            onClick={() => {
              setApiError(null);
              save.mutate(undefined, { onError: (err) => setApiError(getApiErrorMessage(err, t('uiOperations.discountFailed'))) });
            }}
            isLoading={save.isPending}
            disabled={invalid}
          >
            {t('uiOperations.save')}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

/** Fix the price, quantity or wording of a DRAFT line, or drop it (A2-02). */
export function ItemEditModal({ invoice, item, onClose }: { invoice: Invoice; item: InvoiceLineItem | null; onClose: () => void }) {
  const { t } = useTranslation();
  const [description, setDescription] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [unitPrice, setUnitPrice] = useState('');
  const [remove, setRemove] = useState(false);
  const [reason, setReason] = useState('');
  useEffect(() => {
    if (!item) return;
    setDescription(item.description);
    setQuantity(String(item.quantity));
    setUnitPrice(String(item.unitPrice));
    setRemove(false);
    setReason('');
  }, [item]);

  const qty = Number(quantity);
  const price = Number(unitPrice);
  const lastLine = (invoice.items?.length ?? 0) <= 1;
  const invalid =
    reason.trim().length < MIN_REASON ||
    (!remove &&
      (!Number.isInteger(qty) || qty < 1 || qty > 100 || !Number.isInteger(price) || price < 0 || description.trim().length < 2));

  const save = useInvoiceMutation(
    invoice.id,
    () =>
      billingApi.updateItem(invoice.id, item!.id, {
        ...(remove
          ? { remove: true }
          : { description: description.trim(), quantity: qty, unitPrice: price }),
        reason: reason.trim(),
        version: invoice.version,
      }),
    remove ? t('uiOperations.invoiceLineRemoved') : t('uiOperations.invoiceLineUpdated'),
    onClose,
    t('uiOperations.invoiceLineUpdateFailed'),
  );

  return (
    <Modal isOpen={!!item} onClose={onClose} title={t('uiOperations.editInvoiceLineTitle')} size="sm">
      {item && (
        <div className="space-y-4">
          <p className="text-xs text-gray-500">
            {t('uiOperations.editInvoiceLineNote')}
          </p>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={remove}
              disabled={lastLine}
              onChange={(e) => setRemove(e.target.checked)}
            />
            {t('uiOperations.removeInvoiceLine')}
            {lastLine && <span className="text-xs text-gray-400">{t('uiOperations.onlyInvoiceLine')}</span>}
          </label>
          {!remove && (
            <>
              <Input label={t('uiOperations.description')} value={description} onChange={(e) => setDescription(e.target.value)} />
              <div className="grid grid-cols-2 gap-3">
                <Input label={t('uiOperations.quantity')} type="number" min={1} max={100} value={quantity} onChange={(e) => setQuantity(e.target.value)} />
                <Input
                  label={t('uiOperations.unitPriceVnd')}
                  type="number"
                  min={0}
                  step={1000}
                  value={unitPrice}
                  onChange={(e) => setUnitPrice(e.target.value)}
                  hint={t('uiOperations.previousAmount', { amount: formatCurrency(item.unitPrice) })}
                />
              </div>
            </>
          )}
          <ReasonField value={reason} onChange={setReason} placeholder={t('uiOperations.invoiceLineReasonExample')} />
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={onClose}>{t('uiOperations.cancel')}</Button>
            <Button variant={remove ? 'danger' : 'primary'} onClick={() => save.mutate(undefined)} isLoading={save.isPending} disabled={invalid}>
              {remove ? t('uiOperations.removeLine') : t('uiOperations.save')}
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}

/** Money handed back to the patient, dated today (A2-01). */
export function RefundModal({ invoice, isOpen, onClose }: { invoice: Invoice; isOpen: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<PaymentMethod>('CASH');
  const [reason, setReason] = useState('');
  useEffect(() => {
    if (!isOpen) return;
    setAmount(String(Math.floor(invoice.paidAmount)));
    setMethod('CASH');
    setReason('');
  }, [isOpen, invoice.paidAmount]);

  const num = Number(amount);
  const invalid = !Number.isInteger(num) || num < 1 || num > invoice.paidAmount || reason.trim().length < MIN_REASON;
  const save = useInvoiceMutation(
    invoice.id,
    () => billingApi.refund(invoice.id, { amount: num, method, reason: reason.trim(), version: invoice.version }),
    t('uiOperations.refundCreated'),
    onClose,
    t('uiOperations.refundFailed'),
  );

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={t('uiOperations.refundForPatient')} size="sm">
      <div className="space-y-4">
        <Alert type="info">
          {t('uiOperations.refundPolicy')}
        </Alert>
        <Input
          label={t('uiOperations.refundAmountMax', { amount: formatCurrency(invoice.paidAmount) })}
          type="number"
          min={1}
          max={invoice.paidAmount}
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
        />
        <Select label={t('uiOperations.refundMethod')} value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)} options={[{ value: 'CASH', label: t('uiOperations.cash') }, { value: 'BANK_TRANSFER', label: t('uiOperations.bankTransfer') }]} />
        <ReasonField value={reason} onChange={setReason} placeholder={t('uiOperations.refundReasonExample')} />
        <div className="flex justify-end gap-3">
          <Button variant="outline" onClick={onClose}>{t('uiOperations.cancel')}</Button>
          <Button variant="danger" onClick={() => save.mutate(undefined)} isLoading={save.isPending} disabled={invalid}>
            {t('uiOperations.refund')}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

/**
 * "Điều chỉnh giảm / xoá nợ" (admin): lowers what is still owed on an issued
 * invoice, payments untouched; revenue and commission drop on that day.
 */
export function AdjustModal({ invoice, isOpen, onClose }: { invoice: Invoice; isOpen: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  useEffect(() => {
    if (!isOpen) return;
    setAmount(String(Math.floor(invoice.outstandingAmount)));
    setReason('');
  }, [isOpen, invoice.outstandingAmount]);

  const num = Number(amount);
  const invalid =
    !Number.isInteger(num) || num < 1 || num > invoice.outstandingAmount || reason.trim().length < MIN_REASON;
  const save = useInvoiceMutation(
    invoice.id,
    () => billingApi.adjustInvoice(invoice.id, { amount: num, reason: reason.trim(), version: invoice.version }),
    t('uiOperations.adjustDone'),
    onClose,
    t('uiOperations.adjustFailed'),
  );

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={t('uiOperations.adjustDown')} size="sm">
      <div className="space-y-4">
        <Alert type="info">{t('uiOperations.adjustDownHelp')}</Alert>
        <Input
          label={t('uiOperations.adjustAmountMax', { amount: formatCurrency(invoice.outstandingAmount) })}
          type="number"
          min={1}
          max={invoice.outstandingAmount}
          step={1000}
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
        />
        <ReasonField value={reason} onChange={setReason} placeholder={t('uiOperations.adjustReasonExample')} />
        <div className="flex justify-end gap-3">
          <Button variant="outline" onClick={onClose}>{t('uiOperations.cancel')}</Button>
          <Button variant="danger" onClick={() => save.mutate(undefined)} isLoading={save.isPending} disabled={invalid}>
            {t('uiOperations.adjustDown')}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

/** "Hủy phiếu thu": cancels a payment/refund entered by mistake (A2-01, A5-01). */
export function VoidPaymentModal({ invoice, payment, onClose }: { invoice: Invoice; payment: Payment | null; onClose: () => void }) {
  const { t } = useTranslation();
  const [reason, setReason] = useState('');
  useEffect(() => setReason(''), [payment]);
  const isRefund = payment?.kind === 'REFUND';
  const save = useInvoiceMutation(
    invoice.id,
    () => billingApi.voidPayment(payment!.id, reason.trim()),
    isRefund ? t('uiOperations.refundVoided') : t('uiOperations.paymentVoided'),
    onClose,
    t('uiOperations.voidPaymentFailed'),
  );
  return (
    <Modal isOpen={!!payment} onClose={onClose} title={isRefund ? t('uiOperations.voidRefund') : t('uiOperations.voidPayment')} size="sm">
      {payment && (
        <div className="space-y-4">
          <Alert type="warning">
            {isRefund
              ? t('uiOperations.voidRefundWarning', { amount: formatCurrency(payment.amount) })
              : t('uiOperations.voidPaymentWarning', { amount: formatCurrency(payment.amount) })}{' '}
            {t('uiOperations.paymentCreatorCannotVoid')}
          </Alert>
          <ReasonField value={reason} onChange={setReason} placeholder={t('uiOperations.voidPaymentReasonExample')} />
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={onClose}>{t('uiOperations.close')}</Button>
            <Button variant="danger" onClick={() => save.mutate(undefined)} isLoading={save.isPending} disabled={reason.trim().length < MIN_REASON}>
              {t('uiOperations.voidPaymentAction')}
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}

/** "Lập lại hóa đơn" for a voided invoice: a new DRAFT copied from the treatments (A2-02). */
export function ReissueModal({ invoice, isOpen, onClose }: { invoice: Invoice; isOpen: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [reason, setReason] = useState('');
  useEffect(() => {
    if (isOpen) setReason('');
  }, [isOpen]);
  const save = useMutation({
    mutationFn: () => billingApi.reissueInvoice(invoice.id, reason.trim()),
    onSuccess: (created) => {
      notify.success(t('uiOperations.invoiceReissuedToast', { code: created.code }));
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      onClose();
      navigate(`/billing/invoices/${created.id}`);
    },
    onError: (err) => notify.error(getApiErrorMessage(err, t('uiOperations.reissueInvoiceFailed'))),
  });
  return (
    <Modal isOpen={isOpen} onClose={onClose} title={t('uiOperations.reissueInvoice')} size="sm">
      <div className="space-y-4">
        <p className="text-sm text-gray-600 dark:text-gray-300">
          {t('uiOperations.reissueInvoiceDescription', { code: invoice.code })}
        </p>
        <ReasonField value={reason} onChange={setReason} placeholder={t('uiOperations.reissueReasonExample')} />
        <div className="flex justify-end gap-3">
          <Button variant="outline" onClick={onClose}>{t('uiOperations.cancel')}</Button>
          <Button onClick={() => save.mutate()} isLoading={save.isPending} disabled={reason.trim().length < MIN_REASON}>
            {t('uiOperations.reissueInvoice')}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

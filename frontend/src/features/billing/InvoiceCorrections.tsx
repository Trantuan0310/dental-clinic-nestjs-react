// Correction dialogs of the invoice detail page: discount and line edits
// while DRAFT, refunds, cancelling a payment entered by mistake, re-making a
// voided invoice. Every one asks for a reason (kept in the invoice history).
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { billingApi } from '@/features/billing/billingApi';
import { Alert, Button, Input, Modal, Select, Textarea } from '@/components/ui';
import { notify } from '@/components/ui/Toast';
import { formatCurrency } from '@/lib/format';
import { getApiErrorMessage } from '@/lib/errors';
import type { Invoice, InvoiceLineItem, Payment, PaymentMethod } from '@/types/billing';

const MIN_REASON = 5;
const METHODS: { value: PaymentMethod; label: string }[] = [
  { value: 'CASH', label: 'Tiền mặt' },
  { value: 'BANK_TRANSFER', label: 'Chuyển khoản' },
];

function ReasonField({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 dark:text-gray-200">
        Lý do <span className="text-red-500">*</span>
      </label>
      <Textarea value={value} onChange={(e) => onChange(e.target.value)} className="mt-1" rows={2} placeholder={placeholder} />
      {value.trim().length > 0 && value.trim().length < MIN_REASON && (
        <p className="mt-1 text-xs text-red-600">Lý do cần ít nhất {MIN_REASON} ký tự</p>
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
    },
  });
}

/** Discount by percent (rounded to whole đồng by the server) or amount, DRAFT only (A2-10). */
export function DiscountModal({ invoice, isOpen, onClose }: { invoice: Invoice; isOpen: boolean; onClose: () => void }) {
  const [type, setType] = useState<'PERCENT' | 'AMOUNT'>('PERCENT');
  const [value, setValue] = useState('');
  const [reason, setReason] = useState('');
  useEffect(() => {
    if (!isOpen) return;
    setType(invoice.discountType ?? 'PERCENT');
    setValue(invoice.discountValue ? String(invoice.discountValue) : '');
    setReason('');
  }, [isOpen, invoice.discountType, invoice.discountValue]);

  const num = value === '' ? 0 : Number(value);
  const preview = type === 'PERCENT' ? Math.round((invoice.subtotal * num) / 100) : num;
  const invalid =
    !Number.isFinite(num) ||
    num < 0 ||
    (type === 'PERCENT' ? num > 100 : num > invoice.subtotal || !Number.isInteger(num)) ||
    (num > 0 && reason.trim().length < MIN_REASON);

  const save = useInvoiceMutation(
    invoice.id,
    () =>
      billingApi.updateDiscount(invoice.id, {
        discountType: type,
        discountValue: num,
        ...(num > 0 && { reason: reason.trim() }),
        version: invoice.version,
      }),
    num > 0 ? 'Đã áp dụng giảm giá' : 'Đã bỏ giảm giá',
    onClose,
    'Không áp dụng được giảm giá',
  );

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Giảm giá hóa đơn" size="sm">
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Select
            label="Kiểu giảm"
            value={type}
            onChange={(e) => setType(e.target.value as 'PERCENT' | 'AMOUNT')}
            options={[
              { value: 'PERCENT', label: 'Theo %' },
              { value: 'AMOUNT', label: 'Số tiền (VND)' },
            ]}
          />
          <Input
            label={type === 'PERCENT' ? 'Phần trăm' : 'Số tiền'}
            type="number"
            min={0}
            max={type === 'PERCENT' ? 100 : invoice.subtotal}
            step={type === 'PERCENT' ? 0.5 : 1000}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            hint="Nhập 0 để bỏ giảm giá"
          />
        </div>
        <div className="rounded bg-gray-50 p-3 text-sm dark:bg-surface-800">
          <div className="flex justify-between">
            <span>Tổng cộng</span>
            <span>{formatCurrency(invoice.subtotal)}</span>
          </div>
          <div className="flex justify-between text-green-600">
            <span>Giảm</span>
            <span>-{formatCurrency(Number.isFinite(preview) ? preview : 0)}</span>
          </div>
          <div className="flex justify-between font-medium">
            <span>Phải thu</span>
            <span>{formatCurrency(invoice.subtotal - (Number.isFinite(preview) ? preview : 0))}</span>
          </div>
        </div>
        {num > 0 && <ReasonField value={reason} onChange={setReason} placeholder="VD: Người nhà nhân viên, khuyến mãi tháng 10..." />}
        <div className="flex justify-end gap-3">
          <Button variant="outline" onClick={onClose}>Hủy</Button>
          <Button onClick={() => save.mutate(undefined)} isLoading={save.isPending} disabled={invalid}>Lưu</Button>
        </div>
      </div>
    </Modal>
  );
}

/** Fix the price, quantity or wording of a DRAFT line, or drop it (A2-02). */
export function ItemEditModal({ invoice, item, onClose }: { invoice: Invoice; item: InvoiceLineItem | null; onClose: () => void }) {
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
    remove ? 'Đã bỏ dòng khỏi hóa đơn' : 'Đã sửa dòng hóa đơn',
    onClose,
    'Không sửa được dòng hóa đơn',
  );

  return (
    <Modal isOpen={!!item} onClose={onClose} title="Sửa dòng hóa đơn" size="sm">
      {item && (
        <div className="space-y-4">
          <p className="text-xs text-gray-500">
            Chỉ sửa trên hóa đơn; bệnh án của bác sĩ giữ nguyên. Thay đổi được ghi vào lịch sử hóa đơn.
          </p>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={remove}
              disabled={lastLine}
              onChange={(e) => setRemove(e.target.checked)}
            />
            Bỏ dòng này khỏi hóa đơn
            {lastLine && <span className="text-xs text-gray-400">(hóa đơn chỉ còn một dòng)</span>}
          </label>
          {!remove && (
            <>
              <Input label="Mô tả" value={description} onChange={(e) => setDescription(e.target.value)} />
              <div className="grid grid-cols-2 gap-3">
                <Input label="Số lượng" type="number" min={1} max={100} value={quantity} onChange={(e) => setQuantity(e.target.value)} />
                <Input
                  label="Đơn giá (VND)"
                  type="number"
                  min={0}
                  step={1000}
                  value={unitPrice}
                  onChange={(e) => setUnitPrice(e.target.value)}
                  hint={`Trước: ${formatCurrency(item.unitPrice)}`}
                />
              </div>
            </>
          )}
          <ReasonField value={reason} onChange={setReason} placeholder="VD: Bác sĩ gõ nhầm đơn giá 6.500.000 thay vì 650.000" />
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={onClose}>Hủy</Button>
            <Button variant={remove ? 'danger' : 'primary'} onClick={() => save.mutate(undefined)} isLoading={save.isPending} disabled={invalid}>
              {remove ? 'Bỏ dòng' : 'Lưu'}
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}

/** Money handed back to the patient, dated today (A2-01). */
export function RefundModal({ invoice, isOpen, onClose }: { invoice: Invoice; isOpen: boolean; onClose: () => void }) {
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
    'Đã lập phiếu hoàn tiền',
    onClose,
    'Không lập được phiếu hoàn tiền',
  );

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Hoàn tiền cho bệnh nhân" size="sm">
      <div className="space-y-4">
        <Alert type="info">
          Phiếu hoàn tính vào hôm nay, không sửa số thu của ngày cũ. Hoàn tiền không làm bệnh nhân nợ lại. Muốn hủy cả hóa
          đơn thì hoàn hết số đã thu rồi chọn "Hủy HĐ".
        </Alert>
        <Input
          label={`Số tiền hoàn (tối đa ${formatCurrency(invoice.paidAmount)})`}
          type="number"
          min={1}
          max={invoice.paidAmount}
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
        />
        <Select label="Hoàn bằng" value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)} options={METHODS} />
        <ReasonField value={reason} onChange={setReason} placeholder="VD: Hủy một răng trám chưa làm" />
        <div className="flex justify-end gap-3">
          <Button variant="outline" onClick={onClose}>Hủy</Button>
          <Button variant="danger" onClick={() => save.mutate(undefined)} isLoading={save.isPending} disabled={invalid}>
            Hoàn tiền
          </Button>
        </div>
      </div>
    </Modal>
  );
}

/** "Hủy phiếu thu": cancels a payment/refund entered by mistake (A2-01, A5-01). */
export function VoidPaymentModal({ invoice, payment, onClose }: { invoice: Invoice; payment: Payment | null; onClose: () => void }) {
  const [reason, setReason] = useState('');
  useEffect(() => setReason(''), [payment]);
  const isRefund = payment?.kind === 'REFUND';
  const save = useInvoiceMutation(
    invoice.id,
    () => billingApi.voidPayment(payment!.id, reason.trim()),
    isRefund ? 'Đã hủy phiếu hoàn' : 'Đã hủy phiếu thu',
    onClose,
    'Không hủy được phiếu',
  );
  return (
    <Modal isOpen={!!payment} onClose={onClose} title={isRefund ? 'Hủy phiếu hoàn' : 'Hủy phiếu thu'} size="sm">
      {payment && (
        <div className="space-y-4">
          <Alert type="warning">
            {isRefund
              ? `Phiếu hoàn ${formatCurrency(payment.amount)} sẽ coi như chưa từng lập (số đã thu tăng lại).`
              : `Phiếu thu ${formatCurrency(payment.amount)} sẽ coi như chưa từng thu: số còn nợ tăng lại. Chỉ dùng khi ghi nhầm (thu trùng, nhầm hóa đơn); tiền đã trả lại cho khách thì dùng "Hoàn tiền".`}{' '}
            Người lập phiếu không tự hủy được phiếu của mình.
          </Alert>
          <ReasonField value={reason} onChange={setReason} placeholder="VD: Bấm thu hai lần" />
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={onClose}>Đóng</Button>
            <Button variant="danger" onClick={() => save.mutate(undefined)} isLoading={save.isPending} disabled={reason.trim().length < MIN_REASON}>
              Hủy phiếu
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}

/** "Lập lại hóa đơn" for a voided invoice: a new DRAFT copied from the treatments (A2-02). */
export function ReissueModal({ invoice, isOpen, onClose }: { invoice: Invoice; isOpen: boolean; onClose: () => void }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [reason, setReason] = useState('');
  useEffect(() => {
    if (isOpen) setReason('');
  }, [isOpen]);
  const save = useMutation({
    mutationFn: () => billingApi.reissueInvoice(invoice.id, reason.trim()),
    onSuccess: (created) => {
      notify.success(`Đã lập hóa đơn nháp ${created.code}. Kiểm tra, sửa dòng nếu cần rồi phát hành.`);
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      onClose();
      navigate(`/billing/invoices/${created.id}`);
    },
    onError: (err) => notify.error(getApiErrorMessage(err, 'Không lập lại được hóa đơn')),
  });
  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Lập lại hóa đơn" size="sm">
      <div className="space-y-4">
        <p className="text-sm text-gray-600 dark:text-gray-300">
          Tạo hóa đơn nháp mới cho phiên khám này từ các thủ thuật đã ghi. Hóa đơn {invoice.code} giữ nguyên trạng thái đã hủy.
        </p>
        <ReasonField value={reason} onChange={setReason} placeholder="VD: Phát hành nhầm giá, lập lại cho đúng" />
        <div className="flex justify-end gap-3">
          <Button variant="outline" onClick={onClose}>Hủy</Button>
          <Button onClick={() => save.mutate()} isLoading={save.isPending} disabled={reason.trim().length < MIN_REASON}>
            Lập lại hóa đơn
          </Button>
        </div>
      </div>
    </Modal>
  );
}

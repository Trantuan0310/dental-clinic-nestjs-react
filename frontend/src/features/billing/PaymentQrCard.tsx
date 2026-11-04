import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { Copy, QrCode } from 'lucide-react';
import { Button, Card } from '@/components/ui';
import { notify } from '@/components/ui/Toast';
import { formatCurrency } from '@/lib/format';
import { billingApi } from './billingApi';

/** The payload drawn as a QR image; the library loads only when a code is shown. */
function useQrImage(payload?: string): string | null {
  const [url, setUrl] = useState<{ payload: string; src: string } | null>(null);
  useEffect(() => {
    if (!payload) return;
    let cancelled = false;
    import('qrcode')
      .then((qr) => qr.toDataURL(payload, { margin: 1, width: 240, errorCorrectionLevel: 'M' }))
      .then((src) => {
        if (!cancelled) setUrl({ payload, src });
      })
      .catch(() => {
        if (!cancelled) setUrl(null);
      });
    return () => {
      cancelled = true;
    };
  }, [payload]);
  return url && url.payload === payload ? url.src : null;
}

/**
 * VietQR for what the invoice still owes, so the front desk shows a code
 * instead of reading out the account, amount and note. Shown only when the
 * clinic has set its receiving account and the invoice is owed. The payment
 * itself is still recorded by hand once the bank confirms it.
 */
export function PaymentQrCard({ invoiceId, invoiceCode }: { invoiceId: string; invoiceCode: string }) {
  const { t } = useTranslation();
  // Under ['invoice', id]: recording a payment refetches it with the new balance.
  const { data } = useQuery({
    queryKey: ['invoice', invoiceId, 'payment-qr'],
    queryFn: () => billingApi.getPaymentQr(invoiceId),
  });
  const image = useQrImage(data?.configured && data.payable ? data.payload : undefined);
  if (!data?.configured || !data.payable) return null;

  const copyContent = async () => {
    try {
      await navigator.clipboard.writeText(data.content ?? '');
      notify.success(t('uiOperations.paymentQrCopied'));
    } catch {
      notify.error(t('uiOperations.paymentQrError'));
    }
  };

  return (
    <Card title={t('uiOperations.paymentQrTitle')} description={t('uiOperations.paymentQrHint')}>
      <div className="flex flex-col items-center gap-4">
        <div className="flex h-[240px] w-[240px] shrink-0 items-center justify-center rounded-md border border-gray-200 bg-white p-1">
          {image ? (
            <img
              src={image}
              width={232}
              height={232}
              alt={t('uiOperations.paymentQrAlt', { code: invoiceCode })}
              data-testid="payment-qr-image"
            />
          ) : (
            <QrCode className="h-10 w-10 animate-pulse text-gray-300" aria-hidden />
          )}
        </div>
        <dl className="w-full min-w-0 space-y-3 text-sm">
          <div>
            <dt className="text-xs text-gray-500 dark:text-surface-400">{t('uiOperations.paymentQrAmount')}</dt>
            <dd className="font-mono text-xl font-semibold tabular-nums text-gray-900 dark:text-surface-100">
              {formatCurrency(data.amount ?? 0)}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-gray-500 dark:text-surface-400">{t('uiOperations.paymentQrAccount')}</dt>
            <dd className="text-gray-800 dark:text-surface-100">
              <span className="font-mono">{data.accountNo}</span>
              {data.accountName ? <span className="block text-xs text-gray-500">{data.accountName}</span> : null}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-gray-500 dark:text-surface-400">{t('uiOperations.paymentQrContent')}</dt>
            <dd className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-gray-900 dark:text-surface-100">{data.content}</span>
              <Button variant="outline" size="sm" leftIcon={<Copy className="h-3.5 w-3.5" />} onClick={copyContent}>
                {t('uiOperations.paymentQrCopyContent')}
              </Button>
            </dd>
          </div>
          <p className="text-xs text-gray-500 dark:text-surface-400">{t('uiOperations.paymentQrNotRecorded')}</p>
        </dl>
      </div>
    </Card>
  );
}

import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { CheckCircle2, MailX } from 'lucide-react';
import { Alert, Button, Card } from '@/components/ui';
import { clinic } from '@/config/clinic';
import { getApiErrorMessage } from '@/lib/errors';
import { PublicTopBar } from '@/features/booking/PublicTopBar';
import { recallsApi } from './recallsApi';

/**
 * The "stop recall emails" link of a recall email. Nothing changes until the
 * button is pressed, so a mail scanner opening the link does not unsubscribe.
 */
export default function RecallUnsubscribePage() {
  const { t } = useTranslation();
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const [state, setState] = useState<'idle' | 'busy' | 'done'>('idle');
  const [error, setError] = useState('');

  const confirm = async () => {
    setState('busy');
    setError('');
    try {
      await recallsApi.unsubscribe(token);
      setState('done');
    } catch (err) {
      setError(getApiErrorMessage(err, t('uiRecalls.unsubscribeError')));
      setState('idle');
    }
  };

  return (
    <div className="mx-auto max-w-lg px-4 py-8">
      <PublicTopBar />
      <Card>
        {state === 'done' ? (
          <div className="space-y-3 text-center">
            <CheckCircle2 className="mx-auto h-10 w-10 text-green-600" />
            <p className="font-medium">{t('uiRecalls.unsubscribed')}</p>
            <p className="text-sm text-gray-600">
              {t('uiRecalls.unsubscribedHint', { clinic: clinic.name })}
              {clinic.phone ? ` ${clinic.phone}` : ''}
            </p>
            <Link to="/booking" className="text-sm text-brand-600 hover:underline">
              {t('uiRecalls.bookVisit')}
            </Link>
          </div>
        ) : (
          <div className="space-y-4 text-center">
            <MailX className="mx-auto h-10 w-10 text-gray-400" />
            <p className="font-medium">{t('uiRecalls.unsubscribeTitle')}</p>
            <p className="text-sm text-gray-600">{t('uiRecalls.unsubscribeHint', { clinic: clinic.name })}</p>
            {!token && <Alert type="danger">{t('uiRecalls.unsubscribeNoToken')}</Alert>}
            {error && <Alert type="danger">{error}</Alert>}
            <Button onClick={confirm} isLoading={state === 'busy'} disabled={!token}>
              {t('uiRecalls.unsubscribeConfirm')}
            </Button>
          </div>
        )}
      </Card>
    </div>
  );
}

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation } from '@tanstack/react-query';
import { Copy, Share2 } from 'lucide-react';
import { api, unwrap } from '@/lib/api';
import { Button, Modal } from '@/components/ui';
import { notify } from '@/components/ui/Toast';
import { getApiErrorMessage } from '@/lib/errors';

type Issued = { url: string; expiresAt: string; sentTo: string[] };

/** Staff: give the patient a link to read their own visit history. */
export function HistoryLinkButton({ patientId }: { patientId: string }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const issue = useMutation({
    mutationFn: async () => unwrap((await api.post(`/patients/${patientId}/history-link`)).data) as Issued,
    onSuccess: () => setOpen(true),
    onError: (err) => notify.error(getApiErrorMessage(err, t('uiPatientHistory.issueError'))),
  });
  const data = issue.data;
  return (
    <>
      <Button variant="outline" onClick={() => issue.mutate()} isLoading={issue.isPending}>
        <Share2 className="h-4 w-4" />
        {t('uiPatientHistory.button')}
      </Button>
      <Modal isOpen={open && !!data} onClose={() => setOpen(false)} title={t('uiPatientHistory.title')}>
        {data && (
          <div className="space-y-3 text-sm">
            <p>
              {data.sentTo.length > 0
                ? t('uiPatientHistory.sentTo', { to: data.sentTo.join(', ') })
                : t('uiPatientHistory.notSent')}
            </p>
            <div className="flex items-center gap-2">
              <input
                readOnly
                value={data.url}
                aria-label={t('uiPatientHistory.link')}
                className="min-w-0 flex-1 rounded-md border border-gray-300 bg-gray-50 px-2 py-1.5 font-mono text-xs dark:border-surface-600 dark:bg-surface-800"
                onFocus={(e) => e.currentTarget.select()}
              />
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  void navigator.clipboard?.writeText(data.url).then(() => notify.success(t('uiPatientHistory.copied')));
                }}
              >
                <Copy className="h-4 w-4" />
                {t('uiPatientHistory.copy')}
              </Button>
            </div>
            <p className="text-xs text-gray-500 dark:text-surface-400">
              {t('uiPatientHistory.expires', { date: new Date(data.expiresAt).toLocaleDateString('vi-VN') })}
            </p>
          </div>
        )}
      </Modal>
    </>
  );
}

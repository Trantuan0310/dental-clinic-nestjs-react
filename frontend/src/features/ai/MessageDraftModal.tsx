import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation } from '@tanstack/react-query';
import { Copy, MessageCircle, Phone, Sparkles } from 'lucide-react';
import { Button, Modal, Tabs, TabsList, TabsTrigger, Textarea } from '@/components/ui';
import { notify } from '@/components/ui/Toast';
import { getApiErrorMessage } from '@/lib/errors';
import { aiAssistApi, type MessageDraft, type MessageKind } from './aiAssistApi';
import { AiDraftNotice } from './AiDraftNotice';

export type MessageContext = { kind: 'appointment_reminder'; appointmentId: string } | { kind: 'recall_reminder'; recallId: string };

/** "0912 345 678" → "0912345678" for zalo.me / tel: links. */
const digits = (phone: string) => phone.replace(/[^\d+]/g, '');

/**
 * A message to one patient: the reminder this screen is about, or a reply
 * to what the patient wrote. The front desk edits it and sends it from
 * Zalo / SMS themselves: the system does not send it.
 */
export function MessageDraftModal({ context, open, onClose }: { context: MessageContext; open: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const [kind, setKind] = useState<MessageKind>(context.kind);
  const [customerMessage, setCustomerMessage] = useState('');
  const [staffNote, setStaffNote] = useState('');
  const [draft, setDraft] = useState<MessageDraft | null>(null);
  const [text, setText] = useState('');

  const close = () => {
    setKind(context.kind);
    setCustomerMessage('');
    setStaffNote('');
    setDraft(null);
    setText('');
    onClose();
  };

  const generate = useMutation({
    mutationFn: () =>
      aiAssistApi.draftMessage({
        kind,
        // The patient comes from the reminder's record either way (phone, greeting).
        ...(context.kind === 'appointment_reminder' ? { appointmentId: context.appointmentId } : { recallId: context.recallId }),
        ...(kind === 'reply' ? { customerMessage: customerMessage.trim() } : {}),
        ...(staffNote.trim() ? { staffNote: staffNote.trim() } : {}),
      }),
    onSuccess: (d) => {
      setDraft(d);
      setText(d.text);
    },
    onError: (err) => notify.error(getApiErrorMessage(err, t('uiAi.error'))),
  });

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      notify.success(t('uiAi.message.copied'));
    } catch {
      notify.error(t('uiAi.error'));
    }
  };

  const canDraft = kind !== 'reply' || customerMessage.trim().length > 0;

  return (
    <Modal isOpen={open} onClose={close} title={t('uiAi.message.title')} size="lg">
      <div className="space-y-4">
        <Tabs value={kind} onValueChange={(v) => { setKind(v as MessageKind); setDraft(null); }}>
          <TabsList>
            <TabsTrigger value={context.kind}>{t(`uiAi.message.${context.kind}`)}</TabsTrigger>
            <TabsTrigger value="reply">{t('uiAi.message.reply')}</TabsTrigger>
          </TabsList>
        </Tabs>
        {kind === 'reply' && (
          <Textarea
            label={t('uiAi.message.customerMessage')}
            hint={t('uiAi.message.customerMessageHelp')}
            value={customerMessage}
            onChange={(e) => setCustomerMessage(e.target.value)}
            rows={3}
            maxLength={1000}
          />
        )}
        <Textarea
          label={t('uiAi.message.staffNote')}
          placeholder={t('uiAi.message.staffNotePlaceholder')}
          value={staffNote}
          onChange={(e) => setStaffNote(e.target.value)}
          rows={1}
          maxLength={300}
        />
        <div className="flex justify-end">
          <Button
            variant={draft ? 'outline' : 'primary'}
            onClick={() => generate.mutate()}
            isLoading={generate.isPending}
            disabled={!canDraft}
            leftIcon={<Sparkles className="h-4 w-4" />}
          >
            {draft ? t('uiAi.regenerate') : t('uiAi.message.draft')}
          </Button>
        </div>

        {draft && (
          <div className="space-y-3 border-t border-gray-200 pt-4 dark:border-surface-700">
            <AiDraftNotice source={draft.source} />
            <Textarea label={t('uiAi.message.text')} value={text} onChange={(e) => setText(e.target.value)} rows={5} />
            <p className="text-xs text-gray-500 dark:text-surface-400">{t('uiAi.message.notSent')}</p>
            <div className="flex flex-wrap justify-end gap-2">
              {draft.phone && (
                <>
                  <Button variant="outline" leftIcon={<Phone className="h-4 w-4" />} onClick={() => window.open(`tel:${digits(draft.phone!)}`)}>
                    {t('uiAi.message.call', { phone: draft.phone })}
                  </Button>
                  <Button
                    variant="outline"
                    leftIcon={<MessageCircle className="h-4 w-4" />}
                    onClick={() => window.open(`https://zalo.me/${digits(draft.phone!)}`, '_blank', 'noopener')}
                  >
                    {t('uiAi.message.openZalo')}
                  </Button>
                </>
              )}
              <Button leftIcon={<Copy className="h-4 w-4" />} onClick={copy} disabled={!text.trim()}>
                {t('uiAi.message.copy')}
              </Button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}

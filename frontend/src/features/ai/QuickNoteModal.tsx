import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Sparkles } from 'lucide-react';
import { Button, Modal, Textarea } from '@/components/ui';
import { notify } from '@/components/ui/Toast';
import { getApiErrorMessage } from '@/lib/errors';
import { medicalRecordsApi } from '@/features/medical-records/imperativeApi';
import { aiAssistApi, type NoteDraft } from './aiAssistApi';
import { AiDraftNotice } from './AiDraftNotice';

type Section = 'chiefComplaint' | 'diagnosis' | 'treatmentPlan' | 'notes';
const SECTIONS: Section[] = ['chiefComplaint', 'diagnosis', 'treatmentPlan', 'notes'];
const EMPTY: Record<Section, string> = { chiefComplaint: '', diagnosis: '', treatmentPlan: '', notes: '' };

/**
 * Quick note → the four note sections. The dentist edits the draft; saving
 * appends each filled section through the ordinary clinical-note endpoint
 * (same as "Thêm ghi chú"), so nothing the AI wrote is saved unseen.
 */
export function QuickNoteModal({ encounterId, open, onClose }: { encounterId: string; open: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [text, setText] = useState('');
  const [draft, setDraft] = useState<Record<Section, string> | null>(null);
  const [source, setSource] = useState<NoteDraft['source']>('llm');

  const close = () => {
    setText('');
    setDraft(null);
    onClose();
  };

  const generate = useMutation({
    mutationFn: () => aiAssistApi.draftNote(encounterId, text.trim()),
    onSuccess: (d) => {
      setDraft({ chiefComplaint: d.chiefComplaint, diagnosis: d.diagnosis, treatmentPlan: d.treatmentPlan, notes: d.notes });
      setSource(d.source);
    },
    onError: (err) => notify.error(getApiErrorMessage(err, t('uiAi.error'))),
  });

  const save = useMutation({
    mutationFn: async (sections: Record<Section, string>) => {
      // One append per section, in order; each is a separate, ordinary note write.
      for (const field of SECTIONS) {
        const content = sections[field].trim();
        if (content) await medicalRecordsApi.upsertClinicalNote(encounterId, { appendNote: content, appendTo: field });
      }
    },
    onSuccess: () => {
      notify.success(t('uiAi.note.saved'));
      close();
    },
    onError: (err) => notify.error(getApiErrorMessage(err, t('uiAi.note.saveError'))),
    // Even a partial save changed the note.
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['encounter', encounterId] });
      queryClient.invalidateQueries({ queryKey: ['medical-records'] });
    },
  });

  const filled = draft && SECTIONS.some((s) => draft[s].trim());

  return (
    <Modal isOpen={open} onClose={close} title={t('uiAi.note.title')} size="lg">
      <div className="space-y-4">
        <Textarea
          label={t('uiAi.note.input')}
          hint={t('uiAi.note.inputHelp')}
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={3}
          maxLength={2000}
        />
        <div className="flex justify-end">
          <Button
            variant={draft ? 'outline' : 'primary'}
            onClick={() => generate.mutate()}
            isLoading={generate.isPending}
            disabled={text.trim().length < 3}
            leftIcon={<Sparkles className="h-4 w-4" />}
          >
            {draft ? t('uiAi.regenerate') : t('uiAi.note.draft')}
          </Button>
        </div>

        {draft && (
          <div className="space-y-3 border-t border-gray-200 pt-4 dark:border-surface-700">
            <AiDraftNotice source={source} />
            <p className="text-xs text-gray-500 dark:text-surface-400">{t('uiAi.note.review')}</p>
            {SECTIONS.map((field) => (
              <Textarea
                key={field}
                label={t(`uiAi.note.${field}`)}
                value={draft[field]}
                onChange={(e) => setDraft({ ...draft, [field]: e.target.value })}
                rows={2}
              />
            ))}
            <div className="flex justify-end gap-3">
              <Button variant="outline" onClick={close}>{t('uiClinical.cancel')}</Button>
              <Button onClick={() => save.mutate(draft ?? EMPTY)} isLoading={save.isPending} disabled={!filled}>
                {t('uiAi.note.save')}
              </Button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}

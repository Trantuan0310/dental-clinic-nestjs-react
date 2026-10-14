import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Pencil } from 'lucide-react';
import { Button, Card, Modal, Textarea } from '@/components/ui';
import { notify } from '@/components/ui/Toast';
import { api } from '@/lib/api';
import { getApiErrorCode, getApiErrorMessage } from '@/lib/errors';
import { useAuthStore } from '@/stores/authStore';
import { useTranslation } from 'react-i18next';

interface MedicalHistory {
  allergies: string[];
  chronicDiseases: string[];
  currentMedications: string[];
  updatedAt?: string;
}

type HistoryKey = 'allergies' | 'chronicDiseases' | 'currentMedications';
type Draft = Record<HistoryKey, string>;

const FIELDS: Array<{ key: HistoryKey; labelKey: string; emptyKey: string }> = [
  { key: 'allergies', labelKey: 'allergies', emptyKey: 'historyNoRecord' },
  { key: 'chronicDiseases', labelKey: 'chronicConditions', emptyKey: 'none' },
  { key: 'currentMedications', labelKey: 'currentMedications', emptyKey: 'none' },
];

const toLines = (list: string[]) => list.join('\n');
const fromLines = (text: string) =>
  text
    .split(/\n|,/)
    .map((v) => v.trim())
    .filter(Boolean);

/**
 * Allergies, chronic diseases and current medications next to the visit, so
 * the dentist sees them before treating and can record a new finding
 * (patient.medical_history.update, own patients) without asking front desk.
 */
export function PatientHistoryCard({ patientId }: { patientId: string }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const canEdit = useAuthStore(
    (s) => s.hasPermission('patient.medical_history.update') || s.hasPermission('patient.update'),
  );
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Draft>({
    allergies: '',
    chronicDiseases: '',
    currentMedications: '',
  });
  // What the modal opened with: only lists the user edits are sent, and the
  // save is refused (409) if the record changed since `updatedAt`.
  const [baseline, setBaseline] = useState<{ draft: Draft; updatedAt?: string } | null>(null);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['patients', 'medical-history', patientId],
    queryFn: async () =>
      (await api.get<{ data: MedicalHistory }>(`/patients/${patientId}`)).data.data,
  });

  const save = useMutation({
    mutationFn: async (body: Partial<MedicalHistory> & { expectedUpdatedAt?: string }) =>
      (await api.patch<{ data: MedicalHistory }>(`/patients/${patientId}/medical-history`, body)).data
        .data,
    onSuccess: (saved) => {
      qc.setQueryData(['patients', 'medical-history', patientId], saved);
      qc.invalidateQueries({ queryKey: ['patients', 'detail', patientId] });
      qc.invalidateQueries({ queryKey: ['ai-summary', patientId] });
      notify.success(t('uiClinical.updateHistorySuccess'));
      setEditing(false);
    },
    onError: (e) => {
      notify.error(getApiErrorMessage(e, t('uiClinical.updateHistoryError')));
      if (getApiErrorCode(e) === 'PATIENT_VERSION_CONFLICT') {
        // Reload what was saved elsewhere; the user re-opens and re-applies.
        qc.invalidateQueries({ queryKey: ['patients', 'medical-history', patientId] });
        setEditing(false);
      }
    },
  });

  const submit = () => {
    if (!baseline) return;
    const body: Partial<MedicalHistory> & { expectedUpdatedAt?: string } = {};
    for (const { key } of FIELDS) {
      if (draft[key] !== baseline.draft[key]) body[key] = fromLines(draft[key]);
    }
    if (Object.keys(body).length === 0) {
      setEditing(false);
      return;
    }
    // Never save without the version the card loaded (it guards against
    // overwriting an allergy recorded elsewhere meanwhile).
    if (!baseline.updatedAt) {
      notify.error(t('uiClinical.historyVersionUnknown'));
      qc.invalidateQueries({ queryKey: ['patients', 'medical-history', patientId] });
      setEditing(false);
      return;
    }
    body.expectedUpdatedAt = baseline.updatedAt;
    save.mutate(body);
  };

  const history: MedicalHistory = {
    allergies: data?.allergies ?? [],
    chronicDiseases: data?.chronicDiseases ?? [],
    currentMedications: data?.currentMedications ?? [],
    updatedAt: data?.updatedAt,
  };

  return (
    <Card noPadding className="p-4">
      <section aria-labelledby="patient-history-title">
      <div className="flex items-start justify-between gap-3">
        <h2 id="patient-history-title" className="text-sm font-semibold text-gray-900 dark:text-surface-100">
          {t('uiClinical.historyAndAllergies')}
        </h2>
        {canEdit && data && (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              const opened: Draft = {
                allergies: toLines(history.allergies),
                chronicDiseases: toLines(history.chronicDiseases),
                currentMedications: toLines(history.currentMedications),
              };
              setDraft(opened);
              setBaseline({ draft: opened, updatedAt: history.updatedAt });
              setEditing(true);
            }}
          >
            <Pencil className="h-4 w-4" /> {t('uiClinical.edit')}
          </Button>
        )}
      </div>
      {isLoading ? (
        <p className="mt-2 text-sm text-gray-500 dark:text-surface-400">{t('uiClinical.loading')}</p>
      ) : isError ? (
        <p className="mt-2 text-sm text-gray-500 dark:text-surface-400">{t('uiClinical.historyNotLoaded')}</p>
      ) : (
        <dl className="mt-3 grid gap-3 sm:grid-cols-3">
          {FIELDS.map(({ key, labelKey, emptyKey }) => (
            <div key={key}>
              <dt className="text-xs text-gray-500 dark:text-surface-400">{t(`uiClinical.${labelKey}`)}</dt>
              <dd className="mt-1 flex flex-wrap gap-1.5">
                {history[key].length === 0 ? (
                  <span className="text-sm text-gray-400 dark:text-surface-400">{t(`uiClinical.${emptyKey}`)}</span>
                ) : (
                  history[key].map((item) => (
                    <span
                      key={item}
                      className={
                        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ' +
                        (key === 'allergies'
                          ? 'bg-red-50 text-red-700 ring-1 ring-red-200 dark:bg-red-950/40 dark:text-red-200 dark:ring-red-800'
                          : 'bg-gray-100 text-gray-700 dark:bg-surface-700 dark:text-surface-200')
                      }
                    >
                      {key === 'allergies' && <AlertTriangle className="h-3 w-3" aria-hidden />}
                      {item}
                    </span>
                  ))
                )}
              </dd>
            </div>
          ))}
        </dl>
      )}
      </section>

      <Modal
        open={editing}
        onClose={() => setEditing(false)}
        title={t('uiClinical.historyModalTitle')}
        footer={
          <>
            <Button variant="outline" onClick={() => setEditing(false)}>
              {t('uiClinical.cancel')}
            </Button>
            <Button isLoading={save.isPending} onClick={submit}>
              {t('uiClinical.save')}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <p className="text-xs text-gray-500 dark:text-surface-400">{t('uiClinical.historyLineHint')}</p>
          {FIELDS.map(({ key, labelKey }) => (
            <Textarea
              key={key}
              label={t(`uiClinical.${labelKey}`)}
              rows={3}
              value={draft[key]}
              onChange={(e) => setDraft((d) => ({ ...d, [key]: e.target.value }))}
            />
          ))}
        </div>
      </Modal>
    </Card>
  );
}

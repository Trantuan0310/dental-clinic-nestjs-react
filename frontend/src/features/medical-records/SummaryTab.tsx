import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { formatCurrency } from '@/lib/format';
import { CheckCircle2 } from 'lucide-react';
import { Button, Textarea, Alert } from '@/components/ui';
import type { Encounter } from '@/types/medical-records';

interface SummaryTabProps {
  encounter: Encounter;
  onClose: (summary: string) => void;
  isClosing: boolean;
}

export function SummaryTab({ encounter, onClose, isClosing }: SummaryTabProps) {
  const { t } = useTranslation();
  const [summary, setSummary] = useState(encounter.summary || '');
  const [checkboxes, setCheckboxes] = useState({
    checked: false,
    explained: false,
    prescription: false,
  });

  const notes = encounter.notes || [];
  const treatments = encounter.treatments || [];
  const prescriptions = encounter.prescriptions || [];
  const chiefComplaint = notes.find((n) => n.type === 'chief_complaint');
  const diagnosis = notes.find((n) => n.type === 'diagnosis');

  const totalTreatmentCost = treatments.reduce((sum, t) => sum + (t.total ?? 0), 0);

  const allChecked = checkboxes.checked && checkboxes.explained && checkboxes.prescription;

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-gray-200 p-4">
        <h4 className="font-medium text-gray-900">{t('uiClinical.summaryEncounter')}</h4>

        <div className="mt-4 space-y-4">
          <div>
            <p className="text-sm font-medium text-gray-700">{t('uiClinical.patient')}</p>
            <p className="text-sm text-gray-600">{encounter.patientName}</p>
          </div>

          {chiefComplaint && (
            <div>
              <p className="text-sm font-medium text-gray-700">{t('uiClinical.reasonForVisit')}</p>
              <p className="text-sm text-gray-600">{chiefComplaint.content}</p>
            </div>
          )}

          {diagnosis && (
            <div>
              <p className="text-sm font-medium text-gray-700">{t('uiClinical.diagnosis')}</p>
              <p className="text-sm text-gray-600">{diagnosis.content}</p>
            </div>
          )}

          {treatments.length > 0 && (
            <div>
              <p className="text-sm font-medium text-gray-700">{t('uiClinical.treatments')}</p>
              <ul className="mt-1 list-inside list-disc space-y-1 text-sm text-gray-600">
                {treatments.map((treatment) => (
                  <li key={treatment.id}>
                    {treatment.procedureName} - {t('uiClinical.tooth')} {treatment.toothNumber} ({formatCurrency(treatment.total)})
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-sm font-medium text-gray-900">
                {t('uiClinical.total')}: {formatCurrency(totalTreatmentCost)}
              </p>
            </div>
          )}

          {prescriptions.length > 0 && (
            <div>
              <p className="text-sm font-medium text-gray-700">{t('uiClinical.prescriptions')}</p>
              <ul className="mt-1 list-inside list-disc space-y-1 text-sm text-gray-600">
                {prescriptions.map((p) => (
                  <li key={p.id}>{p.diagnosis || t('uiClinical.prescriptions')}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>

      {/* Summary Input */}
      <Textarea
        label={t('uiClinical.finalSummary')}
        value={summary}
        onChange={(e) => setSummary(e.target.value)}
        placeholder={t('uiClinical.finalSummaryExample')}
        rows={3}
      />

      {/* Checkboxes */}
      <div className="space-y-2">
        <label className="flex items-start gap-3">
          <input
            type="checkbox"
            checked={checkboxes.checked}
            onChange={(e) => setCheckboxes((c) => ({ ...c, checked: e.target.checked }))}
            className="mt-0.5 h-4 w-4 rounded border-gray-300 text-brand-500 focus:ring-brand-500"
          />
          <span className="text-sm text-gray-700">
            {t('uiClinical.reviewedNotes')}
          </span>
        </label>
        <label className="flex items-start gap-3">
          <input
            type="checkbox"
            checked={checkboxes.explained}
            onChange={(e) => setCheckboxes((c) => ({ ...c, explained: e.target.checked }))}
            className="mt-0.5 h-4 w-4 rounded border-gray-300 text-brand-500 focus:ring-brand-500"
          />
          <span className="text-sm text-gray-700">
            {t('uiClinical.patient')} đã được giải thích về tình trạng và kế hoạch điều trị
          </span>
        </label>
        <label className="flex items-start gap-3">
          <input
            type="checkbox"
            checked={checkboxes.prescription}
            onChange={(e) => setCheckboxes((c) => ({ ...c, prescription: e.target.checked }))}
            className="mt-0.5 h-4 w-4 rounded border-gray-300 text-brand-500 focus:ring-brand-500"
          />
          <span className="text-sm text-gray-700">
            {t('uiClinical.prescriptions')} đã được in/giao cho bệnh nhân
          </span>
        </label>
      </div>

      <Alert type="info">{t('uiClinical.closeEncounterInfo')}</Alert>

      {/* Close Button */}
      <div className="flex justify-end gap-3 pt-4 border-t border-gray-100">
        <Button
          onClick={() => onClose(summary)}
          isLoading={isClosing}
          disabled={!allChecked || !summary.trim()}
        >
          <CheckCircle2 className="h-4 w-4" />
          {t('uiClinical.closeEncounter')}
        </Button>
      </div>
    </div>
  );
}

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { api } from '@/lib/api';
import { getApiErrorMessage } from '@/lib/errors';
import { formatDate, formatPhone } from '@/lib/format';
import { Button, Input, Modal, Textarea } from '@/components/ui';
import { notify } from '@/components/ui/Toast';
import { patientsApi } from '@/features/patients/imperativeApi';
import type { PatientLookupResult } from '@/types/patients';

interface MergeSource {
  id: string;
  code: string;
  fullName: string;
  dateOfBirth?: string | null;
  primaryPhone?: string | null;
}

/**
 * Admin-only (patient.merge): fold this record (a duplicate, e.g. one made
 * from an online booking) into the patient's real record. Visits, invoices,
 * requests, papers and the phone move to the target; allergies and history
 * are combined; this record is archived.
 */
export function MergePatientModal({
  source,
  open,
  onClose,
}: {
  source: MergeSource;
  open: boolean;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [target, setTarget] = useState<PatientLookupResult | null>(null);
  const [reason, setReason] = useState('');

  const term = search.trim();
  const results = useQuery({
    queryKey: ['patients', 'merge-lookup', term],
    queryFn: () =>
      /^[\d\s+().-]{6,}$/.test(term) ? patientsApi.searchByPhone(term) : patientsApi.lookup(term),
    enabled: open && term.length >= 2,
  });
  const candidates = (results.data ?? []).filter((p) => p.id !== source.id);

  const merge = useMutation({
    mutationFn: () =>
      api.post('/patients/merge', {
        sourcePatientId: source.id,
        targetPatientId: target!.id,
        reason: reason.trim(),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['patients'] });
      queryClient.invalidateQueries({ queryKey: ['patient'] });
      notify.success(t('uiClinical.mergeDone'));
      onClose();
      navigate(`/patients/${target!.id}`);
    },
    onError: (e) => notify.error(getApiErrorMessage(e, t('uiClinical.mergeError'))),
  });

  const row = (p: { code: string; fullName: string; dateOfBirth?: string | null; phone?: string | null }) =>
    `${p.fullName} · ${p.code} · ${p.dateOfBirth ? formatDate(p.dateOfBirth) : '—'}${
      p.phone ? ' · ' + formatPhone(p.phone) : ''
    }`;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('uiClinical.mergeTitle')}
      description={t('uiClinical.mergeDescription')}
      size="lg"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            {t('uiClinical.cancel')}
          </Button>
          <Button
            variant="danger"
            disabled={!target || !reason.trim() || merge.isPending}
            onClick={() => merge.mutate()}
          >
            {t('uiClinical.mergeConfirm')}
          </Button>
        </div>
      }
    >
      <div className="space-y-4 text-sm">
        <div className="rounded-md border p-3 dark:border-surface-700">
          <p className="text-xs font-medium uppercase text-gray-500 dark:text-surface-400">
            {t('uiClinical.mergeSource')}
          </p>
          <p className="mt-1 font-medium">{row({ ...source, phone: source.primaryPhone })}</p>
        </div>
        {target ? (
          <div className="rounded-md border border-brand-300 bg-brand-50 p-3 dark:border-brand-700 dark:bg-surface-800">
            <p className="text-xs font-medium uppercase text-gray-500 dark:text-surface-400">
              {t('uiClinical.mergeTarget')}
            </p>
            <p className="mt-1 font-medium">{row(target)}</p>
            <button
              type="button"
              className="mt-1 text-xs text-brand-700 underline dark:text-brand-300"
              onClick={() => setTarget(null)}
            >
              {t('uiClinical.mergeChangeTarget')}
            </button>
          </div>
        ) : (
          <div>
            <Input
              label={t('uiClinical.mergeSearchTarget')}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('uiClinical.mergeSearchPlaceholder')}
            />
            <ul className="mt-2 max-h-56 space-y-1 overflow-y-auto">
              {candidates.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    className="w-full rounded-md border px-3 py-2 text-left hover:bg-gray-50 dark:border-surface-700 dark:hover:bg-surface-800"
                    onClick={() => setTarget(p)}
                  >
                    {row(p)}
                  </button>
                </li>
              ))}
              {term.length >= 2 && results.isSuccess && candidates.length === 0 && (
                <li className="text-gray-500 dark:text-surface-400">{t('uiClinical.mergeNoResults')}</li>
              )}
            </ul>
          </div>
        )}
        <p className="rounded-md bg-amber-50 p-3 text-amber-900">{t('uiClinical.mergeRules')}</p>
        <Textarea
          label={t('uiClinical.mergeReason')}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={2}
          required
        />
      </div>
    </Modal>
  );
}

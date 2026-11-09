import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Alert, Button, Modal, Select } from '@/components/ui';
import { notify } from '@/components/ui/Toast';
import { getApiErrorMessage } from '@/lib/errors';
import { formatCurrency } from '@/lib/format';
import { useInventoryItems } from '@/features/inventory/inventoryApi';
import { visitTemplatesApi, type TemplatePreview } from './visitTemplatesApi';

export function UseVisitTemplate({ encounterId }: { encounterId: string }) {
  const { t } = useTranslation();
  const l = (key: string) => t(`uiVisitTemplates.${key}`);
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState('');
  const [preview, setPreview] = useState<TemplatePreview | null>(null);
  const templates = useQuery({
    queryKey: ['visit-templates'],
    queryFn: visitTemplatesApi.list,
    enabled: open,
  });
  const inventory = useInventoryItems();
  const previewQuery = useMutation({
    mutationFn: (id: string) => visitTemplatesApi.preview(encounterId, id),
    onSuccess: setPreview,
    onError: error => notify.error(getApiErrorMessage(error, l('error'))),
  });
  const apply = useMutation({
    mutationFn: (template: TemplatePreview) => visitTemplatesApi.apply(encounterId, template),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['encounter', encounterId] });
      void qc.invalidateQueries({ queryKey: ['medical-records'] });
      notify.success(l('applied'));
      setOpen(false);
      setPreview(null);
    },
    onError: error => {
      setPreview(null);
      notify.error(getApiErrorMessage(error, l('error')));
    },
  });
  return (
    <>
      <Button
        variant="outline"
        onClick={() => {
          setOpen(true);
          setPreview(null);
        }}
      >
        {l('use')}
      </Button>
      <Modal
        open={open}
        title={l('title')}
        size="lg"
        onClose={() => {
          if (!apply.isPending) setOpen(false);
        }}
      >
        <div className="space-y-4">
          <Alert>{l('appendHint')}</Alert>
          {templates.isError && <Alert variant="error">{l('error')}</Alert>}
          {templates.isLoading && <p>{l('loading')}</p>}
          {templates.data?.length === 0 && <p>{l('empty')}</p>}
          <Select
            label={l('choose')}
            value={selected}
            disabled={previewQuery.isPending || apply.isPending}
            options={[
              { value: '', label: l('choose') },
              ...(templates.data ?? []).map(template => ({
                value: template.id,
                label: template.name,
              })),
            ]}
            onChange={e => {
              setSelected(e.target.value);
              setPreview(null);
            }}
          />
          <Button
            disabled={!selected || previewQuery.isPending || apply.isPending}
            onClick={() => {
              setPreview(null);
              previewQuery.mutate(selected);
            }}
          >
            {l('preview')}
          </Button>
          {preview && (
            <div className="space-y-3">
              <h3 className="font-semibold">{preview.name}</h3>
              {(['subjective', 'objective', 'assessment', 'plan'] as const).map(field => (
                <div key={field}>
                  <h4 className="font-medium">{l(field)}</h4>
                  <p className="whitespace-pre-wrap">{preview.soap[field]}</p>
                </div>
              ))}
              {preview.treatments.map((line, i) => (
                <div key={i} className="rounded border p-3">
                  <p>
                    {line.procedure} × {line.quantity} —{' '}
                    {formatCurrency(line.unitPrice * line.quantity)}
                  </p>
                  <ul>
                    {line.inventoryUsages.map((usage, n) => (
                      <li key={n}>
                        {inventory.data?.items.find(item => item.id === usage.inventoryItemId)
                          ?.name ?? usage.inventoryItemId}
                        : {usage.quantity} {usage.unit}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
              {preview.alreadyApplied && <Alert>{l('alreadyApplied')}</Alert>}
              <Button
                disabled={preview.alreadyApplied || apply.isPending}
                onClick={() => apply.mutate(preview)}
              >
                {l('apply')}
              </Button>
            </div>
          )}
        </div>
      </Modal>
    </>
  );
}

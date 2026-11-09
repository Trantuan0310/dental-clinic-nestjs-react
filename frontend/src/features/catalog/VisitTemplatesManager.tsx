import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  Alert,
  Button,
  Card,
  ConfirmDialog,
  Input,
  Modal,
  Select,
  Textarea,
} from '@/components/ui';
import { notify } from '@/components/ui/Toast';
import { getApiErrorMessage } from '@/lib/errors';
import { useCatalogServices } from './catalogApi';
import { useInventoryItems } from '@/features/inventory/inventoryApi';
import {
  visitTemplatesApi,
  type VisitTemplate,
  type VisitTemplatePayload,
} from '@/features/medical-records/visitTemplatesApi';

function TemplateForm({ template, onClose }: { template?: VisitTemplate; onClose: () => void }) {
  const { t } = useTranslation();
  const l = (key: string) => t(`uiVisitTemplates.${key}`);
  const qc = useQueryClient();
  const services = useCatalogServices();
  const inventory = useInventoryItems();
  const [form, setForm] = useState<VisitTemplatePayload>(
    template
      ? {
          name: template.name,
          serviceId: template.serviceId,
          soap: template.soap,
          treatments: template.treatments,
        }
      : {
          name: '',
          serviceId: '',
          soap: { subjective: '', objective: '', assessment: '', plan: '' },
          treatments: [],
        },
  );
  const mutation = useMutation({
    mutationFn: () => visitTemplatesApi.save(template?.id, form),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['visit-templates'] });
      notify.success(l('saved'));
      onClose();
    },
    onError: error => notify.error(getApiErrorMessage(error, l('error'))),
  });
  const serviceOptions = [
    { value: '', label: l('service') },
    ...(services.data ?? []).map(s => ({ value: s.id, label: s.name })),
  ];
  const items = inventory.data?.items ?? [];
  const changeLine = (index: number, update: Partial<VisitTemplatePayload['treatments'][number]>) =>
    setForm({
      ...form,
      treatments: form.treatments.map((line, i) => (i === index ? { ...line, ...update } : line)),
    });
  return (
    <form
      className="space-y-4"
      onSubmit={e => {
        e.preventDefault();
        mutation.mutate();
      }}
    >
      {(services.isError || inventory.isError) && <Alert variant="error">{l('error')}</Alert>}
      <Input
        label={l('name')}
        required
        minLength={2}
        maxLength={200}
        value={form.name}
        onChange={e => setForm({ ...form, name: e.target.value })}
      />
      <Select
        label={l('service')}
        required
        value={form.serviceId}
        options={serviceOptions}
        onChange={e => setForm({ ...form, serviceId: e.target.value })}
      />
      {(['subjective', 'objective', 'assessment', 'plan'] as const).map(field => (
        <Textarea
          key={field}
          label={l(field)}
          maxLength={field === 'objective' ? 8000 : field === 'plan' ? 4000 : 2000}
          value={form.soap[field]}
          onChange={e => setForm({ ...form, soap: { ...form.soap, [field]: e.target.value } })}
        />
      ))}
      <h3 className="font-medium">{l('treatment')}</h3>
      {form.treatments.map((line, index) => (
        <fieldset key={index} className="space-y-3 rounded border p-3">
          <legend>
            {l('treatment')} {index + 1}
          </legend>
          <Select
            label={l('service')}
            required
            value={line.serviceId}
            options={serviceOptions}
            onChange={e => changeLine(index, { serviceId: e.target.value })}
          />
          <Input
            label={l('quantity')}
            type="number"
            min={1}
            max={100}
            step={1}
            required
            value={line.quantity}
            onChange={e => changeLine(index, { quantity: Number(e.target.value) })}
          />
          {line.inventoryUsages.map((usage, n) => (
            <div key={n} className="grid gap-2 sm:grid-cols-3">
              <Select
                label={l('material')}
                required
                value={usage.inventoryItemId}
                options={[
                  { value: '', label: l('material') },
                  ...items.map(item => ({ value: item.id, label: `${item.name} (${item.unit})` })),
                ]}
                onChange={e =>
                  changeLine(index, {
                    inventoryUsages: line.inventoryUsages.map((u, i) =>
                      i === n
                        ? {
                            ...u,
                            inventoryItemId: e.target.value,
                            unit: items.find(item => item.id === e.target.value)?.unit ?? '',
                          }
                        : u,
                    ),
                  })
                }
              />
              <Input
                label={`${l('quantity')} (${usage.unit})`}
                type="number"
                required
                min={0.0001}
                max={99999999}
                step={0.0001}
                value={usage.quantity}
                onChange={e =>
                  changeLine(index, {
                    inventoryUsages: line.inventoryUsages.map((u, i) =>
                      i === n ? { ...u, quantity: Number(e.target.value) } : u,
                    ),
                  })
                }
              />
              <Button
                type="button"
                variant="outline"
                onClick={() =>
                  changeLine(index, {
                    inventoryUsages: line.inventoryUsages.filter((_, i) => i !== n),
                  })
                }
              >
                {l('remove')}
              </Button>
            </div>
          ))}
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={items.length === 0 || line.inventoryUsages.length >= 50}
              onClick={() =>
                changeLine(index, {
                  inventoryUsages: [
                    ...line.inventoryUsages,
                    { inventoryItemId: '', quantity: 1, unit: '' },
                  ],
                })
              }
            >
              {l('addMaterial')}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() =>
                setForm({ ...form, treatments: form.treatments.filter((_, i) => i !== index) })
              }
            >
              {l('remove')}
            </Button>
          </div>
        </fieldset>
      ))}
      <Button
        type="button"
        variant="outline"
        disabled={form.treatments.length >= 50}
        onClick={() =>
          setForm({
            ...form,
            treatments: [
              ...form.treatments,
              { serviceId: form.serviceId, quantity: 1, inventoryUsages: [] },
            ],
          })
        }
      >
        {l('addTreatment')}
      </Button>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onClose} disabled={mutation.isPending}>
          {l('cancel')}
        </Button>
        <Button
          type="submit"
          disabled={mutation.isPending || services.isLoading || inventory.isLoading}
        >
          {l('save')}
        </Button>
      </div>
    </form>
  );
}

export function VisitTemplatesManager() {
  const { t } = useTranslation();
  const l = (key: string) => t(`uiVisitTemplates.${key}`);
  const qc = useQueryClient();
  const templates = useQuery({ queryKey: ['visit-templates'], queryFn: visitTemplatesApi.list });
  const [editing, setEditing] = useState<VisitTemplate | 'new' | null>(null);
  const [removing, setRemoving] = useState<VisitTemplate | null>(null);
  const remove = useMutation({
    mutationFn: (id: string) => visitTemplatesApi.remove(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['visit-templates'] });
      setRemoving(null);
    },
    onError: error => notify.error(getApiErrorMessage(error, l('error'))),
  });
  return (
    <Card className="space-y-3 p-4">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">{l('title')}</h2>
        <Button onClick={() => setEditing('new')}>{l('add')}</Button>
      </div>
      {templates.isLoading && <p>{l('loading')}</p>}
      {templates.isError && <Alert variant="error">{l('error')}</Alert>}
      {templates.data?.length === 0 && <p>{l('empty')}</p>}
      {templates.data?.map(template => (
        <div key={template.id} className="flex items-center justify-between gap-2 border-b py-2">
          <span>{template.name}</span>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setEditing(template)}>
              {l('edit')}
            </Button>
            <Button variant="outline" onClick={() => setRemoving(template)}>
              {l('remove')}
            </Button>
          </div>
        </div>
      ))}
      <Modal open={!!editing} title={l('title')} size="lg" onClose={() => setEditing(null)}>
        {editing && (
          <TemplateForm
            key={editing === 'new' ? 'new' : editing.id}
            template={editing === 'new' ? undefined : editing}
            onClose={() => setEditing(null)}
          />
        )}
      </Modal>
      <ConfirmDialog
        open={!!removing}
        title={l('confirmDelete')}
        description={removing?.name}
        onClose={() => setRemoving(null)}
        onConfirm={() => removing && remove.mutate(removing.id)}
        isLoading={remove.isPending}
      />
    </Card>
  );
}

import { useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, CalendarPlus, Check, Pencil, Plus, Printer, Send, Undo2, X } from 'lucide-react';
import { Alert, Badge, Button, Card, Input, Modal, Select, Textarea } from '@/components/ui';
import { notify } from '@/components/ui/Toast';
import { ClinicPrintHeading } from '@/components/brand/ClinicPrintHeading';
import { formatCurrency, formatDate } from '@/lib/format';
import { getApiErrorMessage } from '@/lib/errors';
import { useAuthStore } from '@/stores/authStore';
import { patientsApi } from '@/features/patients/imperativeApi';
import { useDentistOptions } from '@/features/appointments/appointmentApi';
import {
  treatmentPlansApi,
  usePlanMutation,
  useTreatmentPlan,
  type TreatmentPlan,
  type TreatmentPlanItem,
  type TreatmentPlanStatus,
  type TreatmentPlanItemStatus,
  type PlanItemInput,
} from './treatmentPlansApi';
import { PlanItemsEditor } from './PlanItemsEditor';
import { emptyLine, lineFromItem, linesToPayload, type DraftLine } from './planLines';
import { PlanStatusBadge } from './PlanStatusBadge';

const ITEM_VARIANT: Record<TreatmentPlanItemStatus, 'default' | 'success' | 'warning'> = {
  PLANNED: 'default',
  DONE: 'success',
  SKIPPED: 'warning',
};
/** The quoted lines may still be rewritten (nothing agreed yet). */
const EDITABLE: TreatmentPlanStatus[] = ['DRAFT', 'PROPOSED'];
/** Agreed plans: new lines are added, planned ones skipped. */
const AGREED: TreatmentPlanStatus[] = ['ACCEPTED', 'IN_PROGRESS', 'COMPLETED'];

export default function TreatmentPlanPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const [search] = useSearchParams();
  const isNew = !id;
  const newPatientId = search.get('patientId') ?? undefined;
  const sourceEncounterId = search.get('encounterId') ?? undefined;

  const user = useAuthStore((s) => s.user);
  const hasPermission = useAuthStore((s) => s.hasPermission);
  // Mirrors the backend row scope: without the clinic-wide calendar a
  // dentist only writes their own plans.
  const clinicWide = hasPermission('appointment.read.any');

  const { data: plan, isLoading, error } = useTreatmentPlan(id);
  const patientId = plan?.patient.id ?? newPatientId;
  const { data: newPatient } = useQuery({
    queryKey: ['patient', newPatientId],
    queryFn: () => patientsApi.get(newPatientId!),
    enabled: isNew && !!newPatientId,
  });
  const { data: dentists = [] } = useDentistOptions();

  const canWrite =
    hasPermission('treatment_plan.write') && (isNew || clinicWide || plan?.dentist.id === user?.id);
  const canAccept = hasPermission('treatment_plan.accept');
  const canBook = hasPermission('appointment.create');

  const [editing, setEditing] = useState(isNew);
  const [title, setTitle] = useState('');
  const [notes, setNotes] = useState('');
  const [dentistId, setDentistId] = useState(clinicWide ? '' : (user?.id ?? ''));
  const [lines, setLines] = useState<DraftLine[]>(() => [emptyLine()]);
  const [formError, setFormError] = useState('');

  const [acceptOpen, setAcceptOpen] = useState(false);
  const [acceptNote, setAcceptNote] = useState('');
  const [cancelOpen, setCancelOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [skipping, setSkipping] = useState<TreatmentPlanItem | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [newLines, setNewLines] = useState<DraftLine[]>(() => [emptyLine()]);

  const onError = (err: unknown) => notify.error(getApiErrorMessage(err, t('uiPlans.actionError')));

  const createMutation = usePlanMutation((items: PlanItemInput[]) =>
    treatmentPlansApi.create({
      patientId: newPatientId!,
      ...(dentistId && { dentistId }),
      title: title.trim(),
      ...(notes.trim() && { notes: notes.trim() }),
      ...(sourceEncounterId && { sourceEncounterId }),
      items,
    }),
  );
  const updateMutation = usePlanMutation((input: { plan: TreatmentPlan; items?: PlanItemInput[] }) =>
    treatmentPlansApi.update(input.plan.id, {
      title: title.trim(),
      notes: notes.trim(),
      ...(dentistId && dentistId !== input.plan.dentist.id && { dentistId }),
      ...(input.items && { items: input.items }),
      expectedUpdatedAt: input.plan.updatedAt,
    }),
  );
  const proposeMutation = usePlanMutation((planId: string) => treatmentPlansApi.propose(planId));
  const acceptMutation = usePlanMutation((planId: string) => treatmentPlansApi.accept(planId, acceptNote));
  const cancelMutation = usePlanMutation((planId: string) => treatmentPlansApi.cancel(planId, reason.trim()));
  const skipMutation = usePlanMutation((v: { planId: string; itemId: string }) =>
    treatmentPlansApi.skipItem(v.planId, v.itemId, reason.trim()),
  );
  const unskipMutation = usePlanMutation((v: { planId: string; itemId: string }) =>
    treatmentPlansApi.unskipItem(v.planId, v.itemId),
  );
  const addMutation = usePlanMutation((v: { planId: string; items: PlanItemInput[] }) =>
    treatmentPlansApi.addItems(v.planId, v.items),
  );

  const startEdit = (p: TreatmentPlan) => {
    setTitle(p.title);
    setNotes(p.notes ?? '');
    setDentistId(p.dentist.id);
    setLines(p.items.map(lineFromItem));
    setFormError('');
    setEditing(true);
  };

  const save = () => {
    if (title.trim().length < 3) {
      setFormError(t('uiPlans.titleTooShort'));
      return;
    }
    const linesEditable = isNew || (plan && EDITABLE.includes(plan.status));
    const parsed = linesEditable ? linesToPayload(lines, t) : null;
    if (parsed && 'error' in parsed) {
      setFormError(parsed.error);
      return;
    }
    setFormError('');
    const items = parsed?.items;
    if (isNew) {
      createMutation.mutate(items!, {
        onSuccess: (created) => navigate(`/treatment-plans/${created.id}`, { replace: true }),
        onError,
      });
    } else if (plan) {
      updateMutation.mutate(
        { plan, items },
        { onSuccess: () => { setEditing(false); notify.success(t('uiPlans.saved')); }, onError },
      );
    }
  };

  if (!isNew && isLoading) {
    return <div className="h-40 animate-pulse rounded-lg bg-gray-100 dark:bg-surface-800" />;
  }
  if (!isNew && (error || !plan)) {
    return <Alert type="danger">{getApiErrorMessage(error, t('uiPlans.loadError'))}</Alert>;
  }

  const patient = plan?.patient ?? (newPatient && { id: newPatient.id, code: newPatient.code, fullName: newPatient.fullName });
  const linesEditable = isNew || (!!plan && EDITABLE.includes(plan.status));

  return (
    <div className="space-y-4">
      <div className="no-print flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          {patientId && (
            <Link
              to={`/patients/${patientId}`}
              aria-label={t('uiPlans.backToPatient')}
              className="rounded p-1 text-gray-500 hover:bg-gray-100 dark:hover:bg-surface-800"
            >
              <ArrowLeft className="h-5 w-5" />
            </Link>
          )}
          <div>
            <h1 className="text-xl font-semibold text-gray-900 dark:text-surface-100">
              {plan ? plan.title : t('uiPlans.newPlan')}
            </h1>
            {patient && (
              <p className="text-sm text-gray-500 dark:text-surface-400">
                {patient.fullName} ({patient.code})
                {plan && ` • ${plan.dentist.fullName} • ${t('uiPlans.createdAt', { date: formatDate(plan.createdAt) })}`}
              </p>
            )}
          </div>
          {plan && <PlanStatusBadge status={plan.status} />}
        </div>
        {plan && !editing && (
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => window.print()}>
              <Printer className="h-4 w-4" />
              {t('uiPlans.print')}
            </Button>
            {canWrite && plan.status !== 'CANCELLED' && plan.status !== 'COMPLETED' && (
              <Button variant="outline" size="sm" onClick={() => startEdit(plan)}>
                <Pencil className="h-4 w-4" />
                {t('uiPlans.edit')}
              </Button>
            )}
            {canWrite && plan.status === 'DRAFT' && (
              <Button
                variant="outline"
                size="sm"
                isLoading={proposeMutation.isPending}
                onClick={() =>
                  proposeMutation.mutate(plan.id, { onSuccess: () => notify.success(t('uiPlans.proposed')), onError })
                }
              >
                <Send className="h-4 w-4" />
                {t('uiPlans.propose')}
              </Button>
            )}
            {canAccept && EDITABLE.includes(plan.status) && (
              <Button size="sm" onClick={() => { setAcceptNote(''); setAcceptOpen(true); }}>
                <Check className="h-4 w-4" />
                {t('uiPlans.accept')}
              </Button>
            )}
            {canBook && AGREED.includes(plan.status) && plan.items.some((i) => i.status === 'PLANNED') && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => navigate(`/appointments?patientId=${plan.patient.id}&dentistId=${plan.dentist.id}`)}
              >
                <CalendarPlus className="h-4 w-4" />
                {t('uiPlans.bookNext')}
              </Button>
            )}
            {canWrite && AGREED.includes(plan.status) && (
              <Button variant="outline" size="sm" onClick={() => { setNewLines([emptyLine()]); setFormError(''); setAddOpen(true); }}>
                <Plus className="h-4 w-4" />
                {t('uiPlans.addItems')}
              </Button>
            )}
            {canWrite && plan.status !== 'CANCELLED' && plan.status !== 'COMPLETED' && (
              <Button variant="danger" size="sm" onClick={() => { setReason(''); setCancelOpen(true); }}>
                <X className="h-4 w-4" />
                {t('uiPlans.cancelPlan')}
              </Button>
            )}
          </div>
        )}
      </div>

      {editing ? (
        <Card>
          <div className="space-y-4">
            {plan && plan.status === 'PROPOSED' && <Alert type="info">{t('uiPlans.proposeHint')}</Alert>}
            {plan && !linesEditable && <Alert type="info">{t('uiPlans.lockedHint')}</Alert>}
            <div className="grid gap-3 sm:grid-cols-2">
              <Input
                label={t('uiPlans.title')}
                value={title}
                placeholder={t('uiPlans.titlePlaceholder')}
                onChange={(e) => setTitle(e.target.value)}
                required
              />
              {clinicWide && (
                <Select
                  label={t('uiPlans.dentist')}
                  value={dentistId}
                  placeholder={t('uiPlans.dentist')}
                  onChange={(e) => setDentistId(e.target.value)}
                  options={dentists.map((d) => ({ value: d.id, label: d.fullName }))}
                />
              )}
            </div>
            <Textarea label={t('uiPlans.notes')} value={notes} rows={2} onChange={(e) => setNotes(e.target.value)} />
            {linesEditable && (
              <div className="space-y-2">
                <h3 className="text-sm font-medium text-gray-900 dark:text-surface-100">{t('uiPlans.items')}</h3>
                <PlanItemsEditor lines={lines} onChange={setLines} dentistId={dentistId || undefined} />
              </div>
            )}
            {formError && <Alert type="danger">{formError}</Alert>}
            <div className="flex justify-end gap-2 border-t border-gray-100 pt-3 dark:border-surface-700">
              <Button
                variant="outline"
                onClick={() => {
                  if (!isNew) setEditing(false);
                  else if (patientId) navigate(`/patients/${patientId}`);
                  else navigate(-1);
                }}
              >
                {t('uiPlans.cancelEdit')}
              </Button>
              <Button
                onClick={save}
                isLoading={createMutation.isPending || updateMutation.isPending}
                disabled={isNew && (!newPatientId || (clinicWide && !dentistId))}
              >
                {t('uiPlans.save')}
              </Button>
            </div>
          </div>
        </Card>
      ) : (
        plan && (
          <PlanView
            plan={plan}
            canWrite={canWrite}
            onSkip={(item) => { setReason(''); setSkipping(item); }}
            onUnskip={(item) => unskipMutation.mutate({ planId: plan.id, itemId: item.id }, { onError })}
          />
        )
      )}

      {plan && (
        <>
          <Modal isOpen={acceptOpen} onClose={() => setAcceptOpen(false)} title={t('uiPlans.acceptTitle')}>
            <div className="space-y-4">
              <p className="text-sm text-gray-600 dark:text-surface-300">
                {plan.title} — {t('uiPlans.totalQuoted')}: <strong>{formatCurrency(plan.totals.quoted)}</strong>
              </p>
              <Textarea
                label={t('uiPlans.acceptNote')}
                placeholder={t('uiPlans.acceptNotePlaceholder')}
                value={acceptNote}
                rows={2}
                onChange={(e) => setAcceptNote(e.target.value)}
              />
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setAcceptOpen(false)}>{t('uiPlans.cancelEdit')}</Button>
                <Button
                  isLoading={acceptMutation.isPending}
                  onClick={() =>
                    acceptMutation.mutate(plan.id, {
                      onSuccess: () => { setAcceptOpen(false); notify.success(t('uiPlans.accepted')); },
                      onError,
                    })
                  }
                >
                  {t('uiPlans.acceptConfirm')}
                </Button>
              </div>
            </div>
          </Modal>

          <Modal isOpen={cancelOpen} onClose={() => setCancelOpen(false)} title={t('uiPlans.cancelTitle')}>
            <div className="space-y-4">
              <Textarea
                label={t('uiPlans.cancelReason')}
                value={reason}
                rows={2}
                onChange={(e) => setReason(e.target.value)}
                hint={t('uiPlans.reasonTooShort')}
              />
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setCancelOpen(false)}>{t('uiPlans.cancelEdit')}</Button>
                <Button
                  variant="danger"
                  disabled={reason.trim().length < 5}
                  isLoading={cancelMutation.isPending}
                  onClick={() =>
                    cancelMutation.mutate(plan.id, {
                      onSuccess: () => { setCancelOpen(false); notify.success(t('uiPlans.cancelled')); },
                      onError,
                    })
                  }
                >
                  {t('uiPlans.cancelConfirm')}
                </Button>
              </div>
            </div>
          </Modal>

          <Modal
            isOpen={!!skipping}
            onClose={() => setSkipping(null)}
            title={skipping ? t('uiPlans.skipTitle', { name: skipping.procedure }) : ''}
          >
            <div className="space-y-4">
              <Textarea
                label={t('uiPlans.skipReason')}
                value={reason}
                rows={2}
                onChange={(e) => setReason(e.target.value)}
                hint={t('uiPlans.reasonTooShort')}
              />
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setSkipping(null)}>{t('uiPlans.cancelEdit')}</Button>
                <Button
                  disabled={reason.trim().length < 5}
                  isLoading={skipMutation.isPending}
                  onClick={() =>
                    skipping &&
                    skipMutation.mutate(
                      { planId: plan.id, itemId: skipping.id },
                      { onSuccess: () => setSkipping(null), onError },
                    )
                  }
                >
                  {t('uiPlans.skipConfirm')}
                </Button>
              </div>
            </div>
          </Modal>

          <Modal isOpen={addOpen} onClose={() => setAddOpen(false)} title={t('uiPlans.addItemsTitle')} size="lg">
            <div className="space-y-4">
              <PlanItemsEditor lines={newLines} onChange={setNewLines} dentistId={plan.dentist.id} />
              {formError && <Alert type="danger">{formError}</Alert>}
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setAddOpen(false)}>{t('uiPlans.cancelEdit')}</Button>
                <Button
                  isLoading={addMutation.isPending}
                  onClick={() => {
                    const parsed = linesToPayload(newLines, t);
                    if ('error' in parsed) {
                      setFormError(parsed.error);
                      return;
                    }
                    setFormError('');
                    addMutation.mutate(
                      { planId: plan.id, items: parsed.items },
                      { onSuccess: () => { setAddOpen(false); notify.success(t('uiPlans.itemsAdded')); }, onError },
                    );
                  }}
                >
                  {t('uiPlans.addItems')}
                </Button>
              </div>
            </div>
          </Modal>
        </>
      )}
    </div>
  );
}

interface PlanViewProps {
  plan: TreatmentPlan;
  canWrite: boolean;
  onSkip: (item: TreatmentPlanItem) => void;
  onUnskip: (item: TreatmentPlanItem) => void;
}

function PlanView({ plan, canWrite, onSkip, onUnskip }: PlanViewProps) {
  const { t } = useTranslation();
  const agreed = AGREED.includes(plan.status);
  const { totals } = plan;
  const percent = totals.itemsTotal ? Math.round((totals.itemsDone / totals.itemsTotal) * 100) : 0;

  return (
    <div className="print-document space-y-4">
      <div className="mb-2 hidden border-b border-gray-300 pb-3 text-center print:block">
        <ClinicPrintHeading />
        <p className="mt-1 text-base font-semibold">{t('uiPlans.printTitle')}</p>
        <div className="mt-2 text-left text-sm">
          <p>{t('uiPlans.patient')}: <strong>{plan.patient.fullName}</strong> ({plan.patient.code})</p>
          <p>{t('uiPlans.dentist')}: {plan.dentist.fullName}</p>
          <p>{plan.title} — {formatDate(plan.proposedAt ?? plan.createdAt)}</p>
        </div>
      </div>

      {plan.status === 'CANCELLED' && plan.cancelledAt && (
        <Alert type="danger">{t('uiPlans.cancelledOn', { date: formatDate(plan.cancelledAt), reason: plan.cancelReason ?? '' })}</Alert>
      )}
      {plan.acceptedAt && (
        <p className="text-sm text-gray-600 dark:text-surface-300">
          {t('uiPlans.acceptedBy', { date: formatDate(plan.acceptedAt), name: plan.acceptedBy?.fullName ?? '' })}
          {plan.acceptanceNote ? ` — ${plan.acceptanceNote}` : ''}
          {plan.completedAt ? ` • ${t('uiPlans.completedOn', { date: formatDate(plan.completedAt) })}` : ''}
        </p>
      )}
      {plan.notes && <p className="whitespace-pre-wrap text-sm text-gray-600 dark:text-surface-300">{plan.notes}</p>}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label={t('uiPlans.totalQuoted')} value={formatCurrency(totals.quoted - totals.skipped)} />
        <Stat label={t('uiPlans.totalDone')} value={formatCurrency(totals.done)} />
        <Stat label={t('uiPlans.totalRemaining')} value={formatCurrency(totals.remaining)} />
        <Stat label={t('uiPlans.progress', { done: totals.itemsDone, total: totals.itemsTotal })} value={`${percent}%`} />
      </div>

      <Card noPadding>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left text-gray-600 dark:bg-surface-800 dark:text-surface-300">
              <tr>
                <th className="px-3 py-2">#</th>
                <th className="px-3 py-2">{t('uiPlans.procedure')}</th>
                <th className="px-3 py-2">{t('uiPlans.teeth')}</th>
                <th className="px-3 py-2 text-right">{t('uiPlans.quantity')}</th>
                <th className="px-3 py-2 text-right">{t('uiPlans.unitPrice')}</th>
                <th className="px-3 py-2 text-right">{t('uiPlans.lineTotal')}</th>
                {agreed && <th className="px-3 py-2" />}
              </tr>
            </thead>
            <tbody>
              {plan.items.map((item, index) => (
                <tr
                  key={item.id}
                  data-testid="plan-item"
                  className={`border-t border-gray-100 dark:border-surface-700 ${item.status === 'SKIPPED' ? 'text-gray-400 line-through decoration-gray-300' : ''}`}
                >
                  <td className="px-3 py-2 align-top">{index + 1}</td>
                  <td className="px-3 py-2 align-top">
                    <p className="font-medium text-gray-900 dark:text-surface-100">{item.procedure}</p>
                    {item.notes && <p className="text-xs text-gray-500">{item.notes}</p>}
                    {item.skipReason && <p className="text-xs text-amber-700">{item.skipReason}</p>}
                  </td>
                  <td className="px-3 py-2 align-top">
                    {item.toothNumbers.length ? item.toothNumbers.join(', ') : t('uiPlans.wholeMouth')}
                  </td>
                  <td className="px-3 py-2 text-right align-top">{item.quantity}</td>
                  <td className="px-3 py-2 text-right align-top">{formatCurrency(item.unitPrice)}</td>
                  <td className="px-3 py-2 text-right align-top font-medium">{formatCurrency(item.lineTotal)}</td>
                  {agreed && (
                    <td className="px-3 py-2 align-top">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant={ITEM_VARIANT[item.status]}>{t(`uiPlans.itemStatus.${item.status}`)}</Badge>
                        {item.status === 'DONE' && item.doneAt && (
                          <span className="text-xs text-gray-500">{t('uiPlans.doneOn', { date: formatDate(item.doneAt) })}</span>
                        )}
                        {(item.inEncounterId ?? item.doneInEncounterId) && (
                          <Link
                            to={`/encounters/${item.inEncounterId ?? item.doneInEncounterId}`}
                            className="no-print text-xs text-brand-600 hover:underline"
                          >
                            {item.inEncounterId ? t('uiPlans.inEncounter') : t('uiPlans.viewEncounter')}
                          </Link>
                        )}
                        {canWrite && item.status === 'PLANNED' && !item.inEncounterId && (
                          <button type="button" className="no-print text-xs text-gray-500 hover:underline" onClick={() => onSkip(item)}>
                            {t('uiPlans.skip')}
                          </button>
                        )}
                        {canWrite && item.status === 'SKIPPED' && (
                          <button type="button" className="no-print inline-flex items-center gap-1 text-xs text-gray-500 hover:underline" onClick={() => onUnskip(item)}>
                            <Undo2 className="h-3 w-3" />
                            {t('uiPlans.unskip')}
                          </button>
                        )}
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-gray-200 font-semibold dark:border-surface-700">
                <td className="px-3 py-2" colSpan={5}>{t('uiPlans.totalQuoted')}</td>
                <td className="px-3 py-2 text-right">{formatCurrency(totals.quoted - totals.skipped)}</td>
                {agreed && <td />}
              </tr>
            </tfoot>
          </table>
        </div>
      </Card>

      <div className="hidden grid-cols-2 pt-8 text-center text-sm print:grid">
        <p className="font-medium">{t('uiPlans.printSignPatient')}</p>
        <p className="font-medium">{t('uiPlans.printSignDentist')}</p>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-gray-50 p-3 dark:bg-surface-800">
      <p className="text-lg font-semibold text-gray-900 dark:text-surface-100">{value}</p>
      <p className="text-sm text-gray-500 dark:text-surface-400">{label}</p>
    </div>
  );
}

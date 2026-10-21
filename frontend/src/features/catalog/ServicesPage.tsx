import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FolderPlus, Pencil, Plus } from 'lucide-react';
import {
  Alert,
  Badge,
  Button,
  Card,
  Checkbox,
  ConfirmDialog,
  Input,
  Modal,
  Select,
  Textarea,
} from '@/components/ui';
import { PageHeader } from '@/components/ui/PageHeader';
import { notify } from '@/components/ui/Toast';
import { PermissionGuard } from '@/components/PermissionGuard';
import { formatCurrency } from '@/lib/format';
import { SPECIALTY_LABEL } from '@/features/staff/labels';
import {
  catalogApi,
  catalogErrorMessage,
  useCatalogMutation,
  useCatalogServices,
  useServiceCategories,
} from './catalogApi';
import type { CatalogService, ServiceCategory, ServiceImpact, ServicePayload } from './types';

const DURATION_MINUTES = [5, 10, 15, 20, 25, 30, 40, 45, 60, 75, 90, 120, 150, 180, 240];
const BUFFER_MINUTES = [0, 5, 10, 15, 20, 30, 45, 60];

function ServiceForm({
  service,
  categories,
  submitting,
  onCancel,
  onSubmit,
}: {
  service?: CatalogService;
  categories: ServiceCategory[];
  submitting: boolean;
  onCancel: () => void;
  onSubmit: (payload: ServicePayload) => void;
}) {
  const { t } = useTranslation();
  const minuteOptions = (values: number[]) =>
    values.map((m) => ({ value: String(m), label: t('uiScheduling.minutesValue', { count: m }) }));
  const durationOptions = minuteOptions(DURATION_MINUTES);
  const bufferOptions = minuteOptions(BUFFER_MINUTES);
  const [form, setForm] = useState({
    code: service?.code ?? '',
    categoryId: service?.category.id ?? categories.find((c) => c.isActive)?.id ?? '',
    name: service?.name ?? '',
    description: service?.description ?? '',
    defaultDurationMin: String(service?.defaultDurationMin ?? 30),
    bufferBeforeMin: String(service?.bufferBeforeMin ?? 0),
    bufferAfterMin: String(service?.bufferAfterMin ?? 0),
    // No pre-filled 0: an empty price must be typed or the service marked
    // free, since 0 shows as "Miễn phí" on the public price list.
    basePrice: service ? String(service.basePrice) : '',
    isFree: service?.isFree ?? false,
    bookableOnline: service?.bookableOnline ?? true,
    showPublicPrice: service?.showPublicPrice ?? true,
    requiredSpecialty: service?.requiredSpecialty ?? '',
  });
  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit({
          ...(service ? {} : { code: form.code.trim().toUpperCase() }),
          categoryId: form.categoryId,
          name: form.name.trim(),
          description: form.description.trim() || null,
          defaultDurationMin: Number(form.defaultDurationMin),
          bufferBeforeMin: Number(form.bufferBeforeMin),
          bufferAfterMin: Number(form.bufferAfterMin),
          basePrice: form.isFree ? 0 : Number(form.basePrice),
          isFree: form.isFree,
          bookableOnline: form.bookableOnline,
          showPublicPrice: form.showPublicPrice,
          requiredSpecialty: form.requiredSpecialty || null,
        });
      }}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Input
          label={t('uiWorkforce.serviceCode')}
          required
          disabled={!!service}
          pattern="[A-Za-z0-9][A-Za-z0-9_\-]{1,29}"
          hint={service ? t('uiEntry.catalogCodeLocked') : t('uiEntry.catalogCodeHint', { example: 'CAO_VOI' })}
          value={form.code}
          onChange={(e) => setForm({ ...form, code: e.target.value })}
        />
        <Select
          label={t('uiWorkforce.category')}
          required
          value={form.categoryId}
          onChange={(e) => setForm({ ...form, categoryId: e.target.value })}
          options={categories
            .filter((c) => c.isActive || c.id === form.categoryId)
            .map((c) => ({ value: c.id, label: c.name }))}
        />
      </div>
      <Input
        label={t('uiWorkforce.serviceName')}
        required
        minLength={2}
        maxLength={200}
        value={form.name}
        onChange={(e) => setForm({ ...form, name: e.target.value })}
      />
      <div className="grid gap-4 sm:grid-cols-3">
        <Select
          label={t('uiWorkforce.duration')}
          value={form.defaultDurationMin}
          onChange={(e) => setForm({ ...form, defaultDurationMin: e.target.value })}
          options={durationOptions}
        />
        <Select
          label={t('uiWorkforce.preparationTime')}
          value={form.bufferBeforeMin}
          onChange={(e) => setForm({ ...form, bufferBeforeMin: e.target.value })}
          options={bufferOptions}
        />
        <Select
          label={t('uiWorkforce.cleanupTime')}
          value={form.bufferAfterMin}
          onChange={(e) => setForm({ ...form, bufferAfterMin: e.target.value })}
          options={bufferOptions}
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Input
            label={t('uiWorkforce.listPrice')}
            type="number"
            min={0}
            max={999_999_999_999_999}
            step={1000}
            required={!form.isFree}
            disabled={form.isFree}
            hint={
              !form.isFree && form.basePrice !== '' && Number(form.basePrice) === 0
                ? t('uiEntry.catalogZeroPriceHint')
                : undefined
            }
            value={form.isFree ? '0' : form.basePrice}
            onChange={(e) => setForm({ ...form, basePrice: e.target.value })}
          />
          <Checkbox
            className="mt-1"
            label={t('uiWorkforce.freeService')}
            checked={form.isFree}
            onChange={(isFree) => setForm({ ...form, isFree })}
          />
        </div>
        <Select
          label={t('uiWorkforce.requiredSpecialty')}
          value={form.requiredSpecialty}
          onChange={(e) => setForm({ ...form, requiredSpecialty: e.target.value })}
          options={[
            { value: '', label: t('uiWorkforce.noRequirement') },
            ...Object.entries(SPECIALTY_LABEL).map(([value, label]) => ({ value, label })),
          ]}
        />
      </div>
      <Textarea
        label={t('uiWorkforce.serviceDescription')}
        rows={2}
        value={form.description}
        onChange={(e) => setForm({ ...form, description: e.target.value })}
      />
      <div className="flex flex-wrap gap-x-6">
        <Checkbox
          label={t('uiWorkforce.onlineBooking')}
          checked={form.bookableOnline}
          onChange={(bookableOnline) => setForm({ ...form, bookableOnline })}
        />
        <Checkbox
          label={t('uiWorkforce.showOnPriceList')}
          checked={form.showPublicPrice}
          onChange={(showPublicPrice) => setForm({ ...form, showPublicPrice })}
        />
      </div>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onCancel}>
          {t('uiWorkforce.cancel')}
        </Button>
        <Button type="submit" isLoading={submitting}>
          {service ? t('uiWorkforce.save') : t('uiWorkforce.addService')}
        </Button>
      </div>
    </form>
  );
}

function CategoryForm({
  category,
  submitting,
  onCancel,
  onSubmit,
}: {
  /** Editing: the code cannot change. */
  category?: ServiceCategory;
  submitting: boolean;
  onCancel: () => void;
  onSubmit: (payload: { code: string; name: string; sortOrder: number }) => void;
}) {
  const { t } = useTranslation();
  const [code, setCode] = useState(category?.code ?? '');
  const [name, setName] = useState(category?.name ?? '');
  const [sortOrder, setSortOrder] = useState(String(category?.sortOrder ?? 100));
  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit({ code: code.trim().toUpperCase(), name: name.trim(), sortOrder: Number(sortOrder) });
      }}
    >
      <Input
        label={t('uiWorkforce.groupCode')}
        required
        disabled={!!category}
        pattern="[A-Za-z0-9][A-Za-z0-9_\-]{1,29}"
        hint={category ? t('uiEntry.catalogCodeLocked') : t('uiEntry.catalogCodeHint', { example: 'DIEU_TRI' })}
        value={code}
        onChange={(e) => setCode(e.target.value)}
      />
      <Input label={t('uiWorkforce.groupName')} required minLength={2} value={name} onChange={(e) => setName(e.target.value)} />
      <Input
        label={t('uiWorkforce.displayOrder')}
        type="number"
        min={0}
        max={999}
        hint={t('uiEntry.catalogSortHint')}
        value={sortOrder}
        onChange={(e) => setSortOrder(e.target.value)}
      />
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onCancel}>
          {t('uiWorkforce.cancel')}
        </Button>
        <Button type="submit" isLoading={submitting}>
          {category ? t('uiWorkforce.save') : t('uiWorkforce.addCategory')}
        </Button>
      </div>
    </form>
  );
}

export default function ServicesPage() {
  const { t } = useTranslation();
  const [showInactive, setShowInactive] = useState(false);
  const [editing, setEditing] = useState<CatalogService | 'new' | null>(null);
  const [categoryForm, setCategoryForm] = useState<ServiceCategory | 'new' | null>(null);
  // Turning a service off/on asks first, with what it touches.
  const [pending, setPending] = useState<{ service: CatalogService; impact: ServiceImpact } | null>(null);
  const [checking, setChecking] = useState<string | null>(null);
  const { data: categories = [] } = useServiceCategories();
  const { data: services = [], isLoading, isError, refetch } = useCatalogServices(showInactive);

  const save = useCatalogMutation((v: { id?: string; payload: ServicePayload }) =>
    v.id ? catalogApi.updateService(v.id, v.payload) : catalogApi.createService(v.payload),
  );
  const toggle = useCatalogMutation((v: { id: string; active: boolean; restore?: boolean }) =>
    catalogApi.setActive(v.id, v.active, v.restore),
  );
  const saveCategory = useCatalogMutation(
    (v: { id?: string; payload: { code: string; name: string; sortOrder: number } }) =>
      v.id
        ? catalogApi.updateCategory(v.id, { name: v.payload.name, sortOrder: v.payload.sortOrder })
        : catalogApi.createCategory(v.payload),
  );
  const toggleCategory = useCatalogMutation((v: { id: string; isActive: boolean }) =>
    catalogApi.updateCategory(v.id, { isActive: v.isActive }),
  );

  const activeCategories = categories.filter((c) => c.isActive);
  const grouped = useMemo(() => {
    const byCategory = new Map<string, CatalogService[]>();
    for (const s of services) {
      byCategory.set(s.category.id, [...(byCategory.get(s.category.id) ?? []), s]);
    }
    return categories
      .filter((c) => byCategory.has(c.id) || c.isActive || showInactive)
      .map((c) => ({ category: c, services: byCategory.get(c.id) ?? [] }));
  }, [categories, services, showInactive]);

  const askToggle = async (service: CatalogService) => {
    setChecking(service.id);
    try {
      setPending({ service, impact: await catalogApi.impact(service.id) });
    } catch (e) {
      notify.error(catalogErrorMessage(e, t('uiWorkforce.serviceImpactError')));
    } finally {
      setChecking(null);
    }
  };

  const runToggle = (restore = false) => {
    if (!pending) return;
    const { service } = pending;
    toggle.mutate(
      { id: service.id, active: !service.isActive, restore },
      {
        onSuccess: (res) => {
          setPending(null);
          notify.success(
            service.isActive
              ? t('uiWorkforce.serviceDeactivated')
              : res.restoredAssignments > 0
                ? t('uiWorkforce.serviceRestoredAssignments', { count: res.restoredAssignments })
                : t('uiWorkforce.serviceReactivated'),
          );
        },
        onError: (e) => notify.error(catalogErrorMessage(e, t('uiWorkforce.serviceStatusError'))),
      },
    );
  };

  const deactivating = pending?.impact.isActive ? pending.impact : null;
  const reactivating = pending && !pending.impact.isActive ? pending.impact : null;

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('uiWorkforce.services')}
        description={t('uiWorkforce.serviceCatalogDescription')}
        actions={
          <PermissionGuard permission="service.manage" mode="hide">
            <Button variant="outline" onClick={() => setCategoryForm('new')}>
              <FolderPlus className="h-4 w-4" /> {t('uiWorkforce.addCategory')}
            </Button>
            <Button
              onClick={() => setEditing('new')}
              disabled={activeCategories.length === 0}
              title={activeCategories.length === 0 ? t('uiWorkforce.createCategoryFirst') : undefined}
            >
              <Plus className="h-4 w-4" /> {t('uiWorkforce.addService')}
            </Button>
          </PermissionGuard>
        }
      />
      <Checkbox
        label={t('uiWorkforce.includeInactiveServices')}
        checked={showInactive}
        onChange={setShowInactive}
      />

      {isLoading ? (
        <p className="text-sm text-gray-400">{t('uiCommon.table.loading')}</p>
      ) : isError ? (
        <p className="text-sm text-red-500">
          {t('uiWorkforce.servicesLoadError')}{' '}
          <button type="button" className="underline" onClick={() => refetch()}>
            {t('uiWorkforce.retry')}
          </button>
        </p>
      ) : (
        <>
          {activeCategories.length === 0 && (
            <Alert type="info">
              {t('uiWorkforce.noServiceGroups')}
            </Alert>
          )}
          {grouped.map(({ category, services: rows }) => (
            <Card
              key={category.id}
              title={
                <span className="flex flex-wrap items-center gap-2">
                  {category.name}
                  {!category.isActive && <Badge>{t('uiWorkforce.stoppedGroup')}</Badge>}
                </span>
              }
              actions={
                <PermissionGuard permission="service.manage" mode="hide">
                  <Button
                    size="sm"
                    variant="ghost"
                    aria-label={t('uiWorkforce.editGroupNamed', { name: category.name })}
                    onClick={() => setCategoryForm(category)}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    isLoading={toggleCategory.isPending && toggleCategory.variables?.id === category.id}
                    onClick={() =>
                      toggleCategory.mutate(
                        { id: category.id, isActive: !category.isActive },
                        {
                          onSuccess: () =>
                            notify.success(category.isActive ? t('uiWorkforce.stopGroup') : t('uiWorkforce.reopenGroup')),
                          onError: (e) => notify.error(catalogErrorMessage(e, t('uiWorkforce.groupStatusError'))),
                        },
                      )
                    }
                  >
                    {category.isActive ? t('uiWorkforce.stopGroup') : t('uiWorkforce.reopenGroup')}
                  </Button>
                </PermissionGuard>
              }
              noPadding
            >
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 text-left text-gray-500 dark:border-surface-800">
                      <th className="px-4 py-2 font-medium">{t('uiWorkforce.code')}</th>
                      <th className="px-4 py-2 font-medium">{t('uiWorkforce.services')}</th>
                      <th className="whitespace-nowrap px-4 py-2 font-medium">{t('uiWorkforce.duration')}</th>
                      <th className="whitespace-nowrap px-4 py-2 text-right font-medium">{t('uiWorkforce.price')}</th>
                      <th className="whitespace-nowrap px-4 py-2 font-medium">{t('uiWorkforce.dentists')}</th>
                      <th className="px-4 py-2" />
                    </tr>
                  </thead>
                  <tbody>
                    {rows.length === 0 && (
                      <tr>
                        <td colSpan={6} className="px-4 py-3 text-gray-400">
                          {t('uiWorkforce.noServicesInGroup')}
                        </td>
                      </tr>
                    )}
                    {rows.map((s) => (
                      <tr key={s.id} className="border-b border-gray-50 last:border-0 dark:border-surface-800">
                        <td className="whitespace-nowrap px-4 py-3 font-mono text-xs">{s.code}</td>
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap items-center gap-2 font-medium text-gray-900 dark:text-surface-100">
                            {s.name}
                            {!s.isActive && <Badge>{t('uiWorkforce.discontinued')}</Badge>}
                            {s.requiredSpecialty && (
                              <Badge variant="info">
                                {SPECIALTY_LABEL[s.requiredSpecialty] ?? s.requiredSpecialty}
                              </Badge>
                            )}
                            {!s.bookableOnline && <Badge>{t('uiWorkforce.noOnlineBooking')}</Badge>}
                          {s.isFree && !!s.paidAssignments && (
                            <Badge variant="warning">
                              {t('uiWorkforce.paidAssignmentsWarning', { count: s.paidAssignments })}
                            </Badge>
                          )}
                            {!s.showPublicPrice && <Badge>{t('uiWorkforce.hiddenPrice')}</Badge>}
                          </div>
                          {s.description && <p className="text-xs text-gray-500">{s.description}</p>}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3">
                          {t('uiScheduling.minutesValue', { count: s.defaultDurationMin })}
                          {(s.bufferBeforeMin > 0 || s.bufferAfterMin > 0) && (
                            <span className="block text-xs text-gray-500">
                              {t('uiEntry.catalogBuffers', { before: s.bufferBeforeMin, after: s.bufferAfterMin })}
                            </span>
                          )}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-right">
                          {s.isFree ? t('uiWorkforce.noCharge') : formatCurrency(s.basePrice)}
                        </td>
                        <td className="px-4 py-3">{s.assignedDentists}</td>
                        <td className="whitespace-nowrap px-4 py-3 text-right">
                          <PermissionGuard permission="service.manage" mode="hide">
                            <Button
                              size="sm"
                              variant="ghost"
                              aria-label={t('uiWorkforce.editServiceNamed', { name: s.name })}
                              onClick={() => setEditing(s)}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              isLoading={checking === s.id}
                              onClick={() => askToggle(s)}
                            >
                              {s.isActive ? t('uiWorkforce.discontinue') : t('uiWorkforce.reopen')}
                            </Button>
                          </PermissionGuard>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          ))}
        </>
      )}

      <Modal
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={editing === 'new' ? t('uiWorkforce.addService') : editing ? t('uiWorkforce.editServiceNamed', { name: editing.code }) : ''}
        size="lg"
      >
        {editing !== null && (
          <ServiceForm
            service={editing === 'new' ? undefined : editing}
            categories={categories}
            submitting={save.isPending}
            onCancel={() => setEditing(null)}
            onSubmit={(payload) =>
              save.mutate(
                { id: editing === 'new' ? undefined : editing.id, payload },
                {
                  onSuccess: () => {
                    notify.success(t('uiWorkforce.saveService'));
                    setEditing(null);
                  },
                  onError: (e) => notify.error(catalogErrorMessage(e, t('uiWorkforce.saveServiceError'))),
                },
              )
            }
          />
        )}
      </Modal>

      <Modal
        open={categoryForm !== null}
        onClose={() => setCategoryForm(null)}
        title={categoryForm === 'new' ? t('uiWorkforce.addCategory') : categoryForm ? t('uiWorkforce.editGroupNamed', { name: categoryForm.code }) : ''}
      >
        {categoryForm !== null && (
          <CategoryForm
            category={categoryForm === 'new' ? undefined : categoryForm}
            submitting={saveCategory.isPending}
            onCancel={() => setCategoryForm(null)}
            onSubmit={(payload) =>
              saveCategory.mutate(
                { id: categoryForm === 'new' ? undefined : categoryForm.id, payload },
                {
                  onSuccess: () => {
                    notify.success(categoryForm === 'new' ? t('uiWorkforce.categoryCreated') : t('uiWorkforce.saveGroup'));
                    setCategoryForm(null);
                  },
                  onError: (e) => notify.error(catalogErrorMessage(e, t('uiWorkforce.saveGroupError'))),
                },
              )
            }
          />
        )}
      </Modal>

      <ConfirmDialog
        open={!!deactivating}
        onClose={() => setPending(null)}
        onConfirm={() => runToggle()}
        isLoading={toggle.isPending}
        variant="danger"
        title={t('uiWorkforce.confirmDiscontinueService', { name: pending?.service.name ?? '' })}
        confirmLabel={t('uiWorkforce.discontinueService')}
        description={
          deactivating && (
            <div className="space-y-2">
              {deactivating.upcomingAppointments > 0 || deactivating.pendingBookingRequests > 0 ? (
                <p className="font-medium text-amber-700">
                  {t('uiWorkforce.serviceHasBookings')}{' '}
                  {deactivating.upcomingAppointments > 0 && t('uiWorkforce.upcomingAppointmentCount', { count: deactivating.upcomingAppointments })}
                  {deactivating.upcomingAppointments > 0 && deactivating.pendingBookingRequests > 0 ? ' ' + t('uiWorkforce.and') + ' ' : ''}
                  {deactivating.pendingBookingRequests > 0 && t('uiWorkforce.pendingBookingCount', { count: deactivating.pendingBookingRequests })}{' '}
                  {t('uiWorkforce.serviceBookingsWarning')}
                </p>
              ) : (
                <p>{t('uiWorkforce.noServiceBookings')}</p>
              )}
              {deactivating.openAssignments > 0 && (
                <p>
                  {t('uiWorkforce.openAssignmentCount', { count: deactivating.openAssignments })} {t('uiWorkforce.assignmentEndToday')}
                </p>
              )}
            </div>
          )
        }
      />

      <Modal
        open={!!reactivating}
        onClose={() => setPending(null)}
        title={t('uiWorkforce.confirmReopenService', { name: pending?.service.name ?? '' })}
      >
        {reactivating && (
          <div className="space-y-4">
            {reactivating.restorableAssignments > 0 ? (
              <p className="text-sm text-gray-700 dark:text-surface-200">
                {t('uiWorkforce.restorableAssignments', { count: reactivating.restorableAssignments })}
              </p>
            ) : (
              <p className="text-sm text-gray-700 dark:text-surface-200">
                {t('uiWorkforce.noRestorableAssignments')}
              </p>
            )}
            <div className="flex flex-wrap justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setPending(null)}>
                {t('uiWorkforce.cancel')}
              </Button>
              <Button
                type="button"
                variant={reactivating.restorableAssignments > 0 ? 'outline' : 'primary'}
                isLoading={toggle.isPending && !toggle.variables?.restore}
                onClick={() => runToggle(false)}
              >
                {reactivating.restorableAssignments > 0 ? t('uiWorkforce.reopenOnly') : t('uiWorkforce.reopen')}
              </Button>
              {reactivating.restorableAssignments > 0 && (
                <Button
                  type="button"
                  isLoading={toggle.isPending && !!toggle.variables?.restore}
                  onClick={() => runToggle(true)}
                >
                  {t('uiWorkforce.reopenRestoreAssignments')}
                </Button>
              )}
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

import { useMemo, useState } from 'react';
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

const DURATION_OPTIONS = [5, 10, 15, 20, 25, 30, 40, 45, 60, 75, 90, 120, 150, 180, 240].map((m) => ({
  value: String(m),
  label: `${m} phút`,
}));
const BUFFER_OPTIONS = [0, 5, 10, 15, 20, 30, 45, 60].map((m) => ({ value: String(m), label: `${m} phút` }));

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
          label="Mã dịch vụ"
          required
          disabled={!!service}
          pattern="[A-Za-z0-9][A-Za-z0-9_\-]{1,29}"
          hint={service ? 'Không đổi được mã' : 'VD: CAO_VOI (chữ, số, _ hoặc -)'}
          value={form.code}
          onChange={(e) => setForm({ ...form, code: e.target.value })}
        />
        <Select
          label="Nhóm dịch vụ"
          required
          value={form.categoryId}
          onChange={(e) => setForm({ ...form, categoryId: e.target.value })}
          options={categories
            .filter((c) => c.isActive || c.id === form.categoryId)
            .map((c) => ({ value: c.id, label: c.name }))}
        />
      </div>
      <Input
        label="Tên dịch vụ"
        required
        minLength={2}
        maxLength={200}
        value={form.name}
        onChange={(e) => setForm({ ...form, name: e.target.value })}
      />
      <div className="grid gap-4 sm:grid-cols-3">
        <Select
          label="Thời lượng"
          value={form.defaultDurationMin}
          onChange={(e) => setForm({ ...form, defaultDurationMin: e.target.value })}
          options={DURATION_OPTIONS}
        />
        <Select
          label="Chuẩn bị trước"
          value={form.bufferBeforeMin}
          onChange={(e) => setForm({ ...form, bufferBeforeMin: e.target.value })}
          options={BUFFER_OPTIONS}
        />
        <Select
          label="Dọn dẹp sau"
          value={form.bufferAfterMin}
          onChange={(e) => setForm({ ...form, bufferAfterMin: e.target.value })}
          options={BUFFER_OPTIONS}
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Input
            label="Giá niêm yết (VND)"
            type="number"
            min={0}
            max={999_999_999_999_999}
            step={1000}
            required={!form.isFree}
            disabled={form.isFree}
            hint={
              !form.isFree && form.basePrice !== '' && Number(form.basePrice) === 0
                ? 'Giá 0 hiện "Liên hệ" trên trang chủ; chọn "Dịch vụ miễn phí" nếu miễn phí thật'
                : undefined
            }
            value={form.isFree ? '0' : form.basePrice}
            onChange={(e) => setForm({ ...form, basePrice: e.target.value })}
          />
          <Checkbox
            className="mt-1"
            label="Dịch vụ miễn phí"
            checked={form.isFree}
            onChange={(isFree) => setForm({ ...form, isFree })}
          />
        </div>
        <Select
          label="Chuyên môn bắt buộc"
          value={form.requiredSpecialty}
          onChange={(e) => setForm({ ...form, requiredSpecialty: e.target.value })}
          options={[
            { value: '', label: 'Không yêu cầu' },
            ...Object.entries(SPECIALTY_LABEL).map(([value, label]) => ({ value, label })),
          ]}
        />
      </div>
      <Textarea
        label="Mô tả"
        rows={2}
        value={form.description}
        onChange={(e) => setForm({ ...form, description: e.target.value })}
      />
      <div className="flex flex-wrap gap-x-6">
        <Checkbox
          label="Cho đặt lịch online"
          checked={form.bookableOnline}
          onChange={(bookableOnline) => setForm({ ...form, bookableOnline })}
        />
        <Checkbox
          label="Hiện trên bảng giá trang chủ"
          checked={form.showPublicPrice}
          onChange={(showPublicPrice) => setForm({ ...form, showPublicPrice })}
        />
      </div>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onCancel}>
          Hủy
        </Button>
        <Button type="submit" isLoading={submitting}>
          {service ? 'Lưu' : 'Tạo dịch vụ'}
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
        label="Mã nhóm"
        required
        disabled={!!category}
        pattern="[A-Za-z0-9][A-Za-z0-9_\-]{1,29}"
        hint={category ? 'Không đổi được mã' : 'VD: DIEU_TRI (chữ, số, _ hoặc -)'}
        value={code}
        onChange={(e) => setCode(e.target.value)}
      />
      <Input label="Tên nhóm" required minLength={2} value={name} onChange={(e) => setName(e.target.value)} />
      <Input
        label="Thứ tự hiển thị"
        type="number"
        min={0}
        max={999}
        hint="Số nhỏ hiện trước (trên trang này và bảng giá trang chủ)"
        value={sortOrder}
        onChange={(e) => setSortOrder(e.target.value)}
      />
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onCancel}>
          Hủy
        </Button>
        <Button type="submit" isLoading={submitting}>
          {category ? 'Lưu' : 'Tạo nhóm'}
        </Button>
      </div>
    </form>
  );
}

/** "3 lịch hẹn sắp tới, 1 yêu cầu đặt lịch online đang chờ và 2 phân công". */
function deactivateSummary(impact: Extract<ServiceImpact, { isActive: true }>) {
  const parts = [
    impact.upcomingAppointments > 0 && `${impact.upcomingAppointments} lịch hẹn sắp tới`,
    impact.pendingBookingRequests > 0 &&
      `${impact.pendingBookingRequests} yêu cầu đặt lịch online đang chờ xử lý`,
  ].filter(Boolean);
  return parts.join(' và ');
}

export default function ServicesPage() {
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
      notify.error(catalogErrorMessage(e, 'Không kiểm tra được dịch vụ'));
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
              ? 'Đã ngừng dịch vụ; các phân công đang chạy kết thúc hôm nay'
              : res.restoredAssignments > 0
                ? `Đã mở lại dịch vụ và khôi phục ${res.restoredAssignments} phân công`
                : 'Đã mở lại dịch vụ',
          );
        },
        onError: (e) => notify.error(catalogErrorMessage(e, 'Không đổi được trạng thái')),
      },
    );
  };

  const deactivating = pending?.impact.isActive ? pending.impact : null;
  const reactivating = pending && !pending.impact.isActive ? pending.impact : null;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Dịch vụ"
        description="Danh mục dịch vụ, thời lượng, thời gian chuẩn bị và giá niêm yết"
        actions={
          <PermissionGuard permission="service.manage" mode="hide">
            <Button variant="outline" onClick={() => setCategoryForm('new')}>
              <FolderPlus className="h-4 w-4" /> Thêm nhóm
            </Button>
            <Button
              onClick={() => setEditing('new')}
              disabled={activeCategories.length === 0}
              title={activeCategories.length === 0 ? 'Tạo nhóm dịch vụ trước' : undefined}
            >
              <Plus className="h-4 w-4" /> Thêm dịch vụ
            </Button>
          </PermissionGuard>
        }
      />
      <Checkbox
        label="Hiện cả dịch vụ đã ngừng"
        checked={showInactive}
        onChange={setShowInactive}
      />

      {isLoading ? (
        <p className="text-sm text-gray-400">Đang tải…</p>
      ) : isError ? (
        <p className="text-sm text-red-500">
          Không tải được danh mục dịch vụ.{' '}
          <button type="button" className="underline" onClick={() => refetch()}>
            Thử lại
          </button>
        </p>
      ) : (
        <>
          {activeCategories.length === 0 && (
            <Alert type="info">
              Chưa có nhóm dịch vụ nào đang dùng. Mỗi dịch vụ thuộc một nhóm (VD: Khám, Điều trị,
              Phục hình): bấm <strong>Thêm nhóm</strong> để tạo nhóm trước, rồi mới thêm dịch vụ.
            </Alert>
          )}
          {grouped.map(({ category, services: rows }) => (
            <Card
              key={category.id}
              title={
                <span className="flex flex-wrap items-center gap-2">
                  {category.name}
                  {!category.isActive && <Badge>Nhóm đã ngừng</Badge>}
                </span>
              }
              actions={
                <PermissionGuard permission="service.manage" mode="hide">
                  <Button
                    size="sm"
                    variant="ghost"
                    aria-label={`Sửa nhóm ${category.name}`}
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
                            notify.success(category.isActive ? 'Đã ngừng nhóm dịch vụ' : 'Đã mở lại nhóm dịch vụ'),
                          onError: (e) => notify.error(catalogErrorMessage(e, 'Không đổi được trạng thái nhóm')),
                        },
                      )
                    }
                  >
                    {category.isActive ? 'Ngừng nhóm' : 'Mở lại nhóm'}
                  </Button>
                </PermissionGuard>
              }
              noPadding
            >
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 text-left text-gray-500 dark:border-surface-800">
                      <th className="px-4 py-2 font-medium">Mã</th>
                      <th className="px-4 py-2 font-medium">Dịch vụ</th>
                      <th className="whitespace-nowrap px-4 py-2 font-medium">Thời lượng</th>
                      <th className="whitespace-nowrap px-4 py-2 text-right font-medium">Giá</th>
                      <th className="whitespace-nowrap px-4 py-2 font-medium">Bác sĩ</th>
                      <th className="px-4 py-2" />
                    </tr>
                  </thead>
                  <tbody>
                    {rows.length === 0 && (
                      <tr>
                        <td colSpan={6} className="px-4 py-3 text-gray-400">
                          Chưa có dịch vụ trong nhóm này.
                        </td>
                      </tr>
                    )}
                    {rows.map((s) => (
                      <tr key={s.id} className="border-b border-gray-50 last:border-0 dark:border-surface-800">
                        <td className="whitespace-nowrap px-4 py-3 font-mono text-xs">{s.code}</td>
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap items-center gap-2 font-medium text-gray-900 dark:text-surface-100">
                            {s.name}
                            {!s.isActive && <Badge>Đã ngừng</Badge>}
                            {s.requiredSpecialty && (
                              <Badge variant="info">
                                {SPECIALTY_LABEL[s.requiredSpecialty] ?? s.requiredSpecialty}
                              </Badge>
                            )}
                            {!s.bookableOnline && <Badge>Không đặt online</Badge>}
                          {s.isFree && !!s.paidAssignments && (
                            <Badge variant="warning">
                              {s.paidAssignments} phân công có giá riêng &gt; 0: trang chủ sẽ hiện giá đó
                            </Badge>
                          )}
                            {!s.showPublicPrice && <Badge>Ẩn trên bảng giá</Badge>}
                          </div>
                          {s.description && <p className="text-xs text-gray-500">{s.description}</p>}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3">
                          {s.defaultDurationMin} phút
                          {(s.bufferBeforeMin > 0 || s.bufferAfterMin > 0) && (
                            <span className="block text-xs text-gray-500">
                              +{s.bufferBeforeMin}/{s.bufferAfterMin} phút chuẩn bị/dọn
                            </span>
                          )}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-right">
                          {s.isFree ? 'Miễn phí' : formatCurrency(s.basePrice)}
                        </td>
                        <td className="px-4 py-3">{s.assignedDentists}</td>
                        <td className="whitespace-nowrap px-4 py-3 text-right">
                          <PermissionGuard permission="service.manage" mode="hide">
                            <Button
                              size="sm"
                              variant="ghost"
                              aria-label={`Sửa ${s.name}`}
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
                              {s.isActive ? 'Ngừng' : 'Mở lại'}
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
        title={editing === 'new' ? 'Thêm dịch vụ' : editing ? `Sửa ${editing.code}` : ''}
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
                    notify.success('Đã lưu dịch vụ');
                    setEditing(null);
                  },
                  onError: (e) => notify.error(catalogErrorMessage(e, 'Không lưu được dịch vụ')),
                },
              )
            }
          />
        )}
      </Modal>

      <Modal
        open={categoryForm !== null}
        onClose={() => setCategoryForm(null)}
        title={categoryForm === 'new' ? 'Thêm nhóm dịch vụ' : categoryForm ? `Sửa nhóm ${categoryForm.code}` : ''}
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
                    notify.success(categoryForm === 'new' ? 'Đã tạo nhóm dịch vụ' : 'Đã lưu nhóm dịch vụ');
                    setCategoryForm(null);
                  },
                  onError: (e) => notify.error(catalogErrorMessage(e, 'Không lưu được nhóm')),
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
        title={`Ngừng dịch vụ ${pending?.service.name ?? ''}?`}
        confirmLabel="Ngừng dịch vụ"
        description={
          deactivating && (
            <div className="space-y-2">
              {deactivateSummary(deactivating) ? (
                <p className="font-medium text-amber-700">
                  Đang có {deactivateSummary(deactivating)} dùng dịch vụ này. Chúng không bị hủy: lịch đã đặt vẫn
                  dời được và khi khám vẫn ghi được dịch vụ này theo giá đã chốt. Lịch hẹn không đổi được dịch vụ;
                  nếu không làm dịch vụ này nữa, lễ tân báo khách và hủy rồi đặt lại lịch.
                </p>
              ) : (
                <p>Không có lịch hẹn sắp tới hay yêu cầu online đang chờ dùng dịch vụ này.</p>
              )}
              {deactivating.openAssignments > 0 && (
                <p>
                  {deactivating.openAssignments} phân công bác sĩ sẽ kết thúc hôm nay (phân công chưa bắt đầu bị
                  hủy). Khi mở lại dịch vụ, bạn có thể khôi phục chúng.
                </p>
              )}
            </div>
          )
        }
      />

      <Modal
        open={!!reactivating}
        onClose={() => setPending(null)}
        title={`Mở lại dịch vụ ${pending?.service.name ?? ''}?`}
      >
        {reactivating && (
          <div className="space-y-4">
            {reactivating.restorableAssignments > 0 ? (
              <p className="text-sm text-gray-700 dark:text-surface-200">
                Lần ngừng trước đã kết thúc {reactivating.restorableAssignments} phân công bác sĩ vẫn có thể khôi
                phục (từ hôm nay, giữ giá và thời lượng riêng). Khôi phục luôn, hay để phân công lại sau?
              </p>
            ) : (
              <p className="text-sm text-gray-700 dark:text-surface-200">
                Không có phân công nào để khôi phục; sau khi mở lại, hãy phân công bác sĩ ở trang Bác sĩ.
              </p>
            )}
            <div className="flex flex-wrap justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setPending(null)}>
                Hủy
              </Button>
              <Button
                type="button"
                variant={reactivating.restorableAssignments > 0 ? 'outline' : 'primary'}
                isLoading={toggle.isPending && !toggle.variables?.restore}
                onClick={() => runToggle(false)}
              >
                {reactivating.restorableAssignments > 0 ? 'Chỉ mở lại dịch vụ' : 'Mở lại'}
              </Button>
              {reactivating.restorableAssignments > 0 && (
                <Button
                  type="button"
                  isLoading={toggle.isPending && !!toggle.variables?.restore}
                  onClick={() => runToggle(true)}
                >
                  Mở lại và khôi phục phân công
                </Button>
              )}
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

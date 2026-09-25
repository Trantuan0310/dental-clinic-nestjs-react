import { useMemo, useState } from 'react';
import { FolderPlus, Pencil, Plus } from 'lucide-react';
import { Badge, Button, Card, Checkbox, Input, Modal, Select, Textarea } from '@/components/ui';
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
import type { CatalogService, ServiceCategory, ServicePayload } from './types';

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
    basePrice: String(service?.basePrice ?? 0),
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
          basePrice: Number(form.basePrice),
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
        <Input
          label="Giá niêm yết (VND)"
          type="number"
          min={0}
          step={1000}
          required
          value={form.basePrice}
          onChange={(e) => setForm({ ...form, basePrice: e.target.value })}
        />
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
  submitting,
  onCancel,
  onSubmit,
}: {
  submitting: boolean;
  onCancel: () => void;
  onSubmit: (payload: { code: string; name: string; sortOrder: number }) => void;
}) {
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [sortOrder, setSortOrder] = useState('100');
  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit({ code: code.trim().toUpperCase(), name: name.trim(), sortOrder: Number(sortOrder) });
      }}
    >
      <Input label="Mã nhóm" required value={code} onChange={(e) => setCode(e.target.value)} />
      <Input label="Tên nhóm" required minLength={2} value={name} onChange={(e) => setName(e.target.value)} />
      <Input
        label="Thứ tự hiển thị"
        type="number"
        min={0}
        max={999}
        value={sortOrder}
        onChange={(e) => setSortOrder(e.target.value)}
      />
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onCancel}>
          Hủy
        </Button>
        <Button type="submit" isLoading={submitting}>
          Tạo nhóm
        </Button>
      </div>
    </form>
  );
}

export default function ServicesPage() {
  const [showInactive, setShowInactive] = useState(false);
  const [editing, setEditing] = useState<CatalogService | 'new' | null>(null);
  const [newCategory, setNewCategory] = useState(false);
  const { data: categories = [] } = useServiceCategories();
  const { data: services = [], isLoading, isError, refetch } = useCatalogServices(showInactive);

  const save = useCatalogMutation((v: { id?: string; payload: ServicePayload }) =>
    v.id ? catalogApi.updateService(v.id, v.payload) : catalogApi.createService(v.payload),
  );
  const toggle = useCatalogMutation((v: { id: string; active: boolean }) =>
    catalogApi.setActive(v.id, v.active),
  );
  const createCategory = useCatalogMutation(catalogApi.createCategory);

  const grouped = useMemo(() => {
    const byCategory = new Map<string, CatalogService[]>();
    for (const s of services) {
      byCategory.set(s.category.id, [...(byCategory.get(s.category.id) ?? []), s]);
    }
    return categories
      .filter((c) => byCategory.has(c.id) || c.isActive)
      .map((c) => ({ category: c, services: byCategory.get(c.id) ?? [] }));
  }, [categories, services]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Dịch vụ"
        description="Danh mục dịch vụ, thời lượng, thời gian chuẩn bị và giá niêm yết"
        actions={
          <PermissionGuard permission="service.manage" mode="hide">
            <Button variant="outline" onClick={() => setNewCategory(true)}>
              <FolderPlus className="h-4 w-4" /> Thêm nhóm
            </Button>
            <Button onClick={() => setEditing('new')}>
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
        grouped.map(({ category, services: rows }) => (
          <Card key={category.id} title={category.name} noPadding>
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
                      <td className="whitespace-nowrap px-4 py-3 text-right">{formatCurrency(s.basePrice)}</td>
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
                            isLoading={toggle.isPending && toggle.variables?.id === s.id}
                            onClick={() =>
                              toggle.mutate(
                                { id: s.id, active: !s.isActive },
                                {
                                  onSuccess: () =>
                                    notify.success(
                                      s.isActive
                                        ? 'Đã ngừng dịch vụ; các phân công đang chạy kết thúc hôm nay'
                                        : 'Đã mở lại dịch vụ',
                                    ),
                                  onError: (e) => notify.error(catalogErrorMessage(e, 'Không đổi được trạng thái')),
                                },
                              )
                            }
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
        ))
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

      <Modal open={newCategory} onClose={() => setNewCategory(false)} title="Thêm nhóm dịch vụ">
        {newCategory && (
          <CategoryForm
            submitting={createCategory.isPending}
            onCancel={() => setNewCategory(false)}
            onSubmit={(payload) =>
              createCategory.mutate(payload, {
                onSuccess: () => {
                  notify.success('Đã tạo nhóm dịch vụ');
                  setNewCategory(false);
                },
                onError: (e) => notify.error(catalogErrorMessage(e, 'Không tạo được nhóm')),
              })
            }
          />
        )}
      </Modal>
    </div>
  );
}

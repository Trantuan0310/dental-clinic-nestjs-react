import { useState } from 'react';
import { format } from 'date-fns';
import { Plus } from 'lucide-react';
import { Badge, Button, Card, DatePicker, Input, Modal, Select } from '@/components/ui';
import { notify } from '@/components/ui/Toast';
import { useAuthStore } from '@/stores/authStore';
import { formatCurrency, formatDate } from '@/lib/format';
import {
  catalogApi,
  catalogErrorMessage,
  useCatalogMutation,
  useCatalogServices,
  useDentistServices,
} from './catalogApi';

/** Services a dentist performs (BR-SVC-004/005/006), on the dentist detail page. */
export function DentistServicesCard({
  dentistId,
  canAssign,
}: {
  dentistId: string;
  /** The dentist's practice is ACTIVE (assignments need it). */
  canAssign: boolean;
}) {
  const hasPermission = useAuthStore((s) => s.hasPermission);
  const mayManage = hasPermission('dentist.assign_service');
  const { data: rows = [], isLoading } = useDentistServices(dentistId);
  const { data: services = [] } = useCatalogServices(false);
  const [open, setOpen] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const today = format(new Date(), 'yyyy-MM-dd');
  const [form, setForm] = useState({ serviceId: '', effectiveFrom: today, durationMin: '', price: '' });

  const assign = useCatalogMutation(() =>
    catalogApi.assign(dentistId, {
      serviceId: form.serviceId,
      effectiveFrom: form.effectiveFrom,
      ...(form.durationMin ? { durationMin: Number(form.durationMin) } : {}),
      ...(form.price ? { price: Number(form.price) } : {}),
    }),
  );
  const end = useCatalogMutation((assignmentId: string) =>
    catalogApi.endAssignment(dentistId, assignmentId),
  );

  const active = rows.filter((r) => !r.effectiveTo || r.effectiveTo >= today);
  const past = rows.filter((r) => r.effectiveTo && r.effectiveTo < today);
  const assignedIds = new Set(active.map((r) => r.service.id));
  const selectable = services.filter((s) => !assignedIds.has(s.id));

  return (
    <Card
      title="Dịch vụ thực hiện"
      actions={
        mayManage && canAssign ? (
          <Button size="sm" onClick={() => setOpen(true)}>
            <Plus className="h-4 w-4" /> Phân công
          </Button>
        ) : undefined
      }
    >
      {isLoading ? (
        <p className="text-sm text-gray-400">Đang tải…</p>
      ) : active.length === 0 ? (
        <p className="text-sm text-gray-500">Chưa được phân công dịch vụ nào.</p>
      ) : (
        <ul className="divide-y divide-gray-100 text-sm dark:divide-surface-800">
          {active.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <div className="min-w-0">
                <p className="font-medium text-gray-900 dark:text-surface-100">
                  {r.service.name}{' '}
                  <span className="text-xs font-normal text-gray-500">· {r.service.categoryName}</span>
                </p>
                <p className="text-xs text-gray-500">
                  {r.effectiveDurationMin} phút{r.durationMin !== null && ' (riêng)'} ·{' '}
                  {formatCurrency(r.effectivePrice)}
                  {r.price !== null && ' (riêng)'} · từ {formatDate(r.effectiveFrom)}
                  {r.effectiveTo && ` đến ${formatDate(r.effectiveTo)}`}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {!r.current && <Badge variant="info">Sắp áp dụng</Badge>}
                {mayManage && !r.effectiveTo && (
                  <Button
                    size="sm"
                    variant="ghost"
                    aria-label={`Ngừng phân công ${r.service.name}`}
                    isLoading={end.isPending && end.variables === r.id}
                    onClick={() =>
                      end.mutate(r.id, {
                        onSuccess: (res) =>
                          notify.success(res.removed ? 'Đã hủy phân công chưa bắt đầu' : 'Phân công kết thúc hôm nay'),
                        onError: (e) => notify.error(catalogErrorMessage(e, 'Không ngừng được phân công')),
                      })
                    }
                  >
                    Ngừng
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      {past.length > 0 && (
        <div className="mt-3">
          <button
            type="button"
            className="text-xs text-gray-500 underline"
            onClick={() => setShowHistory((v) => !v)}
          >
            {showHistory ? 'Ẩn' : 'Xem'} lịch sử ({past.length})
          </button>
          {showHistory && (
            <ul className="mt-2 space-y-1 text-xs text-gray-500">
              {past.map((r) => (
                <li key={r.id}>
                  {r.service.name}: {formatDate(r.effectiveFrom)} – {formatDate(r.effectiveTo)}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title="Phân công dịch vụ">
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            assign.mutate(undefined, {
              onSuccess: () => {
                notify.success('Đã phân công dịch vụ');
                setOpen(false);
                setForm({ serviceId: '', effectiveFrom: today, durationMin: '', price: '' });
              },
              onError: (err) => notify.error(catalogErrorMessage(err, 'Không phân công được')),
            });
          }}
        >
          <Select
            label="Dịch vụ"
            required
            value={form.serviceId}
            onChange={(e) => setForm({ ...form, serviceId: e.target.value })}
            placeholder="-- Chọn dịch vụ --"
            options={selectable.map((s) => ({
              value: s.id,
              label: `${s.name} (${s.defaultDurationMin} phút · ${formatCurrency(s.basePrice)})`,
            }))}
          />
          <DatePicker
            label="Áp dụng từ"
            required
            min={today}
            value={form.effectiveFrom}
            onChange={(value) => setForm({ ...form, effectiveFrom: value })}
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              label="Thời lượng riêng (phút)"
              type="number"
              min={5}
              max={480}
              step={5}
              hint="Để trống: theo dịch vụ"
              value={form.durationMin}
              onChange={(e) => setForm({ ...form, durationMin: e.target.value })}
            />
            <Input
              label="Giá riêng (VND)"
              type="number"
              min={0}
              step={1000}
              hint="Để trống: giá niêm yết"
              value={form.price}
              onChange={(e) => setForm({ ...form, price: e.target.value })}
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Hủy
            </Button>
            <Button type="submit" isLoading={assign.isPending}>
              Phân công
            </Button>
          </div>
        </form>
      </Modal>
    </Card>
  );
}

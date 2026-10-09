import { useState } from 'react';
import { Plus } from 'lucide-react';
import { Badge, Button, Card, DatePicker, Input, Modal, Select } from '@/components/ui';
import { notify } from '@/components/ui/Toast';
import { useAuthStore } from '@/stores/authStore';
import { formatCurrency, formatDate, formatDateTime } from '@/lib/format';
import { clinicToday } from '@/lib/clinicTime';
import { getApiErrorCode, getApiErrorDetails } from '@/lib/errors';
import {
  catalogApi,
  catalogErrorMessage,
  useCatalogMutation,
  useCatalogServices,
  useDentistServices,
} from './catalogApi';
import type { DentistServiceAssignment } from './types';

interface UpcomingVisits {
  count: number;
  appointments: { id: string; startAt: string; patientName: string; patientCode: string }[];
}

/** "YYYY-MM-DD" plus n days. */
const addDays = (date: string, n: number) =>
  new Date(Date.parse(`${date}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
const later = (a: string, b: string) => (a > b ? a : b);

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
  const today = clinicToday();
  const tomorrow = addDays(today, 1);
  const [form, setForm] = useState({ serviceId: '', effectiveFrom: today, durationMin: '', price: '' });
  // Ending: pick the last day. Changing terms: from which day, and the new values.
  const [ending, setEnding] = useState<{
    row: DentistServiceAssignment;
    effectiveTo: string;
    /** Visits still booked after the end (A2-13): shown, then confirmed. */
    booked?: UpcomingVisits;
  } | null>(null);
  const [changing, setChanging] = useState<{
    row: DentistServiceAssignment;
    effectiveFrom: string;
    durationMin: string;
    price: string;
  } | null>(null);

  const assign = useCatalogMutation(() =>
    catalogApi.assign(dentistId, {
      serviceId: form.serviceId,
      effectiveFrom: form.effectiveFrom,
      ...(form.durationMin ? { durationMin: Number(form.durationMin) } : {}),
      ...(form.price ? { price: Number(form.price) } : {}),
    }),
  );
  const end = useCatalogMutation((v: { id: string; effectiveTo?: string; confirm?: boolean }) =>
    catalogApi.endAssignment(dentistId, v.id, v.effectiveTo, v.confirm),
  );
  const change = useCatalogMutation(
    (v: { id: string; effectiveFrom: string; durationMin: number | null; price: number | null }) =>
      catalogApi.changeAssignment(dentistId, v.id, {
        effectiveFrom: v.effectiveFrom,
        durationMin: v.durationMin,
        price: v.price,
      }),
  );

  const active = rows.filter((r) => !r.effectiveTo || r.effectiveTo >= today);
  const past = rows.filter((r) => r.effectiveTo && r.effectiveTo < today);
  // A period ending today is over for new assignments: the service can be
  // assigned again from tomorrow (periods may not overlap).
  const blocked = new Set(
    rows.filter((r) => !r.effectiveTo || r.effectiveTo >= tomorrow).map((r) => r.service.id),
  );
  const selectable = services.filter((s) => !blocked.has(s.id));
  const earliestStart = (serviceId: string) =>
    rows.some((r) => r.service.id === serviceId && r.effectiveTo === today) ? tomorrow : today;
  const assignMin = form.serviceId ? earliestStart(form.serviceId) : today;
  const FREE_PRICE_WARNING = 'Dịch vụ này đánh dấu miễn phí; giá riêng > 0 sẽ hiện trên bảng giá trang chủ';
  const assignFree = services.find((s) => s.id === form.serviceId)?.isFree ?? false;

  const openAssign = () => {
    setForm({ serviceId: '', effectiveFrom: today, durationMin: '', price: '' });
    setOpen(true);
  };

  return (
    <Card
      title="Dịch vụ thực hiện"
      actions={
        mayManage && canAssign ? (
          <Button size="sm" onClick={openAssign}>
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
                  {r.price !== null && ' (riêng)'}
                  {r.service.isFree && r.effectivePrice > 0 && ' (dịch vụ đánh dấu miễn phí!)'} · từ{' '}
                  {formatDate(r.effectiveFrom)}
                  {r.effectiveTo && ` đến ${formatDate(r.effectiveTo)}`}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {!r.current && <Badge variant="info">Sắp áp dụng</Badge>}
                {mayManage && r.service.isActive && (
                  <Button
                    size="sm"
                    variant="ghost"
                    aria-label={`Đổi giá/thời lượng ${r.service.name}`}
                    onClick={() =>
                      setChanging({
                        row: r,
                        effectiveFrom: later(today, r.effectiveFrom),
                        durationMin: r.durationMin === null ? '' : String(r.durationMin),
                        price: r.price === null ? '' : String(r.price),
                      })
                    }
                  >
                    Đổi giá/thời lượng
                  </Button>
                )}
                {mayManage && !r.effectiveTo && (
                  <Button
                    size="sm"
                    variant="ghost"
                    aria-label={`Ngừng phân công ${r.service.name}`}
                    onClick={() => setEnding({ row: r, effectiveTo: later(today, r.effectiveFrom) })}
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
                  {r.service.name}: {formatDate(r.effectiveFrom)} – {formatDate(r.effectiveTo)} ·{' '}
                  {r.effectiveDurationMin} phút · {formatCurrency(r.effectivePrice)}
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
            onChange={(e) =>
              setForm({
                ...form,
                serviceId: e.target.value,
                effectiveFrom: later(form.effectiveFrom, earliestStart(e.target.value)),
              })
            }
            placeholder="-- Chọn dịch vụ --"
            options={selectable.map((s) => ({
              value: s.id,
              label: `${s.name} (${s.defaultDurationMin} phút · ${formatCurrency(s.basePrice)})`,
            }))}
          />
          <DatePicker
            label="Áp dụng từ"
            required
            min={assignMin}
            hint={assignMin === tomorrow ? 'Phân công cũ kết thúc hôm nay, nên phân công lại từ ngày mai' : undefined}
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
              max={999_999_999_999_999}
              step={1000}
              hint={assignFree && Number(form.price) > 0 ? FREE_PRICE_WARNING : 'Để trống: giá niêm yết'}
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

      <Modal
        open={!!changing}
        onClose={() => setChanging(null)}
        title={changing ? `Đổi giá/thời lượng: ${changing.row.service.name}` : ''}
      >
        {changing && (
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              change.mutate(
                {
                  id: changing.row.id,
                  effectiveFrom: changing.effectiveFrom,
                  durationMin: changing.durationMin ? Number(changing.durationMin) : null,
                  price: changing.price ? Number(changing.price) : null,
                },
                {
                  onSuccess: (res) => {
                    notify.success(`Đã đổi, áp dụng từ ${formatDate(changing.effectiveFrom)}`);
                    // Booked visits froze their price and length at booking.
                    if (res.affectedAppointments > 0)
                      notify.warning(
                        `${res.affectedAppointments} lịch hẹn đã đặt từ ngày này vẫn giữ giá và thời lượng lúc đặt ` +
                          '(hệ thống không đổi dịch vụ hay giá của lịch đã đặt). Muốn áp mức mới cho một lịch thì hủy và đặt lại lịch đó.',
                      );
                    setChanging(null);
                  },
                  onError: (err) => notify.error(catalogErrorMessage(err, 'Không đổi được')),
                },
              );
            }}
          >
            <p className="text-sm text-gray-600 dark:text-surface-300">
              Lịch hẹn đã đặt giữ giá lúc đặt. Phân công hiện tại kết thúc ngày trước ngày áp dụng và một phân công
              mới bắt đầu từ ngày áp dụng.
            </p>
            <DatePicker
              label="Áp dụng từ"
              required
              min={later(today, changing.row.effectiveFrom)}
              max={changing.row.effectiveTo ?? undefined}
              value={changing.effectiveFrom}
              onChange={(value) => setChanging({ ...changing, effectiveFrom: value })}
            />
            <div className="grid gap-4 sm:grid-cols-2">
              <Input
                label="Thời lượng riêng (phút)"
                type="number"
                min={5}
                max={480}
                step={5}
                hint="Để trống: theo dịch vụ"
                value={changing.durationMin}
                onChange={(e) => setChanging({ ...changing, durationMin: e.target.value })}
              />
              <Input
                label="Giá riêng (VND)"
                type="number"
                min={0}
                max={999_999_999_999_999}
                step={1000}
                hint={
                  changing.row.service.isFree && Number(changing.price) > 0
                    ? FREE_PRICE_WARNING
                    : 'Để trống: giá niêm yết'
                }
                value={changing.price}
                onChange={(e) => setChanging({ ...changing, price: e.target.value })}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setChanging(null)}>
                Hủy
              </Button>
              <Button type="submit" isLoading={change.isPending}>
                Lưu thay đổi
              </Button>
            </div>
          </form>
        )}
      </Modal>

      <Modal
        open={!!ending}
        onClose={() => setEnding(null)}
        title={ending ? `Ngừng phân công: ${ending.row.service.name}` : ''}
      >
        {ending && (
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              end.mutate(
                { id: ending.row.id, effectiveTo: ending.effectiveTo, confirm: !!ending.booked },
                {
                  onSuccess: (res) => {
                    notify.success(
                      res.removed
                        ? 'Đã hủy phân công chưa bắt đầu'
                        : `Phân công kết thúc ngày ${formatDate(ending.effectiveTo)}`,
                    );
                    if (res.affectedAppointments > 0)
                      notify.warning(
                        `Còn ${res.affectedAppointments} lịch hẹn đã đặt với dịch vụ này; lễ tân cần dời lịch, đổi bác sĩ hoặc báo khách.`,
                      );
                    setEnding(null);
                  },
                  onError: (err) => {
                    if (getApiErrorCode(err) === 'ASSIGNMENT_HAS_UPCOMING_VISITS') {
                      const booked = getApiErrorDetails<UpcomingVisits>(err);
                      if (booked) {
                        setEnding({ ...ending, booked });
                        return;
                      }
                    }
                    notify.error(catalogErrorMessage(err, 'Không ngừng được phân công'));
                  },
                },
              );
            }}
          >
            {ending.row.effectiveFrom > today ? (
              <p className="text-sm text-gray-600 dark:text-surface-300">
                Phân công này chưa bắt đầu (từ {formatDate(ending.row.effectiveFrom)}) nên sẽ bị hủy.
              </p>
            ) : (
              <DatePicker
                label="Ngày cuối thực hiện"
                required
                min={today}
                hint="Để đổi giá hoặc thời lượng, dùng “Đổi giá/thời lượng” thay vì ngừng rồi phân công lại"
                value={ending.effectiveTo}
                onChange={(value) => setEnding({ ...ending, effectiveTo: value, booked: undefined })}
              />
            )}
            {ending.booked && (
              <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
                <p className="font-medium">
                  Còn {ending.booked.count} lịch hẹn đã đặt với dịch vụ này sau ngày kết thúc:
                </p>
                <ul className="mt-1 list-disc pl-5">
                  {ending.booked.appointments.map((a) => (
                    <li key={a.id}>
                      {formatDateTime(a.startAt)} — {a.patientName} ({a.patientCode})
                    </li>
                  ))}
                  {ending.booked.count > ending.booked.appointments.length && (
                    <li>… và {ending.booked.count - ending.booked.appointments.length} lịch khác</li>
                  )}
                </ul>
                <p className="mt-1">
                  Nên dời lịch hoặc đổi bác sĩ cho các lịch này trước. Nếu vẫn ngừng, lễ tân cần xử lý từng lịch.
                </p>
              </div>
            )}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setEnding(null)}>
                Hủy
              </Button>
              <Button type="submit" variant="danger" isLoading={end.isPending}>
                {ending.booked ? 'Vẫn ngừng phân công' : 'Ngừng phân công'}
              </Button>
            </div>
          </form>
        )}
      </Modal>
    </Card>
  );
}

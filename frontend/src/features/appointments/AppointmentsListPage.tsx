import { useEffect, useMemo, useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Download,
  Eye,
  Loader2,
  Plus,
  Search,
} from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { EmptyState } from '@/components/ui/EmptyState';
import { PageLoader } from '@/components/ui/Loading';
import { Pagination } from '@/components/ui/Pagination';
import { AppointmentStatusBadge } from '@/components/ui/StatusBadge';
import { PermissionGuard } from '@/components/PermissionGuard';
import {
  useAppointments,
  useDentistOptions,
} from './appointmentApi';
import { AppointmentFormModal } from './AppointmentFormModal';
import { AppointmentDetailDrawer } from './AppointmentDetailDrawer';
import type {
  Appointment,
  AppointmentSource,
  AppointmentStatus,
  AppointmentType,
  AppointmentViewMode,
} from '@/types/appointment';
import {
  formatDate,
  formatDateTime,
  formatPhone,
  formatTimeOnly,
  getWeekdayLabel,
} from '@/lib/format';
import { cn } from '@/lib/cn';
import { exportCsv, type CsvColumn } from '@/lib/csv';
import { notify } from '@/components/ui/Toast';

const PAGE_SIZE = 20;

const APPOINTMENT_TYPE_OPTIONS: { value: AppointmentType | 'all'; label: string }[] = [
  { value: 'all', label: 'Tất cả loại' },
  { value: 'consultation', label: 'Khám / Tư vấn' },
  { value: 'treatment', label: 'Điều trị' },
  { value: 'follow_up', label: 'Tái khám' },
];

const SOURCE_OPTIONS: { value: AppointmentSource | 'all'; label: string }[] = [
  { value: 'all', label: 'Tất cả nguồn' },
  { value: 'walk_in', label: 'Khách vãng lai' },
  { value: 'phone', label: 'Qua điện thoại' },
  { value: 'online', label: 'Trực tuyến' },
  { value: 'returning', label: 'Khách quay lại' },
];

const SOURCE_LABEL: Record<AppointmentSource, string> = {
  walk_in: 'Vãng lai',
  phone: 'Điện thoại',
  online: 'Trực tuyến',
  returning: 'Quay lại',
};

const TYPE_LABEL: Record<AppointmentType, string> = {
  consultation: 'Khám / Tư vấn',
  treatment: 'Điều trị',
  follow_up: 'Tái khám',
};

const STATUS_LABEL: Record<AppointmentStatus, string> = {
  scheduled: 'Đã đặt',
  confirmed: 'Đã xác nhận',
  checked_in: 'Đã check-in',
  in_progress: 'Đang khám',
  completed: 'Hoàn thành',
  cancelled: 'Đã hủy',
  no_show: 'Vắng mặt',
};

const CSV_COLUMNS: CsvColumn<Appointment>[] = [
  { header: 'Mã lịch hẹn', accessor: (r) => r.id },
  { header: 'Ngày', accessor: (r) => formatDate(r.startsAt, 'dd/MM/yyyy') },
  { header: 'Giờ bắt đầu', accessor: (r) => formatTimeOnly(r.startsAt) },
  { header: 'Giờ kết thúc', accessor: (r) => formatTimeOnly(r.endsAt) },
  { header: 'Thời lượng (phút)', accessor: (r) => r.durationMinutes },
  { header: 'Mã BN', accessor: (r) => r.patientCode },
  { header: 'Tên bệnh nhân', accessor: (r) => r.patientName },
  { header: 'Số điện thoại', accessor: (r) => r.patientPhone ?? '' },
  { header: 'Bác sĩ', accessor: (r) => r.dentistName },
  { header: 'Loại lịch hẹn', accessor: (r) => (r.appointmentType ? TYPE_LABEL[r.appointmentType] : '') },
  { header: 'Nguồn', accessor: (r) => (r.source ? SOURCE_LABEL[r.source] : '') },
  { header: 'Lý do khám', accessor: (r) => r.reason ?? '' },
  { header: 'Triệu chứng', accessor: (r) => r.chiefComplaint ?? '' },
  { header: 'Trạng thái', accessor: (r) => STATUS_LABEL[r.status] ?? r.status },
  { header: 'Check-in lúc', accessor: (r) => (r.checkInAt ? formatDateTime(r.checkInAt) : '') },
];

type StatusTab =
  | 'all'
  | 'scheduled'
  | 'checked_in'
  | 'completed'
  | 'cancelled';

const STATUS_TABS: { id: StatusTab; label: string }[] = [
  { id: 'all', label: 'Tất cả' },
  { id: 'scheduled', label: 'Chưa đến' },
  { id: 'checked_in', label: 'Đã đến' },
  { id: 'completed', label: 'Hoàn thành' },
  { id: 'cancelled', label: 'Hủy' },
];

function isoDateOnly(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

// Map a row's status to a UI tab bucket. Used both for filtering and for counts
// so the two stay in sync.
function statusToTabBucket(status: AppointmentStatus): StatusTab {
  if (status === 'scheduled' || status === 'confirmed' || status === 'in_progress') {
    return 'scheduled';
  }
  if (status === 'checked_in') return 'checked_in';
  if (status === 'completed') return 'completed';
  return 'cancelled'; // cancelled | no_show
}

const VIEW_OPTIONS: { id: AppointmentViewMode; label: string }[] = [
  { id: 'day', label: 'Ngày' },
  { id: 'week', label: 'Tuần' },
  { id: 'month', label: 'Tháng' },
];

export default function AppointmentsListPage() {
  const [view, setView] = useState<AppointmentViewMode>('day');
  const [date, setDate] = useState<Date>(new Date());
  const [tab, setTab] = useState<StatusTab>('all');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [dentistFilter, setDentistFilter] = useState<string>('');
  const [typeFilter, setTypeFilter] = useState<AppointmentType | 'all'>('all');
  const [sourceFilter, setSourceFilter] = useState<AppointmentSource | 'all'>('all');
  const [page, setPage] = useState(1);
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<Appointment | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);

  const { data: dentists } = useDentistOptions();

  // Debounce search 300ms to avoid fetching on every keystroke.
  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput.trim()), 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  // Reset to page 1 whenever any filter/date/view changes.
  useEffect(() => {
    setPage(1);
  }, [search, dentistFilter, typeFilter, sourceFilter, view, date]);

  // Compute date range based on view
  const { from, to } = useMemo(() => {
    if (view === 'day') {
      const start = new Date(date);
      start.setHours(0, 0, 0, 0);
      const end = new Date(date);
      end.setHours(23, 59, 59, 999);
      return { from: start.toISOString(), to: end.toISOString() };
    }
    if (view === 'week') {
      const start = new Date(date);
      const day = start.getDay() || 7; // Mon-based
      start.setDate(start.getDate() - (day - 1));
      start.setHours(0, 0, 0, 0);
      const end = new Date(start);
      end.setDate(end.getDate() + 6);
      end.setHours(23, 59, 59, 999);
      return { from: start.toISOString(), to: end.toISOString() };
    }
    // month
    const start = new Date(date.getFullYear(), date.getMonth(), 1, 0, 0, 0, 0);
    const end = new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59, 999);
    return { from: start.toISOString(), to: end.toISOString() };
  }, [view, date]);

  // Pull ALL appointments in the date range (no status filter) so the per-tab
  // counts and the filtered list both come from the same source.
  const { data, isLoading } = useAppointments({
    from,
    to,
    q: search || undefined,
    dentistId: dentistFilter || undefined,
  });

  const rows = useMemo(() => data?.data ?? [], [data?.data]);

  // Status counts (across all rows returned by the query).
  const counts = useMemo(() => {
    const result: Record<StatusTab, number> = {
      all: rows.length,
      scheduled: 0,
      checked_in: 0,
      completed: 0,
      cancelled: 0,
    };
    rows.forEach((r) => {
      result[statusToTabBucket(r.status)] += 1;
    });
    return result;
  }, [rows]);

  const visibleRows = useMemo(() => {
    let result = rows;
    if (tab !== 'all') {
      result = result.filter((r) => statusToTabBucket(r.status) === tab);
    }
    if (typeFilter !== 'all') {
      result = result.filter((r) => r.appointmentType === typeFilter);
    }
    if (sourceFilter !== 'all') {
      result = result.filter((r) => r.source === sourceFilter);
    }
    return result;
  }, [rows, tab, typeFilter, sourceFilter]);

  // Client-side pagination on the filtered result.
  const totalPages = Math.max(1, Math.ceil(visibleRows.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const paginatedRows = useMemo(
    () => visibleRows.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE),
    [visibleRows, safePage],
  );

  const handleExportCsv = () => {
    if (visibleRows.length === 0) {
      notify.warning('Không có lịch hẹn nào để xuất.');
      return;
    }
    const today = new Date().toISOString().slice(0, 10);
    const filename = `lich-hen_${today}_${visibleRows.length}dong`;
    exportCsv(filename, visibleRows, CSV_COLUMNS);
    notify.success(`Đã xuất ${visibleRows.length} lịch hẹn ra CSV.`);
  };

  const handleShiftDate = (delta: number) => {
    const d = new Date(date);
    if (view === 'day') d.setDate(d.getDate() + delta);
    else if (view === 'week') d.setDate(d.getDate() + delta * 7);
    else d.setMonth(d.getMonth() + delta);
    setDate(d);
  };

  const handleToday = () => {
    setDate(new Date());
  };

  const isToday = isSameDay(date, new Date());

  const renderHeaderLabel = () => {
    if (view === 'day') {
      return `${getWeekdayLabel(date)}, Ngày ${formatDate(date, 'dd/MM/yyyy')}`;
    }
    if (view === 'week') {
      const start = new Date(date);
      const day = start.getDay() || 7;
      start.setDate(start.getDate() - (day - 1));
      const end = new Date(start);
      end.setDate(end.getDate() + 6);
      return `Tuần ${formatDate(start, 'dd/MM')} – ${formatDate(end, 'dd/MM/yyyy')}`;
    }
    return `Tháng ${formatDate(date, 'MM/yyyy')}`;
  };

  return (
    <div>
      <PageHeader
        title="Lịch hẹn"
        description="Quản lý lịch hẹn bệnh nhân: xem theo ngày/tuần/tháng, check-in, đổi lịch và no-show."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              leftIcon={<Download className="h-4 w-4" />}
              onClick={handleExportCsv}
            >
              Xuất CSV
            </Button>
            <PermissionGuard permission="appointment.create">
              <Button leftIcon={<Plus className="h-4 w-4" />} onClick={() => setCreateOpen(true)}>
                Tạo lịch hẹn
              </Button>
            </PermissionGuard>
          </div>
        }
      />

      <Card bodyClassName="space-y-4">
        {/* Toolbar */}
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleShiftDate(-1)}
              aria-label="Trước"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              variant={isToday ? 'secondary' : 'outline'}
              size="sm"
              onClick={handleToday}
              disabled={isToday}
            >
              Hôm nay
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleShiftDate(1)}
              aria-label="Sau"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
            <div className="ml-3 hidden items-center gap-2 sm:flex">
              <span className="text-sm font-medium text-gray-900">{renderHeaderLabel()}</span>
              <input
                type="date"
                value={isoDateOnly(date)}
                onChange={(e) => {
                  if (e.target.value) setDate(new Date(e.target.value));
                }}
                className="rounded-md border border-gray-200 bg-white px-2 py-1 text-xs shadow-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex rounded-md border border-gray-200 bg-white p-0.5 shadow-sm">
              {VIEW_OPTIONS.map((v) => (
                <button
                  key={v.id}
                  type="button"
                  onClick={() => setView(v.id)}
                  className={cn(
                    'rounded-md px-3 py-1 text-xs font-medium transition-colors',
                    view === v.id
                      ? 'bg-primary-600 text-white shadow-sm'
                      : 'text-gray-600 hover:text-gray-900',
                  )}
                >
                  {v.label}
                </button>
              ))}
            </div>
            <Select
              value={dentistFilter}
              onChange={(e) => setDentistFilter(e.target.value)}
              options={[
                { value: '', label: 'Tất cả bác sĩ' },
                ...((dentists ?? []).map((d) => ({ value: d.id, label: d.fullName }))),
              ]}
              className="min-w-[160px]"
            />
            <Select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value as AppointmentType | 'all')}
              options={APPOINTMENT_TYPE_OPTIONS}
              className="min-w-[140px]"
            />
            <Select
              value={sourceFilter}
              onChange={(e) => setSourceFilter(e.target.value as AppointmentSource | 'all')}
              options={SOURCE_OPTIONS}
              className="min-w-[140px]"
            />
          </div>
        </div>

        {/* Status tabs */}
        <div className="flex flex-wrap items-center gap-2 border-b border-gray-200">
          {STATUS_TABS.map((t) => {
            const count = counts[t.id];
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className={cn(
                  'relative -mb-px flex items-center gap-2 border-b-2 px-3 py-2 text-sm font-medium transition-colors',
                  active
                    ? 'border-primary-600 text-primary-700'
                    : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700',
                )}
              >
                {t.label}
                <span
                  className={cn(
                    'rounded-full px-1.5 py-0.5 text-xs',
                    active ? 'bg-primary-50 text-primary-700' : 'bg-gray-100 text-gray-600',
                  )}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        {/* Search */}
        <div className="flex flex-col gap-2 sm:flex-row">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <Input
              placeholder="Tìm tên, mã BN, số điện thoại..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              leftAddon={undefined}
              className="pl-9"
            />
          </div>
        </div>

        {/* Table */}
        {isLoading ? (
          <PageLoader />
        ) : visibleRows.length === 0 ? (
          <EmptyState
            title="Chưa có lịch hẹn nào"
            description={
              tab === 'all'
                ? 'Chưa có lịch hẹn trong khoảng thời gian này. Hãy tạo lịch hẹn mới.'
                : 'Không có lịch hẹn nào ở trạng thái này.'
            }
            action={
              <PermissionGuard permission="appointment.create">
                <Button leftIcon={<Plus className="h-4 w-4" />} onClick={() => setCreateOpen(true)}>
                  Tạo lịch hẹn
                </Button>
              </PermissionGuard>
            }
          />
        ) : (
          <div className="overflow-x-auto rounded-lg border border-gray-200">
            <table className="table-base">
              <thead>
                <tr>
                  <th className="w-12">STT</th>
                  <th className="w-28">Bắt đầu</th>
                  <th>Bệnh nhân</th>
                  <th className="w-32">SĐT</th>
                  <th>Bác sĩ</th>
                  <th>Dịch vụ</th>
                  <th className="w-24">Thời lượng</th>
                  <th className="w-32">Trạng thái</th>
                  <th className="w-20">Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {paginatedRows.map((r, idx) => (
                  <tr
                    key={r.id}
                    onClick={() => setDetailId(r.id)}
                    className="cursor-pointer"
                  >
                    <td className="text-xs text-gray-500">
                      {(safePage - 1) * PAGE_SIZE + idx + 1}
                    </td>
                    <td>
                      <p className="font-medium text-gray-900">{formatTimeOnly(r.startsAt)}</p>
                      <p className="text-xs text-gray-500">
                        {getWeekdayLabel(r.startsAt)} • {formatDate(r.startsAt, 'dd/MM')}
                      </p>
                    </td>
                    <td>
                      <p className="font-medium text-gray-900">{r.patientName}</p>
                      <p className="text-xs text-gray-500">{r.patientCode}</p>
                    </td>
                    <td className="font-mono text-xs text-gray-700">
                      {formatPhone(r.patientPhone ?? null)}
                    </td>
                    <td className="text-sm text-gray-700">{r.dentistName}</td>
                    <td>
                      <p className="text-sm text-gray-900">{r.reason ?? '—'}</p>
                      {r.chiefComplaint && (
                        <p className="text-xs text-gray-500">{r.chiefComplaint}</p>
                      )}
                    </td>
                    <td className="text-sm text-gray-700">{r.durationMinutes} phút</td>
                    <td>
                      <AppointmentStatusBadge status={r.status} />
                    </td>
                    <td>
                      <button
                        type="button"
                        className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-primary-700 hover:bg-primary-50"
                        onClick={(e) => {
                          e.stopPropagation();
                          setDetailId(r.id);
                        }}
                      >
                        <Eye className="h-3.5 w-3.5" />
                        Xem
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="flex items-center justify-between border-t border-gray-100 pt-3 text-xs text-gray-500">
          <span>
            Hiển thị {visibleRows.length} / {rows.length} lịch hẹn
            {(typeFilter !== 'all' || sourceFilter !== 'all' || dentistFilter) && (
              <span className="ml-2 italic">(đang lọc)</span>
            )}
          </span>
          {isLoading && (
            <span className="inline-flex items-center gap-1.5 text-primary-600">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Đang đồng bộ...
            </span>
          )}
        </div>

        {visibleRows.length > PAGE_SIZE && (
          <Pagination
            currentPage={safePage}
            totalPages={totalPages}
            totalItems={visibleRows.length}
            pageSize={PAGE_SIZE}
            onPageChange={setPage}
          />
        )}
      </Card>

      <AppointmentFormModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        defaultDate={isoDateOnly(date)}
      />

      <AppointmentFormModal
        open={!!editing}
        onClose={() => setEditing(null)}
        appointment={editing}
      />

      <AppointmentDetailDrawer
        appointmentId={detailId}
        onClose={() => setDetailId(null)}
        onEdit={(a) => setEditing(a)}
      />
    </div>
  );
}
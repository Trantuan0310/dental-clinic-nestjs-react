import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { addDays, addMonths, addWeeks, endOfMonth, endOfWeek, format, startOfMonth, startOfWeek } from 'date-fns';
import {
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  Download,
  Eye,
  Loader2,
  Plus,
  Search,
  UserRoundPlus,
} from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card } from '@/components/ui/Card';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { EmptyState } from '@/components/ui/EmptyState';
import { PageLoader } from '@/components/ui/Loading';
import { Pagination } from '@/components/ui/Pagination';
import { AppointmentStatusBadge } from '@/components/ui/StatusBadge';
import { PermissionGuard } from '@/components/PermissionGuard';
import {
  LIST_ALL_LIMIT,
  useAppointments,
  useDentistOptions,
} from './appointmentApi';
import { AppointmentFormModal } from './AppointmentFormModal';
import { AppointmentDetailDrawer } from './AppointmentDetailDrawer';
import { WalkInModal } from './WalkInModal';
import { isOverdueNotArrived, useNow } from './liveStatus';
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
import { clinicToday, clinicWallClock } from '@/lib/clinicTime';
import { exportCsv, type CsvColumn } from '@/lib/csv';
import { notify } from '@/components/ui/Toast';
import { useTranslation } from 'react-i18next';

const PAGE_SIZE = 20;

const APPOINTMENT_TYPE_KEYS: Record<AppointmentType | 'all', string> = {
  all: 'allTypes', consultation: 'typeConsultation', treatment: 'typeTreatment', follow_up: 'typeFollowUp',
};
const SOURCE_KEYS: Record<AppointmentSource | 'all', string> = {
  all: 'allSources', walk_in: 'sourceWalkIn', phone: 'sourcePhone', online: 'sourceOnline', returning: 'sourceReturning',
};

type StatusTab =
  | 'all'
  | 'scheduled'
  | 'checked_in'
  | 'completed'
  | 'cancelled';

const STATUS_TAB_KEYS: Record<StatusTab, string> = {
  all: 'tabAll', scheduled: 'tabNotArrived', checked_in: 'tabArrived', completed: 'statusCompleted', cancelled: 'tabCancelled',
};

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
// so the two stay in sync. A visit in progress has arrived ("Đã đến").
function statusToTabBucket(status: AppointmentStatus): StatusTab {
  if (status === 'scheduled' || status === 'confirmed') return 'scheduled';
  if (status === 'checked_in' || status === 'in_progress') return 'checked_in';
  if (status === 'completed') return 'completed';
  return 'cancelled'; // cancelled | no_show | left
}

export default function AppointmentsListPage() {
  const { t } = useTranslation();
  const csvColumns: CsvColumn<Appointment>[] = [
    { header: t('uiScheduling.appointmentId'), accessor: (r) => r.id },
    { header: t('uiScheduling.appointmentDate'), accessor: (r) => formatDate(r.startsAt, 'dd/MM/yyyy') },
    { header: t('uiScheduling.startTime'), accessor: (r) => formatTimeOnly(r.startsAt) },
    { header: t('uiScheduling.endTime'), accessor: (r) => formatTimeOnly(r.endsAt) },
    { header: t('uiScheduling.totalDuration'), accessor: (r) => r.durationMinutes },
    { header: t('uiScheduling.patientCode'), accessor: (r) => r.patientCode },
    { header: t('uiScheduling.patientName'), accessor: (r) => r.patientName },
    { header: t('uiScheduling.phoneNumber'), accessor: (r) => r.patientPhone ?? '' },
    { header: t('uiScheduling.dentist'), accessor: (r) => r.dentistName },
    { header: t('uiScheduling.appointmentType'), accessor: (r) => r.appointmentType ? t(`uiScheduling.${APPOINTMENT_TYPE_KEYS[r.appointmentType]}`) : '' },
    { header: t('uiScheduling.source'), accessor: (r) => r.source ? t(`uiScheduling.${SOURCE_KEYS[r.source]}`) : '' },
    { header: t('uiScheduling.reason'), accessor: (r) => r.reason ?? '' },
    { header: t('uiScheduling.symptoms'), accessor: (r) => r.chiefComplaint ?? '' },
    { header: t('uiScheduling.status'), accessor: (r) => t(`uiScheduling.status${r.status.replace(/(^|_)([a-z])/g, (_, __, letter: string) => letter.toUpperCase())}`) },
    { header: t('uiScheduling.checkInAt'), accessor: (r) => r.checkInAt ? formatDateTime(r.checkInAt) : '' },
  ];
  const VIEW_OPTIONS: { id: AppointmentViewMode; label: string }[] = [
    { id: 'day', label: t('uiScheduling.day') },
    { id: 'week', label: t('uiScheduling.week') },
    { id: 'month', label: t('uiScheduling.month') },
  ];
  const statusTabs: { id: StatusTab; label: string }[] = (Object.keys(STATUS_TAB_KEYS) as StatusTab[]).map((id) => ({
    id, label: t(`uiScheduling.${STATUS_TAB_KEYS[id]}`),
  }));
  const appointmentTypeOptions = (Object.keys(APPOINTMENT_TYPE_KEYS) as (AppointmentType | 'all')[]).map((value) => ({
    value, label: t(`uiScheduling.${APPOINTMENT_TYPE_KEYS[value]}`),
  }));
  const sourceOptions = (Object.keys(SOURCE_KEYS) as (AppointmentSource | 'all')[]).map((value) => ({
    value, label: t(`uiScheduling.${SOURCE_KEYS[value]}`),
  }));
  const [view, setView] = useState<AppointmentViewMode>('day');
  // A clinic date, whatever the browser's time zone.
  const [date, setDate] = useState<Date>(() => clinicWallClock());
  const [tab, setTab] = useState<StatusTab>('all');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [dentistFilter, setDentistFilter] = useState<string>('');
  const [typeFilter, setTypeFilter] = useState<AppointmentType | 'all'>('all');
  const [sourceFilter, setSourceFilter] = useState<AppointmentSource | 'all'>('all');
  const [page, setPage] = useState(1);
  const [createOpen, setCreateOpen] = useState(false);
  const [walkInOpen, setWalkInOpen] = useState(false);
  const [editing, setEditing] = useState<Appointment | null>(null);
  // Arriving with ?open=<id> (e.g. from the command palette's search results)
  // opens that appointment's detail drawer directly.
  const [searchParams] = useSearchParams();
  const [detailId, setDetailId] = useState<string | null>(searchParams.get('open'));

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

  // Date range as clinic dates ("yyyy-MM-dd"), like the calendar page: the
  // API reads them as whole clinic days. `date` is a clinic wall-clock Date,
  // so converting its local midnight to an ISO instant shifted the range in
  // any browser not set to UTC+7.
  const { from, to } = useMemo(() => {
    const [start, end] =
      view === 'day'
        ? [date, date]
        : view === 'week'
          ? [startOfWeek(date, { weekStartsOn: 1 }), endOfWeek(date, { weekStartsOn: 1 })]
          : [startOfMonth(date), endOfMonth(date)];
    return { from: format(start, 'yyyy-MM-dd'), to: format(end, 'yyyy-MM-dd') };
  }, [view, date]);

  // Pull ALL appointments in the date range (no status filter) so the per-tab
  // counts and the filtered list both come from the same source.
  const { data, isLoading, isError, refetch } = useAppointments({
    from,
    to,
    q: search || undefined,
    dentistId: dentistFilter || undefined,
  });

  const rows = useMemo(() => data?.data ?? [], [data?.data]);
  const now = useNow();

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
      notify.warning(t('uiScheduling.noAppointments'));
      return;
    }
    const today = clinicToday();
    const filename = `appointments_${today}_${visibleRows.length}_rows`;
    exportCsv(filename, visibleRows, csvColumns);
    notify.success(t('uiScheduling.exportedAppointments', { count: visibleRows.length }));
  };

  // addMonths clamps 31/01 to 28/02 (setMonth rolled it over to 03/03).
  const handleShiftDate = (delta: number) => {
    if (view === 'day') setDate(addDays(date, delta));
    else if (view === 'week') setDate(addWeeks(date, delta));
    else setDate(addMonths(date, delta));
  };

  const handleToday = () => {
    setDate(clinicWallClock());
  };

  const isToday = isSameDay(date, clinicWallClock());

  const renderHeaderLabel = () => {
    if (view === 'day') {
      return `${getWeekdayLabel(date)}, ${t('uiScheduling.day')} ${formatDate(date, 'dd/MM/yyyy')}`;
    }
    if (view === 'week') {
      const start = startOfWeek(date, { weekStartsOn: 1 });
      const end = endOfWeek(date, { weekStartsOn: 1 });
      return `${t('uiScheduling.week')} ${formatDate(start, 'dd/MM')} – ${formatDate(end, 'dd/MM/yyyy')}`;
    }
    return `${t('uiScheduling.month')} ${formatDate(date, 'MM/yyyy')}`;
  };

  return (
    <div>
      <PageHeader
        title={t('uiScheduling.appointmentsList')}
        description={t('uiScheduling.appointmentsListDescription')}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Link to="/appointments">
              <Button variant="outline">{t('uiScheduling.calendarView')}</Button>
            </Link>
            <Button
              variant="outline"
              leftIcon={<Download className="h-4 w-4" />}
              onClick={handleExportCsv}
            >
              {t('uiScheduling.exportCsv')}
            </Button>
            <PermissionGuard permission="appointment.check_in">
              <Button
                variant="outline"
                leftIcon={<UserRoundPlus className="h-4 w-4" />}
                onClick={() => setWalkInOpen(true)}
              >
                {t('uiScheduling.walkIn')}
              </Button>
            </PermissionGuard>
            <PermissionGuard permission="appointment.create">
              <Button leftIcon={<Plus className="h-4 w-4" />} onClick={() => setCreateOpen(true)}>
                {t('uiScheduling.createAppointment')}
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
              aria-label={t('uiScheduling.previous')}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              variant={isToday ? 'secondary' : 'outline'}
              size="sm"
              onClick={handleToday}
              disabled={isToday}
            >
              {t('uiScheduling.today')}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleShiftDate(1)}
              aria-label={t('uiScheduling.next')}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
            <div className="ml-3 hidden items-center gap-2 sm:flex">
              <span className="text-sm font-medium text-gray-900 dark:text-surface-100">{renderHeaderLabel()}</span>
              <input
                type="date"
                aria-label={t('uiScheduling.chooseDate')}
                value={isoDateOnly(date)}
                onChange={(e) => {
                  // "yyyy-MM-dd" as a local calendar date: new Date("2026-09-25")
                  // is UTC midnight, the day before west of UTC.
                  const [y, m, d] = e.target.value.split('-').map(Number);
                  if (y && m && d) setDate(new Date(y, m - 1, d));
                }}
                className="rounded-md border border-gray-200 bg-white px-2 py-1 text-xs shadow-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 dark:border-surface-700 dark:bg-surface-900 dark:text-surface-100"
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex rounded-md border border-gray-200 bg-white p-0.5 shadow-sm dark:border-surface-700 dark:bg-surface-900">
              {VIEW_OPTIONS.map((v) => (
                <button
                  key={v.id}
                  type="button"
                  onClick={() => setView(v.id)}
                  className={cn(
                    'rounded-md px-3 py-1 text-xs font-medium transition-colors',
                    view === v.id
                      ? 'bg-primary-600 text-white shadow-sm'
                      : 'text-gray-600 hover:text-gray-900 dark:text-surface-300 dark:hover:text-surface-50',
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
                { value: '', label: t('uiScheduling.allDentists') },
                ...((dentists ?? []).map((d) => ({ value: d.id, label: d.fullName }))),
              ]}
              className="min-w-[160px]"
            />
            <Select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value as AppointmentType | 'all')}
              options={appointmentTypeOptions}
              className="min-w-[140px]"
            />
            <Select
              value={sourceFilter}
              onChange={(e) => setSourceFilter(e.target.value as AppointmentSource | 'all')}
              options={sourceOptions}
              className="min-w-[140px]"
            />
          </div>
        </div>

        {/* Status tabs */}
        <div className="flex flex-wrap items-center gap-2 border-b border-gray-200">
          {statusTabs.map((statusTab) => {
            const count = counts[statusTab.id];
            const active = tab === statusTab.id;
            return (
              <button
                key={statusTab.id}
                type="button"
                onClick={() => setTab(statusTab.id)}
                className={cn(
                  'relative -mb-px flex items-center gap-2 border-b-2 px-3 py-2 text-sm font-medium transition-colors',
                  active
                    ? 'border-primary-600 text-primary-700'
                    : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700',
                )}
              >
                {statusTab.label}
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
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400 dark:text-surface-400" />
            <Input
              placeholder={t('uiScheduling.searchAppointments')}
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              leftAddon={undefined}
              className="pl-9"
            />
          </div>
        </div>

        {data?.pagination?.hasMore && (
          <Alert type="warning">
            {t('uiScheduling.moreAppointments', { count: LIST_ALL_LIMIT })}
          </Alert>
        )}

        {/* Table */}
        {isLoading ? (
          <PageLoader />
        ) : isError && visibleRows.length === 0 ? (
          <EmptyState
            icon={<AlertCircle className="h-10 w-10 text-red-400 dark:text-red-500" />}
            title={t('uiScheduling.cannotLoadAppointments')}
            description={t('uiScheduling.loadError')}
            action={{ label: t('uiScheduling.retry'), onClick: () => refetch() }}
          />
        ) : visibleRows.length === 0 ? (
          <EmptyState
            title={t('uiScheduling.noAppointments')}
            description={
              tab === 'all'
                ? t('uiScheduling.noAppointmentsInRange')
                : t('uiScheduling.noAppointmentsInStatus')
            }
            action={
              <PermissionGuard permission="appointment.create">
                <Button leftIcon={<Plus className="h-4 w-4" />} onClick={() => setCreateOpen(true)}>
                  {t('uiScheduling.createAppointment')}
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
                  <th className="w-28">{t('uiScheduling.start')}</th>
                  <th>{t('uiScheduling.patient')}</th>
                  <th className="w-32">{t('uiScheduling.phone')}</th>
                  <th>{t('uiScheduling.dentist')}</th>
                  <th>{t('uiScheduling.service')}</th>
                  <th className="w-24">{t('uiScheduling.duration')}</th>
                  <th className="w-32">{t('uiScheduling.status')}</th>
                  <th className="w-20">{t('uiScheduling.actions')}</th>
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
                  <p className="font-medium text-gray-900 dark:text-surface-100">{formatTimeOnly(r.startsAt)}</p>
                      <p className="text-xs text-gray-500">
                        {getWeekdayLabel(r.startsAt)} • {formatDate(r.startsAt, 'dd/MM')}
                      </p>
                    </td>
                    <td>
                      <p className="font-medium text-gray-900 dark:text-surface-100">
                        {r.patientName}
                        {r.patientDeleted && (
                          <span className="ml-1 text-xs font-normal text-gray-500 dark:text-surface-400">{t('uiScheduling.patientDeleted')}</span>
                        )}
                      </p>
                      <p className="text-xs text-gray-500">{r.patientCode}</p>
                    </td>
                    <td className="font-mono text-xs text-gray-700">
                      {formatPhone(r.patientPhone ?? null)}
                    </td>
                    <td className="text-sm text-gray-700">{r.dentistName}</td>
                    <td>
                      <p className="text-sm text-gray-900 dark:text-surface-100">{r.reason ?? '—'}</p>
                      {r.chiefComplaint && (
                        <p className="text-xs text-gray-500">{r.chiefComplaint}</p>
                      )}
                    </td>
                    <td className="text-sm text-gray-700 dark:text-surface-200">{t('uiScheduling.minutesValue', { count: r.durationMinutes })}</td>
                    <td>
                      <AppointmentStatusBadge
                        status={r.status}
                        overdue={isOverdueNotArrived(r, now)}
                      />
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
                        {t('uiScheduling.view')}
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
            {t('uiScheduling.appointmentListCount', { visible: visibleRows.length, total: rows.length })}
            {(typeFilter !== 'all' || sourceFilter !== 'all' || dentistFilter) && (
              <span className="ml-2 italic">{t('uiScheduling.filtering')}</span>
            )}
          </span>
          {isLoading && (
            <span className="inline-flex items-center gap-1.5 text-primary-600">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> {t('uiScheduling.syncing')}
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

      <WalkInModal
        open={walkInOpen}
        onClose={() => setWalkInOpen(false)}
        onCreated={(id) => setDetailId(id)}
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

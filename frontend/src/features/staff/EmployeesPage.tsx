import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Plus, Pencil, KeyRound, Stethoscope, UserX, RotateCcw } from 'lucide-react';
import {
  Alert,
  Badge,
  Button,
  Card,
  Checkbox,
  DatePicker,
  Input,
  Modal,
  Pagination,
  Select,
  Textarea,
} from '@/components/ui';
import { PageHeader } from '@/components/ui/PageHeader';
import { notify } from '@/components/ui/Toast';
import { PermissionGuard } from '@/components/PermissionGuard';
import { useAuthStore } from '@/stores/authStore';
import { formatDate } from '@/lib/format';
import { clinicToday } from '@/lib/clinicTime';
import { staffApi, useEmployees, useLinkableAccounts, useStaffMutation } from './staffApi';
import { TemporaryPasswordDialog } from '@/features/admin/TemporaryPasswordDialog';
import { DentistProfileForm } from './DentistProfileForm';
import { BlockingAppointmentsList } from './BlockingAppointmentsList';
import {
  EMPLOYEE_TYPE_LABEL,
  EMPLOYMENT_STATUS_LABEL,
  EMPLOYMENT_STATUS_VARIANT,
  GENDER_LABEL,
  blockingAppointments,
  staffErrorMessage,
} from './labels';
import type {
  BlockingAppointment,
  Employee,
  EmployeeFilters,
  EmployeePayload,
  EmployeeType,
  EmploymentStatus,
  Gender,
} from './types';

const TYPE_OPTIONS = Object.entries(EMPLOYEE_TYPE_LABEL).map(([value, label]) => ({ value, label }));
const STATUS_OPTIONS = Object.entries(EMPLOYMENT_STATUS_LABEL).map(([value, label]) => ({ value, label }));
const GENDER_OPTIONS = Object.entries(GENDER_LABEL).map(([value, label]) => ({ value, label }));

type Dialog =
  | { kind: 'create' }
  | { kind: 'edit'; employee: Employee }
  | { kind: 'account'; employee: Employee }
  | { kind: 'dentist'; employee: Employee }
  | { kind: 'terminate'; employee: Employee }
  | { kind: 'reinstate'; employee: Employee }
  | { kind: 'onLeave'; employee: Employee; appointments: BlockingAppointment[] };

type LinkPayload = { userId: string } | { loginEmail: string };

function EmployeeForm({
  employee,
  submitting,
  onCancel,
  onSubmit,
}: {
  employee?: Employee;
  submitting: boolean;
  onCancel: () => void;
  onSubmit: (payload: EmployeePayload) => void;
}) {
  const { t } = useTranslation();
  const [form, setForm] = useState({
    fullName: employee?.fullName ?? '',
    employeeType: employee?.employeeType ?? ('ASSISTANT' as EmployeeType),
    dob: employee?.dob ?? '',
    gender: employee?.gender ?? '',
    phone: employee?.phone ?? '',
    email: employee?.email ?? '',
    address: employee?.address ?? '',
    hireDate: employee?.hireDate ?? clinicToday(),
    employmentStatus: (employee?.employmentStatus === 'ON_LEAVE' ? 'ON_LEAVE' : 'ACTIVE') as
      | 'ACTIVE'
      | 'ON_LEAVE',
    notes: employee?.notes ?? '',
  });
  const hasDentistProfile = Boolean(employee?.dentistProfile);

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit({
          fullName: form.fullName.trim(),
          employeeType: form.employeeType,
          dob: form.dob || null,
          gender: (form.gender || null) as Gender | null,
          phone: form.phone.trim() || null,
          email: form.email.trim() || null,
          address: form.address.trim() || null,
          hireDate: form.hireDate,
          notes: form.notes.trim() || null,
          ...(employee ? { employmentStatus: form.employmentStatus } : {}),
        });
      }}
    >
      <Input
        label={t('uiWorkforce.fullName')}
        required
        minLength={2}
        maxLength={200}
        value={form.fullName}
        onChange={(e) => setForm({ ...form, fullName: e.target.value })}
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <Select
          label={t('uiWorkforce.employeeTypeLabel')}
          value={form.employeeType}
          onChange={(e) => setForm({ ...form, employeeType: e.target.value as EmployeeType })}
          options={TYPE_OPTIONS.map((option) => ({ ...option, label: t(`uiWorkforce.employeeType_${option.value}`) }))}
          disabled={hasDentistProfile}
          hint={hasDentistProfile ? t('uiWorkforce.dentistProfileExists') : undefined}
        />
        <DatePicker
          label={t('uiWorkforce.hireDate')}
          required
          value={form.hireDate}
          onChange={(value) => setForm({ ...form, hireDate: value })}
        />
        <DatePicker
          label={t('uiWorkforce.dateOfBirth')}
          value={form.dob}
          onChange={(value) => setForm({ ...form, dob: value })}
        />
        <Select
          label={t('uiWorkforce.gender')}
          value={form.gender}
          onChange={(e) => setForm({ ...form, gender: e.target.value })}
          options={GENDER_OPTIONS.map((option) => ({ ...option, label: t(`uiWorkforce.gender_${option.value}`) }))}
          placeholder={t('uiWorkforce.noSelection')}
        />
        <Input
          label={t('uiWorkforce.phone')}
          type="tel"
          value={form.phone}
          onChange={(e) => setForm({ ...form, phone: e.target.value })}
          maxLength={20}
        />
        <Input
          label={t('uiWorkforce.contactEmail')}
          type="email"
          value={form.email}
          onChange={(e) => setForm({ ...form, email: e.target.value })}
          hint={t('uiWorkforce.differentFromLoginEmail')}
        />
      </div>
      <Input
        label={t('uiWorkforce.address')}
        value={form.address}
        onChange={(e) => setForm({ ...form, address: e.target.value })}
        maxLength={500}
      />
      {employee && (
        <Select
          label={t('uiWorkforce.employmentStatus')}
          value={form.employmentStatus}
          onChange={(e) =>
            setForm({ ...form, employmentStatus: e.target.value as 'ACTIVE' | 'ON_LEAVE' })
          }
          options={[
            { value: 'ACTIVE', label: t('uiWorkforce.employmentActive') },
            { value: 'ON_LEAVE', label: t('uiWorkforce.employmentOnLeave') },
          ]}
          hint={t('uiWorkforce.terminateFromListHint')}
        />
      )}
      <Textarea
        label={t('uiWorkforce.notes')}
        rows={2}
        value={form.notes}
        onChange={(e) => setForm({ ...form, notes: e.target.value })}
      />
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onCancel}>
          {t('uiWorkforce.cancel')}
        </Button>
        <Button type="submit" isLoading={submitting}>
          {employee ? t('uiWorkforce.save') : t('uiWorkforce.createEmployee')}
        </Button>
      </div>
    </form>
  );
}

function LinkAccountForm({
  employee,
  submitting,
  onCancel,
  onSubmit,
}: {
  employee: Employee;
  submitting: boolean;
  onCancel: () => void;
  onSubmit: (payload: LinkPayload) => void;
}) {
  const { t } = useTranslation();
  const [mode, setMode] = useState<'create' | 'existing'>('create');
  const [loginEmail, setLoginEmail] = useState(employee.email ?? '');
  const [userId, setUserId] = useState('');
  const { data: accounts = [], isLoading: loadingAccounts } = useLinkableAccounts(mode === 'existing');
  const role =
    employee.employeeType === 'DENTIST'
      ? t('uiWorkforce.employeeType_DENTIST')
      : employee.employeeType === 'RECEPTIONIST'
        ? t('uiWorkforce.employeeType_RECEPTIONIST')
        : null;
  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(
          mode === 'create' ? { loginEmail: loginEmail.trim().toLowerCase() } : { userId },
        );
      }}
    >
      <div className="flex gap-2" role="group" aria-label={t('uiWorkforce.accountLinkMethod')}>
        <Button
          type="button"
          size="sm"
          variant={mode === 'create' ? 'primary' : 'outline'}
          aria-pressed={mode === 'create'}
          onClick={() => setMode('create')}
        >
          {t('uiWorkforce.createNewAccount')}
        </Button>
        <Button
          type="button"
          size="sm"
          variant={mode === 'existing' ? 'primary' : 'outline'}
          aria-pressed={mode === 'existing'}
          onClick={() => setMode('existing')}
        >
          {t('uiWorkforce.attachExistingAccount')}
        </Button>
      </div>
      {mode === 'create' ? (
        <>
          <Input
            label={t('uiWorkforce.loginEmail')}
            type="email"
            required
            value={loginEmail}
            onChange={(e) => setLoginEmail(e.target.value)}
          />
          <p className="text-sm text-gray-500 dark:text-surface-400">
            {t('uiWorkforce.accountActivationInvite')}{' '}
            {role
              ? t('uiWorkforce.assignedRole', { role })
              : t('uiWorkforce.assignRoleOnUsersPage')}
          </p>
        </>
      ) : (
        <>
          <Select
            label={t('uiWorkforce.linkedAccount')}
            required
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
            placeholder={loadingAccounts ? t('common.loading') : t('uiWorkforce.selectUnlinkedAccount')}
            options={accounts.map((a) => ({
              value: a.id,
              label: `${a.fullName} · ${a.email}${a.status === 'PENDING_SETUP' ? ` (${t('uiWorkforce.pendingSetup')})` : ''}`,
            }))}
          />
          <p className="text-sm text-gray-500 dark:text-surface-400">
            {t('uiWorkforce.linkableAccountsDescription')}
          </p>
          {!loadingAccounts && accounts.length === 0 && (
            <p className="text-sm text-amber-700">{t('uiWorkforce.noUnlinkedAccounts')}</p>
          )}
        </>
      )}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onCancel}>
          {t('uiWorkforce.cancel')}
        </Button>
        <Button type="submit" isLoading={submitting} disabled={mode === 'existing' && !userId}>
          {mode === 'create' ? t('uiWorkforce.createAccount') : t('uiWorkforce.attachAccount')}
        </Button>
      </div>
    </form>
  );
}

function TerminateForm({
  employee,
  submitting,
  blocking,
  onCancel,
  onSubmit,
}: {
  employee: Employee;
  submitting: boolean;
  blocking: BlockingAppointment[] | null;
  onCancel: () => void;
  onSubmit: (payload: { reason: string; terminationDate: string }) => void;
}) {
  const { t } = useTranslation();
  const [reason, setReason] = useState('');
  const today = clinicToday();
  const [terminationDate, setTerminationDate] = useState(today);
  // A5-12: a date ahead is a plan — the account stays open until then.
  const planned = terminationDate > today;
  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit({ reason: reason.trim(), terminationDate });
      }}
    >
      <p className="text-sm text-gray-600 dark:text-surface-300">
        {planned
          ? t(employee.dentistProfile ? 'uiWorkforce.plannedTerminationDentist' : 'uiWorkforce.plannedTermination', { date: formatDate(terminationDate) })
          : employee.account
            ? t('uiWorkforce.terminateAccountDescription')
            : t('uiWorkforce.noEmployeeAccount')}
        {!planned && employee.dentistProfile && ` ${t('uiWorkforce.dentistProfileInactive')}`}
      </p>
      {blocking && <BlockingAppointmentsList appointments={blocking} />}
      <DatePicker
        label={t('uiWorkforce.terminationDate')}
        required
        min={employee.hireDate}
        value={terminationDate}
        onChange={setTerminationDate}
      />
      <Textarea
        label={t('uiWorkforce.reason')}
        required
        minLength={5}
        maxLength={500}
        rows={3}
        value={reason}
        onChange={(e) => setReason(e.target.value)}
      />
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onCancel}>
          {t('uiWorkforce.cancel')}
        </Button>
        <Button type="submit" variant="danger" isLoading={submitting}>
          {t('uiWorkforce.terminate')}
        </Button>
      </div>
    </form>
  );
}

function ReinstateForm({
  employee,
  submitting,
  onCancel,
  onSubmit,
}: {
  employee: Employee;
  submitting: boolean;
  onCancel: () => void;
  onSubmit: (payload: { reason?: string; reactivateAccount: boolean }) => void;
}) {
  const { t } = useTranslation();
  const [reason, setReason] = useState('');
  // Reopening a login (old password, old roles) is a user-management right.
  const canReactivate = useAuthStore((s) => s.hasPermission('user.deactivate'));
  const [reactivateAccount, setReactivateAccount] = useState(canReactivate);
  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit({ reason: reason.trim() || undefined, reactivateAccount: canReactivate && reactivateAccount });
      }}
    >
      <p className="text-sm text-gray-600 dark:text-surface-300">
        {t('uiWorkforce.reinstateDescription')}
        {employee.dentistProfile &&
          ` ${t('uiWorkforce.reinstateDentistNote')}`}
      </p>
      {employee.account &&
        (canReactivate ? (
          <Checkbox
            checked={reactivateAccount}
            onChange={setReactivateAccount}
            label={t('uiWorkforce.reactivateEmployeeAccount', { email: employee.account.email })}
          />
        ) : (
          <p className="text-sm text-amber-700">
            {t('uiWorkforce.accountStillDeactivated', { email: employee.account.email })}
          </p>
        ))}
      <Textarea
        label={t('uiWorkforce.reasonOptionalUser')}
        maxLength={500}
        rows={2}
        value={reason}
        onChange={(e) => setReason(e.target.value)}
      />
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onCancel}>
          {t('uiWorkforce.cancel')}
        </Button>
        <Button type="submit" isLoading={submitting}>
          {t('uiWorkforce.reinstate')}
        </Button>
      </div>
    </form>
  );
}

export default function EmployeesPage() {
  const { t } = useTranslation();
  const [filters, setFilters] = useState<EmployeeFilters>({ page: 1, pageSize: 20 });
  const [search, setSearch] = useState('');
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [blocking, setBlocking] = useState<BlockingAppointment[] | null>(null);
  const [tempPasswordFor, setTempPasswordFor] = useState<{ id: string; email: string } | null>(null);
  const { data, isLoading, isError, refetch } = useEmployees(filters);

  const close = () => {
    setDialog(null);
    setBlocking(null);
  };
  const onError = (fallback: string) => (error: unknown) => {
    const bookings = blockingAppointments(error);
    if (bookings) setBlocking(bookings);
    notify.error(staffErrorMessage(error, fallback));
  };

  const create = useStaffMutation(staffApi.createEmployee);
  const update = useStaffMutation((v: { id: string; payload: EmployeePayload }) =>
    staffApi.updateEmployee(v.id, v.payload),
  );
  const link = useStaffMutation((v: { id: string; payload: LinkPayload }) =>
    staffApi.linkAccount(v.id, v.payload),
  );
  const reinstate = useStaffMutation(
    (v: { id: string; payload: { reason?: string; reactivateAccount: boolean } }) =>
      staffApi.reinstateEmployee(v.id, v.payload),
  );
  const makeDentist = useStaffMutation(
    (v: { id: string; payload: Parameters<typeof staffApi.createDentistProfile>[1] }) =>
      staffApi.createDentistProfile(v.id, v.payload),
  );
  const terminate = useStaffMutation(
    (v: { id: string; payload: { reason: string; terminationDate: string } }) =>
      staffApi.terminateEmployee(v.id, v.payload),
  );

  const rows = data?.data ?? [];

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('uiWorkforce.employees')}
        description={t('uiWorkforce.employeeDescription')}
        actions={
          <PermissionGuard permission="employee.create">
            <Button onClick={() => setDialog({ kind: 'create' })}>
              <Plus className="h-4 w-4" /> {t('uiWorkforce.addEmployee')}
            </Button>
          </PermissionGuard>
        }
      />

      <Card noPadding className="p-4">
        <form
          className="flex flex-wrap items-end gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            setFilters({ ...filters, q: search.trim() || undefined, page: 1 });
          }}
        >
          <div className="min-w-[200px] flex-1">
            <Input
              aria-label={t('uiWorkforce.searchEmployees')}
              placeholder={t('uiWorkforce.searchEmployees')}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Select
            aria-label={t('uiWorkforce.filterByEmployeeType')}
            value={filters.type ?? ''}
            onChange={(e) =>
              setFilters({ ...filters, type: (e.target.value || undefined) as EmployeeType, page: 1 })
            }
            options={[{ value: '', label: t('uiWorkforce.allTypes') }, ...TYPE_OPTIONS.map((option) => ({ ...option, label: t(`uiWorkforce.employeeType_${option.value}`) }))]}
          />
          <Select
            aria-label={t('uiWorkforce.filterByEmploymentStatus')}
            value={filters.status ?? ''}
            onChange={(e) =>
              setFilters({
                ...filters,
                status: (e.target.value || undefined) as EmploymentStatus,
                page: 1,
              })
            }
            options={[{ value: '', label: t('uiWorkforce.allStatusesEmployees') }, ...STATUS_OPTIONS.map((option) => ({ ...option, label: t(`uiWorkforce.employment_${option.value}`) }))]}
          />
          <Button type="submit" variant="outline">
            {t('uiWorkforce.search')}
          </Button>
        </form>
      </Card>

      <Card noPadding>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50 text-left text-gray-600 dark:border-surface-700 dark:bg-surface-800 dark:text-surface-300">
                <th className="px-4 py-3 font-medium">{t('uiWorkforce.code')}</th>
                <th className="px-4 py-3 font-medium">{t('uiWorkforce.fullName')}</th>
                <th className="px-4 py-3 font-medium">{t('uiWorkforce.type')}</th>
                <th className="px-4 py-3 font-medium">{t('uiWorkforce.contact')}</th>
                <th className="px-4 py-3 font-medium">{t('uiWorkforce.account')}</th>
                <th className="whitespace-nowrap px-4 py-3 font-medium">{t('uiWorkforce.status')}</th>
                <th className="px-4 py-3 text-right font-medium">{t('uiWorkforce.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-gray-400">
                    {t('uiCommon.table.loading')}
                  </td>
                </tr>
              ) : isError ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-red-500">
                    {t('uiWorkforce.employeesLoadError')}{' '}
                    <button type="button" className="underline" onClick={() => refetch()}>
                      {t('uiWorkforce.retry')}
                    </button>
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-gray-400">
                    {t('uiWorkforce.noEmployees')}
                  </td>
                </tr>
              ) : (
                rows.map((e) => {
                  const terminated = e.employmentStatus === 'TERMINATED';
                  return (
                    <tr
                      key={e.id}
                      className="border-b border-gray-100 last:border-0 dark:border-surface-800"
                    >
                      <td className="whitespace-nowrap px-4 py-3 font-mono text-xs">{e.code}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2 font-medium text-gray-900 dark:text-surface-100">
                          {e.dentistProfile && (
                            <span
                              className="h-2.5 w-2.5 shrink-0 rounded-full"
                              style={{ backgroundColor: e.dentistProfile.calendarColor }}
                              aria-hidden
                            />
                          )}
                          {e.dentistProfile && e.account ? (
                            <Link to={`/dentists/${e.account.id}`} className="hover:underline">
                              {e.fullName}
                            </Link>
                          ) : (
                            e.fullName
                          )}
                        </div>
                        <div className="text-xs text-gray-500">{t('uiWorkforce.hiredOn')} {formatDate(e.hireDate)}</div>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3">{t(`uiWorkforce.employeeType_${e.employeeType}`)}</td>
                      <td className="px-4 py-3 text-xs text-gray-600 dark:text-surface-300">
                        <div>{e.phone ?? '—'}</div>
                        <div>{e.email ?? ''}</div>
                      </td>
                      <td className="px-4 py-3 text-xs">
                        {e.account ? (
                          <>
                            <span className="text-gray-700 dark:text-surface-200">{e.account.email}</span>
                            {e.account.status !== 'ACTIVE' && (
                              <div className="text-amber-700">
                                {t(`uiWorkforce.${e.account.status === 'PENDING_SETUP' ? 'pendingSetup' : 'deactivated'}`)}
                              </div>
                            )}
                          </>
                        ) : (
                          <span className="text-gray-400">{t('uiWorkforce.noAccount')}</span>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3">
                        <Badge variant={EMPLOYMENT_STATUS_VARIANT[e.employmentStatus]}>
                          {t(`uiWorkforce.employment_${e.employmentStatus}`)}
                        </Badge>
                        {!terminated && e.terminationDate && (
                          <p className="mt-1 text-xs text-amber-700">{t('uiWorkforce.terminatedFrom')} {formatDate(e.terminationDate)}</p>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {(terminated || e.terminationDate) && (
                          <div className="flex justify-end">
                            <PermissionGuard permission="employee.deactivate" mode="hide">
                              <Button
                                size="sm"
                                variant="ghost"
                                aria-label={t('uiWorkforce.reinstateEmployeeNamed', { name: e.fullName })}
                                title={terminated ? t('uiWorkforce.reinstate') : t('uiWorkforce.cancelTerminationPlan')}
                                onClick={() => setDialog({ kind: 'reinstate', employee: e })}
                              >
                                <RotateCcw className="h-4 w-4" />
                              </Button>
                            </PermissionGuard>
                          </div>
                        )}
                        {!terminated && (
                          <div className="flex justify-end gap-1">
                            <PermissionGuard permission="employee.update" mode="hide">
                              <Button
                                size="sm"
                                variant="ghost"
                                aria-label={t('uiWorkforce.editEmployeeNamed', { name: e.fullName })}
                                onClick={() => setDialog({ kind: 'edit', employee: e })}
                              >
                                <Pencil className="h-4 w-4" />
                              </Button>
                            </PermissionGuard>
                            {!e.account && (
                              <PermissionGuard permission="employee.update" mode="hide">
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  aria-label={t('uiWorkforce.createAccountFor', { name: e.fullName })}
                                  onClick={() => setDialog({ kind: 'account', employee: e })}
                                >
                                  <KeyRound className="h-4 w-4" />
                                </Button>
                              </PermissionGuard>
                            )}
                            {e.account && !e.dentistProfile && e.employmentStatus === 'ACTIVE' && (
                              <PermissionGuard permission="dentist.create" mode="hide">
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  aria-label={t('uiWorkforce.createDentistProfileFor', { name: e.fullName })}
                                  onClick={() => setDialog({ kind: 'dentist', employee: e })}
                                >
                                  <Stethoscope className="h-4 w-4" />
                                </Button>
                              </PermissionGuard>
                            )}
                            <PermissionGuard permission="employee.deactivate" mode="hide">
                              <Button
                                size="sm"
                                variant="ghost"
                                aria-label={t('uiWorkforce.terminateEmployeeNamed', { name: e.fullName })}
                                onClick={() => setDialog({ kind: 'terminate', employee: e })}
                              >
                                <UserX className="h-4 w-4 text-red-500" />
                              </Button>
                            </PermissionGuard>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        {data && data.pagination.totalPages > 1 && (
          <div className="border-t border-gray-100 p-3 dark:border-surface-800">
            <Pagination
              currentPage={data.pagination.page}
              totalPages={data.pagination.totalPages}
              onPageChange={(page) => setFilters({ ...filters, page })}
            />
          </div>
        )}
      </Card>

      <Modal
        open={dialog?.kind === 'create' || dialog?.kind === 'edit'}
        onClose={close}
        title={dialog?.kind === 'edit' ? t('uiWorkforce.editEmployeeCode', { code: dialog.employee.code }) : t('uiWorkforce.addEmployee')}
        size="lg"
      >
        {(dialog?.kind === 'create' || dialog?.kind === 'edit') && (
          <EmployeeForm
            employee={dialog.kind === 'edit' ? dialog.employee : undefined}
            submitting={create.isPending || update.isPending}
            onCancel={close}
            onSubmit={(payload) =>
              dialog.kind === 'edit'
                ? update.mutate(
                    { id: dialog.employee.id, payload },
                    {
                      onSuccess: (updated) => {
                        notify.success(t('uiWorkforce.employeeUpdated'));
                        close();
                        // Going on leave keeps existing bookings: show them.
                        if (updated.futureAppointments?.length) {
                          setDialog({
                            kind: 'onLeave',
                            employee: updated,
                            appointments: updated.futureAppointments,
                          });
                        }
                      },
                      onError: onError(t('uiWorkforce.employeeUpdateError')),
                    },
                  )
                : create.mutate(payload, {
                    onSuccess: (created) => {
                      notify.success(t('uiWorkforce.employeeCreated', { code: created.code }));
                      close();
                    },
                    onError: onError(t('uiWorkforce.employeeCreateError')),
                  })
            }
          />
        )}
      </Modal>

      <Modal
        open={dialog?.kind === 'account'}
        onClose={close}
        title={dialog?.kind === 'account' ? t('uiWorkforce.loginAccountFor', { name: dialog.employee.fullName }) : ''}
      >
        {dialog?.kind === 'account' && (
          <LinkAccountForm
            employee={dialog.employee}
            submitting={link.isPending}
            onCancel={close}
            onSubmit={(payload) =>
              link.mutate(
                { id: dialog.employee.id, payload },
                {
                  onSuccess: (linked) => {
                    close();
                    if (linked.inviteSent === false && linked.account) {
                      // Never claim an invite that did not leave the server.
                      notify.warning(t('uiWorkforce.userCreatedEmailFailed'));
                      setTempPasswordFor({ id: linked.account.id, email: linked.account.email });
                    } else {
                      notify.success(
                        'userId' in payload
                          ? t('uiWorkforce.accountAttached')
                          : t('uiWorkforce.accountCreatedInvite'),
                      );
                    }
                  },
                  onError: onError(t('uiWorkforce.accountLinkError')),
                },
              )
            }
          />
        )}
      </Modal>

      <TemporaryPasswordDialog
        user={tempPasswordFor}
        emailFailed
        onClose={() => setTempPasswordFor(null)}
      />

      <Modal
        open={dialog?.kind === 'reinstate'}
        onClose={close}
        title={dialog?.kind === 'reinstate' ? t('uiWorkforce.reinstateEmployeeNamed', { name: dialog.employee.fullName }) : ''}
      >
        {dialog?.kind === 'reinstate' && (
          <ReinstateForm
            employee={dialog.employee}
            submitting={reinstate.isPending}
            onCancel={close}
            onSubmit={(payload) =>
              reinstate.mutate(
                { id: dialog.employee.id, payload },
                {
                  onSuccess: () => {
                    notify.success(
                      dialog.employee.dentistProfile
                        ? t('uiWorkforce.employeeReinstatedDentist')
                        : t('uiWorkforce.employeeReinstated'),
                    );
                    close();
                  },
                  onError: onError(t('uiWorkforce.employeeReinstateError')),
                },
              )
            }
          />
        )}
      </Modal>

      <Modal
        open={dialog?.kind === 'onLeave'}
        onClose={close}
        title={dialog?.kind === 'onLeave' ? t('uiWorkforce.employeeOnLeaveNamed', { name: dialog.employee.fullName }) : ''}
      >
        {dialog?.kind === 'onLeave' && (
          <div className="space-y-4">
            <Alert type="info">
              {t('uiWorkforce.onLeaveBookingWarning')}
            </Alert>
            <BlockingAppointmentsList appointments={dialog.appointments} />
            <div className="flex justify-end">
              <Button onClick={close}>{t('uiWorkforce.understood')}</Button>
            </div>
          </div>
        )}
      </Modal>

      <Modal
        open={dialog?.kind === 'dentist'}
        onClose={close}
        title={dialog?.kind === 'dentist' ? t('uiWorkforce.dentistProfileFor', { name: dialog.employee.fullName }) : ''}
        description={t('uiWorkforce.dentistProfileCreationDescription')}
        size="lg"
      >
        {dialog?.kind === 'dentist' && (
          <DentistProfileForm
            mode="admin"
            submitLabel={t('uiWorkforce.createDentistProfile')}
            submitting={makeDentist.isPending}
            onCancel={close}
            onSubmit={(payload) =>
              makeDentist.mutate(
                { id: dialog.employee.id, payload },
                {
                  onSuccess: () => {
                    notify.success(t('uiWorkforce.dentistProfileCreated'));
                    close();
                  },
                  onError: onError(t('uiWorkforce.dentistProfileCreateError')),
                },
              )
            }
          />
        )}
      </Modal>

      <Modal
        open={dialog?.kind === 'terminate'}
        onClose={close}
        title={dialog?.kind === 'terminate' ? t('uiWorkforce.terminateEmployeeNamed', { name: dialog.employee.fullName }) : ''}
      >
        {dialog?.kind === 'terminate' && (
          <TerminateForm
            employee={dialog.employee}
            submitting={terminate.isPending}
            blocking={blocking}
            onCancel={close}
            onSubmit={(payload) =>
              terminate.mutate(
                { id: dialog.employee.id, payload },
                {
                  onSuccess: (result) => {
                    notify.success(
                      (result as { terminationScheduled?: boolean }).terminationScheduled
                        ? t('uiWorkforce.terminationScheduled', { date: formatDate(payload.terminationDate) })
                        : t('uiWorkforce.employeeTerminated'),
                    );
                    close();
                  },
                  onError: onError(t('uiWorkforce.terminationError')),
                },
              )
            }
          />
        )}
      </Modal>
    </div>
  );
}

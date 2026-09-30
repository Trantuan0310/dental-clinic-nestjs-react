import { useState } from 'react';
import { Link } from 'react-router-dom';
import { format } from 'date-fns';
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
import { formatDate } from '@/lib/format';
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

const ACCOUNT_STATUS_HINT: Record<string, string> = {
  PENDING_SETUP: 'Chờ thiết lập',
  DEACTIVATED: 'Đã vô hiệu',
};

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
  const [form, setForm] = useState({
    fullName: employee?.fullName ?? '',
    employeeType: employee?.employeeType ?? ('ASSISTANT' as EmployeeType),
    dob: employee?.dob ?? '',
    gender: employee?.gender ?? '',
    phone: employee?.phone ?? '',
    email: employee?.email ?? '',
    address: employee?.address ?? '',
    hireDate: employee?.hireDate ?? format(new Date(), 'yyyy-MM-dd'),
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
        label="Họ và tên"
        required
        minLength={2}
        maxLength={200}
        value={form.fullName}
        onChange={(e) => setForm({ ...form, fullName: e.target.value })}
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <Select
          label="Loại nhân viên"
          value={form.employeeType}
          onChange={(e) => setForm({ ...form, employeeType: e.target.value as EmployeeType })}
          options={TYPE_OPTIONS}
          disabled={hasDentistProfile}
          hint={hasDentistProfile ? 'Đã có hồ sơ bác sĩ' : undefined}
        />
        <DatePicker
          label="Ngày vào làm"
          required
          value={form.hireDate}
          onChange={(value) => setForm({ ...form, hireDate: value })}
        />
        <DatePicker
          label="Ngày sinh"
          value={form.dob}
          onChange={(value) => setForm({ ...form, dob: value })}
        />
        <Select
          label="Giới tính"
          value={form.gender}
          onChange={(e) => setForm({ ...form, gender: e.target.value })}
          options={GENDER_OPTIONS}
          placeholder="-- Không chọn --"
        />
        <Input
          label="Số điện thoại"
          type="tel"
          value={form.phone}
          onChange={(e) => setForm({ ...form, phone: e.target.value })}
          maxLength={20}
        />
        <Input
          label="Email liên hệ"
          type="email"
          value={form.email}
          onChange={(e) => setForm({ ...form, email: e.target.value })}
          hint="Khác email đăng nhập"
        />
      </div>
      <Input
        label="Địa chỉ"
        value={form.address}
        onChange={(e) => setForm({ ...form, address: e.target.value })}
        maxLength={500}
      />
      {employee && (
        <Select
          label="Trạng thái làm việc"
          value={form.employmentStatus}
          onChange={(e) =>
            setForm({ ...form, employmentStatus: e.target.value as 'ACTIVE' | 'ON_LEAVE' })
          }
          options={[
            { value: 'ACTIVE', label: EMPLOYMENT_STATUS_LABEL.ACTIVE },
            { value: 'ON_LEAVE', label: EMPLOYMENT_STATUS_LABEL.ON_LEAVE },
          ]}
          hint="Cho nghỉ việc bằng nút “Cho nghỉ việc” trong danh sách"
        />
      )}
      <Textarea
        label="Ghi chú"
        rows={2}
        value={form.notes}
        onChange={(e) => setForm({ ...form, notes: e.target.value })}
      />
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onCancel}>
          Hủy
        </Button>
        <Button type="submit" isLoading={submitting}>
          {employee ? 'Lưu' : 'Tạo nhân viên'}
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
  const [mode, setMode] = useState<'create' | 'existing'>('create');
  const [loginEmail, setLoginEmail] = useState(employee.email ?? '');
  const [userId, setUserId] = useState('');
  const { data: accounts = [], isLoading: loadingAccounts } = useLinkableAccounts(mode === 'existing');
  const role =
    employee.employeeType === 'DENTIST'
      ? 'Bác sĩ'
      : employee.employeeType === 'RECEPTIONIST'
        ? 'Lễ tân'
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
      <div className="flex gap-2" role="group" aria-label="Cách gắn tài khoản">
        <Button
          type="button"
          size="sm"
          variant={mode === 'create' ? 'primary' : 'outline'}
          aria-pressed={mode === 'create'}
          onClick={() => setMode('create')}
        >
          Tạo tài khoản mới
        </Button>
        <Button
          type="button"
          size="sm"
          variant={mode === 'existing' ? 'primary' : 'outline'}
          aria-pressed={mode === 'existing'}
          onClick={() => setMode('existing')}
        >
          Gắn tài khoản có sẵn
        </Button>
      </div>
      {mode === 'create' ? (
        <>
          <Input
            label="Email đăng nhập"
            type="email"
            required
            value={loginEmail}
            onChange={(e) => setLoginEmail(e.target.value)}
          />
          <p className="text-sm text-gray-500 dark:text-surface-400">
            Hệ thống tạo tài khoản ở trạng thái chờ kích hoạt và gửi lời mời.{' '}
            {role
              ? `Tài khoản được gán vai trò ${role}.`
              : 'Tài khoản chưa có vai trò; gán vai trò ở trang Người dùng.'}
          </p>
        </>
      ) : (
        <>
          <Select
            label="Tài khoản"
            required
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
            placeholder={loadingAccounts ? 'Đang tải…' : '-- Chọn tài khoản chưa gắn nhân viên --'}
            options={accounts.map((a) => ({
              value: a.id,
              label: `${a.fullName} · ${a.email}${a.status === 'PENDING_SETUP' ? ' (chờ thiết lập)' : ''}`,
            }))}
          />
          <p className="text-sm text-gray-500 dark:text-surface-400">
            Chỉ liệt kê tài khoản đang hoạt động chưa gắn với nhân viên nào (ví dụ tài khoản quản
            trị của chủ phòng khám). Tên hiển thị của tài khoản đổi theo tên nhân viên; vai trò giữ
            nguyên.
          </p>
          {!loadingAccounts && accounts.length === 0 && (
            <p className="text-sm text-amber-700">Không có tài khoản nào chưa gắn nhân viên.</p>
          )}
        </>
      )}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onCancel}>
          Hủy
        </Button>
        <Button type="submit" isLoading={submitting} disabled={mode === 'existing' && !userId}>
          {mode === 'create' ? 'Tạo tài khoản' : 'Gắn tài khoản'}
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
  const [reason, setReason] = useState('');
  const [terminationDate, setTerminationDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit({ reason: reason.trim(), terminationDate });
      }}
    >
      <p className="text-sm text-gray-600 dark:text-surface-300">
        {employee.account
          ? 'Tài khoản đăng nhập của nhân viên sẽ bị vô hiệu hóa và mọi phiên đăng nhập bị thu hồi.'
          : 'Nhân viên này không có tài khoản đăng nhập.'}
        {employee.dentistProfile && ' Hồ sơ bác sĩ chuyển sang “Ngừng hành nghề”.'}
      </p>
      {blocking && <BlockingAppointmentsList appointments={blocking} />}
      <DatePicker
        label="Ngày nghỉ việc"
        required
        min={employee.hireDate}
        value={terminationDate}
        onChange={setTerminationDate}
      />
      <Textarea
        label="Lý do"
        required
        minLength={5}
        maxLength={500}
        rows={3}
        value={reason}
        onChange={(e) => setReason(e.target.value)}
      />
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onCancel}>
          Hủy
        </Button>
        <Button type="submit" variant="danger" isLoading={submitting}>
          Cho nghỉ việc
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
  const [reason, setReason] = useState('');
  const [reactivateAccount, setReactivateAccount] = useState(true);
  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit({ reason: reason.trim() || undefined, reactivateAccount });
      }}
    >
      <p className="text-sm text-gray-600 dark:text-surface-300">
        Nhân viên trở lại trạng thái “Đang làm”, ngày nghỉ việc được xóa.
        {employee.dentistProfile &&
          ' Hồ sơ bác sĩ vẫn “Ngừng hành nghề” cho đến khi bấm “Cho hành nghề lại” ở trang bác sĩ (kiểm tra lịch làm việc và dịch vụ trước).'}
      </p>
      {employee.account && (
        <Checkbox
          checked={reactivateAccount}
          onChange={setReactivateAccount}
          label={`Kích hoạt lại tài khoản đăng nhập ${employee.account.email}`}
        />
      )}
      <Textarea
        label="Lý do (không bắt buộc)"
        maxLength={500}
        rows={2}
        value={reason}
        onChange={(e) => setReason(e.target.value)}
      />
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onCancel}>
          Hủy
        </Button>
        <Button type="submit" isLoading={submitting}>
          Khôi phục
        </Button>
      </div>
    </form>
  );
}

export default function EmployeesPage() {
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
        title="Nhân sự"
        description="Hồ sơ nhân viên, tài khoản đăng nhập và hồ sơ bác sĩ"
        actions={
          <PermissionGuard permission="employee.create">
            <Button onClick={() => setDialog({ kind: 'create' })}>
              <Plus className="h-4 w-4" /> Thêm nhân viên
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
              aria-label="Tìm nhân viên"
              placeholder="Tìm theo mã, tên, SĐT, email…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Select
            aria-label="Lọc theo loại nhân viên"
            value={filters.type ?? ''}
            onChange={(e) =>
              setFilters({ ...filters, type: (e.target.value || undefined) as EmployeeType, page: 1 })
            }
            options={[{ value: '', label: 'Tất cả loại' }, ...TYPE_OPTIONS]}
          />
          <Select
            aria-label="Lọc theo trạng thái"
            value={filters.status ?? ''}
            onChange={(e) =>
              setFilters({
                ...filters,
                status: (e.target.value || undefined) as EmploymentStatus,
                page: 1,
              })
            }
            options={[{ value: '', label: 'Tất cả trạng thái' }, ...STATUS_OPTIONS]}
          />
          <Button type="submit" variant="outline">
            Tìm
          </Button>
        </form>
      </Card>

      <Card noPadding>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50 text-left text-gray-600 dark:border-surface-700 dark:bg-surface-800 dark:text-surface-300">
                <th className="px-4 py-3 font-medium">Mã</th>
                <th className="px-4 py-3 font-medium">Họ tên</th>
                <th className="px-4 py-3 font-medium">Loại</th>
                <th className="px-4 py-3 font-medium">Liên hệ</th>
                <th className="px-4 py-3 font-medium">Tài khoản</th>
                <th className="whitespace-nowrap px-4 py-3 font-medium">Trạng thái</th>
                <th className="px-4 py-3 text-right font-medium">Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-gray-400">
                    Đang tải…
                  </td>
                </tr>
              ) : isError ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-red-500">
                    Không tải được danh sách nhân viên.{' '}
                    <button type="button" className="underline" onClick={() => refetch()}>
                      Thử lại
                    </button>
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-gray-400">
                    Không có nhân viên phù hợp.
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
                        <div className="text-xs text-gray-500">Vào làm {formatDate(e.hireDate)}</div>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3">{EMPLOYEE_TYPE_LABEL[e.employeeType]}</td>
                      <td className="px-4 py-3 text-xs text-gray-600 dark:text-surface-300">
                        <div>{e.phone ?? '—'}</div>
                        <div>{e.email ?? ''}</div>
                      </td>
                      <td className="px-4 py-3 text-xs">
                        {e.account ? (
                          <>
                            <span className="text-gray-700 dark:text-surface-200">{e.account.email}</span>
                            {ACCOUNT_STATUS_HINT[e.account.status] && (
                              <div className="text-amber-700">{ACCOUNT_STATUS_HINT[e.account.status]}</div>
                            )}
                          </>
                        ) : (
                          <span className="text-gray-400">Chưa có</span>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3">
                        <Badge variant={EMPLOYMENT_STATUS_VARIANT[e.employmentStatus]}>
                          {EMPLOYMENT_STATUS_LABEL[e.employmentStatus]}
                        </Badge>
                      </td>
                      <td className="px-4 py-3">
                        {terminated && (
                          <div className="flex justify-end">
                            <PermissionGuard permission="employee.deactivate" mode="hide">
                              <Button
                                size="sm"
                                variant="ghost"
                                aria-label={`Khôi phục ${e.fullName}`}
                                title="Khôi phục (quay lại làm việc)"
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
                                aria-label={`Sửa ${e.fullName}`}
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
                                  aria-label={`Tạo tài khoản cho ${e.fullName}`}
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
                                  aria-label={`Tạo hồ sơ bác sĩ cho ${e.fullName}`}
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
                                aria-label={`Cho ${e.fullName} nghỉ việc`}
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
        title={dialog?.kind === 'edit' ? `Sửa ${dialog.employee.code}` : 'Thêm nhân viên'}
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
                        notify.success('Đã cập nhật nhân viên');
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
                      onError: onError('Không cập nhật được nhân viên'),
                    },
                  )
                : create.mutate(payload, {
                    onSuccess: (created) => {
                      notify.success(`Đã tạo nhân viên ${created.code}`);
                      close();
                    },
                    onError: onError('Không tạo được nhân viên'),
                  })
            }
          />
        )}
      </Modal>

      <Modal
        open={dialog?.kind === 'account'}
        onClose={close}
        title={dialog?.kind === 'account' ? `Tài khoản đăng nhập cho ${dialog.employee.fullName}` : ''}
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
                      notify.warning('Đã tạo tài khoản. Chưa gửi được email — dùng Cấp mật khẩu tạm.');
                      setTempPasswordFor({ id: linked.account.id, email: linked.account.email });
                    } else {
                      notify.success(
                        'userId' in payload
                          ? 'Đã gắn tài khoản có sẵn'
                          : 'Đã tạo tài khoản đăng nhập và gửi lời mời',
                      );
                    }
                  },
                  onError: onError('Không gắn được tài khoản'),
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
        title={dialog?.kind === 'reinstate' ? `Khôi phục ${dialog.employee.fullName}` : ''}
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
                        ? 'Đã khôi phục nhân viên. Vào trang bác sĩ để cho hành nghề lại.'
                        : 'Đã khôi phục nhân viên',
                    );
                    close();
                  },
                  onError: onError('Không khôi phục được nhân viên'),
                },
              )
            }
          />
        )}
      </Modal>

      <Modal
        open={dialog?.kind === 'onLeave'}
        onClose={close}
        title={dialog?.kind === 'onLeave' ? `${dialog.employee.fullName} tạm nghỉ` : ''}
      >
        {dialog?.kind === 'onLeave' && (
          <div className="space-y-4">
            <Alert type="info">
              Bác sĩ không còn nhận lịch hẹn mới (đặt tại quầy và đặt online). Các lịch đã đặt dưới
              đây vẫn giữ nguyên — hãy chuyển sang bác sĩ khác hoặc báo bệnh nhân.
            </Alert>
            <BlockingAppointmentsList appointments={dialog.appointments} />
            <div className="flex justify-end">
              <Button onClick={close}>Đã hiểu</Button>
            </div>
          </div>
        )}
      </Modal>

      <Modal
        open={dialog?.kind === 'dentist'}
        onClose={close}
        title={dialog?.kind === 'dentist' ? `Hồ sơ bác sĩ — ${dialog.employee.fullName}` : ''}
        description="Tài khoản sẽ được gán vai trò Bác sĩ và xuất hiện trong form đặt lịch."
        size="lg"
      >
        {dialog?.kind === 'dentist' && (
          <DentistProfileForm
            mode="admin"
            submitLabel="Tạo hồ sơ bác sĩ"
            submitting={makeDentist.isPending}
            onCancel={close}
            onSubmit={(payload) =>
              makeDentist.mutate(
                { id: dialog.employee.id, payload },
                {
                  onSuccess: () => {
                    notify.success('Đã tạo hồ sơ bác sĩ');
                    close();
                  },
                  onError: onError('Không tạo được hồ sơ bác sĩ'),
                },
              )
            }
          />
        )}
      </Modal>

      <Modal
        open={dialog?.kind === 'terminate'}
        onClose={close}
        title={dialog?.kind === 'terminate' ? `Cho ${dialog.employee.fullName} nghỉ việc` : ''}
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
                  onSuccess: () => {
                    notify.success('Đã cho nhân viên nghỉ việc');
                    close();
                  },
                  onError: onError('Không cho nghỉ việc được'),
                },
              )
            }
          />
        )}
      </Modal>
    </div>
  );
}

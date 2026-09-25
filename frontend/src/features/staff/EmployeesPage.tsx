import { useState } from 'react';
import { Link } from 'react-router-dom';
import { format } from 'date-fns';
import { Plus, Pencil, KeyRound, Stethoscope, UserX } from 'lucide-react';
import {
  Badge,
  Button,
  Card,
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
import { staffApi, useEmployees, useStaffMutation } from './staffApi';
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
  | { kind: 'terminate'; employee: Employee };

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
  onSubmit: (loginEmail: string) => void;
}) {
  const [loginEmail, setLoginEmail] = useState(employee.email ?? '');
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
        onSubmit(loginEmail.trim());
      }}
    >
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
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onCancel}>
          Hủy
        </Button>
        <Button type="submit" isLoading={submitting}>
          Tạo tài khoản
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

export default function EmployeesPage() {
  const [filters, setFilters] = useState<EmployeeFilters>({ page: 1, pageSize: 20 });
  const [search, setSearch] = useState('');
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [blocking, setBlocking] = useState<BlockingAppointment[] | null>(null);
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
  const link = useStaffMutation((v: { id: string; loginEmail: string }) =>
    staffApi.linkAccount(v.id, { loginEmail: v.loginEmail }),
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
                          <span className="text-gray-700 dark:text-surface-200">{e.account.email}</span>
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
                      onSuccess: () => {
                        notify.success('Đã cập nhật nhân viên');
                        close();
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
        title={dialog?.kind === 'account' ? `Tạo tài khoản cho ${dialog.employee.fullName}` : ''}
      >
        {dialog?.kind === 'account' && (
          <LinkAccountForm
            employee={dialog.employee}
            submitting={link.isPending}
            onCancel={close}
            onSubmit={(loginEmail) =>
              link.mutate(
                { id: dialog.employee.id, loginEmail },
                {
                  onSuccess: () => {
                    notify.success('Đã tạo tài khoản đăng nhập');
                    close();
                  },
                  onError: onError('Không tạo được tài khoản'),
                },
              )
            }
          />
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

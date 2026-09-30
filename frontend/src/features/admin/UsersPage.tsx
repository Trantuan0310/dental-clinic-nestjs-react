import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, MoreHorizontal, UserX, UserCheck, KeyRound, LockKeyhole } from 'lucide-react';
import {
  Button,
  Card,
  Checkbox,
  StatusBadge,
  SearchInput,
  Modal,
  Input,
  Select,
  Textarea,
  Spinner,
} from '@/components/ui';
import { notify } from '@/components/ui/Toast';
import { getApiErrorCode, getApiErrorMessage } from '@/lib/errors';
import { useAuthStore } from '@/stores/authStore';
import {
  useUsers,
  useRoles,
  useCreateUser,
  useUpdateUser,
  useUpdateUserRoles,
  useDeactivateUser,
  useReactivateUser,
  useSendPasswordLink,
} from './adminApi';
import { TemporaryPasswordDialog } from './TemporaryPasswordDialog';
import { BlockingAppointmentsList } from '@/features/staff/BlockingAppointmentsList';
import { blockingAppointments, staffErrorMessage } from '@/features/staff/labels';
import type { BlockingAppointment } from '@/features/staff/types';
import type { AdminUser, CreateAdminUserPayload } from '@/types/admin';
import { NAV_ROLE_HINT } from '@/lib/nav';
import type { RoleCode } from '@/types/auth';

/** Messages for the users API business codes (roles/email edits). */
const USER_ERROR_MESSAGE: Record<string, string> = {
  CANNOT_REMOVE_LAST_ADMIN: 'Không thể gỡ vai trò Quản trị của quản trị viên cuối cùng.',
  EMAIL_ALREADY_EXISTS: 'Email đăng nhập đã được dùng cho tài khoản khác.',
  DENTIST_HAS_FUTURE_APPOINTMENTS:
    'Bác sĩ còn lịch hẹn sắp tới. Chuyển hoặc hủy các lịch này trước khi gỡ vai trò Bác sĩ.',
  DENTIST_HAS_OPEN_ENCOUNTERS:
    'Bác sĩ còn phiên khám đang mở. Đóng các phiên khám trước khi gỡ vai trò Bác sĩ.',
};

function userErrorMessage(error: unknown, fallback: string): string {
  const code = getApiErrorCode(error);
  return (code && USER_ERROR_MESSAGE[code]) || staffErrorMessage(error, fallback);
}

type TempPasswordTarget = { user: { id: string; email: string }; emailFailed: boolean };

// `user.roles` is `string[]` (custom roles beyond the 3 built-ins are
// possible), so this falls back to the raw code for anything NAV_ROLE_HINT
// doesn't recognize instead of assuming every value is a known RoleCode.
function roleLabel(code: string): string {
  return NAV_ROLE_HINT[code as RoleCode] ?? code;
}

const PAGE_SIZE = 50;

export default function UsersPage() {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingUser, setEditingUser] = useState<AdminUser | null>(null);
  const [deactivateTarget, setDeactivateTarget] = useState<AdminUser | null>(null);
  const [deactivateReason, setDeactivateReason] = useState('');
  const [tempPassword, setTempPassword] = useState<TempPasswordTarget | null>(null);
  const canResetPassword = useAuthStore((s) => s.hasPermission('user.reset_password'));

  const { data, isLoading } = useUsers({
    limit: PAGE_SIZE,
    ...(statusFilter !== 'all' ? { status: statusFilter } : {}),
  });

  const createMutation = useCreateUser();
  const deactivateMutation = useDeactivateUser();
  const reactivateMutation = useReactivateUser();
  const sendLinkMutation = useSendPasswordLink();

  const allUsers = data?.data ?? [];
  const filteredUsers = allUsers.filter((user) => {
    if (
      search &&
      !user.fullName.toLowerCase().includes(search.toLowerCase()) &&
      !user.email.toLowerCase().includes(search.toLowerCase())
    ) {
      return false;
    }
    return true;
  });

  const handleCreate = async (payload: CreateAdminUserPayload) => {
    try {
      const created = await createMutation.mutateAsync(payload);
      setShowCreateModal(false);
      if (created.inviteSent) {
        notify.success(`Đã tạo người dùng và gửi lời mời tới ${created.email}`);
      } else {
        // Never claim an invite that did not leave the server.
        notify.warning('Đã tạo người dùng. Chưa gửi được email — dùng Cấp mật khẩu tạm.');
        setTempPassword({ user: { id: created.id, email: created.email }, emailFailed: true });
      }
    } catch (err) {
      notify.error(userErrorMessage(err, 'Không thể tạo người dùng. Vui lòng thử lại.'));
    }
  };

  const handleDeactivate = async () => {
    if (!deactivateTarget) return;
    try {
      await deactivateMutation.mutateAsync({
        id: deactivateTarget.id,
        reason: deactivateReason.trim() || undefined,
      });
      notify.success('Đã vô hiệu hóa người dùng');
      setDeactivateTarget(null);
      setDeactivateReason('');
    } catch (err) {
      notify.error(getApiErrorMessage(err, 'Không thể vô hiệu hóa người dùng. Vui lòng thử lại.'));
    }
  };

  const handleReactivate = async (user: AdminUser) => {
    try {
      await reactivateMutation.mutateAsync(user.id);
      notify.success('Đã kích hoạt lại người dùng');
    } catch (err) {
      notify.error(getApiErrorMessage(err, 'Không thể kích hoạt lại người dùng. Vui lòng thử lại.'));
    }
  };

  const handleSendLink = async (user: AdminUser) => {
    try {
      const result = await sendLinkMutation.mutateAsync(user.id);
      if (result.sent) {
        notify.success(
          `Đã gửi link ${result.kind === 'setup' ? 'thiết lập tài khoản' : 'đặt lại mật khẩu'} tới ${user.email} (hiệu lực ${result.expiresInMinutes} phút)`,
        );
      } else {
        notify.warning('Chưa gửi được email — dùng Cấp mật khẩu tạm.');
        setTempPassword({ user, emailFailed: true });
      }
    } catch (err) {
      notify.error(getApiErrorMessage(err, 'Không gửi được link. Vui lòng thử lại.'));
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Người dùng</h1>
          <p className="mt-0.5 text-sm text-gray-500">
            Quản lý tài khoản nhân viên phòng khám
          </p>
        </div>
        <Button onClick={() => setShowCreateModal(true)}>
          <Plus className="h-4 w-4" />
          Tạo người dùng
        </Button>
      </div>

      <Card noPadding>
        <div className="p-3">
          <div className="flex flex-col gap-3 sm:flex-row">
            <div className="flex-1">
              <SearchInput
                placeholder="Tìm theo tên, email..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onClear={() => setSearch('')}
              />
            </div>
            <div className="flex gap-2">
              <select
                className="rounded-md border border-gray-300 px-3 py-2 text-sm"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
              >
                <option value="all">Tất cả</option>
                <option value="ACTIVE">Hoạt động</option>
                <option value="PENDING_SETUP">Chờ thiết lập</option>
                <option value="DEACTIVATED">Đã vô hiệu</option>
              </select>
            </div>
          </div>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center p-8">
            <Spinner />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="px-4 py-3 font-medium text-gray-600">Email</th>
                  <th className="px-4 py-3 font-medium text-gray-600">Họ tên</th>
                  <th className="px-4 py-3 font-medium text-gray-600">Vai trò</th>
                  <th className="px-4 py-3 font-medium text-gray-600">Trạng thái</th>
                  <th className="px-4 py-3 font-medium text-gray-600">Đăng nhập cuối</th>
                  <th className="px-4 py-3 font-medium text-gray-600 w-12"></th>
                </tr>
              </thead>
              <tbody>
                {filteredUsers.map((user) => (
                  <tr key={user.id} className="border-b border-gray-50 hover:bg-gray-50">
                    <td className="px-4 py-3 text-gray-900">{user.email}</td>
                    <td className="px-4 py-3 font-medium text-gray-900">{user.fullName}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {user.roles.map((role) => (
                          <span
                            key={role}
                            className="inline-flex rounded bg-brand-50 px-2 py-0.5 text-xs font-medium text-brand-700"
                          >
                            {roleLabel(role)}
                          </span>
                        ))}
                        {user.roles.includes('dentist') && user.hasDentistProfile === false && (
                          <Link
                            to="/staff"
                            className="inline-flex rounded bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700 hover:underline"
                            title="Tài khoản có vai trò Bác sĩ nhưng chưa có hồ sơ bác sĩ: chưa có màu lịch, dịch vụ, đặt lịch online. Tạo hồ sơ ở trang Nhân sự."
                          >
                            Chưa có hồ sơ bác sĩ
                          </Link>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={user.status.toLowerCase()} />
                    </td>
                    <td className="px-4 py-3 text-gray-500 text-xs">
                      {user.lastLoginAt
                        ? new Date(user.lastLoginAt).toLocaleString('vi-VN')
                        : 'Chưa đăng nhập'}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        <button
                          className="rounded p-1 hover:bg-gray-100"
                          onClick={() => setEditingUser(user)}
                          title="Sửa"
                        >
                          <MoreHorizontal className="h-4 w-4 text-gray-400" />
                        </button>
                        {user.status === 'deactivated' ? (
                          <button
                            className="rounded p-1 hover:bg-green-50"
                            onClick={() => handleReactivate(user)}
                            disabled={reactivateMutation.isPending && reactivateMutation.variables === user.id}
                            title="Kích hoạt lại"
                          >
                            <UserCheck className="h-4 w-4 text-green-500" />
                          </button>
                        ) : (
                          <>
                            <button
                              className="rounded p-1 hover:bg-brand-50"
                              onClick={() => handleSendLink(user)}
                              disabled={sendLinkMutation.isPending && sendLinkMutation.variables === user.id}
                              title={
                                user.status.toLowerCase() === 'pending_setup'
                                  ? 'Gửi lại link thiết lập tài khoản'
                                  : 'Gửi link đặt lại mật khẩu'
                              }
                              aria-label={`Gửi link đặt mật khẩu cho ${user.email}`}
                            >
                              <KeyRound className="h-4 w-4 text-brand-500" />
                            </button>
                            {canResetPassword && (
                              <button
                                className="rounded p-1 hover:bg-amber-50"
                                onClick={() => setTempPassword({ user, emailFailed: false })}
                                title="Cấp mật khẩu tạm (không cần email)"
                                aria-label={`Cấp mật khẩu tạm cho ${user.email}`}
                              >
                                <LockKeyhole className="h-4 w-4 text-amber-500" />
                              </button>
                            )}
                            <button
                              className="rounded p-1 hover:bg-red-50"
                              onClick={() => setDeactivateTarget(user)}
                              title="Vô hiệu hóa"
                            >
                              <UserX className="h-4 w-4 text-red-400" />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {filteredUsers.length === 0 && !isLoading && (
          <div className="p-6 text-center text-gray-500">
            Không tìm thấy người dùng nào
          </div>
        )}
      </Card>

      {/* Create User Modal */}
      <CreateUserModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onSubmit={handleCreate}
        isLoading={createMutation.isPending}
      />

      {/* Edit User Modal */}
      {editingUser && (
        <EditUserModal
          user={editingUser}
          onClose={() => setEditingUser(null)}
          onSendLink={() => handleSendLink(editingUser)}
        />
      )}

      <TemporaryPasswordDialog
        user={tempPassword?.user ?? null}
        emailFailed={tempPassword?.emailFailed}
        onClose={() => setTempPassword(null)}
      />

      {/* Deactivate Confirmation */}
      <Modal
        isOpen={!!deactivateTarget}
        onClose={() => { setDeactivateTarget(null); setDeactivateReason(''); }}
        title="Xác nhận vô hiệu hóa người dùng"
        size="sm"
      >
        <p className="text-sm text-gray-600">
          Vô hiệu hóa <strong>{deactivateTarget?.fullName}</strong>? Tài khoản sẽ bị đăng xuất
          khỏi mọi phiên đang hoạt động và không thể đăng nhập lại cho đến khi được kích hoạt lại.
        </p>
        <div className="mt-3">
          <Textarea
            label="Lý do (không bắt buộc)"
            value={deactivateReason}
            onChange={(e) => setDeactivateReason(e.target.value)}
            placeholder="VD: Nghỉ việc, chuyển công tác..."
            rows={2}
          />
        </div>
        <div className="mt-4 flex justify-end gap-3">
          <Button variant="outline" onClick={() => { setDeactivateTarget(null); setDeactivateReason(''); }}>
            Hủy
          </Button>
          <Button
            variant="danger"
            isLoading={deactivateMutation.isPending}
            onClick={handleDeactivate}
          >
            Vô hiệu hóa
          </Button>
        </div>
      </Modal>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Create / Edit Modals
// ---------------------------------------------------------------------------

function CreateUserModal({
  isOpen,
  onClose,
  onSubmit,
  isLoading,
}: {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (payload: CreateAdminUserPayload) => void;
  isLoading: boolean;
}) {
  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [roleId, setRoleId] = useState('');

  const { data: rolesData } = useRoles();
  const roles = rolesData?.data ?? [];

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !fullName || !roleId) return;
    onSubmit({ email, fullName, roleIds: [roleId] });
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Tạo người dùng mới" size="md">
      <form onSubmit={handleSubmit} className="space-y-4">
        <Input
          label="Email"
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="email@gensmile.vn"
        />
        <Input
          label="Họ và tên"
          required
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          placeholder="Nguyễn Văn A"
        />
        <Select
          label="Vai trò"
          value={roleId}
          onChange={(e) => setRoleId(e.target.value)}
          options={roles.map((r) => ({ value: r.id, label: r.name }))}
          placeholder="Chọn vai trò"
        />
        <div className="flex justify-end gap-3 pt-4 border-t border-gray-100">
          <Button variant="outline" type="button" onClick={onClose}>
            Hủy
          </Button>
          <Button type="submit" isLoading={isLoading} disabled={!email || !fullName || !roleId}>
            Tạo
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function EditUserModal({
  user,
  onClose,
  onSendLink,
}: {
  user: AdminUser;
  onClose: () => void;
  onSendLink: () => void;
}) {
  const me = useAuthStore((s) => s.user?.id);
  const { data: rolesData } = useRoles();
  const roles = rolesData?.data ?? [];
  const updateUser = useUpdateUser(user.id);
  const updateRoles = useUpdateUserRoles();

  const [fullName, setFullName] = useState(user.fullName);
  const [email, setEmail] = useState(user.email);
  const [roleCodes, setRoleCodes] = useState<string[]>(user.roles);
  const [blocking, setBlocking] = useState<BlockingAppointment[] | null>(null);
  const isSelf = user.id === me;

  const toggleRole = (code: string, on: boolean) =>
    setRoleCodes((current) => (on ? [...current, code] : current.filter((c) => c !== code)));
  const rolesChanged =
    roleCodes.length !== user.roles.length || roleCodes.some((c) => !user.roles.includes(c));
  const normalizedEmail = email.trim().toLowerCase();
  const emailChanged = normalizedEmail !== user.email;
  const nameChanged = fullName.trim() !== user.fullName;
  const saving = updateUser.isPending || updateRoles.isPending;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBlocking(null);
    try {
      if (nameChanged || emailChanged) {
        await updateUser.mutateAsync({
          ...(nameChanged ? { fullName: fullName.trim() } : {}),
          ...(emailChanged ? { email: normalizedEmail } : {}),
        });
      }
      if (rolesChanged) {
        const roleIds = roles.filter((r) => roleCodes.includes(r.code)).map((r) => r.id);
        await updateRoles.mutateAsync({ id: user.id, roleIds });
      }
      notify.success('Cập nhật thành công');
      if (emailChanged && user.status === 'pending_setup') {
        notify.info('Email đăng nhập đã đổi: gửi lại link thiết lập tới email mới.');
      }
      onClose();
    } catch (err) {
      setBlocking(blockingAppointments(err));
      notify.error(userErrorMessage(err, 'Không thể cập nhật. Vui lòng thử lại.'));
    }
  };

  return (
    <Modal isOpen onClose={onClose} title="Sửa người dùng" size="md">
      <form onSubmit={handleSubmit} className="space-y-4">
        <Input
          label="Email đăng nhập"
          type="email"
          required
          maxLength={255}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          hint="Không phân biệt chữ hoa, chữ thường. Người dùng đăng nhập bằng email mới ngay sau khi lưu."
        />
        <Input
          label="Họ và tên"
          required
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          hint="Đồng bộ sang hồ sơ nhân viên đã gắn."
        />
        <fieldset>
          <legend className="mb-1 text-sm font-medium text-gray-700 dark:text-surface-200">Vai trò</legend>
          <div className="space-y-1">
            {roles.map((r) => {
              const lockSelfAdmin = isSelf && r.code === 'clinic_admin' && user.roles.includes('clinic_admin');
              return (
                <Checkbox
                  key={r.id}
                  checked={roleCodes.includes(r.code)}
                  disabled={lockSelfAdmin}
                  onChange={(on) => toggleRole(r.code, on)}
                  label={
                    <>
                      {r.name}
                      {lockSelfAdmin && (
                        <span className="ml-1 text-xs text-gray-500">(không tự gỡ vai trò quản trị của mình)</span>
                      )}
                    </>
                  }
                />
              );
            })}
          </div>
          {roleCodes.includes('dentist') && user.hasDentistProfile === false && (
            <p className="mt-1 text-xs text-amber-700">
              Để bác sĩ có màu lịch, dịch vụ và nhận đặt lịch online, tạo hồ sơ bác sĩ ở trang{' '}
              <Link to="/staff" className="underline">
                Nhân sự
              </Link>
              .
            </p>
          )}
          {rolesChanged && (
            <p className="mt-1 text-xs text-gray-500">
              {isSelf
                ? 'Đổi vai trò sẽ kết thúc các phiên của bạn: bạn cần đăng nhập lại sau khi lưu.'
                : 'Đổi vai trò sẽ đăng xuất người dùng khỏi các phiên đang mở.'}
            </p>
          )}
        </fieldset>
        {blocking && <BlockingAppointmentsList appointments={blocking} />}
        {/* Status is changed via the dedicated deactivate/reactivate actions
            in the table row, not here — the generic update endpoint doesn't
            accept a status field (see adminApi.ts). */}
        <div className="flex flex-wrap justify-between gap-3 border-t border-gray-100 pt-4">
          <div>
            {user.status === 'pending_setup' && (
              <Button variant="ghost" type="button" onClick={onSendLink}>
                Gửi lại link thiết lập
              </Button>
            )}
          </div>
          <div className="flex gap-3">
            <Button variant="outline" type="button" onClick={onClose}>
              Hủy
            </Button>
            <Button
              type="submit"
              isLoading={saving}
              disabled={roleCodes.length === 0 || !fullName.trim() || !normalizedEmail}
            >
              Lưu
            </Button>
          </div>
        </div>
      </form>
    </Modal>
  );
}

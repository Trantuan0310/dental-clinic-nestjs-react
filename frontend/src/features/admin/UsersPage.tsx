import { useState } from 'react';
import { useTranslation } from 'react-i18next';
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
  const { t, i18n } = useTranslation();
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
        notify.success(t('uiWorkforce.userCreatedInvite', { email: created.email }));
      } else {
        // Never claim an invite that did not leave the server.
        notify.warning(t('uiWorkforce.userCreatedEmailFailed'));
        setTempPassword({ user: { id: created.id, email: created.email }, emailFailed: true });
      }
    } catch (err) {
      notify.error(userErrorMessage(err, t('uiWorkforce.createUserError')));
    }
  };

  const handleDeactivate = async () => {
    if (!deactivateTarget) return;
    try {
      await deactivateMutation.mutateAsync({
        id: deactivateTarget.id,
        reason: deactivateReason.trim() || undefined,
      });
      notify.success(t('uiWorkforce.userDeactivated'));
      setDeactivateTarget(null);
      setDeactivateReason('');
    } catch (err) {
      notify.error(getApiErrorMessage(err, t('uiWorkforce.deactivateUserError')));
    }
  };

  const handleReactivate = async (user: AdminUser) => {
    try {
      await reactivateMutation.mutateAsync(user.id);
      notify.success(t('uiWorkforce.userReactivated'));
    } catch (err) {
      notify.error(getApiErrorMessage(err, t('uiWorkforce.reactivateUserError')));
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
        notify.warning(t('uiWorkforce.emailNotSent'));
        setTempPassword({ user, emailFailed: true });
      }
    } catch (err) {
      notify.error(getApiErrorMessage(err, t('uiWorkforce.linkNotSent')));
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-surface-100">{t('uiWorkforce.users')}</h1>
          <p className="mt-0.5 text-sm text-gray-500 dark:text-surface-400">
            {t('uiWorkforce.userDescription')}
          </p>
        </div>
        <Button onClick={() => setShowCreateModal(true)}>
          <Plus className="h-4 w-4" />
          {t('uiWorkforce.createUser')}
        </Button>
      </div>

      <Card noPadding>
        <div className="p-3">
          <div className="flex flex-col gap-3 sm:flex-row">
            <div className="flex-1">
              <SearchInput
                placeholder={t('uiWorkforce.searchUsers')}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onClear={() => setSearch('')}
              />
            </div>
            <div className="flex gap-2">
              <select
                className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 dark:border-surface-700 dark:bg-surface-900 dark:text-surface-100"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
              >
                <option value="all">{t('uiWorkforce.all')}</option>
                <option value="ACTIVE">{t('uiWorkforce.active')}</option>
                <option value="PENDING_SETUP">{t('uiWorkforce.pendingSetup')}</option>
                <option value="DEACTIVATED">{t('uiWorkforce.deactivated')}</option>
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
                <tr className="border-b border-gray-100 bg-gray-50 dark:border-surface-800 dark:bg-surface-800">
                  <th className="px-4 py-3 font-medium text-gray-600 dark:text-surface-300">{t('uiWorkforce.email')}</th>
                  <th className="px-4 py-3 font-medium text-gray-600 dark:text-surface-300">{t('uiWorkforce.fullName')}</th>
                  <th className="px-4 py-3 font-medium text-gray-600 dark:text-surface-300">{t('uiWorkforce.role')}</th>
                  <th className="px-4 py-3 font-medium text-gray-600 dark:text-surface-300">{t('uiWorkforce.status')}</th>
                  <th className="px-4 py-3 font-medium text-gray-600 dark:text-surface-300">{t('uiWorkforce.lastLogin')}</th>
                  <th className="px-4 py-3 font-medium text-gray-600 w-12"></th>
                </tr>
              </thead>
              <tbody>
                {filteredUsers.map((user) => (
                  <tr key={user.id} className="border-b border-gray-50 hover:bg-gray-50 dark:border-surface-800 dark:hover:bg-surface-800/60">
                    <td className="px-4 py-3 text-gray-900 dark:text-surface-100">{user.email}</td>
                    <td className="px-4 py-3 font-medium text-gray-900 dark:text-surface-100">{user.fullName}</td>
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
                            title={t('uiWorkforce.dentistProfileMissing')}
                          >
                            {t('uiWorkforce.dentistProfileMissing')}
                          </Link>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={user.status.toLowerCase()} />
                    </td>
                    <td className="px-4 py-3 text-gray-500 text-xs dark:text-surface-400">
                      {user.lastLoginAt
                        ? new Date(user.lastLoginAt).toLocaleString(i18n.language === 'vi' ? 'vi-VN' : 'en-US')
                        : t('uiWorkforce.neverLoggedIn')}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        <button
                          className="rounded p-1 hover:bg-gray-100"
                          onClick={() => setEditingUser(user)}
                          title={t('uiWorkforce.edit')}
                        >
                          <MoreHorizontal className="h-4 w-4 text-gray-400" />
                        </button>
                        {user.status === 'deactivated' ? (
                          <button
                            className="rounded p-1 hover:bg-green-50"
                            onClick={() => handleReactivate(user)}
                            disabled={reactivateMutation.isPending && reactivateMutation.variables === user.id}
                            title={t('uiWorkforce.reactivate')}
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
                                  ? t('uiWorkforce.resendSetupLink')
                                  : t('uiWorkforce.resetPasswordLink')
                              }
                              aria-label={t('uiWorkforce.sendPasswordLink', { email: user.email })}
                            >
                              <KeyRound className="h-4 w-4 text-brand-500" />
                            </button>
                            {canResetPassword && (
                              <button
                                className="rounded p-1 hover:bg-amber-50"
                                onClick={() => setTempPassword({ user, emailFailed: false })}
                                title={t('uiWorkforce.tempPasswordTitle')}
                                aria-label={t('uiWorkforce.tempPasswordFor', { email: user.email })}
                              >
                                <LockKeyhole className="h-4 w-4 text-amber-500" />
                              </button>
                            )}
                            <button
                              className="rounded p-1 hover:bg-red-50"
                              onClick={() => setDeactivateTarget(user)}
                              title={t('uiWorkforce.deactivate')}
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
            {t('uiWorkforce.noUsers')}
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
        title={t('uiWorkforce.deactivateConfirmTitle')}
        size="sm"
      >
        <p className="text-sm text-gray-600">
          {t('uiWorkforce.deactivateDescription')} <strong>{deactivateTarget?.fullName}</strong>{' '}
          {t('uiWorkforce.deactivateDescriptionEnd')}
        </p>
        <div className="mt-3">
          <Textarea
            label={t('uiWorkforce.reasonOptionalUser')}
            value={deactivateReason}
            onChange={(e) => setDeactivateReason(e.target.value)}
            placeholder={t('uiWorkforce.reasonPlaceholder')}
            rows={2}
          />
        </div>
        <div className="mt-4 flex justify-end gap-3">
          <Button variant="outline" onClick={() => { setDeactivateTarget(null); setDeactivateReason(''); }}>
            {t('uiWorkforce.cancel')}
          </Button>
          <Button
            variant="danger"
            isLoading={deactivateMutation.isPending}
            onClick={handleDeactivate}
          >
            {t('uiWorkforce.deactivate')}
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
  const { t } = useTranslation();
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
    <Modal isOpen={isOpen} onClose={onClose} title={t('uiWorkforce.createUserTitle')} size="md">
      <form onSubmit={handleSubmit} className="space-y-4">
        <Input
          label={t('uiWorkforce.email')}
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="email@gensmile.vn"
        />
        <Input
          label={t('uiWorkforce.fullName')}
          required
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          placeholder="Nguyễn Văn A"
        />
        <Select
          label={t('uiWorkforce.role')}
          value={roleId}
          onChange={(e) => setRoleId(e.target.value)}
          options={roles.map((r) => ({ value: r.id, label: r.name }))}
          placeholder={t('uiWorkforce.selectRole')}
        />
        <div className="flex justify-end gap-3 pt-4 border-t border-gray-100">
          <Button variant="outline" type="button" onClick={onClose}>
            {t('uiWorkforce.cancel')}
          </Button>
          <Button type="submit" isLoading={isLoading} disabled={!email || !fullName || !roleId}>
            {t('uiWorkforce.create')}
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
  const { t } = useTranslation();
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
      notify.success(t('uiWorkforce.updateSuccess'));
      if (emailChanged && user.status === 'pending_setup') {
        notify.info(t('uiWorkforce.emailUpdatedNotice'));
      }
      onClose();
    } catch (err) {
      setBlocking(blockingAppointments(err));
      notify.error(userErrorMessage(err, t('uiWorkforce.updateUserError')));
    }
  };

  return (
    <Modal isOpen onClose={onClose} title={t('uiWorkforce.editUserTitle')} size="md">
      <form onSubmit={handleSubmit} className="space-y-4">
        <Input
          label={t('uiWorkforce.loginEmail')}
          type="email"
          required
          maxLength={255}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          hint={t('uiWorkforce.emailUpdateHint')}
        />
        <Input
          label={t('uiWorkforce.fullName')}
          required
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          hint={t('uiWorkforce.nameUpdateHint')}
        />
        <fieldset>
          <legend className="mb-1 text-sm font-medium text-gray-700 dark:text-surface-200">{t('uiWorkforce.role')}</legend>
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
                        <span className="ml-1 text-xs text-gray-500">({t('uiWorkforce.cannotRemoveOwnAdmin')})</span>
                      )}
                    </>
                  }
                />
              );
            })}
          </div>
          {roleCodes.includes('dentist') && user.hasDentistProfile === false && (
            <p className="mt-1 text-xs text-amber-700">
              {t('uiWorkforce.createDentistProfileHint')}{' '}
              <Link to="/staff" className="underline">
                {t('uiWorkforce.employees')}
              </Link>
              .
            </p>
          )}
          {rolesChanged && (
            <p className="mt-1 text-xs text-gray-500">
              {isSelf
                ? t('uiWorkforce.roleChangeSelfNotice')
                : t('uiWorkforce.roleChangeUserNotice')}
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
                {t('uiWorkforce.resendSetupLink')}
              </Button>
            )}
          </div>
          <div className="flex gap-3">
            <Button variant="outline" type="button" onClick={onClose}>
              {t('uiWorkforce.cancel')}
            </Button>
            <Button
              type="submit"
              isLoading={saving}
              disabled={roleCodes.length === 0 || !fullName.trim() || !normalizedEmail}
            >
              {t('uiWorkforce.save')}
            </Button>
          </div>
        </div>
      </form>
    </Modal>
  );
}

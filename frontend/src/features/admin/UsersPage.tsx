import { useState } from 'react';
import { Plus, MoreHorizontal, Trash2 } from 'lucide-react';
import { Button, Card, StatusBadge, SearchInput, Modal, Input, Select, Spinner } from '@/components/ui';
import { notify } from '@/components/ui/Toast';
import {
  useUsers,
  useRoles,
  useCreateUser,
  useUpdateUser,
  useDeleteUser,
} from './adminApi';
import type { AdminUser, CreateAdminUserPayload } from '@/types/admin';

const PAGE_SIZE = 50;

export default function UsersPage() {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingUser, setEditingUser] = useState<AdminUser | null>(null);
  const [deleteUserId, setDeleteUserId] = useState<string | null>(null);

  const { data, isLoading } = useUsers({
    limit: PAGE_SIZE,
    ...(statusFilter !== 'all' ? { status: statusFilter } : {}),
  });

  const createMutation = useCreateUser();
  const updateMutation = useUpdateUser(editingUser?.id ?? '');
  const deleteMutation = useDeleteUser();

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
      await createMutation.mutateAsync(payload);
      notify.success('Tạo người dùng thành công');
      setShowCreateModal(false);
    } catch {
      notify.error('Không thể tạo người dùng. Vui lòng thử lại.');
    }
  };

  const handleUpdate = async (payload: Parameters<typeof updateMutation.mutateAsync>[0]) => {
    try {
      await updateMutation.mutateAsync(payload);
      notify.success('Cập nhật thành công');
      setEditingUser(null);
    } catch {
      notify.error('Không thể cập nhật. Vui lòng thử lại.');
    }
  };

  const handleDelete = async () => {
    if (!deleteUserId) return;
    try {
      await deleteMutation.mutateAsync(deleteUserId);
      notify.success('Đã xóa người dùng');
      setDeleteUserId(null);
    } catch {
      notify.error('Không thể xóa người dùng. Vui lòng thử lại.');
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
                      <div className="flex gap-1">
                        {user.roles.map((role) => (
                          <span
                            key={role}
                            className="inline-flex rounded bg-brand-50 px-2 py-0.5 text-xs font-medium text-brand-700"
                          >
                            {role}
                          </span>
                        ))}
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
                        <button
                          className="rounded p-1 hover:bg-red-50"
                          onClick={() => setDeleteUserId(user.id)}
                          title="Xóa"
                        >
                          <Trash2 className="h-4 w-4 text-red-400" />
                        </button>
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
          isOpen={true}
          onClose={() => setEditingUser(null)}
          onSubmit={handleUpdate}
          isLoading={updateMutation.isPending}
        />
      )}

      {/* Delete Confirmation */}
      <Modal
        isOpen={!!deleteUserId}
        onClose={() => setDeleteUserId(null)}
        title="Xác nhận xóa người dùng"
        size="sm"
      >
        <p className="text-sm text-gray-600">
          Bạn có chắc muốn xóa người dùng này? Hành động này không thể hoàn tác.
        </p>
        <div className="mt-4 flex justify-end gap-3">
          <Button variant="outline" onClick={() => setDeleteUserId(null)}>
            Hủy
          </Button>
          <Button
            variant="danger"
            isLoading={deleteMutation.isPending}
            onClick={handleDelete}
          >
            Xóa
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
  isOpen,
  onClose,
  onSubmit,
  isLoading,
}: {
  user: AdminUser;
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (payload: { fullName?: string; status?: AdminUser['status'] }) => void;
  isLoading: boolean;
}) {
  const [fullName, setFullName] = useState(user.fullName);
  const [status, setStatus] = useState<AdminUser['status']>(user.status);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({ fullName, status });
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Sửa người dùng" size="md">
      <form onSubmit={handleSubmit} className="space-y-4">
        <Input label="Email" value={user.email} disabled />
        <Input
          label="Họ và tên"
          required
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
        />
        <Select
          label="Trạng thái"
          value={status}
          onChange={(e) => setStatus(e.target.value as AdminUser['status'])}
          options={[
            { value: 'ACTIVE', label: 'Hoạt động' },
            { value: 'PENDING_SETUP', label: 'Chờ thiết lập' },
            { value: 'DEACTIVATED', label: 'Đã vô hiệu' },
          ]}
        />
        <div className="flex justify-end gap-3 pt-4 border-t border-gray-100">
          <Button variant="outline" type="button" onClick={onClose}>
            Hủy
          </Button>
          <Button type="submit" isLoading={isLoading}>
            Lưu
          </Button>
        </div>
      </form>
    </Modal>
  );
}

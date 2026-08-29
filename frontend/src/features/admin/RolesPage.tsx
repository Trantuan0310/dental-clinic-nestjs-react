import { useState } from 'react';
import { Plus, Edit, Trash2, Lock, Users } from 'lucide-react';
import { Button, Card, Modal, Input, Spinner } from '@/components/ui';
import { notify } from '@/components/ui/Toast';
import {
  useRoles,
  usePermissions,
  useCreateRole,
  useUpdateRole,
  useDeleteRole,
} from './adminApi';
import type { AdminRole, CreateAdminRolePayload, UpdateAdminRolePayload } from '@/types/admin';

export default function RolesPage() {
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingRole, setEditingRole] = useState<AdminRole | null>(null);

  const { data, isLoading } = useRoles();
  const { data: permissionsData } = usePermissions();
  const roles = data?.data ?? [];
  const permissions = permissionsData ?? [];

  const createMutation = useCreateRole();
  const updateMutation = useUpdateRole(editingRole?.id ?? '');
  const deleteMutation = useDeleteRole();

  const handleCreate = async (payload: Parameters<typeof createMutation.mutateAsync>[0]) => {
    try {
      await createMutation.mutateAsync(payload);
      notify.success('Tạo vai trò thành công');
      setShowCreateModal(false);
    } catch {
      notify.error('Không thể tạo vai trò. Vui lòng thử lại.');
    }
  };

  const handleUpdate = async (payload: Parameters<typeof updateMutation.mutateAsync>[0]) => {
    try {
      await updateMutation.mutateAsync(payload);
      notify.success('Cập nhật vai trò thành công');
      setEditingRole(null);
    } catch {
      notify.error('Không thể cập nhật vai trò. Vui lòng thử lại.');
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteMutation.mutateAsync(id);
      notify.success('Đã xóa vai trò');
    } catch {
      notify.error('Không thể xóa vai trò. Vui lòng thử lại.');
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Vai trò & Quyền</h1>
          <p className="mt-1 text-sm text-gray-500">
            Phân quyền truy cập cho nhân viên
          </p>
        </div>
        <Button onClick={() => setShowCreateModal(true)}>
          <Plus className="h-4 w-4" />
          Tạo vai trò
        </Button>
      </div>

      <Card noPadding>
        {isLoading ? (
          <div className="flex items-center justify-center p-8">
            <Spinner />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="px-4 py-3 font-medium text-gray-600">Mã</th>
                  <th className="px-4 py-3 font-medium text-gray-600">Tên vai trò</th>
                  <th className="px-4 py-3 font-medium text-gray-600">Mô tả</th>
                  <th className="px-4 py-3 font-medium text-gray-600 text-center">Người dùng</th>
                  <th className="px-4 py-3 font-medium text-gray-600 text-center">Hệ thống</th>
                  <th className="px-4 py-3 font-medium text-gray-600 w-24"></th>
                </tr>
              </thead>
              <tbody>
                {roles.map((role) => (
                  <tr key={role.id} className="border-b border-gray-50 hover:bg-gray-50">
                    <td className="px-4 py-3 font-mono text-xs text-gray-500">{role.code}</td>
                    <td className="px-4 py-3 font-medium text-gray-900">{role.name}</td>
                    <td className="px-4 py-3 text-gray-600">{role.description}</td>
                    <td className="px-4 py-3 text-center">
                      <span className="inline-flex items-center gap-1 text-gray-600">
                        <Users className="h-4 w-4" />
                        {role.userCount ?? 0}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      {role.isSystem ? (
                        <Lock className="h-4 w-4 text-gray-400 mx-auto" />
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {!role.isSystem && (
                        <div className="flex gap-1">
                          <button
                            className="rounded p-1 hover:bg-gray-100"
                            onClick={() => setEditingRole(role)}
                          >
                            <Edit className="h-4 w-4 text-gray-400" />
                          </button>
                          <button
                            className="rounded p-1 hover:bg-red-50"
                            onClick={() => handleDelete(role.id)}
                          >
                            <Trash2 className="h-4 w-4 text-red-400" />
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Create/Edit Role Modal */}
      <RoleModal
        isOpen={showCreateModal || !!editingRole}
        onClose={() => {
          setShowCreateModal(false);
          setEditingRole(null);
        }}
        role={editingRole}
        permissions={permissions}
        onCreate={handleCreate}
        onUpdate={handleUpdate}
        isLoading={createMutation.isPending || updateMutation.isPending}
      />
    </div>
  );
}

function RoleModal({
  isOpen,
  onClose,
  role,
  permissions,
  onCreate,
  onUpdate,
  isLoading,
}: {
  isOpen: boolean;
  onClose: () => void;
  role: AdminRole | null;
  permissions: import('@/types/admin').Permission[];
  onCreate: (payload: CreateAdminRolePayload) => void;
  onUpdate: (payload: UpdateAdminRolePayload) => void;
  isLoading: boolean;
}) {
  const [code, setCode] = useState(role?.code ?? '');
  const [name, setName] = useState(role?.name ?? '');
  const [description, setDescription] = useState(role?.description ?? '');
  const [selectedPerms, setSelectedPerms] = useState<Set<string>>(
    new Set(role?.permissions ?? []),
  );

  const groupedPermissions = permissions.reduce<Record<string, typeof permissions>>((acc, p) => {
    const group = p.resource.charAt(0).toUpperCase() + p.resource.slice(1);
    if (!acc[group]) acc[group] = [];
    acc[group].push(p);
    return acc;
  }, {});

  const togglePerm = (permId: string) => {
    setSelectedPerms((prev) => {
      const next = new Set(prev);
      if (next.has(permId)) next.delete(permId);
      else next.add(permId);
      return next;
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!code || !name) return;
    const permIds = Array.from(selectedPerms);
    if (role) {
      onUpdate({ name, description, permissionIds: permIds });
    } else {
      onCreate({ code, name, description, permissionIds: permIds });
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={role ? `Sửa vai trò: ${role.name}` : 'Tạo vai trò mới'}
      size="lg"
    >
      <form onSubmit={handleSubmit} className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <Input
            label="Mã vai trò"
            placeholder="VD: senior_dentist"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            disabled={!!role}
            required={!role}
          />
          <Input
            label="Tên hiển thị"
            placeholder="VD: Bác sĩ cao cấp"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
        </div>
        <Input
          label="Mô tả"
          placeholder="Mô tả ngắn về vai trò này"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />

        <div>
          <label className="mb-2 block text-sm font-medium text-gray-700">Quyền hạn</label>
          <div className="space-y-3 max-h-64 overflow-y-auto">
            {Object.entries(groupedPermissions).map(([group, perms]) => (
              <div key={group} className="rounded-lg border border-gray-200 p-3">
                <h4 className="mb-1.5 font-medium text-gray-900">{group}</h4>
                <div className="grid gap-2 sm:grid-cols-2">
                  {perms.map((perm) => (
                    <label key={perm.id} className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        className="h-4 w-4 rounded border-gray-300 text-brand-500"
                        checked={selectedPerms.has(perm.id)}
                        onChange={() => togglePerm(perm.id)}
                      />
                      <span className="text-sm text-gray-700" title={perm.description ?? undefined}>
                        {perm.code}
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="flex justify-end gap-3 pt-3 border-t border-gray-100">
          <Button variant="outline" type="button" onClick={onClose}>
            Hủy
          </Button>
          <Button type="submit" isLoading={isLoading} disabled={!code || !name}>
            {role ? 'Lưu thay đổi' : 'Tạo vai trò'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

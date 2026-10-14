import { useState } from 'react';
import { useTranslation } from 'react-i18next';
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
  const { t } = useTranslation();
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
      notify.success(t('uiWorkforce.rolesCreateSuccess'));
      setShowCreateModal(false);
    } catch {
      notify.error(t('uiWorkforce.rolesCreateError'));
    }
  };

  const handleUpdate = async (payload: Parameters<typeof updateMutation.mutateAsync>[0]) => {
    try {
      await updateMutation.mutateAsync(payload);
      notify.success(t('uiWorkforce.rolesUpdateSuccess'));
      setEditingRole(null);
    } catch {
      notify.error(t('uiWorkforce.rolesUpdateError'));
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteMutation.mutateAsync(id);
      notify.success(t('uiWorkforce.rolesDeleteSuccess'));
    } catch {
      notify.error(t('uiWorkforce.rolesDeleteError'));
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-surface-100">{t('uiWorkforce.rolesTitle')}</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-surface-400">
            {t('uiWorkforce.rolesDescription')}
          </p>
        </div>
        <Button onClick={() => setShowCreateModal(true)}>
          <Plus className="h-4 w-4" />
          {t('uiWorkforce.rolesCreate')}
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
                <tr className="border-b border-gray-100 bg-gray-50 dark:border-surface-800 dark:bg-surface-800">
                  <th className="px-4 py-3 font-medium text-gray-600 dark:text-surface-300">{t('uiWorkforce.rolesCode')}</th>
                  <th className="px-4 py-3 font-medium text-gray-600 dark:text-surface-300">{t('uiWorkforce.rolesName')}</th>
                  <th className="px-4 py-3 font-medium text-gray-600 dark:text-surface-300">{t('uiWorkforce.description')}</th>
                  <th className="px-4 py-3 font-medium text-gray-600 text-center dark:text-surface-300">{t('uiWorkforce.rolesUsers')}</th>
                  <th className="px-4 py-3 font-medium text-gray-600 text-center dark:text-surface-300">{t('uiWorkforce.rolesSystem')}</th>
                  <th className="px-4 py-3 font-medium text-gray-600 w-24"></th>
                </tr>
              </thead>
              <tbody>
                {roles.map((role) => (
                  <tr key={role.id} className="border-b border-gray-50 hover:bg-gray-50 dark:border-surface-800 dark:hover:bg-surface-800/60">
                    <td className="px-4 py-3 font-mono text-xs text-gray-500 dark:text-surface-400">{role.code}</td>
                    <td className="px-4 py-3 font-medium text-gray-900 dark:text-surface-100">{role.name}</td>
                    <td className="px-4 py-3 text-gray-600 dark:text-surface-300">{role.description}</td>
                    <td className="px-4 py-3 text-center">
                      <span className="inline-flex items-center gap-1 text-gray-600 dark:text-surface-300">
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
                            className="rounded p-1 hover:bg-gray-100 dark:hover:bg-surface-700"
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
      {/* key forces a remount per role so its internal useState (seeded from
          the `role` prop) re-initializes instead of keeping stale values
          from whichever role was edited previously. */}
      <RoleModal
        key={editingRole?.id ?? 'create'}
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
  const { t } = useTranslation();
  const [code, setCode] = useState(role?.code ?? '');
  const [name, setName] = useState(role?.name ?? '');
  const [description, setDescription] = useState(role?.description ?? '');
  // Keyed by permission CODE (e.g. 'patient.create'), not id — `role.permissions`
  // (from the list/get API) is already an array of codes, and the backend's
  // create/update DTOs expect `permissionCodes`. Using `perm.id` here used to
  // mean an existing role's permissions never showed as checked when editing
  // (codes never matched ids), and toggling sent ids where the API expects
  // codes — sent under the wrong field name (`permissionIds`) besides.
  const [selectedPerms, setSelectedPerms] = useState<Set<string>>(
    new Set(role?.permissions ?? []),
  );

  const groupedPermissions = permissions.reduce<Record<string, typeof permissions>>((acc, p) => {
    const group = p.resource.charAt(0).toUpperCase() + p.resource.slice(1);
    if (!acc[group]) acc[group] = [];
    acc[group].push(p);
    return acc;
  }, {});

  const togglePerm = (permCode: string) => {
    setSelectedPerms((prev) => {
      const next = new Set(prev);
      if (next.has(permCode)) next.delete(permCode);
      else next.add(permCode);
      return next;
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!code || !name) return;
    const permissionCodes = Array.from(selectedPerms);
    if (role) {
      onUpdate({ name, description, permissionCodes });
    } else {
      onCreate({ code, name, description, permissionCodes });
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={role ? t('uiWorkforce.roleEditTitle', { name: role.name }) : t('uiWorkforce.roleCreateTitle')}
      size="lg"
    >
      <form onSubmit={handleSubmit} className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <Input
            label={t('uiWorkforce.rolesCode')}
            placeholder="senior_dentist"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            disabled={!!role}
            required={!role}
          />
          <Input
            label={t('uiWorkforce.rolesName')}
            placeholder={t('uiWorkforce.roleNamePlaceholder')}
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
        </div>
        <Input
          label={t('uiWorkforce.description')}
          placeholder={t('uiWorkforce.roleDescriptionPlaceholder')}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />

        <div>
          <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-surface-200">{t('uiWorkforce.rolePermissions')}</label>
          <div className="space-y-3 max-h-64 overflow-y-auto">
            {Object.entries(groupedPermissions).map(([group, perms]) => (
              <div key={group} className="rounded-lg border border-gray-200 p-3 dark:border-surface-700">
                <h4 className="mb-1.5 font-medium text-gray-900 dark:text-surface-100">{group}</h4>
                <div className="grid gap-2 sm:grid-cols-2">
                  {perms.map((perm) => (
                    <label key={perm.id} className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        className="h-4 w-4 rounded border-gray-300 text-brand-500"
                        checked={selectedPerms.has(perm.code)}
                        onChange={() => togglePerm(perm.code)}
                      />
                      <span className="text-sm text-gray-700 dark:text-surface-200" title={perm.description ?? undefined}>
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
            {t('uiWorkforce.roleCancel')}
          </Button>
          <Button type="submit" isLoading={isLoading} disabled={!code || !name}>
            {role ? t('uiWorkforce.roleSave') : t('uiWorkforce.rolesCreate')}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

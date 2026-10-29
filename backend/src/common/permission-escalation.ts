import { HttpStatus } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { BusinessRuleException } from './exceptions/business-rule.exception';

type Db = Prisma.TransactionClient;

/** The built-in administrator role (seeded, its permissions not editable). */
const SYSTEM_ADMIN_ROLE = 'clinic_admin';

/**
 * No escalation through the admin screens (BR-ADM-001): whoever manages
 * roles and accounts can only hand out, take away or act on permissions
 * they hold themselves. The system clinic_admin role is never stopped: it
 * does not hold the clinical write permissions (treatment, chart,
 * prescription…) by design, yet it must still create dentists and manage
 * their accounts. A custom "office manager" role with user.update cannot
 * make itself (or anyone) an admin, and one with role.upsert cannot add
 * codes it does not have to a role.
 *
 * Read from the database, not the access token: a token minted before a
 * role change must not keep powers that were taken away.
 */
export async function permissionCodesOfUser(db: Db, userId: string): Promise<Set<string>> {
  const rows = await db.rolePermission.findMany({
    where: {
      role: { deletedAt: null, userRoles: { some: { userId } } },
    },
    select: { permission: { select: { code: true } } },
  });
  return new Set((rows ?? []).map(r => r.permission.code));
}

export async function permissionCodesOfRoles(db: Db, roleIds: string[]): Promise<Set<string>> {
  if (roleIds.length === 0) return new Set();
  const rows = await db.rolePermission.findMany({
    where: { roleId: { in: roleIds } },
    select: { permission: { select: { code: true } } },
  });
  return new Set((rows ?? []).map(r => r.permission.code));
}

/** 403 PERMISSION_ESCALATION when `codes` holds a permission the actor lacks. */
export async function assertActorHolds(
  db: Db,
  actorUserId: string,
  codes: Iterable<string>,
): Promise<void> {
  const wanted = [...new Set(codes)];
  if (wanted.length === 0) return;
  const rows = await db.rolePermission.findMany({
    where: {
      role: { deletedAt: null, userRoles: { some: { userId: actorUserId } } },
    },
    select: { permission: { select: { code: true } }, role: { select: { code: true } } },
  });
  if ((rows ?? []).some(r => r.role?.code === SYSTEM_ADMIN_ROLE)) return;
  const held = new Set((rows ?? []).map(r => r.permission.code));
  const missing = wanted.filter(code => !held.has(code)).sort();
  if (missing.length > 0) {
    throw new BusinessRuleException(
      `Bạn không có các quyền này nên không thể cấp, thu hồi hay thao tác trên tài khoản có chúng: ${missing.join(', ')}`,
      HttpStatus.FORBIDDEN,
      { missing },
      'PERMISSION_ESCALATION',
    );
  }
}

/** The actor may manage `targetUserId` only if they hold everything the target holds. */
export async function assertActorOutranks(
  db: Db,
  actorUserId: string,
  targetUserId: string,
): Promise<void> {
  if (actorUserId === targetUserId) return;
  await assertActorHolds(db, actorUserId, await permissionCodesOfUser(db, targetUserId));
}

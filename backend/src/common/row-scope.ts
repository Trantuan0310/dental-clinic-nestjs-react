import { ForbiddenException } from '@nestjs/common';
import { JwtPayload } from './guards/permissions.guard';

/**
 * Row-level scope (A6-19): the single rule every module uses to decide which
 * rows a caller may see or act on.
 *
 *   - 'any'  — holds `<resource>.read.any`: every row.
 *   - 'own'  — holds `<resource>.read.own` (and not .any): only rows of the
 *              caller's own patients / appointments / encounters.
 *   - 'none' — holds neither. DENY by default: a custom role that was given
 *              a write permission (update, cancel…) or an FE alias such as
 *              `invoice.read` without a matching read scope must not fall
 *              through to "every row".
 *
 * Callers that only distinguish "clinic-wide or not" use {@link isRowScoped}
 * and then filter to `actor.sub` — for a 'none' caller that matches nothing
 * (or only their own rows), which is the safe outcome.
 */
export type RowScope = 'any' | 'own' | 'none';

export type ScopedResource = 'appointment' | 'encounter' | 'invoice' | 'patient';

export function rowScope(
  actor: Pick<JwtPayload, 'permissions'>,
  resource: ScopedResource,
): RowScope {
  const perms = actor.permissions;
  if (resource === 'patient') {
    // Patients have no .read.any/.own codes: roster-management permissions
    // mean clinic-wide, but never for a caller whose appointments are
    // themselves limited to their own (a dentist-like custom role holding
    // patient.update must not see the whole roster while its calendar is
    // row-scoped).
    if (rowScope(actor, 'appointment') !== 'any' && perms.includes('appointment.read.own')) {
      return 'own';
    }
    if (perms.includes('patient.update') || perms.includes('patient.delete')) return 'any';
    return perms.includes('patient.read') ? 'own' : 'none';
  }
  if (perms.includes(`${resource}.read.any`)) return 'any';
  if (perms.includes(`${resource}.read.own`)) return 'own';
  return 'none';
}

const SCOPE_NAMES: Record<ScopedResource, string> = {
  appointment: 'lịch hẹn toàn phòng khám (appointment.read.any)',
  encounter: 'phiên khám toàn phòng khám (encounter.read.any)',
  invoice: 'hóa đơn toàn phòng khám (invoice.read.any)',
  patient: 'hồ sơ bệnh nhân toàn phòng khám (patient.update, không giới hạn lịch của mình)',
};

/**
 * For screens that search or pick among every clinic record (e.g. matching
 * an online request to existing patients): the caller must see that
 * resource clinic-wide, or get a 403 naming what is missing — not a side
 * door around the row scope.
 */
export function assertClinicWide(
  actor: Pick<JwtPayload, 'permissions'>,
  ...resources: ScopedResource[]
): void {
  const missing = resources.filter(r => rowScope(actor, r) !== 'any');
  if (missing.length) {
    throw new ForbiddenException(
      'Vai trò của bạn chưa được xem ' +
        missing.map(r => SCOPE_NAMES[r]).join(' và ') +
        '. Nhờ quản trị viên bổ sung quyền ở Quản trị → Vai trò.',
    );
  }
}

/** True unless the caller sees every row of `resource` ('own' and 'none' alike). */
export function isRowScoped(
  actor: Pick<JwtPayload, 'permissions'>,
  resource: ScopedResource,
): boolean {
  return rowScope(actor, resource) !== 'any';
}

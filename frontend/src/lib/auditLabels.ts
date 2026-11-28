import type { TFunction } from 'i18next';

/**
 * A readable name for an audit-log action code ("APPOINTMENT_CANCELLED" →
 * "Lịch hẹn — đã hủy"): the longest known subject followed by a known verb,
 * from uiWorkforce.auditCodes. Codes it cannot split stay as they are.
 */
export function auditActionLabel(code: string, t: TFunction): string {
  const parts = code.split('_');
  for (let i = parts.length - 1; i >= 1; i--) {
    const noun = parts.slice(0, i).join('_');
    const verb = parts.slice(i).join('_');
    const n = t(`uiWorkforce.auditCodes.noun.${noun}`, { defaultValue: '' });
    const v = t(`uiWorkforce.auditCodes.verb.${verb}`, { defaultValue: '' });
    if (n && v) return `${n} — ${v}`;
  }
  const only = t(`uiWorkforce.auditCodes.verb.${code}`, { defaultValue: '' });
  return only ? only.charAt(0).toUpperCase() + only.slice(1) : code;
}

/** A readable name for an audit-log target type, whatever its case. */
export function auditTargetLabel(type: string | null | undefined, t: TFunction): string {
  if (!type) return '';
  return t(`uiWorkforce.auditCodes.target.${type.toLowerCase()}`, { defaultValue: type });
}

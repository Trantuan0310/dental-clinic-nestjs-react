import { i18n } from './index';

/**
 * A code → label map whose values follow the UI language. Each value is
 * looked up through i18n when it is read (during render), so `MAP[code]` and
 * `Object.entries(MAP)` call sites keep working in both languages. Pass the
 * i18n key for each code, e.g. `{ WAITING: 'uiOperations.queueWaiting' }`.
 *
 * Do not copy the values into module-level constants: those would keep the
 * language that was active when the module loaded.
 */
export function translatedLabels<K extends string>(keys: Record<K, string>): Record<K, string> {
  const labels = {} as Record<K, string>;
  for (const [code, key] of Object.entries(keys) as [K, string][]) {
    Object.defineProperty(labels, code, { enumerable: true, get: () => i18n.t(key) });
  }
  return labels;
}

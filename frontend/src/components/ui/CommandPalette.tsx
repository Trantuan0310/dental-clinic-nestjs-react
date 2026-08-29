import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { Search as SearchIcon, ArrowRight, History, X, User, FileText, Receipt } from 'lucide-react';
import { cn } from '@/lib/cn';
import { api, type AuthEnvelope, unwrap } from '@/lib/api';
import { useAuthStore } from '@/stores/authStore';
import { buildNavGroups } from '@/lib/nav';
import { Tooltip } from '@/components/ui/Tooltip';
import type { LucideIcon } from 'lucide-react';

/**
 * Lightweight fuzzy matcher: case-insensitive substring scoring with
 * consecutive-character and start-of-word boosts.
 * Good enough for ~30 nav entries; we don't pull in fuse.js for this size.
 */
function fuzzyScore(needle: string, haystack: string): number {
  if (!needle) return 1;
  const n = needle.toLowerCase();
  const h = haystack.toLowerCase();
  if (h.includes(n)) {
    if (h.startsWith(n)) return 100;
    if (h.includes(' ' + n)) return 80;
    return 60;
  }
  let i = 0;
  let j = 0;
  let streak = 0;
  let score = 0;
  while (i < n.length && j < h.length) {
    if (n[i] === h[j]) {
      streak += 1;
      score += 1 + streak;
      i += 1;
    } else {
      streak = 0;
    }
    j += 1;
  }
  return i === n.length ? score : 0;
}

interface PaletteItem {
  id: string;
  to: string;
  /** Translation key for the item label (resolved via `t(\`nav.\${labelKey}\`)`). */
  labelKey?: string;
  /** Pre-translated label (used for entity search results). */
  label?: string;
  /** Translation key for the group label. */
  groupKey: string;
  hint?: string;
  icon: LucideIcon;
}

interface EntityHit {
  kind: 'patient' | 'appointment' | 'invoice';
  id: string;
  to: string;
  label: string;
  hint?: string;
  icon: LucideIcon;
}

const RECENT_STORAGE_KEY = 'gensmile.commandPalette.recent';
const THEME_TOGGLE_ID = 'theme.toggle';
const ENTITY_QUERY_MIN = 2;
const ENTITY_QUERY_DEBOUNCE_MS = 250;
const ENTITY_LIMIT = 5;

async function get<T>(url: string, config?: { params?: Record<string, unknown> }) {
  const { data } = await api.get<AuthEnvelope<T>>(url, config);
  return unwrap(data) as T;
}

function loadRecent(): string[] {
  if (typeof localStorage === 'undefined') return [];
  try {
    const raw = localStorage.getItem(RECENT_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string').slice(0, 5) : [];
  } catch {
    return [];
  }
}

function saveRecent(ids: string[]) {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(RECENT_STORAGE_KEY, JSON.stringify(ids.slice(0, 5)));
  } catch {
    /* noop */
  }
}

export function CommandPalette() {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIdx, setActiveIdx] = useState(0);
  const [recentIds, setRecentIds] = useState<string[]>(() => loadRecent());
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const hasPermission = useAuthStore((s) => s.hasPermission);

  // Global ⌘K / Ctrl+K shortcut.
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const isK = event.key === 'k' || event.key === 'K';
      const meta = event.metaKey || event.ctrlKey;
      if (isK && meta) {
        event.preventDefault();
        setOpen((v) => !v);
      } else if (event.key === 'Escape' && open) {
        setOpen(false);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  // Reset state on each open; focus input.
  useEffect(() => {
    if (open) {
      setQuery('');
      setActiveIdx(0);
      const handle = window.setTimeout(() => inputRef.current?.focus(), 30);
      return () => window.clearTimeout(handle);
    }
  }, [open]);

  const navItems = useMemo<PaletteItem[]>(() => {
    if (!user) return [];
    return buildNavGroups(user.roles)
      .flatMap((g) =>
        g.items
          .filter((i) => {
            if (i.permission && !hasPermission(i.permission)) return false;
            if (i.anyPermission && !i.anyPermission.some((p) => hasPermission(p))) return false;
            return true;
          })
          .map<PaletteItem>((i) => ({
            id: i.to,
            to: i.to,
            labelKey: i.labelKey,
            groupKey: g.titleKey,
            icon: i.icon,
          })),
      );
  }, [user, hasPermission]);

  // Theme toggle utility action. We use a stable id so it survives locale changes.
  const utilityItems = useMemo<PaletteItem[]>(
    () => [
      {
        id: THEME_TOGGLE_ID,
        to: THEME_TOGGLE_ID,
        labelKey: 'command.actions.toggleTheme',
        groupKey: 'command.groups.actions',
        icon: History,
      },
    ],
    [],
  );

  const allItems = useMemo<PaletteItem[]>(() => [...utilityItems, ...navItems], [utilityItems, navItems]);

  const recentItems = useMemo(
    () => recentIds.map((id) => allItems.find((it) => it.id === id)).filter(Boolean) as PaletteItem[],
    [recentIds, allItems],
  );

  // Debounce the query string before triggering entity search. We keep the
  // command palette responsive (matches nav instantly) while limiting backend
  // traffic when users type.
  const [debouncedQuery, setDebouncedQuery] = useState('');
  useEffect(() => {
    if (!query) {
      setDebouncedQuery('');
      return;
    }
    const handle = window.setTimeout(() => setDebouncedQuery(query), ENTITY_QUERY_DEBOUNCE_MS);
    return () => window.clearTimeout(handle);
  }, [query]);

  const entityEnabled =
    !!user && debouncedQuery.trim().length >= ENTITY_QUERY_MIN && /^\d{3,}/.test(debouncedQuery.trim()) === false;

  const { data: patientHits = [], isFetching: patientsFetching } = useQuery({
    enabled: entityEnabled,
    queryKey: ['command-palette', 'patients', debouncedQuery],
    queryFn: async (): Promise<EntityHit[]> => {
      const res = await get<{ data: Array<{ id: string; code: string; fullName: string; primaryPhone?: string | null }> }>(
        '/patients',
        { params: { q: debouncedQuery, pageSize: ENTITY_LIMIT, status: 'active' } },
      );
      return res.data.map((p) => ({
        kind: 'patient',
        id: `patient:${p.id}`,
        to: `/patients/${p.id}`,
        label: p.fullName,
        hint: `${p.code}${p.primaryPhone ? ` · ${p.primaryPhone}` : ''}`,
        icon: User,
      }));
    },
    staleTime: 60_000,
  });

  const { data: appointmentHits = [], isFetching: appointmentsFetching } = useQuery({
    enabled: entityEnabled,
    queryKey: ['command-palette', 'appointments', debouncedQuery],
    queryFn: async (): Promise<EntityHit[]> => {
      try {
        const res = await get<{
          data: Array<{
            id: string;
            patientName?: string;
            patientCode?: string;
            startsAt?: string;
            status?: string;
          }>;
        }>('/appointments', { params: { q: debouncedQuery, pageSize: ENTITY_LIMIT } });
        return (res.data ?? []).map((a) => ({
          kind: 'appointment' as const,
          id: `appointment:${a.id}`,
          to: `/appointments/${a.id}`,
          label: a.patientName ?? 'Cuộc hẹn',
          hint: `${a.patientCode ?? ''}${a.startsAt ? ` · ${new Date(a.startsAt).toLocaleString('vi-VN')}` : ''}`,
          icon: FileText,
        }));
      } catch {
        return [];
      }
    },
    staleTime: 60_000,
  });

  const { data: invoiceHits = [], isFetching: invoicesFetching } = useQuery({
    enabled: entityEnabled,
    queryKey: ['command-palette', 'invoices', debouncedQuery],
    queryFn: async (): Promise<EntityHit[]> => {
      try {
        const res = await get<{
          data: Array<{
            id: string;
            code: string;
            patientName: string;
            status: string;
            total?: number;
          }>;
        }>('/invoices', { params: { q: debouncedQuery, pageSize: ENTITY_LIMIT } });
        return (res.data ?? []).map((inv) => ({
          kind: 'invoice' as const,
          id: `invoice:${inv.id}`,
          to: `/invoices/${inv.id}`,
          label: `${inv.code} · ${inv.patientName}`,
          hint: `Trạng thái: ${inv.status}`,
          icon: Receipt,
        }));
      } catch {
        return [];
      }
    },
    staleTime: 60_000,
  });

  const entityHits = useMemo<EntityHit[]>(
    () => [...patientHits, ...appointmentHits, ...invoiceHits],
    [patientHits, appointmentHits, invoiceHits],
  );
  const isSearchingEntities = patientsFetching || appointmentsFetching || invoicesFetching;

  // Map entity hits → palette items so they participate in the same list + filter.
  const entityItems = useMemo<PaletteItem[]>(
    () =>
      entityHits.map((h) => ({
        id: h.id,
        to: h.to,
        label: h.label,
        groupKey: `entities.${h.kind}`,
        hint: h.hint,
        icon: h.icon,
      })),
    [entityHits],
  );

  // Build a translated haystack at query-time so we match against the active locale.
  const getHaystack = (item: PaletteItem): string => {
    const label = item.label ?? (item.labelKey
      ? item.labelKey.startsWith('command.')
        ? t(item.labelKey, item.labelKey)
        : t(`nav.${item.labelKey}`, item.labelKey)
      : '');
    const group = item.groupKey.startsWith('entities.')
      ? t(`command.entityGroups.${item.groupKey.slice('entities.'.length)}`, item.groupKey)
      : item.groupKey.startsWith('command.')
        ? t(item.groupKey, item.groupKey)
        : t(`nav.groups.${item.groupKey}`, item.groupKey);
    return `${label} ${group} ${item.hint ?? ''}`;
  };

  const filtered = useMemo<PaletteItem[]>(() => {
    if (!query) {
      return [...recentItems, ...allItems];
    }
    const scoredNav = allItems.map((item) => ({
      item,
      score: fuzzyScore(query, getHaystack(item)),
      kind: 'nav' as const,
    }));
    const scoredEntities = entityItems.map((item) => ({
      item,
      score: fuzzyScore(query, getHaystack(item)),
      kind: 'entity' as const,
    }));
    const all = [...scoredEntities, ...scoredNav];
    const matched = all.filter((s) => s.score > 0).sort((a, b) => {
      if (a.kind !== b.kind) return a.kind === 'entity' ? -1 : 1;
      return b.score - a.score;
    });
    const seen = new Set<string>();
    return matched.flatMap(({ item }) => (seen.has(item.id) ? [] : (seen.add(item.id), [item])));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, allItems, recentItems, entityItems, t]);

  useEffect(() => {
    setActiveIdx(0);
  }, [query]);

  function commit(item: PaletteItem) {
    if (item.id === THEME_TOGGLE_ID) {
      window.dispatchEvent(new CustomEvent('gensmile:toggle-theme'));
      setOpen(false);
      return;
    }
    navigate(item.to);
    setOpen(false);
    setRecentIds((prev) => {
      const next = [item.id, ...prev.filter((id) => id !== item.id)];
      saveRecent(next);
      return next;
    });
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIdx((i) => Math.min(i + 1, filtered.length - 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIdx((i) => Math.max(i - 1, 0));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const pick = filtered[activeIdx];
      if (pick) commit(pick);
    }
  }

  if (!user) return null;

  return (
    <>
      {/* Trigger hint — small inline button in header (optional) */}
      <Tooltip
        label={
          <span>
            {t('command.tooltip')}
          </span>
        }
      >
        <button
          type="button"
          aria-label={t('command.triggerLabel')}
          onClick={() => setOpen(true)}
          className={cn(
            'inline-flex h-8 items-center gap-2 rounded-md border border-gray-200 bg-white px-2.5 text-xs text-gray-500 hover:bg-gray-50 dark:border-surface-700 dark:bg-surface-800 dark:text-surface-400 dark:hover:bg-surface-700',
          )}
        >
          <SearchIcon className="h-3.5 w-3.5" aria-hidden="true" />
          <span className="hidden md:inline">{t('command.trigger')}</span>
          <kbd className="hidden rounded bg-gray-100 px-1.5 py-0.5 font-mono text-[10px] text-gray-500 md:inline dark:bg-surface-700 dark:text-surface-300">
            ⌘K
          </kbd>
        </button>
      </Tooltip>

      {open && (
        <div
          className="fixed inset-0 z-[60] flex items-start justify-center bg-black/40 px-4 pt-[12vh] backdrop-blur-sm dark:bg-black/60"
          role="dialog"
          aria-modal="true"
          aria-label="Command Palette"
          onKeyDown={onKeyDown}
        >
          <div className="absolute inset-0" onClick={() => setOpen(false)} aria-hidden />
          <div
            className={cn(
              'relative z-10 w-full max-w-xl overflow-hidden rounded-xl border border-gray-200 bg-white shadow-2xl',
              'dark:border-surface-700 dark:bg-surface-900 dark:shadow-black/60',
            )}
          >
            <div className="flex items-center gap-2 border-b border-gray-200 px-4 py-3 dark:border-surface-700">
              <SearchIcon className="h-4 w-4 shrink-0 text-gray-400 dark:text-surface-500" aria-hidden="true" />
              <input
                ref={inputRef}
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t('command.placeholder')}
                aria-label="Command Palette input"
                aria-controls="command-palette-listbox"
                className="flex-1 bg-transparent text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none dark:text-surface-100 dark:placeholder:text-surface-500"
              />
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label={t('common.cancel')}
                className="rounded-md p-1 text-gray-400 hover:bg-gray-100 dark:text-surface-500 dark:hover:bg-surface-800"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>

            <div
              id="command-palette-listbox"
              role="listbox"
              aria-label="Command Palette results"
              className="max-h-[60vh] overflow-y-auto py-2"
            >
              {isSearchingEntities && query.trim().length >= ENTITY_QUERY_MIN && (
                <div className="flex items-center gap-2 border-b border-gray-100 px-4 py-2 text-xs text-gray-500 dark:border-surface-700 dark:text-surface-400">
                  <span className="h-3 w-3 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" />
                  <span>{t('command.searching')}</span>
                </div>
              )}
              {filtered.length === 0 ? (
                <p className="px-4 py-6 text-center text-sm text-gray-500 dark:text-surface-400">
                  {t('command.empty', { query })}
                </p>
              ) : (
                renderGroups(filtered, recentItems, query, activeIdx, setActiveIdx, commit, t)
              )}
            </div>

            <div className="flex items-center justify-between border-t border-gray-200 px-3 py-2 text-[11px] text-gray-500 dark:border-surface-700 dark:text-surface-400">
              <span className="inline-flex items-center gap-2">
                <kbd className="rounded bg-gray-100 px-1.5 py-0.5 font-mono dark:bg-surface-700 dark:text-surface-300">↑↓</kbd>
                {t('command.footer.navigate')}
                <kbd className="rounded bg-gray-100 px-1.5 py-0.5 font-mono dark:bg-surface-700 dark:text-surface-300">Enter</kbd>
                {t('command.footer.select')}
                <kbd className="rounded bg-gray-100 px-1.5 py-0.5 font-mono dark:bg-surface-700 dark:text-surface-300">Esc</kbd>
                {t('command.footer.close')}
              </span>
              <span>{t('command.footer.count', { count: filtered.length })}</span>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function getLabel(item: PaletteItem, t: ReturnType<typeof useTranslation>['t']): string {
  if (item.label) return item.label;
  if (!item.labelKey) return '';
  if (item.labelKey.startsWith('command.')) return t(item.labelKey, item.labelKey);
  return t(`nav.${item.labelKey}`, item.labelKey);
}

function getGroupLabel(item: PaletteItem, t: ReturnType<typeof useTranslation>['t']): string {
  if (item.groupKey.startsWith('entities.')) {
    const kind = item.groupKey.slice('entities.'.length);
    return t(`command.entityGroups.${kind}`, kind);
  }
  if (item.groupKey.startsWith('command.')) return t(item.groupKey, item.groupKey);
  return t(`nav.groups.${item.groupKey}`, item.groupKey);
}

function renderGroups(
  items: PaletteItem[],
  recent: PaletteItem[],
  query: string,
  activeIdx: number,
  setActiveIdx: (i: number) => void,
  commit: (item: PaletteItem) => void,
  t: ReturnType<typeof useTranslation>['t'],
) {
  // Group by group label while preserving order.
  const groups: Array<{ title: string; items: PaletteItem[] }> = [];
  for (const item of items) {
    const last = groups[groups.length - 1];
    const title = getGroupLabel(item, t);
    if (last && last.title === title) last.items.push(item);
    else groups.push({ title, items: [item] });
  }

  const showRecent = !query && recent.length > 0;
  let cursor = 0;

  return (
    <div>
      {showRecent && (
        <div>
          <p className="px-4 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-surface-500">
            {t('command.groups.recent')}
          </p>
          <ul role="group">
            {recent.map((item) => {
              const idx = cursor++;
              return (
                <Row
                  key={`recent-${item.id}`}
                  item={item}
                  active={idx === activeIdx}
                  onHover={() => setActiveIdx(idx)}
                  onClick={() => commit(item)}
                  label={getLabel(item, t)}
                  badge={<History className="h-3 w-3 text-gray-400 dark:text-surface-500" aria-hidden="true" />}
                />
              );
            })}
          </ul>
        </div>
      )}
      {groups.map((g) => (
        <div key={g.title}>
          <p className="px-4 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-surface-500">
            {g.title}
          </p>
          <ul role="group">
            {g.items.map((item) => {
              const idx = cursor++;
              return (
                <Row
                  key={item.id}
                  item={item}
                  active={idx === activeIdx}
                  onHover={() => setActiveIdx(idx)}
                  onClick={() => commit(item)}
                  label={getLabel(item, t)}
                />
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}

function Row({
  item,
  active,
  onHover,
  onClick,
  badge,
  label,
}: {
  item: PaletteItem;
  active: boolean;
  onHover: () => void;
  onClick: () => void;
  badge?: React.ReactNode;
  label: string;
}) {
  const Icon = item.icon;
  return (
    <li>
      <button
        type="button"
        role="option"
        aria-selected={active}
        onMouseMove={onHover}
        onClick={onClick}
        className={cn(
          'flex w-full items-center gap-3 px-4 py-2 text-left text-sm',
          active
            ? 'bg-brand-50 text-brand-700 dark:bg-brand-900/30 dark:text-brand-200'
            : 'text-gray-700 dark:text-surface-200',
        )}
      >
        <Icon className="h-4 w-4 shrink-0 opacity-70" aria-hidden="true" />
        <span className="flex-1 truncate">{label}</span>
        {item.hint && <span className="text-xs text-gray-400 dark:text-surface-500">{item.hint}</span>}
        {badge}
        {active && <ArrowRight className="h-3.5 w-3.5 opacity-60" aria-hidden="true" />}
      </button>
    </li>
  );
}
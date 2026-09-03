import { NavLink, useLocation } from 'react-router-dom';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronDown, ChevronLeft, Menu, X } from 'lucide-react';
import { cn } from '@/lib/cn';
import { useAuthStore } from '@/stores/authStore';
import { buildNavGroups } from '@/lib/nav';
import { BrandBadge } from '@/components/brand';

interface SidebarContentProps {
  collapsed?: boolean;
  onNavigate?: () => void;
  /**
   * Render the brand header (icon + GENSMILE wordmark) at the top of the
   * sidebar. The desktop sidebar lives beside the global <Header>, which
   * already shows the brand, so we hide it there to avoid duplication.
   * The mobile drawer still renders it (showBrand defaults to true).
   */
  showBrand?: boolean;
}

/**
 * Shared navigation body used by both desktop sidebar and mobile drawer.
 * Filters nav groups by user permissions and renders grouped nav links.
 */
export function SidebarContent({
  collapsed = false,
  onNavigate,
  showBrand = true,
}: SidebarContentProps) {
  const { t } = useTranslation();
  const user = useAuthStore((s) => s.user);
  const hasPermission = useAuthStore((s) => s.hasPermission);

  if (!user) return null;

  const groups = buildNavGroups(user.roles)
    .map((g) => ({
      ...g,
      items: g.items.filter((i) => {
        if (i.permission && !hasPermission(i.permission)) return false;
        if (i.anyPermission && !i.anyPermission.some((p) => hasPermission(p))) return false;
        return true;
      }),
    }))
    .filter((g) => g.items.length > 0);

  return (
    <>
      {showBrand && (
        <div
          className={cn(
            'flex items-center border-b border-gray-100 dark:border-surface-700',
            collapsed ? 'justify-center px-2 py-3' : 'gap-2.5 px-4 py-3',
          )}
        >
          {collapsed ? <BrandBadge collapsed /> : <BrandBadge />}
        </div>
      )}
      <nav className="flex-1 overflow-y-auto px-3 py-4 scrollbar-thin" aria-label={t('shell.menu.dialogLabel')}>
        {groups.map((group) => (
          <div key={group.titleKey} className="mb-5">
            {!collapsed && (
              <p className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-surface-500">
                {t(`nav.groups.${group.titleKey}`, group.titleKey)}
              </p>
            )}
            <ul className="space-y-1">
              {group.items.map((item) => {
                const Icon = item.icon;
                const hasChildren = !!item.children?.length;
                const label = t(`nav.${item.labelKey}`, item.labelKey);
                if (!hasChildren) {
                  return (
                    <li key={item.to}>
                      <NavLink
                        to={item.to}
                        end={item.to === '/'}
                        onClick={onNavigate}
                        className={({ isActive }) =>
                          cn(
                            'flex items-center gap-2.5 rounded-md text-sm font-medium transition-colors',
                            collapsed ? 'justify-center px-2 py-2.5' : 'px-3 py-2.5',
                            isActive
                              ? 'bg-brand-50 text-brand-700 dark:bg-brand-900/30 dark:text-brand-300'
                              : 'text-gray-700 hover:bg-gray-100 dark:text-surface-300 dark:hover:bg-surface-800',
                          )
                        }
                        title={collapsed ? label : undefined}
                      >
                        <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                        {!collapsed && <span className="truncate">{label}</span>}
                      </NavLink>
                    </li>
                  );
                }
                return (
                  <NavItemWithChildren
                    key={item.to}
                    to={item.to}
                    labelKey={item.labelKey}
                    icon={Icon}
                    children={item.children ?? []}
                    collapsed={collapsed}
                    onNavigate={onNavigate}
                  />
                );
              })}
            </ul>
          </div>
        ))}
      </nav>
    </>
  );
}

interface SidebarProps {
  mobileOpen: boolean;
  onMobileClose: () => void;
  /**
   * Controlled collapsed state. AppShell owns this so it can apply the
   * matching margin to `<main>` while the sidebar is sticky.
   */
  collapsed: boolean;
  onToggleCollapsed: () => void;
}

/**
 * Top-level layout chrome: persistent sidebar on md+, slide-in drawer on small screens.
 * The drawer is controlled by `mobileOpen` (set by the hamburger button in Header).
 *
 * The desktop aside is `position: sticky` so it stays visible while content
 * scrolls; width is toggled between expanded (224px) and collapsed (68px)
 * via the `collapsed` prop. In AppShell the right column (Header + <main>)
 * flexes to fill the remaining width, so content never sits under the sidebar.
 */
export function Sidebar({ mobileOpen, onMobileClose, collapsed, onToggleCollapsed }: SidebarProps) {
  const { t } = useTranslation();

  return (
    <>
      {/* Desktop sidebar (md+) */}
      <aside
        className={cn(
          'sticky top-0 hidden h-screen shrink-0 border-r border-gray-200 bg-white transition-[width] duration-200 md:block dark:border-surface-700 dark:bg-surface-900',
          collapsed ? 'w-[68px]' : 'w-[224px]',
        )}
        aria-label={t('shell.menu.dialogLabel')}
      >
        <div className="flex h-full flex-col">
          <button
            type="button"
            onClick={onToggleCollapsed}
            aria-label={collapsed ? t('shell.sidebar.expand') : t('shell.sidebar.collapse')}
            aria-expanded={!collapsed}
            className="flex items-center justify-center gap-1 border-b border-gray-100 px-3 py-2.5 text-xs text-gray-500 hover:bg-gray-50 dark:border-surface-700 dark:text-surface-400 dark:hover:bg-surface-800"
          >
            {collapsed ? <Menu className="h-4 w-4" aria-hidden="true" /> : (
              <>
                <ChevronLeft className="h-4 w-4" aria-hidden="true" /> {t('shell.sidebar.collapseShort')}
              </>
            )}
          </button>
          <SidebarContent collapsed={collapsed} showBrand={false} />
        </div>
      </aside>

      {/* Mobile drawer (<md) */}
      <MobileSidebar open={mobileOpen} onClose={onMobileClose} />
    </>
  );
}

interface MobileSidebarProps {
  open: boolean;
  onClose: () => void;
}

function MobileSidebar({ open, onClose }: MobileSidebarProps) {
  const { t } = useTranslation();
  return (
    <div
      className={cn(
        'fixed inset-0 z-50 md:hidden',
        open ? 'pointer-events-auto' : 'pointer-events-none',
      )}
      aria-hidden={!open}
    >
      {/* Backdrop */}
      <div
        className={cn(
          'absolute inset-0 bg-black/50 transition-opacity duration-200',
          open ? 'opacity-100' : 'opacity-0',
        )}
        onClick={onClose}
        aria-hidden="true"
      />
      {/* Panel */}
      <aside
        className={cn(
          'absolute left-0 top-0 flex h-full w-72 max-w-[85vw] flex-col bg-white shadow-xl transition-transform duration-200 dark:bg-surface-900 dark:shadow-black/40',
          open ? 'translate-x-0' : '-translate-x-full',
        )}
        role="dialog"
        aria-modal="true"
        aria-label={t('shell.menu.dialogLabel')}
      >
        <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3 dark:border-surface-700">
          <BrandBadge />
          <button
            type="button"
            onClick={onClose}
            aria-label={t('shell.menu.close')}
            className="rounded-md p-1.5 text-gray-500 hover:bg-gray-100 dark:text-surface-400 dark:hover:bg-surface-800"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
        <div className="flex flex-1 flex-col overflow-hidden">
          <SidebarContent onNavigate={onClose} showBrand={false} />
        </div>
      </aside>
    </div>
  );
}

// -----------------------------------------------------------------------------
// NavItemWithChildren — collapsible parent with nested children.
// - Auto-opens when a child route is active.
// - In collapsed mode, parent links to first child (sidebar shows only icons).
// -----------------------------------------------------------------------------

interface NavItemWithChildrenProps {
  to: string;
  labelKey: string;
  icon?: React.ComponentType<{ className?: string }>;
  children: {
    to: string;
    labelKey: string;
    icon: React.ComponentType<{ className?: string }>;
  }[];
  collapsed: boolean;
  onNavigate?: () => void;
}

function NavItemWithChildren({
  to,
  labelKey,
  icon: ParentIconProp,
  children,
  collapsed,
  onNavigate,
}: NavItemWithChildrenProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const location = useLocation();
  const childPaths = children.map((c) => c.to);
  const hasActiveChild = childPaths.some((p) => location.pathname.startsWith(p));
  const ParentIcon = ParentIconProp ?? children[0]?.icon;
  const label = t(`nav.${labelKey}`, labelKey);
  const childrenId = `nav-children-${to.replace(/[^a-zA-Z0-9]/g, '-')}`;

  return (
    <li>
      {collapsed ? (
        <NavLink
          to={to}
          onClick={onNavigate}
          className={({ isActive }) =>
            cn(
              'flex items-center justify-center rounded-md px-2 py-2.5 text-sm font-medium transition-colors',
              isActive || hasActiveChild
                ? 'bg-brand-50 text-brand-700 dark:bg-brand-900/30 dark:text-brand-300'
                : 'text-gray-700 hover:bg-gray-100 dark:text-surface-300 dark:hover:bg-surface-800',
            )
          }
          title={label}
          aria-label={label}
        >
          {ParentIcon ? <ParentIcon className="h-4 w-4 shrink-0" aria-hidden="true" /> : null}
        </NavLink>
      ) : (
        <>
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            aria-controls={childrenId}
            className={cn(
              'flex w-full items-center gap-2.5 rounded-md px-3 py-2.5 text-sm font-medium transition-colors',
              hasActiveChild
                ? 'bg-brand-50 text-brand-700 dark:bg-brand-900/30 dark:text-brand-300'
                : 'text-gray-700 hover:bg-gray-100 dark:text-surface-300 dark:hover:bg-surface-800',
            )}
          >
            {ParentIcon ? <ParentIcon className="h-4 w-4 shrink-0" aria-hidden="true" /> : null}
            <span className="flex-1 truncate text-left">{label}</span>
            <ChevronDown
              className={cn('h-3.5 w-3.5 transition-transform', open && 'rotate-180')}
              aria-hidden="true"
            />
          </button>
          {open && (
            <ul id={childrenId} className="mt-1 space-y-1 pl-3">
              {children.map((c) => {
                const ChildIcon = c.icon;
                const childLabel = t(`nav.${c.labelKey}`, c.labelKey);
                return (
                  <li key={c.to}>
                    <NavLink
                      to={c.to}
                      onClick={onNavigate}
                      className={({ isActive }) =>
                        cn(
                          'flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors',
                          isActive
                            ? 'bg-brand-50 font-medium text-brand-700 dark:bg-brand-900/30 dark:text-brand-300'
                            : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900 dark:text-surface-400 dark:hover:bg-surface-800 dark:hover:text-surface-100',
                        )
                      }
                    >
                      <ChildIcon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                      <span className="truncate">{childLabel}</span>
                    </NavLink>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
    </li>
  );
}

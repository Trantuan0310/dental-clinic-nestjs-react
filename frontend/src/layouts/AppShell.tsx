import { useCallback, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/cn';
import { Header } from './Header';
import { Sidebar } from './Sidebar';
import { SkipLink, Breadcrumb } from '@/components/ui';
import { useBreadcrumbs } from '@/hooks/useBreadcrumbs';
import { PendingBookingWatcher } from '@/features/booking/usePendingBookingCount';

// Grid-style pages (calendar, dispatch board, working schedules) use the whole
// width of the window; everything else stops at a readable maximum.
const FULL_WIDTH_PATHS = /^\/(appointments|my-appointments|dispatch|schedule)\/?$/;

// Sidebar width tokens — keep in sync with Sidebar.tsx classes.
export const SIDEBAR_WIDTH = 224; // px (expanded)
export const SIDEBAR_WIDTH_COLLAPSED = 68; // px (collapsed)

export function AppShell() {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const { t } = useTranslation();
  const breadcrumbs = useBreadcrumbs();
  const { pathname } = useLocation();
  const fullWidth = FULL_WIDTH_PATHS.test(pathname);
  const closeMobileNav = useCallback(() => setMobileNavOpen(false), []);

  return (
    <div className="min-h-screen bg-surface-50 text-surface-900 dark:bg-surface-950 dark:text-surface-100">
      <SkipLink>{t('a11y.skipToMain')}</SkipLink>
      <PendingBookingWatcher />
      {/*
        Layout strategy:
        - On mobile (<md) the Sidebar is a fixed overlay drawer (rendered by
          Sidebar component), so the right column just stacks Header + main.
        - On md+ the Sidebar is a sticky left column and Header + main live
          in a right column that fills the remaining width. This keeps the
          Topbar aligned with `<main>` (both start at the same x as the
          right edge of the sidebar) and removes the previous duplicate
          left-margin offset.
      */}
      <div className="md:flex md:flex-row">
        <Sidebar
          mobileOpen={mobileNavOpen}
          onMobileClose={closeMobileNav}
          collapsed={sidebarCollapsed}
          onToggleCollapsed={() => setSidebarCollapsed((c) => !c)}
        />
        <div className="flex min-w-0 flex-1 flex-col">
          <Header
            onMenuClick={() => setMobileNavOpen(true)}
            mobileNavOpen={mobileNavOpen}
          />
          <main
            id="main-content"
            className={cn(
              'min-w-0 flex-1 px-4 py-3 md:px-6 md:py-4',
              // Smooth transition when sidebar collapses/expands (no offset now).
              'transition-[margin] duration-200',
            )}
            tabIndex={-1}
          >
            <div className={cn('mx-auto', !fullWidth && 'max-w-[1600px]')}>
              {breadcrumbs.length > 0 && (
                <div className="mb-2">
                  <Breadcrumb items={breadcrumbs} />
                </div>
              )}
              <Outlet />
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}

import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Bell, ChevronDown, Search as SearchIcon, LogOut, User as UserIcon, Building2, CalendarDays, Menu } from 'lucide-react';
import { useAuthStore } from '@/stores/authStore';
import { authApi } from '@/features/auth/authApi';
import { cn } from '@/lib/cn';
import { useShiftRegistrations } from '@/features/payroll/payrollApi';
import { Logo } from '@/components/brand';
import { Tooltip } from '@/components/ui/Tooltip';
import { ThemeToggle } from '@/components/ui/ThemeToggle';
import { LanguageSwitcher } from '@/components/ui/LanguageSwitcher';
import { CommandPalette } from '@/components/ui/CommandPalette';
import { formatDate } from '@/lib/format';

interface HeaderProps {
  onMenuClick?: () => void;
  mobileNavOpen?: boolean;
}

export function Header({ onMenuClick, mobileNavOpen = false }: HeaderProps) {
  const { t } = useTranslation();
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.clear);
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [now, setNow] = useState(new Date());

  const { data: pendingShifts } = useShiftRegistrations({ status: 'PENDING' });
  const pendingCount = pendingShifts?.length ?? 0;
  const canApprove = user?.permissions.includes('shift.approve');

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  if (!user) return null;

  const initials = user.fullName
    .split(/\s+/)
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();

  function handleSearchSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const q = search.trim();
    if (!q) return;
    navigate(`/patients?q=${encodeURIComponent(q)}`);
  }

  return (
    <header className="sticky top-0 z-30 flex flex-col border-b border-gray-200 bg-white dark:border-surface-700 dark:bg-surface-900">
      <div className="flex h-16 items-center gap-4 px-4 md:px-6">
        <button
          type="button"
          onClick={onMenuClick}
          aria-label={t('shell.menu.open')}
          aria-expanded={mobileNavOpen}
          className="-ml-1 rounded-md p-2 text-gray-600 hover:bg-gray-100 md:hidden dark:text-surface-300 dark:hover:bg-surface-800"
        >
          <Menu className="h-5 w-5" />
        </button>

        <Link
          to="/"
          className="flex shrink-0 items-center gap-2"
          aria-label={`${t('shell.brand')} — Home`}
        >
          <Logo variant="icon" size="sm" />
          <span className="hidden text-lg font-bold tracking-wide text-brand-700 sm:inline dark:text-brand-400">
            {t('shell.brand')}
          </span>
          <span className="hidden rounded-md bg-brand-50 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-brand-700 md:inline dark:bg-brand-900/40 dark:text-brand-300">
            {t('shell.version')}
          </span>
        </Link>

        <form
          onSubmit={handleSearchSubmit}
          className="hidden flex-1 lg:block"
          role="search"
        >
          <div className="relative mx-auto w-full max-w-md">
            <Tooltip
              // i18next's t() returns a plain string — it interpolates
              // values with String(value), so passing JSX elements here
              // (as opposed to plain strings) rendered the literal text
              // "[object Object]" for each placeholder instead of bold text.
              label={t('shell.search.tooltip', {
                name: 'tên',
                code: 'mã BN',
                phone: 'số điện thoại',
              })}
              side="bottom"
            >
              <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400 dark:text-surface-500" />
            </Tooltip>
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('shell.search.placeholder')}
              aria-label={t('shell.search.label')}
              className="w-full rounded-md border border-gray-200 bg-gray-50 py-1.5 pl-9 pr-9 text-sm focus:border-primary-500 focus:bg-white focus:outline-none focus:ring-1 focus:ring-primary-500 dark:border-surface-700 dark:bg-surface-800 dark:text-surface-100 dark:placeholder:text-surface-500"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                aria-label={t('shell.search.clearLabel')}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:text-surface-500 dark:hover:bg-surface-700 dark:hover:text-surface-200"
              >
                <span className="sr-only">Xóa</span>
                <span aria-hidden="true">&times;</span>
              </button>
            )}
          </div>
        </form>

        <div className="ml-auto flex items-center gap-2 md:gap-3">
          <CommandPalette />

          <div className="hidden items-center gap-2 rounded-md border border-gray-200 bg-white px-3 py-1.5 text-sm md:flex dark:border-surface-700 dark:bg-surface-800">
            <Building2 className="h-4 w-4 text-brand-600 dark:text-brand-400" />
            <span className="font-medium text-gray-800 dark:text-surface-100">{t('shell.clinicName')}</span>
          </div>

          <div className="hidden items-center gap-2 rounded-md border border-gray-200 bg-white px-3 py-1.5 text-sm md:flex dark:border-surface-700 dark:bg-surface-800">
            <CalendarDays className="h-4 w-4 text-brand-600 dark:text-brand-400" />
            <span className="font-medium text-gray-800 dark:text-surface-100">{formatDate(now, 'dd/MM/yyyy')}</span>
          </div>

          <LanguageSwitcher />
          <ThemeToggle />

          {canApprove && (
            <Link
              to={user.roles.includes('clinic_admin') ? '/admin/shifts/pending' : '/shifts/pending'}
              className="relative rounded-full p-2 text-gray-500 hover:bg-gray-100 dark:text-surface-400 dark:hover:bg-surface-800"
              aria-label={t('shell.user.notifications')}
            >
              <Bell className="h-5 w-5" />
              {pendingCount > 0 && (
                <span
                  aria-hidden="true"
                  className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-medium text-white"
                >
                  {pendingCount}
                </span>
              )}
            </Link>
          )}

          <div className="relative">
            <button
              type="button"
              onClick={() => setMenuOpen((v) => !v)}
              aria-expanded={menuOpen}
              aria-haspopup="menu"
              className="flex items-center gap-2 rounded-md p-1 pr-2 text-sm hover:bg-gray-100 dark:hover:bg-surface-800"
            >
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary-100 text-xs font-semibold text-primary-700 dark:bg-primary-900/50 dark:text-primary-300">
                {initials || <UserIcon className="h-4 w-4" />}
              </span>
              <div className="hidden text-left md:block">
                <p className="text-sm font-medium leading-tight text-gray-900 dark:text-surface-100">{user.fullName}</p>
                <p className="text-xs leading-tight text-gray-500 dark:text-surface-400">{user.roles.join(', ')}</p>
              </div>
              <ChevronDown className="h-4 w-4 text-gray-400 dark:text-surface-500" />
            </button>
            {menuOpen && (
              <>
                <div
                  className="fixed inset-0 z-10"
                  onClick={() => setMenuOpen(false)}
                />
                <div
                  role="menu"
                  className={cn(
                    'absolute right-0 z-20 mt-1 w-56 rounded-md border border-gray-200 bg-white py-1 shadow-lg dark:border-surface-700 dark:bg-surface-800',
                  )}
                >
                  <div className="border-b border-gray-100 px-3 py-2 dark:border-surface-700">
                    <p className="text-sm font-medium text-gray-900 dark:text-surface-100">{user.fullName}</p>
                    <p className="truncate text-xs text-gray-500 dark:text-surface-400">{user.email}</p>
                  </div>
                  <Link
                    to="/me"
                    role="menuitem"
                    className="block px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 dark:text-surface-200 dark:hover:bg-surface-700"
                    onClick={() => setMenuOpen(false)}
                  >
                    {t('shell.user.profile')}
                  </Link>
                  <button
                    type="button"
                    role="menuitem"
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/40"
                    onClick={async () => {
                      setMenuOpen(false);
                      await authApi.logout();
                      logout();
                      navigate('/login', { replace: true });
                    }}
                  >
                    <LogOut className="h-4 w-4" /> {t('auth.logout')}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}

import { i18n } from '@/locales';
import { translatedLabels } from '@/locales/labels';
import type { LucideIcon } from 'lucide-react';
import {
  LayoutDashboard,
  BellRing,
  Inbox,
  Users,
  CalendarDays,
  UserCircle,
  Package,
  Calculator,
  Wallet,
  ShieldCheck,
  Settings,
  ClipboardList,
  ScrollText,
  ListChecks,
  Calendar,
  WalletCards,
  Briefcase,
  CalendarClock,
  Contact,
  Stethoscope,
  ClipboardPlus,
  ListOrdered,
  Images,
} from 'lucide-react';
import type { RoleCode } from '@/types/auth';

export interface NavChildDef {
  to: string;
  /** i18n key — Sidebar will translate via `t(\`nav.\${labelKey}\`)`. */
  labelKey: string;
  icon: LucideIcon;
}

export interface NavItemDef {
  to: string;
  /** i18n key — Sidebar will translate via `t(\`nav.\${labelKey}\`)`. */
  labelKey: string;
  icon: LucideIcon;
  permission?: string;
  anyPermission?: string[];
  /** Every one of these is needed too. */
  allPermissions?: string[];
  /** Hidden from a user who holds this (they have a fuller page instead). */
  hiddenWith?: string;
  children?: NavChildDef[];
  /** Live counter shown next to the label (see Sidebar). */
  badge?: 'pendingBookings';
}

export interface NavGroupDef {
  /** i18n key — Sidebar will translate via `t(\`nav.groups.\${titleKey}\`)`. */
  titleKey: string;
  items: NavItemDef[];
}

const ALL_STAFF: RoleCode[] = ['dentist', 'receptionist', 'clinic_admin'];

/**
 * The whole menu. What a user sees depends only on their permissions
 * (ADR-0004), never on role codes, so a role the clinic creates gets the
 * items its permissions open. Codes are chosen so the three default roles
 * keep their menus: the front-desk lists need permissions a dentist lacks
 * (clinic-wide calendar, editing records), a treating dentist's own lists
 * need encounter.start (not held by admin or front desk).
 */
const NAV_GROUPS: NavGroupDef[] = [
  {
    titleKey: 'Chung',
    items: [{ to: '/', labelKey: 'Dashboard', icon: LayoutDashboard }],
  },
  {
    titleKey: 'Lễ tân',
    items: [
      // patient.read alone is a dentist reading their own patients' records.
      {
        to: '/patients',
        labelKey: 'Patients',
        icon: UserCircle,
        allPermissions: ['patient.read', 'patient.update'],
      },
      // The clinic-wide calendar; a dentist has 'My appointments' below.
      {
        to: '/appointments',
        labelKey: 'Appointments',
        icon: CalendarDays,
        allPermissions: ['appointment.read', 'appointment.read.any'],
      },
      {
        to: '/dispatch',
        labelKey: 'Dispatch',
        icon: ListOrdered,
        permission: 'queue.manage',
      },
      {
        to: '/booking-requests',
        labelKey: 'BookingRequests',
        icon: Inbox,
        permission: 'booking_request.read',
        badge: 'pendingBookings',
      },
      {
        to: '/recalls',
        labelKey: 'Recalls',
        icon: BellRing,
        permission: 'recall.read',
      },
    ],
  },
  // Today's schedule and the checked-in queue read from Appointments
  // (appointment.read.any/.own at the API) — front desk needs it for
  // check-in tracking too.
  {
    titleKey: 'Lâm sàng',
    items: [
      {
        to: '/today',
        labelKey: 'Today',
        icon: Calendar,
        permission: 'appointment.read',
      },
      // 'My queue' and 'My patients' are a treating dentist's lists; front
      // desk and a non-treating admin have nothing in them (an owner who
      // also treats holds the dentist role and sees both).
      {
        to: '/my-queue',
        labelKey: 'MyQueue',
        icon: ListChecks,
        allPermissions: ['appointment.read', 'encounter.start'],
      },
      // Calendar pre-filtered to the signed-in dentist (their own bookings).
      {
        to: '/my-appointments',
        labelKey: 'MyAppointments',
        icon: CalendarDays,
        allPermissions: ['appointment.read', 'encounter.start'],
      },
      // Route guard requires encounter.read.own (see AppRoutes.tsx).
      {
        to: '/my-patients',
        labelKey: 'MyPatients',
        icon: UserCircle,
        allPermissions: ['encounter.read.own', 'encounter.start'],
      },
    ],
  },
  {
    titleKey: 'Tài chính',
    items: [
      {
        to: '/billing',
        labelKey: 'Billing',
        icon: Wallet,
        permission: 'invoice.read',
      },
      {
        to: '/expenses',
        labelKey: 'Expenses',
        icon: Calculator,
        permission: 'expense.read',
      },
      {
        to: '/inventory',
        labelKey: 'Inventory',
        icon: Package,
        permission: 'inventory.read',
      },
    ],
  },
  {
    titleKey: 'Nhân sự & Lương',
    items: [
      {
        to: '/staff',
        labelKey: 'Employees',
        icon: Contact,
        permission: 'employee.read',
      },
      {
        to: '/dentists',
        labelKey: 'Dentists',
        icon: Stethoscope,
        permission: 'dentist.read',
      },
      {
        to: '/services',
        labelKey: 'Services',
        icon: ClipboardPlus,
        permission: 'service.read',
      },
      // Admin-only: full period/compensation/shift-approval management for
      // every dentist. Others have their own entries below.
      {
        to: '/payroll',
        labelKey: 'Payroll',
        icon: Calculator,
        permission: 'payroll.read.any',
      },
      // Whoever manages everyone's payroll uses the page above instead.
      {
        to: '/my-payroll',
        labelKey: 'MyPayroll',
        icon: WalletCards,
        permission: 'payroll.read_self',
        hiddenWith: 'payroll.read.any',
      },
      {
        to: '/my-shifts',
        labelKey: 'MyShifts',
        icon: Briefcase,
        permission: 'shift.read_self',
        hiddenWith: 'payroll.read.any',
      },
      {
        to: '/schedule',
        labelKey: 'Schedule',
        icon: CalendarClock,
        permission: 'schedule.read',
      },
    ],
  },
  {
    titleKey: 'Báo cáo',
    items: [
      // Front desk sees only outstanding balances here; revenue sections need
      // report.revenue.read (ReportsPage hides what the viewer can't read).
      {
        to: '/reports',
        labelKey: 'Reports',
        icon: ScrollText,
        anyPermission: [
          'report.revenue.read',
          'report.outstanding.read',
          'report.read',
        ],
      },
    ],
  },
  {
    titleKey: 'Quản trị',
    items: [
      {
        to: '/admin/users',
        labelKey: 'Users',
        icon: Users,
        permission: 'user.read',
      },
      // Same codes the API checks (roles.controller / audit.controller).
      {
        to: '/admin/roles',
        labelKey: 'Roles',
        icon: ShieldCheck,
        permission: 'role.upsert',
      },
      {
        to: '/admin/audit',
        labelKey: 'AuditLogs',
        icon: ClipboardList,
        permission: 'system.audit.read',
      },
      {
        to: '/admin/site-media',
        labelKey: 'SiteMedia',
        icon: Images,
        permission: 'site_media.manage',
      },
      {
        to: '/admin/settings',
        labelKey: 'Settings',
        icon: Settings,
        permission: 'settings.read',
      },
    ],
  },
];

/** Whether a user with `has` may see `item`. */
export function navItemVisible(
  item: NavItemDef,
  has: (code: string) => boolean,
): boolean {
  if (item.permission && !has(item.permission)) return false;
  if (item.anyPermission && !item.anyPermission.some(has)) return false;
  if (item.allPermissions && !item.allPermissions.every(has)) return false;
  if (item.hiddenWith && has(item.hiddenWith)) return false;
  return true;
}

/** The menu for a user's permissions, without groups left empty. */
export function buildNavGroups(has: (code: string) => boolean): NavGroupDef[] {
  return NAV_GROUPS.map((g) => ({
    ...g,
    items: g.items.filter((i) => navItemVisible(i, has)),
  })).filter((g) => g.items.length > 0);
}

export const NAV_ROLE_HINT = translatedLabels<RoleCode>({
  clinic_admin: 'uiCommon.roles.clinic_admin',
  receptionist: 'uiCommon.roles.receptionist',
  dentist: 'uiCommon.roles.dentist',
});

export const DEFAULT_ROLES: RoleCode[] = ALL_STAFF;

/** Translate display labels without changing permission/role codes. */
export function getRoleLabel(code: string): string {
  return i18n.t(`uiCommon.roles.${code}`, { defaultValue: code });
}

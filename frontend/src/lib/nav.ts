import type { LucideIcon } from "lucide-react";
import {
  LayoutDashboard,
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
} from "lucide-react";
import type { RoleCode } from "@/types/auth";

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
  children?: NavChildDef[];
}

export interface NavGroupDef {
  /** i18n key — Sidebar will translate via `t(\`nav.groups.\${titleKey}\`)`. */
  titleKey: string;
  items: NavItemDef[];
}

const ROLE_DENTIST: RoleCode[] = ["dentist"];
const ROLE_RECEPTIONIST: RoleCode[] = ["receptionist"];
// Persisted role code stays stable; the business-facing role is Quản lý phòng khám.
const ROLE_CLINIC_MANAGER: RoleCode[] = ["clinic_admin"];

const isDentist = (roles: RoleCode[]) =>
  roles.some((r) => ROLE_DENTIST.includes(r));
const isReceptionist = (roles: RoleCode[]) =>
  roles.some((r) => ROLE_RECEPTIONIST.includes(r));
const isClinicManager = (roles: RoleCode[]) =>
  roles.some((r) => ROLE_CLINIC_MANAGER.includes(r));

const ALL_STAFF: RoleCode[] = ["dentist", "receptionist", "clinic_admin"];

export function buildNavGroups(roles: RoleCode[]): NavGroupDef[] {
  const groups: NavGroupDef[] = [];

  groups.push({
    titleKey: "Chung",
    items: [{ to: "/", labelKey: "Dashboard", icon: LayoutDashboard }],
  });

  if (isClinicManager(roles)) {
    groups.push({
      titleKey: "Điều hành phòng khám",
      items: [
        {
          to: "/doctors",
          labelKey: "Doctors",
          icon: Users,
          permission: "doctor.manage",
        },
        {
          to: "/services",
          labelKey: "Services",
          icon: ClipboardList,
          permission: "service.manage",
        },
        {
          to: "/booking-requests",
          labelKey: "BookingRequests",
          icon: CalendarClock,
          permission: "booking_request.read",
        },
        {
          to: "/patients",
          labelKey: "Patients",
          icon: UserCircle,
          permission: "patient.read",
        },
        {
          to: "/appointments",
          labelKey: "Appointments",
          icon: CalendarDays,
          permission: "appointment.read",
        },
        {
          to: "/schedule",
          labelKey: "Schedule",
          icon: CalendarClock,
          permission: "schedule.read",
        },
        {
          to: "/admin/shifts/pending",
          labelKey: "DoctorShiftApprovals",
          icon: Calendar,
          permission: "shift.approve",
        },
        {
          to: "/admin/users",
          labelKey: "StaffAccounts",
          icon: Users,
          permission: "user.read",
        },
        {
          to: "/admin/roles",
          labelKey: "Roles",
          icon: ShieldCheck,
          permission: "role.read",
        },
        {
          to: "/admin/audit",
          labelKey: "AuditLogs",
          icon: ClipboardList,
          permission: "audit.read",
        },
        {
          to: "/admin/settings",
          labelKey: "Settings",
          icon: Settings,
          permission: "settings.read",
        },
      ],
    });
  }

  if (isReceptionist(roles) && !isClinicManager(roles)) {
    groups.push({
      titleKey: "Tiếp đón",
      items: [
        {
          to: "/booking-requests",
          labelKey: "BookingRequests",
          icon: CalendarClock,
          permission: "booking_request.read",
        },
        {
          to: "/patients",
          labelKey: "Patients",
          icon: UserCircle,
          permission: "patient.read",
        },
        {
          to: "/appointments",
          labelKey: "Appointments",
          icon: CalendarDays,
          permission: "appointment.read",
        },
        {
          to: "/today",
          labelKey: "Today",
          icon: Calendar,
          permission: "appointment.read",
        },
        {
          to: "/my-queue",
          labelKey: "ReceptionQueue",
          icon: ListChecks,
          permission: "appointment.read",
        },
      ],
    });
  }

  if (isDentist(roles)) {
    groups.push({
      titleKey: "Khám bệnh",
      items: [
        {
          to: "/today",
          labelKey: "Today",
          icon: Calendar,
          permission: "appointment.read",
        },
        {
          to: "/my-queue",
          labelKey: "MyQueue",
          icon: ListChecks,
          permission: "appointment.read",
        },
        {
          to: "/my-patients",
          labelKey: "MyPatients",
          icon: UserCircle,
          permission: "encounter.read.own",
        },
      ],
    });
  }

  groups.push({
    titleKey: "Tài chính",
    items: [
      {
        to: "/billing",
        labelKey: "Billing",
        icon: Wallet,
        permission: "invoice.read",
      },
      {
        to: "/expenses",
        labelKey: "Expenses",
        icon: Calculator,
        permission: "expense.read",
      },
      {
        to: "/inventory",
        labelKey: "Inventory",
        icon: Package,
        permission: "inventory.read",
      },
    ],
  });

  groups.push({
    titleKey: "Nhân sự & Lương",
    items: [
      {
        to: "/payroll",
        labelKey: "Payroll",
        icon: Calculator,
        // Admin-only: full period/compensation/shift-approval management for
        // every dentist. Non-admins already have their own entries below
        // ("Lương của tôi", "Ca của tôi") — this used to also match
        // payroll.read/payroll.read_self, which dentist and receptionist
        // both hold, surfacing the admin dashboard to them too.
        permission: "payroll.read.any",
      },
      ...(!isClinicManager(roles)
        ? [
            {
              to: "/my-payroll",
              labelKey: "MyPayroll",
              icon: WalletCards,
              permission: "payroll.read_self",
            },
            {
              to: "/my-shifts",
              labelKey: "MyShifts",
              icon: Briefcase,
              permission: "shift.read_self",
            },
          ]
        : []),
    ],
  });

  groups.push({
    titleKey: "Báo cáo",
    items: [
      {
        to: "/reports",
        labelKey: "Reports",
        icon: ScrollText,
        permission: "report.read",
      },
    ],
  });

  return groups;
}

export const NAV_ROLE_HINT: Record<RoleCode, string> = {
  clinic_admin: "Quản lý phòng khám",
  receptionist: "Lễ tân",
  dentist: "Bác sĩ",
};

export const DEFAULT_ROLES: RoleCode[] = ALL_STAFF;

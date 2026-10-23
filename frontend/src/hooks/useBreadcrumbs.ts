import { useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { BreadcrumbItem } from '@/components/ui/Breadcrumb';

// Route → breadcrumb label mapping
const ROUTE_LABELS: Record<string, string> = {
  '/': 'overview',
  '/patients': 'patients',
  '/patients/new': 'addPatient',
  '/appointments': 'appointments',
  '/appointments/list': 'list',
  '/reports': 'reports',
  '/invoices': 'invoices',
  // Real route is `expenses` (plural, see AppRoutes.tsx) — this key used to
  // say `/expense`, which never matched, so the crumb fell back to
  // capitalizing the raw segment ("Expenses").
  '/expenses': 'expenses',
  '/inventory': 'inventory',
  '/inventory/items': 'supplyList',
  '/my-queue': 'myQueue',
  '/my-appointments': 'mySchedule',
  '/dispatch': 'dispatch',
  '/booking-requests': 'bookingRequests',
  '/recalls': 'recalls',
  '/today': 'today',
  '/queue': 'queue',
  // Below: every route added for the medical-records redirect, billing
  // list, and Working Schedule/Time-off/self-service features — none of
  // these were ever added here, so real users (not just admins hitting
  // the API) saw raw English path segments in the breadcrumb ("Schedule",
  // "My-shifts", "My-payroll / History").
  '/medical-records': 'medicalRecords',
  '/my-patients': 'myPatients',
  '/encounters': 'encounters',
  '/treatment-plans': 'treatmentPlans',
  '/treatment-plans/new': 'newTreatmentPlan',
  '/billing': 'invoices',
  '/billing/list': 'list',
  '/billing/invoices': 'invoices',
  '/payroll': 'payroll',
  '/payroll/config': 'payrollConfig',
  '/payroll/compensations': 'compensation',
  '/payroll/shifts/approval': 'shiftApproval',
  '/my-payroll': 'myPayroll',
  '/my-payroll/history': 'history',
  '/my-payroll/payslip': 'payslip',
  '/my-payroll/compensation': 'myCompensation',
  '/my-shifts': 'myShifts',
  '/schedule': 'schedule',
  '/staff': 'staff',
  '/dentists': 'dentists',
  '/services': 'services',
  '/shifts': 'shifts',
  '/shifts/pending': 'shiftApproval',
  '/me': 'myAccount',
  '/admin': 'admin',
  '/admin/users': 'users',
  '/admin/roles': 'roles',
  '/admin/site-media': 'homepageImages',
  '/admin/settings': 'settings',
  // Real route is `admin/audit` (see AppRoutes.tsx) — this key used to say
  // `/admin/audit-logs`, which never matched, so both breadcrumb segments
  // fell back to the parent label and rendered "Quản trị / Quản trị".
  '/admin/audit': 'auditLog',
  '/admin/shifts/pending': 'shiftApproval',
};

function getLabel(pathname: string): string {
  // Check exact match first
  if (ROUTE_LABELS[pathname]) return ROUTE_LABELS[pathname];

  // Try parent routes
  const segments = pathname.split('/').filter(Boolean);
  while (segments.length > 0) {
    const parent = '/' + segments.join('/');
    if (ROUTE_LABELS[parent]) return ROUTE_LABELS[parent];
    segments.pop();
  }

  // Default: capitalize last segment
  const last = pathname.split('/').pop() ?? '';
  return last.charAt(0).toUpperCase() + last.slice(1);
}

export function useBreadcrumbs(): BreadcrumbItem[] {
  const location = useLocation();
  const { t } = useTranslation();

  return useMemo(() => {
    const segments = location.pathname.split('/').filter(Boolean);
    if (segments.length === 0) return [];

    const breadcrumbs: BreadcrumbItem[] = [];
    let accumulated = '';

    for (let i = 0; i < segments.length; i++) {
      accumulated += '/' + segments[i];
      const isLast = i === segments.length - 1;

      // Skip 'v1' in API routes
      if (segments[i] === 'v1') continue;

      // Try to extract readable label
      let labelKey = getLabel(accumulated);

      // For dynamic segments (UUIDs, IDs), show abbreviated form
      const segment = segments[i];
      if (/^[0-9a-f]{8}-[0-9a-f]{4}/i.test(segment)) {
        labelKey = isLast ? 'details' : 'id';
      } else if (/^\d+$/.test(segment)) {
        labelKey = isLast ? 'details' : 'id';
      } else if (isLast && ROUTE_LABELS[accumulated] === undefined) {
        labelKey = getLabel(accumulated);
      }

      breadcrumbs.push({
        label: t(`uiCommon.breadcrumbRoutes.${labelKey}`, { defaultValue: labelKey }),
        href: isLast ? undefined : accumulated,
      });
    }

    return breadcrumbs;
  }, [location.pathname, t]);
}

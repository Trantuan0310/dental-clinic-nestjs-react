import { useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import type { BreadcrumbItem } from '@/components/ui/Breadcrumb';

// Route → breadcrumb label mapping
const ROUTE_LABELS: Record<string, string> = {
  '/': 'Tổng quan',
  '/patients': 'Bệnh nhân',
  '/patients/new': 'Thêm bệnh nhân',
  '/appointments': 'Lịch hẹn',
  '/appointments/list': 'Danh sách',
  '/reports': 'Báo cáo',
  '/invoices': 'Hóa đơn',
  // Real route is `expenses` (plural, see AppRoutes.tsx) — this key used to
  // say `/expense`, which never matched, so the crumb fell back to
  // capitalizing the raw segment ("Expenses").
  '/expenses': 'Chi phí',
  '/inventory': 'Tồn kho',
  '/inventory/items': 'Danh sách vật tư',
  '/my-queue': 'Hàng chờ của tôi',
  '/today': 'Hôm nay',
  '/queue': 'Hàng chờ',
  // Below: every route added for the medical-records redirect, billing
  // list, and Working Schedule/Time-off/self-service features — none of
  // these were ever added here, so real users (not just admins hitting
  // the API) saw raw English path segments in the breadcrumb ("Schedule",
  // "My-shifts", "My-payroll / History").
  '/medical-records': 'Bệnh án',
  '/my-patients': 'Bệnh nhân của tôi',
  '/encounters': 'Lượt khám',
  '/billing': 'Hóa đơn',
  '/billing/list': 'Danh sách',
  '/billing/invoices': 'Hóa đơn',
  '/payroll': 'Bảng lương',
  '/payroll/config': 'Cấu hình lương',
  '/payroll/compensations': 'Đãi ngộ',
  '/payroll/shifts/approval': 'Duyệt ca làm việc',
  '/my-payroll': 'Lương của tôi',
  '/my-payroll/history': 'Lịch sử',
  '/my-payroll/payslip': 'Phiếu lương',
  '/my-payroll/compensation': 'Đãi ngộ của tôi',
  '/my-shifts': 'Ca của tôi',
  '/schedule': 'Lịch làm việc',
  '/staff': 'Nhân sự',
  '/dentists': 'Bác sĩ',
  '/services': 'Dịch vụ',
  '/shifts': 'Ca làm việc',
  '/shifts/pending': 'Duyệt ca làm việc',
  '/me': 'Hồ sơ của tôi',
  '/admin': 'Quản trị',
  '/admin/users': 'Người dùng',
  '/admin/roles': 'Vai trò',
  '/admin/settings': 'Cài đặt',
  // Real route is `admin/audit` (see AppRoutes.tsx) — this key used to say
  // `/admin/audit-logs`, which never matched, so both breadcrumb segments
  // fell back to the parent label and rendered "Quản trị / Quản trị".
  '/admin/audit': 'Nhật ký kiểm toán',
  '/admin/shifts/pending': 'Duyệt ca làm việc',
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
      let label = getLabel(accumulated);

      // For dynamic segments (UUIDs, IDs), show abbreviated form
      const segment = segments[i];
      if (/^[0-9a-f]{8}-[0-9a-f]{4}/i.test(segment)) {
        label = isLast ? 'Chi tiết' : 'ID';
      } else if (/^\d+$/.test(segment)) {
        label = isLast ? 'Chi tiết' : 'ID';
      } else if (isLast && ROUTE_LABELS[accumulated] === undefined) {
        label = getLabel(accumulated);
      }

      breadcrumbs.push({
        label,
        href: isLast ? undefined : accumulated,
      });
    }

    return breadcrumbs;
  }, [location.pathname]);
}

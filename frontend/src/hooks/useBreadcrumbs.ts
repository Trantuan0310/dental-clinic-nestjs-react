import { useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import type { BreadcrumbItem } from '@/components/ui/Breadcrumb';

// Route → breadcrumb label mapping
const ROUTE_LABELS: Record<string, string> = {
  '/': 'Tổng quan',
  '/patients': 'Bệnh nhân',
  '/appointments': 'Lịch hẹn',
  '/appointments/list': 'Danh sách',
  '/reports': 'Báo cáo',
  '/invoices': 'Hóa đơn',
  '/expense': 'Chi phí',
  '/inventory': 'Tồn kho',
  '/inventory/items': 'Danh sách vật tư',
  '/my-queue': 'Hàng chờ của tôi',
  '/today': 'Hôm nay',
  '/queue': 'Hàng chờ',
  '/payroll': 'Bảng lương',
  '/me': 'Hồ sơ của tôi',
  '/admin': 'Quản trị',
  '/admin/users': 'Người dùng',
  '/admin/roles': 'Vai trò',
  '/admin/settings': 'Cài đặt',
  '/admin/audit-logs': 'Nhật ký hoạt động',
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

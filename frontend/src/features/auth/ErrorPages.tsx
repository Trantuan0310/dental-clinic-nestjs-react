import { Link } from 'react-router-dom';
import { ShieldAlert } from 'lucide-react';
import { Button } from '@/components/ui/Button';

export function ForbiddenPage() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <div className="text-center">
        <ShieldAlert className="mx-auto mb-4 h-12 w-12 text-amber-500" />
        <h1 className="text-2xl font-semibold text-gray-900">403 — Không có quyền truy cập</h1>
        <p className="mt-2 text-sm text-gray-500">
          Bạn không có quyền xem trang này. Vui lòng liên hệ quản trị viên nếu bạn cho rằng đây là lỗi.
        </p>
        <div className="mt-6">
          <Link to="/">
            <Button variant="outline">Về trang chủ</Button>
          </Link>
        </div>
      </div>
    </div>
  );
}

export function NotFoundPage() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <div className="text-center">
        <h1 className="text-2xl font-semibold text-gray-900">404 — Không tìm thấy trang</h1>
        <p className="mt-2 text-sm text-gray-500">Trang bạn yêu cầu không tồn tại.</p>
        <div className="mt-6">
          <Link to="/">
            <Button variant="outline">Về trang chủ</Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
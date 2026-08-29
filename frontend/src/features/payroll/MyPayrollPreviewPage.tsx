import { Card } from '@/components/ui';

export default function MyPayrollPreviewPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">Ước tính lương</h1>
        <p className="mt-1 text-sm text-gray-500">
          Dự toán lương tháng hiện tại
        </p>
      </div>

      <Card>
        <div className="text-center py-12">
          <p className="text-gray-500">
            Tính năng đang được phát triển. Dữ liệu ước tính sẽ được hiển thị ở đây.
          </p>
        </div>
      </Card>
    </div>
  );
}

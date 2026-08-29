import { Card } from '@/components/ui';

export default function PeriodListPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">Danh sách kỳ lương</h1>
        <p className="mt-1 text-sm text-gray-500">
          Quản lý các kỳ lương của phòng khám
        </p>
      </div>

      <Card>
        <div className="text-center py-12">
          <p className="text-gray-500">
            Trang quản lý kỳ lương đang được phát triển.
          </p>
        </div>
      </Card>
    </div>
  );
}

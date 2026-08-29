import { Card } from '@/components/ui';

export default function CompensationEditorPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">Chỉnh sửa chính sách lương</h1>
        <p className="mt-1 text-sm text-gray-500">
          Quản lý lịch sử thay đổi lương của bác sĩ
        </p>
      </div>

      <Card>
        <div className="text-center py-12">
          <p className="text-gray-500">
            Chọn bác sĩ từ danh sách để xem và chỉnh sửa chính sách lương.
          </p>
        </div>
      </Card>
    </div>
  );
}

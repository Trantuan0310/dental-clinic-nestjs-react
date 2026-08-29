import { useState } from 'react';
import { Save, Building2, Clock, Bell } from 'lucide-react';
import { Button, Card, Input, Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui';
import { notify } from '@/components/ui/Toast';
import { useSettings, useUpdateSettings } from './adminApi';

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState('info');
  const updateSettings = useUpdateSettings();

  const { data: settings, isLoading } = useSettings();

  const [clinicName, setClinicName] = useState(settings?.clinicName ?? 'Nha khoa GENSMILE');
  const [taxCode, setTaxCode] = useState(settings?.taxCode ?? '');
  const [address, setAddress] = useState(settings?.address ?? '');
  const [phone, setPhone] = useState(settings?.phone ?? '');
  const [email, setEmail] = useState(settings?.email ?? '');
  const [website, setWebsite] = useState(settings?.website ?? '');

  const handleSave = async () => {
    try {
      await updateSettings.mutateAsync({
        clinicName,
        taxCode,
        address,
        phone,
        email,
        website,
      });
      notify.success('Lưu cài đặt thành công');
    } catch {
      notify.error('Không thể lưu cài đặt. Vui lòng thử lại.');
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">Cài đặt phòng khám</h1>
        <p className="mt-1 text-sm text-gray-500">
          Quản lý thông tin và cấu hình phòng khám
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="info">
            <Building2 className="h-4 w-4 mr-2" />
            Thông tin
          </TabsTrigger>
          <TabsTrigger value="hours">
            <Clock className="h-4 w-4 mr-2" />
            Giờ làm việc
          </TabsTrigger>
          <TabsTrigger value="notifications">
            <Bell className="h-4 w-4 mr-2" />
            Thông báo
          </TabsTrigger>
        </TabsList>

        <TabsContent value="info">
          <Card>
            <form
              className="space-y-6"
              onSubmit={(e) => {
                e.preventDefault();
                handleSave();
              }}
            >
              <div className="grid gap-4 sm:grid-cols-2">
                <Input
                  label="Tên phòng khám"
                  value={clinicName}
                  onChange={(e) => setClinicName(e.target.value)}
                />
                <Input
                  label="Mã số thuế"
                  value={taxCode}
                  onChange={(e) => setTaxCode(e.target.value)}
                />
              </div>
              <Input
                label="Địa chỉ"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
              />
              <div className="grid gap-4 sm:grid-cols-2">
                <Input
                  label="Số điện thoại"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  type="tel"
                />
                <Input
                  label="Email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  type="email"
                />
              </div>
              <Input
                label="Website"
                value={website}
                onChange={(e) => setWebsite(e.target.value)}
              />
              <div className="flex justify-end pt-4 border-t border-gray-100">
                <Button type="submit" isLoading={updateSettings.isPending} disabled={isLoading}>
                  <Save className="h-4 w-4" />
                  Lưu thay đổi
                </Button>
              </div>
            </form>
          </Card>
        </TabsContent>

        <TabsContent value="hours">
          <Card title="Giờ làm việc mặc định">
            <p className="text-sm text-gray-500 mb-6">
              Đặt giờ làm việc mặc định cho tất cả nhân viên. Giờ làm việc cá nhân có thể được cấu hình riêng.
            </p>
            <div className="space-y-4">
              {['Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6'].map((day) => (
                <div key={day} className="flex items-center gap-4">
                  <span className="w-24 text-sm font-medium text-gray-700">{day}</span>
                  <input type="time" defaultValue="08:00" className="rounded-md border border-gray-300 px-3 py-2" />
                  <span className="text-gray-400">—</span>
                  <input type="time" defaultValue="17:00" className="rounded-md border border-gray-300 px-3 py-2" />
                  <label className="flex items-center gap-2">
                    <input type="checkbox" defaultChecked className="h-4 w-4 rounded border-gray-300 text-brand-500" />
                    <span className="text-sm text-gray-600">Hoạt động</span>
                  </label>
                </div>
              ))}
              <div className="flex items-center gap-4 pt-4 border-t border-gray-100">
                <span className="w-24 text-sm font-medium text-gray-700">Thứ 7</span>
                <input type="time" defaultValue="08:00" className="rounded-md border border-gray-300 px-3 py-2" />
                <span className="text-gray-400">—</span>
                <input type="time" defaultValue="12:00" className="rounded-md border border-gray-300 px-3 py-2" />
                <label className="flex items-center gap-2">
                  <input type="checkbox" defaultChecked className="h-4 w-4 rounded border-gray-300 text-brand-500" />
                  <span className="text-sm text-gray-600">Hoạt động</span>
                </label>
              </div>
              <div className="flex items-center gap-4">
                <span className="w-24 text-sm font-medium text-gray-700">Chủ nhật</span>
                <span className="text-sm text-gray-400">Nghỉ</span>
              </div>
            </div>
            <div className="flex justify-end pt-6 border-t border-gray-100">
              <Button>
                <Save className="h-4 w-4" />
                Lưu giờ làm việc
              </Button>
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="notifications">
          <Card title="Cấu hình thông báo">
            <div className="space-y-4">
              <label className="flex items-start gap-3">
                <input type="checkbox" defaultChecked className="mt-0.5 h-4 w-4 rounded border-gray-300 text-brand-500" />
                <div>
                  <span className="font-medium text-gray-900">Thông báo lịch hẹn mới</span>
                  <p className="text-sm text-gray-500">Gửi email/nhắn tin khi có lịch hẹn mới được tạo</p>
                </div>
              </label>
              <label className="flex items-start gap-3">
                <input type="checkbox" defaultChecked className="mt-0.5 h-4 w-4 rounded border-gray-300 text-brand-500" />
                <div>
                  <span className="font-medium text-gray-900">Nhắc nhở trước lịch hẹn</span>
                  <p className="text-sm text-gray-500">Gửi nhắc nhở cho bệnh nhân trước 24 giờ</p>
                </div>
              </label>
              <label className="flex items-start gap-3">
                <input type="checkbox" defaultChecked className="mt-0.5 h-4 w-4 rounded border-gray-300 text-brand-500" />
                <div>
                  <span className="font-medium text-gray-900">Cảnh báo tồn kho thấp</span>
                  <p className="text-sm text-gray-500">Thông báo khi vật tư xuống dưới mức tối thiểu</p>
                </div>
              </label>
              <label className="flex items-start gap-3">
                <input type="checkbox" className="mt-0.5 h-4 w-4 rounded border-gray-300 text-brand-500" />
                <div>
                  <span className="font-medium text-gray-900">Báo cáo hàng ngày</span>
                  <p className="text-sm text-gray-500">Gửi email tổng kết hoạt động cuối ngày</p>
                </div>
              </label>
            </div>
            <div className="flex justify-end pt-6 border-t border-gray-100">
              <Button>
                <Save className="h-4 w-4" />
                Lưu cài đặt
              </Button>
            </div>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

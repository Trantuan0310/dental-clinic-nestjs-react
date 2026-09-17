import { useState } from 'react';
import { Building2, Clock, Bell } from 'lucide-react';
import { Card, Input, Tabs, TabsList, TabsTrigger, TabsContent, Alert } from '@/components/ui';

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState('info');

  const [clinicName, setClinicName] = useState('Nha khoa GENSMILE');
  const [taxCode, setTaxCode] = useState('');
  const [address, setAddress] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [website, setWebsite] = useState('');

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">Cài đặt phòng khám</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-surface-400">
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
            <Alert type="info">
              Tính năng đang được phát triển. Các trường bên dưới chỉ là bản xem trước và chưa được lưu vào hệ thống.
            </Alert>
            <fieldset disabled className="mt-4 space-y-6 opacity-75">
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
            </fieldset>
          </Card>
        </TabsContent>

        <TabsContent value="hours">
          <Card title="Giờ làm việc mặc định">
            <Alert type="info">
              Tính năng đang được phát triển. Các trường bên dưới chỉ là bản xem trước và chưa được lưu vào hệ thống.
            </Alert>
            <p className="my-4 text-sm text-gray-500 dark:text-surface-400">
              Đặt giờ làm việc mặc định cho tất cả nhân viên. Giờ làm việc cá nhân có thể được cấu hình riêng.
            </p>
            <fieldset disabled className="space-y-4 opacity-75">
              {['Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6'].map((day) => (
                <div key={day} className="flex items-center gap-4">
                  <span className="w-24 text-sm font-medium text-gray-700 dark:text-surface-200">{day}</span>
                  <input type="time" defaultValue="08:00" className="rounded-md border border-gray-300 bg-white px-3 py-2 dark:border-surface-700 dark:bg-surface-800 dark:text-surface-100" />
                  <span className="text-gray-400">—</span>
                  <input type="time" defaultValue="17:00" className="rounded-md border border-gray-300 bg-white px-3 py-2 dark:border-surface-700 dark:bg-surface-800 dark:text-surface-100" />
                  <label className="flex items-center gap-2">
                    <input type="checkbox" defaultChecked className="h-4 w-4 rounded border-gray-300 text-brand-500" />
                    <span className="text-sm text-gray-600 dark:text-surface-300">Hoạt động</span>
                  </label>
                </div>
              ))}
              <div className="flex items-center gap-4 pt-4 border-t border-gray-100">
                <span className="w-24 text-sm font-medium text-gray-700 dark:text-surface-200">Thứ 7</span>
                <input type="time" defaultValue="08:00" className="rounded-md border border-gray-300 bg-white px-3 py-2 dark:border-surface-700 dark:bg-surface-800 dark:text-surface-100" />
                <span className="text-gray-400">—</span>
                <input type="time" defaultValue="12:00" className="rounded-md border border-gray-300 bg-white px-3 py-2 dark:border-surface-700 dark:bg-surface-800 dark:text-surface-100" />
                <label className="flex items-center gap-2">
                  <input type="checkbox" defaultChecked className="h-4 w-4 rounded border-gray-300 text-brand-500" />
                  <span className="text-sm text-gray-600 dark:text-surface-300">Hoạt động</span>
                </label>
              </div>
              <div className="flex items-center gap-4">
                <span className="w-24 text-sm font-medium text-gray-700 dark:text-surface-200">Chủ nhật</span>
                <span className="text-sm text-gray-400 dark:text-surface-500">Nghỉ</span>
              </div>
            </fieldset>
          </Card>
        </TabsContent>

        <TabsContent value="notifications">
          <Card title="Cấu hình thông báo">
            <Alert type="info">
              Tính năng đang được phát triển. Các tùy chọn bên dưới chỉ là bản xem trước và chưa được lưu vào hệ thống.
            </Alert>
            <fieldset disabled className="mt-4 space-y-4 opacity-75">
              <label className="flex items-start gap-3">
                <input type="checkbox" defaultChecked className="mt-0.5 h-4 w-4 rounded border-gray-300 text-brand-500" />
                <div>
                  <span className="font-medium text-gray-900 dark:text-surface-100">Thông báo lịch hẹn mới</span>
                  <p className="text-sm text-gray-500 dark:text-surface-400">Gửi email/nhắn tin khi có lịch hẹn mới được tạo</p>
                </div>
              </label>
              <label className="flex items-start gap-3">
                <input type="checkbox" defaultChecked className="mt-0.5 h-4 w-4 rounded border-gray-300 text-brand-500" />
                <div>
                  <span className="font-medium text-gray-900 dark:text-surface-100">Nhắc nhở trước lịch hẹn</span>
                  <p className="text-sm text-gray-500 dark:text-surface-400">Gửi nhắc nhở cho bệnh nhân trước 24 giờ</p>
                </div>
              </label>
              <label className="flex items-start gap-3">
                <input type="checkbox" defaultChecked className="mt-0.5 h-4 w-4 rounded border-gray-300 text-brand-500" />
                <div>
                  <span className="font-medium text-gray-900 dark:text-surface-100">Cảnh báo tồn kho thấp</span>
                  <p className="text-sm text-gray-500 dark:text-surface-400">Thông báo khi vật tư xuống dưới mức tối thiểu</p>
                </div>
              </label>
              <label className="flex items-start gap-3">
                <input type="checkbox" className="mt-0.5 h-4 w-4 rounded border-gray-300 text-brand-500" />
                <div>
                  <span className="font-medium text-gray-900 dark:text-surface-100">Báo cáo hàng ngày</span>
                  <p className="text-sm text-gray-500 dark:text-surface-400">Gửi email tổng kết hoạt động cuối ngày</p>
                </div>
              </label>
            </fieldset>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

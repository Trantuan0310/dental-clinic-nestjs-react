import type { ReactNode } from 'react';
import { Bell, Building2, Clock, Info } from 'lucide-react';
import { Alert, Card } from '@/components/ui';
import { clinic } from '@/config/clinic';

/**
 * Read-only view of the clinic details the app actually uses. They are not
 * stored in the database: the landing page, printed invoices/prescriptions and
 * the page title read CLINIC_* from .env.production at build time (see
 * src/config/clinic.ts), so this page shows them and says where to change
 * them instead of offering a form that would save nothing.
 */

function Row({ label, envKey, value }: { label: string; envKey: string; value: ReactNode }) {
  return (
    <div className="grid gap-1 border-b border-gray-100 py-2.5 last:border-0 sm:grid-cols-[12rem_1fr_auto] sm:items-center sm:gap-4 dark:border-surface-800">
      <dt className="text-sm font-medium text-gray-700 dark:text-surface-200">{label}</dt>
      <dd className="break-words text-sm text-gray-900 dark:text-surface-100">
        {value || <span className="text-gray-400 dark:text-surface-500">Chưa cấu hình (đang ẩn)</span>}
      </dd>
      <dd>
        <code className="rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-600 dark:bg-surface-800 dark:text-surface-300">
          {envKey}
        </code>
      </dd>
    </div>
  );
}

export default function SettingsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">Thông tin phòng khám</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-surface-400">
          Thông tin đang hiển thị trên trang chủ, bản in hóa đơn, đơn thuốc và kết quả tìm kiếm Google
        </p>
      </div>

      <Alert type="info">
        Các thông tin này lấy từ tệp <code>.env.production</code> trên máy chủ (biến <code>CLINIC_*</code>) khi
        dựng giao diện, nên không sửa được tại đây. Để đổi: sửa tệp đó rồi dựng lại giao diện web, ví dụ{' '}
        <code>docker compose --env-file .env.production -f docker-compose.prod.yml up -d --build web</code> (hoặc
        chạy <code>scripts/deploy-vps.sh</code>). Xem docs/08_Deployment/CLINIC_SETUP.md.
      </Alert>

      <Card
        title={
          <span className="flex items-center gap-2">
            <Building2 className="h-4 w-4" aria-hidden /> Thông tin liên hệ
          </span>
        }
      >
        <dl>
          <Row label="Tên phòng khám" envKey="CLINIC_NAME" value={clinic.name} />
          <Row label="Khẩu hiệu" envKey="CLINIC_TAGLINE" value={clinic.tagline} />
          <Row label="Địa chỉ" envKey="CLINIC_ADDRESS" value={clinic.address} />
          <Row label="Hotline" envKey="CLINIC_PHONE" value={clinic.phone} />
          <Row label="Zalo" envKey="CLINIC_ZALO" value={clinic.zaloHref} />
          <Row label="Email" envKey="CLINIC_EMAIL" value={clinic.email} />
          <Row label="Bản đồ" envKey="CLINIC_MAP_URL" value={clinic.mapUrl} />
          <Row label="Facebook" envKey="CLINIC_FACEBOOK_URL" value={clinic.facebookUrl} />
        </dl>
      </Card>

      <Card
        title={
          <span className="flex items-center gap-2">
            <Clock className="h-4 w-4" aria-hidden /> Giờ mở cửa (hiển thị)
          </span>
        }
      >
        <dl>
          <Row label={clinic.hours[0].days} envKey="CLINIC_HOURS" value={clinic.hours[0].time} />
          <Row label={clinic.hours[1].days} envKey="CLINIC_SUNDAY_HOURS" value={clinic.hours[1].time} />
        </dl>
        <p className="mt-3 flex gap-2 text-sm text-gray-500 dark:text-surface-400">
          <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          Đây chỉ là giờ ghi trên trang chủ và Google. Giờ trống để đặt lịch tính theo lịch làm việc của từng
          bác sĩ (trang Lịch làm việc) và các ngày nghỉ/đổi giờ của phòng khám.
        </p>
      </Card>

      <Card
        title={
          <span className="flex items-center gap-2">
            <Bell className="h-4 w-4" aria-hidden /> Email thông báo
          </span>
        }
      >
        <p className="text-sm text-gray-700 dark:text-surface-200">
          Email gửi khách (tình trạng yêu cầu đặt lịch online) và nhân viên (tạo/đặt lại mật khẩu, có yêu cầu đặt lịch mới) chỉ được
          gửi khi máy chủ có <code>SMTP_HOST</code>, <code>SMTP_USER</code>, <code>SMTP_PASS</code> (và{' '}
          <code>SMTP_PORT</code>, <code>EMAIL_FROM</code>) trong <code>.env.production</code>. Thiếu các biến này
          thì hệ thống bỏ qua việc gửi email, các chức năng khác vẫn chạy. Trang này không kiểm tra được máy chủ đã
          cấu hình hay chưa: hãy xem nhật ký máy chủ hoặc thử đặt lịch online với một email thật.
        </p>
      </Card>
    </div>
  );
}

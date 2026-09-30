import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, CheckCircle2, Info } from 'lucide-react';
import { Card } from '@/components/ui';
import { useAuthStore } from '@/stores/authStore';
import type { DentistReadiness } from './types';

type Level = 'ok' | 'warn' | 'info';

interface Item {
  level: Level;
  /** One text node on purpose: status words stay inside a sentence. */
  text: string;
  action?: ReactNode;
}

const ICON: Record<Level, ReactNode> = {
  ok: <CheckCircle2 className="h-4 w-4 shrink-0 text-green-600" aria-hidden />,
  warn: <AlertTriangle className="h-4 w-4 shrink-0 text-amber-500" aria-hidden />,
  info: <Info className="h-4 w-4 shrink-0 text-gray-400" aria-hidden />,
};

const linkClass = 'whitespace-nowrap text-xs text-brand-600 underline hover:no-underline';

/**
 * "Sẵn sàng nhận lịch": everything that decides whether this dentist shows
 * up in the booking form, the online booking page and the home page, each
 * with a link to where it is fixed.
 */
export function DentistReadinessCard({
  readiness: r,
  onEditProfile,
}: {
  readiness: DentistReadiness;
  /** Opens the profile form; undefined when the viewer cannot edit it. */
  onEditProfile?: () => void;
}) {
  const hasPermission = useAuthStore((s) => s.hasPermission);
  const edit = (label: string) =>
    onEditProfile ? (
      <button type="button" className={linkClass} onClick={onEditProfile}>
        {label}
      </button>
    ) : undefined;
  const to = (path: string, label: string, permission: string) =>
    hasPermission(permission) ? (
      <Link to={path} className={linkClass}>
        {label}
      </Link>
    ) : undefined;

  const items: Item[] = [];

  if (r.accountStatus === 'PENDING_SETUP') {
    items.push({
      level: 'warn',
      text: 'Tài khoản đăng nhập đang chờ thiết lập: vẫn nhận lịch, nhưng bác sĩ chưa đăng nhập được để khám.',
      action: to('/admin/users', 'Gửi link / cấp mật khẩu tạm', 'user.read'),
    });
  } else if (r.accountStatus === 'DEACTIVATED') {
    items.push({
      level: 'warn',
      text: 'Tài khoản đăng nhập đã bị vô hiệu hóa.',
      action: to('/admin/users', 'Trang Người dùng', 'user.read'),
    });
  } else {
    items.push({ level: 'ok', text: 'Tài khoản đăng nhập hoạt động.' });
  }

  if (r.practiceStatus !== 'ACTIVE') {
    items.push({
      level: 'warn',
      text: 'Hành nghề đang bị tạm dừng: không nhận lịch hẹn mới (lịch làm việc vẫn sửa được).',
    });
  } else if (r.employmentStatus === 'ON_LEAVE') {
    items.push({
      level: 'warn',
      text: 'Nhân viên đang tạm nghỉ: không nhận lịch hẹn mới.',
      action: to('/staff', 'Trang Nhân sự', 'employee.update'),
    });
  } else {
    items.push({ level: 'ok', text: 'Đang nhận lịch hẹn tại quầy.' });
  }

  if (!r.acceptsOnlineBooking) {
    items.push({
      level: 'warn',
      text: 'Đặt lịch online đang tắt: bệnh nhân không chọn được bác sĩ này trên trang đặt lịch.',
      action: edit('Bật trong hồ sơ'),
    });
  } else if (!r.acceptsNewPatients) {
    items.push({
      level: 'warn',
      text: 'Không nhận bệnh nhân mới: ẩn khỏi trang đặt lịch online.',
      action: edit('Sửa hồ sơ'),
    });
  } else {
    items.push({ level: 'ok', text: 'Đặt lịch online: đang bật.' });
  }

  items.push(
    r.hasCurrentSchedule
      ? { level: 'ok', text: 'Có lịch làm việc đang hiệu lực.' }
      : {
          level: 'warn',
          text: 'Chưa có lịch làm việc hiệu lực: không có giờ trống để đặt.',
          action: to('/schedule', 'Thêm lịch làm việc', 'schedule.read'),
        },
  );

  items.push(
    r.activeServiceCount > 0
      ? { level: 'ok', text: `Được phân công ${r.activeServiceCount} dịch vụ.` }
      : {
          level: 'warn',
          text: 'Chưa phân công dịch vụ: không xuất hiện khi đặt lịch theo dịch vụ hay đặt online.',
          action: (
            <a href="#dentist-services" className={linkClass}>
              Phân công dịch vụ
            </a>
          ),
        },
  );

  items.push(
    r.hasPhoto
      ? { level: 'ok', text: 'Có ảnh trên trang chủ.' }
      : {
          level: 'info',
          text: 'Chưa có ảnh: trang chủ hiện chữ viết tắt của tên.',
          action: (
            <a href="#dentist-photo" className={linkClass}>
              Tải ảnh
            </a>
          ),
        },
  );

  if (r.placeholderName) {
    items.push({
      level: 'warn',
      text: 'Tên hiển thị vẫn là “Quản trị viên”: bệnh nhân và lịch hẹn sẽ thấy tên này.',
      action: to('/staff', 'Đổi tên ở Nhân sự', 'employee.update'),
    });
  }

  const pending = items.filter((i) => i.level === 'warn').length;

  return (
    <Card
      title="Sẵn sàng nhận lịch"
      description={pending === 0 ? 'Đủ điều kiện nhận lịch hẹn.' : `Còn ${pending} mục cần xử lý.`}
    >
      <ul className="space-y-2 text-sm">
        {items.map((item) => (
          <li key={item.text} className="flex items-start gap-2">
            <span className="mt-0.5">{ICON[item.level]}</span>
            <span className="flex-1 text-gray-700 dark:text-surface-200">{item.text}</span>
            {item.action}
          </li>
        ))}
      </ul>
    </Card>
  );
}

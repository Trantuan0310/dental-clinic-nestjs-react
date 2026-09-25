import type { AxiosError } from 'axios';
import type { BadgeProps } from '@/components/ui';
import { getApiErrorMessage } from '@/lib/errors';
import type {
  BlockingAppointment,
  EmployeeType,
  EmploymentStatus,
  Gender,
  PracticeStatus,
} from './types';

export const EMPLOYEE_TYPE_LABEL: Record<EmployeeType, string> = {
  DENTIST: 'Bác sĩ',
  ASSISTANT: 'Phụ tá',
  RECEPTIONIST: 'Lễ tân',
  MANAGER: 'Quản lý',
  OTHER: 'Khác',
};

export const EMPLOYMENT_STATUS_LABEL: Record<EmploymentStatus, string> = {
  ACTIVE: 'Đang làm',
  ON_LEAVE: 'Tạm nghỉ',
  TERMINATED: 'Đã nghỉ việc',
};

export const EMPLOYMENT_STATUS_VARIANT: Record<EmploymentStatus, BadgeProps['variant']> = {
  ACTIVE: 'success',
  ON_LEAVE: 'warning',
  TERMINATED: 'default',
};

export const PRACTICE_STATUS_LABEL: Record<PracticeStatus, string> = {
  ACTIVE: 'Đang hành nghề',
  SUSPENDED: 'Tạm đình chỉ',
  INACTIVE: 'Ngừng hành nghề',
};

export const PRACTICE_STATUS_VARIANT: Record<PracticeStatus, BadgeProps['variant']> = {
  ACTIVE: 'success',
  SUSPENDED: 'warning',
  INACTIVE: 'default',
};

export const GENDER_LABEL: Record<Gender, string> = {
  MALE: 'Nam',
  FEMALE: 'Nữ',
  OTHER: 'Khác',
  UNDISCLOSED: 'Không tiết lộ',
};

/** Same fixed codes as the backend DTO (DENTIST_SPECIALTIES). */
export const SPECIALTY_LABEL: Record<string, string> = {
  TONG_QUAT: 'Nha khoa tổng quát',
  NHA_CHU: 'Nha chu',
  NOI_NHA: 'Nội nha',
  CHINH_NHA: 'Chỉnh nha',
  NHO_RANG: 'Nhổ răng / tiểu phẫu',
  PHUC_HINH: 'Phục hình',
  IMPLANT: 'Implant',
  NHA_TRE_EM: 'Nha khoa trẻ em',
  THAM_MY: 'Thẩm mỹ',
};

export const CALENDAR_COLORS = [
  '#2563EB',
  '#16A34A',
  '#DC2626',
  '#9333EA',
  '#EA580C',
  '#0891B2',
  '#DB2777',
  '#65A30D',
];

export const DAY_OF_WEEK_LABEL = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];

interface StaffErrorBody {
  code?: string;
  message?: string | string[];
  details?: { appointments?: BlockingAppointment[] };
}

const CODE_MESSAGE: Record<string, string> = {
  EMPLOYEE_NOT_FOUND: 'Không tìm thấy nhân viên.',
  DENTIST_PROFILE_NOT_FOUND: 'Không tìm thấy hồ sơ bác sĩ.',
  DENTIST_PROFILE_NOT_ALLOWED:
    'Chỉ nhân viên đang làm việc và đã có tài khoản mới được tạo hồ sơ bác sĩ.',
  STAFF_LINK_CONFLICT: 'Tài khoản hoặc hồ sơ này đã được gắn với nhân viên khác.',
  LICENSE_NUMBER_TAKEN: 'Số chứng chỉ hành nghề đã được dùng cho bác sĩ khác.',
  DENTIST_HAS_FUTURE_APPOINTMENTS:
    'Bác sĩ còn lịch hẹn sắp tới. Hãy chuyển hoặc hủy các lịch này trước.',
  CANNOT_REMOVE_LAST_ADMIN: 'Không thể cho nghỉ quản trị viên cuối cùng của phòng khám.',
  EMAIL_ALREADY_EXISTS: 'Email đăng nhập đã được dùng cho tài khoản khác.',
};

/** Vietnamese message for a staff API error, keyed by its business code. */
export function staffErrorMessage(error: unknown, fallback: string): string {
  const body = (error as AxiosError<StaffErrorBody>)?.response?.data;
  if (body?.code && CODE_MESSAGE[body.code]) return CODE_MESSAGE[body.code];
  return getApiErrorMessage(error, fallback);
}

/** Bookings that block suspending/terminating a dentist (BR-STAFF-004). */
export function blockingAppointments(error: unknown): BlockingAppointment[] | null {
  const body = (error as AxiosError<StaffErrorBody>)?.response?.data;
  return body?.code === 'DENTIST_HAS_FUTURE_APPOINTMENTS'
    ? (body.details?.appointments ?? [])
    : null;
}

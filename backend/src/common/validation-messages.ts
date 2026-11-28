import { BadRequestException, type ValidationError } from '@nestjs/common';

/**
 * class-validator's default messages are English ("fullName must be longer
 * than or equal to 2 characters") and the frontend shows API messages as
 * they come. Messages a DTO already wrote (Vietnamese) are kept; the
 * defaults are rewritten in Vietnamese with a readable field name.
 */
const LABELS: Record<string, string> = {
  reason: 'Lý do',
  description: 'Mô tả',
  dentistId: 'Bác sĩ',
  notes: 'Ghi chú',
  note: 'Ghi chú',
  status: 'Trạng thái',
  name: 'Tên',
  fullName: 'Họ và tên',
  email: 'Email',
  loginEmail: 'Email đăng nhập',
  phone: 'Số điện thoại',
  primaryPhone: 'Số điện thoại',
  contactPersonPhone: 'Số điện thoại người liên hệ',
  contactPersonName: 'Người liên hệ',
  type: 'Loại',
  quantity: 'Số lượng',
  patientId: 'Bệnh nhân',
  date: 'Ngày',
  from: 'Từ ngày',
  to: 'Đến ngày',
  startAt: 'Thời gian bắt đầu',
  endAt: 'Thời gian kết thúc',
  startTime: 'Giờ bắt đầu',
  endTime: 'Giờ kết thúc',
  startDate: 'Ngày bắt đầu',
  endDate: 'Ngày kết thúc',
  dob: 'Ngày sinh',
  gender: 'Giới tính',
  address: 'Địa chỉ',
  chiefComplaint: 'Lý do khám',
  diagnosis: 'Chẩn đoán',
  unitPrice: 'Đơn giá',
  price: 'Giá',
  basePrice: 'Giá niêm yết',
  costPrice: 'Giá vốn',
  unit: 'Đơn vị',
  items: 'Danh sách',
  amount: 'Số tiền',
  amountVnd: 'Số tiền',
  toothNumbers: 'Số răng',
  teeth: 'Số răng',
  serviceId: 'Dịch vụ',
  serviceIds: 'Dịch vụ',
  categoryId: 'Nhóm',
  procedure: 'Thủ thuật',
  title: 'Tiêu đề',
  code: 'Mã',
  sku: 'Mã vật tư',
  content: 'Nội dung',
  message: 'Nội dung',
  appointmentId: 'Lịch hẹn',
  inventoryItemId: 'Vật tư',
  durationMin: 'Thời lượng',
  durationMinutes: 'Thời lượng',
  slotDurationMin: 'Thời lượng mỗi lượt',
  effectiveFrom: 'Ngày hiệu lực',
  effectiveTo: 'Ngày hết hiệu lực',
  validFrom: 'Ngày hiệu lực',
  validTo: 'Ngày hết hiệu lực',
  hireDate: 'Ngày vào làm',
  terminationDate: 'Ngày nghỉ việc',
  employeeType: 'Loại nhân viên',
  employmentStatus: 'Trạng thái làm việc',
  expenseDate: 'Ngày chi',
  drugName: 'Tên thuốc',
  dosage: 'Liều dùng',
  frequency: 'Cách dùng',
  duration: 'Số ngày dùng',
  instructions: 'Hướng dẫn',
  allergies: 'Dị ứng',
  chronicDiseases: 'Bệnh mãn tính',
  currentMedications: 'Thuốc đang dùng',
  occupation: 'Nghề nghiệp',
  roles: 'Vai trò',
  roleIds: 'Vai trò',
  permissions: 'Quyền',
  permissionCodes: 'Quyền',
  password: 'Mật khẩu',
  newPassword: 'Mật khẩu mới',
  currentPassword: 'Mật khẩu hiện tại',
  token: 'Mã xác thực',
  minStockLevel: 'Tồn tối thiểu',
  dayOfWeek: 'Thứ',
  daysOfWeek: 'Các ngày trong tuần',
  discountValue: 'Giá trị giảm',
  discountType: 'Kiểu giảm giá',
  method: 'Phương thức',
  paymentDate: 'Ngày thanh toán',
  paymentReference: 'Mã giao dịch',
  licenseNumber: 'Số chứng chỉ hành nghề',
  calendarColor: 'Màu lịch',
  sortOrder: 'Thứ tự',
  page: 'Trang',
  pageSize: 'Số dòng mỗi trang',
  limit: 'Số dòng',
  q: 'Từ khóa',
  search: 'Từ khóa',
  year: 'Năm',
  position: 'Chức vụ',
  bio: 'Giới thiệu',
  rating: 'Số sao',
  comment: 'Nhận xét',
  commissionPct: 'Tỉ lệ hoa hồng',
  baseSalaryVnd: 'Lương cơ bản',
  shiftType: 'Loại ca',
  periodStart: 'Đầu kỳ',
  periodEnd: 'Cuối kỳ',
  text: 'Nội dung',
  summary: 'Tóm tắt',
  planId: 'Kế hoạch',
  recallIntervalMonths: 'Chu kỳ tái khám',
  practiceSince: 'Năm bắt đầu hành nghề',
};

const label = (prop: string) => LABELS[prop] ?? `Trường “${prop}”`;
const num = (msg: string) => msg.match(/-?\d+(\.\d+)?/)?.[0] ?? '';
const VI = /[ăâđêôơưàáảãạằắẳẵặầấẩẫậèéẻẽẹềếểễệìíỉĩịòóỏõọồốổỗộờớởỡợùúủũụừứửữựỳýỷỹỵĐ]/i;

export function translateConstraint(prop: string, key: string, message: string): string {
  if (VI.test(message)) return message; // already written for the user
  const f = label(prop);
  switch (key) {
    case 'isNotEmpty':
    case 'isDefined':
      return `Vui lòng nhập ${f.toLowerCase()}`;
    case 'isString':
      return `${f} phải là chữ`;
    case 'minLength':
      return `${f} cần ít nhất ${num(message)} ký tự`;
    case 'maxLength':
      return `${f} tối đa ${num(message)} ký tự`;
    case 'length':
      return `${f} có độ dài không hợp lệ`;
    case 'min':
      return `${f} không được nhỏ hơn ${num(message)}`;
    case 'max':
      return `${f} không được lớn hơn ${num(message)}`;
    case 'isInt':
      return `${f} phải là số nguyên`;
    case 'isNumber':
    case 'isNumberString':
    case 'isDecimal':
      return `${f} phải là số`;
    case 'isPositive':
      return `${f} phải lớn hơn 0`;
    case 'isBoolean':
      return `${f} không hợp lệ`;
    case 'isEmail':
      return 'Email không đúng định dạng';
    case 'isUuid':
    case 'isUUID':
      return `${f} không hợp lệ`;
    case 'isEnum':
    case 'isIn':
      return `${f} không nằm trong các giá trị cho phép`;
    case 'isDateString':
    case 'isIso8601':
    case 'isISO8601':
    case 'isDate':
      return `${f} không phải ngày giờ hợp lệ`;
    case 'isArray':
      return `${f} phải là danh sách`;
    case 'arrayMinSize':
      return `${f} cần ít nhất ${num(message)} mục`;
    case 'arrayMaxSize':
      return `${f} tối đa ${num(message)} mục`;
    case 'arrayNotEmpty':
      return `${f} không được để trống`;
    case 'matches':
      return `${f} không đúng định dạng`;
    case 'isObject':
      return `${f} không hợp lệ`;
    case 'whitelistValidation':
      return `Không được gửi ${f.toLowerCase()}`;
    default:
      return `${f} không hợp lệ`;
  }
}

function collect(errors: ValidationError[], parent = ''): string[] {
  return errors.flatMap(e => {
    const own = Object.entries(e.constraints ?? {}).map(([key, msg]) =>
      translateConstraint(e.property, key, msg),
    );
    return [...own, ...collect(e.children ?? [], parent ? `${parent}.${e.property}` : e.property)];
  });
}

/** For ValidationPipe({ exceptionFactory }): the same 400 shape, messages in Vietnamese. */
export function validationExceptionFactory(errors: ValidationError[]): BadRequestException {
  return new BadRequestException([...new Set(collect(errors))]);
}

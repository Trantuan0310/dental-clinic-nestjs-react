import { Prisma, PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';
import { backfillStaffRecords } from './staff-backfill';
import { DEFAULT_TAX_BRACKETS } from '../src/payroll/domain/tax-calculator';

const prisma = new PrismaClient();

const SYSTEM_ROLES = [
  {
    code: 'clinic_admin',
    name: 'Quản trị viên',
    description: 'Toàn quyền quản trị hệ thống',
    isSystem: true,
  },
  {
    code: 'receptionist',
    name: 'Lễ tân',
    description: 'Nhân viên lễ tân - quản lý lịch hẹn và bệnh nhân',
    isSystem: true,
  },
  {
    code: 'dentist',
    name: 'Bác sĩ',
    description: 'Bác sĩ nha khoa - khám và điều trị',
    isSystem: true,
  },
];

const PERMISSIONS = [
  // User permissions
  { code: 'user.create', resource: 'user', action: 'create', description: 'Tạo người dùng mới' },
  {
    code: 'user.read',
    resource: 'user',
    action: 'read',
    description: 'Xem danh sách và chi tiết người dùng',
  },
  {
    code: 'user.update',
    resource: 'user',
    action: 'update',
    description: 'Cập nhật thông tin người dùng',
  },
  {
    code: 'user.deactivate',
    resource: 'user',
    action: 'deactivate',
    description: 'Vô hiệu hóa/kích hoạt người dùng',
  },
  {
    code: 'user.reset_password',
    resource: 'user',
    action: 'reset_password',
    description: 'Đặt lại mật khẩu người dùng',
  },

  // Role permissions
  { code: 'role.upsert', resource: 'role', action: 'upsert', description: 'Tạo/sửa/xóa vai trò' },

  // System permissions
  {
    code: 'system.audit.read',
    resource: 'system',
    action: 'audit.read',
    description: 'Xem nhật ký kiểm toán',
  },

  // Patient permissions
  {
    code: 'patient.create',
    resource: 'patient',
    action: 'create',
    description: 'Tạo hồ sơ bệnh nhân',
  },
  {
    code: 'patient.read',
    resource: 'patient',
    action: 'read',
    description: 'Xem thông tin bệnh nhân',
  },
  {
    code: 'patient.update',
    resource: 'patient',
    action: 'update',
    description: 'Cập nhật thông tin bệnh nhân',
  },
  {
    code: 'patient.merge',
    resource: 'patient',
    action: 'merge',
    description: 'Gộp hồ sơ bệnh nhân',
  },
  {
    code: 'patient.restore',
    resource: 'patient',
    action: 'restore',
    description: 'Khôi phục bệnh nhân đã xóa',
  },
  {
    code: 'patient.delete',
    resource: 'patient',
    action: 'delete',
    description: 'Xóa mềm bệnh nhân',
  },
  {
    code: 'patient.identifier.manage',
    resource: 'patient',
    action: 'identifier.manage',
    description: 'Quản lý giấy tờ định danh',
  },

  // Appointment permissions
  {
    code: 'appointment.create',
    resource: 'appointment',
    action: 'create',
    description: 'Tạo lịch hẹn mới',
  },
  {
    code: 'appointment.read',
    resource: 'appointment',
    action: 'read',
    description: 'Xem lịch hẹn',
  },
  {
    code: 'appointment.read.any',
    resource: 'appointment',
    action: 'read.any',
    description: 'Xem tất cả lịch hẹn (admin)',
  },
  {
    code: 'appointment.read.own',
    resource: 'appointment',
    action: 'read.own',
    description: 'Xem lịch hẹn của mình',
  },
  {
    code: 'appointment.update',
    resource: 'appointment',
    action: 'update',
    description: 'Cập nhật lịch hẹn',
  },
  {
    code: 'appointment.cancel',
    resource: 'appointment',
    action: 'cancel',
    description: 'Hủy lịch hẹn',
  },
  {
    code: 'appointment.check_in',
    resource: 'appointment',
    action: 'check_in',
    description: 'Check-in bệnh nhân',
  },
  {
    code: 'appointment.no_show',
    resource: 'appointment',
    action: 'no_show',
    description: 'Đánh dấu vắng mặt',
  },
  {
    code: 'appointment.schedule.manage',
    resource: 'appointment',
    action: 'schedule.manage',
    description: 'Quản lý lịch làm việc',
  },

  // Staff permissions (ADR-0009 phase 1; migration 019 inserts the same rows)
  {
    code: 'employee.read',
    resource: 'employee',
    action: 'read',
    description: 'Xem danh sách và hồ sơ nhân viên',
  },
  {
    code: 'employee.create',
    resource: 'employee',
    action: 'create',
    description: 'Tạo hồ sơ nhân viên',
  },
  {
    code: 'employee.update',
    resource: 'employee',
    action: 'update',
    description: 'Cập nhật hồ sơ nhân viên, liên kết tài khoản',
  },
  {
    code: 'employee.deactivate',
    resource: 'employee',
    action: 'deactivate',
    description: 'Cho nhân viên nghỉ việc',
  },
  {
    code: 'dentist.read',
    resource: 'dentist',
    action: 'read',
    description: 'Xem hồ sơ bác sĩ',
  },
  {
    code: 'dentist.create',
    resource: 'dentist',
    action: 'create',
    description: 'Tạo hồ sơ bác sĩ cho nhân viên',
  },
  {
    code: 'dentist.update',
    resource: 'dentist',
    action: 'update',
    description: 'Cập nhật hồ sơ bác sĩ',
  },
  {
    code: 'dentist.update.own',
    resource: 'dentist',
    action: 'update.own',
    description: 'Bác sĩ cập nhật hồ sơ của chính mình',
  },
  {
    code: 'dentist.deactivate',
    resource: 'dentist',
    action: 'deactivate',
    description: 'Ngừng/tạm đình chỉ hành nghề bác sĩ',
  },
  {
    code: 'dentist.assign_service',
    resource: 'dentist',
    action: 'assign_service',
    description: 'Phân công dịch vụ cho bác sĩ',
  },
  {
    code: 'dentist.manage_schedule',
    resource: 'dentist',
    action: 'manage_schedule',
    description: 'Quản lý lịch làm việc bác sĩ',
  },

  // Service catalogue permissions (ADR-0009 phase 2; migration 020 inserts the same rows)
  {
    code: 'service.read',
    resource: 'service',
    action: 'read',
    description: 'Xem danh mục dịch vụ',
  },
  {
    code: 'service.manage',
    resource: 'service',
    action: 'manage',
    description: 'Tạo/sửa/ngừng dịch vụ và nhóm dịch vụ',
  },

  // Time-off approval (ADR-0009 phase 3; migration 021 inserts the same row)
  {
    code: 'time_off.approve',
    resource: 'time_off',
    action: 'approve',
    description: 'Duyệt/từ chối đơn nghỉ phép của bác sĩ',
  },

  // ADR-0009 phase 5 (migration 023 inserts the same row)
  {
    code: 'appointment.mark_left',
    resource: 'appointment',
    action: 'mark_left',
    description: 'Ghi nhận bệnh nhân đã về trước khi khám',
  },
  // ADR-0009 phase 6 (migration 024 inserts the same rows)
  { code: 'queue.read', resource: 'queue', action: 'read', description: 'Xem hàng đợi khám' },
  {
    code: 'queue.call',
    resource: 'queue',
    action: 'call',
    description: 'Gọi / bỏ qua bệnh nhân trong hàng đợi',
  },
  {
    code: 'queue.manage',
    resource: 'queue',
    action: 'manage',
    description: 'Điều phối: ưu tiên cấp cứu, chuyển bác sĩ, thay bác sĩ cả ngày',
  },

  // Schedule permissions (controllers use dotted/underscored aliases)
  {
    code: 'schedule.write',
    resource: 'schedule',
    action: 'write',
    description: 'Tạo/sửa lịch làm việc & time-off',
  },
  {
    code: 'schedule.read',
    resource: 'schedule',
    action: 'read',
    description: 'Xem lịch làm việc & time-off',
  },

  // Shift Registration permissions (controllers use shift_registration.*)
  {
    code: 'shift_registration.write',
    resource: 'shift_registration',
    action: 'write',
    description: 'Đăng ký/hủy ca làm việc',
  },
  {
    code: 'shift_registration.read',
    resource: 'shift_registration',
    action: 'read',
    description: 'Xem ca đăng ký',
  },
  {
    code: 'shift_registration.approve',
    resource: 'shift_registration',
    action: 'approve',
    description: 'Duyệt/từ chối ca đăng ký',
  },

  // Medical Record permissions
  {
    code: 'encounter.read',
    resource: 'encounter',
    action: 'read',
    description: 'Xem hồ sơ y khoa',
  },
  {
    code: 'encounter.read.any',
    resource: 'encounter',
    action: 'read.any',
    description: 'Xem tất cả phiên khám (admin)',
  },
  {
    code: 'encounter.read.own',
    resource: 'encounter',
    action: 'read.own',
    description: 'Xem phiên khám của mình',
  },
  {
    code: 'encounter.read.basic',
    resource: 'encounter',
    action: 'read.basic',
    description: 'Xem phiên khám ở mức cơ bản (receptionist)',
  },
  {
    code: 'encounter.complete',
    resource: 'encounter',
    action: 'complete',
    description: 'Hoàn tất/đóng phiên khám',
  },
  {
    code: 'encounter.start',
    resource: 'encounter',
    action: 'start',
    description: 'Bắt đầu phiên khám từ appointment',
  },
  {
    code: 'encounter.cancel',
    resource: 'encounter',
    action: 'cancel',
    description: 'Hủy phiên khám (admin)',
  },
  {
    code: 'clinical_note.write',
    resource: 'clinical_note',
    action: 'write',
    description: 'Tạo/cập nhật ghi chú lâm sàng',
  },
  {
    code: 'clinical_note.addendum',
    resource: 'clinical_note',
    action: 'addendum',
    description: 'Thêm phụ lục ghi chú lâm sàng',
  },
  {
    code: 'treatment.write',
    resource: 'treatment',
    action: 'write',
    description: 'Tạo/sửa liệu trình điều trị',
  },
  {
    code: 'treatment.delete',
    resource: 'treatment',
    action: 'delete',
    description: 'Xóa mềm liệu trình điều trị',
  },
  {
    code: 'prescription.write',
    resource: 'prescription',
    action: 'write',
    description: 'Tạo/sửa/xóa toa thuốc',
  },
  {
    code: 'dental_chart.read',
    resource: 'dental_chart',
    action: 'read',
    description: 'Xem sơ đồ răng',
  },
  {
    code: 'dental_chart.write',
    resource: 'dental_chart',
    action: 'write',
    description: 'Cập nhật sơ đồ răng',
  },

  // Billing permissions
  { code: 'invoice.create', resource: 'invoice', action: 'create', description: 'Tạo hóa đơn' },
  { code: 'invoice.read', resource: 'invoice', action: 'read', description: 'Xem hóa đơn' },
  {
    code: 'invoice.read.any',
    resource: 'invoice',
    action: 'read.any',
    description: 'Xem tất cả hóa đơn',
  },
  {
    code: 'invoice.read.own',
    resource: 'invoice',
    action: 'read.own',
    description: 'Xem hóa đơn của encounter mình tạo',
  },
  {
    code: 'invoice.update',
    resource: 'invoice',
    action: 'update',
    description: 'Cập nhật hóa đơn',
  },
  {
    code: 'invoice.issue',
    resource: 'invoice',
    action: 'issue',
    description: 'Phát hành hóa đơn (draft → issued)',
  },
  { code: 'invoice.void', resource: 'invoice', action: 'void', description: 'Hủy hóa đơn' },
  {
    code: 'invoice.payment.create',
    resource: 'invoice',
    action: 'payment.create',
    description: 'Ghi nhận thanh toán cho hóa đơn',
  },
  {
    code: 'report.revenue.read',
    resource: 'report',
    action: 'revenue.read',
    description: 'Xem báo cáo doanh thu',
  },
  {
    code: 'report.outstanding.read',
    resource: 'report',
    action: 'outstanding.read',
    description: 'Xem báo cáo công nợ',
  },
  {
    code: 'invoice.audit.read',
    resource: 'invoice',
    action: 'audit.read',
    description: 'Xem lịch sử thay đổi hóa đơn',
  },

  // Inventory permissions
  { code: 'inventory.read', resource: 'inventory', action: 'read', description: 'Xem tồn kho' },
  { code: 'inventory.create', resource: 'inventory', action: 'create', description: 'Tạo vật tư' },
  {
    code: 'inventory.update',
    resource: 'inventory',
    action: 'update',
    description: 'Cập nhật vật tư',
  },
  {
    code: 'inventory.delete',
    resource: 'inventory',
    action: 'delete',
    description: 'Xóa mềm/khôi phục vật tư',
  },
  {
    code: 'inventory.stock_in',
    resource: 'inventory',
    action: 'stock_in',
    description: 'Nhập kho',
  },
  {
    code: 'inventory.stock_out',
    resource: 'inventory',
    action: 'stock_out',
    description: 'Xuất kho thủ công',
  },

  // Shift Registration permissions (Phase 9 — BD-0010)
  {
    code: 'shift.register',
    resource: 'shift',
    action: 'register',
    description: 'Đăng ký ca làm việc tự do',
  },
  {
    code: 'shift.read.any',
    resource: 'shift',
    action: 'read.any',
    description: 'Xem tất cả ca đăng ký',
  },
  {
    code: 'shift.read.own',
    resource: 'shift',
    action: 'read.own',
    description: 'Xem ca đăng ký của mình',
  },
  {
    code: 'shift.approve',
    resource: 'shift',
    action: 'approve',
    description: 'Duyệt/từ chối ca đăng ký',
  },
  { code: 'shift.cancel', resource: 'shift', action: 'cancel', description: 'Hủy ca đã đăng ký' },

  // Payroll permissions (Phase 9 — BD-0009)
  {
    code: 'payroll.read.any',
    resource: 'payroll',
    action: 'read.any',
    description: 'Xem bảng lương tất cả BS',
  },
  {
    code: 'payroll.read.own',
    resource: 'payroll',
    action: 'read.own',
    description: 'Xem bảng lương của mình',
  },
  {
    code: 'payroll.config.read',
    resource: 'payroll',
    action: 'config.read',
    description: 'Xem cấu hình payroll',
  },
  {
    code: 'payroll.config.update',
    resource: 'payroll',
    action: 'config.update',
    description: 'Cập nhật cấu hình payroll',
  },
  {
    code: 'payroll.compensation.read',
    resource: 'payroll',
    action: 'compensation.read',
    description: 'Xem chính sách lương BS',
  },
  {
    code: 'payroll.compensation.update',
    resource: 'payroll',
    action: 'compensation.update',
    description: 'Cập nhật chính sách lương BS',
  },
  {
    code: 'payroll.period.create',
    resource: 'payroll',
    action: 'period.create',
    description: 'Tạo kỳ lương mới',
  },
  {
    code: 'payroll.period.compute',
    resource: 'payroll',
    action: 'period.compute',
    description: 'Tính toán lương kỳ',
  },
  {
    code: 'payroll.period.adjust',
    resource: 'payroll',
    action: 'period.adjust',
    description: 'Điều chỉnh bonus/penalty',
  },
  {
    code: 'payroll.period.lock',
    resource: 'payroll',
    action: 'period.lock',
    description: 'Khóa kỳ lương',
  },
  {
    code: 'payroll.period.approve',
    resource: 'payroll',
    action: 'period.approve',
    description: 'Duyệt kỳ lương',
  },
  {
    code: 'payroll.period.mark_paid',
    resource: 'payroll',
    action: 'period.mark_paid',
    description: 'Xác nhận đã trả lương',
  },
  {
    code: 'payslip.read.own',
    resource: 'payslip',
    action: 'read.own',
    description: 'Xem phiếu lương của mình',
  },
  // R2-4: dedicated admin-only permission for unambiguous role check in
  // sensitive ops (e.g. payroll period re-open, manual adjustments). Avoids
  // fragile AND-of-permissions pattern.
  {
    code: 'payroll.admin',
    resource: 'payroll',
    action: 'admin',
    description: 'Quản trị payroll (mở period, manual override, re-open)',
  },

  // ---------------------------------------------------------------------------
  // Frontend alias permissions (Phase 10.5 — FE/BE consistency)
  // FE code uses shorter permission codes; keep these as aliases so route
  // guards (`<ProtectedRoute permission="...">`) and sidebar filters don't
  // return 403 for users who actually have the underlying capability.
  // ---------------------------------------------------------------------------
  // Medical record (frontend shorthand) — covered by encounter.read + patient.read
  {
    code: 'medical_record.read',
    resource: 'medical_record',
    action: 'read',
    description: 'Xem bệnh án (alias FE cho encounter.read+patient.read)',
  },
  // Payroll / shift (frontend shorthand) — alias to dotted canonical
  {
    code: 'payroll.read',
    resource: 'payroll',
    action: 'read',
    description: 'Xem bảng lương (alias FE cho payroll.read.any/.own)',
  },
  {
    code: 'payroll.read_self',
    resource: 'payroll',
    action: 'read_self',
    description: 'Xem bảng lương của mình (alias FE cho payroll.read.own)',
  },
  {
    code: 'payroll.config',
    resource: 'payroll',
    action: 'config',
    description: 'Cấu hình payroll (alias FE cho payroll.config.read/update)',
  },
  {
    code: 'shift.read_self',
    resource: 'shift',
    action: 'read_self',
    description: 'Xem ca của tôi (alias FE cho shift.read.own)',
  },
  {
    code: 'appointment.mark_no_show',
    resource: 'appointment',
    action: 'mark_no_show',
    description: 'Đánh dấu vắng mặt (alias FE cho appointment.no_show)',
  },
  // Reporting (frontend shorthand) — alias to dotted canonical
  {
    code: 'report.read',
    resource: 'report',
    action: 'read',
    description: 'Xem báo cáo (alias FE cho report.revenue.read/outstanding.read)',
  },
  // Admin / system (frontend shorthand) — alias to canonical names
  {
    code: 'role.read',
    resource: 'role',
    action: 'read',
    description: 'Xem vai trò & quyền (alias FE cho role.upsert)',
  },
  {
    code: 'audit.read',
    resource: 'audit',
    action: 'read',
    description: 'Xem audit log (alias FE cho system.audit.read)',
  },
  {
    code: 'settings.read',
    resource: 'settings',
    action: 'read',
    description: 'Xem cài đặt hệ thống (alias FE cho role.upsert+system.audit.read)',
  },
  // AI summaries (Phase 8.0)
  {
    code: 'ai.summary.read',
    resource: 'ai',
    action: 'summary.read',
    description: 'Xem AI tóm tắt hồ sơ bệnh nhân (Dashboard / Reception)',
  },

  // Expense permissions (BR-EXP-001)
  {
    code: 'expense.read',
    resource: 'expense',
    action: 'read',
    description: 'Xem danh sách chi phí',
  },
  { code: 'expense.create', resource: 'expense', action: 'create', description: 'Tạo chi phí mới' },
  {
    code: 'expense.update',
    resource: 'expense',
    action: 'update',
    description: 'Cập nhật chi phí nháp',
  },
  {
    code: 'expense.delete',
    resource: 'expense',
    action: 'delete',
    description: 'Xóa chi phí nháp',
  },
  {
    code: 'expense.approve',
    resource: 'expense',
    action: 'approve',
    description: 'Duyệt/từ chối chi phí',
  },
];

const ROLE_PERMISSIONS: Record<string, string[]> = {
  clinic_admin: [
    ...PERMISSIONS.map(p => p.code),
    'expense.read',
    'expense.create',
    'expense.update',
    'expense.delete',
    'expense.approve',
  ],
  // Note: no shift_registration.approve/shift.approve here — approving a
  // dentist's registered work shift feeds directly into payroll (worked
  // hours -> compensation), so it belongs to admin/management, not front
  // desk, even though front desk coordinates the calendar day-to-day.
  receptionist: [
    'patient.create',
    'patient.read',
    'patient.update',
    'patient.identifier.manage',
    'appointment.create',
    'appointment.read',
    'appointment.read.any',
    'appointment.read.own',
    'appointment.update',
    'appointment.cancel',
    'appointment.check_in',
    'appointment.no_show',
    'appointment.mark_no_show',
    'appointment.mark_left',
    'queue.read',
    'queue.call',
    'queue.manage',
    'appointment.schedule.manage',
    'schedule.write',
    'schedule.read',
    'employee.read',
    'dentist.read',
    'dentist.manage_schedule',
    'service.read',
    'encounter.read.basic',
    'encounter.start',
    'invoice.create',
    'invoice.read',
    'invoice.read.any',
    'invoice.update',
    'invoice.issue',
    'invoice.payment.create',
    'inventory.read',
    'inventory.stock_in',
    'inventory.stock_out',
    'shift_registration.write',
    'shift_registration.read',
    'shift.read.any',
    'shift.read_self',
    // Front desk reconciles daily cash/card intake and chases outstanding
    // balances, so revenue/outstanding reports are part of the job —
    // report.read is only a nav-gating alias, the actual data endpoints
    // check these canonical permissions.
    'report.revenue.read',
    'report.outstanding.read',
    // Frontend aliases (Phase 10.5)
    'medical_record.read',
    'report.read',
    'ai.summary.read',
  ],
  dentist: [
    'patient.read',
    'queue.read',
    'queue.call',
    'appointment.read',
    'appointment.read.own',
    'appointment.update',
    'appointment.cancel',
    'appointment.schedule.manage',
    'schedule.write',
    'schedule.read',
    'dentist.read',
    'dentist.update.own',
    'dentist.manage_schedule',
    'service.read',
    'shift_registration.write',
    'shift_registration.read',
    'encounter.start',
    'encounter.read',
    'encounter.read.own',
    'encounter.complete',
    'clinical_note.write',
    'clinical_note.addendum',
    'treatment.write',
    'treatment.delete',
    'prescription.write',
    'dental_chart.read',
    'dental_chart.write',
    'invoice.read',
    'invoice.read.own',
    'inventory.read',
    'shift.register',
    'shift.read.own',
    'shift.cancel',
    'payroll.read.own',
    'payroll.compensation.read',
    'payslip.read.own',
    // Frontend aliases (Phase 10.5). Note: no payroll.read or payroll.config
    // — those gated the admin-only /payroll dashboard and /payroll/config
    // page respectively, which now require payroll.read.any/
    // payroll.config.read (admin-only). payroll.read_self covers the
    // dentist's own payroll pages.
    // No report.read: clinic-wide revenue/outstanding reconciliation isn't
    // a dentist's job (that's front desk's), so they don't get the Reports
    // page either — it would otherwise be a nav link to a page that can
    // never show real data for this role.
    'medical_record.read',
    'payroll.read_self',
    'shift.read_self',
    // appointment.no_show is the permission the route actually checks;
    // .mark_no_show is an FE-only alias for the same nav-gated button —
    // dentist held only the alias, so the "Đánh dấu vắng mặt" button the
    // UI already shows a dentist was a dead feature that always 403'd.
    'appointment.no_show',
    'appointment.mark_no_show',
    'ai.summary.read',
  ],
};

/**
 * BR-PAY-001: the clinic's single payroll configuration, with the same
 * defaults PayrollService.getConfig() creates on first use. Seeding it here
 * lets seed-clinical.ts build its sample payroll periods, which it skips
 * without a config. Never overwrites a config an admin has edited.
 */
async function ensurePayrollConfig() {
  if (await prisma.payrollConfig.findFirst()) return;
  await prisma.payrollConfig.create({
    data: { taxBrackets: DEFAULT_TAX_BRACKETS as unknown as Prisma.InputJsonValue },
  });
  console.log('Default payroll config created');
}

async function main() {
  if (
    process.env.NODE_ENV === 'production' &&
    (!process.env.BOOTSTRAP_ADMIN_EMAIL ||
      !process.env.BOOTSTRAP_ADMIN_PASSWORD ||
      process.env.BOOTSTRAP_ADMIN_PASSWORD.length < 16)
  ) {
    throw new Error(
      'Production bootstrap requires BOOTSTRAP_ADMIN_EMAIL and a password of at least 16 characters',
    );
  }
  console.log('Starting seed...');

  // Create system roles
  const createdRoles: Record<string, { id: string; code: string }> = {};
  for (const role of SYSTEM_ROLES) {
    const created = await prisma.role.upsert({
      where: { code: role.code },
      update: {},
      create: role,
    });
    createdRoles[role.code] = created;
    console.log(`Created role: ${role.code}`);
  }

  // Create permissions
  const createdPermissions: Record<string, { id: string; code: string }> = {};
  for (const permission of PERMISSIONS) {
    const created = await prisma.permission.upsert({
      where: { code: permission.code },
      update: {},
      create: permission,
    });
    createdPermissions[permission.code] = created;
  }
  console.log(`Created ${PERMISSIONS.length} permissions`);

  // Assign permissions to roles
  for (const [roleCode, permissionCodes] of Object.entries(ROLE_PERMISSIONS)) {
    const role = createdRoles[roleCode];
    if (!role) continue;

    for (const permCode of permissionCodes) {
      const permission = createdPermissions[permCode];
      if (!permission) continue;

      await prisma.rolePermission.upsert({
        where: {
          roleId_permissionId: {
            roleId: role.id,
            permissionId: permission.id,
          },
        },
        update: {},
        create: {
          roleId: role.id,
          permissionId: permission.id,
        },
      });
    }

    // Reconcile: drop any grant this role holds that ROLE_PERMISSIONS no
    // longer lists, so re-running the seed after a permission is removed
    // here (e.g. tightening a role's access) actually revokes it instead of
    // only ever adding new grants.
    const keepIds = permissionCodes
      .map(code => createdPermissions[code]?.id)
      .filter((id): id is string => !!id);
    const removed = await prisma.rolePermission.deleteMany({
      where: { roleId: role.id, permissionId: { notIn: keepIds } },
    });
    console.log(
      `Assigned ${permissionCodes.length} permissions to ${roleCode}` +
        (removed.count ? ` (revoked ${removed.count} stale grant(s))` : ''),
    );
  }

  // Create super admin user
  const adminEmail = process.env.BOOTSTRAP_ADMIN_EMAIL || 'admin@clinic.local';
  const existingAdmin = await prisma.user.findFirst({
    where: { email: adminEmail },
  });

  if (!existingAdmin) {
    const tempPassword = process.env.BOOTSTRAP_ADMIN_PASSWORD || 'Admin123!';
    const passwordHash = await argon2.hash(tempPassword, {
      type: argon2.argon2id,
      memoryCost: 65536,
      timeCost: 3,
      parallelism: 4,
      hashLength: 32,
      saltLength: 16,
    });

    await prisma.user.create({
      data: {
        email: adminEmail,
        fullName: 'Quản trị viên',
        passwordHash,
        status: 'PENDING_SETUP',
        userRoles: {
          create: {
            roleId: createdRoles['clinic_admin'].id,
          },
        },
      },
    });

    console.log('\n========================================');
    console.log('Super Admin Created:');
    console.log(`Email: ${adminEmail}`);
    console.log('========================================');
    console.log('Please login and change your password immediately!');
    console.log('========================================\n');
  } else {
    console.log(`Admin user already exists: ${adminEmail}`);
  }

  await backfillStaffRecords(prisma);
  await ensurePayrollConfig();

  console.log('Seed completed successfully!');
}

main()
  .catch(e => {
    console.error('Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

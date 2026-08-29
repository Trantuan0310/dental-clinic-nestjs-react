import { PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';

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
  { code: 'user.read', resource: 'user', action: 'read', description: 'Xem danh sách và chi tiết người dùng' },
  { code: 'user.update', resource: 'user', action: 'update', description: 'Cập nhật thông tin người dùng' },
  { code: 'user.deactivate', resource: 'user', action: 'deactivate', description: 'Vô hiệu hóa/kích hoạt người dùng' },
  { code: 'user.reset_password', resource: 'user', action: 'reset_password', description: 'Đặt lại mật khẩu người dùng' },
  { code: 'user.change_password.own', resource: 'user', action: 'change_password.own', description: 'Đổi mật khẩu của chính mình' },

  // Role permissions
  { code: 'role.upsert', resource: 'role', action: 'upsert', description: 'Tạo/sửa/xóa vai trò' },

  // System permissions
  { code: 'system.audit.read', resource: 'system', action: 'audit.read', description: 'Xem nhật ký kiểm toán' },

  // Patient permissions
  { code: 'patient.create', resource: 'patient', action: 'create', description: 'Tạo hồ sơ bệnh nhân' },
  { code: 'patient.read', resource: 'patient', action: 'read', description: 'Xem thông tin bệnh nhân' },
  { code: 'patient.update', resource: 'patient', action: 'update', description: 'Cập nhật thông tin bệnh nhân' },
  { code: 'patient.merge', resource: 'patient', action: 'merge', description: 'Gộp hồ sơ bệnh nhân' },
  { code: 'patient.restore', resource: 'patient', action: 'restore', description: 'Khôi phục bệnh nhân đã xóa' },
  { code: 'patient.delete', resource: 'patient', action: 'delete', description: 'Xóa mềm bệnh nhân' },
  { code: 'patient.identifier.manage', resource: 'patient', action: 'identifier.manage', description: 'Quản lý giấy tờ định danh' },

  // Appointment permissions
  { code: 'appointment.create', resource: 'appointment', action: 'create', description: 'Tạo lịch hẹn mới' },
  { code: 'appointment.read', resource: 'appointment', action: 'read', description: 'Xem lịch hẹn' },
  { code: 'appointment.read.any', resource: 'appointment', action: 'read.any', description: 'Xem tất cả lịch hẹn (admin)' },
  { code: 'appointment.read.own', resource: 'appointment', action: 'read.own', description: 'Xem lịch hẹn của mình' },
  { code: 'appointment.update', resource: 'appointment', action: 'update', description: 'Cập nhật lịch hẹn' },
  { code: 'appointment.cancel', resource: 'appointment', action: 'cancel', description: 'Hủy lịch hẹn' },
  { code: 'appointment.checkin', resource: 'appointment', action: 'checkin', description: 'Check-in bệnh nhân' },
  { code: 'appointment.check_in', resource: 'appointment', action: 'check_in', description: 'Check-in bệnh nhân (alias)' },
  { code: 'appointment.no_show', resource: 'appointment', action: 'no_show', description: 'Đánh dấu vắng mặt' },
  { code: 'appointment.schedule.manage', resource: 'appointment', action: 'schedule.manage', description: 'Quản lý lịch làm việc' },

  // Schedule permissions (controllers use dotted/underscored aliases)
  { code: 'schedule.write', resource: 'schedule', action: 'write', description: 'Tạo/sửa lịch làm việc & time-off' },
  { code: 'schedule.read', resource: 'schedule', action: 'read', description: 'Xem lịch làm việc & time-off' },

  // Shift Registration permissions (controllers use shift_registration.*)
  { code: 'shift_registration.write', resource: 'shift_registration', action: 'write', description: 'Đăng ký/hủy ca làm việc' },
  { code: 'shift_registration.read', resource: 'shift_registration', action: 'read', description: 'Xem ca đăng ký' },
  { code: 'shift_registration.approve', resource: 'shift_registration', action: 'approve', description: 'Duyệt/từ chối ca đăng ký' },

  // Medical Record permissions
  { code: 'encounter.create', resource: 'encounter', action: 'create', description: 'Tạo phiên khám' },
  { code: 'encounter.read', resource: 'encounter', action: 'read', description: 'Xem hồ sơ y khoa' },
  { code: 'encounter.read.any', resource: 'encounter', action: 'read.any', description: 'Xem tất cả phiên khám (admin)' },
  { code: 'encounter.read.own', resource: 'encounter', action: 'read.own', description: 'Xem phiên khám của mình' },
  { code: 'encounter.read.basic', resource: 'encounter', action: 'read.basic', description: 'Xem phiên khám ở mức cơ bản (receptionist)' },
  { code: 'encounter.update', resource: 'encounter', action: 'update', description: 'Cập nhật phiên khám' },
  { code: 'encounter.close', resource: 'encounter', action: 'close', description: 'Đóng phiên khám' },
  { code: 'encounter.complete', resource: 'encounter', action: 'complete', description: 'Hoàn tất phiên khám (alias of close)' },
  { code: 'encounter.start', resource: 'encounter', action: 'start', description: 'Bắt đầu phiên khám từ appointment' },
  { code: 'encounter.cancel', resource: 'encounter', action: 'cancel', description: 'Hủy phiên khám (admin)' },
  { code: 'encounter.reopen', resource: 'encounter', action: 'reopen', description: 'Mở lại phiên khám đã đóng (admin)' },
  { code: 'encounter.audit.read', resource: 'encounter', action: 'audit.read', description: 'Xem lịch sử thay đổi phiên khám' },
  { code: 'encounter.addendum', resource: 'encounter', action: 'addendum', description: 'Thêm phụ lục ghi chú' },
  { code: 'clinical_note.create', resource: 'clinical_note', action: 'create', description: 'Tạo ghi chú lâm sàng' },
  { code: 'clinical_note.write', resource: 'clinical_note', action: 'write', description: 'Upsert ghi chú lâm sàng (alias)' },
  { code: 'clinical_note.read', resource: 'clinical_note', action: 'read', description: 'Xem ghi chú lâm sàng' },
  { code: 'clinical_note.read.any', resource: 'clinical_note', action: 'read.any', description: 'Xem ghi chú lâm sàng (admin)' },
  { code: 'clinical_note.read.own', resource: 'clinical_note', action: 'read.own', description: 'Xem ghi chú lâm sàng của mình' },
  { code: 'clinical_note.update', resource: 'clinical_note', action: 'update', description: 'Cập nhật ghi chú lâm sàng' },
  { code: 'clinical_note.addendum', resource: 'clinical_note', action: 'addendum', description: 'Thêm phụ lục ghi chú lâm sàng (alias)' },
  { code: 'treatment.create', resource: 'treatment', action: 'create', description: 'Tạo liệu trình điều trị' },
  { code: 'treatment.write', resource: 'treatment', action: 'write', description: 'Tạo/sửa liệu trình điều trị (alias)' },
  { code: 'treatment.read', resource: 'treatment', action: 'read', description: 'Xem liệu trình điều trị' },
  { code: 'treatment.read.any', resource: 'treatment', action: 'read.any', description: 'Xem liệu trình điều trị (admin)' },
  { code: 'treatment.read.own', resource: 'treatment', action: 'read.own', description: 'Xem liệu trình điều trị của mình' },
  { code: 'treatment.update', resource: 'treatment', action: 'update', description: 'Cập nhật liệu trình điều trị' },
  { code: 'treatment.delete', resource: 'treatment', action: 'delete', description: 'Xóa mềm liệu trình điều trị' },
  { code: 'prescription.create', resource: 'prescription', action: 'create', description: 'Tạo/kê toa thuốc' },
  { code: 'prescription.write', resource: 'prescription', action: 'write', description: 'Upsert toa thuốc (alias)' },
  { code: 'prescription.read', resource: 'prescription', action: 'read', description: 'Xem toa thuốc' },
  { code: 'prescription.update', resource: 'prescription', action: 'update', description: 'Cập nhật toa thuốc' },
  { code: 'prescription.delete', resource: 'prescription', action: 'delete', description: 'Xóa dòng thuốc' },
  { code: 'dental_chart.read', resource: 'dental_chart', action: 'read', description: 'Xem sơ đồ răng' },
  { code: 'dental_chart.write', resource: 'dental_chart', action: 'write', description: 'Cập nhật sơ đồ răng (alias)' },
  { code: 'dental_chart.update', resource: 'dental_chart', action: 'update', description: 'Cập nhật sơ đồ răng' },

  // Billing permissions
  { code: 'invoice.create', resource: 'invoice', action: 'create', description: 'Tạo hóa đơn' },
  { code: 'invoice.read', resource: 'invoice', action: 'read', description: 'Xem hóa đơn' },
  { code: 'invoice.read.any', resource: 'invoice', action: 'read.any', description: 'Xem tất cả hóa đơn' },
  { code: 'invoice.read.own', resource: 'invoice', action: 'read.own', description: 'Xem hóa đơn của encounter mình tạo' },
  { code: 'invoice.update', resource: 'invoice', action: 'update', description: 'Cập nhật hóa đơn' },
  { code: 'invoice.issue', resource: 'invoice', action: 'issue', description: 'Phát hành hóa đơn (draft → issued)' },
  { code: 'invoice.void', resource: 'invoice', action: 'void', description: 'Hủy hóa đơn' },
  { code: 'payment.create', resource: 'payment', action: 'create', description: 'Tạo thanh toán' },
  { code: 'invoice.payment.create', resource: 'invoice', action: 'payment.create', description: 'Ghi nhận thanh toán cho hóa đơn (alias)' },
  { code: 'payment.reverse', resource: 'payment', action: 'reverse', description: 'Hoàn tiền thanh toán' },
  { code: 'report.revenue.read', resource: 'report', action: 'revenue.read', description: 'Xem báo cáo doanh thu' },
  { code: 'report.outstanding.read', resource: 'report', action: 'outstanding.read', description: 'Xem báo cáo công nợ' },
  { code: 'invoice.audit.read', resource: 'invoice', action: 'audit.read', description: 'Xem lịch sử thay đổi hóa đơn' },

  // Inventory permissions
  { code: 'inventory.read', resource: 'inventory', action: 'read', description: 'Xem tồn kho' },
  { code: 'inventory.create', resource: 'inventory', action: 'create', description: 'Tạo vật tư' },
  { code: 'inventory.update', resource: 'inventory', action: 'update', description: 'Cập nhật vật tư' },
  { code: 'inventory.delete', resource: 'inventory', action: 'delete', description: 'Xóa mềm/khôi phục vật tư' },
  { code: 'inventory.stock_in', resource: 'inventory', action: 'stock_in', description: 'Nhập kho' },
  { code: 'inventory.stock_out', resource: 'inventory', action: 'stock_out', description: 'Xuất kho thủ công' },
  { code: 'inventory.adjust', resource: 'inventory', action: 'adjust', description: 'Điều chỉnh tồn kho (kiểm kê)' },
  { code: 'inventory.manage', resource: 'inventory', action: 'manage', description: 'Quản lý vật tư (alias)' },

  // Shift Registration permissions (Phase 9 — BD-0010)
  { code: 'shift.register', resource: 'shift', action: 'register', description: 'Đăng ký ca làm việc tự do' },
  { code: 'shift.read.any', resource: 'shift', action: 'read.any', description: 'Xem tất cả ca đăng ký' },
  { code: 'shift.read.own', resource: 'shift', action: 'read.own', description: 'Xem ca đăng ký của mình' },
  { code: 'shift.approve', resource: 'shift', action: 'approve', description: 'Duyệt/từ chối ca đăng ký' },
  { code: 'shift.cancel', resource: 'shift', action: 'cancel', description: 'Hủy ca đã đăng ký' },

  // Payroll permissions (Phase 9 — BD-0009)
  { code: 'payroll.read.any', resource: 'payroll', action: 'read.any', description: 'Xem bảng lương tất cả BS' },
  { code: 'payroll.read.own', resource: 'payroll', action: 'read.own', description: 'Xem bảng lương của mình' },
  { code: 'payroll.config.read', resource: 'payroll', action: 'config.read', description: 'Xem cấu hình payroll' },
  { code: 'payroll.config.update', resource: 'payroll', action: 'config.update', description: 'Cập nhật cấu hình payroll' },
  { code: 'payroll.compensation.read', resource: 'payroll', action: 'compensation.read', description: 'Xem chính sách lương BS' },
  { code: 'payroll.compensation.update', resource: 'payroll', action: 'compensation.update', description: 'Cập nhật chính sách lương BS' },
  { code: 'payroll.period.create', resource: 'payroll', action: 'period.create', description: 'Tạo kỳ lương mới' },
  { code: 'payroll.period.compute', resource: 'payroll', action: 'period.compute', description: 'Tính toán lương kỳ' },
  { code: 'payroll.period.adjust', resource: 'payroll', action: 'period.adjust', description: 'Điều chỉnh bonus/penalty' },
  { code: 'payroll.period.lock', resource: 'payroll', action: 'period.lock', description: 'Khóa kỳ lương' },
  { code: 'payroll.period.approve', resource: 'payroll', action: 'period.approve', description: 'Duyệt kỳ lương' },
  { code: 'payroll.period.mark_paid', resource: 'payroll', action: 'period.mark_paid', description: 'Xác nhận đã trả lương' },
  { code: 'payslip.read.own', resource: 'payslip', action: 'read.own', description: 'Xem phiếu lương của mình' },
  { code: 'payslip.read.any', resource: 'payslip', action: 'read.any', description: 'Xem phiếu lương BS khác' },
  // R2-4: dedicated admin-only permission for unambiguous role check in
  // sensitive ops (e.g. payroll period re-open, manual adjustments). Avoids
  // fragile AND-of-permissions pattern.
  { code: 'payroll.admin', resource: 'payroll', action: 'admin', description: 'Quản trị payroll (mở period, manual override, re-open)' },

  // ---------------------------------------------------------------------------
  // Frontend alias permissions (Phase 10.5 — FE/BE consistency)
  // FE code uses shorter permission codes; keep these as aliases so route
  // guards (`<ProtectedRoute permission="...">`) and sidebar filters don't
  // return 403 for users who actually have the underlying capability.
  // ---------------------------------------------------------------------------
  // Medical record (frontend shorthand) — covered by encounter.read + patient.read
  { code: 'medical_record.read', resource: 'medical_record', action: 'read', description: 'Xem bệnh án (alias FE cho encounter.read+patient.read)' },
  // Payroll / shift (frontend shorthand) — alias to dotted canonical
  { code: 'payroll.read', resource: 'payroll', action: 'read', description: 'Xem bảng lương (alias FE cho payroll.read.any/.own)' },
  { code: 'payroll.read_self', resource: 'payroll', action: 'read_self', description: 'Xem bảng lương của mình (alias FE cho payroll.read.own)' },
  { code: 'payroll.config', resource: 'payroll', action: 'config', description: 'Cấu hình payroll (alias FE cho payroll.config.read/update)' },
  { code: 'shift.read_self', resource: 'shift', action: 'read_self', description: 'Xem ca của tôi (alias FE cho shift.read.own)' },
  { code: 'appointment.mark_no_show', resource: 'appointment', action: 'mark_no_show', description: 'Đánh dấu vắng mặt (alias FE cho appointment.no_show)' },
  // Reporting (frontend shorthand) — alias to dotted canonical
  { code: 'report.read', resource: 'report', action: 'read', description: 'Xem báo cáo (alias FE cho report.revenue.read/outstanding.read)' },
  // Admin / system (frontend shorthand) — alias to canonical names
  { code: 'role.read', resource: 'role', action: 'read', description: 'Xem vai trò & quyền (alias FE cho role.upsert)' },
  { code: 'audit.read', resource: 'audit', action: 'read', description: 'Xem audit log (alias FE cho system.audit.read)' },
  { code: 'settings.read', resource: 'settings', action: 'read', description: 'Xem cài đặt hệ thống (alias FE cho role.upsert+system.audit.read)' },
  // AI summaries (Phase 8.0)
  { code: 'ai.summary.read', resource: 'ai', action: 'summary.read', description: 'Xem AI tóm tắt hồ sơ bệnh nhân (Dashboard / Reception)' },

  // Expense permissions (BR-EXP-001)
  { code: 'expense.read', resource: 'expense', action: 'read', description: 'Xem danh sách chi phí' },
  { code: 'expense.create', resource: 'expense', action: 'create', description: 'Tạo chi phí mới' },
  { code: 'expense.update', resource: 'expense', action: 'update', description: 'Cập nhật chi phí nháp' },
  { code: 'expense.delete', resource: 'expense', action: 'delete', description: 'Xóa chi phí nháp' },
  { code: 'expense.approve', resource: 'expense', action: 'approve', description: 'Duyệt/từ chối chi phí' },
];

const ROLE_PERMISSIONS: Record<string, string[]> = {
  clinic_admin: [...PERMISSIONS.map((p) => p.code), 'expense.read', 'expense.create', 'expense.update', 'expense.delete', 'expense.approve'],
  receptionist: [
    'user.change_password.own',
    'patient.create',
    'patient.read',
    'patient.update',
    'patient.identifier.manage',
    'patient.merge',
    'patient.restore',
    'appointment.create',
    'appointment.read',
    'appointment.read.any',
    'appointment.read.own',
    'appointment.update',
    'appointment.cancel',
    'appointment.checkin',
    'appointment.check_in',
    'appointment.no_show',
    'appointment.mark_no_show',
    'appointment.schedule.manage',
    'schedule.write',
    'schedule.read',
    'encounter.read.basic',
    'encounter.start',
    'invoice.create',
    'invoice.read',
    'invoice.read.any',
    'invoice.update',
    'invoice.issue',
    'invoice.payment.create',
    'payment.create',
    'inventory.read',
    'inventory.stock_in',
    'inventory.stock_out',
    'shift_registration.write',
    'shift_registration.read',
    'shift_registration.approve',
    'shift.read.any',
    'shift.approve',
    'shift.read_self',
    // Frontend aliases (Phase 10.5)
    'medical_record.read',
    'payroll.read',
    'report.read',
    'ai.summary.read',
  ],
  dentist: [
    'user.change_password.own',
    'patient.read',
    'appointment.read',
    'appointment.read.own',
    'appointment.update',
    'appointment.cancel',
    'appointment.schedule.manage',
    'schedule.write',
    'schedule.read',
    'shift_registration.write',
    'shift_registration.read',
    'encounter.create',
    'encounter.start',
    'encounter.read',
    'encounter.read.own',
    'encounter.update',
    'encounter.close',
    'encounter.complete',
    'encounter.addendum',
    'clinical_note.create',
    'clinical_note.write',
    'clinical_note.read',
    'clinical_note.read.own',
    'clinical_note.update',
    'clinical_note.addendum',
    'treatment.create',
    'treatment.write',
    'treatment.read',
    'treatment.read.own',
    'treatment.update',
    'treatment.delete',
    'prescription.create',
    'prescription.write',
    'prescription.read',
    'prescription.update',
    'prescription.delete',
    'dental_chart.read',
    'dental_chart.write',
    'dental_chart.update',
    'invoice.read',
    'invoice.read.own',
    'inventory.read',
    'shift.register',
    'shift.read.own',
    'shift.cancel',
    'payroll.read.own',
    'payroll.compensation.read',
    'payslip.read.own',
    // Frontend aliases (Phase 10.5)
    'medical_record.read',
    'payroll.read',
    'payroll.read_self',
    'payroll.config',
    'shift.read_self',
    'appointment.mark_no_show',
    'report.read',
    'ai.summary.read',
  ],
};

async function main() {
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
    console.log(`Assigned ${permissionCodes.length} permissions to ${roleCode}`);
  }

  // Create super admin user
  const adminEmail = 'admin@clinic.local';
  const existingAdmin = await prisma.user.findUnique({
    where: { email: adminEmail },
  });

  if (!existingAdmin) {
    const tempPassword = 'Admin123!';
    const passwordHash = await argon2.hash(tempPassword, {
      type: argon2.argon2id,
      memoryCost: 65536,
      timeCost: 3,
      parallelism: 4,
      hashLength: 32,
      saltLength: 16,
    });

    const admin = await prisma.user.create({
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
    console.log(`Temporary Password: ${tempPassword}`);
    console.log('========================================');
    console.log('Please login and change your password immediately!');
    console.log('========================================\n');
  } else {
    console.log(`Admin user already exists: ${adminEmail}`);
  }

  console.log('Seed completed successfully!');
}

main()
  .catch((e) => {
    console.error('Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

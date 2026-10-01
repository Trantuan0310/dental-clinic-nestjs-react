-- Round 4 FF: reports & permissions. No new permission codes.

-- A6-25: FE alias codes only gate menus; the API checks the canonical
-- .any/.own / report.* codes. Say so on the Roles screen so an admin does not
-- think "Xem bệnh án" lets front desk read clinical notes. (seed.ts keeps the
-- same texts for fresh databases.)
UPDATE permissions SET description = 'Menu Lịch hẹn (chỉ điều hướng; dữ liệu cần appointment.read.any/.own)'
 WHERE code = 'appointment.read';
UPDATE permissions SET description = 'Menu Hồ sơ y khoa (chỉ điều hướng; dữ liệu cần encounter.read.any/.own)'
 WHERE code = 'encounter.read';
UPDATE permissions SET description = 'Menu Hóa đơn (chỉ điều hướng; dữ liệu cần invoice.read.any/.own)'
 WHERE code = 'invoice.read';
UPDATE permissions SET description = 'Menu Bệnh án (chỉ điều hướng; không mở nội dung lâm sàng)'
 WHERE code = 'medical_record.read';
UPDATE permissions SET description = 'Menu Báo cáo (chỉ điều hướng; dữ liệu cần report.revenue.read / report.outstanding.read)'
 WHERE code = 'report.read';

-- A6-22: a deleted role grants nothing. Deleting a role now also drops its
-- assignments (including deactivated accounts); drop the ones left over from
-- roles deleted before this release so reactivating such an account cannot
-- bring them back. Permission loading also ignores deleted roles.
DELETE FROM user_roles
 WHERE role_id IN (SELECT id FROM roles WHERE deleted_at IS NOT NULL);

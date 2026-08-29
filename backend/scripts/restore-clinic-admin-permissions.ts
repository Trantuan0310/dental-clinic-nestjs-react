/**
 * Restore script: ensures clinic_admin role has ALL permissions.
 * Run: npx ts-node scripts/restore-clinic-admin-permissions.ts
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Restoring clinic_admin permissions...');

  const clinicAdmin = await prisma.role.findUnique({
    where: { code: 'clinic_admin' },
  });

  if (!clinicAdmin) {
    console.error('clinic_admin role not found in database.');
    process.exit(1);
  }

  const allPermissions = await prisma.permission.findMany();
  console.log(`Found ${allPermissions.length} permissions in database.`);

  // Upsert RolePermission for each permission
  for (const perm of allPermissions) {
    await prisma.rolePermission.upsert({
      where: {
        roleId_permissionId: {
          roleId: clinicAdmin.id,
          permissionId: perm.id,
        },
      },
      update: {},
      create: {
        roleId: clinicAdmin.id,
        permissionId: perm.id,
      },
    });
  }

  const count = await prisma.rolePermission.count({
    where: { roleId: clinicAdmin.id },
  });

  console.log(`clinic_admin now has ${count} permissions.`);
  console.log('Done.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

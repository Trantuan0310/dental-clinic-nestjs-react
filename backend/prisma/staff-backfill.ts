import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { PrismaClient } from '@prisma/client';

/**
 * Create employees + dentist profiles for accounts that have none yet.
 * The seeds create users after migration 019 ran, so they call this to give
 * demo accounts the same records the migration's backfill gives real data.
 * The SQL is read from the migration itself so the two can never drift.
 */
export async function backfillStaffRecords(prisma: PrismaClient): Promise<void> {
  const migration = readFileSync(
    join(__dirname, 'migrations/019_staff_employees_dentist_profiles/migration.sql'),
    'utf8',
  );
  const block = /-- @staff-backfill-start\n([\s\S]*?)-- @staff-backfill-end/.exec(migration);
  if (!block) throw new Error('Staff backfill markers not found in migration 019');
  const statements = block[1]
    .split(/;\s*\n/)
    .map(sql => sql.trim())
    .filter(sql => sql.length > 0);
  for (const sql of statements) {
    await prisma.$executeRawUnsafe(sql);
  }
}

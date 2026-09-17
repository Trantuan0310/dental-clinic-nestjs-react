const { execFileSync } = require('node:child_process');
const { PrismaClient } = require('@prisma/client');

async function main() {
  const url = new URL(process.env.DATABASE_URL);
  if (
    process.env.NODE_ENV === 'production' &&
    !['require', 'verify-ca', 'verify-full'].includes(url.searchParams.get('sslmode'))
  ) {
    throw new Error('Production migration requires a TLS database connection');
  }
  // Prisma db execute handles multi-statement init SQL without splitting function bodies.
  for (const file of ['01-extensions.sql', '02-uuid-v7.sql', '03-sequences.sql']) {
    execFileSync(
      process.execPath,
      [
        'node_modules/prisma/build/index.js',
        'db',
        'execute',
        '--schema',
        'prisma/schema.prisma',
        '--file',
        file,
      ],
      { stdio: 'inherit' },
    );
  }
  execFileSync(process.execPath, ['node_modules/prisma/build/index.js', 'migrate', 'deploy'], {
    stdio: 'inherit',
  });
  // Refuse to report success if required database functions/sequences are absent.
  const db = new PrismaClient();
  try {
    await db.$queryRaw`SELECT uuid_generate_v7(), last_value FROM patient_code_seq`;
  } finally {
    await db.$disconnect();
  }
}
main().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});

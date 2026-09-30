const { PrismaClient } = require('@prisma/client');
const { spawnSync } = require('node:child_process');
const { mkdirSync, writeFileSync, appendFileSync } = require('node:fs');
const { resolve } = require('node:path');

process.chdir(resolve(__dirname, '..'));
const source = new PrismaClient(); // Prisma loads the existing local .env.
const sourceUrl = new URL(process.env.DATABASE_URL);
const runId = `${Date.now()}_${process.pid}`;
const name = `dental_clinic_test_${runId}`;
const output = resolve('test-results', `backend-${runId}`);
mkdirSync(output, { recursive: true });
const testUrl = new URL(sourceUrl);
testUrl.pathname = `/${name}`;
const env = {
  ...process.env,
  NODE_ENV: 'test',
  DATABASE_URL: testUrl.toString(),
  ISOLATED_TEST_DB: name,
  THROTTLE_LIMIT: '10000',
  REDIS_URL: '',
  GEMINI_API_KEY: '',
  OPENAI_API_KEY: '',
  JWT_SECRET: 'isolated-backend-test-secret-2026',
};
let created = false;
let db;
const summary = { runId, database: name, startedAt: new Date().toISOString(), checks: {} };

function run(script, args, logName) {
  const result = spawnSync(process.execPath, [script, ...args], {
    env,
    encoding: 'utf8',
    timeout: 240000,
  });
  appendFileSync(resolve(output, logName), `${result.stdout ?? ''}\n${result.stderr ?? ''}`);
  if (result.status !== 0 || result.error) {
    // The evidence folder is an upload-only artifact on CI; print the failing
    // tests here too so a red run can be diagnosed from the job log alone.
    const text = `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
    const failures = text.split('\n').filter(line => /✕|●/.test(line));
    console.error(failures.length ? failures.join('\n') : text.split('\n').slice(-60).join('\n'));
    throw new Error(`${logName} failed; see ${output}`);
  }
  console.log(`[backend-tests] Passed ${logName}`);
  return result.stdout;
}
async function snapshot() {
  return {
    patients: await source.patient.count(),
    appointments: await source.appointment.count(),
    encounters: await source.encounter.count(),
    invoices: await source.invoice.count(),
    payments: await source.payment.count(),
  };
}
// The API tests book, check in and queue visits around the real "now" (from
// 20 min before to ~20 min after it), and a clinic day ends at midnight
// Vietnam time: a visit then lands on the next day's calendar or queue and
// the chained tests fail (runs after 23:42 did). A run reaching the tests
// between 23:35 and 00:25 clinic time waits until 00:25; any other run
// starts at once (so CI waits in ~3% of runs, never more than 50 min).
const CLINIC_OFFSET_MS = 7 * 3600000;
const MIDNIGHT_MARGIN_MS = 25 * 60000;
async function clearOfClinicMidnight() {
  const dayMs = 86400000;
  const timeOfDay = (Date.now() + CLINIC_OFFSET_MS) % dayMs;
  const wait =
    timeOfDay >= dayMs - MIDNIGHT_MARGIN_MS
      ? dayMs - timeOfDay + MIDNIGHT_MARGIN_MS
      : timeOfDay < MIDNIGHT_MARGIN_MS
        ? MIDNIGHT_MARGIN_MS - timeOfDay
        : 0;
  if (!wait) return;
  console.log(
    `[backend-tests] Clinic midnight is near; waiting ${Math.ceil(wait / 60000)} min so time-based tests stay on one clinic day`,
  );
  summary.waitedForClinicMidnightMs = wait;
  await new Promise(resolve => setTimeout(resolve, wait));
}
async function main() {
  if (
    process.env.NODE_ENV === 'production' ||
    !['localhost', '127.0.0.1', '[::1]'].includes(sourceUrl.hostname)
  ) {
    throw new Error('Isolated tests require a localhost development database');
  }
  summary.sourceBefore = await snapshot();
  console.log(`[backend-tests] Preparing ${name}`);
  await source.$executeRawUnsafe(`CREATE DATABASE "${name}"`);
  created = true;
  db = new PrismaClient({ datasources: { db: { url: testUrl.toString() } } });
  run('scripts/release.cjs', [], 'migrations.log');
  summary.checks.freshMigrations = true;
  run('scripts/release.cjs', [], 'migrations-repeat.log');
  summary.checks.repeatMigrations = true;
  run('node_modules/ts-node/dist/bin.js', ['--transpile-only', 'prisma/seed.ts'], 'seed.log');
  await clearOfClinicMidnight();
  run(
    'node_modules/jest/bin/jest.js',
    [
      '--config',
      'test/jest-isolated.json',
      '--runInBand',
      '--json',
      '--outputFile',
      resolve(output, 'jest-results.json'),
    ],
    'api-tests.log',
  );
  summary.checks.apiDatabaseTests = true;
}
main()
  .catch(error => {
    summary.error = error.message;
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db?.$disconnect();
    if (created) {
      // The name is generated here, never taken from a connection string/input.
      if (!/^dental_clinic_test_\d+_\d+$/.test(name)) throw new Error('Unsafe cleanup target');
      await source.$executeRawUnsafe(`DROP DATABASE "${name}" WITH (FORCE)`);
      summary.checks.testDatabaseRemoved = true;
    }
    summary.sourceAfter = await snapshot();
    summary.checks.sourceCountsUnchanged =
      JSON.stringify(summary.sourceBefore) === JSON.stringify(summary.sourceAfter);
    if (!summary.checks.sourceCountsUnchanged) process.exitCode = 1;
    summary.finishedAt = new Date().toISOString();
    writeFileSync(resolve(output, 'summary.json'), JSON.stringify(summary, null, 2));
    await source.$disconnect();
    console.log(`[backend-tests] Evidence: ${output}`);
  });

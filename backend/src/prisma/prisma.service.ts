import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  async onModuleInit() {
    // Pure string check, no connection needed — fail before even attempting
    // to connect if production DATABASE_URL doesn't request an encrypted link.
    this.assertProductionDatabaseSsl();

    await this.$connect();
    this.logger.log('Prisma connected to database');

    // Fail-fast check: ensure uuid_generate_v7() exists before any query runs.
    // Prisma schema declares ~30 models with @default(dbgenerated("uuid_generate_v7()")).
    // If the function is missing (e.g. dev forgot to run init scripts or volume was
    // recreated without docker-entrypoint-initdb.d mount), every INSERT would fail
    // with a confusing SQL error. Surface the problem here, at startup.
    await this.assertUuidV7Available();
  }

  async onModuleDestroy() {
    await this.$disconnect();
    this.logger.log('Prisma disconnected from database');
  }

  // Some self-hosted Postgres instances accept both encrypted and plaintext
  // connections; a DATABASE_URL without an explicit sslmode silently falls
  // back to whatever the server allows. `sslmode=prefer` (libpq's default)
  // is *also* unsafe here — it downgrades to plaintext instead of failing
  // when the server doesn't offer TLS, so it's deliberately not in this
  // allowlist. Managed providers (Railway/Render/RDS) that enforce TLS at
  // the network layer regardless are unaffected by this check either way.
  private assertProductionDatabaseSsl(): void {
    if (process.env.NODE_ENV !== 'production') return;

    const url = process.env.DATABASE_URL ?? '';
    const sslMode = /[?&]sslmode=([^&]+)/i.exec(url)?.[1]?.toLowerCase();
    const encryptedModes = ['require', 'verify-ca', 'verify-full'];

    if (!sslMode || !encryptedModes.includes(sslMode)) {
      throw new Error(
        'DATABASE_URL must set sslmode=require (or verify-ca/verify-full) ' +
          'when NODE_ENV=production. Refusing to start with a database ' +
          'connection that is not explicitly encrypted.',
      );
    }
  }

  private async assertUuidV7Available(): Promise<void> {
    try {
      const rows = await this.$queryRaw<Array<{ ok: boolean }>>`
        SELECT uuid_generate_v7() IS NOT NULL AS ok
      `;
      if (rows.length === 0 || rows[0].ok !== true) {
        throw new Error('uuid_generate_v7() returned no rows');
      }
      this.logger.log('uuid_generate_v7() check passed');
    } catch (err) {
      this.logger.error(
        'uuid_generate_v7() is not available in the database. ' +
          'Make sure backend/02-uuid-v7.sql is mounted into the postgres ' +
          "container's /docker-entrypoint-initdb.d/ directory and that the " +
          'volume was created after the mount was added. ' +
          'Run `pnpm db:reset` to recreate the volume and re-run init scripts.',
      );
      throw err;
    }
  }
}

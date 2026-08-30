import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  async onModuleInit() {
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

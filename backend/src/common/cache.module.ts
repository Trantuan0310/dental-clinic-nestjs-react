import { Module, Global } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { RedisCacheService } from './redis-cache.service';

/**
 * CacheModule — exposes the shared RedisCacheService as a global provider.
 * Other modules (users, roles, payroll) can inject `RedisCacheService`
 * directly without re-importing the AI module.
 */
@Global()
@Module({
  imports: [PrismaModule],
  providers: [RedisCacheService],
  exports: [RedisCacheService],
})
export class CacheModule {}

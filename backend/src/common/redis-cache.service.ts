import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

/**
 * RedisCacheService — shared caching primitive.
 *
 * Lazy-connects on startup. If REDIS_URL is unset or the connection fails,
 * the service degrades to a no-op so the rest of the app keeps working.
 */
@Injectable()
export class RedisCacheService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisCacheService.name);
  private client: Redis | null = null;
  private available = false;

  constructor(private readonly config: ConfigService) {}

  async onModuleInit(): Promise<void> {
    const url = this.config.get<string>('REDIS_URL');
    if (!url) {
      this.logger.warn('REDIS_URL not set; cache disabled');
      return;
    }
    try {
      this.client = new Redis(url, {
        lazyConnect: true,
        maxRetriesPerRequest: 1,
        enableOfflineQueue: false,
      });
      this.client.on('error', err => {
        if (this.available) {
          this.logger.warn(`Redis error: ${err.message}`);
        }
        this.available = false;
      });
      await this.client.connect();
      await this.client.ping();
      this.available = true;
      this.logger.log('Redis cache connected');
    } catch (err) {
      this.logger.warn(`Redis connect failed: ${(err as Error).message}; cache disabled`);
      this.available = false;
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (this.client) {
      await this.client.quit().catch(() => undefined);
      this.client = null;
    }
  }

  async getJSON<T>(key: string): Promise<T | null> {
    if (!this.available || !this.client) return null;
    try {
      const raw = await this.client.get(key);
      return raw ? (JSON.parse(raw) as T) : null;
    } catch (err) {
      this.logger.warn(`Cache get failed: ${(err as Error).message}`);
      return null;
    }
  }

  async setJSON<T>(key: string, value: T, ttlSeconds: number): Promise<void> {
    if (!this.available || !this.client) return;
    try {
      await this.client.set(key, JSON.stringify(value), 'EX', ttlSeconds);
    } catch (err) {
      this.logger.warn(`Cache set failed: ${(err as Error).message}`);
    }
  }

  async del(key: string): Promise<void> {
    if (!this.available || !this.client) return;
    try {
      await this.client.del(key);
    } catch (err) {
      this.logger.warn(`Cache del failed: ${(err as Error).message}`);
    }
  }

  /**
   * Delete every key matching the given pattern (e.g. 'roles:*').
   * Uses SCAN + UNLINK to avoid blocking the Redis server on large keyspaces.
   */
  async delByPattern(pattern: string): Promise<number> {
    if (!this.available || !this.client) return 0;
    try {
      let cursor = '0';
      let removed = 0;
      do {
        const [next, batch] = await this.client.scan(cursor, 'MATCH', pattern, 'COUNT', 200);
        cursor = next;
        if (batch.length > 0) {
          removed += await this.client.unlink(...batch);
        }
      } while (cursor !== '0');
      return removed;
    } catch (err) {
      this.logger.warn(`Cache delByPattern failed: ${(err as Error).message}`);
      return 0;
    }
  }

  isAvailable(): boolean {
    return this.available;
  }
}

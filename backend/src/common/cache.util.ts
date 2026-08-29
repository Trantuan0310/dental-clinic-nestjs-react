import { SetMetadata, createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { RedisCacheService } from './redis-cache.service';

export const CACHE_KEY = 'cache:key';
export const CACHE_TTL = 'cache:ttl';

export interface CacheOptions {
  /** TTL in seconds. Default 60. */
  ttl?: number;
  /**
   * Cache key. Use `:param` placeholders to interpolate from the request.
   * Example: `'users:list:p={{query.page}}:s={{query.pageSize}}'`
   */
  key: string;
}

/**
 * @Cached decorator — call site hint that a controller method should use the
 * cache wrapper. The actual interception is performed by the small
 * `cachedHandler` helper to keep this codebase DI-friendly without adding
 * an interceptor dependency.
 */
export const Cached = (options: CacheOptions): MethodDecorator => {
  return SetMetadata('cache:options', options);
};

/**
 * Helper used inside controller/service methods:
 *
 *   return cachedHandler(this.cache, 'users:list', 60, () => this.svc.list());
 *
 * Returns the cached value if present, otherwise calls the loader, caches
 * the result, and returns it. If Redis is unavailable, the call falls
 * through to the loader transparently.
 */
export async function cachedHandler<T>(
  cache: RedisCacheService,
  key: string,
  ttlSeconds: number,
  loader: () => Promise<T>,
): Promise<T> {
  const cached = await cache.getJSON<T>(key);
  if (cached !== null) return cached;
  const fresh = await loader();
  await cache.setJSON(key, fresh, ttlSeconds);
  return fresh;
}

/**
 * Param decorator — extracts the raw query params so cachedHandler can
 * build a stable per-request key.
 */
export const RawQuery = createParamDecorator((_data: unknown, ctx: ExecutionContext) => {
  const req = ctx.switchToHttp().getRequest();
  return req.query ?? {};
});

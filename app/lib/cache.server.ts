import Redis from "ioredis";
import { logger } from "./logger.server";

const CACHE_TTL = {
  short: 5 * 60,      // 5 minutes
  medium: 30 * 60,    // 30 minutes
  long: 24 * 60 * 60, // 24 hours
} as const;

let redis: Redis | null = null;

// Initialize Redis connection
if (process.env.REDIS_URL) {
  redis = new Redis(process.env.REDIS_URL, {
    retryDelayOnFailover: 100,
    maxRetriesPerRequest: 3,
  });

  redis.on("error", (error) => {
    logger.error("Cache Redis error", { error: error.message });
  });

  redis.on("ready", () => {
    logger.info("Cache Redis connected");
  });
} else {
  logger.warn("Redis not configured, caching disabled");
}

/**
 * Generic cache wrapper with fallback to direct execution
 */
export async function cached<T>(
  key: string,
  fetcher: () => Promise<T>,
  ttl: keyof typeof CACHE_TTL = "medium"
): Promise<T> {
  if (!redis) {
    // No Redis, execute directly
    return fetcher();
  }

  try {
    // Try to get from cache
    const cached = await redis.get(key);
    if (cached) {
      logger.debug("Cache hit", { key });
      return JSON.parse(cached);
    }

    // Cache miss, fetch data
    logger.debug("Cache miss", { key });
    const data = await fetcher();
    
    // Store in cache
    await redis.setex(key, CACHE_TTL[ttl], JSON.stringify(data));
    
    return data;
  } catch (error) {
    logger.error("Cache error, falling back to direct fetch", { error, key });
    return fetcher();
  }
}

/**
 * Invalidate specific cache keys
 */
export async function invalidateCache(pattern: string): Promise<void> {
  if (!redis) return;

  try {
    const keys = await redis.keys(pattern);
    if (keys.length > 0) {
      await redis.del(...keys);
      logger.info("Cache invalidated", { pattern, keyCount: keys.length });
    }
  } catch (error) {
    logger.error("Failed to invalidate cache", { error, pattern });
  }
}

/**
 * Cache keys factory for consistent key generation
 */
export const CacheKeys = {
  shopMetrics: (shopId: string, days: number) => `shop:${shopId}:metrics:${days}d`,
  shopBenchmarks: (shopId: string) => `shop:${shopId}:benchmarks`,
  industryBenchmarks: (industry: string) => `industry:${industry}:benchmarks`,
  recoveryOptimization: (shopId: string) => `shop:${shopId}:recovery_optimization`,
  customerInsights: (shopId: string) => `shop:${shopId}:customer_insights`,
  templatePerformance: (shopId: string) => `shop:${shopId}:template_performance`,
  experimentResults: (experimentId: string) => `experiment:${experimentId}:results`,
  dailyStats: (shopId: string, date: string) => `shop:${shopId}:daily:${date}`,
  realtimeMetrics: (shopId: string) => `shop:${shopId}:realtime`,
} as const;

/**
 * Specialized caching functions for common use cases
 */
export class CacheService {
  static async getOrSet<T>(
    key: string,
    fetcher: () => Promise<T>,
    ttl: keyof typeof CACHE_TTL = "medium"
  ): Promise<T> {
    return cached(key, fetcher, ttl);
  }

  static async set(key: string, data: any, ttl: keyof typeof CACHE_TTL = "medium"): Promise<void> {
    if (!redis) return;

    try {
      await redis.setex(key, CACHE_TTL[ttl], JSON.stringify(data));
    } catch (error) {
      logger.error("Failed to set cache", { error, key });
    }
  }

  static async get<T>(key: string): Promise<T | null> {
    if (!redis) return null;

    try {
      const cached = await redis.get(key);
      return cached ? JSON.parse(cached) : null;
    } catch (error) {
      logger.error("Failed to get cache", { error, key });
      return null;
    }
  }

  static async invalidate(pattern: string): Promise<void> {
    return invalidateCache(pattern);
  }

  static async invalidateShop(shopId: string): Promise<void> {
    await invalidateCache(`shop:${shopId}:*`);
  }

  static async warmupCache(shopId: string): Promise<void> {
    // Pre-populate frequently accessed data
    try {
      const promises = [
        // Warm up basic metrics
        this.warmupShopMetrics(shopId),
        // Warm up template performance
        this.warmupTemplatePerformance(shopId),
        // Warm up daily stats for last 7 days
        this.warmupDailyStats(shopId),
      ];

      await Promise.allSettled(promises);
      logger.info("Cache warmup completed", { shopId });
    } catch (error) {
      logger.error("Cache warmup failed", { error, shopId });
    }
  }

  private static async warmupShopMetrics(shopId: string): Promise<void> {
    const { getShopMetrics } = await import("../services/intelligence.server");
    
    // Warm up metrics for common time periods
    await Promise.allSettled([
      cached(CacheKeys.shopMetrics(shopId, 7), () => getShopMetrics(shopId, 7), "short"),
      cached(CacheKeys.shopMetrics(shopId, 30), () => getShopMetrics(shopId, 30), "medium"),
    ]);
  }

  private static async warmupTemplatePerformance(shopId: string): Promise<void> {
    // This would warm up template performance data
    // Implementation would depend on the actual template service
  }

  private static async warmupDailyStats(shopId: string): Promise<void> {
    // Warm up daily stats for the last week
    const today = new Date();
    const promises = [];

    for (let i = 0; i < 7; i++) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().split("T")[0];
      
      promises.push(
        this.getOrSet(
          CacheKeys.dailyStats(shopId, dateStr),
          () => this.fetchDailyStats(shopId, dateStr),
          "long"
        )
      );
    }

    await Promise.allSettled(promises);
  }

  private static async fetchDailyStats(shopId: string, date: string) {
    // This would fetch daily statistics for a specific date
    // Implementation would depend on the analytics service
    return {
      date,
      cartsAbandoned: 0,
      cartsRecovered: 0,
      messagesSent: 0,
      revenue: 0,
    };
  }
}

/**
 * Cache middleware for route loaders
 */
export function withCache<T>(
  cacheKey: string | ((args: any) => string),
  ttl: keyof typeof CACHE_TTL = "medium"
) {
  return function (target: any, propertyName: string, descriptor: PropertyDescriptor) {
    const method = descriptor.value;

    descriptor.value = async function (...args: any[]) {
      const key = typeof cacheKey === "string" ? cacheKey : cacheKey(args[0]);
      
      return cached(key, () => method.apply(this, args), ttl);
    };

    return descriptor;
  };
}

/**
 * Real-time metrics cache (short TTL for frequently changing data)
 */
export class RealtimeCache {
  private static readonly TTL = 30; // 30 seconds

  static async updateMetric(shopId: string, metric: string, value: number): Promise<void> {
    if (!redis) return;

    const key = `${CacheKeys.realtimeMetrics(shopId)}`;
    try {
      await redis.hset(key, metric, value.toString());
      await redis.expire(key, this.TTL);
    } catch (error) {
      logger.error("Failed to update realtime metric", { error, shopId, metric });
    }
  }

  static async getMetrics(shopId: string): Promise<Record<string, number>> {
    if (!redis) return {};

    try {
      const metrics = await redis.hgetall(CacheKeys.realtimeMetrics(shopId));
      const result: Record<string, number> = {};
      
      for (const [key, value] of Object.entries(metrics)) {
        result[key] = parseFloat(value);
      }
      
      return result;
    } catch (error) {
      logger.error("Failed to get realtime metrics", { error, shopId });
      return {};
    }
  }

  static async incrementMetric(shopId: string, metric: string, amount: number = 1): Promise<void> {
    if (!redis) return;

    try {
      const key = CacheKeys.realtimeMetrics(shopId);
      await redis.hincrbyfloat(key, metric, amount);
      await redis.expire(key, this.TTL);
    } catch (error) {
      logger.error("Failed to increment realtime metric", { error, shopId, metric });
    }
  }
}
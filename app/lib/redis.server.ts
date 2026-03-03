import Redis from "ioredis";
import logger from "./logger.server";

const redisUrl = process.env.REDIS_URL;

if (!redisUrl) {
  logger.warn("REDIS_URL is not defined. Queue functionality will be disabled until it is set.");
}

let redis: Redis | undefined;

export function getRedisClient() {
  if (redis) {
    return redis;
  }

  if (!redisUrl) {
    throw new Error("REDIS_URL must be configured to use queue features");
  }

  redis = new Redis(redisUrl, {
    maxRetriesPerRequest: null,
    enableReadyCheck: true,
  });

  redis.on("error", (error) => {
    logger.error("Redis error", { error: error.message });
  });

  return redis;
}

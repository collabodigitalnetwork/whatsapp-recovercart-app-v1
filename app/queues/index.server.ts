import Queue from "bull";
import { getRedisClient } from "../lib/redis.server";
import type { DeliveryJobData, InsightJobData, RecoveryJobData } from "../types/queues";

const redisClient = () => ({
  createClient: () => getRedisClient(),
});

function createQueue<T>(name: string) {
  return new Queue<T>(name, {
    redis: process.env.REDIS_URL,
    createClient: redisClient as never,
  });
}

export const recoveryQueue = createQueue<RecoveryJobData>("recovercart:recovery");
export const deliveryQueue = createQueue<DeliveryJobData>("recovercart:delivery");
export const insightQueue = createQueue<InsightJobData>("recovercart:insights");

export type QueueNames = "recovercart:recovery" | "recovercart:delivery" | "recovercart:insights";

import Queue from "bull";
import { logger } from "../lib/logger.server";

// Redis connection URL
const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";

// Queue configuration
const defaultQueueOptions = {
  redis: REDIS_URL,
  defaultJobOptions: {
    removeOnComplete: {
      age: 24 * 60 * 60, // Keep completed jobs for 24 hours
      count: 100, // Keep last 100 completed jobs
    },
    removeOnFail: {
      age: 7 * 24 * 60 * 60, // Keep failed jobs for 7 days
    },
  },
};

// Create queues
export const recoveryQueue = new Queue("cart-recovery", {
  ...defaultQueueOptions,
  defaultJobOptions: {
    ...defaultQueueOptions.defaultJobOptions,
    attempts: 3,
    backoff: {
      type: "exponential",
      delay: 5000, // Start with 5 second delay
    },
  },
});

export const deliveryQueue = new Queue("delivery-tracking", {
  ...defaultQueueOptions,
  defaultJobOptions: {
    ...defaultQueueOptions.defaultJobOptions,
    attempts: 3,
    backoff: {
      type: "exponential",
      delay: 10000, // Start with 10 second delay
    },
  },
});

// Queue event logging
recoveryQueue.on("completed", (job) => {
  logger.debug("Recovery job completed", { jobId: job.id });
});

recoveryQueue.on("failed", (job, error) => {
  logger.error("Recovery job failed", { 
    jobId: job.id, 
    error: error.message,
    attemptsMade: job.attemptsMade,
  });
});

deliveryQueue.on("completed", (job) => {
  logger.debug("Delivery job completed", { jobId: job.id });
});

deliveryQueue.on("failed", (job, error) => {
  logger.error("Delivery job failed", { 
    jobId: job.id, 
    error: error.message,
    attemptsMade: job.attemptsMade,
  });
});

// Clean up old jobs periodically
async function cleanupQueues() {
  try {
    const [recoveryClean, deliveryClean] = await Promise.all([
      recoveryQueue.clean(24 * 60 * 60 * 1000, "completed"), // 24 hours
      deliveryQueue.clean(24 * 60 * 60 * 1000, "completed"),
    ]);

    if (recoveryClean.length > 0 || deliveryClean.length > 0) {
      logger.info("Queue cleanup completed", {
        recovery: recoveryClean.length,
        delivery: deliveryClean.length,
      });
    }
  } catch (error) {
    logger.error("Queue cleanup failed", { error });
  }
}

// Run cleanup every 6 hours
setInterval(cleanupQueues, 6 * 60 * 60 * 1000);

// Export queue monitoring utilities
export async function getQueueStats() {
  try {
    const [recoveryStats, deliveryStats] = await Promise.all([
      recoveryQueue.getJobCounts(),
      deliveryQueue.getJobCounts(),
    ]);

    return {
      recovery: {
        ...recoveryStats,
        isPaused: await recoveryQueue.isPaused(),
      },
      delivery: {
        ...deliveryStats,
        isPaused: await deliveryQueue.isPaused(),
      },
    };
  } catch (error) {
    logger.error("Failed to get queue stats", { error });
    return null;
  }
}

// Graceful shutdown helper
export async function closeQueues() {
  try {
    await Promise.all([
      recoveryQueue.close(),
      deliveryQueue.close(),
    ]);
    logger.info("Queues closed successfully");
  } catch (error) {
    logger.error("Error closing queues", { error });
  }
}
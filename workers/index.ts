import "dotenv/config";
import prisma from "../app/db.server";
import { logger } from "../app/lib/logger.server";
import { deliveryQueue, recoveryQueue } from "../app/queues";
import { monitorCarrier } from "../app/services/delivery.server";
import { processRecoveryStep } from "../app/services/cartRecovery.server";
import { MonitoringService } from "../app/services/monitoring.server";
import type { Job } from "bull";
import type { RecoveryJobData, DeliveryJobData } from "../app/types/queues";

// Worker configuration
const WORKER_CONFIG = {
  concurrency: Number(process.env.WORKER_CONCURRENCY) || 5,
  maxStalledCount: 3,
  stalledInterval: 30000, // 30 seconds
};

// Track worker health
let isShuttingDown = false;
const activeJobs = new Set<string>();

/**
 * Process recovery queue jobs
 */
async function processRecoveryJob(job: Job<RecoveryJobData>) {
  const jobId = `recovery_${job.id}`;
  activeJobs.add(jobId);

  try {
    logger.info("Processing recovery job", {
      jobId: job.id,
      data: job.data,
      attempt: job.attemptsMade + 1,
      maxAttempts: job.opts.attempts,
    });

    // Process the recovery step
    await MonitoringService.timeFunction(
      "worker.recovery.process",
      async () => {
        await processRecoveryStep(job.data.stepId);
      },
      { warning: 5000, critical: 10000 }
    );

    logger.info("Recovery job completed", { jobId: job.id });
  } catch (error: any) {
    logger.error("Recovery job failed", {
      jobId: job.id,
      error: error.message,
      stack: error.stack,
      attempt: job.attemptsMade + 1,
      willRetry: job.attemptsMade + 1 < (job.opts.attempts || 3),
    });

    // Check if it's an authentication error
    if (error.message?.includes("WhatsApp not configured") || 
        error.message?.includes("access token")) {
      // Don't retry auth errors immediately
      await job.moveToFailed({ message: error.message }, true);
      
      // TODO: Notify merchant about WhatsApp disconnection
      await notifyMerchantAboutError(job.data.shopId, error.message);
    } else {
      // Re-throw for Bull to handle retries
      throw error;
    }
  } finally {
    activeJobs.delete(jobId);
  }
}

/**
 * Process delivery queue jobs
 */
async function processDeliveryJob(job: Job<DeliveryJobData>) {
  const jobId = `delivery_${job.id}`;
  activeJobs.add(jobId);

  try {
    logger.info("Processing delivery job", {
      jobId: job.id,
      data: job.data,
      attempt: job.attemptsMade + 1,
    });

    // Monitor carrier for updates
    await MonitoringService.timeFunction(
      "worker.delivery.monitor",
      async () => {
        await monitorCarrier(job.data.deliveryId);
      },
      { warning: 10000, critical: 30000 }
    );

    logger.info("Delivery job completed", { jobId: job.id });
  } catch (error: any) {
    logger.error("Delivery job failed", {
      jobId: job.id,
      error: error.message,
      attempt: job.attemptsMade + 1,
    });

    throw error; // Let Bull handle retries
  } finally {
    activeJobs.delete(jobId);
  }
}

/**
 * Notify merchant about critical errors
 */
async function notifyMerchantAboutError(shopId: string, errorMessage: string) {
  try {
    // TODO: Implement merchant notification
    // This could be via email, in-app notification, or Shopify admin API
    logger.warn("Merchant notification pending", { shopId, error: errorMessage });
    
    // Store notification in database for dashboard display
    await prisma.$executeRaw`
      INSERT INTO notifications (shop_id, type, message, created_at)
      VALUES (${shopId}, 'whatsapp_error', ${errorMessage}, NOW())
      ON CONFLICT DO NOTHING
    `.catch(() => {
      // Notifications table might not exist yet
    });
  } catch (error) {
    logger.error("Failed to notify merchant", { error, shopId });
  }
}

/**
 * Worker health check
 */
async function performHealthCheck() {
  try {
    // Check database connection
    await prisma.$queryRaw`SELECT 1`;
    
    // Check Redis connection
    const recoveryHealth = await recoveryQueue.isReady();
    const deliveryHealth = await deliveryQueue.isReady();
    
    if (!recoveryHealth || !deliveryHealth) {
      throw new Error("Queue connection unhealthy");
    }
    
    // Log worker stats
    const [recoveryStats, deliveryStats] = await Promise.all([
      recoveryQueue.getJobCounts(),
      deliveryQueue.getJobCounts(),
    ]);
    
    logger.info("Worker health check passed", {
      activeJobs: activeJobs.size,
      recovery: recoveryStats,
      delivery: deliveryStats,
    });
  } catch (error) {
    logger.error("Worker health check failed", { error });
    throw error;
  }
}

/**
 * Graceful shutdown handler
 */
async function gracefulShutdown(signal: string) {
  if (isShuttingDown) return;
  
  isShuttingDown = true;
  logger.info(`Worker received ${signal}, starting graceful shutdown`);
  
  try {
    // Stop accepting new jobs
    await Promise.all([
      recoveryQueue.pause(true),
      deliveryQueue.pause(true),
    ]);
    
    // Wait for active jobs to complete (max 30 seconds)
    const shutdownTimeout = setTimeout(() => {
      logger.warn("Shutdown timeout reached, forcing exit");
      process.exit(1);
    }, 30000);
    
    while (activeJobs.size > 0) {
      logger.info(`Waiting for ${activeJobs.size} active jobs to complete`);
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    clearTimeout(shutdownTimeout);
    
    // Close connections
    await Promise.all([
      recoveryQueue.close(),
      deliveryQueue.close(),
      prisma.$disconnect(),
    ]);
    
    logger.info("Worker shutdown complete");
    process.exit(0);
  } catch (error) {
    logger.error("Error during shutdown", { error });
    process.exit(1);
  }
}

/**
 * Start the worker
 */
async function start() {
  try {
    logger.info("Worker starting", {
      concurrency: WORKER_CONFIG.concurrency,
      queues: ["recovery", "delivery"],
      environment: process.env.NODE_ENV,
    });

    // Verify connections
    await performHealthCheck();

    // Process recovery queue
    recoveryQueue.process(
      "process-recovery-step",
      WORKER_CONFIG.concurrency,
      processRecoveryJob
    );

    // Process delivery queue
    deliveryQueue.process(
      "monitor-delivery",
      Math.max(1, Math.floor(WORKER_CONFIG.concurrency / 2)),
      processDeliveryJob
    );

    // Queue event handlers
    recoveryQueue.on("error", (error) => {
      logger.error("Recovery queue error", { error });
    });

    deliveryQueue.on("error", (error) => {
      logger.error("Delivery queue error", { error });
    });

    recoveryQueue.on("stalled", (job) => {
      logger.warn("Recovery job stalled", { jobId: job.id });
    });

    deliveryQueue.on("stalled", (job) => {
      logger.warn("Delivery job stalled", { jobId: job.id });
    });

    // Set up graceful shutdown
    process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
    process.on("SIGINT", () => gracefulShutdown("SIGINT"));

    // Periodic health checks
    setInterval(performHealthCheck, 60000); // Every minute

    // Log worker metrics periodically
    setInterval(async () => {
      const metrics = await MonitoringService.getPerformanceSummary();
      logger.info("Worker performance metrics", { metrics });
    }, 300000); // Every 5 minutes

    logger.info("Worker started successfully", { 
      pid: process.pid,
      queues: ["recovery", "delivery"],
    });

  } catch (error) {
    logger.error("Worker failed to start", { error });
    process.exit(1);
  }
}

// Handle uncaught errors
process.on("uncaughtException", (error) => {
  logger.error("Uncaught exception", { error });
  gracefulShutdown("uncaughtException");
});

process.on("unhandledRejection", (reason, promise) => {
  logger.error("Unhandled rejection", { reason, promise });
  gracefulShutdown("unhandledRejection");
});

// Start the worker
start().catch((error) => {
  logger.error("Worker startup failed", { error });
  process.exit(1);
});
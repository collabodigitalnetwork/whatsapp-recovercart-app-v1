import "dotenv/config";
import prisma from "../app/db.server";
import logger from "../app/lib/logger.server";
import { deliveryQueue, recoveryQueue } from "../app/queues";
import { monitorCarrier } from "../app/services/delivery.server";
import { processRecoveryStep } from "../app/services/cartRecovery.server";

async function start() {
  recoveryQueue.process(async (job) => {
    const step = await prisma.recoveryStep.findUnique({ where: { id: job.data.stepId } });
    if (!step) {
      logger.warn("Recovery step missing", job.data);
      return;
    }

    await processRecoveryStep(step);
  });

  deliveryQueue.process(async (job) => {
    await monitorCarrier(job.data.deliveryId);
  });

  logger.info("Worker started", { queues: ["recovery", "delivery"] });
}

start().catch((error) => {
  logger.error("Worker failed", { error: error.message });
  process.exit(1);
});

import { DeliveryStatus } from "@prisma/client";
import prisma from "../db.server";
import logger from "../lib/logger.server";
import { deliveryQueue } from "../queues";
import type { DeliveryJobData } from "../types/queues";

interface ScheduleDeliveryJobOptions {
  deliveryId: string;
  shopId: string;
}

export async function scheduleDeliveryMonitoring({ deliveryId, shopId }: ScheduleDeliveryJobOptions) {
  await deliveryQueue.add(
    { deliveryId, orderId: "", shopId } satisfies DeliveryJobData,
    {
      jobId: `delivery-${deliveryId}`,
      attempts: 5,
      backoff: {
        type: "exponential",
        delay: 60000,
      },
    },
  );
}

export async function recordDeliveryEvent(deliveryId: string, status: DeliveryStatus, payload: unknown) {
  await prisma.deliveryEvent.create({
    data: {
      deliveryId,
      status,
      rawPayload: payload as object,
      occurredAt: new Date(),
    },
  });

  await prisma.delivery.update({
    where: { id: deliveryId },
    data: {
      latestStatus: status,
      lastStatusAt: new Date(),
    },
  });
}

export async function getDelayedDeliveries(shopId: string) {
  return prisma.delivery.findMany({
    where: {
      order: { shopId: shopId },
      latestStatus: DeliveryStatus.DELAYED,
    },
    include: { order: true },
  });
}

export async function monitorCarrier(deliveryId: string) {
  const delivery = await prisma.delivery.findUnique({ where: { id: deliveryId }, include: { order: true } });
  if (!delivery) {
    logger.warn("Delivery not found", { deliveryId });
    return;
  }

  // Placeholder: integrate carrier API lookup here
  logger.info("Checked carrier status", { deliveryId, carrier: delivery.carrier });
}

import type { ActionFunctionArgs } from "react-router";
import { DeliveryStatus } from "@prisma/client";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { recordDeliveryEvent } from "../services/delivery.server";

interface FulfillmentPayload {
  id: number;
  order_id: number;
  tracking_number?: string;
  tracking_company?: string;
  tracking_url?: string;
  shipment_status?: string;
}

export const action = async ({ request }: ActionFunctionArgs) => {
  const { topic, shop, payload } = await authenticate.webhook(request);

  if (topic !== "ORDERS_FULFILLED") {
    throw new Response("Invalid webhook", { status: 400 });
  }

  const fulfillment = payload as FulfillmentPayload;
  const orderId = String(fulfillment.order_id);

  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order) {
    return new Response();
  }

  const delivery = await prisma.delivery.upsert({
    where: {
      carrier_trackingNumber: {
        carrier: fulfillment.tracking_company ?? "unknown",
        trackingNumber: fulfillment.tracking_number ?? orderId,
      },
    },
    update: {
      trackingUrl: fulfillment.tracking_url,
      latestStatus: DeliveryStatus.IN_TRANSIT,
    },
    create: {
      orderId: order.id,
      carrier: fulfillment.tracking_company ?? "unknown",
      trackingNumber: fulfillment.tracking_number ?? orderId,
      trackingUrl: fulfillment.tracking_url,
      latestStatus: DeliveryStatus.IN_TRANSIT,
    },
  });

  await recordDeliveryEvent(delivery.id, DeliveryStatus.IN_TRANSIT, payload);

  return new Response();
};

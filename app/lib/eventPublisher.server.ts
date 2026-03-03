import Redis from "ioredis";
import { logger } from "./logger.server";
import crypto from "crypto";

const INTELLIGENCE_STREAM_KEY = "recovercart-events";
const INTELLIGENCE_ENABLED = process.env.INTELLIGENCE_ENABLED === "true";

let redis: Redis | null = null;

if (INTELLIGENCE_ENABLED && process.env.REDIS_URL) {
  redis = new Redis(process.env.REDIS_URL);
  
  redis.on("error", (error) => {
    logger.error("Intelligence Redis error", { error: error.message });
  });
}

export interface IntelligenceEvent {
  id: string;
  eventType: string;
  shopId: string;
  occurredAt: string;
  ingestionSource: "shopify" | "whatsapp" | "carrier" | "app";
  payload: Record<string, any>;
  metadata?: Record<string, any>;
}

/**
 * Publish event to intelligence layer
 * This is fire-and-forget to not impact main app performance
 */
export async function publishEvent(event: Omit<IntelligenceEvent, "id" | "occurredAt">) {
  if (!INTELLIGENCE_ENABLED || !redis) {
    return;
  }

  try {
    const fullEvent: IntelligenceEvent = {
      ...event,
      id: `evt_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`,
      occurredAt: new Date().toISOString(),
    };

    // Add to Redis stream
    await redis.xadd(
      INTELLIGENCE_STREAM_KEY,
      "*", // Auto-generate ID
      "event",
      JSON.stringify(fullEvent)
    );

    logger.debug("Published event to intelligence", { eventType: event.eventType });
  } catch (error) {
    // Don't let intelligence errors affect main app
    logger.error("Failed to publish intelligence event", { error, eventType: event.eventType });
  }
}

// Helper functions for common events

export async function publishCartAbandoned(shopId: string, cart: any) {
  await publishEvent({
    eventType: "cart.abandoned",
    shopId,
    ingestionSource: "shopify",
    payload: {
      cartId: cart.id,
      customerHash: cart.customerEmail ? crypto.createHash("sha256").update(cart.customerEmail).digest("hex") : undefined,
      currency: cart.currency,
      subtotal: Number(cart.subtotal),
      itemCount: cart.items?.length || 0,
      hasEmail: !!cart.customerEmail,
      hasPhone: !!cart.customerPhone,
      abandonedAt: cart.abandonedAt,
    },
  });
}

export async function publishCartRecovered(shopId: string, cart: any) {
  await publishEvent({
    eventType: "cart.recovered",
    shopId,
    ingestionSource: "shopify",
    payload: {
      cartId: cart.id,
      customerHash: cart.customerEmail ? crypto.createHash("sha256").update(cart.customerEmail).digest("hex") : undefined,
      currency: cart.currency,
      subtotal: Number(cart.subtotal),
      recoveredAt: cart.recoveredAt || new Date().toISOString(),
    },
  });
}

export async function publishMessageSent(shopId: string, message: any) {
  await publishEvent({
    eventType: "message.sent",
    shopId,
    ingestionSource: "whatsapp",
    payload: {
      messageId: message.id,
      templateName: message.templateName,
      context: message.context,
      recipientHash: message.toPhoneNumber ? crypto.createHash("sha256").update(message.toPhoneNumber).digest("hex") : undefined,
      sentAt: message.sentAt,
    },
  });
}

export async function publishMessageStatus(shopId: string, messageId: string, status: string, timestamp?: string) {
  const eventTypeMap: Record<string, string> = {
    delivered: "message.delivered",
    read: "message.read",
    failed: "message.failed",
  };

  const eventType = eventTypeMap[status.toLowerCase()];
  if (!eventType) return;

  await publishEvent({
    eventType,
    shopId,
    ingestionSource: "whatsapp",
    payload: {
      messageId,
      timestamp: timestamp || new Date().toISOString(),
    },
  });
}

export async function publishDeliveryEvent(shopId: string, delivery: any, eventType: "created" | "updated" | "delayed" | "delivered") {
  await publishEvent({
    eventType: `delivery.${eventType}`,
    shopId,
    ingestionSource: "carrier",
    payload: {
      orderId: delivery.orderId,
      deliveryId: delivery.id,
      carrier: delivery.carrier,
      status: delivery.latestStatus,
      estimatedAt: delivery.estimatedAt,
      actualAt: delivery.actualAt,
      delayHours: delivery.delayHours,
    },
  });
}

export async function publishWorkflowEvent(shopId: string, workflow: any, eventType: "started" | "completed" | "step_executed", stepData?: any) {
  await publishEvent({
    eventType: `workflow.${eventType}`,
    shopId,
    ingestionSource: "app",
    payload: {
      workflowId: workflow.id,
      cartId: workflow.cartId,
      stepNumber: stepData?.sequence,
      incentive: stepData?.incentive,
      success: workflow.status === "COMPLETED",
    },
  });
}
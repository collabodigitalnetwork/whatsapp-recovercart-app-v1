import axios from "axios";
import { DeliveryStatus, MessageContext } from "@prisma/client";
import prisma from "../db.server";
import { deliveryQueue } from "../queues";
import type { DeliveryJobData } from "../types/queues";
import { logger } from "../lib/logger.server";
import { sendTemplateMessage, getConnectionStatus } from "./whatsapp.server";
import { RealtimeCache } from "../lib/cache.server";

// Carrier tracking URLs and API endpoints
const CARRIER_CONFIGS = {
  ups: {
    trackingUrl: "https://www.ups.com/track?tracknum=",
    apiEndpoint: process.env.UPS_API_URL || "https://onlinetools.ups.com/api/track/v1",
    apiKey: process.env.UPS_API_KEY,
  },
  fedex: {
    trackingUrl: "https://www.fedex.com/fedextrack/?tracknumbers=",
    apiEndpoint: process.env.FEDEX_API_URL || "https://apis.fedex.com/track/v1",
    apiKey: process.env.FEDEX_API_KEY,
  },
  usps: {
    trackingUrl: "https://tools.usps.com/go/TrackConfirmAction?tLabels=",
    apiEndpoint: process.env.USPS_API_URL || "https://secure.shippingapis.com/ShippingAPI.dll",
    apiKey: process.env.USPS_API_KEY,
  },
  dhl: {
    trackingUrl: "https://www.dhl.com/en/express/tracking.html?AWB=",
    apiEndpoint: process.env.DHL_API_URL || "https://api-eu.dhl.com/track/shipments",
    apiKey: process.env.DHL_API_KEY,
  },
};

interface TrackingUpdate {
  status: DeliveryStatus;
  location?: string;
  timestamp: Date;
  description?: string;
  estimatedDelivery?: Date;
}

/**
 * Monitor carrier for tracking updates
 */
export async function monitorCarrier(deliveryId: string): Promise<void> {
  try {
    const delivery = await prisma.deliveryTracking.findUnique({
      where: { id: deliveryId },
      include: {
        order: {
          include: {
            shop: {
              include: { settings: true },
            },
          },
        },
      },
    });

    if (!delivery) {
      logger.error("Delivery not found", { deliveryId });
      return;
    }

    // Skip if already delivered or failed
    if (delivery.status === DeliveryStatus.DELIVERED || delivery.status === DeliveryStatus.FAILED_ATTEMPT) {
      logger.info("Delivery already completed", { deliveryId, status: delivery.status });
      return;
    }

    // Check if shop has WhatsApp enabled
    if (!delivery.order.shop.settings?.whatsappEnabled) {
      logger.info("WhatsApp not enabled for shop", { 
        shopId: delivery.order.shopId,
        deliveryId,
      });
      return;
    }

    // Get tracking update from carrier
    const trackingUpdate = await getCarrierTrackingUpdate(
      delivery.carrier,
      delivery.trackingNumber
    );

    if (!trackingUpdate) {
      logger.warn("No tracking update available", { 
        deliveryId,
        carrier: delivery.carrier,
        trackingNumber: delivery.trackingNumber,
      });
      return;
    }

    // Check if status changed
    if (trackingUpdate.status === delivery.status && !shouldSendPeriodicUpdate(delivery)) {
      logger.info("No status change, skipping update", { deliveryId });
      return;
    }

    // Update delivery record
    await prisma.deliveryTracking.update({
      where: { id: deliveryId },
      data: {
        status: trackingUpdate.status,
        currentLocation: trackingUpdate.location,
        estimatedDelivery: trackingUpdate.estimatedDelivery,
        lastCheckedAt: new Date(),
        events: {
          push: {
            timestamp: trackingUpdate.timestamp,
            status: trackingUpdate.status,
            location: trackingUpdate.location,
            description: trackingUpdate.description,
          },
        },
      },
    });

    // Send WhatsApp notification if customer opted in
    if (delivery.order.customerPhone && delivery.notificationsEnabled) {
      await sendDeliveryNotification(delivery, trackingUpdate);
    }

    // Schedule next check based on status
    const nextCheckDelay = getNextCheckDelay(trackingUpdate.status);
    if (nextCheckDelay > 0) {
      await scheduleDeliveryCheck(deliveryId, nextCheckDelay);
    }

    // Update metrics
    await RealtimeCache.incrementMetric(delivery.order.shopId, "delivery_updates_today");

  } catch (error) {
    logger.error("Failed to monitor carrier", { error, deliveryId });
    
    // Reschedule check after error
    await scheduleDeliveryCheck(deliveryId, 60 * 60 * 1000); // 1 hour
    
    throw error;
  }
}

/**
 * Get tracking update from carrier API
 */
async function getCarrierTrackingUpdate(
  carrier: string,
  trackingNumber: string
): Promise<TrackingUpdate | null> {
  const carrierConfig = CARRIER_CONFIGS[carrier.toLowerCase()];
  
  if (!carrierConfig || !carrierConfig.apiKey) {
    logger.warn("Carrier not configured", { carrier });
    return null;
  }

  try {
    // This is a simplified example - each carrier has different API formats
    switch (carrier.toLowerCase()) {
      case "ups":
        return await getUPSTracking(trackingNumber, carrierConfig);
      case "fedex":
        return await getFedExTracking(trackingNumber, carrierConfig);
      case "usps":
        return await getUSPSTracking(trackingNumber, carrierConfig);
      case "dhl":
        return await getDHLTracking(trackingNumber, carrierConfig);
      default:
        logger.warn("Unsupported carrier", { carrier });
        return null;
    }
  } catch (error) {
    logger.error("Failed to get carrier tracking", { error, carrier, trackingNumber });
    return null;
  }
}

/**
 * Send delivery notification via WhatsApp
 */
async function sendDeliveryNotification(
  delivery: any,
  update: TrackingUpdate
): Promise<void> {
  try {
    const { order } = delivery;
    
    // Check WhatsApp connection
    const connectionStatus = await getConnectionStatus(order.shopId);
    if (!connectionStatus.connected) {
      logger.warn("WhatsApp not connected, skipping delivery notification", {
        shopId: order.shopId,
        error: connectionStatus.error,
      });
      return;
    }

    // Determine template based on status
    const templateName = getDeliveryTemplate(update.status);
    if (!templateName) {
      logger.info("No template for delivery status", { status: update.status });
      return;
    }

    // Prepare template variables
    const trackingUrl = CARRIER_CONFIGS[delivery.carrier.toLowerCase()]?.trackingUrl + delivery.trackingNumber;
    const variables = {
      order_number: order.orderNumber,
      tracking_number: delivery.trackingNumber,
      carrier: delivery.carrier,
      status: getStatusDescription(update.status),
      location: update.location || "In transit",
      tracking_url: trackingUrl,
      estimated_delivery: update.estimatedDelivery?.toLocaleDateString() || "Soon",
    };

    // Send WhatsApp message
    const message = await sendTemplateMessage({
      shopId: order.shopId,
      to: order.customerPhone,
      templateName,
      languageCode: order.shop.settings?.defaultLanguage || "en",
      variables,
      context: MessageContext.ORDER,
      orderId: order.id,
    });

    // Update delivery tracking with message info
    await prisma.deliveryTracking.update({
      where: { id: delivery.id },
      data: {
        lastNotificationAt: new Date(),
        notificationCount: delivery.notificationCount + 1,
        metadata: {
          ...delivery.metadata,
          lastMessageId: message.id,
        },
      },
    });

    logger.info("Delivery notification sent", {
      deliveryId: delivery.id,
      orderId: order.id,
      status: update.status,
      messageId: message.id,
    });

  } catch (error) {
    logger.error("Failed to send delivery notification", {
      error,
      deliveryId: delivery.id,
      status: update.status,
    });
    // Don't throw - we don't want to fail the entire monitoring job
  }
}

/**
 * Schedule next delivery check
 */
export async function scheduleDeliveryCheck(deliveryId: string, delay: number): Promise<void> {
  try {
    await deliveryQueue.add(
      "monitor-delivery",
      { deliveryId } satisfies DeliveryJobData,
      {
        jobId: `delivery_${deliveryId}_${Date.now()}`,
        delay,
        attempts: 3,
        backoff: {
          type: "exponential",
          delay: 10000,
        },
        removeOnComplete: true,
        removeOnFail: false,
      }
    );

    logger.info("Scheduled delivery check", {
      deliveryId,
      delay,
      nextCheckAt: new Date(Date.now() + delay),
    });
  } catch (error) {
    logger.error("Failed to schedule delivery check", { error, deliveryId });
    throw error;
  }
}

/**
 * Create delivery tracking record for a new order
 */
export async function createDeliveryTracking(
  orderId: string,
  trackingNumber: string,
  carrier: string,
  notificationsEnabled: boolean = true
): Promise<void> {
  try {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: { shop: true },
    });

    if (!order) {
      throw new Error("Order not found");
    }

    // Create delivery tracking record
    const delivery = await prisma.deliveryTracking.create({
      data: {
        orderId,
        shopId: order.shopId,
        trackingNumber,
        carrier,
        status: DeliveryStatus.CREATED,
        notificationsEnabled,
        events: [
          {
            timestamp: new Date(),
            status: DeliveryStatus.CREATED,
            description: "Tracking information received",
          },
        ],
      },
    });

    // Schedule first check
    await scheduleDeliveryCheck(delivery.id, 30 * 60 * 1000); // 30 minutes

    logger.info("Delivery tracking created", {
      deliveryId: delivery.id,
      orderId,
      trackingNumber,
      carrier,
    });

  } catch (error) {
    logger.error("Failed to create delivery tracking", {
      error,
      orderId,
      trackingNumber,
    });
    throw error;
  }
}

/**
 * Helper functions
 */

function getDeliveryTemplate(status: DeliveryStatus): string | null {
  const templateMap = {
    [DeliveryStatus.IN_TRANSIT]: "delivery_in_transit",
    [DeliveryStatus.OUT_FOR_DELIVERY]: "delivery_out_for_delivery",
    [DeliveryStatus.DELIVERED]: "delivery_completed",
    [DeliveryStatus.DELAYED]: "delivery_delayed",
    [DeliveryStatus.FAILED_ATTEMPT]: "delivery_failed_attempt",
    [DeliveryStatus.EXCEPTION]: "delivery_exception",
  };

  return templateMap[status] || null;
}

function getStatusDescription(status: DeliveryStatus): string {
  const descriptions = {
    [DeliveryStatus.CREATED]: "Order processed",
    [DeliveryStatus.IN_TRANSIT]: "In transit",
    [DeliveryStatus.OUT_FOR_DELIVERY]: "Out for delivery",
    [DeliveryStatus.DELIVERED]: "Delivered",
    [DeliveryStatus.DELAYED]: "Delayed",
    [DeliveryStatus.FAILED_ATTEMPT]: "Delivery attempt failed",
    [DeliveryStatus.EXCEPTION]: "Delivery exception",
  };

  return descriptions[status] || status;
}

function getNextCheckDelay(status: DeliveryStatus): number {
  switch (status) {
    case DeliveryStatus.DELIVERED:
    case DeliveryStatus.FAILED_ATTEMPT:
      return 0; // No more checks
    case DeliveryStatus.OUT_FOR_DELIVERY:
      return 2 * 60 * 60 * 1000; // 2 hours
    case DeliveryStatus.IN_TRANSIT:
      return 6 * 60 * 60 * 1000; // 6 hours
    default:
      return 12 * 60 * 60 * 1000; // 12 hours
  }
}

function shouldSendPeriodicUpdate(delivery: any): boolean {
  if (!delivery.lastNotificationAt) {
    return true;
  }

  const hoursSinceLastNotification = 
    (Date.now() - new Date(delivery.lastNotificationAt).getTime()) / (1000 * 60 * 60);

  // Send periodic updates for active deliveries
  if (delivery.status === DeliveryStatus.IN_TRANSIT) {
    return hoursSinceLastNotification >= 24; // Daily updates
  }

  if (delivery.status === DeliveryStatus.OUT_FOR_DELIVERY) {
    return hoursSinceLastNotification >= 4; // Every 4 hours
  }

  return false;
}

// Carrier-specific tracking implementations (simplified examples)

async function getUPSTracking(trackingNumber: string, config: any): Promise<TrackingUpdate | null> {
  try {
    const response = await axios.get(
      `${config.apiEndpoint}/details/${trackingNumber}`,
      {
        headers: {
          "X-API-Key": config.apiKey,
          "Accept": "application/json",
        },
      }
    );

    const data = response.data;
    const latestActivity = data.trackResponse?.shipment?.[0]?.activity?.[0];

    if (!latestActivity) {
      return null;
    }

    return {
      status: mapUPSStatus(latestActivity.status?.type),
      location: latestActivity.location?.address?.city,
      timestamp: new Date(latestActivity.date + " " + latestActivity.time),
      description: latestActivity.status?.description,
    };
  } catch (error) {
    logger.error("UPS tracking API error", { error, trackingNumber });
    return null;
  }
}

async function getFedExTracking(trackingNumber: string, config: any): Promise<TrackingUpdate | null> {
  // Similar implementation for FedEx
  return null;
}

async function getUSPSTracking(trackingNumber: string, config: any): Promise<TrackingUpdate | null> {
  // Similar implementation for USPS
  return null;
}

async function getDHLTracking(trackingNumber: string, config: any): Promise<TrackingUpdate | null> {
  // Similar implementation for DHL
  return null;
}

function mapUPSStatus(upsStatus: string): DeliveryStatus {
  const statusMap: Record<string, DeliveryStatus> = {
    "D": DeliveryStatus.DELIVERED,
    "I": DeliveryStatus.IN_TRANSIT,
    "O": DeliveryStatus.OUT_FOR_DELIVERY,
    "X": DeliveryStatus.EXCEPTION,
  };

  return statusMap[upsStatus] || DeliveryStatus.IN_TRANSIT;
}
import axios from "axios";
import { MessageContext, WhatsAppStatus } from "@prisma/client";
import prisma from "../db.server";
import { logger } from "../lib/logger.server";
import { decrypt, encrypt } from "../lib/encryption.server";
import { RealtimeCache } from "../lib/cache.server";

const WHATSAPP_API_BASE = "https://graph.facebook.com/v18.0";

interface SendTemplateOptions {
  shopId: string;
  to: string;
  templateName: string;
  languageCode: string;
  variables?: Record<string, string>;
  context: MessageContext;
  cartId?: string;
  orderId?: string;
  retryCount?: number;
}

interface WhatsAppConfig {
  accessToken: string;
  phoneNumberId: string;
  businessAccountId: string;
  tokenExpiresAt?: Date;
  refreshToken?: string;
}

// Cache for WhatsApp configs to reduce database calls
const configCache = new Map<string, { config: WhatsAppConfig; timestamp: number }>();
const CONFIG_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Get WhatsApp configuration for a shop
 * Handles token decryption, caching, and refresh if needed
 */
async function getWhatsAppConfig(shopId: string): Promise<WhatsAppConfig | null> {
  try {
    // Check cache first
    const cached = configCache.get(shopId);
    if (cached && Date.now() - cached.timestamp < CONFIG_CACHE_TTL) {
      return cached.config;
    }

    const settings = await prisma.shopSettings.findUnique({
      where: { shopId },
    });

    if (!settings?.whatsappEnabled) {
      logger.debug("WhatsApp not enabled for shop", { shopId });
      return null;
    }

    // Check if using legacy environment variable configuration (backward compatibility)
    if (!settings.features?.whatsapp && process.env.WHATSAPP_API_TOKEN) {
      logger.warn("Using legacy environment variable configuration", { shopId });
      return {
        accessToken: process.env.WHATSAPP_API_TOKEN,
        phoneNumberId: settings.whatsappPhoneNumberId || process.env.WHATSAPP_PHONE_NUMBER_ID || "",
        businessAccountId: settings.businessAccountId || process.env.WHATSAPP_BUSINESS_ACCOUNT_ID || "",
      };
    }

    if (!settings.features?.whatsapp) {
      logger.warn("WhatsApp not configured for shop", { shopId });
      return null;
    }

    const whatsappData = settings.features.whatsapp as any;
    
    // Decrypt access token
    let accessToken: string;
    try {
      accessToken = decrypt(whatsappData.accessToken);
    } catch (error) {
      logger.error("Failed to decrypt WhatsApp token", { error, shopId });
      return null;
    }
    
    // Check if token needs refresh
    if (whatsappData.tokenExpiresAt && whatsappData.refreshToken) {
      const expiresAt = new Date(whatsappData.tokenExpiresAt);
      const now = new Date();
      
      // Refresh if token expires in less than 1 hour
      if (expiresAt.getTime() - now.getTime() < 60 * 60 * 1000) {
        try {
          accessToken = await refreshAccessToken(shopId, whatsappData.refreshToken);
        } catch (error) {
          logger.error("Failed to refresh token, using existing", { error, shopId });
          // Continue with existing token, it might still work
        }
      }
    }

    const config: WhatsAppConfig = {
      accessToken,
      phoneNumberId: settings.whatsappPhoneNumberId!,
      businessAccountId: settings.businessAccountId!,
      tokenExpiresAt: whatsappData.tokenExpiresAt ? new Date(whatsappData.tokenExpiresAt) : undefined,
      refreshToken: whatsappData.refreshToken,
    };

    // Cache the configuration
    configCache.set(shopId, { config, timestamp: Date.now() });

    return config;
  } catch (error) {
    logger.error("Failed to get WhatsApp config", { error, shopId });
    return null;
  }
}

/**
 * Clear cached configuration for a shop
 */
export function clearConfigCache(shopId: string): void {
  configCache.delete(shopId);
}

/**
 * Refresh WhatsApp access token
 */
async function refreshAccessToken(shopId: string, encryptedRefreshToken: string): Promise<string> {
  try {
    const refreshToken = decrypt(encryptedRefreshToken);
    
    const response = await axios.post(`${WHATSAPP_API_BASE}/oauth/access_token`, {
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: process.env.FACEBOOK_APP_ID,
      client_secret: process.env.FACEBOOK_APP_SECRET,
    });

    if (!response.data.access_token) {
      throw new Error("No access token in refresh response");
    }

    // Update stored tokens
    const settings = await prisma.shopSettings.findUnique({ where: { shopId } });
    if (settings?.features?.whatsapp) {
      const whatsappData = settings.features.whatsapp as any;
      whatsappData.accessToken = encrypt(response.data.access_token);
      whatsappData.tokenExpiresAt = new Date(Date.now() + response.data.expires_in * 1000).toISOString();
      
      await prisma.shopSettings.update({
        where: { shopId },
        data: { features: settings.features },
      });

      // Clear cache after update
      clearConfigCache(shopId);
    }

    logger.info("WhatsApp token refreshed successfully", { shopId });
    return response.data.access_token;
  } catch (error) {
    logger.error("Failed to refresh WhatsApp token", { error, shopId });
    throw error;
  }
}

/**
 * Send WhatsApp template message with automatic retry
 */
export async function sendTemplateMessage(opts: SendTemplateOptions) {
  const { shopId, to, templateName, languageCode, variables, context, cartId, orderId, retryCount = 0 } = opts;

  try {
    // Get WhatsApp configuration
    const config = await getWhatsAppConfig(shopId);
    if (!config) {
      throw new Error("WhatsApp not configured for shop");
    }

    // Validate phone number format
    const cleanPhone = to.replace(/[^\d+]/g, "");
    if (!cleanPhone.match(/^\+?[1-9]\d{1,14}$/)) {
      throw new Error(`Invalid phone number format: ${to}`);
    }

    // Build message payload
    const payload = {
      messaging_product: "whatsapp",
      to: cleanPhone,
      type: "template",
      template: {
        name: templateName,
        language: { code: languageCode },
        components: buildTemplateComponents(variables),
      },
    };

    // Log the attempt
    logger.info("Sending WhatsApp message", {
      shopId,
      to: cleanPhone,
      templateName,
      context,
      attempt: retryCount + 1,
    });

    // Send message via WhatsApp API
    const response = await axios.post(
      `${WHATSAPP_API_BASE}/${config.phoneNumberId}/messages`,
      payload,
      {
        headers: {
          Authorization: `Bearer ${config.accessToken}`,
          "Content-Type": "application/json",
        },
        timeout: 30000, // 30 second timeout
      }
    );

    const messageId = response.data.messages?.[0]?.id;
    if (!messageId) {
      throw new Error("No message ID in WhatsApp response");
    }

    // Store message record
    const message = await prisma.whatsAppMessage.create({
      data: {
        shopId,
        whatsappMessageId: messageId,
        toPhoneNumber: cleanPhone,
        fromPhoneNumber: config.phoneNumberId,
        templateName,
        variables: variables || {},
        context,
        status: WhatsAppStatus.ACCEPTED,
        cartId,
      },
    });

    // Update real-time metrics
    await RealtimeCache.incrementMetric(shopId, "messages_sent_today");

    logger.info("WhatsApp message sent successfully", {
      shopId,
      messageId,
      to: cleanPhone,
    });

    return message;
  } catch (error: any) {
    const errorMessage = error.response?.data?.error?.message || error.message;
    const errorCode = error.response?.data?.error?.code;

    logger.error("Failed to send WhatsApp message", {
      error: errorMessage,
      errorCode,
      shopId,
      to,
      templateName,
      attempt: retryCount + 1,
    });

    // Handle specific error cases
    if (errorCode === 190 || errorMessage.includes("access token")) {
      // Token expired, clear cache and retry once
      clearConfigCache(shopId);
      if (retryCount < 1) {
        logger.info("Retrying with fresh token", { shopId });
        return sendTemplateMessage({ ...opts, retryCount: retryCount + 1 });
      }
    }

    // Store failed message attempt
    await prisma.whatsAppMessage.create({
      data: {
        shopId,
        whatsappMessageId: `failed_${Date.now()}`,
        toPhoneNumber: to,
        fromPhoneNumber: "unknown",
        templateName,
        variables: variables || {},
        context,
        status: WhatsAppStatus.FAILED,
        error: errorMessage,
        cartId,
      },
    });

    throw new Error(`WhatsApp message failed: ${errorMessage}`);
  }
}

/**
 * Build template components from variables
 */
function buildTemplateComponents(variables?: Record<string, string>) {
  if (!variables || Object.keys(variables).length === 0) {
    return [];
  }

  return [
    {
      type: "body",
      parameters: Object.values(variables).map((value) => ({
        type: "text",
        text: String(value),
      })),
    },
  ];
}

/**
 * Update message status from WhatsApp webhook
 */
export async function updateMessageStatus(
  whatsappMessageId: string, 
  status: WhatsAppStatus,
  error?: string
) {
  try {
    const updateData: any = { 
      status,
      error,
    };

    // Set timestamp based on status
    if (status === WhatsAppStatus.DELIVERED) {
      updateData.deliveredAt = new Date();
    } else if (status === WhatsAppStatus.READ) {
      updateData.readAt = new Date();
    }

    const message = await prisma.whatsAppMessage.update({
      where: { whatsappMessageId },
      data: updateData,
    });

    // Update metrics
    if (status === WhatsAppStatus.READ) {
      await RealtimeCache.incrementMetric(message.shopId, "messages_read_today");
    }

    logger.info("Message status updated", {
      messageId: whatsappMessageId,
      status,
    });

    return message;
  } catch (error) {
    logger.error("Failed to update message status", {
      error,
      messageId: whatsappMessageId,
      status,
    });
    throw error;
  }
}

/**
 * Verify webhook signature from WhatsApp
 */
export function verifyWebhookSignature(
  signature: string,
  body: string,
  appSecret?: string
): boolean {
  const secret = appSecret || process.env.FACEBOOK_APP_SECRET;
  if (!secret) {
    logger.warn("No app secret configured for webhook verification");
    return false;
  }

  const crypto = require("crypto");
  const expectedSignature = crypto
    .createHmac("sha256", secret)
    .update(body)
    .digest("hex");

  return signature === `sha256=${expectedSignature}`;
}

/**
 * Get message templates from WhatsApp Business Account
 */
export async function getMessageTemplates(shopId: string) {
  try {
    const config = await getWhatsAppConfig(shopId);
    if (!config) {
      return [];
    }

    const response = await axios.get(
      `${WHATSAPP_API_BASE}/${config.businessAccountId}/message_templates`,
      {
        headers: {
          Authorization: `Bearer ${config.accessToken}`,
        },
        params: {
          fields: "name,status,components,language",
        },
      }
    );

    return response.data.data || [];
  } catch (error) {
    logger.error("Failed to get message templates", { error, shopId });
    return [];
  }
}

/**
 * Create a new message template
 */
export async function createMessageTemplate(
  shopId: string,
  template: {
    name: string;
    category: "MARKETING" | "UTILITY" | "AUTHENTICATION";
    language: string;
    components: Array<{
      type: "HEADER" | "BODY" | "FOOTER" | "BUTTONS";
      text?: string;
      format?: "TEXT" | "IMAGE" | "VIDEO" | "DOCUMENT";
      buttons?: Array<{
        type: "PHONE_NUMBER" | "URL" | "QUICK_REPLY";
        text: string;
        phone_number?: string;
        url?: string;
      }>;
    }>;
  }
) {
  try {
    const config = await getWhatsAppConfig(shopId);
    if (!config) {
      throw new Error("WhatsApp not configured");
    }

    const response = await axios.post(
      `${WHATSAPP_API_BASE}/${config.businessAccountId}/message_templates`,
      template,
      {
        headers: {
          Authorization: `Bearer ${config.accessToken}`,
          "Content-Type": "application/json",
        },
      }
    );

    logger.info("Message template created", {
      shopId,
      templateName: template.name,
      templateId: response.data.id,
    });

    return response.data;
  } catch (error: any) {
    logger.error("Failed to create message template", {
      error: error.response?.data || error.message,
      shopId,
      template: template.name,
    });
    throw error;
  }
}

/**
 * Get WhatsApp connection status for a shop
 */
export async function getConnectionStatus(shopId: string): Promise<{
  connected: boolean;
  phoneNumber?: string;
  businessName?: string;
  qualityRating?: string;
  lastSync?: Date;
  error?: string;
}> {
  try {
    const config = await getWhatsAppConfig(shopId);
    if (!config) {
      return { connected: false, error: "Not configured" };
    }

    // Try to get phone number details
    const response = await axios.get(
      `${WHATSAPP_API_BASE}/${config.phoneNumberId}`,
      {
        headers: {
          Authorization: `Bearer ${config.accessToken}`,
        },
        params: {
          fields: "display_phone_number,verified_name,quality_rating",
        },
      }
    );

    return {
      connected: true,
      phoneNumber: response.data.display_phone_number,
      businessName: response.data.verified_name,
      qualityRating: response.data.quality_rating,
      lastSync: new Date(),
    };
  } catch (error: any) {
    logger.error("Failed to get connection status", { error, shopId });
    return { 
      connected: false, 
      error: error.response?.data?.error?.message || "Connection check failed" 
    };
  }
}

/**
 * Send a free-form message (only within 24-hour window)
 */
export async function sendFreeFormMessage(
  shopId: string,
  to: string,
  text: string,
  replyToMessageId?: string
) {
  try {
    const config = await getWhatsAppConfig(shopId);
    if (!config) {
      throw new Error("WhatsApp not configured");
    }

    const payload: any = {
      messaging_product: "whatsapp",
      to: to.replace(/[^\d+]/g, ""),
      type: "text",
      text: { body: text },
    };

    if (replyToMessageId) {
      payload.context = { message_id: replyToMessageId };
    }

    const response = await axios.post(
      `${WHATSAPP_API_BASE}/${config.phoneNumberId}/messages`,
      payload,
      {
        headers: {
          Authorization: `Bearer ${config.accessToken}`,
          "Content-Type": "application/json",
        },
      }
    );

    return response.data;
  } catch (error: any) {
    logger.error("Failed to send free-form message", {
      error: error.response?.data || error.message,
      shopId,
      to,
    });
    throw error;
  }
}
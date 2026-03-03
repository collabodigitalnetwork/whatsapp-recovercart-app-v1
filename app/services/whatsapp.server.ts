import axios from "axios";
import { MessageContext, WhatsAppStatus } from "@prisma/client";
import prisma from "../db.server";
import { logger } from "../lib/logger.server";
import { decrypt, encrypt } from "../lib/encryption.server";

const WHATSAPP_API_BASE = "https://graph.facebook.com/v18.0";

interface SendTemplateOptions {
  shopId: string;
  to: string;
  templateName: string;
  languageCode: string;
  variables?: Record<string, string>;
  context: MessageContext;
  cartId?: string;
}

interface WhatsAppConfig {
  accessToken: string;
  phoneNumberId: string;
  businessAccountId: string;
  tokenExpiresAt?: Date;
  refreshToken?: string;
}

/**
 * Get WhatsApp configuration for a shop
 * Handles token decryption and refresh if needed
 */
async function getWhatsAppConfig(shopId: string): Promise<WhatsAppConfig | null> {
  try {
    const settings = await prisma.shopSettings.findUnique({
      where: { shopId },
    });

    if (!settings?.whatsappEnabled || !settings.features?.whatsapp) {
      logger.warn("WhatsApp not configured for shop", { shopId });
      return null;
    }

    const whatsappData = settings.features.whatsapp as any;
    
    // Decrypt access token
    let accessToken = decrypt(whatsappData.accessToken);
    
    // Check if token needs refresh
    if (whatsappData.tokenExpiresAt && whatsappData.refreshToken) {
      const expiresAt = new Date(whatsappData.tokenExpiresAt);
      const now = new Date();
      
      // Refresh if token expires in less than 1 hour
      if (expiresAt.getTime() - now.getTime() < 60 * 60 * 1000) {
        accessToken = await refreshAccessToken(shopId, whatsappData.refreshToken);
      }
    }

    return {
      accessToken,
      phoneNumberId: settings.whatsappPhoneNumberId!,
      businessAccountId: settings.businessAccountId!,
      tokenExpiresAt: whatsappData.tokenExpiresAt ? new Date(whatsappData.tokenExpiresAt) : undefined,
      refreshToken: whatsappData.refreshToken,
    };
  } catch (error) {
    logger.error("Failed to get WhatsApp config", { error, shopId });
    return null;
  }
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
    }

    logger.info("WhatsApp token refreshed successfully", { shopId });
    return response.data.access_token;
  } catch (error) {
    logger.error("Failed to refresh WhatsApp token", { error, shopId });
    throw error;
  }
}

/**
 * Send WhatsApp template message
 */
export async function sendTemplateMessage(opts: SendTemplateOptions) {
  const { shopId, to, templateName, languageCode, variables, context, cartId } = opts;

  try {
    // Get WhatsApp configuration
    const config = await getWhatsAppConfig(shopId);
    if (!config) {
      throw new Error("WhatsApp not configured for shop");
    }

    // Build message payload
    const payload = {
      messaging_product: "whatsapp",
      to: to.replace(/[^\d]/g, ""), // Remove non-numeric characters
      type: "template",
      template: {
        name: templateName,
        language: { code: languageCode },
        components: variables
          ? [
              {
                type: "body",
                parameters: Object.values(variables).map((value) => ({
                  type: "text",
                  text: value,
                })),
              },
            ]
          : [],
      },
    };

    // Log the attempt
    logger.info("Sending WhatsApp message", {
      shopId,
      to,
      templateName,
      context,
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
        toPhoneNumber: to,
        fromPhoneNumber: config.phoneNumberId,
        templateName,
        variables: variables || {},
        context,
        status: WhatsAppStatus.ACCEPTED,
        cartId,
      },
    });

    logger.info("WhatsApp message sent successfully", {
      shopId,
      messageId,
      to,
    });

    return message;
  } catch (error) {
    logger.error("Failed to send WhatsApp message", {
      error: error.response?.data || error.message,
      shopId,
      to,
      templateName,
    });

    // Store failed message attempt
    if (cartId) {
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
          error: error.response?.data?.error?.message || error.message,
          cartId,
        },
      });
    }

    throw error;
  }
}

/**
 * Update message status from WhatsApp webhook
 */
export async function updateMessageStatus(whatsappMessageId: string, status: WhatsAppStatus) {
  try {
    const message = await prisma.whatsAppMessage.update({
      where: { whatsappMessageId },
      data: { 
        status,
        deliveredAt: status === WhatsAppStatus.DELIVERED ? new Date() : undefined,
        readAt: status === WhatsAppStatus.READ ? new Date() : undefined,
      },
    });

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
  appSecret: string
): boolean {
  const crypto = require("crypto");
  const expectedSignature = crypto
    .createHmac("sha256", appSecret)
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
 * Register a new message template
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
  } catch (error) {
    logger.error("Failed to create message template", {
      error: error.response?.data || error.message,
      shopId,
      template: template.name,
    });
    throw error;
  }
}

/**
 * Check WhatsApp phone number quality rating
 */
export async function getPhoneNumberQuality(shopId: string) {
  try {
    const config = await getWhatsAppConfig(shopId);
    if (!config) {
      return null;
    }

    const response = await axios.get(
      `${WHATSAPP_API_BASE}/${config.phoneNumberId}`,
      {
        headers: {
          Authorization: `Bearer ${config.accessToken}`,
        },
        params: {
          fields: "quality_rating,status,display_phone_number,verified_name",
        },
      }
    );

    return response.data;
  } catch (error) {
    logger.error("Failed to get phone number quality", { error, shopId });
    return null;
  }
}

/**
 * Send a free-form message (only available for 24-hour window after customer interaction)
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
      to: to.replace(/[^\d]/g, ""),
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
  } catch (error) {
    logger.error("Failed to send free-form message", {
      error: error.response?.data || error.message,
      shopId,
      to,
    });
    throw error;
  }
}
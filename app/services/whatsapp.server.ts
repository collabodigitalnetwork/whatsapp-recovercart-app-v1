import axios from "axios";
import { MessageContext, WhatsAppStatus } from "@prisma/client";
import prisma from "../db.server";
import logger from "../lib/logger.server";

const WHATSAPP_API_BASE = "https://graph.facebook.com/v21.0";

interface SendTemplateOptions {
  shopId: string;
  phoneNumberId: string;
  to: string;
  templateName: string;
  languageCode: string;
  variables?: Record<string, string>;
  context: MessageContext;
}

export async function sendTemplateMessage(opts: SendTemplateOptions) {
  const { shopId, phoneNumberId, to, templateName, languageCode, variables, context } = opts;

  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
  if (!accessToken) {
    throw new Error("WHATSAPP_ACCESS_TOKEN is not configured");
  }

  const payload = {
    messaging_product: "whatsapp",
    to,
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

  const response = await axios.post(`${WHATSAPP_API_BASE}/${phoneNumberId}/messages`, payload, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
  });

  const messageId: string = response.data.messages?.[0]?.id;

  await prisma.whatsAppMessage.create({
    data: {
      shopId,
      wabaMessageId: messageId,
      toPhoneNumber: to,
      templateName,
      body: JSON.stringify(payload),
      variables,
      context,
      status: WhatsAppStatus.SENT,
    },
  });

  logger.info("WhatsApp message queued", { shopId, messageId, templateName });

  return messageId;
}

interface WhatsAppWebhookPayload {
  statuses?: Array<{
    id: string;
    status: string;
    timestamp: string;
    errors?: Array<{ code: number; title: string }>;
  }>;
}

export async function handleWhatsAppWebhook(payload: WhatsAppWebhookPayload) {
  if (!payload.statuses?.length) {
    return;
  }

  await Promise.all(
    payload.statuses.map(async (status) => {
      const mappedStatus = status.status.toUpperCase() as keyof typeof WhatsAppStatus;
      try {
        await prisma.whatsAppMessage.update({
          where: { wabaMessageId: status.id },
          data: {
            status: WhatsAppStatus[mappedStatus] ?? WhatsAppStatus.FAILED,
            failureReason: status.errors?.[0]?.title,
            updatedAt: new Date(Number(status.timestamp) * 1000),
          },
        });
      } catch (error) {
        logger.error("Failed to update WhatsApp status", { error, status });
      }
    }),
  );
}

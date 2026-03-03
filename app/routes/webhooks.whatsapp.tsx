import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { json } from "react-router";
import { updateMessageStatus, verifyWebhookSignature } from "../services/whatsapp.server";
import { logger } from "../lib/logger.server";
import { WhatsAppStatus } from "@prisma/client";

/**
 * GET request is used by Facebook/WhatsApp to verify the webhook endpoint
 */
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");

  // Verify webhook
  if (mode === "subscribe" && token === process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN) {
    logger.info("WhatsApp webhook verified successfully");
    return new Response(challenge, { status: 200 });
  }

  logger.warn("WhatsApp webhook verification failed", { mode, token });
  return json({ error: "Forbidden" }, { status: 403 });
};

/**
 * POST requests contain WhatsApp webhook events
 */
export const action = async ({ request }: ActionFunctionArgs) => {
  try {
    const signature = request.headers.get("x-hub-signature-256");
    const body = await request.text();

    // Verify webhook signature
    if (signature && process.env.FACEBOOK_APP_SECRET) {
      const isValid = verifyWebhookSignature(
        signature,
        body,
        process.env.FACEBOOK_APP_SECRET
      );

      if (!isValid) {
        logger.warn("Invalid WhatsApp webhook signature");
        return json({ error: "Invalid signature" }, { status: 403 });
      }
    }

    const data = JSON.parse(body);

    // Process each entry
    for (const entry of data.entry || []) {
      for (const change of entry.changes || []) {
        await processWebhookChange(change);
      }
    }

    return json({ success: true }, { status: 200 });
  } catch (error) {
    logger.error("WhatsApp webhook processing error", { error });
    return json({ error: "Processing failed" }, { status: 500 });
  }
};

/**
 * Process individual webhook changes
 */
async function processWebhookChange(change: any) {
  const { field, value } = change;

  try {
    if (field === "messages") {
      // Handle incoming messages (for two-way conversation in the future)
      await handleIncomingMessages(value);
    } else if (field === "message_status" || field === "statuses") {
      // Handle message status updates
      await handleMessageStatusUpdates(value);
    } else if (field === "message_template_status") {
      // Handle template status changes
      await handleTemplateStatusUpdate(value);
    }
  } catch (error) {
    logger.error("Failed to process webhook change", { error, field, value });
  }
}

/**
 * Handle message status updates (sent, delivered, read, failed)
 */
async function handleMessageStatusUpdates(value: any) {
  const statuses = value.statuses || [];

  for (const status of statuses) {
    try {
      const messageId = status.id;
      const statusType = status.status;
      const timestamp = new Date(parseInt(status.timestamp) * 1000);

      let dbStatus: WhatsAppStatus;
      switch (statusType) {
        case "sent":
          dbStatus = WhatsAppStatus.SENT;
          break;
        case "delivered":
          dbStatus = WhatsAppStatus.DELIVERED;
          break;
        case "read":
          dbStatus = WhatsAppStatus.READ;
          break;
        case "failed":
          dbStatus = WhatsAppStatus.FAILED;
          break;
        default:
          logger.warn("Unknown WhatsApp status", { statusType, messageId });
          continue;
      }

      await updateMessageStatus(messageId, dbStatus);

      // Log specific events for analytics
      if (statusType === "read") {
        logger.info("WhatsApp message read", {
          messageId,
          recipient: status.recipient_id,
          timestamp,
        });
      } else if (statusType === "failed") {
        logger.error("WhatsApp message failed", {
          messageId,
          recipient: status.recipient_id,
          error: status.errors,
          timestamp,
        });
      }
    } catch (error) {
      logger.error("Failed to update message status", {
        error,
        status,
      });
    }
  }
}

/**
 * Handle incoming messages from customers
 * This enables two-way conversation capabilities
 */
async function handleIncomingMessages(value: any) {
  const messages = value.messages || [];

  for (const message of messages) {
    try {
      const { from, id, timestamp, type, text } = message;

      logger.info("Incoming WhatsApp message", {
        from,
        messageId: id,
        type,
        timestamp: new Date(parseInt(timestamp) * 1000),
      });

      // In the future, this could:
      // 1. Store customer messages
      // 2. Trigger automated responses
      // 3. Create support tickets
      // 4. Update customer engagement scores

      if (type === "text" && text?.body) {
        // Handle text messages
        // Could check for keywords like "STOP", "HELP", etc.
        const messageText = text.body.toLowerCase();
        
        if (messageText.includes("stop") || messageText.includes("unsubscribe")) {
          // Handle opt-out request
          logger.info("Customer opt-out request", { from });
          // Would update customer preferences in database
        }
      }
    } catch (error) {
      logger.error("Failed to process incoming message", {
        error,
        message,
      });
    }
  }
}

/**
 * Handle template status updates (approved, rejected, etc.)
 */
async function handleTemplateStatusUpdate(value: any) {
  try {
    const { event, message_template_id, message_template_name, reason } = value;

    logger.info("Template status update", {
      event,
      templateId: message_template_id,
      templateName: message_template_name,
      reason,
    });

    // Update template status in database
    // This would help merchants know which templates are approved/rejected
    if (event === "APPROVED") {
      // Mark template as approved
    } else if (event === "REJECTED") {
      // Mark template as rejected and notify merchant
      logger.warn("WhatsApp template rejected", {
        templateName: message_template_name,
        reason,
      });
    }
  } catch (error) {
    logger.error("Failed to process template status update", { error, value });
  }
}
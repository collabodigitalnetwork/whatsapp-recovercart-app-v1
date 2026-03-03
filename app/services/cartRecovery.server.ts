import type { Cart, RecoveryStep } from "@prisma/client";
import {
  CartStatus,
  MessageContext,
  RecoveryChannel,
  StepStatus,
  WhatsAppStatus,
  WorkflowStatus,
} from "@prisma/client";
import prisma from "../db.server";
import { recoveryQueue } from "../queues";
import type { RecoveryJobData } from "../types/queues";
import { logger } from "../lib/logger.server";
import { sendTemplateMessage, getConnectionStatus } from "./whatsapp.server";
import { RealtimeCache } from "../lib/cache.server";

interface ScheduleRecoveryOptions {
  cartId: string;
  shopId: string;
}

/**
 * Schedule recovery workflow for an abandoned cart
 */
export async function scheduleRecoveryWorkflow({ cartId, shopId }: ScheduleRecoveryOptions) {
  try {
    const cart = await prisma.cart.findUnique({
      where: { id: cartId },
      include: {
        workflow: {
          include: { steps: true },
        },
      },
    });

    if (!cart) {
      logger.warn("Cart not found", { cartId, shopId });
      return;
    }

    if (!cart.workflow) {
      logger.warn("Cart missing workflow", { cartId, shopId });
      return;
    }

    if (cart.status !== CartStatus.ABANDONED) {
      logger.info("Cart not abandoned, skipping recovery", { cartId, status: cart.status });
      return;
    }

    // Check if WhatsApp is properly configured before scheduling
    const connectionStatus = await getConnectionStatus(shopId);
    if (!connectionStatus.connected) {
      logger.warn("WhatsApp not connected, skipping recovery scheduling", { 
        shopId, 
        error: connectionStatus.error 
      });
      return;
    }

    // Schedule all workflow steps
    const scheduledJobs = await Promise.all(
      cart.workflow.steps.map(async (step) => {
        const delay = Math.max(0, step.scheduledAt.getTime() - Date.now());
        
        const job = await recoveryQueue.add(
          "process-recovery-step",
          { 
            cartId, 
            shopId, 
            workflowId: cart.workflow!.id, 
            stepId: step.id 
          } satisfies RecoveryJobData,
          {
            jobId: `recovery_${step.id}`,
            delay,
            attempts: 3,
            backoff: {
              type: "exponential",
              delay: 5000,
            },
            removeOnComplete: true,
            removeOnFail: false,
          },
        );

        logger.info("Scheduled recovery step", {
          stepId: step.id,
          cartId,
          delay,
          scheduledFor: step.scheduledAt,
        });

        return job;
      }),
    );

    // Update workflow status
    await prisma.recoveryWorkflow.update({
      where: { id: cart.workflow.id },
      data: { 
        status: WorkflowStatus.ACTIVE,
        metadata: {
          scheduledJobs: scheduledJobs.map(job => job.id),
          scheduledAt: new Date().toISOString(),
        },
      },
    });

    // Update metrics
    await RealtimeCache.incrementMetric(shopId, "workflows_scheduled_today");

    logger.info("Recovery workflow scheduled", {
      workflowId: cart.workflow.id,
      cartId,
      stepCount: cart.workflow.steps.length,
    });
  } catch (error) {
    logger.error("Failed to schedule recovery workflow", { error, cartId, shopId });
    throw error;
  }
}

/**
 * Process a single recovery step
 */
export async function processRecoveryStep(stepId: string) {
  try {
    const step = await prisma.recoveryStep.findUnique({
      where: { id: stepId },
      include: {
        workflow: {
          include: {
            cart: true,
            shop: {
              include: { settings: true },
            },
          },
        },
      },
    });

    if (!step) {
      logger.error("Recovery step not found", { stepId });
      return;
    }

    // Skip if already processed
    if (step.status !== StepStatus.SCHEDULED) {
      logger.info("Step already processed", { stepId, status: step.status });
      return;
    }

    const { workflow } = step;
    
    // Validate workflow and cart exist
    if (!workflow?.cart || !workflow.shop) {
      logger.error("Workflow missing required data", { 
        stepId, 
        workflowId: workflow?.id,
        hasCart: !!workflow?.cart,
        hasShop: !!workflow?.shop,
      });
      
      await updateStepStatus(step.id, StepStatus.FAILED, "Missing workflow data");
      return;
    }

    // Check if cart is still abandoned
    if (workflow.cart.status !== CartStatus.ABANDONED) {
      logger.info("Cart no longer abandoned, skipping step", {
        stepId,
        cartStatus: workflow.cart.status,
      });
      
      await updateStepStatus(step.id, StepStatus.SKIPPED, "Cart not abandoned");
      return;
    }

    // Check channel and phone number
    if (step.channel !== RecoveryChannel.WHATSAPP) {
      logger.info("Non-WhatsApp channel not supported yet", { 
        stepId, 
        channel: step.channel 
      });
      
      await updateStepStatus(step.id, StepStatus.SKIPPED, "Channel not supported");
      return;
    }

    if (!workflow.cart.customerPhone) {
      logger.info("No customer phone number", { stepId, cartId: workflow.cart.id });
      
      await updateStepStatus(step.id, StepStatus.SKIPPED, "No phone number");
      return;
    }

    // Check WhatsApp connection before sending
    const connectionStatus = await getConnectionStatus(workflow.shopId);
    if (!connectionStatus.connected) {
      logger.error("WhatsApp disconnected, failing step", {
        stepId,
        shopId: workflow.shopId,
        error: connectionStatus.error,
      });
      
      await updateStepStatus(step.id, StepStatus.FAILED, connectionStatus.error);
      
      // TODO: Notify merchant about disconnection
      return;
    }

    // Prepare template variables
    const variables = await prepareTemplateVariables(workflow.cart, step);

    // Send WhatsApp message
    try {
      const message = await sendTemplateMessage({
        shopId: workflow.shopId,
        to: workflow.cart.customerPhone,
        templateName: step.templateName || workflow.templateVersion,
        languageCode: workflow.shop.settings?.defaultLanguage || "en",
        variables,
        context: MessageContext.CART,
        cartId: workflow.cart.id,
      });

      // Update step status
      await prisma.recoveryStep.update({
        where: { id: step.id },
        data: {
          status: StepStatus.SENT,
          executedAt: new Date(),
          metadata: {
            messageId: message.id,
            whatsappMessageId: message.whatsappMessageId,
            sentAt: new Date().toISOString(),
          },
        },
      });

      // Create message log
      await prisma.messageLog.create({
        data: {
          stepId: step.id,
          metadata: {
            workflowId: workflow.id,
            cartId: workflow.cart.id,
            messageId: message.id,
            templateName: step.templateName || workflow.templateVersion,
          },
        },
      });

      // Update metrics
      await RealtimeCache.incrementMetric(workflow.shopId, "recovery_messages_sent_today");

      logger.info("Recovery message sent successfully", {
        stepId,
        cartId: workflow.cart.id,
        messageId: message.id,
      });
    } catch (error: any) {
      logger.error("Failed to send recovery message", {
        error: error.message,
        stepId,
        cartId: workflow.cart.id,
      });

      await updateStepStatus(step.id, StepStatus.FAILED, error.message);
      
      // Re-throw to trigger job retry
      throw error;
    }
  } catch (error) {
    logger.error("Failed to process recovery step", { error, stepId });
    throw error;
  }
}

/**
 * Handle order recovery (cart converted to order)
 */
export async function handleOrderRecovered(cartId: string, orderId?: string) {
  try {
    const cart = await prisma.cart.findUnique({
      where: { id: cartId },
      include: {
        workflow: true,
      },
    });

    if (!cart) {
      logger.warn("Cart not found for recovery", { cartId });
      return;
    }

    // Update cart status
    await prisma.cart.update({
      where: { id: cartId },
      data: { 
        status: CartStatus.RECOVERED, 
        recoveredAt: new Date(),
        metadata: {
          ...cart.metadata as object,
          orderId,
          recoveredAt: new Date().toISOString(),
        },
      },
    });

    // Complete active workflows
    if (cart.workflow) {
      await prisma.recoveryWorkflow.update({
        where: { id: cart.workflow.id },
        data: { 
          status: WorkflowStatus.COMPLETED,
          completedAt: new Date(),
        },
      });

      // Cancel any pending recovery steps
      await prisma.recoveryStep.updateMany({
        where: { 
          workflowId: cart.workflow.id,
          status: StepStatus.SCHEDULED,
        },
        data: { 
          status: StepStatus.CANCELLED,
          metadata: { cancelReason: "Cart recovered" },
        },
      });
    }

    // Update WhatsApp messages (mark as successful recovery)
    await prisma.whatsAppMessage.updateMany({
      where: { 
        cartId,
        context: MessageContext.CART,
      },
      data: { 
        metadata: { 
          recovered: true,
          recoveredAt: new Date().toISOString(),
          orderId,
        },
      },
    });

    // Update metrics
    await RealtimeCache.incrementMetric(cart.shopId, "carts_recovered_today");
    
    // Calculate and update recovery revenue
    const recoveryRevenue = cart.subtotal.toNumber();
    await RealtimeCache.incrementMetric(cart.shopId, "recovery_revenue_today", recoveryRevenue);

    logger.info("Cart marked as recovered", {
      cartId,
      orderId,
      shopId: cart.shopId,
      revenue: recoveryRevenue,
    });
  } catch (error) {
    logger.error("Failed to handle order recovery", { error, cartId });
    throw error;
  }
}

/**
 * Cancel recovery workflow (e.g., customer opted out)
 */
export async function cancelRecoveryWorkflow(cartId: string, reason: string) {
  try {
    const workflow = await prisma.recoveryWorkflow.findFirst({
      where: { 
        cartId,
        status: WorkflowStatus.ACTIVE,
      },
    });

    if (!workflow) {
      logger.info("No active workflow to cancel", { cartId });
      return;
    }

    // Update workflow status
    await prisma.recoveryWorkflow.update({
      where: { id: workflow.id },
      data: { 
        status: WorkflowStatus.CANCELLED,
        metadata: {
          cancelledAt: new Date().toISOString(),
          cancelReason: reason,
        },
      },
    });

    // Cancel pending steps
    await prisma.recoveryStep.updateMany({
      where: { 
        workflowId: workflow.id,
        status: StepStatus.SCHEDULED,
      },
      data: { 
        status: StepStatus.CANCELLED,
        metadata: { cancelReason: reason },
      },
    });

    logger.info("Recovery workflow cancelled", {
      workflowId: workflow.id,
      cartId,
      reason,
    });
  } catch (error) {
    logger.error("Failed to cancel recovery workflow", { error, cartId });
    throw error;
  }
}

/**
 * Helper: Update step status with metadata
 */
async function updateStepStatus(stepId: string, status: StepStatus, reason?: string) {
  await prisma.recoveryStep.update({
    where: { id: stepId },
    data: {
      status,
      executedAt: new Date(),
      metadata: reason ? { statusReason: reason } : undefined,
    },
  });
}

/**
 * Helper: Prepare template variables from cart data
 */
async function prepareTemplateVariables(cart: Cart, step: RecoveryStep): Promise<Record<string, string>> {
  const variables: Record<string, string> = {
    customer_name: cart.customerName || cart.customerEmail?.split("@")[0] || "there",
    cart_value: cart.subtotal.toFixed(2),
    currency: cart.currency,
    cart_url: cart.checkoutUrl || "",
  };

  // Add any step-specific variables
  if (step.metadata && typeof step.metadata === "object") {
    const stepVars = step.metadata as Record<string, any>;
    if (stepVars.templateVariables) {
      Object.assign(variables, stepVars.templateVariables);
    }
  }

  // Add discount if configured
  if (step.discountCode) {
    variables.discount_code = step.discountCode;
    variables.discount_amount = step.discountAmount?.toFixed(2) || "10";
  }

  return variables;
}

/**
 * Get recovery statistics for a shop
 */
export async function getRecoveryStats(shopId: string, days: number = 30) {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  const stats = await prisma.cart.groupBy({
    by: ["status"],
    where: {
      shopId,
      abandonedAt: { gte: startDate },
    },
    _count: true,
    _sum: {
      subtotal: true,
    },
  });

  const messagesSent = await prisma.whatsAppMessage.count({
    where: {
      shopId,
      context: MessageContext.CART,
      sentAt: { gte: startDate },
    },
  });

  const messagesRead = await prisma.whatsAppMessage.count({
    where: {
      shopId,
      context: MessageContext.CART,
      status: WhatsAppStatus.READ,
      sentAt: { gte: startDate },
    },
  });

  return {
    period: `${days} days`,
    abandoned: stats.find(s => s.status === CartStatus.ABANDONED)?._count || 0,
    recovered: stats.find(s => s.status === CartStatus.RECOVERED)?._count || 0,
    recoveredRevenue: stats.find(s => s.status === CartStatus.RECOVERED)?._sum.subtotal || 0,
    messagesSent,
    messagesRead,
    readRate: messagesSent > 0 ? (messagesRead / messagesSent) * 100 : 0,
  };
}
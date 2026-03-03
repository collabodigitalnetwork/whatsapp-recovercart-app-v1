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
import logger from "../lib/logger.server";
import { sendTemplateMessage } from "./whatsapp.server";

interface ScheduleRecoveryOptions {
  cartId: string;
  shopId: string;
}

export async function scheduleRecoveryWorkflow({ cartId, shopId }: ScheduleRecoveryOptions) {
  const cart = await prisma.cart.findUnique({
    where: { id: cartId },
    include: {
      workflow: {
        include: { steps: true },
      },
    },
  });

  if (!cart || !cart.workflow) {
    logger.warn("Cart missing workflow", { cartId, shopId });
    return;
  }

  await Promise.all(
    cart.workflow.steps.map(async (step) => {
      await recoveryQueue.add(
        { cartId, shopId, workflowId: cart.workflow!.id, stepId: step.id } satisfies RecoveryJobData,
        {
          jobId: step.id,
          delay: Math.max(0, step.scheduledAt.getTime() - Date.now()),
          attempts: 3,
        },
      );
    }),
  );
}

export async function processRecoveryStep(step: RecoveryStep) {
  if (step.status !== StepStatus.SCHEDULED) {
    return;
  }

  const workflow = await prisma.recoveryWorkflow.findUnique({
    where: { id: step.workflowId },
    include: {
      cart: true,
      shop: { include: { settings: true } },
    },
  });

  if (!workflow?.cart || !workflow.shop.settings?.whatsappPhoneNumberId) {
    logger.error("Workflow missing context", { workflowId: workflow?.id });
    return;
  }

  if (step.channel !== RecoveryChannel.WHATSAPP || !workflow.cart.customerPhone) {
    logger.info("Skipping step due to missing phone", { stepId: step.id });
    await prisma.recoveryStep.update({
      where: { id: step.id },
      data: { status: StepStatus.SKIPPED },
    });
    return;
  }

  await sendTemplateMessage({
    shopId: workflow.shopId,
    phoneNumberId: workflow.shop.settings.whatsappPhoneNumberId,
    to: workflow.cart.customerPhone,
    templateName: workflow.templateVersion,
    languageCode: workflow.shop.settings.defaultLanguage,
    variables: {
      customer_name: workflow.cart.customerEmail ?? "there",
      cart_value: workflow.cart.subtotal.toString(),
    },
    context: MessageContext.CART,
  });

  await prisma.recoveryStep.update({
    where: { id: step.id },
    data: {
      status: StepStatus.SENT,
      executedAt: new Date(),
      messageLogs: {
        create: {
          metadata: { workflowId: workflow.id },
        },
      },
    },
  });
}

export async function handleOrderRecovered(cart: Cart) {
  await prisma.cart.update({
    where: { id: cart.id },
    data: { status: CartStatus.RECOVERED, recoveredAt: new Date() },
  });

  await prisma.recoveryWorkflow.updateMany({
    where: { cartId: cart.id },
    data: { status: WorkflowStatus.COMPLETED },
  });

  await prisma.whatsAppMessage.updateMany({
    where: { shopId: cart.shopId, context: "CART", status: WhatsAppStatus.SENT },
    data: { status: WhatsAppStatus.DELIVERED },
  });
}
